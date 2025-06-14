const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_IDS = [process.env.ADMIN_CHAT_ID];
const DANA_NUMBER = '087883536039';
const DANA_QR_LINK = 'https://files.catbox.moe/blokl7.jpg';

const PAYMENT_TIMEOUT = 24 * 60 * 60 * 1000;
const REMINDER_TIMEOUT = 12 * 60 * 60 * 1000;

const db = new sqlite3.Database('./users.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    paket TEXT,
    timestamp INTEGER,
    status TEXT,
    expired_at INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    paket TEXT,
    timestamp INTEGER,
    status TEXT
  )`);
});

const paketList = {
  lokal: { name: "Lokal", harga: 2000, channel: 'https://t.me/+05D0N_SWsMNkMTY1' },
  cina: { name: "Cina", harga: 1000, channel: 'https://t.me/+D0o3LkSFhLAxZGQ1' },
  asia: { name: "Asia", harga: 1000, channel: 'https://t.me/+PyUHdR0yAkQ2NDBl' },
  amerika: { name: "Amerika", harga: 1000, channel: 'https://t.me/+p_5vP8ACzUs1MTNl' },
  yaoi: { name: "Yaoi", harga: 2000, channel: 'https://t.me/+Bs212qTHcRZkOTg9' }
};

function showMainMenu(ctx) {
  ctx.reply(
    `👋 Selamat datang!\n\nPilih paket yang kamu inginkan:\n\n` +
    `📦 Lokal - Rp2.000\n📦 Cina - Rp1.000\n📦 Asia - Rp1.000\n📦 Amerika - Rp1.000\n📦 Yaoi - Rp2.000`,
    Markup.inlineKeyboard([
      [Markup.button.callback('Lokal - Rp2K', 'lokal')],
      [Markup.button.callback('Cina - Rp1K', 'cina')],
      [Markup.button.callback('Asia - Rp1K', 'asia')],
      [Markup.button.callback('Amerika - Rp1K', 'amerika')],
      [Markup.button.callback('Yaoi - Rp2K', 'yaoi')]
    ])
  );
}

bot.start((ctx) => showMainMenu(ctx));

bot.action(/(lokal|cina|asia|amerika|yaoi)/, (ctx) => {
  const paketId = ctx.match[1];
  const userId = ctx.from.id;
  const now = Date.now();

  db.get(`SELECT timestamp, status FROM users WHERE id = ?`, [userId], (err, row) => {
    if (row && row.status === 'pending') {
      const elapsed = now - row.timestamp;
      if (elapsed < PAYMENT_TIMEOUT) {
        return ctx.reply(
          `⏳ Kamu sudah melakukan pemesanan dan belum menyelesaikan pembayaran.`,
          Markup.inlineKeyboard([
            [{ text: '📞 Hubungi Admin', url: 'https://t.me/ujoyp' }],
            [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
          ])
        );
      }
    }

    const paket = paketList[paketId];
    db.run(`INSERT OR REPLACE INTO users (id, paket, timestamp, status) VALUES (?, ?, ?, ?)`,
      [userId, paketId, now, 'pending']);

    db.run(`INSERT INTO orders (user_id, paket, timestamp, status) VALUES (?, ?, ?, ?)`,
      [userId, paketId, now, 'pending']);

    ctx.replyWithPhoto(DANA_QR_LINK, {
      caption:
        `📦 *${paket.name}* - Rp${paket.harga.toLocaleString('id-ID')}\n\n` +
        `Silakan bayar via *DANA* ke:\n📱 *${DANA_NUMBER}*\n\n` +
        `Atau scan QR code di atas.\n\n` +
        `Setelah itu, kirimkan *bukti pembayaran* berupa foto.\n\n` +
        `❓ *Gimana cara transfer?* Chat admin @jnizo/@ujoyp`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [{ text: '📞 Hubungi Admin', url: 'https://t.me/ujoyp' }],
        [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
      ])
    });

    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (err, row) => {
        if (row && row.status === 'pending') {
          ctx.telegram.sendMessage(userId,
            `⏰ *Pengingat!* Kamu belum menyelesaikan pembayaran untuk paket *${paket.name}*.\nSelesaikan sebelum 24 jam ya.`,
            { parse_mode: 'Markdown' }
          );
        }
      });
    }, REMINDER_TIMEOUT);

    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (err, row) => {
        if (row && row.status === 'pending') {
          db.run(`DELETE FROM users WHERE id = ?`, [userId]);
          ctx.telegram.sendMessage(userId,
            `⏰ Waktu pembayaran habis (24 jam). Silakan ulangi pembelian.`,
            {
              reply_markup: Markup.inlineKeyboard([
                [{ text: '🔁 Kembali ke Menu', callback_data: 'back_to_menu' }]
              ])
            }
          );
        }
      });
    }, PAYMENT_TIMEOUT);
  });
});

bot.on('photo', (ctx) => {
  ctx.replyWithChatAction('upload_photo');
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Kamu belum memilih paket.');
    const paketId = row.paket;
    const photo = ctx.message.photo.at(-1).file_id;

    ADMIN_CHAT_IDS.forEach(adminId => {
      ctx.telegram.sendPhoto(adminId, photo, {
        caption: `📥 Bukti pembayaran dari @${username}\nID: ${userId}\nPaket: ${paketId}`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Approve', callback_data: `approve_${userId}` }],
            [{ text: '❌ Tolak', callback_data: `reject_${userId}` }]
          ]
        }
      });
    });

    ctx.reply('📩 Bukti pembayaran sudah dikirim ke admin. Tunggu konfirmasi ya.');
  });
});

bot.action(/approve_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], async (err, row) => {
    if (!row) return ctx.reply('❌ Data user tidak ditemukan.');
    const paketId = row.paket;
    const channelLink = paketList[paketId].channel;

    const expiredAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    db.run(`UPDATE orders SET status = 'approved', expired_at = ? WHERE user_id = ? AND status = 'pending'`, [expiredAt, userId]);

    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '✅ Sudah di-approve', callback_data: 'noop' }]]
      });
    } catch (e) {
      console.error('Gagal ubah tombol:', e);
    }

    bot.telegram.sendMessage(userId,
      `✅ *Selamat! Pembayaran kamu sudah di-approve.*\n\n` +
      `Klik tombol di bawah ini untuk masuk ke channel *${paketList[paketId].name}*.\n\n` +
      `📩 Jika lupa link, chat admin @jnizo`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📺 Masuk ke Channel', url: channelLink }],
            [{ text: '🔁 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );

    ctx.answerCbQuery('User approved.');
  });
});

bot.action(/reject_(\d+)/, (ctx) => {
  const userId = ctx.match[1];
  db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  bot.telegram.sendMessage(userId, '❌ Maaf, bukti pembayaran tidak valid. Silakan coba lagi.');
  ctx.answerCbQuery('User ditolak.');
});

bot.action('cancel_order', (ctx) => {
  const userId = ctx.from.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (!err) {
      ctx.answerCbQuery('Pesanan dibatalkan.');
      ctx.reply('❌ Pesanan kamu telah dibatalkan.');
      showMainMenu(ctx);
    }
  });
});

bot.action('back_to_menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage().catch(() => {});
  showMainMenu(ctx);
});

bot.action('noop', (ctx) => ctx.answerCbQuery('Sudah diproses.'));

bot.command('status', (ctx) => {
  const userId = ctx.from.id;
  db.all(`SELECT paket, status, timestamp, expired_at FROM orders WHERE user_id = ? ORDER BY timestamp DESC`, [userId], (err, rows) => {
    if (!rows || rows.length === 0) return ctx.reply('❌ Kamu belum melakukan pemesanan.');

    const now = Date.now();
    let message = '📦 *Status Pemesanan Kamu:*\n\n';

    rows.forEach((row, index) => {
      const paketInfo = paketList[row.paket];
      const time = new Date(row.timestamp).toLocaleString('id-ID');
      const exp = row.expired_at ? new Date(row.expired_at).toLocaleString('id-ID') : '-';
      const isExpired = row.expired_at && row.expired_at < now;

      message += `#${index + 1}\n`;
      message += `📦 Paket: *${paketInfo.name}*\n`;
      message += `📊 Status: *${row.status}*\n`;
      message += `🕓 Pemesanan: ${time}\n`;
      message += `⏳ Expired: ${exp}\n`;

      if (row.status === 'approved' && !isExpired) {
        message += `🔗 [Masuk Channel](${paketInfo.channel})\n`;
      }

      message += '\n';
    });

    ctx.reply(message, { parse_mode: 'Markdown', disable_web_page_preview: true });
  });
});

bot.command('listpending', (ctx) => {
  if (!ADMIN_CHAT_IDS.includes(ctx.chat.id.toString())) return;
  db.all(`SELECT id, paket, timestamp FROM users WHERE status = 'pending'`, [], (err, rows) => {
    if (!rows.length) return ctx.reply('✅ Tidak ada pesanan pending.');
    const msg = rows.map(r =>
      `🆔 ${r.id} - Paket: ${paketList[r.paket].name} - ${new Date(r.timestamp).toLocaleString('id-ID')}`
    ).join('\n\n');
    ctx.reply(`📋 Pending Orders:\n\n${msg}`);
  });
});

const app = express();
app.get("/", (_, res) => res.send("Bot aktif"));
app.listen(3000, () => console.log("Web server aktif di port 3000"));

bot.launch();

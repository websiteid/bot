const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// Load environment variables
dotenv.config();

// Inisialisasi bot dan data penting
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_IDS = [process.env.ADMIN_CHAT_ID];
const DANA_NUMBER = '087883536039';
const DANA_QR_LINK = 'https://files.catbox.moe/blokl7.jpg';

// Timeout
const PAYMENT_TIMEOUT = 24 * 60 * 60 * 1000;
const REMINDER_TIMEOUT = 12 * 60 * 60 * 1000;

// Init DB
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

// Paket
const paketList = {
  lokal: { name: "Lokal", harga: 2000, channel: 'https://t.me/+05D0N_SWsMNkMTY1' },
  cina: { name: "Cina", harga: 1000, channel: 'https://t.me/+D0o3LkSFhLAxZGQ1' },
  asia: { name: "Asia", harga: 1000, channel: 'https://t.me/+PyUHdR0yAkQ2NDBl' },
  amerika: { name: "Amerika", harga: 1000, channel: 'https://t.me/+p_5vP8ACzUs1MTNl' },
  yaoi: { name: "Yaoi", harga: 2000, channel: 'https://t.me/+Bs212qTHcRZkOTg9' }
};

// Menu utama
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

// Start
bot.start((ctx) => {
  showMainMenu(ctx);
});

// Saat user memilih paket
bot.action(/(lokal|cina|asia|amerika|yaoi)/, (ctx) => {
  const paketId = ctx.match[1];
  const userId = ctx.from.id;
  const now = Date.now();

  db.get(`SELECT paket, timestamp, status FROM users WHERE id = ?`, [userId], (err, row) => {
  if (row && row.status === 'pending') {
  const paket = paketList[row.paket];
  ctx.answerCbQuery(); // <- Tambahkan baris ini
  return ctx.reply(
    `⚠️ Kamu masih memiliki transaksi yang belum selesai untuk paket *${paket.name}*.\n` +
    `Silakan selesaikan pembayaran terlebih dahulu atau klik /batal`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [{ text: '✅ Lanjutkan Pembayaran', callback_data: 'continue_payment' }],
        [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
      ])
    }
  );
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

    // Reminder
    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (err, row) => {
        if (row && row.status === 'pending') {
          ctx.telegram.sendMessage(userId,
            `⏰ *Pengingat!* Kamu belum menyelesaikan pembayaran untuk paket *${paket.name}*.`,
            { parse_mode: 'Markdown' });
        }
      });
    }, REMINDER_TIMEOUT);

    // Timeout
    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (err, row) => {
        if (row && row.status === 'pending') {
          db.run(`DELETE FROM users WHERE id = ?`, [userId]);
          ctx.telegram.sendMessage(userId,
            `⏰ Waktu pembayaran habis. Silakan ulangi pembelian.`,
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


// Lanjutkan pembayaran
bot.action('continue_payment', (ctx) => {
  const userId = ctx.from.id;
  db.get(`SELECT paket FROM users WHERE id = ? AND status = 'pending'`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Tidak ada transaksi yang tertunda.');
    const paket = paketList[row.paket];

    ctx.replyWithPhoto(DANA_QR_LINK, {
      caption:
        `📦 *${paket.name}* - Rp${paket.harga.toLocaleString('id-ID')}\n\n` +
        `Silakan lanjutkan pembayaran via *DANA* ke:\n📱 *${DANA_NUMBER}*`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [{ text: '📞 Hubungi Admin', url: 'https://t.me/ujoyp' }],
        [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
      ])
    });

    ctx.answerCbQuery(); // feedback klik
  });
});


// Bukti pembayaran
bot.on('photo', (ctx) => {
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

// Approve
bot.action(/approve_(\d+)/, (ctx) => {
  const userId = ctx.match[1];
  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Data user tidak ditemukan.');
    const paketId = row.paket;
    const expiredAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    db.run(`UPDATE orders SET status = 'approved', expired_at = ? WHERE user_id = ? AND status = 'pending'`, [expiredAt, userId]);
    ctx.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ Sudah di-approve', callback_data: 'noop' }]] });

    bot.telegram.sendMessage(userId,
      `✅ *Selamat! Pembayaran kamu sudah di-approve.*\n\n` +
      `Klik tombol di bawah ini untuk masuk ke channel *${paketList[paketId].name}*.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📺 Masuk ke Channel', url: paketList[paketId].channel }],
            [{ text: '🔁 Kembali ke Menu', callback_data: 'back_to_menu' }]
          ]
        }
      }
    );
    ctx.answerCbQuery('User approved.');
  });
});

// Reject
bot.action(/reject_(\d+)/, (ctx) => {
  const userId = ctx.match[1];
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (!err) {
      bot.telegram.sendMessage(userId, '❌ Maaf, bukti pembayaran tidak valid.');

      // Edit tombol jadi sudah ditolak
      ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [{ text: '❌ Sudah Ditolak', callback_data: 'noop' }]
        ]
      });

      ctx.answerCbQuery('User ditolak.');
      ctx.reply('❌ Penolakan berhasil dikirim ke user.');
    } else {
      ctx.answerCbQuery('Gagal menolak user.');
      ctx.reply('⚠️ Gagal menolak user dari database.');
    }
  });
});


// Batalkan pesanan
bot.action('cancel_order', (ctx) => {
  const userId = ctx.from.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (!err) {
     ctx.answerCbQuery('❌ Pesanan kamu telah dibatalkan.');
    showMainMenu(ctx);
    }
  });
});

// Kembali ke menu + hapus pending
bot.action('back_to_menu', (ctx) => {
  const userId = ctx.from.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId], () => {
    ctx.answerCbQuery();
    ctx.deleteMessage().catch(() => {});
    showMainMenu(ctx);
  });
});

bot.action('noop', (ctx) => ctx.answerCbQuery('Sudah diproses.'));

// Perintah /batal untuk kembali ke menu utama dan hapus status pending
bot.command('batal', (ctx) => {
  const userId = ctx.from.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId], (err) => {
    if (!err) {
      ctx.reply('❌ Pesanan kamu telah dibatalkan.');
      showMainMenu(ctx);
    } else {
      ctx.reply('⚠️ Gagal membatalkan pesanan.');
    }
  });
});


// /status
bot.command('status', (ctx) => {
  const userId = ctx.from.id;
  db.all(`SELECT paket, status, timestamp, expired_at FROM orders WHERE user_id = ? ORDER BY timestamp DESC`, [userId], (err, rows) => {
    if (!rows || rows.length === 0) return ctx.reply('❌ Kamu belum melakukan pemesanan.');

    const now = Date.now();
    let message = '📦 *Status Pemesanan Kamu:*\n\n';

    rows.forEach((row, i) => {
      const p = paketList[row.paket];
      const time = new Date(row.timestamp).toLocaleString('id-ID');
      const exp = row.expired_at ? new Date(row.expired_at).toLocaleString('id-ID') : '-';
      const expired = row.expired_at && row.expired_at < now;

      message += `#${i + 1}\n📦 *${p.name}*\n📊 *${row.status}*\n🕓 ${time}\n⏳ Expired: ${exp}`;
      if (row.status === 'approved' && !expired) {
        message += `\n🔗 [Masuk Channel](${p.channel})`;
      }
      message += '\n\n';
    });

    ctx.reply(message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Beli Paket Lagi', callback_data: 'back_to_menu' }]
        ]
      }
    });
  });
});

// List pending (admin only)
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

// Web server
const app = express();
app.get("/", (_, res) => res.send("Bot aktif"));
app.listen(3000, () => console.log("Web server aktif di port 3000"));

// Jalankan bot
bot.launch();

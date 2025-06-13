const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const DANA_NUMBER = '087883536039';

// === DB Setup ===
const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    paket TEXT,
    timestamp INTEGER,
    status TEXT
  )`);
});

// === Daftar paket ===
const paketList = {
  lokal: { name: "Lokal", harga: 2000, channel: 'https://t.me/channel_lokal' },
  cina: { name: "Cina", harga: 1000, channel: 'https://t.me/channel_cina' },
  asia: { name: "Asia", harga: 1000, channel: 'https://t.me/channel_asia' },
  amerika: { name: "Amerika", harga: 1000, channel: 'https://t.me/channel_amerika' },
  yaoi: { name: "Yaoi", harga: 2000, channel: 'https://t.me/channel_yaoi' }
};

// Start menu
function showMainMenu(ctx) {
  ctx.reply(
    `👋 Selamat datang!

Pilih paket yang kamu inginkan:

` +
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

// Pilih paket
bot.action(/(lokal|cina|asia|amerika|yaoi)/, async (ctx) => {
  const paketId = ctx.match[1];
  const userId = ctx.from.id;
  const paket = paketList[paketId];
  const now = Date.now();

  db.run(`INSERT OR REPLACE INTO users (id, paket, timestamp, status) VALUES (?, ?, ?, ?)`,
    [userId, paketId, now, 'pending']);

  ctx.replyWithMarkdown(
    `📦 *${paket.name}* - Rp${paket.harga.toLocaleString('id-ID')}

` +
    `Silakan bayar via *DANA* ke:\n📱 *${DANA_NUMBER}*

` +
    `Setelah itu, kirimkan *bukti pembayaran* berupa foto.

` +
    `❓ *Gimana cara transfer?*\nKlik tombol di bawah untuk hubungi admin.`,
    {
      reply_markup: Markup.inlineKeyboard([
        [{ text: '📞 Hubungi Admin', url: 'https://t.me/ujoyp' }],
        [{ text: '❌ Batalkan', callback_data: 'cancel_order' }]
      ])
    }
  );

  setTimeout(() => {
    db.get(`SELECT status FROM users WHERE id = ?`, [userId], (err, row) => {
      if (row && row.status === 'pending') {
        db.run(`DELETE FROM users WHERE id = ?`, [userId]);
        ctx.telegram.sendMessage(userId,
          `⏰ Waktu pembayaran telah habis (24 jam).\nSilakan ulangi pembelian.`,
          {
            reply_markup: Markup.inlineKeyboard([
              [{ text: '🔁 Kembali ke Menu', callback_data: 'back_to_menu' }]
            ])
          }
        );
      }
    });
  }, 24 * 60 * 60 * 1000);
});

bot.action('back_to_menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.deleteMessage().catch(() => {});
  showMainMenu(ctx);
});

bot.action('cancel_order', (ctx) => {
  const userId = ctx.from.id;
  db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  ctx.answerCbQuery('Pesanan dibatalkan.');
  ctx.deleteMessage().catch(() => {});
  showMainMenu(ctx);
});

// Kirim bukti pembayaran
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Kamu belum memilih paket.');

    const paketId = row.paket;
    const photo = ctx.message.photo.at(-1).file_id;

    ctx.telegram.sendPhoto(ADMIN_CHAT_ID, photo, {
      caption: `📥 Bukti pembayaran dari @${username}\nID: ${userId}\nPaket: ${paketId}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Approve', callback_data: `approve_${userId}` }],
          [{ text: '❌ Tolak', callback_data: `reject_${userId}` }]
        ]
      }
    });

    ctx.reply('📩 Bukti pembayaran sudah dikirim ke admin. Tunggu konfirmasi ya.');
  });
});

// Admin approve
bot.action(/approve_(\d+)/, (ctx) => {
  const userId = ctx.match[1];

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Data user tidak ditemukan.');
    const paketId = row.paket;
    const channelLink = paketList[paketId].channel;

    db.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [userId]);

    bot.telegram.sendMessage(userId,
      `✅ *Selamat! Pembayaran kamu sudah di-approve.*

` +
      `Klik tombol di bawah ini untuk masuk ke channel *${paketList[paketId].name}*.

` +
      `📩 Jika kamu lupa linknya, silakan chat admin @jnizo`,
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

// Admin reject
bot.action(/reject_(\d+)/, (ctx) => {
  const userId = ctx.match[1];
  db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  bot.telegram.sendMessage(userId, '❌ Maaf, bukti pembayaran tidak valid. Silakan coba lagi.');
  ctx.answerCbQuery('User ditolak.');
});

// Web server
const app = express();
app.get("/", (_, res) => res.send("Bot aktif"));
app.listen(3000, () => console.log("Web server aktif di port 3000"));

bot.launch();

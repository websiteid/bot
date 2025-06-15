const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// Load .env
dotenv.config();

// Inisialisasi bot & konfigurasi
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_CHAT_IDS = [process.env.ADMIN_CHAT_ID];
const DANA_NUMBER = '087883536039';
const DANA_QR_LINK = 'https://files.catbox.moe/blokl7.jpg';

// Timeout dalam ms
const PAYMENT_TIMEOUT = 24 * 60 * 60 * 1000;   // 24 jam
const REMINDER_TIMEOUT = 12 * 60 * 60 * 1000;  // 12 jam

// Inisialisasi database SQLite
const db = new sqlite3.Database('./users.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    paket TEXT,
    timestamp INTEGER,
    status TEXT,
    expired_at INTEGER,
    kicked INTEGER DEFAULT 0
  )`, (err) => {
    if (err) console.error('Error creating orders table:', err.message);
  });
});

// Daftar paket tersedia
const paketList = {
  lokal: {
    name: "Lokal",
    harga: 2000,
    channel: 'https://t.me/+05D0N_SWsMNkMTY1'
  },
  cina: {
    name: "Cina",
    harga: 2000,
    channel: 'https://t.me/+D0o3LkSFhLAxZGQ1'
  },
  asia: {
    name: "Asia",
    harga: 2000,
    channel: 'https://t.me/+PyUHdR0yAkQ2NDBl'
  },
  amerika: {
    name: "Amerika",
    harga: 2000,
    channel: 'https://t.me/+p_5vP8ACzUs1MTNl'
  },
  yaoi: {
    name: "Yaoi",
    harga: 2000,
    channel: 'https://t.me/+Bs212qTHcRZkOTg9'
  },
  lengkap: {
    name: "Paket Lengkap",
    harga: 8000,
    channel: [
      'https://t.me/+05D0N_SWsMNkMTY1',
      'https://t.me/+D0o3LkSFhLAxZGQ1',
      'https://t.me/+PyUHdR0yAkQ2NDBl',
      'https://t.me/+p_5vP8ACzUs1MTNl',
      'https://t.me/+Bs212qTHcRZkOTg9'
    ]
  }
};

// Fungsi: tampilkan menu utama paket
function showMainMenu(ctx) {
  ctx.reply(
    `👋 Selamat datang!\n\nPilih paket yang kamu inginkan:\n` +
    `📦 Lokal - Rp2.000\n📦 Cina - Rp2.000\n📦 Asia - Rp2.000\n` +
    `📦 Amerika - Rp2.000\n📦 Yaoi - Rp2.000\n📦 Paket Lengkap - Rp8.000`,
    Markup.inlineKeyboard([
      [Markup.button.callback('Lokal', 'lokal')],
      [Markup.button.callback('Cina', 'cina')],
      [Markup.button.callback('Asia', 'asia')],
      [Markup.button.callback('Amerika', 'amerika')],
      [Markup.button.callback('Yaoi', 'yaoi')],
      [Markup.button.callback('🔥 Paket Lengkap', 'lengkap')]
    ])
  );
}

// /start -> tampilkan menu
bot.start((ctx) => {
  showMainMenu(ctx);
});

// Saat user pilih paket
bot.action(/^(lokal|cina|asia|amerika|yaoi|lengkap)$/, (ctx) => {
  const paketId = ctx.match[0];
  const userId = ctx.from.id;
  const now = Date.now();

  db.get(`SELECT paket, status FROM orders WHERE user_id = ? AND status = 'pending'`, [userId], (err, row) => {
    if (row) {
      const pkg = paketList[row.paket];
      ctx.answerCbQuery();
      return ctx.reply(
        `⚠️ Kamu masih memiliki transaksi *${pkg.name}* yang belum selesai.\nSilakan lanjutkan bayar atau ketik /batal`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ Lanjutkan Pembayaran', 'continue_payment')],
            [Markup.button.callback('❌ Batalkan Pesanan', 'cancel_order')]
          ])
        }
      );
    }

    // Simpan transaksi baru
    db.run(`INSERT INTO orders (user_id, paket, timestamp, status) VALUES (?, ?, ?, ?)`, [userId, paketId, now, 'pending']);
   db.run(`INSERT INTO users (id, paket, status) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET paket=excluded.paket, status=excluded.status`,
       [userId, paketId, 'pending']);


    const pkg = paketList[paketId];
    let caption = `📦 *${pkg.name}* – Rp${pkg.harga.toLocaleString('id-ID')}\n\n` +
                  `Silakan bayar DANA/QRIS ke:\n📱 *${DANA_NUMBER}* (DANA)\n\n` +
                  `Setelah bayar, kirim bukti foto/ss hasil transaksi.\n\n` +
                  `Butuh bantuan❓ Chat admin @ujoyp`;

    ctx.replyWithPhoto(DANA_QR_LINK, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('📞 Hubungi Admin', 'https://t.me/ujoyp')],
        [Markup.button.callback('❌ Batalkan Pesanan', 'cancel_order')]
      ])
    });



    // Reminder otomatis setelah 12 jam
    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (e, r) => {
        if (r && r.status === 'pending') {
          ctx.telegram.sendMessage(userId, `⏰ Pengingat! Kamu masih memiliki pembayaran paket *${pkg.name}*.`, {
            parse_mode: 'Markdown'
          });
        }
      });
    }, REMINDER_TIMEOUT);

    // Timeout otomatis setelah 24 jam
    setTimeout(() => {
      db.get(`SELECT status FROM users WHERE id = ?`, [userId], (e, r) => {
        if (r && r.status === 'pending') {
          db.run(`DELETE FROM users WHERE id = ?`, [userId]);
          ctx.telegram.sendMessage(userId, `⏰ Waktu pembayaran habis. Silakan ulangi pembelian.`, {
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('🔁 Kembali ke Menu', 'back_to_menu')]
            ])
          });
        }
      });
    }, PAYMENT_TIMEOUT);
  });
});

// Lanjutkan pembayaran jika masih pending
bot.action('continue_payment', (ctx) => {
  const userId = ctx.from.id;
  db.get(`SELECT paket FROM users WHERE id = ? AND status = 'pending'`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Tidak ada transaksi yang tertunda.');
    const pkg = paketList[row.paket];
    ctx.replyWithPhoto(DANA_QR_LINK, {
      caption: `📦 *${pkg.name}* – Rp${pkg.harga.toLocaleString('id-ID')}\n\nSilakan lanjutkan pembayaran via DANA ke:\n📱 *${DANA_NUMBER}*`,
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('📞 Hubungi Admin', 'https://t.me/ujoyp')],
        [Markup.button.callback('❌ Batalkan Pesanan', 'cancel_order')]
      ])
    });
    ctx.answerCbQuery();
  });
});

bot.action('cancel_order', (ctx) => {
  const userId = ctx.from.id;

  db.get(`SELECT * FROM orders WHERE user_id = ? AND status = 'pending'`, [userId], (err, row) => {
    if (!row) {
      return ctx.answerCbQuery('❌ Tidak ada pesanan yang bisa dibatalkan.', { show_alert: true });
    }

    db.run(`DELETE FROM orders WHERE user_id = ? AND status = 'pending'`, [userId]);

    ctx.answerCbQuery('✅ Pesanan dibatalkan.');
    ctx.reply('❌ Pesanan kamu sudah dibatalkan.\n\nKembali ke menu utama:', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Kembali ke Menu', 'back_to_menu')]
    ]));
  });
});

bot.action('back_to_menu', (ctx) => {
  showMainMenu(ctx);
  ctx.answerCbQuery();
});


// Terima bukti pembayaran (foto)
bot.on('photo', (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  const photoFileId = ctx.message.photo.slice(-1)[0].file_id;

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Kamu belum memilih paket.');

    ADMIN_CHAT_IDS.forEach(adminId => {
      ctx.telegram.sendPhoto(adminId, photoFileId, {
        caption: `📥 Bukti pembayaran dari @${username}\nID: ${userId}\nPaket: ${row.paket}`,
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback('✅ Approve', `approve_${userId}`)],
            [Markup.button.callback('❌ Tolak', `reject_${userId}`)]
          ]
        }
      });
    });

    ctx.reply('📩 Bukti pembayaran dikirim ke admin. Mohon tunggu.');
  });
});

// Admin: Approve pembayaran
bot.action(/approve_(\d+)/, (ctx) => {
  const userId = Number(ctx.match[1]);

  db.get(`SELECT paket FROM users WHERE id = ?`, [userId], (err, row) => {
    if (!row) return ctx.reply('❌ Data user tidak ditemukan.');
    
    const expiredAt = Date.now() + 25 * 24 * 60 * 60 * 1000; // 25 hari
    db.run(`UPDATE orders SET status = 'approved', expired_at = ? WHERE user_id = ? AND status = 'pending'`, [expiredAt, userId]);
    db.run(`UPDATE users SET status = 'approved' WHERE id = ?`, [userId]);

    const pkg = paketList[row.paket];
    ctx.editMessageReplyMarkup({ inline_keyboard: [[Markup.button.callback('✅ Sudah di‑approve', 'noop')]] });

    bot.telegram.sendMessage(userId, `✅ Pembayaran *${pkg.name}* sudah di‑approve!\nKlik tombol di bawah untuk masuk ke channel.`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          ...(Array.isArray(pkg.channel)
            ? pkg.channel.map(url => [Markup.button.url('📺 Masuk Channel', url)])
            : [[Markup.button.url('📺 Masuk Channel', pkg.channel)]]),
          [Markup.button.callback('🔁 Kembali ke Menu', 'back_to_menu')]
        ]
      }
    });

    ctx.answerCbQuery();
  });
});

// Admin: Reject pembayaran
bot.action(/reject_(\d+)/, (ctx) => {
  const userId = Number(ctx.match[1]);
  db.run(`DELETE FROM users WHERE id = ?`, [userId], () => {
    bot.telegram.sendMessage(userId, '❌ Maaf, bukti pembayaran tidak valid. Klik /batal untuk mulai ulang.');
    ctx.editMessageReplyMarkup({ inline_keyboard: [[Markup.button.callback('❌ Sudah Ditolak', 'noop')]] });
    ctx.answerCbQuery();
  });
});

// Command /status: Cek status pemesanan
bot.command('status', (ctx) => {
  const userId = ctx.from.id;
  db.all(
    `SELECT paket, status, timestamp, expired_at FROM orders WHERE user_id = ? ORDER BY timestamp DESC`,
    [userId],
    (err, rows) => {
      if (!rows.length) return ctx.reply('❌ Kamu belum melakukan pemesanan.');

      const now = Date.now();
      let text = '📦 *Status Pemesanan Kamu:*\n\n';

      rows.forEach((r, i) => {
        const pkg = paketList[r.paket];
        const ts = new Date(r.timestamp).toLocaleString('id-ID');
        const exp = r.expired_at ? new Date(r.expired_at).toLocaleString('id-ID') : '-';
        const isExpired = r.expired_at && r.expired_at < now;

        text += `#${i+1}\n📦 *${pkg.name}*\n📊 ${r.status}\n🕓 ${ts}\n⏳ Expired: ${exp}`;
        if (r.status === 'approved' && !isExpired) {
          if (Array.isArray(pkg.channel)) {
            pkg.channel.forEach((link, i) => {
              text += `\n🔗 [Channel ${i + 1}](${link})`;
            });
          } else {
            text += `\n🔗 [Masuk Channel](${pkg.channel})`;
          }
        }
        text += '\n\n';
      });

      ctx.reply(text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🛍️ Beli Lagi', 'back_to_menu')]])
      });
    }
  );
});

// Admin: /tendang – cek user yang expired
bot.command('tendang', (ctx) => {
  if (!ADMIN_CHAT_IDS.includes(ctx.chat.id.toString())) return;

  const now = Date.now();
  db.all(
    `SELECT user_id, expired_at FROM orders
     WHERE status = 'approved' AND expired_at < ? AND kicked = 0
     GROUP BY user_id`,
    [now],
    async (err, rows) => {
      if (err) {
        console.error('DB error:', err);
        return ctx.reply('❌ Terjadi kesalahan saat memeriksa data.');
      }

      if (!rows.length) return ctx.reply('✅ Tidak ada pengguna expired.');

      for (const { user_id, expired_at } of rows) {
        const user = await bot.telegram.getChat(user_id).catch(() => null);
        const username = user?.username ? `@${user.username}` : user?.first_name || '––';
        const expiredStr = new Date(expired_at).toLocaleString('id-ID');

        await ctx.reply(
          `🧾 User Expired:\n🆔 ${user_id}\n👤 ${username}\n📅 Expired: ${expiredStr}`,
          Markup.inlineKeyboard([[Markup.button.callback('🚫 Tendang', `tendang_manual_${user_id}`)]])
        );
      }
    }
  );
});

bot.command('batal', (ctx) => {
  const userId = ctx.from.id;

  db.get(`SELECT * FROM orders WHERE user_id = ? AND status = 'pending'`, [userId], (err, row) => {
    if (!row) {
      return ctx.reply('❌ Tidak ada pesanan yang bisa dibatalkan.');
    }

    db.run(`DELETE FROM orders WHERE user_id = ? AND status = 'pending'`, [userId]);
    ctx.reply('✅ Pesanan kamu sudah dibatalkan.\n\nKembali ke menu utama:', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Kembali ke Menu', 'back_to_menu')]
    ]));
  });
});


// Manual tendang handler
bot.action(/^tendang_manual_(\d+)$/, async (ctx) => {
  const userId = ctx.match[1];

  db.get(`SELECT expired_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId], async (err, row) => {
    if (err || !row) {
      console.error(err);
      return ctx.answerCbQuery('❌ Gagal mengambil data user');
    }

    const expiredDate = new Date(row.expired_at).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    try {
      const userInfo = await bot.telegram.getChat(userId);
      const username = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || 'Tanpa Nama');

      await bot.telegram.sendMessage(userId, '⛔️ Akses kamu ke channel sudah dicabut oleh admin. Silahkan lakukan perpanjangan/berhenti berlangganan');
      db.run(`DELETE FROM users WHERE id = ?`, [userId]);
      db.run(`UPDATE orders SET kicked = 1 WHERE user_id = ?`, [userId]);

      ctx.answerCbQuery('✅ User ditandai ditendang');
      ctx.reply(`✅ User ${username} (ID: ${userId}) sudah ditandai sebagai ditendang.\n📅 Expired: ${expiredDate}`);
    } catch (error) {
      console.error(error);
      ctx.answerCbQuery('❌ Gagal mendapatkan info user');
    }
  });
});

// Admin: /daftar – list pengguna
bot.command('daftar', (ctx) => {
  if (!ADMIN_CHAT_IDS.includes(ctx.chat.id.toString())) return;

  db.all(`SELECT DISTINCT user_id FROM orders`, [], (err, users) => {
    if (!users.length) return ctx.reply('Belum ada pengguna.');
    let res = '📋 *Daftar Pengguna:*\n\n';
    let cnt = 0;

    users.forEach(u => {
      bot.telegram.getChat(u.user_id).then(userInfo => {
        const username = userInfo.username ? `@${userInfo.username}` : userInfo.first_name;
        db.get(
          `SELECT paket, status, expired_at FROM orders WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
          [u.user_id],
          (e, r) => {
            if (r) {
              const pkg = paketList[r.paket]?.name || r.paket;
              const exp = r.expired_at ? new Date(r.expired_at).toLocaleString('id-ID') : '-';
              res += `🆔 ${u.user_id} (${username})\n📦 ${pkg}\n📊 ${r.status}\n⏳ Expired: ${exp}\n\n`;
            }
            cnt++;
            if (cnt === users.length) {
              ctx.reply(res, { parse_mode: 'Markdown' });
            }
          }
        );
      }).catch(() => {
        cnt++;
        if (cnt === users.length) {
          ctx.reply(res, { parse_mode: 'Markdown' });
        }
      });
    });
  });
});

// Web server Express (Keep-alive)
const app = express();
app.get('/', (_, res) => res.send('🤖 Bot aktif'));
app.listen(3000, () => console.log('✅ Web server aktif di port 3000'));

// Jalankan bot
bot.launch(); 

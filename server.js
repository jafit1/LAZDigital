/* server.js — menjalankan LAZ Digital di komputer sendiri.
 *
 * Gunanya satu: mencoba semuanya SEBELUM deploy. Di Vercel, tiap berkas di
 * folder api/ otomatis jadi satu alamat — api/blast.js jadi /api/blast,
 * api/cron/blast-antrean.js jadi /api/cron/blast-antrean. Berkas ini menirukan
 * pemetaan itu supaya yang jalan di laptop benar-benar sama dengan yang jalan
 * di server.
 *
 * Sebelumnya hanya /api/rpc dan /api/backup yang dipasang, sehingga halaman
 * Broadcast dan sambungan gateway sama sekali tidak bisa dicoba lokal —
 * kesalahannya baru ketahuan setelah deploy, ketika sudah dipakai orang.
 *
 * Tanpa UPSTASH_*, modul Broadcast otomatis memakai berkas .data/blast.json,
 * jadi percobaan lokal tidak menyentuh data sungguhan sama sekali.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT_AWAL = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'src/public')));

/* Berkas berawalan "_" adalah penolong bersama (_engine, _wa, _drive), bukan
   alamat — Vercel pun memperlakukannya begitu. */
function kumpulkanRute(dir, awalan = '/api') {
  const hasil = [];
  for (const nama of fs.readdirSync(dir)) {
    const penuh = path.join(dir, nama);
    if (fs.statSync(penuh).isDirectory()) {
      hasil.push(...kumpulkanRute(penuh, `${awalan}/${nama}`));
      continue;
    }
    if (!nama.endsWith('.js') || nama.startsWith('_')) continue;
    hasil.push({ jalur: `${awalan}/${nama.replace(/\.js$/, '')}`, berkas: penuh });
  }
  return hasil;
}

const rute = kumpulkanRute(path.join(__dirname, 'api'));
for (const r of rute) {
  /* require ditunda sampai ada permintaan: satu modul yang gagal dimuat —
     misalnya karena kredensial belum diisi — tidak ikut menjatuhkan seluruh
     server, dan pesan galatnya muncul di alamat itu saja. */
  app.all(r.jalur, async (req, res) => {
    try {
      const penangan = require(r.berkas);
      await penangan(req, res);
    } catch (e) {
      console.error(`[${r.jalur}]`, e);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, pesan: e.message || 'Galat tak terduga' });
      }
    }
  });
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/index.html'));
});

function nyalakan(port) {
  const server = app.listen(port, () => {
    console.log('\n==================================================');
    console.log('  LAZ Digital — server lokal');
    console.log(`  Buka: http://localhost:${port}`);
    console.log(`  Broadcast: http://localhost:${port}/blast.html`);
    console.log('==================================================');
    console.log('  Alamat api yang terpasang:');
    rute.forEach((r) => console.log('   ', r.jalur));
    const lokal = !process.env.UPSTASH_REDIS_REST_URL;
    console.log(lokal
      ? '\n  Tanpa UPSTASH_*: data Broadcast disimpan di .data/blast.json (aman, bukan data asli).'
      : '\n  PERHATIAN: UPSTASH_* terisi — percobaan ini menyentuh DATA SUNGGUHAN.');
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} dipakai, mencoba ${port + 1}...`);
      nyalakan(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

nyalakan(PORT_AWAL);

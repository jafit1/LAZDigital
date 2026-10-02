/* tools/jalankan-uji.js: pelari semua uji sebelum deploy.
 *
 * Dipanggil oleh uji-sebelum-deploy.bat. Bisa juga langsung:
 *
 *   node tools/jalankan-uji.js              semua uji, bersamaan
 *   node tools/jalankan-uji.js impor kll    hanya uji yang namanya memuat kata itu
 *   node tools/jalankan-uji.js --urut       satu per satu (untuk mencari masalah)
 *   node tools/jalankan-uji.js --rinci      cetak seluruh keluaran tiap uji
 *   node tools/jalankan-uji.js --paralel=2  atur berapa uji jalan bersamaan
 *
 * KENAPA ADA. Pemilik minta uji sebelum deploy lebih singkat tetapi tetap
 * memastikan semuanya berfungsi (1 Oktober 2026). Versi .bat lama menjalankan
 * 44 uji satu per satu (terukur 248 detik) dan mencetak setiap baris OK,
 * ratusan baris, sehingga yang GAGAL gampang tenggelam. Sekarang semua uji
 * tetap dijalankan, tetapi bersamaan, dan layar hanya menampilkan satu baris
 * per uji. Rincian hanya keluar untuk yang gagal.
 *
 * Bersamaan hanya aman kalau uji tidak berbagi data. Tiap uji mendapat folder
 * sementara sendiri lewat LAZ_DATA_LOKAL (dibaca lib/blast|fund|ai|media/db.js
 * dan tools/_folder-data.js). Yang tetap berbagi sesuatu dijalankan bergiliran
 * lewat aturGrup().
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const AKAR = path.join(__dirname, '..');

/* Urutan di sini hanya untuk dibaca orang. Urutan jalannya ditentukan lama
   tiap uji pada putaran sebelumnya: yang paling lama dimulai lebih dulu. */
const DAFTAR = [
  { label: 'Batas fungsi Vercel', berkas: 'uji_batas_vercel.js' },
  { label: 'Panduan AI masih cocok', berkas: 'test_panduan_ai.js' },
  { label: 'Pelari uji sebelum deploy', berkas: 'test_jalankan_uji.js' },
  { label: 'Sambungan ke gateway WhatsApp', berkas: 'test_agen.js' },
  { label: 'Impor jurnal', berkas: 'test_impor_jurnal.js' },
  { label: 'Impor jurnal bank dan tanggal', berkas: 'test_impor_jurnal_bank.js' },
  { label: 'Aturan kantor dan temuan impor', berkas: 'test_impor_berkas.js' },
  { label: 'Layar Impor Jurnal per Berkas', berkas: 'test_impor_berkas_ui.js' },
  { label: 'Samakan jurnal dengan rekap', berkas: 'test_samakan_rekap.js' },
  { label: 'Tawaran rekap, Saldo KLL, urutan menu', berkas: 'test_tampilan_kll_menu.js' },
  { label: 'Link Penghimpunan Harian', berkas: 'test_link_harian.js' },
  { label: 'Pemecahan izin Dashboard', berkas: 'test_izin_modul.js' },
  { label: 'Admin tidak bisa jadi superadmin', berkas: 'test_eskalasi_user.js' },
  { label: 'Ingat saya tanpa menyimpan sandi', berkas: 'test_ingat_saya.js' },
  { label: 'Alur Ingat saya di peramban', berkas: 'test_ingat_saya_ui.js' },
  { label: 'Akun nonaktif langsung tertutup', berkas: 'test_akun_nonaktif.js' },
  { label: 'Dialog Edit User', berkas: 'test_izin_ui.js' },
  { label: 'Nama kantor layanan kembar', berkas: 'test_kantor_kembar.js' },
  { label: 'Peringatan cadangan', berkas: 'test_cadangan_peringatan.js' },
  { label: 'Pemulihan cadangan hanya superadmin', berkas: 'test_pulihkan_aman.js' },
  { label: 'Keamanan gelombang kedua', berkas: 'test_keamanan_lanjutan.js' },
  { label: 'Kunci login dan sesi ter-hash', berkas: 'test_sesi_kuat.js' },
  { label: 'Fitur Broadcast', berkas: 'test_blast_fitur.js' },
  { label: 'Pintu pesan masuk WhatsApp', berkas: 'test_blast_masuk.js' },
  { label: 'Tampilan halaman Broadcast', berkas: 'test_blast_ui.js' },
  { label: 'Kotak masuk percakapan', berkas: 'test_percakapan.js' },
  { label: 'Bentuk layar percakapan', berkas: 'ukur-percakapan.js' },
  { label: 'Fitur Fundraising', berkas: 'test_fund_fitur.js' },
  { label: 'Fundraiser dan pencocokan', berkas: 'test_fundraiser.js' },
  { label: 'Tampilan halaman Fundraising', berkas: 'test_fund_ui.js' },
  { label: 'Fitur Media dan Desain', berkas: 'test_media_fitur.js' },
  { label: 'Tampilan halaman Media', berkas: 'test_media_ui.js' },
  { label: 'Fitur AI Asisten', berkas: 'test_ai_fitur.js' },
  { label: 'Tampilan halaman AI Asisten', berkas: 'test_ai_ui.js' },
  { label: 'Sambungan ke PostgreSQL', berkas: 'cek-postgres.js' },
  { label: 'Buku besar di PostgreSQL', berkas: 'test_laz_pg.js' },
  { label: 'Cadangan dan pemulihan PostgreSQL', berkas: 'test_cadangan_pg.js' },
  { label: 'Sesi modul di PostgreSQL', berkas: 'test_sesi_modul_pg.js' },
  { label: 'Alat ukur dan rapikan Redis', berkas: 'test_alat_redis.js' },
  { label: 'Alat ekspor Redis', berkas: 'test_ekspor_redis.js' },
  { label: 'Lambang dan ikon situs', berkas: 'test_ikon.js' },
  { label: 'Bilah menu: logo dan tombol keluar', berkas: 'test_sidebar_ui.js' },
  /* sendiri: mengukur milidetik hitung tata letak, gagal palsu kalau prosesor
     dibagi dengan uji lain (terukur 78 ms lawan batas 45 ms saat bersamaan,
     15,8 ms saat sendirian). Dijalankan paling akhir, tanpa teman. */
  { label: 'Gerak buka/tutup bilah menu', berkas: 'test_sidebar_gerak.js', sendiri: true },
  { label: 'Kelurusan ikon bilah menu', berkas: 'ukur-sisi.js' },
  { label: 'Skala tampilan di semua perangkat', berkas: 'test_skala_ui.js' },
  { label: 'Apa yang sudah sampai di server', berkas: 'uji_cek_deploy.js' },
];

/* Uji yang masih berbagi sesuatu harus bergiliran (kelompok yang sama).
   - Dua alat migrasi Redis menulis ke folder data/ proyek.
   - Dengan UJI_DATABASE_URL, uji fitur menulis ke basis data percobaan yang
     sama dan tidak saling membersihkan, jadi semuanya satu kelompok. */
function aturGrup(daftar, env) {
  const peta = {};
  const pakaiPg = !!(env && env.UJI_DATABASE_URL);
  for (const u of daftar) {
    let g = 'sendiri:' + u.berkas;
    if (u.berkas === 'test_alat_redis.js' || u.berkas === 'test_ekspor_redis.js') g = 'folder-data-proyek';
    if (pakaiPg) {
      let isi = '';
      try { isi = fs.readFileSync(jalurUji(u.berkas), 'utf8'); } catch (_) { /* berkas hilang ditangani saat jalan */ }
      if (/_pagar-db|UJI_DATABASE_URL/.test(isi)) g = 'postgres-percobaan';
    }
    peta[u.berkas] = g;
  }
  return peta;
}

function jalurUji(berkas) { return path.isAbsolute(berkas) ? berkas : path.join(AKAR, 'tools', berkas); }

const WARNA = process.stdout.isTTY && !process.env.NO_COLOR;
const w = (kode, t) => (WARNA ? '\x1b[' + kode + 'm' + t + '\x1b[0m' : t);
const hijau = (t) => w('32', t), merah = (t) => w('31', t), kuning = (t) => w('33', t), redup = (t) => w('2', t), tebal = (t) => w('1', t);
const detik = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' dtk';

/* Hentikan uji beserta anak-anaknya (peramban Playwright). Di Windows,
   kill() hanya mematikan node-nya dan Chromium tertinggal. */
function hentikan(anak) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(anak.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-anak.pid, 'SIGKILL'); } catch (_) { try { anak.kill('SIGKILL'); } catch (__) { /* sudah mati */ } } }
}

function alasanLewat(teks) {
  const baris = teks.split(/\r?\n/).map((b) => b.trim()).filter(Boolean);
  const b = baris.find((x) => /DILEWATI|dilewati|belum terpasang|tidak ada/i.test(x)) || baris[baris.length - 1] || '';
  return b.replace(/^DILEWATI\s*[|:]?\s*/i, '').slice(0, 90);
}

/* Jumlah pemeriksaan yang lulus. Uji di repo ini mencetaknya dengan beberapa
   gaya: baris "OK   |" / "ok    |", atau hanya ringkasan "18/18  SEMUA LULUS"
   dan "68 lulus, 0 gagal". Ringkasan dipercaya lebih dulu. */
function jumlahCek(teks) {
  let m = teks.match(/(\d+)\/\d+\s+SEMUA LULUS/);
  if (m) return Number(m[1]);
  m = teks.match(/(\d+) lulus, 0 gagal/);
  if (m) return Number(m[1]);
  return (teks.match(/^\s*ok\s*\|/gim) || []).length;
}

function jalankanSatu(u, opsi) {
  return new Promise((selesai) => {
    const jalur = jalurUji(u.berkas);
    const mulai = Date.now();
    if (!fs.existsSync(jalur)) {
      selesai({ u, status: 'gagal', ms: 0, keluaran: 'Berkas uji tidak ada: ' + jalur + '\n', alasan: 'berkas ujinya tidak ada' });
      return;
    }
    const folderData = fs.mkdtempSync(path.join(os.tmpdir(), 'laz-uji-data-'));
    const env = Object.assign({}, process.env, { LAZ_DATA_LOKAL: folderData });
    const anak = spawn(process.execPath, [jalur], { cwd: AKAR, env, detached: process.platform !== 'win32' });
    let keluaran = '';
    anak.stdout.on('data', (c) => { keluaran += c; });
    anak.stderr.on('data', (c) => { keluaran += c; });
    let kelamaan = false;
    const penjaga = setTimeout(() => { kelamaan = true; hentikan(anak); }, opsi.batasDetik * 1000);
    anak.on('close', (kode) => {
      clearTimeout(penjaga);
      try { fs.rmSync(folderData, { recursive: true, force: true }); } catch (_) { /* biar */ }
      const ms = Date.now() - mulai;
      let status = kode === 0 ? 'lulus' : kode === 2 ? 'lewat' : 'gagal';
      if (kelamaan) status = 'gagal';
      selesai({ u, status, ms, keluaran, kelamaan, kode });
    });
  });
}

/* Uji yang membuka Chromium jauh lebih berat dari uji biasa. Di komputer
   pemilik (Windows, 2 Oktober 2026) enam uji bersamaan membuat uji yang di
   sini 7 detik jadi 58 detik, dan empat uji tampilan gagal karena halamannya
   tidak terbuka dalam 30 detik. Jumlah peramban yang hidup bersamaan dibatasi
   sendiri, terpisah dari jumlah uji. */
const _peramban = {};
function pakaiPeramban(u) {
  if (typeof u.peramban === 'boolean') return u.peramban;
  if (u.berkas in _peramban) return _peramban[u.berkas];
  let isi = '';
  try { isi = fs.readFileSync(jalurUji(u.berkas), 'utf8'); } catch (_) { /* berkas hilang ditangani saat jalan */ }
  return (_peramban[u.berkas] = /require\([^)]*playwright|muatPlaywright/.test(isi));
}

async function jalankan(argv) {
  const argumen = argv.slice(2);
  const rinci = argumen.includes('--rinci');
  const inti = os.cpus().length;
  let paralel = Math.min(5, Math.max(3, inti));
  let batasPeramban = inti >= 6 ? 3 : 2;
  if (argumen.includes('--urut')) paralel = 1;
  const pp = argumen.find((a) => /^--paralel=\d+$/.test(a));
  if (pp) paralel = Math.max(1, Number(pp.split('=')[1]));
  const pb = argumen.find((a) => /^--peramban=\d+$/.test(a));
  if (pb) batasPeramban = Math.max(1, Number(pb.split('=')[1]));
  batasPeramban = Math.min(batasPeramban, paralel);
  const saring = argumen.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());
  const batasDetik = Number(process.env.LAZ_UJI_BATAS_DETIK) || 300;

  let daftar = DAFTAR;
  if (process.env.LAZ_UJI_DAFTAR) daftar = JSON.parse(process.env.LAZ_UJI_DAFTAR);
  if (saring.length) daftar = daftar.filter((u) => saring.some((k) => (u.label + ' ' + u.berkas).toLowerCase().includes(k)));

  const folderLog = path.join(os.tmpdir(), 'laz-uji');
  fs.mkdirSync(folderLog, { recursive: true });
  const berkasWaktu = path.join(folderLog, 'waktu.json');
  let waktuLalu = {};
  try { waktuLalu = JSON.parse(fs.readFileSync(berkasWaktu, 'utf8')); } catch (_) { /* putaran pertama */ }
  const perkiraan = (u) => waktuLalu[u.berkas] || (/_ui\.js$|^ukur-/.test(u.berkas) ? 20000 : 1000);

  const grup = aturGrup(daftar, process.env);
  const antre = daftar.slice().sort((a, b) => perkiraan(b) - perkiraan(a));
  const sibuk = new Set();
  const hasil = [];
  const mulaiSemua = Date.now();
  const lebarLabel = Math.min(42, Math.max(...daftar.map((u) => u.label.length), 10));

  console.log('');
  console.log(tebal('UJI SEBELUM DEPLOY') + redup('  ' + daftar.length + ' uji, ' + paralel + ' bersamaan (paling banyak ' + batasPeramban + ' peramban), data palsu'));
  console.log('');

  const barisGagalDari = (teks) => teks.split(/\r?\n/).filter((b) => /GAGAL|TimeoutError/.test(b) && !/ADA GAGAL/.test(b));
  function cetak(h) {
    const nCek = jumlahCek(h.keluaran);
    const label = h.u.label.padEnd(lebarLabel);
    if (h.status === 'lulus') {
      console.log('  ' + hijau('OK     ') + label + redup('  ' + (nCek ? String(nCek).padStart(3) + ' cek' : '       ') + '  ' + detik(h.ms)));
      if (h.gagalPertama) console.log('         ' + kuning('diulang sendirian dan lulus; tadi gagal saat bersamaan: ') + redup(h.gagalPertama.slice(0, 150)));
    } else if (h.status === 'lewat') {
      console.log('  ' + kuning('LEWAT  ') + label + redup('  dilewati: ' + alasanLewat(h.keluaran)));
    } else {
      console.log('  ' + merah('GAGAL  ') + tebal(h.u.label) + redup('  ' + detik(h.ms)));
      const barisGagal = h.keluaran.split(/\r?\n/).filter((b) => /GAGAL/.test(b));
      const tampil = barisGagal.length ? barisGagal.slice(0, 12)
        : h.keluaran.split(/\r?\n/).filter((b) => b.trim()).slice(-8);
      if (h.kelamaan) tampil.unshift('Uji ini terlalu lama (lebih dari ' + batasDetik + ' detik) dan dihentikan.');
      if (h.alasan) tampil.unshift(h.alasan);
      tampil.forEach((b) => console.log('         ' + merah('│ ') + b.trim().slice(0, 200)));
      if (barisGagal.length > 12) console.log('         ' + merah('│ ') + redup('... dan ' + (barisGagal.length - 12) + ' baris GAGAL lagi'));
      console.log('         ' + redup('log lengkap: ' + h.log));
    }
    if (rinci) { console.log(redup(h.keluaran.replace(/^/gm, '         '))); }
  }

  const gagalSekali = [];
  await new Promise((beres) => {
    let berjalan = 0, sedangSendiri = false, berjalanPeramban = 0;
    const bolehMulai = (u) => !sibuk.has(grup[u.berkas]) && !(pakaiPeramban(u) && berjalanPeramban >= batasPeramban);
    const lanjut = () => {
      if (!antre.length && berjalan === 0) { beres(); return; }
      while (berjalan < paralel) {
        /* Uji bertanda sendiri menunggu sampai semua yang lain selesai, lalu
           jalan tanpa teman. Selama ia jalan, tidak ada yang dimulai. */
        if (sedangSendiri) break;
        const adaBiasa = antre.some((u) => !u.sendiri);
        let i = antre.findIndex((u) => !u.sendiri && bolehMulai(u));
        if (i < 0 && !adaBiasa && berjalan === 0) i = antre.findIndex((u) => u.sendiri);
        if (i < 0) break;
        const u = antre.splice(i, 1)[0];
        if (u.sendiri) sedangSendiri = true;
        const peramban = pakaiPeramban(u);
        sibuk.add(grup[u.berkas]);
        berjalan++;
        if (peramban) berjalanPeramban++;
        jalankanSatu(u, { batasDetik }).then((h) => {
          sibuk.delete(grup[u.berkas]);
          if (u.sendiri) sedangSendiri = false;
          berjalan--;
          if (peramban) berjalanPeramban--;
          h.log = path.join(folderLog, path.basename(u.berkas).replace(/\.js$/, '') + '.log');
          try { fs.writeFileSync(h.log, h.keluaran); } catch (_) { /* biar */ }
          if (h.status === 'lulus') waktuLalu[u.berkas] = h.ms;
          if (h.status === 'gagal' && !h.alasan) {
            /* Belum dinyatakan gagal: diulang sekali tanpa teman di akhir. */
            gagalSekali.push(h);
            console.log('  ' + kuning('ULANG  ') + h.u.label.padEnd(lebarLabel) + redup('  gagal saat bersamaan, diulang sendirian di akhir'));
          } else {
            hasil.push(h);
            cetak(h);
          }
          lanjut();
        });
      }
    };
    lanjut();
  });

  /* Yang gagal diulang satu per satu. Uji tampilan bisa gagal hanya karena
     komputernya sedang sibuk (halaman tidak terbuka dalam 30 detik, transisi
     belum selesai). Yang tetap gagal saat sendirian, itu kegagalan
     sungguhan. Yang lulus tetap disebut, supaya tidak tersembunyi. */
  if (gagalSekali.length) {
    console.log('');
    console.log(redup('  Mengulang ' + gagalSekali.length + ' uji yang gagal, satu per satu...'));
    for (const lama of gagalSekali) {
      const h = await jalankanSatu(lama.u, { batasDetik });
      h.log = lama.log;
      try { fs.writeFileSync(h.log, h.keluaran); } catch (_) { /* biar */ }
      if (h.status === 'lulus') {
        const bg = barisGagalDari(lama.keluaran);
        h.gagalPertama = (bg[0] || (lama.kelamaan ? 'terlalu lama' : 'keluar dengan galat')).trim().replace(/^GAGAL\|\s*/, '');
      }
      hasil.push(h);
      cetak(h);
    }
  }

  /* Daftar tiruan (uji pelari ini sendiri) tidak boleh mengotori catatan
     lama uji sungguhan. */
  if (!process.env.LAZ_UJI_DAFTAR) { try { fs.writeFileSync(berkasWaktu, JSON.stringify(waktuLalu)); } catch (_) { /* biar */ } }
  const nGagal = hasil.filter((h) => h.status === 'gagal');
  const nLewat = hasil.filter((h) => h.status === 'lewat').length;
  const nCek = hasil.reduce((a, h) => a + (h.status === 'lulus' ? jumlahCek(h.keluaran) : 0), 0);
  const lama = Date.now() - mulaiSemua;

  console.log('');
  console.log('  ' + daftar.length + ' uji: ' + hijau((hasil.length - nGagal.length - nLewat) + ' lulus')
    + (nLewat ? ', ' + kuning(nLewat + ' dilewati') : '') + ', ' + (nGagal.length ? merah(nGagal.length + ' gagal') : '0 gagal')
    + redup('  (' + nCek + ' cek, ' + detik(lama) + ')'));
  console.log('');
  if (!nGagal.length) {
    /* Lulus sebagian bukan izin deploy: yang tidak dijalankan belum terbukti. */
    if (saring.length || process.env.LAZ_UJI_DAFTAR) console.log('  ' + hijau(tebal('SEMUA LULUS')) + ' (hanya uji yang dipilih). Sebelum deploy, jalankan semuanya.');
    else console.log('  ' + hijau(tebal('SEMUA LULUS')) + ' - aman untuk deploy.');
  } else {
    console.log('  ' + merah(tebal('ADA ' + nGagal.length + ' UJI YANG GAGAL')) + ' - jangan deploy dulu:');
    nGagal.forEach((h) => console.log('    - ' + h.u.label + redup('  (node tools/' + path.basename(h.u.berkas) + ')')));
  }
  console.log('');
  return nGagal.length ? 1 : 0;
}

module.exports = { DAFTAR, aturGrup };

if (require.main === module) {
  jalankan(process.argv).then((kode) => process.exit(kode)).catch((e) => {
    console.error('Pelari uji berhenti: ' + ((e && e.stack) || e));
    process.exit(1);
  });
}

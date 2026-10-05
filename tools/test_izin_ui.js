/* Uji bentuk dialog Edit User: kolom kiri diam, kolom kanan yang bergulir.
 *
 * KENAPA DIUKUR, BUKAN DIBACA.
 *
 * "position: sticky" dan "overflow: hidden" adalah dua aturan CSS yang paling
 * sering tertulis benar tetapi tidak berlaku. Sticky diam-diam mati kalau ada
 * satu saja induk yang punya overflow selain visible; overflow pada anak tidak
 * berlaku kalau induknya tidak punya tinggi yang pasti. Tidak satu pun
 * menimbulkan galat: berkasnya terbaca rapi, dan yang terjadi cuma kolom kiri
 * yang tetap ikut naik saat digulir — persis keadaan yang hendak diperbaiki.
 *
 * Maka yang diperiksa di sini bukan ada-tidaknya sebuah aturan, melainkan
 * angka: berapa piksel kolom kiri BERGESER sesudah kolom kanan digulir. Kalau
 * lebih dari nol, aturannya tidak berlaku, seberapa pun benar tulisannya.
 *
 * Diperiksa juga bahwa app.js memang masih mengeluarkan kerangka yang
 * diandalkan CSS itu (.uf-grid > .uf-kiri + .uf-kanan di dalam .user-modal),
 * sebab CSS yang benar untuk kerangka yang sudah berganti sama tidak
 * berlakunya.
 *
 *   node tools/test_izin_ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

function muatPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch (_) { /* coba berikutnya */ }
  }
  console.error('\nPlaywright belum terpasang: npm i -D playwright\n'); process.exit(2);
}
const { chromium } = muatPlaywright();
const CHROMIUM = require('./_luncurkan.js')(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const AKAR = path.join(__dirname, '..');
const PUBLIK = path.join(AKAR, 'src', 'public');
const LUAR = path.join(AKAR, 'potret');

let ok = 0, gagal = 0;
const cek = (nama, syarat, info) => {
  if (syarat) { ok++; console.log('  OK   |', nama); }
  else { gagal++; console.log('  GAGAL|', nama, info === undefined ? '' : String(JSON.stringify(info)).slice(0, 200)); }
};

/* Kerangka yang sama persis dengan yang dikeluarkan formUser() di app.js.
   Isinya sengaja dibuat panjang (17 modul, seperti di aplikasi) supaya kolom
   kanan benar-benar perlu digulir. */
const MODUL = ['Dashboard', 'Saldo Kas & Bank', 'Saldo KLL & ULL', 'Penghimpunan', 'Pentasyarufan',
  'Laporan & Closing', 'Rekening Bank', 'Kantor Layanan (KLL/ULL)', 'Manajemen User',
  'Pengaturan & Perawatan', 'Donatur', 'Log Aktivitas', 'Saldo Penghimpunan Daerah',
  'Broadcast WhatsApp', 'Fundraising', 'AI Asisten', 'Media & Desain'];

const HALAMAN = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<script>document.documentElement.setAttribute('data-theme','light');</script></head><body>
<div class="modal-bg" id="modalBg" style="display:flex">
  <div class="modal user-modal" id="modalCard">
    <div class="modal-head"><h3>Edit User</h3><button class="close-x">&times;</button></div>
    <div class="modal-body" id="modalBody"></div>
    <div class="modal-foot"><button class="btn">Batal</button><button class="btn btn-primary">Simpan</button></div>
  </div>
</div>
<script>
var MODUL = ${JSON.stringify(MODUL)};
var baris = MODUL.map(function(m){
  return '<tr><td class="perm-m"><b>' + m + '</b><div class="perm-ket">Keterangan singkat modul ini supaya barisnya setinggi aslinya.</div></td>'
    + '<td><input type="checkbox"></td><td><input type="checkbox"></td>'
    + '<td><input type="checkbox"></td><td><input type="checkbox"></td>'
    + '<td class="perm-b"><button type="button" class="perm-semua">semua</button></td></tr>';
}).join('');
document.getElementById('modalBody').innerHTML =
  '<div class="uf-grid">'
  + '<div class="uf-kiri"><div class="uf-judul">Data akun</div>'
    + '<div class="field"><label>Nama Lengkap *</label><input value="Sobat Lazismu"></div>'
    + '<div class="field"><label>Username *</label><input value="superadmin"></div>'
    + '<div class="field"><label>Password</label><input type="password" value="xxxxxxxx"></div>'
    + '<div class="field"><label>Role</label><select><option>superadmin</option></select></div>'
    + '<div class="field"><label>Batasi ke kantor layanan</label><select><option>semua kantor</option></select></div>'
    + '<div class="uf-status"><div><div class="uf-status-j">Akun aktif</div>'
      + '<div class="uf-status-k">Kalau dimatikan, akun ini tidak bisa login.</div></div>'
      + '<span class="switch"><input type="checkbox" checked><span class="slider"></span></span></div>'
  + '</div>'
  + '<div class="uf-kanan"><div class="uf-judul">Hak akses</div>'
    + '<div class="perm-bar">Centang apa yang boleh dilakukan pengguna ini.</div>'
    + '<div class="tabel-geser"><table class="perm-table"><thead><tr><th>Yang boleh diakses</th>'
    + '<th>Lihat</th><th>Tambah</th><th>Ubah</th><th>Hapus</th><th></th></tr></thead>'
    + '<tbody>' + baris + '</tbody></table></div></div>'
  + '</div>';
</script></body></html>`;

const TIPE = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const nama = req.url.split('?')[0];
  if (nama === '/' || nama === '/uji.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(HALAMAN);
  }
  const berkas = path.join(PUBLIK, nama);
  if (!berkas.startsWith(PUBLIK) || !fs.existsSync(berkas)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': TIPE[path.extname(berkas)] || 'text/plain' });
  res.end(fs.readFileSync(berkas));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(CHROMIUM);

  console.log('\n=== A. KERANGKA DARI app.js MASIH SEPERTI YANG DIANDALKAN CSS ===');
  {
    const app = fs.readFileSync(path.join(PUBLIK, 'app.js'), 'utf8');
    cek('formUser masih membungkus dua kolom dengan .uf-grid', /<div class="uf-grid">/.test(app));
    cek('kolom kiri masih bernama .uf-kiri', /<div class="uf-kiri">/.test(app));
    cek('kolom kanan masih bernama .uf-kanan', /<div class="uf-kanan">/.test(app));
    cek('modalnya masih diberi kelas user-modal', /classList\.add\('user-modal'\)/.test(app));
    cek('tabel izinnya masih bernama .perm-table', /table class="perm-table"/.test(app));
  }

  /* Tinggi jendela sengaja pendek supaya daftar izinnya pasti lebih panjang
     daripada ruang yang ada — kalau tidak, tidak ada yang perlu digulir dan
     ujinya lulus tanpa menguji apa pun. */
  for (const tinggi of [700, 900]) {
    console.log('\n=== B. KOLOM KIRI DIAM SAAT KANAN DIGULIR (jendela ' + tinggi + 'px) ===');
    const ctx = await b.newContext({ viewport: { width: 1280, height: tinggi } });
    const p = await ctx.newPage();
    await p.goto(A + '/');
    await p.waitForSelector('.perm-table tbody tr', { timeout: 10000 });
    await p.waitForTimeout(250);

    /* Kotak mana yang bergulir di sisi kanan adalah urusan CSS, bukan urusan
       uji ini. Yang dicari: elemen bergulir terdalam di kolom kanan. */
    await p.evaluate(() => {
      window.__gulirKanan = () => {
        const ka = document.querySelector('.uf-kanan');
        const calon = [ka].concat([].slice.call(ka.querySelectorAll('*')));
        return calon.reverse().filter((n) => {
          const ov = getComputedStyle(n).overflowY;
          return (ov === 'auto' || ov === 'scroll') && n.scrollHeight - n.clientHeight > 20;
        })[0] || ka;
      };
    });

    const sebelum = await p.evaluate(() => {
      const ki = document.querySelector('.uf-kiri');
      const ka = window.__gulirKanan();
      return { kiriAtas: Math.round(ki.getBoundingClientRect().top),
        kananBisaDigulir: ka ? ka.scrollHeight - ka.clientHeight : 0,
        badanGulir: getComputedStyle(document.getElementById('modalBody')).overflowY };
    });
    cek('kolom kanan memang lebih panjang daripada ruangnya', sebelum.kananBisaDigulir > 40, sebelum);
    cek('badan modal sendiri tidak ikut menggulir', sebelum.badanGulir === 'hidden', sebelum);

    const sesudah = await p.evaluate(async () => {
      const ka = window.__gulirKanan();
      ka.scrollTop = ka.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ki = document.querySelector('.uf-kiri');
      const th = document.querySelector('.perm-table thead th');
      const tbl = document.querySelector('.perm-table');
      const bar = document.querySelector('.uf-kanan .perm-bar');
      const kolom = document.querySelector('.uf-kanan');
      return { kiriAtas: Math.round(ki.getBoundingClientRect().top),
        kananTergulir: Math.round(ka.scrollTop),
        kepalaAtas: Math.round(th.getBoundingClientRect().top),
        kananAtas: Math.round(ka.getBoundingClientRect().top),
        barAtas: Math.round(bar.getBoundingClientRect().top),
        kolomAtas: Math.round(kolom.getBoundingClientRect().top),
        kolomBawah: Math.round(kolom.getBoundingClientRect().bottom),
        tabelAtas: Math.round(tbl.getBoundingClientRect().top) };
    });
    cek('kolom kanan benar-benar tergulir', sesudah.kananTergulir > 40, sesudah);
    cek('kolom kiri TIDAK bergeser satu piksel pun',
      sesudah.kiriAtas === sebelum.kiriAtas, { sebelum: sebelum.kiriAtas, sesudah: sesudah.kiriAtas });
    cek('kepala tabel izin ikut diam, tidak ikut naik keluar',
      sesudah.kepalaAtas > sesudah.tabelAtas && sesudah.kepalaAtas >= sesudah.kananAtas - 1,
      sesudah);
    /* Tombolnya berada DI LUAR kotak bergulir, jadi ia tidak ikut naik:
       yang diperiksa ia masih berada di dalam kolomnya sesudah digulir. */
    /* Kepala yang diam harus BURAM. Aturan lain di berkas ini menjadikan
       seluruh kepala tabel transparan, dan kepala transparan yang diam
       membuat baris yang lewat di bawahnya terbaca menembus tulisan
       kolomnya — terlihat seperti tampilan rusak, bukan seperti fitur. */
    const latar = await p.evaluate(() => {
      const th = document.querySelector('.perm-table thead th');
      const w = getComputedStyle(th).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(w);
      const bagian = m ? m[1].split(',').map(Number) : [0, 0, 0, 0];
      return { warna: w, alfa: bagian.length > 3 ? bagian[3] : 1 };
    });
    cek('kepala tabel yang diam punya latar buram, bukan tembus pandang',
      latar.alfa === 1, latar);
    cek('tombol Centang semua / Kosongkan ikut tetap terlihat',
      sesudah.barAtas >= sesudah.kolomAtas - 1 && sesudah.barAtas < sesudah.kolomBawah, sesudah);
    if (tinggi === 900) {
      fs.mkdirSync(LUAR, { recursive: true });
      await p.screenshot({ path: path.join(LUAR, 'user-modal-tergulir.png') });
    }
    await ctx.close();
  }

  console.log('\n=== C. DI LAYAR SEMPIT KEMBALI MENUMPUK, BUKAN TERJEBAK ===');
  {
    const ctx = await b.newContext({ viewport: { width: 700, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(A + '/');
    await p.waitForSelector('.perm-table tbody tr', { timeout: 10000 });
    await p.waitForTimeout(250);
    const hp = await p.evaluate(() => {
      const ka = document.querySelector('.uf-kanan'), body = document.getElementById('modalBody');
      const de = document.documentElement;
      return { kolom: getComputedStyle(document.querySelector('.uf-grid')).gridTemplateColumns.split(' ').length,
        kananGulir: getComputedStyle(ka).overflowY,
        badanGulir: body.scrollHeight - body.clientHeight,
        meluber: de.scrollWidth - de.clientWidth };
    });
    cek('grid jadi satu kolom', hp.kolom === 1, hp);
    cek('kolom kanan tidak lagi punya gulirannya sendiri', hp.kananGulir !== 'auto' && hp.kananGulir !== 'scroll', hp);
    cek('badan modal yang menggulir, jadi isinya tetap terjangkau', hp.badanGulir > 40, hp);
    cek('tidak ada yang meluber ke samping', hp.meluber === 0, hp);
    await ctx.close();
  }

  await b.close(); server.close();
  console.log('\n=== HASIL ===');
  console.log(ok + ' lulus, ' + gagal + ' gagal.');
  if (gagal) { console.log('\nJANGAN dideploy: dialog Edit User belum benar.\n'); process.exit(1); }
  console.log('\ntest_izin_ui.js  ' + ok + '/' + ok + '  SEMUA LULUS\n');
})().catch((e) => { console.error('\nGAGAL TOTAL:', (e && e.stack) || e, '\n'); process.exit(1); });

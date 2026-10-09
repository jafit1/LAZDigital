// lib/surat/api.js - tindakan modul Surat & Pengajuan
//
// TIDAK PUNYA BERKAS SENDIRI DI api/. Vercel paket Hobby membatasi 12
// Serverless Function dan yang terpakai sudah 10. Modul ini menumpang pintu
// api/media.js: tindakan berawalan "surat." diteruskan ke sini SEBELUM
// pemeriksaan izin modul Media, jadi akun tanpa akses Media tetap bisa
// memakai modul Surat, dan sebaliknya. Izinnya sendiri: centang modul
// 'surat' di Manajemen User.
//
//   lihat  - membuka modul, melihat surat dan lampiran, menjawab disposisi
//            yang ditujukan kepadanya
//   tambah - mencatat surat/pengajuan baru dan melampirkan berkas
//   ubah   - memindah langkah, asesmen, disposisi, menyunting
//   hapus  - menghapus surat dan lampiran
'use strict';
const engine = require('../../api/_engine.js');
const lazpg = require('../laz-pg.js');
const kv = require('../kv-postgres.js');
const db = require('./db');
const S = require('./surat');

const MODUL = 'surat';
let drive = null;
try { drive = require('../../api/_drive.js'); } catch (_) { drive = null; }

function ctxDari(req) {
  return {
    ip: String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim(),
    ua: String((req.headers && req.headers['user-agent']) || '').slice(0, 160),
  };
}

/* Uji memasang buku besar tiruan di sini (tools/test_surat_fitur.js), supaya
   jalur izin yang diuji adalah engine.cekIzin yang sama dengan produksi. */
let DASAR_UJI = null;
async function muatDasar() {
  if (DASAR_UJI) return DASAR_UJI();
  if (lazpg.pakaiPostgres()) {
    const klien = await kv.ambilKolam().connect();
    try { return (await lazpg._internal.muat(klien, [])).db; } finally { klien.release(); }
  }
  const rpc = require('../../api/rpc.js');
  return (await rpc._internal.muat()).db;
}

async function pengguna(req, badan) {
  const token = badan.token || (req.headers && req.headers['x-laz-token']) || '';
  if (!token) return { galat: 'auth' };
  let u;
  try {
    if (lazpg.pakaiPostgres() && !DASAR_UJI) u = await lazpg.cekIzin(engine, token, MODUL, 'view', ctxDari(req));
    else u = engine.cekIzin(await muatDasar(), token, MODUL, 'view', ctxDari(req));
  } catch (e) {
    return { galat: /IZIN:/.test((e && e.message) || '') ? 'izin' : 'auth' };
  }
  if (!u) return { galat: 'auth' };
  const p = u.role === 'superadmin' ? { view: true, create: true, edit: true, delete: true } : ((u.permissions || {})[MODUL] || {});
  return { id: u.id, nama: u.nama || u.username, peran: u.role, izin: { lihat: !!p.view, tambah: !!p.create, ubah: !!p.edit, hapus: !!p.delete } };
}

/* Akun yang bisa menerima disposisi: aktif dan boleh membuka modul Surat.
   Diambil dari tabel Users yang sama dengan Manajemen User, supaya tidak ada
   daftar nama kedua yang bisa basi. */
async function akunSurat() {
  const d = await muatDasar();
  const t = (d.sheets && d.sheets.Users) || [];
  const h = t[0] || [];
  const k = (n) => h.indexOf(n);
  return t.slice(1).filter((b) => String(b[k('aktif')]) !== 'false').map((b) => {
    let izin = b[k('permissions')];
    if (typeof izin === 'string') { try { izin = JSON.parse(izin); } catch (_) { izin = {}; } }
    const boleh = b[k('role')] === 'superadmin' || !!((izin || {})[MODUL] || {}).view;
    return boleh ? { id: String(b[k('id')]), nama: String(b[k('nama')] || b[k('username')] || ''), kantor: String(b[k('layanan')] || '') } : null;
  }).filter(Boolean).sort((a, b) => a.nama.localeCompare(b.nama));
}

/* Nama dan alamat lembaga untuk kop lembar disposisi yang dicetak. */
async function lembaga() {
  try {
    const t = ((await muatDasar()).sheets || {}).Settings || [];
    const o = {};
    t.slice(1).forEach((b) => { o[String(b[0])] = b[1]; });
    return { namaLembaga: String(o.namaLembaga || ''), alamat: String(o.alamat || ''), telepon: String(o.telepon || ''), singkatan: String(o.singkatan || ''), logoData: String(o.logoData || o.logoUrl || '') };
  } catch (_) { return { namaLembaga: '', alamat: '', telepon: '', singkatan: '', logoData: '' }; }
}

function wajib(p, izin) {
  if (!p.izin[izin]) throw new S.GalatSurat('Anda tidak berhak melakukan tindakan ini.', 403);
}
/* Penambah boleh menyunting dan melampirkan ke surat yang ia catat sendiri
   selama masih di langkah pertama; sesudah itu hanya pemegang izin ubah. */
function bolehSunting(p, r) {
  if (p.izin.ubah) return true;
  return p.izin.tambah && r.olehId === p.id && S.alurDari(r.jenis)[0] === r.status;
}

/* Detail lengkap, kecuali isi lampiran (diambil terpisah). Surat bersifat
   rahasia hanya terbaca utuh oleh pencatat, penerima disposisinya, dan
   pemegang izin ubah. */
function detail(r, p) {
  const kini = S.hariIni();
  const rahasia = r.sifat === 'rahasia' && !p.izin.ubah && r.olehId !== p.id && !(r.disposisi || []).some((d) => d.kepada.some((k) => k.id === p.id));
  const o = Object.assign({}, r, { jenisLabel: S.JENIS[r.jenis].label, statusLabel: S.LABEL_STATUS[r.status], alur: S.alurDari(r.jenis),
    telat: S.telat(r, kini), bolehSunting: bolehSunting(p, r) });
  if (rahasia) { o.ringkasan = ''; o.lampiran = []; o.rahasiaTertutup = true; }
  /* Kode lacak untuk pencatat (yang menyerahkannya ke pemohon) dan pemegang
     izin ubah; orang lain di kantor tidak perlu tahu. */
  if (!p.izin.ubah && r.olehId !== p.id) delete o.kodeLacak;
  return o;
}

const T = {};
T['surat.status'] = async (p) => ({
  pengguna: { id: p.id, nama: p.nama, peran: p.peran }, izin: p.izin,
  jenis: S.JENIS, alur: S.ALUR, labelStatus: S.LABEL_STATUS, sifat: S.SIFAT, instruksi: S.INSTRUKSI,
  batas: { maksBerkas: S.MAKS_BERKAS, maksLampiran: S.MAKS_LAMPIRAN, kuota: S.KUOTA, mime: Object.keys(S.MIME_BOLEH) },
  drive: !!(drive && drive.driveSiapSurat()), hariIni: S.hariIni(), lembaga: await lembaga(),
});
T['surat.daftar'] = async (p) => {
  const kini = S.hariIni();
  const isi = await S.semua();
  return { baris: isi.map((r) => S.ringkas(r, p.id, kini)), ringkas: S.ringkasan(isi, p.id, kini) };
};
T['surat.ruang'] = async () => ({ pakai: await S.pakaiRuang(), kuota: S.KUOTA, drive: !!(drive && drive.driveSiapSurat()) });
T['surat.detail'] = async (p, d) => {
  let r = await S.ambil(d.id);
  if ((p.izin.ubah || r.olehId === p.id) && (r.sifat === 'rahasia' ? r.kodeLacak : !r.kodeLacak)) r = await S.pastikanKode(d.id);
  if (S.untukSaya(r, p.id).length) r = await S.disposisiDibaca(d.id, p);
  const o = detail(r, p);
  if (r.balasanDari) { try { const b = await S.ambil(r.balasanDari); o.balasanDariNomor = b.nomor; } catch (_) { /* surat asal sudah dihapus */ } }
  const isi = await S.semua();
  o.balasan = isi.filter((x) => x.balasanDari === r.id).map((x) => ({ id: x.id, nomor: x.nomor, perihal: x.perihal, status: x.status }));
  return { surat: o };
};
T['surat.simpan'] = async (p, d) => {
  wajib(p, 'tambah');
  const r = await S.buat(d, p);
  return { surat: detail(r, p), pesan: 'Tercatat dengan nomor ' + r.nomor + '.' };
};
T['surat.ubah'] = async (p, d) => {
  const r = await S.ambil(d.id);
  if (!bolehSunting(p, r)) throw new S.GalatSurat('Anda tidak berhak menyunting surat ini.', 403);
  return { surat: detail(await S.ubah(d.id, d), p), pesan: 'Perubahan disimpan.' };
};
T['surat.pindah'] = async (p, d) => {
  wajib(p, 'ubah');
  const r = await S.pindah(d.id, d.ke, d, p);
  return { surat: detail(r, p), pesan: S.LABEL_STATUS[r.status] + '.' };
};
T['surat.asesmen'] = async (p, d) => { wajib(p, 'ubah'); return { surat: detail(await S.asesmen(d.id, d, p), p), pesan: 'Hasil asesmen disimpan.' }; };
T['surat.akun'] = async (p) => { wajib(p, 'ubah'); return { akun: await akunSurat() }; };
T['surat.disposisi'] = async (p, d) => {
  wajib(p, 'ubah');
  const r = await S.disposisi(d.id, d, p, await akunSurat());
  return { surat: detail(r, p), pesan: 'Disposisi dikirim.' };
};
T['surat.disposisi.selesai'] = async (p, d) => {
  const r = await S.disposisiSelesai(d.id, d.did, d, p, p.izin.ubah);
  return { surat: detail(r, p), pesan: 'Disposisi ditandai selesai.' };
};
T['surat.lampiran.tambah'] = async (p, d) => {
  const r0 = await S.ambil(d.id);
  if (!bolehSunting(p, r0)) throw new S.GalatSurat('Anda tidak berhak menambah lampiran di surat ini.', 403);
  const r = await S.tambahLampiran(d.id, d, p, drive);
  return { surat: detail(r, p), pesan: 'Lampiran ditambahkan.' };
};
T['surat.lampiran.ambil'] = async (p, d) => {
  const r = await S.ambil(d.id);
  if (detail(r, p).rahasiaTertutup) throw new S.GalatSurat('Surat rahasia: lampiran hanya untuk pencatat dan penerima disposisi.', 403);
  return S.ambilLampiran(d.id, d.lid, drive);
};
T['surat.lampiran.hapus'] = async (p, d) => {
  const r0 = await S.ambil(d.id);
  if (!bolehSunting(p, r0)) throw new S.GalatSurat('Anda tidak berhak menghapus lampiran ini.', 403);
  return { surat: detail(await S.hapusLampiran(d.id, d.lid, drive), p), pesan: 'Lampiran dihapus.' };
};
T['surat.hapus'] = async (p, d) => { wajib(p, 'hapus'); await S.hapus(d.id, drive); return { pesan: 'Surat dihapus.' }; };

/* Satu-satunya tindakan tanpa masuk. Dibatasi 30 kali per 10 menit per
   alamat IP: kode lacak enam huruf aman dari tebakan hanya kalau tebakannya
   tidak bisa dikirim ribuan kali. */
async function lacak(req, d) {
  const ip = ctxDari(req).ip || 'tanpa-ip';
  const n = await db.naikkan('lacak:' + ip, 600);
  if (n > 30) throw new S.GalatSurat('Terlalu banyak percobaan. Coba lagi 10 menit lagi.', 429);
  const pengajuan = await S.lacak(d.nomor, d.kode);
  /* Hanya nama, singkatan, dan logo untuk kepala halaman; alamat dan telepon tidak ikut. */
  const l = await lembaga();
  return { pengajuan, lembaga: { namaLembaga: l.namaLembaga, singkatan: l.singkatan, logoData: l.logoData } };
}

async function tangani(req, res, badan, util) {
  const nama = String(badan.tindakan || '');
  const d = badan.data || {};
  try {
    if (nama === 'surat.lacak') return util.sukses(res, await lacak(req, d));
    const kerja = T[nama];
    if (!kerja) return util.gagal(res, 404, 'Tindakan "' + nama + '" tidak dikenal');
    const p = await pengguna(req, badan);
    if (p.galat === 'izin') return util.gagal(res, 403, 'Akun Anda belum diberi akses modul Surat & Pengajuan. Minta admin mencentangnya di Manajemen User.');
    if (p.galat) return util.gagal(res, 401, 'Sesi berakhir. Silakan masuk kembali lewat LAZDigital.');
    return util.sukses(res, (await kerja(p, d)) || {});
  } catch (e) {
    const kode = e.kode || 500;
    if (kode >= 500 && kode !== 507) console.error('[surat] ' + nama + ':', e);
    return util.gagal(res, kode, e.message || 'Terjadi kesalahan di server');
  }
}

module.exports = { tangani, T, akunSurat, MODUL, _uji: { aturDasar(fn) { DASAR_UJI = fn; }, pengguna } };

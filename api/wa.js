/**
 * api/wa.js — endpoint RPC fitur Broadcast WhatsApp untuk LAZDigital.
 *
 * POST /api/wa   body: { aksi, token, ... }
 *
 * Login MENUMPANG sistem LAZDigital: token dari localStorage 'laz_token'
 * diverifikasi lewat engine.cekIzin terhadap modul 'broadcast'. Data broadcast
 * TIDAK masuk basis data lembaga (laz:db) — semuanya di kunci Redis 'wab:*'.
 */
'use strict';

const engine = require('./_engine.js');
const rpc = require('./rpc.js');
const wa = require('./_wa.js');

/* Izin yang dibutuhkan tiap aksi terhadap modul 'broadcast'. */
const IZIN = {
  'perangkat': 'view', 'setelan-get': 'view', 'koneksi-get': 'edit', 'webhook-url': 'edit',
  'kontak-parse': 'view', 'kontak-list': 'view',
  'daftarkontak-list': 'view', 'daftarkontak-get': 'view',
  /* 'pesan-periksa' ditangani jalankan() tapi tidak pernah didaftarkan di sini,
     jadi pemeriksa pesan di komposer selalu dibalas "Aksi tidak dikenal" dan
     galatnya ditelan catch kosong di halaman — mati tanpa ada yang tahu. */
  'pesan-list': 'view', 'pesan-periksa': 'view',
  'kampanye-list': 'view', 'kampanye-get': 'view', 'kampanye-recipients': 'view',
  'optout-list': 'view', 'log-webhook': 'view',
  'kampanye-buat': 'create', 'pesan-simpan': 'create', 'kontak-simpan': 'create', 'optout-tambah': 'create', 'daftarkontak-simpan': 'create',
  'setelan-simpan': 'edit', 'kampanye-aksi': 'edit',
  'pesan-hapus': 'delete', 'kontak-hapus': 'delete', 'optout-hapus': 'delete', 'daftarkontak-hapus': 'delete',
};

function balas(res, obj, status) {
  res.status(status || 200).json(obj);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { balas(res, { __error: 'Method not allowed' }, 405); return; }
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};

  const aksi = String(body.aksi || '');
  const token = body.token || (req.headers['x-laz-token']) || '';
  const perlu = IZIN[aksi];
  if (!perlu) { balas(res, { __error: 'Aksi tidak dikenal: ' + aksi }, 400); return; }

  // --- autentikasi: muat db lembaga (read-only), verifikasi izin broadcast ---
  let pengguna;
  try {
    const r = await rpc._internal.muat();
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    pengguna = engine.cekIzin(r.db, token, 'broadcast', perlu, { ip: ip, ua: String(req.headers['user-agent'] || '').slice(0, 160) });
  } catch (e) {
    const pesan = (e && e.message) || String(e);
    const kode = /AUTH:/.test(pesan) ? 401 : (/IZIN:/.test(pesan) ? 403 : 500);
    balas(res, { __error: pesan }, kode);
    return;
  }

  /* Asal (protokol + host) dirakit di server supaya URL webhook bisa dikirim
     jadi, tanpa kunci rahasianya ikut di setiap pembukaan tab Setelan. */
  const asal = (String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim())
    + '://' + String(req.headers['x-forwarded-host'] || req.headers['host'] || '').split(',')[0].trim();

  try {
    const hasil = await jalankan(aksi, body, pengguna, asal);
    balas(res, { result: hasil });
  } catch (e) {
    balas(res, { __error: (e && e.message) || String(e) }, 400);
  }
};

async function jalankan(aksi, b, pengguna, asal) {
  switch (aksi) {
    case 'perangkat': {
      const info = await wa.infoPengirim();
      const c = wa.cfg();
      const peringatan = [];
      if (info.tersambung === false) peringatan.push('Perangkat WhatsApp terputus — scan ulang QR di Fonnte.');
      if (typeof info.kuota === 'number' && info.kuota <= 0) peringatan.push('Kuota Fonnte habis.');
      else if (typeof info.kuota === 'number' && info.kuota < 100) peringatan.push('Sisa kuota Fonnte tinggal ' + info.kuota + '.');
      /* Tanpa CRON_SECRET, rantai dispatcher dan cron dua-duanya mati:
         pengiriman hanya jalan selama tab broadcast terbuka. */
      if (!c.cronSecret) peringatan.push('CRON_SECRET belum diisi di Vercel — pengiriman hanya jalan selama halaman ini terbuka.');
      return {
        info: info, pengirim: c.pengirim, pakaiPesanBebas: wa.pakaiPesanBebas(),
        peringatan: peringatan, cronSiap: !!c.cronSecret, batasPenerima: wa.BATAS_PENERIMA,
        pengguna: { nama: pengguna.nama, role: pengguna.role, id: pengguna.id },
      };
    }
    case 'setelan-get': {
      const s = await wa.getSetelan();
      const aman = Object.assign({}, s);
      aman.fonnteToken = s.fonnteToken ? ('••••' + String(s.fonnteToken).slice(-4)) : '';
      aman.punyaToken = !!s.fonnteToken;
      aman.punyaWebhookSecret = !!s.webhookSecret;
      delete aman.webhookSecret;
      return { setelan: aman, terkirimHariIni: await wa.terkirimHariIni(), tanggal: wa.tanggalWIB(), pengirim: wa.cfg().pengirim, pakaiPesanBebas: wa.pakaiPesanBebas() };
    }
    case 'setelan-simpan': {
      const s = await wa.simpanSetelan(b);
      const aman = Object.assign({}, s);
      aman.fonnteToken = s.fonnteToken ? ('••••' + String(s.fonnteToken).slice(-4)) : '';
      aman.punyaToken = !!s.fonnteToken; aman.punyaWebhookSecret = !!s.webhookSecret; delete aman.webhookSecret;
      return { setelan: aman };
    }
    case 'koneksi-get': {
      const s = await wa.getSetelan();
      /* Kunci webhook TIDAK ikut di sini. Dulu ia dikirim mentah setiap kali
         tab Setelan dibuka; sekarang hanya penandanya, dan URL lengkapnya
         diambil sekali lewat 'webhook-url' saat tombol Salin ditekan. */
      return {
        tokenMask: s.fonnteToken ? ('••••' + String(s.fonnteToken).slice(-4)) : '',
        punyaToken: !!s.fonnteToken,
        kodeNegara: s.kodeNegara || '62', typing: !!s.typing,
        punyaWebhookSecret: !!s.webhookSecret,
        pengirim: wa.cfg().pengirim,
      };
    }
    case 'webhook-url': {
      const s = await wa.getSetelan();
      if (!s.webhookSecret) throw new Error('Kunci webhook belum diisi. Isi dulu lalu Simpan koneksi.');
      return { url: (asal || '') + '/api/wa-webhook?kunci=' + encodeURIComponent(s.webhookSecret) };
    }

    case 'kontak-parse': {
      const matriks = wa.bacaDelimited(String(b.teks || ''));
      const hasil = wa.petakanKontak(matriks, { kodeNegara: b.kodeNegara || '62' });
      const semua = new Set(await wa.daftarOptout());
      const kenaOptout = hasil.baris.filter((x) => semua.has(x.telepon)).map((x) => x.telepon);
      return { header: hasil.header, headerParameter: hasil.headerParameter, jumlahSah: hasil.baris.length, jumlahDitolak: hasil.ditolak.length, jumlahOptout: kenaOptout.length, baris: hasil.baris, ditolak: hasil.ditolak.slice(0, 200) };
    }

    case 'pesan-list': return { pesan: await wa.daftarPesan() };
    case 'pesan-simpan': {
      const cek = wa.periksaPesan(b.teks, { kolomTersedia: b.kolom || [] });
      if (!cek.sah) throw new Error(cek.galat.join(' '));
      const pesan = await wa.simpanPesan({ id: b.id, nama: b.nama, teks: b.teks, lampiranUrl: b.lampiranUrl, lampiranNama: b.lampiranNama });
      return { pesan: pesan, placeholder: wa.ambilPlaceholder(pesan.teks), peringatan: cek.peringatan };
    }
    case 'pesan-periksa': return wa.periksaPesan(b.teks, { kolomTersedia: b.kolom || [] });
    case 'pesan-hapus': await wa.hapusPesan(b.id); return { dihapus: b.id };

    case 'kampanye-list': return { kampanye: await wa.daftarKampanye(b.limit || 50) };
    case 'kampanye-get': return { kampanye: await wa.ambilKampanye(b.id), stat: await wa.ambilStat(b.id) };
    case 'kampanye-recipients': return await wa.daftarPenerima(b.id, { status: b.status || null, limit: b.limit || 200, offset: b.offset || 0 });
    case 'kampanye-aksi': { const k = await wa.aksiKampanye(b.id, b.tindakan); return { kampanye: k, stat: await wa.ambilStat(b.id) }; }
    case 'kampanye-buat': { const hasil = await buatKampanye(b, pengguna); if (b.daftarKontakId) await wa.catatPemakaianDaftar(b.daftarKontakId); return hasil; }

    case 'optout-list': { const nomor = await wa.daftarOptout(); return { jumlah: nomor.length, nomor: nomor }; }
    case 'optout-tambah': { const { ok, gagal } = normalkan(b.nomor); return { ditambah: await wa.tambahOptout(ok), gagal: gagal }; }
    case 'optout-hapus': { const { ok } = normalkan(b.nomor); return { dihapus: await wa.hapusOptout(ok) }; }

    case 'kontak-list': return { kontak: await wa.daftarKontak(b.limit || 500) };
    case 'kontak-simpan': return { kontak: await wa.simpanKontak(b) };
    case 'kontak-hapus': await wa.hapusKontak(b.id); return { dihapus: b.id };

    case 'daftarkontak-list': return { daftar: await wa.daftarDaftarKontak(b.limit || 100) };
    case 'daftarkontak-get': return { daftar: await wa.ambilDaftarKontak(b.id) };
    case 'daftarkontak-simpan': return { daftar: await wa.simpanDaftarKontak(b) };
    case 'daftarkontak-hapus': await wa.hapusDaftarKontak(b.id); return { dihapus: b.id };

    case 'log-webhook': return { antrean: await wa.ukuranAntrean() };

    default: throw new Error('Aksi tidak ditangani: ' + aksi);
  }
}

function normalkan(list) {
  const ok = [], gagal = [];
  (list || []).forEach((n) => { const h = wa.normalisasiTelepon(n); if (h.ok) ok.push(h.telepon); else gagal.push({ isi: String(n), alasan: h.alasan }); });
  return { ok, gagal };
}

async function buatKampanye(b, pengguna) {
  if (!Array.isArray(b.baris) || !b.baris.length) throw new Error('Daftar penerima kosong.');
  /* Dulu 50.000 — angka yang tidak pernah bisa dipenuhi: penerima ditulis ke
     Redis di dalam satu permintaan HTTP dan pasti kena timeout jauh sebelum
     itu. Dashboard memecah kontak besar jadi beberapa kampanye sendiri. */
  if (b.baris.length > wa.BATAS_PENERIMA) throw new Error('Satu kampanye maksimal ' + wa.BATAS_PENERIMA.toLocaleString('id-ID') + ' nomor. Kontak yang lebih banyak dipecah otomatis jadi beberapa kampanye.');

  const mode = b.mode || (wa.pakaiPesanBebas() ? 'pesan' : 'template');

  if (mode === 'pesan') {
    let teks = String((b.pesan && b.pesan.teks) || '');
    let lampiranUrl = (b.pesan && b.pesan.lampiranUrl) || null, lampiranNama = (b.pesan && b.pesan.lampiranNama) || null;
    const pesanId = (b.pesan && b.pesan.pesanId) || null;
    if (pesanId) { const t = await wa.ambilPesanById(pesanId); if (t) { if (!teks.trim()) teks = t.teks; if (lampiranUrl == null) lampiranUrl = t.lampiranUrl; if (lampiranNama == null) lampiranNama = t.lampiranNama; } }
    const kolom = Array.isArray(b.kolom) ? b.kolom : [];
    const cek = wa.periksaPesan(teks, { kolomTersedia: kolom });
    if (!cek.sah) throw new Error(cek.galat.join(' '));
    const penerima = [];
    b.baris.forEach((x) => {
      const telp = String(x.telepon || '').replace(/\D/g, ''); if (!telp) return;
      let nilai = {};
      if (x.kolom && typeof x.kolom === 'object') nilai = x.kolom;
      else if (Array.isArray(x.params)) kolom.forEach((nm, i) => { nilai[nm] = String(x.params[i] == null ? '' : x.params[i]); });
      penerima.push({ telepon: telp, nama: nilai.nama || x.nama || null, kolom: nilai });
    });
    if (!penerima.length) throw new Error('Tidak ada penerima yang sah.');
    const hasil = await wa.buatKampanye({ nama: b.nama, mode: 'pesan', pengirim: wa.cfg().pengirim, pesan: { teks, lampiranUrl, lampiranNama, pesanId }, penerima, dibuatOleh: pengguna.username, langsungJalan: b.langsungJalan !== false });
    if (pesanId) await wa.catatPemakaian(pesanId);
    const contoh = penerima.slice(0, 3).map((p) => ({ telepon: p.telepon, teks: wa.isiPlaceholder(teks, Object.assign({}, p.kolom, { telepon: p.telepon })) }));
    return { kampanye: hasil.kampanye, jumlahAntre: hasil.jumlahAntre, jumlahDilewati: hasil.jumlahDilewati, peringatan: cek.peringatan, contohPesan: contoh };
  }

  // mode template (Meta)
  if (!b.template || !b.template.nama) throw new Error('Template belum dipilih.');
  const variabel = Array.isArray(b.template.variabel) ? b.template.variabel : [];
  const peta = Array.isArray(b.pemetaan) ? b.pemetaan : [];
  if (variabel.length && peta.length !== variabel.length) throw new Error('Template butuh ' + variabel.length + ' parameter, dikirim ' + peta.length + '.');
  const penerima = [];
  b.baris.forEach((x) => {
    const telp = String(x.telepon || '').replace(/\D/g, ''); if (!telp) return;
    const kolom = Array.isArray(x.params) ? x.params : [];
    const params = variabel.length ? peta.map((idx) => String(kolom[Number(idx)] == null ? '' : kolom[Number(idx)]).replace(/[\r\n\t]+/g, ' ').trim() || '-') : [];
    penerima.push({ telepon: telp, params: params });
  });
  if (!penerima.length) throw new Error('Tidak ada penerima yang sah.');
  const hasil = await wa.buatKampanye({ nama: b.nama, mode: 'template', pengirim: wa.cfg().pengirim, template: { nama: b.template.nama, bahasa: b.template.bahasa, kategori: b.template.kategori, variabel }, penerima, dibuatOleh: pengguna.username, langsungJalan: b.langsungJalan !== false });
  return { kampanye: hasil.kampanye, jumlahAntre: hasil.jumlahAntre, jumlahDilewati: hasil.jumlahDilewati };
}

'use strict';

/* Gateway ini sengaja hanya menjadi pekerja. Ia tidak menyimpan antrean bisnis,
   tidak menerima token sesi amil, dan tidak mengaku terkirim sebelum WhatsApp
   mengembalikan id pesan. Semua aturan antrean tetap berada di LAZDigital. */

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const URL_API = process.env.LAZ_API_URL || '';
const TOKEN = process.env.BLAST_AGEN_TOKEN || '';
const AGEN = process.env.BLAST_AGEN_NAMA || 'gateway-lokal';
const NAMA_PERANGKAT = process.env.BLAST_PERANGKAT_NAMA || '';
const NOMOR_PERANGKAT = String(process.env.BLAST_PERANGKAT_NOMOR || '').replace(/\D/g, '');
const JEDA = Number(process.env.BLAST_POLL_MS || 3000);
const AKAR_SESI = process.env.BLAST_SESI || path.join(__dirname, '..', 'sessions');
const FOLDER_AUTH = path.join(AKAR_SESI, 'whatsapp');
let PERANGKAT = process.env.BLAST_PERANGKAT_ID || '';
const filePerangkat = path.join(AKAR_SESI, 'perangkat.json');
const fileQr = path.join(AKAR_SESI, 'qr.png');
let soket = null;
let status = 'terputus';
let nomor = '';
let qrTerakhir = '';
let berhenti = false;
let sedangAmbil = false;

if (!URL_API || !TOKEN) {
  console.error('Setel LAZ_API_URL dan BLAST_AGEN_TOKEN.');
  process.exitCode = 1;
}

function bacaPerangkatLokal() {
  try {
    const isi = JSON.parse(fs.readFileSync(filePerangkat, 'utf8'));
    return isi && isi.id ? String(isi.id) : '';
  } catch (_) { return ''; }
}

function simpanPerangkatLokal(id, nama, nomorPerangkat) {
  fs.mkdirSync(AKAR_SESI, { recursive: true });
  fs.writeFileSync(filePerangkat, JSON.stringify({ id, nama: nama || '', nomor: nomorPerangkat || '', disimpan: new Date().toISOString() }, null, 2));
}

async function cariPerangkat() {
  if (PERANGKAT) {
    simpanPerangkatLokal(PERANGKAT, '', '');
    return PERANGKAT;
  }
  const tersimpan = bacaPerangkatLokal();
  if (tersimpan) {
    PERANGKAT = tersimpan;
    console.log(`Perangkat dari sesi lokal: ${PERANGKAT}`);
    return PERANGKAT;
  }
  const hasil = await panggil('halo', {});
  const daftar = Array.isArray(hasil.perangkat) ? hasil.perangkat.filter((p) => p.aktif !== false) : [];
  let pilihan = daftar.filter((p) =>
    (NAMA_PERANGKAT && String(p.nama).toLowerCase() === NAMA_PERANGKAT.toLowerCase()) ||
    (NOMOR_PERANGKAT && String(p.nomor).replace(/\D/g, '') === NOMOR_PERANGKAT)
  );

  /* Bila pengaturan kosong, gateway boleh memilih otomatis hanya pada keadaan
     yang tidak rancu. Satu perangkat saja cukup untuk menampilkan QR; bila
     beberapa perangkat ada, yang sudah tersambung diprioritaskan. */
  if (!pilihan.length && daftar.length === 1) pilihan = daftar;
  if (!pilihan.length) {
    const tersambung = daftar.filter((p) => p.status === 'tersambung');
    if (tersambung.length === 1) pilihan = tersambung;
  }
  if (pilihan.length !== 1) {
    if (!daftar.length) {
      throw new Error('Belum ada perangkat Gateway sendiri. Buat satu di Broadcast > Perangkat, lalu jalankan gateway lagi.');
    }
    throw new Error(`Perangkat tidak dapat dipilih otomatis karena ada ${daftar.length} perangkat. Isi BLAST_PERANGKAT_ID di .env.`);
  }

  const cocok = pilihan[0];
  PERANGKAT = cocok.id;
  simpanPerangkatLokal(cocok.id, cocok.nama, cocok.nomor);
  console.log(`Perangkat ditemukan dan disimpan lokal: ${cocok.nama} (${PERANGKAT})`);
  return PERANGKAT;
}

async function panggil(tindakan, data) {
  const res = await fetch(URL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agen-Token': TOKEN },
    body: JSON.stringify({ tindakan, data: { ...(data || {}), perangkatId: PERANGKAT, agen: AGEN } }),
  });
  const hasil = await res.json().catch(() => ({}));
  if (!res.ok || hasil.ok === false) throw new Error(hasil.pesan || `API ${res.status}`);
  return hasil;
}

async function lapor(tambahan = {}) {
  try {
    await panggil('lapor-perangkat', {
      status, nomor, qr: qrTerakhir, keterangan: status === 'tersambung' ? 'Gateway terhubung.' : 'Menunggu sambungan WhatsApp.',
      ...tambahan,
    });
  } catch (e) { console.error('[lapor]', e.message); }
}

async function buatSoket() {
  const { state, saveCreds } = await useMultiFileAuthState(FOLDER_AUTH);
  const versi = await fetchLatestBaileysVersion().catch(() => null);
  soket = makeWASocket({
    ...(versi ? { version: versi.version } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldIgnoreJid: (jid) => jid === 'status@broadcast' || jid.endsWith('@g.us'),
  });
  soket.ev.on('creds.update', saveCreds);
  soket.ev.on('connection.update', async (u) => {
    if (u.qr) {
      status = 'menunggu';
      qrTerakhir = await qrcode.toDataURL(u.qr, { width: 264 });
      fs.writeFileSync(fileQr, Buffer.from(qrTerakhir.split(',')[1], 'base64'));
      console.log(`QR tersedia di ${fileQr}`);
      await lapor();
    }
    if (u.connection === 'open') {
      status = 'tersambung'; qrTerakhir = '';
      nomor = soket.user?.id?.split(':')[0] || '';
      console.log(`Terhubung sebagai ${nomor}`);
      await lapor();
    }
    if (u.connection === 'close') {
      status = 'terputus'; await lapor({ qr: '' });
      const kode = u.lastDisconnect?.error?.output?.statusCode;
      if (!berhenti && kode !== DisconnectReason.loggedOut) setTimeout(buatSoket, 3000);
    }
  });
  soket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const pesan of messages) await terima(pesan);
  });
  soket.ev.on('messages.update', async (perubahan) => {
    const hasil = [];
    for (const item of perubahan) {
      const idLuar = item.key?.id;
      if (!idLuar) continue;
      const s = item.update?.status;
      if (s === 3) hasil.push({ idLuar, status: 'sampai' });
      if (s === 4) hasil.push({ idLuar, status: 'dibaca' });
    }
    if (hasil.length) await panggil('lapor-status', { hasil });
  });
}

async function terima(pesan) {
  const jid = pesan.key?.remoteJid;
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) return;
  const teks = pesan.message?.conversation || pesan.message?.extendedTextMessage?.text || '';
  if (!teks && !pesan.key?.id) return;
  await panggil('masuk', {
    nomor: jid.split('@')[0], teks, nama: pesan.pushName || '', idLuar: pesan.key.id,
    waktu: pesan.messageTimestamp ? new Date(Number(pesan.messageTimestamp) * 1000).toISOString() : undefined,
  }).catch((e) => console.error('[masuk]', e.message));
}

async function kirimPekerjaan() {
  if (sedangAmbil || status !== 'tersambung' || !soket) return;
  sedangAmbil = true;
  try {
    const hasil = await panggil('ambil', { maks: 5 });
    const laporan = [];
    for (const kerja of hasil.pekerjaan || []) {
      try {
        let isi = {};
        if (kerja.berkasId) isi = (await panggil('berkas', { berkasId: kerja.berkasId })).berkas || {};
        const tujuan = `${String(kerja.nomor).replace(/\D/g, '')}@s.whatsapp.net`;
        const pesan = kerja.teks ? { text: kerja.teks } : { text: '' };
        if (isi.data && isi.mime) {
          pesan.document = Buffer.from(isi.data, 'base64');
          pesan.mimetype = isi.mime;
          pesan.fileName = kerja.namaBerkas || 'lampiran';
          delete pesan.text;
        }
        const terkirim = await soket.sendMessage(tujuan, pesan);
        laporan.push({ pesanId: kerja.pesanId, status: 'terkirim', idLuar: terkirim.key.id });
      } catch (e) {
        laporan.push({ pesanId: kerja.pesanId, status: 'gagal', sementara: true, galat: e.message });
      }
    }
    if (laporan.length) await panggil('lapor', { hasil: laporan });
  } catch (e) { console.error('[ambil]', e.message); }
  finally { sedangAmbil = false; }
}

async function hapusSesiWhatsApp() {
  try { await soket?.logout(); } catch (_) {}
  soket = null;
  try { fs.rmSync(AKAR_SESI, { recursive: true, force: true }); } catch (e) { console.error('[sesi]', e.message); }
  qrTerakhir = '';
  status = 'terputus';
}

async function mulai() {
  await cariPerangkat();
  await buatSoket();
  setInterval(() => lapor(), 30000);
  setInterval(kirimPekerjaan, JEDA);
  setInterval(async () => {
    try {
      const hasil = await panggil('lapor-perangkat', { status, nomor, qr: qrTerakhir });
      if (hasil.perintah === 'putuskan' || hasil.perintah === 'ganti-nomor') {
        berhenti = true;
        await hapusSesiWhatsApp();
        await lapor({ keterangan: 'Sesi WhatsApp sudah diputuskan. Jalankan gateway lagi untuk QR baru.' });
      }
    } catch (_) {}
  }, 5000);
}

process.on('SIGINT', () => { berhenti = true; soket?.end?.(); process.exit(0); });
process.on('SIGTERM', () => { berhenti = true; soket?.end?.(); process.exit(0); });
module.exports = { panggil };
if (require.main === module) mulai().catch((e) => { console.error(e); process.exit(1); });

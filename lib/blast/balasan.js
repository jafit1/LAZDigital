// lib/balasan.js — balasan otomatis untuk pesan masuk
//
// Aturan keras: balasan otomatis TIDAK PERNAH menyebut nominal, status
// donasi, atau menjanjikan bantuan. Pertanyaan menyangkut uang dan
// permohonan bantuan selalu dialihkan ke petugas manusia.

const db = require('./db');
const { isiPlaceholder } = require('./util');
const { ambilSetelan } = require('./setelan');

const KATA_DIALIHKAN = /(bantuan|dibantu|pinjam|hutang|utang|sakit|biaya|sekolah|mustahik|proposal|santunan)/i;

function cocok(aturan, teks) {
  const t = String(teks || '').trim().toLowerCase();
  const p = String(aturan.pemicu || '').trim().toLowerCase();
  switch (aturan.jenis) {
    case 'persis': return t === p;
    case 'mengandung': return p && t.includes(p);
    case 'katakunci': return p.split(/[,|]/).map((s) => s.trim()).filter(Boolean).some((k) => t.includes(k));
    case 'regex':
      try { return new RegExp(aturan.pemicu, 'i').test(teks); } catch (_) { return false; }
    case 'cadangan': return false; // ditangani terpisah
    default: return false;
  }
}

async function cariBalasan(teksMasuk, konteks = {}) {
  const daftar = ((await db.ambil('balasan')) || []).filter((b) => b.aktif !== false);
  const setelan = await ambilSetelan();

  let terpilih = daftar.find((b) => b.jenis !== 'cadangan' && cocok(b, teksMasuk));

  // Permohonan bantuan selalu ke manusia, apa pun aturannya
  if (!terpilih && KATA_DIALIHKAN.test(String(teksMasuk || ''))) {
    return {
      balasan: 'Terima kasih telah menghubungi LAZISMU Bantul. Pesan Anda kami teruskan ke petugas agar dapat ditindaklanjuti dengan benar. Mohon ditunggu pada jam layanan 08.00–15.00 WIB.',
      tindakan: 'alih-ke-petugas',
      sumber: 'pengaman',
    };
  }

  if (!terpilih) terpilih = daftar.find((b) => b.jenis === 'cadangan');
  if (!terpilih) return null;

  return {
    balasan: isiPlaceholder(terpilih.balasan, {
      nama: konteks.nama || 'Bapak/Ibu',
      lembaga: setelan.lembaga.nama,
      tautanRekening: setelan.lembaga.situs,
      ...konteks,
    }),
    tindakan: terpilih.tindakan || '',
    sumber: terpilih.id,
  };
}

module.exports = { cariBalasan, cocok };

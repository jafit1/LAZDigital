// lib/ai/pustaka.js — Pengetahuan Lazismu dan Pustaka Prompt/Persona
//
// Keduanya berbentuk sama (daftar catatan bernomor urut yang bisa dinyalakan
// dan dimatikan), jadi ditulis sekali sebagai pabrik. Dipisah dua berkas
// berarti dua salinan aturan panjang-maksimal yang suatu saat berbeda.
//
// PENGETAHUAN diselipkan ke SETIAP percakapan; PERSONA hanya bila dipilih.
// Itu sebabnya pengetahuan dibatasi ketat: ia dibayar ulang sebagai token pada
// tiap pertanyaan, oleh semua orang, selamanya.

const db = require('./db');
const util = require('../blast/util');
const { id, sekarang, bersihkanTeks } = util;

const BATAS_PENGETAHUAN = 12000;  // huruf, gabungan seluruh catatan aktif

function buatPustaka(nama, maksIsi) {
  const KUNCI = (i) => `${nama}:${i}`;
  const DAFTAR = `${nama}:daftar`;

  async function semua() {
    const ids = await db.anggotaHimpunan(DAFTAR);
    if (!ids.length) return [];
    return (await db.ambilBanyak(ids.map(KUNCI))).filter(Boolean)
      .sort((a, b) => (a.urutan - b.urutan) || String(a.judul).localeCompare(String(b.judul), 'id'));
  }

  async function ambil(i) { return db.ambil(KUNCI(i)); }

  async function simpan(data, pengguna) {
    const lama = data.id ? await ambil(data.id) : null;
    if (data.id && !lama) throw new util.GalatAplikasi('Catatan tidak ditemukan', 404);
    const judul = bersihkanTeks(data.judul, 100) || (lama ? lama.judul : '');
    if (!judul) throw new util.GalatAplikasi('Judul wajib diisi.');
    const isi = String(data.isi === undefined ? (lama ? lama.isi : '') : data.isi).slice(0, maksIsi);
    if (!isi.trim()) throw new util.GalatAplikasi('Isi wajib diisi.');

    const rec = {
      id: lama ? lama.id : id(nama.slice(0, 2) + '_'),
      judul,
      isi,
      /* Medan tambahan khusus persona/prompt; tidak dipakai pengetahuan tetapi
         disimpan apa adanya supaya satu pabrik cukup untuk keduanya. */
      jenis: bersihkanTeks(data.jenis, 20) || (lama ? lama.jenis : 'prompt'),
      ikon: bersihkanTeks(data.ikon, 8) || (lama ? lama.ikon : ''),
      aktif: data.aktif === undefined ? (lama ? lama.aktif !== false : true) : Boolean(data.aktif),
      urutan: Number(data.urutan !== undefined ? data.urutan : (lama ? lama.urutan : 100)) || 100,
      dibuat: lama ? lama.dibuat : sekarang(),
      diubah: sekarang(),
      olehNama: pengguna ? pengguna.nama : (lama ? lama.olehNama : ''),
    };
    await db.simpan(KUNCI(rec.id), rec);
    await db.tambahKeHimpunan(DAFTAR, rec.id);
    return rec;
  }

  async function hapus(i) {
    const rec = await ambil(i);
    if (!rec) throw new util.GalatAplikasi('Catatan tidak ditemukan', 404);
    await db.hapus(KUNCI(i));
    await db.keluarDariHimpunan(DAFTAR, i);
    return rec;
  }

  return { KUNCI, DAFTAR, semua, ambil, simpan, hapus };
}

const pengetahuan = buatPustaka('tahu', 20000);
const prompt = buatPustaka('prompt', 8000);

/* Gabungan pengetahuan aktif, siap diselipkan ke prompt sistem.
   Dipotong di BATAS_PENGETAHUAN dan potongannya dikatakan — pengetahuan yang
   diam-diam terpotong di tengah kalimat menghasilkan jawaban yang salah
   dengan percaya diri, dan tidak ada yang tahu kenapa. */
async function gabungPengetahuan() {
  const isi = (await pengetahuan.semua()).filter((x) => x.aktif !== false);
  let keluar = '';
  let terpotong = false;
  for (const x of isi) {
    const blok = `## ${x.judul}\n${x.isi}\n\n`;
    if (keluar.length + blok.length > BATAS_PENGETAHUAN) { terpotong = true; break; }
    keluar += blok;
  }
  return { teks: keluar.trim(), jumlah: isi.length, terpotong };
}

module.exports = { pengetahuan, prompt, gabungPengetahuan, BATAS_PENGETAHUAN };

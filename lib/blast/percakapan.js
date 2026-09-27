/* lib/blast/percakapan.js — kotak masuk berbentuk percakapan, bukan daftar pesan.
 *
 * APA YANG DIPERBAIKI DI SINI.
 * Halaman riwayat yang lama memperlihatkan satu baris untuk SETIAP pesan:
 * pesan yang kita kirim, balasan donatur, lalu balasan kita lagi, semuanya
 * berjajar sebagai baris yang tidak saling mengenal. Untuk mengikuti satu
 * percakapan, petugas harus memindai seratus baris dan menyusun sendiri
 * urutannya di kepala. Satu donatur yang bertanya empat kali terlihat seperti
 * empat kejadian yang tidak berhubungan — dan yang paling mahal, tidak ada satu
 * pun tempat yang bisa menjawab "pertanyaan ini sudah dijawab belum".
 *
 * Yang dibangun di sini adalah bentuk yang sudah dikenal semua orang: satu
 * baris per kontak, isinya pesan terakhir, dan yang belum terjawab menonjol.
 *
 * SUMBER KEBENARANNYA TETAP DOKUMEN PESAN, BUKAN RINGKASAN TERSENDIRI.
 * Cara yang biasa dipakai adalah menyimpan satu dokumen "utas" per nomor dan
 * memperbaruinya setiap ada pesan. Itu lebih cepat dibaca, tetapi ada sebelas
 * tempat di aplikasi ini yang menulis dokumen pesan — antrean, laporan gateway,
 * centang sampai, centang dibaca, pembatalan, pengulangan, penghapusan. Satu
 * saja yang lupa memperbarui ringkasannya, dan kotak masuk mulai berbohong:
 * memperlihatkan pesan terakhir yang bukan yang terakhir, atau menghitung belum
 * dibaca untuk percakapan yang sudah dijawab. Kebohongan seperti itu tidak
 * pernah terlihat sebagai galat, jadi tidak pernah ada yang melaporkannya.
 *
 * Jadi utasnya DISUSUN saat diminta, dari dokumen pesannya sendiri. Supaya itu
 * tetap murah, dua hal dikerjakan: pembacaannya satu kueri MGET (lihat
 * lib/kv-postgres.js), dan layar tidak pernah menanyakan daftarnya berulang
 * kali untuk memastikan — ia menanyakan satu angka denyut (antrean.denyutkan)
 * dan baru meminta daftarnya kalau angkanya berubah.
 *
 * TANDA SUDAH DIBACA DIBAGI SATU LEMBAGA, BUKAN PER PETUGAS.
 * Nomor WhatsApp-nya satu dan miliknya lembaga. Kalau tanda baca dipisah per
 * petugas, tiga petugas akan menjawab pertanyaan yang sama tiga kali karena
 * masing-masing melihatnya masih merah — dan donatur menerima tiga jawaban
 * berbeda. Yang benar justru meniru satu ponsel yang dipegang bergiliran:
 * dibuka satu orang, lunas untuk semua.
 */
'use strict';

const db = require('./db');
const antreanLib = require('./antrean');
const kontakLib = require('./kontak');
const { normalkanNomor, sekarang, intiNomor } = require('./util');

/* Jendela riwayat. Bukan "semua pesan sejak awal": daftar 'pesan:baru' sendiri
   hanya menyimpan 2000 id terakhir, jadi angka di atas itu tidak menambah apa
   pun selain kunci yang dibaca sia-sia. */
const BATAS_PESAN = 2000;
const BATAS_UTAS = 500;          /* satu percakapan yang digambar sekaligus */
const PANJANG_CUPLIKAN = 140;

const KUNCI_DIBACA = 'percakapan:dibaca';

/* ---------------------------------------------------------------- pembacaan */

async function semuaPesan(batas = BATAS_PESAN) {
  const ids = ((await db.ambil('pesan:baru')) || []).slice(0, batas);
  if (!ids.length) return [];
  return (await db.ambilBanyak(ids.map(antreanLib.KUNCI_PESAN))).filter(Boolean);
}

/* Waktu yang dipakai untuk MENGURUTKAN, dan itu selalu waktu pesannya terjadi —
   bukan waktu status terakhirnya berubah. Kalau centang "dibaca" yang datang
   sejam kemudian ikut menggeser urutan, percakapan lama tiba-tiba melompat ke
   atas hanya karena donatur membuka pesan kemarin. */
function waktuPesan(p) {
  return p.dikirim || p.diserahkanPada || p.dibuat || null;
}
function detik(nilai) {
  const t = new Date(nilai || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function cuplik(p) {
  const isi = p.isi || {};
  const teks = String(isi.teks || '').replace(/\s+/g, ' ').trim();
  if (teks) return teks.slice(0, PANJANG_CUPLIKAN);
  if (isi.namaBerkas) return '\u{1F4C4} ' + String(isi.namaBerkas).slice(0, 80);
  if (isi.berkasId || isi.berkasUrl) return '\u{1F4C4} Lampiran';
  return '';
}

async function petaDibaca() {
  const isi = await db.ambil(KUNCI_DIBACA);
  return isi && typeof isi === 'object' && !Array.isArray(isi) ? isi : {};
}

/* ------------------------------------------------------- daftar percakapan */

/* Satu baris per kontak, plus satu baris per grup yang pernah dikirimi
   broadcast. Keduanya dalam satu daftar dan diurut bersama menurut waktu, sama
   seperti WhatsApp menaruh grup dan perorangan dalam satu kolom — memisahkannya
   ke dua tab berarti petugas harus menebak di tab mana pesan terbaru berada. */
async function daftar(opsi = {}) {
  const kunciKantor = opsi.kunciKantor || null;
  const cari = String(opsi.cari || '').trim().toLowerCase();

  const [pesan, kontakSemua, dibaca] = await Promise.all([
    semuaPesan(),
    kontakLib.semuaKontak(),
    petaDibaca(),
  ]);

  const kontakLewatNomor = new Map(kontakSemua.map((k) => [String(k.nomor), k]));

  /* Kantor yang dikunci disaring di SINI, bukan di tampilan: pengurus KLL tidak
     boleh melihat percakapan kantor lain, dan yang menegakkannya harus server. */
  let dipakai = pesan;
  if (kunciKantor) {
    dipakai = pesan.filter((p) => {
      const k = kontakLewatNomor.get(String(p.nomor));
      return k && (k.kantor || '') === kunciKantor;
    });
  }

  /* --- percakapan perorangan --- */
  const utas = new Map();
  for (const p of dipakai) {
    const nomor = String(p.nomor || '');
    if (!nomor) continue;
    let u = utas.get(nomor);
    if (!u) {
      const k = kontakLewatNomor.get(nomor) || null;
      u = {
        kunci: 'nomor:' + nomor,
        jenis: 'kontak',
        nomor,
        nama: (k && k.nama) || p.nama || nomor,
        kontakId: k ? k.id : null,
        kantor: (k && k.kantor) || '',
        diblokir: Boolean(k && kontakLib.diblokir(k)),
        jumlah: 0,
        masuk: 0,
        belumDibaca: 0,
        waktu: null,
        cuplikan: '',
        arahTerakhir: '',
        statusTerakhir: '',
      };
      utas.set(nomor, u);
    }
    u.jumlah++;
    if (p.arah === 'masuk') u.masuk++;

    const t = detik(waktuPesan(p));
    if (t >= detik(u.waktu)) {
      u.waktu = waktuPesan(p);
      u.cuplikan = cuplik(p);
      u.arahTerakhir = p.arah || 'keluar';
      u.statusTerakhir = p.status || '';
    }
  }

  /* Belum dibaca = pesan MASUK yang datang sesudah percakapannya terakhir
     dibuka. Pesan keluar tidak pernah dihitung: yang mengirimnya adalah kita. */
  for (const u of utas.values()) {
    const batas = detik(dibaca[u.kunci]);
    u.belumDibaca = dipakai.filter((p) => String(p.nomor) === u.nomor
      && p.arah === 'masuk' && detik(waktuPesan(p)) > batas).length;
  }

  /* --- percakapan grup --- */
  const grupBaris = kunciKantor ? [] : await barisGrup(dipakai, kontakSemua, dibaca);

  let baris = [...utas.values(), ...grupBaris];

  if (cari) {
    const angka = intiNomor(cari);
    baris = baris.filter((u) => String(u.nama).toLowerCase().includes(cari)
      || String(u.cuplikan).toLowerCase().includes(cari)
      || (u.nomor && angka.length >= 3 && intiNomor(u.nomor).includes(angka)));
  }

  baris.sort((a, b) => detik(b.waktu) - detik(a.waktu));
  return {
    baris,
    /* ANGKA TOTAL MENGHITUNG BARIS KONTAK SAJA, BUKAN GRUP.
       Balasan seorang anggota grup muncul di DUA baris: percakapannya sendiri
       dan utas grup yang dia balas. Itu berguna di daftar — grup yang ramai
       dibalas memang perlu terlihat — tetapi kalau keduanya ikut dijumlah,
       satu pesan terhitung dua kali dan lencana menu menyebut angka yang tidak
       pernah cocok dengan jumlah percakapan yang benar-benar menunggu dijawab.
       Begitu angkanya sekali saja terbukti salah, tidak ada yang percaya lagi. */
    belumDibaca: baris.reduce((n, u) => n + (u.jenis === 'kontak' ? (u.belumDibaca || 0) : 0), 0),
  };
}

/* Grup TIDAK punya nomor WhatsApp sendiri di aplikasi ini: yang disebut "grup"
   adalah label kontak, dan broadcast ke grup adalah ratusan pesan perorangan
   yang dikirim serempak. Jadi utas grup disusun dari kiriman massalnya: satu
   gelembung per broadcast, ditambah balasan yang datang dari anggotanya. Itu
   yang membuat "lihat broadcast per grup" masuk akal tanpa mengarang grup
   WhatsApp yang tidak pernah ada. */
async function barisGrup(pesan, kontakSemua, dibaca) {
  const idMassal = await db.anggotaHimpunan('massal:daftar');
  if (!idMassal.length) return [];
  const massalSemua = (await db.ambilBanyak(idMassal.map((i) => `massal:${i}`))).filter(Boolean);

  const perGrup = new Map();
  for (const m of massalSemua) {
    for (const g of (m.grup || [])) {
      const nama = kontakLib.rapikanGrup(g);
      if (!nama) continue;
      if (!perGrup.has(nama)) perGrup.set(nama, []);
      perGrup.get(nama).push(m);
    }
  }
  if (!perGrup.size) return [];

  const masuk = pesan.filter((p) => p.arah === 'masuk');

  return Array.from(perGrup.entries()).map(([nama, kiriman]) => {
    const anggota = kontakSemua.filter((k) => (k.label || [])
      .some((g) => kontakLib.rapikanGrup(g) === nama));
    const nomorAnggota = new Set(anggota.map((k) => String(k.nomor)));

    kiriman.sort((a, b) => detik(b.dibuat) - detik(a.dibuat));
    const terakhir = kiriman[0];

    /* Balasan grup hanya dihitung sesudah broadcast PERTAMA ke grup itu.
       Tanpa batas ini, percakapan lama yang tidak ada hubungannya dengan
       broadcast apa pun ikut terhitung sebagai balasan grup. */
    const awal = detik(kiriman[kiriman.length - 1].dibuat);
    const balasan = masuk.filter((p) => nomorAnggota.has(String(p.nomor))
      && detik(waktuPesan(p)) >= awal);

    const kunci = 'grup:' + nama;
    const batas = detik(dibaca[kunci]);

    /* Waktu barisnya = yang paling baru antara broadcast terakhir dan balasan
       terakhir. Kalau cuma dipakai waktu broadcast, grup yang baru saja ramai
       dibalas tetap terkubur di bawah — padahal justru itu yang perlu dibuka. */
    const waktuBalasan = balasan.reduce((t, p) => Math.max(t, detik(waktuPesan(p))), 0);
    const waktuKiriman = detik(terakhir.dibuat);
    const waktuBaris = Math.max(waktuBalasan, waktuKiriman);

    return {
      kunci,
      jenis: 'grup',
      grup: nama,
      nama,
      nomor: '',
      anggota: anggota.length,
      jumlah: kiriman.length,
      dibalas: balasan.length,
      belumDibaca: balasan.filter((p) => detik(waktuPesan(p)) > batas).length,
      waktu: waktuBaris ? new Date(waktuBaris).toISOString() : terakhir.dibuat,
      cuplikan: String(terakhir.teks || '').replace(/\s+/g, ' ').trim().slice(0, PANJANG_CUPLIKAN),
      arahTerakhir: 'keluar',
      statusTerakhir: terakhir.status || '',
    };
  });
}

/* ------------------------------------------------------------- satu percakapan */

async function utasKontak(nomorMinta, opsi = {}) {
  const nomor = normalkanNomor(nomorMinta);
  if (!nomor) throw new Error('Nomor percakapan tidak sah');

  const [pesan, kontakSemua] = await Promise.all([semuaPesan(), kontakLib.semuaKontak()]);
  const kontak = kontakSemua.find((k) => String(k.nomor) === nomor) || null;

  if (opsi.kunciKantor && (!kontak || (kontak.kantor || '') !== opsi.kunciKantor)) {
    const e = new Error('Percakapan ini bukan milik kantor Anda');
    e.kode = 403;
    throw e;
  }

  const milik = pesan.filter((p) => String(p.nomor) === nomor)
    .sort((a, b) => detik(waktuPesan(a)) - detik(waktuPesan(b)))
    .slice(-BATAS_UTAS);

  /* Nama kiriman massal dibawa ke gelembungnya. Tanpa ini, pesan yang datang
     dari broadcast terlihat seperti pesan pribadi yang tidak diingat siapa pun
     pernah menulisnya. */
  const idMassal = Array.from(new Set(milik.map((p) => p.massalId).filter(Boolean)));
  const massalSemua = idMassal.length
    ? (await db.ambilBanyak(idMassal.map((i) => `massal:${i}`))).filter(Boolean) : [];
  const namaMassal = new Map(massalSemua.map((m) => [m.id, m.nama]));

  return {
    nomor,
    nama: (kontak && kontak.nama) || (milik.length && milik[milik.length - 1].nama) || nomor,
    kontakId: kontak ? kontak.id : null,
    kantor: (kontak && kontak.kantor) || '',
    diblokir: Boolean(kontak && kontakLib.diblokir(kontak)),
    grup: (kontak && kontak.label) || [],
    pesan: milik.map((p) => ({
      id: p.id,
      arah: p.arah || 'keluar',
      teks: (p.isi && p.isi.teks) || '',
      namaBerkas: (p.isi && p.isi.namaBerkas) || '',
      jenisMedia: (p.isi && p.isi.jenisMedia) || (p.isi && p.isi.jenisBerkas) || '',
      status: p.status || '',
      galat: p.galatTerakhir || '',
      waktu: waktuPesan(p),
      sampai: p.sampai || null,
      dibaca: p.dibaca || null,
      massalId: p.massalId || null,
      namaMassal: p.massalId ? (namaMassal.get(p.massalId) || '') : '',
      oleh: p.oleh || '',
    })),
  };
}

async function utasGrup(namaMinta) {
  const nama = kontakLib.rapikanGrup(namaMinta);
  if (!nama) throw new Error('Nama grup tidak sah');

  const [pesan, kontakSemua] = await Promise.all([semuaPesan(), kontakLib.semuaKontak()]);
  const idMassal = await db.anggotaHimpunan('massal:daftar');
  const massalSemua = (await db.ambilBanyak(idMassal.map((i) => `massal:${i}`))).filter(Boolean);

  const kiriman = massalSemua
    .filter((m) => (m.grup || []).some((g) => kontakLib.rapikanGrup(g) === nama))
    .sort((a, b) => detik(a.dibuat) - detik(b.dibuat));
  if (!kiriman.length) {
    const e = new Error('Grup ini belum pernah dikirimi broadcast');
    e.kode = 404;
    throw e;
  }

  const anggota = kontakSemua.filter((k) => (k.label || [])
    .some((g) => kontakLib.rapikanGrup(g) === nama));
  const nomorAnggota = new Set(anggota.map((k) => String(k.nomor)));
  const namaLewatNomor = new Map(kontakSemua.map((k) => [String(k.nomor), k.nama || '']));

  const HIDUP = ['terkirim', 'sampai', 'dibaca'];
  const gelembung = kiriman.map((m) => {
    const milik = pesan.filter((p) => p.massalId === m.id);
    return {
      jenis: 'kiriman',
      id: m.id,
      nama: m.nama,
      teks: m.teks || '',
      namaBerkas: m.namaBerkas || '',
      waktu: m.dibuat,
      status: m.status || '',
      jumlah: m.jumlah || milik.length,
      statistik: {
        antre: milik.filter((p) => p.status === 'antre').length,
        terkirim: milik.filter((p) => HIDUP.includes(p.status)).length,
        sampai: milik.filter((p) => ['sampai', 'dibaca'].includes(p.status)).length,
        dibaca: milik.filter((p) => p.status === 'dibaca').length,
        gagal: milik.filter((p) => p.status === 'gagal').length,
      },
    };
  });

  const awal = detik(kiriman[0].dibuat);
  const balasan = pesan
    .filter((p) => p.arah === 'masuk' && nomorAnggota.has(String(p.nomor))
      && detik(waktuPesan(p)) >= awal)
    .map((p) => ({
      jenis: 'masuk',
      id: p.id,
      nomor: p.nomor,
      nama: namaLewatNomor.get(String(p.nomor)) || p.nama || p.nomor,
      teks: (p.isi && p.isi.teks) || '',
      waktu: waktuPesan(p),
    }));

  const isi = [...gelembung, ...balasan]
    .sort((a, b) => detik(a.waktu) - detik(b.waktu))
    .slice(-BATAS_UTAS);

  return { grup: nama, anggota: anggota.length, jumlahKiriman: kiriman.length, isi };
}

/* ------------------------------------------------------------------- menandai */

/* Waktu yang dicatat adalah SEKARANG, bukan waktu pesan terakhir yang terlihat.
   Keduanya hampir sama, kecuali pada satu keadaan yang justru paling penting:
   pesan yang datang persis saat layarnya terbuka. Dengan "sekarang", pesan itu
   ikut dianggap terbaca oleh orang yang sedang menatapnya — dan memang begitu
   kenyataannya. */
async function tandaiDibaca(kunci) {
  const k = String(kunci || '').trim();
  if (!/^(nomor|grup):.+/.test(k)) throw new Error('Percakapan mana yang dibuka?');
  const peta = await petaDibaca();
  peta[k] = sekarang();

  /* Dipangkas supaya satu kunci ini tidak tumbuh selamanya. Yang dibuang adalah
     tanda baca paling tua, dan akibat terburuknya cuma satu: percakapan yang
     tidak disentuh berbulan-bulan terlihat punya pesan belum dibaca lagi. */
  const isian = Object.entries(peta).sort((a, b) => detik(b[1]) - detik(a[1])).slice(0, 800);
  await db.simpan(KUNCI_DIBACA, Object.fromEntries(isian));
  return { kunci: k, waktu: peta[k] };
}

module.exports = {
  daftar, utasKontak, utasGrup, tandaiDibaca,
  BATAS_PESAN, BATAS_UTAS, KUNCI_DIBACA,
  _internal: { semuaPesan, waktuPesan, cuplik, petaDibaca, barisGrup },
};

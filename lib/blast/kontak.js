// lib/kontak.js — daftar kontak milik aplikasi sendiri
//
// Sengaja TIDAK terikat tabel Donatur LAZDigital: banyak calon donatur dan
// simpatisan belum pernah bertransaksi, tetapi tetap perlu dihubungi.

const db = require('./db');
const { id, sekarang, normalkanNomor, nomorValid, nomorCocok, bersihkanTeks } = require('./util');

const SEGMEN = [
  { kode: 'donatur-rutin', label: 'Donatur rutin' },
  { kode: 'donatur-musiman', label: 'Donatur musiman' },
  { kode: 'muzaki-zakat-mal', label: 'Muzaki zakat mal' },
  { kode: 'mustahik', label: 'Mustahik binaan' },
  { kode: 'pengurus-kll', label: 'Pengurus KLL/ULL' },
  { kode: 'amil-relawan', label: 'Amil & relawan' },
  { kode: 'mitra', label: 'Mitra / instansi' },
  { kode: 'simpatisan', label: 'Simpatisan belum berdonasi' },
];

const KUNCI = (i) => `kontak:${i}`;
const DAFTAR = 'kontak:daftar';
const IDX_NOMOR = 'idx:nomor';

/* GRUP adalah pengelompokan buatan petugas sendiri — "Pengajian Ahad", "Donatur
   Sewon", "Panitia Qurban" — dan disimpan pada medan `label` tiap kontak.
   Segmen tetap ada dan tetap tetap: ia menjawab "orang ini apa", sedangkan grup
   menjawab "orang ini ikut rombongan mana". Keduanya sering tidak sama, dan
   memaksanya jadi satu daftar membuat petugas harus memilih salah satu makna. */
const BATAS_GRUP_PER_KONTAK = 12;
const PANJANG_GRUP = 40;

function rapikanGrup(nama) {
  return bersihkanTeks(String(nama || ''), PANJANG_GRUP).replace(/\s+/g, ' ').trim();
}

/* Daftar grup tidak disimpan terpisah, melainkan dikumpulkan dari kontaknya.
   Satu sumber kebenaran: grup yang tidak lagi dipakai siapa pun hilang sendiri,
   dan tidak ada daftar grup yang bisa berbeda dari kenyataan. */
async function daftarGrup() {
  const isi = await semuaKontak();
  const hitung = new Map();
  for (const k of isi) {
    for (const g of k.label || []) {
      const nama = rapikanGrup(g);
      if (nama) hitung.set(nama, (hitung.get(nama) || 0) + 1);
    }
  }
  return Array.from(hitung, ([nama, jumlah]) => ({ nama, jumlah }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/* Mengubah nama grup di satu tempat. Tanpa ini, mengganti nama berarti membuka
   ratusan kontak satu per satu — dan yang terjadi di lapangan bukan itu,
   melainkan grup baru dibuat dan yang lama ditinggalkan setengah terisi. */
async function ubahNamaGrup(lama, baru) {
  const dari = rapikanGrup(lama);
  const ke = rapikanGrup(baru);
  if (!dari) throw new Error('Nama grup lama tidak boleh kosong');
  if (!ke) throw new Error('Nama grup baru tidak boleh kosong');
  const isi = await semuaKontak();
  let tersentuh = 0;
  for (const k of isi) {
    if (!(k.label || []).some((g) => rapikanGrup(g) === dari)) continue;
    const baruDaftar = Array.from(new Set((k.label || [])
      .map((g) => (rapikanGrup(g) === dari ? ke : rapikanGrup(g)))
      .filter(Boolean)));
    k.label = baruDaftar.slice(0, BATAS_GRUP_PER_KONTAK);
    k.diubah = sekarang();
    await db.simpan(KUNCI(k.id), k);
    tersentuh++;
  }
  return { grup: ke, kontak: tersentuh };
}

async function hapusGrup(nama) {
  const target = rapikanGrup(nama);
  if (!target) throw new Error('Nama grup tidak boleh kosong');
  const isi = await semuaKontak();
  let tersentuh = 0;
  for (const k of isi) {
    if (!(k.label || []).some((g) => rapikanGrup(g) === target)) continue;
    k.label = (k.label || []).filter((g) => rapikanGrup(g) !== target);
    k.diubah = sekarang();
    await db.simpan(KUNCI(k.id), k);
    tersentuh++;
  }
  /* Kontaknya sendiri TIDAK ikut terhapus. Membubarkan rombongan bukan berarti
     membuang orangnya, dan kekeliruan ke arah itu tidak bisa dibatalkan. */
  return { grup: target, kontak: tersentuh };
}

/* Memasukkan atau mengeluarkan banyak kontak sekaligus dari satu grup. */
async function aturGrupKontak(kontakIds, grup, masuk = true) {
  const target = rapikanGrup(grup);
  if (!target) throw new Error('Nama grup tidak boleh kosong');
  const ids = Array.from(new Set((kontakIds || []).filter(Boolean)));
  let tersentuh = 0;
  for (const kid of ids) {
    const k = await db.ambil(KUNCI(kid));
    if (!k) continue;
    const punya = (k.label || []).some((g) => rapikanGrup(g) === target);
    if (masuk === punya) continue;
    k.label = masuk
      ? Array.from(new Set([...(k.label || []), target])).slice(0, BATAS_GRUP_PER_KONTAK)
      : (k.label || []).filter((g) => rapikanGrup(g) !== target);
    k.diubah = sekarang();
    await db.simpan(KUNCI(k.id), k);
    tersentuh++;
  }
  return { grup: target, kontak: tersentuh };
}

async function cariLewatNomor(nomor) {
  const n = normalkanNomor(nomor);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  return peta[n] ? db.ambil(KUNCI(peta[n])) : null;
}

async function simpanKontak(data, oleh = null) {
  const nomor = normalkanNomor(data.nomor);
  if (!nomorValid(nomor)) throw new Error('Nomor WhatsApp tidak sah');

  let kontak = data.id ? await db.ambil(KUNCI(data.id)) : await cariLewatNomor(nomor);
  const baru = !kontak;

  kontak = Object.assign(
    {
      id: id('k_'),
      dibuat: sekarang(),
      langganan: true,
      daftarHitam: false,
      catatan: '',
      kolomTambahan: {},
    },
    kontak || {},
    {
      nama: bersihkanTeks(data.nama || (kontak && kontak.nama) || '', 120),
      nomor,
      segmen: Array.isArray(data.segmen) ? data.segmen.filter((s) => SEGMEN.some((x) => x.kode === s)) : (kontak ? kontak.segmen : []),
      label: Array.isArray(data.label)
        ? Array.from(new Set(data.label.map(rapikanGrup).filter(Boolean))).slice(0, BATAS_GRUP_PER_KONTAK)
        : (kontak ? kontak.label : []),
      kantor: bersihkanTeks(data.kantor !== undefined ? data.kantor : (kontak && kontak.kantor) || '', 80),
      alamat: bersihkanTeks(data.alamat !== undefined ? data.alamat : (kontak && kontak.alamat) || '', 200),
      surel: bersihkanTeks(data.surel !== undefined ? data.surel : (kontak && kontak.surel) || '', 120),
      catatan: bersihkanTeks(data.catatan !== undefined ? data.catatan : (kontak && kontak.catatan) || '', 1000),
      anonim: data.anonim !== undefined ? Boolean(data.anonim) : Boolean(kontak && kontak.anonim),
      diubah: sekarang(),
      diubahOleh: oleh ? oleh.id : null,
    }
  );
  if (!kontak.nama) kontak.nama = nomor;

  await db.simpan(KUNCI(kontak.id), kontak);
  await db.tambahKeHimpunan(DAFTAR, kontak.id);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  for (const [n, kid] of Object.entries(peta)) if (kid === kontak.id && n !== nomor) delete peta[n];
  peta[nomor] = kontak.id;
  await db.simpan(IDX_NOMOR, peta);

  return { kontak, baru };
}

async function hapusKontak(kontakId) {
  const kontak = await db.ambil(KUNCI(kontakId));
  if (!kontak) throw new Error('Kontak tidak ditemukan');
  await db.hapus(KUNCI(kontakId));
  await db.keluarDariHimpunan(DAFTAR, kontakId);
  const peta = (await db.ambil(IDX_NOMOR)) || {};
  delete peta[kontak.nomor];
  await db.simpan(IDX_NOMOR, peta);
  return true;
}

async function semuaKontak() {
  const idDaftar = await db.anggotaHimpunan(DAFTAR);
  const isi = await db.ambilBanyak(idDaftar.map(KUNCI));
  return isi.filter(Boolean);
}

// Saringan + halaman. Penyaringan kantor untuk peran KLL dikerjakan di sini,
// di server — bukan disembunyikan di tampilan.
/* Penyaringan dipisahkan dari penghalamanan karena ada DUA pemakai yang wajib
   sepakat: daftar yang menghitung "24 kontak" di layar, dan tombol "Hapus 24
   hasil" yang menghapusnya. Kalau keduanya menyaring sendiri-sendiri, suatu
   saat salah satunya diperbaiki dan yang lain tidak — dan yang terjadi adalah
   tombol yang menghapus lebih banyak daripada angka yang tertulis padanya.
   Di sini saringannya hanya satu, jadi selisih itu tidak mungkin ada. */
async function saringKontak({ cari = '', segmen = '', label = '', grup = '', kantorTerkunci = null } = {}) {
  let isi = await semuaKontak();

  if (kantorTerkunci) {
    isi = isi.filter((k) => (k.kantor || '') === kantorTerkunci);
  }
  if (segmen) isi = isi.filter((k) => (k.segmen || []).includes(segmen));
  const grupCari = rapikanGrup(grup || label);
  if (grupCari) isi = isi.filter((k) => (k.label || []).some((g) => rapikanGrup(g) === grupCari));
  if (cari) {
    const q = cari.toLowerCase();
    isi = isi.filter((k) =>
      String(k.nama).toLowerCase().includes(q) ||
      nomorCocok(k.nomor, cari) ||
      String(k.kantor || '').toLowerCase().includes(q));
  }

  isi.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
  return isi;
}

async function daftarKontak({ halaman = 1, perHalaman = 25, ...saring } = {}) {
  const isi = await saringKontak(saring);
  const mulai = (Math.max(1, halaman) - 1) * perHalaman;
  return { total: isi.length, halaman, perHalaman, baris: isi.slice(mulai, mulai + perHalaman) };
}

// Impor CSV/tempel teks. Kolom dikenali dari baris kepala.
function uraikanCsv(teks) {
  const baris = String(teks || '').split(/\r?\n/).filter((b) => b.trim());
  if (!baris.length) return [];
  const pisah = (b) => {
    const hasil = [];
    let saat = '';
    let dalamKutip = false;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c === '"') {
        if (dalamKutip && b[i + 1] === '"') { saat += '"'; i++; } else dalamKutip = !dalamKutip;
      } else if ((c === ',' || c === ';' || c === '\t') && !dalamKutip) {
        hasil.push(saat); saat = '';
      } else saat += c;
    }
    hasil.push(saat);
    return hasil.map((s) => s.trim());
  };

  const kepala = pisah(baris[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const petaKolom = {
    nama: ['nama', 'namalengkap', 'name'],
    nomor: ['nomor', 'nowa', 'whatsapp', 'hp', 'telepon', 'phone', 'nohp'],
    kantor: ['kantor', 'kll', 'ull', 'layanan'],
    surel: ['surel', 'email'],
    alamat: ['alamat', 'address'],
    segmen: ['segmen', 'kategori'],
    label: ['grup', 'group', 'label', 'rombongan'],
    catatan: ['catatan', 'keterangan', 'note'],
  };
  const indeks = {};
  for (const [medan, kemungkinan] of Object.entries(petaKolom)) {
    indeks[medan] = kepala.findIndex((h) => kemungkinan.includes(h));
  }
  /* TANPA BARIS JUDUL YANG DIKENALI.

     Ini keadaan yang paling sering terjadi di lapangan, bukan keadaan langka:
     orang menyorot baris-baris isi di Excel lalu menempelkannya, tanpa ikut
     menyorot baris judulnya.

     Dulu keadaan itu dijawab dengan "kolom 1 nama, kolom 2 nomor", dan kolom
     sisanya DIBUANG. Akibatnya kantor dan grup hilang tanpa sepatah pun
     pemberitahuan: impornya melaporkan sekian kontak masuk, semuanya benar,
     hanya saja tidak satu pun grup yang diminta pernah terbentuk. Petugas
     lalu mengira fitur grupnya yang rusak.

     Sekarang kolomnya ditebak dari ISINYA. Kolom yang paling banyak berisi
     nomor telepon jadi kolom nomor; sisanya mengikuti urutan yang tertulis di
     layar: NAMA, KETERANGAN, GRUP. Tebakannya dilaporkan lewat
     uraikanCsv.terakhir supaya tampilan bisa memperlihatkan apa yang dipahami
     SEBELUM ada yang tersimpan.

     KOLOM KETIGA ADALAH KETERANGAN BEBAS, BUKAN KANTOR LAYANAN.
     Dulu kolom ketiga dipaksa jadi kantor, dan kantor adalah medan yang
     terikat: ia dipakai mengunci pengurus KLL ke kantornya sendiri dan muncul
     sebagai penanda {{kantor}} di isi pesan. Menaruh apa saja di sana berarti
     menaruh sampah ke dalam medan yang dipakai menyaring hak akses. Yang
     ditempel orang dari Excel biasanya catatan bebas: "belum bayar", "kenalan
     Pak Budi", "donatur lama". Jadi kolom ketiga sekarang masuk ke catatan,
     yang memang tidak terikat apa pun, dan kantor hanya terisi kalau berkasnya
     PUNYA baris judul yang menyebut kantor. */
  if (indeks.nomor === -1 && indeks.nama === -1) {
    const semua = baris.map(pisah);
    const lebar = Math.max.apply(null, semua.map((k) => k.length));
    const miripNomor = (v) => {
      const d = String(v || '').replace(/[^0-9]/g, '');
      return d.length >= 8 && d.length <= 16;
    };
    /* Kolom nomor dipilih dari yang paling banyak berisi angka telepon, bukan
       dari posisinya: berkas dari lapangan sering menaruhnya di kolom mana
       saja. */
    let iNomor = -1, skorTerbaik = 0;
    for (let c = 0; c < lebar; c++) {
      const skor = semua.filter((k) => miripNomor(k[c])).length;
      if (skor > skorTerbaik) { skorTerbaik = skor; iNomor = c; }
    }
    if (iNomor < 0 || skorTerbaik === 0) {
      uraikanCsv.terakhir = { adaJudul: false, ditebak: true, lebar, kolom: { nama: 0, nomor: 1, keterangan: -1, grup: -1 } };
      return semua.map((k) => ({ nama: k[0] || '', nomor: k[1] || k[0] || '' }));
    }
    const sisa = [];
    for (let c = 0; c < lebar; c++) if (c !== iNomor) sisa.push(c);
    const iNama = sisa.length > 0 ? sisa[0] : -1;
    const iKet = sisa.length > 1 ? sisa[1] : -1;
    const iGrup = sisa.length > 2 ? sisa[2] : -1;
    uraikanCsv.terakhir = {
      adaJudul: false, ditebak: true, lebar,
      kolom: { nama: iNama, nomor: iNomor, keterangan: iKet, grup: iGrup },
    };
    return semua.map((k) => {
      const o = { nama: iNama > -1 ? (k[iNama] || '') : '', nomor: k[iNomor] || '' };
      /* Diambil apa adanya, tanpa dicocokkan dengan apa pun yang sudah ada di
         aplikasi. Inilah yang membedakannya dari kantor: keterangan tidak
         punya daftar yang sah, jadi tidak ada yang bisa "salah". */
      if (iKet > -1 && k[iKet]) o.catatan = k[iKet];
      if (iGrup > -1 && k[iGrup]) {
        o.label = String(k[iGrup]).split(/[|/;]/).map((x) => x.trim()).filter(Boolean);
      }
      return o;
    });
  }

  uraikanCsv.terakhir = {
    adaJudul: true, ditebak: false, lebar: kepala.length,
    kolom: {
      nama: indeks.nama, nomor: indeks.nomor,
      keterangan: indeks.catatan, kantor: indeks.kantor, grup: indeks.label,
    },
  };
  return baris.slice(1).map((b) => {
    const k = pisah(b);
    const objek = {};
    for (const [medan, i] of Object.entries(indeks)) if (i > -1) objek[medan] = k[i] || '';
    if (objek.segmen) objek.segmen = String(objek.segmen).split(/[|/]/).map((s) => s.trim()).filter(Boolean);
    if (objek.label) objek.label = String(objek.label).split(/[|/;]/).map((s) => s.trim()).filter(Boolean);
    return objek;
  });
}

/* PRATINJAU SEBELUM MENGIMPOR.

   Impor kontak tidak bisa dibatalkan dengan satu tombol: yang sudah masuk
   harus dicari dan dihapus satu per satu. Jadi yang paling menolong bukan
   pesan setelahnya, melainkan kesempatan melihat apa yang DIPAHAMI aplikasi
   sebelum apa pun tersimpan.

   Yang dilaporkan sengaja termasuk hal yang dulu hilang diam-diam: kolom mana
   yang dibaca sebagai apa, grup baru apa saja yang akan terbentuk, dan berapa
   baris yang nomornya tidak sah sehingga akan dilewati.

   Hanya membaca. Tidak menyimpan apa pun. */
async function praTinjauImpor(teks) {
  const baris = uraikanCsv(teks);
  const bentuk = uraikanCsv.terakhir || { adaJudul: false, ditebak: true, kolom: {} };
  const grupAda = new Set((await daftarGrup()).map((g) => g.nama.toLowerCase()));

  const grupBaru = new Map();
  const grupDipakai = new Map();
  let sah = 0;
  const tidakSah = [];
  for (const b of baris) {
    if (nomorValid(b.nomor)) sah++;
    else if (tidakSah.length < 8) tidakSah.push({ nama: b.nama || '', nomor: b.nomor || '' });
    for (const g of b.label || []) {
      const nama = rapikanGrup(g);
      if (!nama) continue;
      grupDipakai.set(nama, (grupDipakai.get(nama) || 0) + 1);
      if (!grupAda.has(nama.toLowerCase())) grupBaru.set(nama, (grupBaru.get(nama) || 0) + 1);
    }
  }

  const namaKolom = (i) => (i === undefined || i === null || i < 0 ? null : i + 1);
  return {
    total: baris.length,
    sah,
    tidakSahJumlah: baris.length - sah,
    tidakSah,
    adaJudul: Boolean(bentuk.adaJudul),
    ditebak: Boolean(bentuk.ditebak),
    kolom: {
      nama: namaKolom(bentuk.kolom && bentuk.kolom.nama),
      nomor: namaKolom(bentuk.kolom && bentuk.kolom.nomor),
      keterangan: namaKolom(bentuk.kolom && bentuk.kolom.keterangan),
      /* Kantor hanya terisi lewat baris judul. Lihat catatan di uraikanCsv:
         menebaknya dari posisi berarti menaruh catatan bebas ke dalam medan
         yang dipakai mengunci hak akses pengurus KLL. */
      kantor: namaKolom(bentuk.kolom && bentuk.kolom.kantor),
      grup: namaKolom(bentuk.kolom && bentuk.kolom.grup),
    },
    grup: Array.from(grupDipakai, ([nama, jumlah]) => ({ nama, jumlah, baru: grupBaru.has(nama) }))
      .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, 'id')),
    contoh: baris.slice(0, 5).map((b) => ({
      nama: b.nama || '', nomor: b.nomor || '',
      keterangan: b.catatan || '', kantor: b.kantor || '',
      grup: (b.label || []).join(', '),
    })),
  };
}

async function imporKontak(teks, oleh) {
  const baris = uraikanCsv(teks);
  const hasil = { total: baris.length, baru: 0, diperbarui: 0, dilewati: 0, galat: [] };
  for (const b of baris) {
    try {
      if (!nomorValid(b.nomor)) { hasil.dilewati++; continue; }
      const { baru } = await simpanKontak(b, oleh);
      if (baru) hasil.baru++; else hasil.diperbarui++;
    } catch (e) {
      hasil.dilewati++;
      if (hasil.galat.length < 10) hasil.galat.push(`${b.nama || b.nomor}: ${e.message}`);
    }
  }
  return hasil;
}

function keCsv(daftar) {
  /* Kepala kolomnya memakai kata yang dipakai di layar: "grup", bukan "label".
     Berkas ekspor sering jadi berkas impor bulan depan, dan nama kolom yang
     berbeda dari yang terlihat di aplikasi adalah cara paling mudah membuat
     datanya masuk ke medan yang salah. */
  const kepala = ['nama', 'nomor', 'kantor', 'surel', 'alamat', 'segmen', 'grup', 'diblokir', 'catatan'];
  const baris = [kepala.join(',')];
  for (const k of daftar) {
    baris.push(kepala.map((h) => {
      let v = h === 'grup' ? k.label : h === 'diblokir' ? diblokir(k) : k[h];
      if (Array.isArray(v)) v = v.join('|');
      if (typeof v === 'boolean') v = v ? 'ya' : 'tidak';
      v = String(v === undefined || v === null ? '' : v);
      return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return baris.join('\n');
}

/* Dulu ada DUA saklar yang artinya nyaris sama: "berlangganan" dan "daftar
   hitam". Petugas harus menebak mana yang dipakai, dan kontak bisa berhenti
   menerima kiriman karena saklar yang tidak sedang dilihat. Sekarang tinggal
   satu: diblokir atau tidak.

   `langganan: false` dari data lama tetap dihormati — orang yang pernah membalas
   "BERHENTI" tidak boleh tiba-tiba dikirimi lagi hanya karena tampilannya
   dirapikan. Itu janji kepada penerimanya, bukan sekadar medan basis data. */
function diblokir(kontak) {
  return Boolean(kontak && (kontak.daftarHitam || kontak.langganan === false));
}

function bolehDikirimiMassal(kontak) {
  return Boolean(kontak) && !diblokir(kontak);
}

module.exports = {
  SEGMEN, simpanKontak, hapusKontak, saringKontak, daftarKontak, semuaKontak, cariLewatNomor,
  imporKontak, praTinjauImpor, uraikanCsv, keCsv, bolehDikirimiMassal, diblokir, KUNCI,
  daftarGrup, ubahNamaGrup, hapusGrup, aturGrupKontak, rapikanGrup,
  BATAS_GRUP_PER_KONTAK,
};

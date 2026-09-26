/* lib/laz-skema.js: satu-satunya tempat yang tahu bentuk tabel buku besar.
 *
 * Dipakai oleh lib/laz-pg.js (aplikasi berjalan), tools/impor-postgres.js
 * (pemindahan), dan tools/banding-migrasi.js (pembuktian). Ketiganya harus
 * sepakat tentang kolom apa saja yang ada dan tipenya apa; kalau daftarnya
 * disalin di tiga tempat, cukup satu kolom baru yang lupa ditambahkan di salah
 * satunya untuk membuat data hilang diam-diam saat disimpan.
 *
 * DUA ARAH, DUA BENTUK.
 * PostgreSQL punya tipe: date, numeric, boolean, jsonb, timestamptz.
 * api/_engine.js tidak: ia lahir sebagai Google Apps Script dan seluruh isinya
 * berupa larik-of-larik berisi teks dan angka. Jadi setiap nilai melewati dua
 * penerjemahan:
 *
 *   keMesin(tipe, nilai)  PostgreSQL -> bentuk yang dibaca engine
 *   keTabel(tipe, nilai)  bentuk engine -> PostgreSQL
 *
 * Yang halus dan mudah salah:
 *
 * - "tanggal" (date) menjadi 'YYYY-MM-DD'. Engine membandingkan tanggal
 *   sebagai teks, jadi panjangnya harus persis sepuluh huruf.
 * - "waktu" (timestamptz) menjadi ISO LENGKAP, bukan dipotong sepuluh huruf.
 *   Sessions.expired dipotong berarti sesi yang masih berlaku sampai malam ini
 *   dianggap kedaluwarsa sejak tengah malam tadi; petugas tiba-tiba logout dan
 *   tidak ada yang tahu kenapa.
 * - "bool" menjadi teks 'true'/'false', bukan true/false. Engine menyimpan
 *   Users.aktif sebagai String(d.aktif) dan membandingkannya dengan 'false'.
 * - "json" menjadi TEKS JSON, bukan objek. sanitizeUser() memanggil
 *   JSON.parse(u.permissions) bila tipenya string; kalau sudah objek ia lewat,
 *   tapi kode lain menyimpannya kembali dengan JSON.stringify, dan campuran
 *   dua bentuk itu yang membuat izin kadang kosong.
 * - "angka" menjadi Number. pg mengembalikan numeric sebagai TEKS ('1500.00')
 *   supaya presisinya tidak hilang; kalau dibiarkan teks, penjumlahan di engine
 *   berubah menjadi penyambungan teks.
 */
'use strict';

/* Urutan kolom di sini adalah urutan baris judul yang dilihat engine, dan
   harus sama dengan urutan ensureSheet() di api/_engine.js. */
const TABEL = {
  Users: {
    kunci: 'id',
    kolom: [['id', 'text'], ['username', 'text'], ['passwordHash', 'text'], ['salt', 'text'],
      ['nama', 'text'], ['role', 'text'], ['permissions', 'json'], ['aktif', 'bool'],
      ['dibuat', 'waktu'], ['layanan', 'text']],
  },
  Rekening: {
    kunci: 'id',
    kolom: [['id', 'text'], ['namaBank', 'text'], ['nomor', 'text'], ['atasNama', 'text'],
      ['fundGroup', 'text'], ['aktif', 'bool'], ['dibuat', 'waktu']],
  },
  Layanan: {
    kunci: 'id',
    kolom: [['id', 'text'], ['tipe', 'text'], ['kode', 'text'], ['nama', 'text'],
      ['wilayah', 'text'], ['penanggungJawab', 'text'], ['telepon', 'text'],
      ['aktif', 'bool'], ['dibuat', 'waktu']],
  },
  Donatur: {
    kunci: 'id',
    kolom: [['id', 'text'], ['nama', 'text'], ['kategori', 'text'], ['telepon', 'text'],
      ['alamat', 'text'], ['email', 'text'], ['dibuat', 'waktu']],
  },
  Settings: {
    kunci: 'key',
    kolom: [['key', 'text'], ['value', 'text']],
  },
  Penghimpunan: {
    kunci: 'id',
    kolom: [['id', 'text'], ['noKwitansi', 'text'], ['tanggal', 'tanggal'], ['jenisDana', 'text'],
      ['subJenis', 'text'], ['pilar', 'text'], ['program', 'text'], ['namaDonatur', 'text'],
      ['tipeDonatur', 'text'], ['layananId', 'text'], ['telepon', 'text'], ['email', 'text'],
      ['alamat', 'text'], ['jumlah', 'angka'], ['metode', 'text'], ['rekeningId', 'text'],
      ['bank', 'text'], ['statusBayar', 'text'], ['atasNama', 'text'], ['keterangan', 'text'],
      ['petugas', 'text'], ['dibuat', 'waktu'], ['fundraising', 'text'], ['akunKredit', 'text']],
  },
  Pentasyarufan: {
    kunci: 'id',
    kolom: [['id', 'text'], ['noBukti', 'text'], ['tanggal', 'tanggal'], ['ashnaf', 'text'],
      ['program', 'text'], ['sumberDana', 'text'], ['namaPenerima', 'text'], ['nik', 'text'],
      ['telepon', 'text'], ['alamat', 'text'], ['jumlah', 'angka'], ['bentukBantuan', 'text'],
      ['metode', 'text'], ['statusSalur', 'text'], ['petugas', 'text'], ['keterangan', 'text'],
      ['dibuat', 'waktu'], ['fundraising', 'text'], ['rekeningId', 'text'], ['bank', 'text'],
      ['section', 'text']],
  },
  UangMuka: {
    kunci: 'id',
    kolom: [['id', 'text'], ['tanggal', 'tanggal'], ['jenis', 'text'], ['dana', 'text'],
      ['layanan', 'text'], ['akun', 'text'], ['rekeningId', 'text'], ['kasNama', 'text'],
      ['nominal', 'angka'], ['keterangan', 'text'], ['section', 'text'], ['petugas', 'text'],
      ['dibuat', 'waktu']],
  },
  Transfer: {
    kunci: 'id',
    kolom: [['id', 'text'], ['tanggal', 'tanggal'], ['jenis', 'text'], ['dariAkun', 'text'],
      ['dariRekeningId', 'text'], ['dariKas', 'text'], ['keAkun', 'text'], ['keRekeningId', 'text'],
      ['keKas', 'text'], ['nominal', 'angka'], ['keterangan', 'text'], ['section', 'text'],
      ['petugas', 'text'], ['dibuat', 'waktu']],
  },
  Mutasi: {
    kunci: 'id',
    kolom: [['id', 'text'], ['tanggal', 'tanggal'], ['deskripsi', 'text'], ['tipe', 'text'],
      ['nominal', 'angka'], ['dibuat', 'waktu']],
  },
  SaldoAwal: {
    kunci: 'id',
    kolom: [['id', 'text'], ['tahun', 'text'], ['jenis', 'text'], ['akun', 'text'],
      ['rekeningId', 'text'], ['kasNama', 'text'], ['dana', 'text'], ['nominal', 'angka'],
      ['keterangan', 'text'], ['dibuat', 'waktu'], ['oleh', 'text']],
  },
  Sessions: {
    kunci: 'token',
    kolom: [['token', 'text'], ['userId', 'text'], ['expired', 'waktu']],
  },
  /* AuditLog tidak punya kolom kunci yang dikenal engine: id-nya bigserial dan
     sengaja tidak ikut ditampilkan. Isinya hanya ditambah di ujung dan
     dipangkas dari depan, jadi tidak perlu dicocokkan baris per baris. */
  AuditLog: {
    kunci: null,
    kolom: [['waktu', 'waktu'], ['userId', 'text'], ['username', 'text'], ['aksi', 'text'],
      ['modul', 'text'], ['entitasId', 'text'], ['ringkas', 'text'], ['detail', 'text'],
      ['ip', 'text'], ['ua', 'text']],
  },
};

/* Kolom yang tidak boleh NULL di PostgreSQL. Dicantumkan supaya penyimpanan
   berhenti dengan pesan yang menyebut nama kolomnya, bukan melempar galat
   "null value in column" yang tidak memberi tahu baris mana. */
const WAJIB = {
  Users: ['id', 'username'],
  Penghimpunan: ['id', 'tanggal'],
  Pentasyarufan: ['id', 'tanggal'],
  UangMuka: ['id', 'tanggal'],
  Transfer: ['id', 'tanggal'],
  Mutasi: ['id', 'tanggal'],
  SaldoAwal: ['id', 'tahun'],
  Sessions: ['token', 'userId', 'expired'],
  Donatur: ['id', 'nama'],
  AuditLog: ['waktu'],
};

const NAMA_TABEL = Object.keys(TABEL);

/* Baris judul yang dilihat engine. */
function kepala(tabel) { return TABEL[tabel].kolom.map((k) => k[0]); }
function tipeKolom(tabel) { const o = {}; TABEL[tabel].kolom.forEach(([n, t]) => { o[n] = t; }); return o; }

/* ---------------- PostgreSQL -> engine ---------------- */
function keMesin(tipe, v) {
  if (v === null || v === undefined) return '';
  switch (tipe) {
    case 'tanggal':
      /* pg memberi objek Date untuk date. Dibaca sebagai waktu LOKAL, bukan
         UTC: node membuat Date date-only pada tengah malam waktu setempat, dan
         toISOString() di zona timur Jakarta akan memundurkannya satu hari. */
      if (v instanceof Date) {
        return v.getFullYear() + '-' + dua(v.getMonth() + 1) + '-' + dua(v.getDate());
      }
      return String(v).slice(0, 10);
    case 'waktu':
      return v instanceof Date ? v.toISOString() : String(v);
    case 'angka': {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case 'bool':
      return v === true ? 'true' : v === false ? 'false' : String(v);
    case 'json':
      return typeof v === 'string' ? v : JSON.stringify(v);
    default:
      return typeof v === 'object' ? JSON.stringify(v) : v;
  }
}
function dua(n) { return (n < 10 ? '0' : '') + n; }

/* ---------------- engine -> PostgreSQL ---------------- */
/* jejak dipakai untuk pesan galat: "Penghimpunan[a1b2].tanggal". Nilai yang
   tidak bisa dibaca DILEMPAR, tidak diganti nol atau NULL: nol di kolom
   nominal terlihat sama seperti transaksi yang memang nol rupiah, dan tidak
   akan pernah ada yang menyadarinya. */
function keTabel(tipe, v, jejak) {
  const kosong = v === null || v === undefined || v === '';
  switch (tipe) {
    case 'tanggal': {
      if (kosong) return null;
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(jejak + ': tanggal "' + v + '" tidak bisa dibaca');
      return s;
    }
    case 'waktu': {
      if (kosong) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new Error(jejak + ': waktu "' + v + '" tidak bisa dibaca');
      return d.toISOString();
    }
    case 'angka': {
      if (kosong) return 0;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new Error(jejak + ': angka tidak wajar (' + v + ')');
        return v;
      }
      /* Titik ribuan dan koma desimal, kebiasaan Indonesia. */
      const bersih = String(v).replace(/[Rr][Pp]\.?\s*/g, '').replace(/\s/g, '')
        .replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
      const n = Number(bersih);
      if (!Number.isFinite(n)) throw new Error(jejak + ': "' + v + '" bukan angka');
      return n;
    }
    case 'bool': {
      if (typeof v === 'boolean') return v;
      const s = String(kosong ? '' : v).toLowerCase();
      if (s === '') return true;                       /* kolom kosong = aktif */
      return !['false', '0', 'tidak', 'nonaktif'].includes(s);
    }
    case 'json': {
      if (kosong) return '{}';
      if (typeof v === 'string') {
        try { JSON.parse(v); return v; } catch (e) { throw new Error(jejak + ': bukan JSON yang sah'); }
      }
      return JSON.stringify(v);
    }
    default:
      return v === null || v === undefined ? '' : String(v);
  }
}

/* Satu baris engine (larik sejajar dengan baris judul) menjadi nilai-nilai
   siap dikirim ke PostgreSQL, urut sesuai kepala(tabel). */
function barisKeTabel(tabel, kepalaBaris, baris) {
  const tipe = tipeKolom(tabel);
  const kol = kepala(tabel);
  const kunciNama = TABEL[tabel].kunci;
  const iKunci = kunciNama ? kepalaBaris.indexOf(kunciNama) : -1;
  const tanda = iKunci >= 0 ? String(baris[iKunci] || '') : '';
  const jejakBaris = tabel + (tanda ? '[' + tanda + ']' : '');
  const wajib = WAJIB[tabel] || [];

  return kol.map((nama) => {
    const i = kepalaBaris.indexOf(nama);
    const v = i >= 0 ? baris[i] : '';
    const hasil = keTabel(tipe[nama], v, jejakBaris + '.' + nama);
    if (wajib.includes(nama) && (hasil === null || hasil === '')) {
      throw new Error(jejakBaris + '.' + nama + ' wajib diisi, tapi kosong');
    }
    return hasil;
  });
}

module.exports = { TABEL, NAMA_TABEL, WAJIB, kepala, tipeKolom, keMesin, keTabel, barisKeTabel };

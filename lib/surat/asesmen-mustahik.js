'use strict';

const crypto = require('crypto');
const db = require('./db');
const { GalatSurat, hariIni } = require('./surat');

const BENTUK = {
  kode: 'F.Survei',
  nama: 'Survei Calon Mustahik',
  bagian: [
    { id: 'keluarga', nama: 'Kondisi keluarga', pertanyaan: [
      ['tanggungan', 'Jumlah tanggungan keluarga', [['Tidak ada',1],['1-2 orang',2],['3-4 orang',3],['5-6 orang',4],['Lebih dari 7 orang',5]]],
      ['anakSekolah', 'Jumlah anak yang masih sekolah', [['Tidak ada',1],['1-2 orang',2],['3-4 orang',3],['5-6 orang',4],['Lebih dari 7 orang',5]]],
      ['anakPutusSekolah', 'Jumlah anak yang putus sekolah', [['Tidak ada',1],['Ada',5]]],
      ['pengeluaranBulanan', 'Jumlah pengeluaran bulanan', [['Lebih dari Rp3.000.000',1],['Rp2.000.001-Rp3.000.000',2],['Rp1.000.001-Rp2.000.000',3],['Rp500.000-Rp1.000.000',4],['Rp250.000-Rp500.000',5]]],
      ['obatRutin', 'Obat rutin anggota keluarga yang sakit', [['Tidak ada',1],['Di bawah Rp200.000',2],['Rp200.001-Rp500.000',3],['Rp500.001-Rp1.000.000',4],['Lebih dari Rp1.000.000',5]]],
      ['biayaPendidikan', 'Biaya pendidikan yang ditanggung', [['Di bawah Rp200.000',1],['Rp200.000-Rp500.000',2],['Rp500.001-Rp1.000.000',3],['Rp1.000.001-Rp2.000.000',4],['Rp2.000.001-Rp3.000.000',5]]],
      ['hutang', 'Riwayat hutang berjalan', [['Tidak memiliki hutang',1],['Memiliki hutang',5]]],
      ['keperluanHutang', 'Keperluan hutang', [['Sekunder',1],['Kebutuhan sosial',2],['Pendidikan',3],['Kesehatan',4],['Kebutuhan pokok',5]]],
      ['jaminanKesehatan', 'Jaminan kesehatan keluarga', [['Non-PBI',1],['PBI',3],['Tidak punya',5]]],
      ['pekerjaanKepala', 'Pekerjaan kepala keluarga', [['PNS',1],['Dagang',2],['Karyawan',3],['Serabutan',4],['Menganggur',5]]],
      ['merokok', 'Kebiasaan merokok', [['Merokok',1],['Tidak merokok',5]]],
      ['pekerjaanPasangan', 'Pekerjaan suami/istri', [['PNS',1],['Dagang',2],['Karyawan',3],['Serabutan',4],['Menganggur',5]]],
      ['usia', 'Usia mustahik', [['5-20 tahun',1],['21-30 tahun',2],['31-40 tahun',3],['41-50 tahun',4],['Lebih dari 51 tahun',5]]],
      ['kondisiKepalaKeluarga', 'Kondisi kepala keluarga', [['Sehat dan bekerja',1],['Sehat dan tidak bekerja',2],['Manula',3],['Sakit',4],['Sakit menahun',5]]],
    ] },
    { id: 'rumah', nama: 'Kondisi tempat tinggal', pertanyaan: [
      ['kepemilikanRumah', 'Kepemilikan rumah', [['Milik sendiri',1],['Milik keluarga',3],['Kontrak',4],['Menumpang',5]]],
      ['luasRumah', 'Luas rumah', [['Luas',1],['5 x 9 m',3],['5 x 7 m',4],['Sangat kecil',5]]],
      ['dinding', 'Dinding rumah', [['Batu bata',1],['Semi tembok',2],['Kalsibot',3],['Seng',4],['Bambu',5]]],
      ['lantai', 'Lantai rumah', [['Keramik',1],['Semen',3],['Panggung',4],['Tanah',5]]],
      ['atap', 'Atap rumah', [['Genteng',1],['Asbes',3],['Seng',4],['Rumbia',5]]],
      ['sumberAir', 'Sumber air', [['Sumur bor',1],['PDAM',2],['Sumur gali',3],['Bersama',4],['Tidak ada',5]]],
      ['mck', 'MCK', [['Sendiri',1],['Bersama',4],['Tidak ada',5]]],
      ['penerangan', 'Penerangan', [['Genset',1],['PLN',2],['Saluran',3],['Sentir/lilin',5]]],
      ['dayaTerpasang', 'Daya listrik terpasang', [['1.300 kWh',1],['900 kWh',2],['450 kWh',3],['Tidak ada',5]]],
      ['kelayakanTidur', 'Kelayakan tempat tidur', [['Spring bed',1],['Kasur busa',2],['Kasur kapuk',3],['Tikar/karpet',5]]],
    ] },
    { id: 'makanan', nama: 'Makanan sehari-hari', pertanyaan: [
      ['jumlahMakan', 'Jumlah makan per hari', [['3 kali',1],['2 kali',3],['1 kali',5]]],
      ['konsumsiAyam', 'Konsumsi ayam', [['2 kali per pekan',1],['1 kali per pekan',4],['Tidak pernah',5]]],
      ['konsumsiDaging', 'Konsumsi daging', [['2 kali per pekan',1],['1 kali per pekan',4],['Tidak pernah',5]]],
      ['konsumsiSusu', 'Konsumsi susu', [['2 kali per pekan',1],['1 kali per pekan',4],['Tidak pernah',5]]],
      ['belanjaHarian', 'Belanja harian', [['Lebih dari Rp100.000',1],['Rp50.000-Rp100.000',2],['Rp25.000-Rp50.000',3],['Rp15.000-Rp25.000',4],['Rp1.000-Rp15.000',5]]],
    ] },
    { id: 'aset', nama: 'Kepemilikan aset', pertanyaan: [
      ['asetTidakBergerak', 'Aset tidak bergerak (sawah/pekarangan)', [['500-750 m2',2],['Sampai dengan 500 m2',4],['Tidak punya',5]]],
      ['asetBergerak', 'Aset bergerak', [['Mobil',1],['Motor',2],['Sepeda',4],['Tidak punya',5]]],
    ] },
  ],
  barang: [
    { id: 'televisi', nama: 'Televisi' }, { id: 'handphone', nama: 'Handphone' }, { id: 'kulkas', nama: 'Kulkas' },
    { id: 'magicCom', nama: 'Magic Com' }, { id: 'mesinCuci', nama: 'Mesin Cuci' }, { id: 'setrika', nama: 'Setrika listrik' },
    { id: 'dispenser', nama: 'Dispenser' }, { id: 'lain', nama: 'Lainnya' },
  ],
  bantuanMaks: 3,
  skor: { min: 32, max: 155 },
  hasil: [
    { min: 32, max: 63, label: 'Belum Layak dibantu' },
    { min: 64, max: 88, label: 'Layak dibantu' },
    { min: 89, max: 155, label: 'Sangat Layak dibantu' },
  ],
};
BENTUK.bagian.forEach((bagian) => { bagian.pertanyaan = bagian.pertanyaan.map(([id, nama, opsi], i) => ({ id, nama, nomor: BENTUK.bagian.slice(0, BENTUK.bagian.indexOf(bagian)).reduce((n, x) => n + x.pertanyaan.length, 0) + i + 1, opsi: opsi.map(([label, skor], j) => ({ id: 'o' + (j + 1), label, skor })) })); });
BENTUK.pertanyaan = BENTUK.bagian.flatMap((bagian) => bagian.pertanyaan);
const indeksTanya = new Map(BENTUK.pertanyaan.map((q) => [q.id, q]));
function teks(v, maks) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, maks); }
function objek(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function hasilDari(skor) { return BENTUK.hasil.find((x) => skor >= x.min && skor <= x.max).label; }
function normalisasi(data, oleh) {
  data = objek(data);
  if (data.jenis !== 'survei-mustahik') throw new GalatSurat('Pilih Survei Calon Mustahik.');
  const mustahik = teks(data.mustahik, 160);
  if (!mustahik) throw new GalatSurat('Nama mustahik wajib diisi.');
  const tujuan = teks(data.tujuan, 240);
  if (!tujuan) throw new GalatSurat('Tujuan atau kebutuhan asesmen wajib diisi.');
  const tanggal = teks(data.tanggal, 10) || hariIni();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || isNaN(new Date(tanggal + 'T00:00:00Z').getTime()) || new Date(tanggal + 'T00:00:00Z').toISOString().slice(0, 10) !== tanggal) throw new GalatSurat('Tanggal survei tidak sah.');
  const sumber = objek(data.jawaban), jawaban = {};
  if (Object.keys(sumber).length !== indeksTanya.size) throw new GalatSurat('Jawab seluruh ' + indeksTanya.size + ' pertanyaan penilaian.');
  let skor = 0;
  for (const q of BENTUK.pertanyaan) {
    const opsi = q.opsi.find((o) => o.id === teks(sumber[q.id], 12));
    if (!opsi) throw new GalatSurat('Pilih jawaban untuk: ' + q.nama + '.');
    jawaban[q.id] = opsi.id; skor += opsi.skor;
  }
  if (skor < BENTUK.skor.min || skor > BENTUK.skor.max) throw new GalatSurat('Total skor di luar rentang formulir.');
  const elektronik = BENTUK.barang.map((b) => {
    const x = objek((Array.isArray(data.elektronik) ? data.elektronik : []).find((a) => a.id === b.id));
    return { id: b.id, nama: b.id === 'lain' ? teks(x.nama, 80) : b.nama, jumlah: Math.min(999, Math.max(0, Math.floor(Number(x.jumlah) || 0))), status: ['Milik sendiri', 'Pemberian', 'Pinjam'].includes(x.status) ? x.status : '' };
  }).filter((x) => x.jumlah || x.status || (x.id === 'lain' && x.nama));
  const bantuanLain = (Array.isArray(data.bantuanLain) ? data.bantuanLain : []).slice(0, BENTUK.bantuanMaks).map((x) => ({ sumber: teks(objek(x).sumber, 120), nominal: Math.min(999999999999, Math.max(0, Number(objek(x).nominal) || 0)) })).filter((x) => x.sumber || x.nominal);
  const now = new Date().toISOString();
  const id = /^am_[a-f0-9]{32}$/.test(String(data.id || '')) ? String(data.id) : 'am_' + crypto.randomBytes(16).toString('hex');
  return { id, jenis: 'survei-mustahik', formulir: BENTUK.kode, tujuan, tanggal, petugas: teks(oleh.nama, 120), mustahik,
    alamat: teks(data.alamat, 500), jawaban, skor, hasil: hasilDari(skor), elektronik, bantuanLain, catatan: teks(data.catatan, 2000), olehId: oleh.id, olehNama: teks(oleh.nama, 120), dibuat: now, diubah: now };
}
async function simpan(data, oleh) {
  const a = normalisasi(data, oleh);
  const lama = await db.ambil('asesmen-mustahik:' + a.id);
  if (lama && lama.olehId !== oleh.id && oleh.peran !== 'superadmin') throw new GalatSurat('Asesmen ini dicatat admin lain.', 403);
  if (lama) a.dibuat = lama.dibuat;
  await db.simpan('asesmen-mustahik:' + a.id, a);
  await db.tambahKeHimpunan('asesmen-mustahik:daftar', a.id);
  return a;
}
async function daftar() {
  const ids = (await db.anggotaHimpunan('asesmen-mustahik:daftar')).sort().reverse();
  const isi = await db.ambilBanyak(ids.map((id) => 'asesmen-mustahik:' + id));
  return isi.filter((x) => x && x.jenis === 'survei-mustahik').sort((a, b) => String(b.diubah).localeCompare(String(a.diubah)));
}
module.exports = { BENTUK, normalisasi, hasilDari, simpan, daftar };

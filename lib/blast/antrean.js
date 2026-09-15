// lib/antrean.js — antrean pesan yang bertahan 24/7
//
// Antrean disimpan di Redis, bukan di memori proses, sehingga tidak hilang
// saat fungsi serverless mati atau aplikasi di-deploy ulang. Pemrosesan
// dipecah kecil dan dipanggil berulang oleh Vercel Cron (/api/cron/antrean)
// supaya tidak pernah menabrak batas waktu fungsi.

const db = require('./db');
const { id, sekarang, waktuLokal, acakAntara, normalkanNomor } = require('./util');
const { ambilSetelan } = require('./setelan');
const { pilihDriver } = require('./pengirim');
const { kirimKejadian } = require('./webhook');

const KUNCI_ANTREAN = 'antrean';
const KUNCI_PESAN = (i) => `pesan:${i}`;
const KUNCI_PERANGKAT = (i) => `perangkat:${i}`;

/* Pesan yang sudah diserahkan ke pengirim luar (gateway sendiri) tetapi belum
   dilaporkan hasilnya. Mereka sudah keluar dari antrean, jadi tidak ada lagi
   yang mencobanya — himpunan ini yang membuat mereka tetap terlihat. */
const KUNCI_SERAHAN = 'agen:serahan';
const SERAHAN_KEDALUWARSA_MS = 15 * 60 * 1000;

// --- Memasukkan pesan ke antrean -------------------------------------------
async function antrikan(data) {
  const nomor = normalkanNomor(data.nomor);
  if (!nomor) throw new Error('Nomor tujuan tidak sah');

  // Kunci idempoten: satu donatur tidak menerima pesan kembar dari
  // kampanye yang sama walau tombol kirim tertekan dua kali.
  if (data.kunciIdempoten) {
    const adaId = await db.ambil(`idem:${data.kunciIdempoten}`);
    if (adaId) return db.ambil(KUNCI_PESAN(adaId));
  }

  const pesan = {
    id: id('m_'),
    perangkatId: data.perangkatId,
    nomor,
    nama: data.nama || '',
    kontakId: data.kontakId || null,
    isi: {
      teks: data.isi && data.isi.teks ? String(data.isi.teks) : '',
      berkasUrl: (data.isi && data.isi.berkasUrl) || '',
      namaBerkas: (data.isi && data.isi.namaBerkas) || '',
      jenisMedia: (data.isi && data.isi.jenisMedia) || '',
      template: (data.isi && data.isi.template) || '',
    },
    arah: 'keluar',
    status: 'antre',
    prioritas: Number.isFinite(data.prioritas) ? data.prioritas : 5, // 0 = paling didahulukan
    jadwal: data.jadwal || sekarang(),
    massalId: data.massalId || null,
    kunciIdempoten: data.kunciIdempoten || null,
    percobaan: 0,
    galatTerakhir: '',
    oleh: data.oleh || null,
    dibuat: sekarang(),
  };

  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
  await db.tambahKeHimpunan(KUNCI_ANTREAN, pesan.id);
  await catatKeDaftar(pesan.id);
  if (pesan.kunciIdempoten) {
    await db.simpan(`idem:${pesan.kunciIdempoten}`, pesan.id, { detik: 60 * 60 * 24 * 7 });
  }
  return pesan;
}

// Daftar pesan terbaru untuk tampilan (dibatasi supaya ringan)
async function catatKeDaftar(pesanId) {
  const daftar = (await db.ambil('pesan:baru')) || [];
  daftar.unshift(pesanId);
  await db.simpan('pesan:baru', daftar.slice(0, 2000));
}

// --- Aturan boleh kirim atau tidak -----------------------------------------
function dalamJamKirim(setelan) {
  if (!setelan.kirim.hormatiJamKirim) return true;
  const { jam } = waktuLokal();
  return jam >= setelan.kirim.jamMulai && jam < setelan.kirim.jamSelesai;
}

async function hitungHarian(perangkatId) {
  const { tanggal } = waktuLokal();
  return Number((await db.ambil(`hitung:${perangkatId}:${tanggal}`)) || 0);
}

async function naikkanHarian(perangkatId) {
  const { tanggal } = waktuLokal();
  const kunci = `hitung:${perangkatId}:${tanggal}`;
  const nilai = Number((await db.ambil(kunci)) || 0) + 1;
  await db.simpan(kunci, nilai, { detik: 60 * 60 * 48 });
  return nilai;
}

// --- Satu putaran pemrosesan ------------------------------------------------
async function prosesAntrean(batasWaktuMs = 20000) {
  const mulai = Date.now();
  const setelan = await ambilSetelan();
  const laporan = { diproses: 0, terkirim: 0, diserahkan: 0, gagal: 0, ditunda: 0, alasan: [] };

  if (!dalamJamKirim(setelan)) {
    laporan.alasan.push(
      `Di luar jam kirim (${setelan.kirim.jamMulai}:00–${setelan.kirim.jamSelesai}:00 WIB)`);
    return laporan;
  }

  laporan.dipulihkan = await pulihkanSerahanMandek(setelan);

  const idAntre = await db.anggotaHimpunan(KUNCI_ANTREAN);
  if (!idAntre.length) return laporan;

  const pesanSemua = (await db.ambilBanyak(idAntre.map(KUNCI_PESAN))).filter(Boolean);
  const sekarangMs = Date.now();

  const siap = pesanSemua
    .filter((p) => p.status === 'antre' && new Date(p.jadwal).getTime() <= sekarangMs)
    .sort((a, b) => (a.prioritas - b.prioritas) || (new Date(a.jadwal) - new Date(b.jadwal)));

  // Buang pesan yatim (dokumennya hilang) dari antrean
  const idHidup = new Set(pesanSemua.map((p) => p.id));
  const yatim = idAntre.filter((i) => !idHidup.has(i));
  if (yatim.length) await db.keluarDariHimpunan(KUNCI_ANTREAN, ...yatim);

  const cachePerangkat = new Map();
  let terproses = 0;

  for (const pesan of siap) {
    if (terproses >= setelan.kirim.kirimPerPutaran) break;
    if (Date.now() - mulai > batasWaktuMs) { laporan.alasan.push('Batas waktu putaran tercapai'); break; }

    let perangkat = cachePerangkat.get(pesan.perangkatId);
    if (!perangkat) {
      perangkat = await db.ambil(KUNCI_PERANGKAT(pesan.perangkatId));
      if (perangkat) cachePerangkat.set(pesan.perangkatId, perangkat);
    }

    if (!perangkat) {
      await tandaiGagal(pesan, 'Perangkat pengirim tidak ditemukan', setelan, true);
      laporan.gagal++;
      continue;
    }
    if (perangkat.status === 'terputus' || perangkat.aktif === false) {
      laporan.ditunda++;
      continue; // tunggu perangkat pulih, pesan tetap di antrean
    }

    // Jeda acak antar pesan per perangkat
    if (perangkat.bolehKirimSetelah && Date.now() < perangkat.bolehKirimSetelah) {
      laporan.ditunda++;
      continue;
    }

    // Batas harian per perangkat
    const terpakai = await hitungHarian(perangkat.id);
    if (terpakai >= setelan.kirim.batasHarianPerangkat) {
      laporan.ditunda++;
      laporan.alasan.push(`Perangkat ${perangkat.nama} sudah mencapai batas harian`);
      continue;
    }

    terproses++;
    laporan.diproses++;

    const driver = pilihDriver(setelan, perangkat);
    try {
      const hasil = await driver.kirim({ pesanId: pesan.id, nomor: pesan.nomor, isi: pesan.isi, perangkat, setelan });

      /* Driver yang mengerjakan pengiriman di tempat lain — gateway sendiri —
         baru MENYERAHKAN pesan, belum mengirimnya. Menyebutnya 'terkirim' di
         sini akan membuat laporan menyatakan satu kampanye sukses seluruhnya
         padahal belum satu pun sampai. Yang berhak menaikkannya jadi 'terkirim'
         adalah laporan gateway lewat /api/blast-agen. */
      const diserahkan = hasil.status === 'diserahkan';
      pesan.status = diserahkan ? 'diserahkan' : 'terkirim';
      pesan.idLuar = hasil.idLuar || '';
      pesan.galatTerakhir = '';
      if (diserahkan) pesan.diserahkanPada = sekarang();
      else pesan.dikirim = sekarang();
      await db.simpan(KUNCI_PESAN(pesan.id), pesan);
      await db.keluarDariHimpunan(KUNCI_ANTREAN, pesan.id);
      await naikkanHarian(perangkat.id);
      if (diserahkan) {
        await db.tambahKeHimpunan(KUNCI_SERAHAN, pesan.id);
        laporan.diserahkan++;
      } else {
        await kirimKejadian('terkirim', pesan);
        laporan.terkirim++;
      }

      // Sandbox: simulasikan status lanjutan supaya webhook & laporan teruji
      if (driver.nama === 'sandbox') {
        setTimeout(() => simulasikanStatusLanjut(pesan.id).catch(() => {}), 50);
      }
    } catch (e) {
      const sementara = e.sementara !== false;
      await tandaiGagal(pesan, e.message, setelan, !sementara);
      laporan.gagal++;
    }

    // Pasang jeda acak berikutnya untuk perangkat ini
    const jeda = acakAntara(setelan.kirim.jedaMinDetik, setelan.kirim.jedaMaksDetik);
    perangkat.bolehKirimSetelah = Date.now() + jeda * 1000;
    perangkat.kirimTerakhir = sekarang();
    await db.simpan(KUNCI_PERANGKAT(perangkat.id), perangkat);
  }

  laporan.sisaAntrean = await db.jumlahHimpunan(KUNCI_ANTREAN);
  return laporan;
}

/* Gateway menarik pesan lalu mati sebelum melapor. Tanpa penyapu ini pesannya
   menggantung selamanya: statusnya 'diserahkan', tetapi ia sudah keluar dari
   antrean sehingga tidak ada satu pun putaran yang menyentuhnya lagi. */
async function pulihkanSerahanMandek(setelan) {
  const ids = await db.anggotaHimpunan(KUNCI_SERAHAN);
  if (!ids.length) return 0;

  const isi = (await db.ambilBanyak(ids.map(KUNCI_PESAN))).filter(Boolean);
  const hidup = new Set(isi.map((p) => p.id));
  const yatim = ids.filter((i) => !hidup.has(i));
  if (yatim.length) await db.keluarDariHimpunan(KUNCI_SERAHAN, ...yatim);

  let pulih = 0;
  for (const pesan of isi) {
    if (pesan.status !== 'diserahkan') {
      // sudah dilaporkan gateway (terkirim atau gagal) — tidak perlu dijaga lagi
      await db.keluarDariHimpunan(KUNCI_SERAHAN, pesan.id);
      continue;
    }
    const umur = Date.now() - new Date(pesan.diserahkanPada || pesan.dibuat).getTime();
    if (umur < SERAHAN_KEDALUWARSA_MS) continue;

    await db.keluarDariHimpunan(KUNCI_SERAHAN, pesan.id);
    if (pesan.perangkatId) await db.keluarDariHimpunan(`agen:keluar:${pesan.perangkatId}`, pesan.id);

    /* Dihitung sebagai satu percobaan. Kalau gateway-nya rusak dan tidak pernah
       melapor, pesan akan menyerah seperti kegagalan lain, bukan berputar
       selamanya antara antre dan diserahkan. */
    pesan.percobaan = (pesan.percobaan || 0) + 1;
    if (pesan.percobaan >= setelan.kirim.percobaanMaks) {
      pesan.status = 'gagal';
      pesan.gagalPada = sekarang();
      pesan.galatTerakhir = 'Gateway menarik pesan ini tetapi tidak pernah melaporkan hasilnya';
      await db.simpan(KUNCI_PESAN(pesan.id), pesan);
      await db.tambahKeHimpunan('pesan:gagal', pesan.id);
      await kirimKejadian('gagal', pesan);
      continue;
    }
    pesan.status = 'antre';
    pesan.jadwal = sekarang();
    pesan.galatTerakhir = 'Gateway tidak melapor, pesan dicoba lagi';
    await db.simpan(KUNCI_PESAN(pesan.id), pesan);
    await db.tambahKeHimpunan(KUNCI_ANTREAN, pesan.id);
    pulih++;
  }
  return pulih;
}

async function tandaiGagal(pesan, alasan, setelan, menyerah = false) {
  pesan.percobaan = (pesan.percobaan || 0) + 1;
  pesan.galatTerakhir = String(alasan || '').slice(0, 300);

  if (menyerah || pesan.percobaan >= setelan.kirim.percobaanMaks) {
    pesan.status = 'gagal';
    pesan.gagalPada = sekarang();
    await db.simpan(KUNCI_PESAN(pesan.id), pesan);
    await db.keluarDariHimpunan(KUNCI_ANTREAN, pesan.id);
    await db.tambahKeHimpunan('pesan:gagal', pesan.id); // kotak surat mati
    await kirimKejadian('gagal', pesan);
    return;
  }

  // Coba ulang dengan jeda menaik: 1, 2, 4, 8 menit ...
  const tundaMenit = Math.pow(2, pesan.percobaan - 1);
  pesan.jadwal = new Date(Date.now() + tundaMenit * 60 * 1000).toISOString();
  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
}

// Sandbox saja: pesan terkirim -> sampai -> dibaca
async function simulasikanStatusLanjut(pesanId) {
  const pesan = await db.ambil(KUNCI_PESAN(pesanId));
  if (!pesan || pesan.status !== 'terkirim') return;
  pesan.status = 'sampai';
  pesan.sampai = sekarang();
  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
  await kirimKejadian('sampai', pesan);
  if (acakAntara(1, 100) <= 70) {
    pesan.status = 'dibaca';
    pesan.dibaca = sekarang();
    await db.simpan(KUNCI_PESAN(pesan.id), pesan);
    await kirimKejadian('dibaca', pesan);
  }
}

// --- Tindakan pengelolaan antrean ------------------------------------------
async function batalkan(pesanId) {
  const pesan = await db.ambil(KUNCI_PESAN(pesanId));
  if (!pesan) throw new Error('Pesan tidak ditemukan');
  if (pesan.status !== 'antre') throw new Error('Hanya pesan yang masih antre dapat dibatalkan');
  pesan.status = 'dibatalkan';
  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
  await db.keluarDariHimpunan(KUNCI_ANTREAN, pesan.id);
  return pesan;
}

async function ulangi(pesanId) {
  const pesan = await db.ambil(KUNCI_PESAN(pesanId));
  if (!pesan) throw new Error('Pesan tidak ditemukan');
  if (!['gagal', 'dibatalkan'].includes(pesan.status)) {
    throw new Error('Hanya pesan gagal atau dibatalkan yang dapat diulang');
  }
  pesan.status = 'antre';
  pesan.percobaan = 0;
  pesan.galatTerakhir = '';
  pesan.jadwal = sekarang();
  await db.simpan(KUNCI_PESAN(pesan.id), pesan);
  await db.tambahKeHimpunan(KUNCI_ANTREAN, pesan.id);
  await db.keluarDariHimpunan('pesan:gagal', pesan.id);
  return pesan;
}

async function ringkasAntrean() {
  const idAntre = await db.anggotaHimpunan(KUNCI_ANTREAN);
  const gagal = await db.jumlahHimpunan('pesan:gagal');
  const setelan = await ambilSetelan();
  return {
    antre: idAntre.length,
    gagal,
    dalamJamKirim: dalamJamKirim(setelan),
    jamKirim: `${String(setelan.kirim.jamMulai).padStart(2, '0')}:00–${String(setelan.kirim.jamSelesai).padStart(2, '0')}:00 WIB`,
  };
}

module.exports = {
  antrikan, prosesAntrean, batalkan, ulangi, ringkasAntrean,
  hitungHarian, dalamJamKirim, KUNCI_PESAN, KUNCI_ANTREAN, KUNCI_SERAHAN,
  catatKeDaftar, pulihkanSerahanMandek, SERAHAN_KEDALUWARSA_MS,
};

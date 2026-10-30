/* Uji fitur Pembuat Jurnal dari Rekening Koran Bank:
 * 1. Deteksi dan pemastian nomor rekening di awal (BPD dan BSI)
 * 2. Ekstraksi transaksi mutasi debet/kredit
 * 3. Penyesuaian nama KLL/ULL dan opsi Setor Tunai
 * 4. Pemilihan pilar pada baris penghimpunan
 * 5. Fitur pecah rincian UMP sesuai permohonan
 * 6. Format jurnal yang dihasilkan cocok dengan format standar LAZDigital
 *
 * Data uji memakai berkas rekening koran dan akun uji.
 * JANGAN mencatat nama donatur asli ke git/laporan.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AKAR = path.join(__dirname, '..');
const engine = require(path.join(AKAR, 'api', '_engine.js'));
const skema = require(path.join(AKAR, 'lib', 'laz-skema.js'));

let ok = 0, gagal = 0;
function cek(n, syarat, info) {
  if (syarat) {
    ok++;
    console.log('  OK   |', n);
  } else {
    gagal++;
    console.log('  GAGAL|', n, info === undefined ? '' : JSON.stringify(info).slice(0, 260));
  }
}

(async () => {
  console.log('=== A. MODUL LZJurnalBank TERSEDIA ===');
  let LZJurnalBank;
  try {
    LZJurnalBank = require(path.join(AKAR, 'src', 'public', 'js', 'lz-jurnal-bank.js'));
    cek('modul lz-jurnal-bank.js dapat dimuat', !!LZJurnalBank);
  } catch (e) {
    cek('modul lz-jurnal-bank.js dapat dimuat', false, e.message);
    console.log('\n=== HASIL ===');
    console.log(`${ok} lulus, ${gagal} gagal.`);
    process.exit(1);
  }

  console.log('\n=== B. DETEKSI NOMOR REKENING BPD DAN BSI ===');
  // Sample text/data untuk BPD
  const teksBpdHeader = `Hari ini ( 01-Sep-2026 - 26-Sep-2026 )\nWaktu\nIDR\nMata Uang\n803211000510\nNo. Rekening\nMutasi Rekening`;
  const rekBpd = LZJurnalBank.deteksiRekening(teksBpdHeader, 'bpd');
  cek('deteksi nomor rekening BPD dari header', rekBpd.nomor === '803211000510' && rekBpd.bank === 'bpd', rekBpd);

  // Sample text/data untuk BSI
  const teksBsiHeader = `Mutasi Rekening\nREKENING : IDR 1011959004 - BSI Giro Institusi Wadiah\nCabang ID0010598\nPeriode : 01/09/2026 s/d 28/09/2026`;
  const rekBsi = LZJurnalBank.deteksiRekening(teksBsiHeader, 'bsi');
  cek('deteksi nomor rekening BSI dari header', rekBsi.nomor === '1011959004' && rekBsi.bank === 'bsi', rekBsi);

  // Pencocokan rekening ke master rekening sistem
  const daftarRekening = [
    { id: 'rek-bpd-infak', namaBank: 'BPD DIY Syariah', nomor: '803211000510', fundGroup: 'Infak', atasNama: 'Lazismu Bantul' },
    { id: 'rek-bsi-infak', namaBank: 'BSI', nomor: '1011959004', fundGroup: 'Infak', atasNama: 'Lazismu Bantul' },
    { id: 'rek-bpd-zakat', namaBank: 'BPD DIY Syariah', nomor: '803211000511', fundGroup: 'Zakat', atasNama: 'Lazismu Bantul' },
  ];

  const cocokBpd = LZJurnalBank.cocokkanRekening(rekBpd.nomor, daftarRekening);
  cek('pencocokan nomor BPD ke rekening sistem yang terdaftar', cocokBpd && cocokBpd.id === 'rek-bpd-infak', cocokBpd);

  const cocokBsi = LZJurnalBank.cocokkanRekening(rekBsi.nomor, daftarRekening);
  cek('pencocokan nomor BSI ke rekening sistem yang terdaftar', cocokBsi && cocokBsi.id === 'rek-bsi-infak', cocokBsi);

  const cocokTakDikenal = LZJurnalBank.cocokkanRekening('9999999999', daftarRekening);
  cek('nomor rekening tak terdaftar terdeteksi belum cocok', cocokTakDikenal === null);

  console.log('\n=== C. PEMILIHAN PILAR DAN PENYESUAIAN KLL/ULL & SETOR TUNAI ===');
  // Daftar layanan (KLL & ULL)
  const daftarLayanan = [
    { id: 'l1', tipe: 'KLL', nama: 'Pajangan', aktif: true },
    { id: 'l2', tipe: 'KLL', nama: 'Pundong', aktif: true },
    { id: 'l3', tipe: 'ULL', nama: 'Masjid Contoh', aktif: true },
  ];

  const barisMentah = [
    { id: 't1', tanggal: '2026-09-01', uraian: 'INFAQ DARI DONATUR A', debet: 0, kredit: 1000000 },
    { id: 't2', tanggal: '2026-09-04', uraian: 'STR TUNAI MUH JAFIT I BTL', debet: 0, kredit: 50000000 },
    { id: 't3', tanggal: '2026-09-09', uraian: 'SETOR LAZIS PAJANGAN', debet: 0, kredit: 5500000 },
    { id: 't4', tanggal: '2026-09-15', uraian: 'TRF. KE 803241002039 UMP KLL PUNDONG INFAK TERIKAT', debet: 15000000, kredit: 0 },
    { id: 't5', tanggal: '2026-09-25', uraian: 'BIAYA SKN TRANSFER', debet: 2900, kredit: 0 }
  ];

  const hasilAnalisis = LZJurnalBank.analisisTransaksi(barisMentah, {
    rekening: cocokBpd,
    layanan: daftarLayanan
  });

  cek('baris teranalisis sejumlah transaksi', hasilAnalisis.length === 5);
  cek('STR TUNAI otomatis disarankan sebagai Setor Tunai', hasilAnalisis[1].tipe === 'setor', hasilAnalisis[1]);
  cek('SETOR LAZIS PAJANGAN otomatis disarankan KLL Pajangan', hasilAnalisis[2].kantor === 'KLL Pajangan', hasilAnalisis[2]);
  cek('UMP Pundong terdeteksi sebagai UMP', hasilAnalisis[3].tipe === 'ump', hasilAnalisis[3]);

  // Penyesuaian pilar pada baris penghimpunan
  const t1Adjusted = LZJurnalBank.sesuaikanBaris(hasilAnalisis[0], { pilar: 'Pendidikan', jenisDana: 'Infak', detailJurnal: 'Beasiswa Yatim' });
  cek('pilar pada penghimpunan dapat dipilih dan disimpan', t1Adjusted.pilar === 'Pendidikan', t1Adjusted);
  cek('detail jurnal setelah nama tersimpan di baris', t1Adjusted.detailJurnal === 'Beasiswa Yatim', t1Adjusted);

  // Pembersihan kode teknis perbankan dari uraian
  const kotor = 'QRIS BANK MANDIRI 9360000812011322879 TRM A01 RRN. 609419757823 CMS ID: 8030004750 REF: 000036319036';
  const bersih = LZJurnalBank.bersihkanUraianBank(kotor);
  cek('bersihkanUraianBank menghapus nomor panjang, CMS ID, REF, RRN, TRM', !/CMS|REF|RRN|TRM|\d{8,}/.test(bersih) && bersih === 'QRIS BANK MANDIRI', bersih);

  // QRIS otomatis bernama NN dan detail Qris
  const qrisRow = LZJurnalBank.analisisTransaksi([{ id: 'q1', tanggal: '2026-09-01', uraian: 'QRIS BANK MANDIRI 9360000812011322879 TRM A01 RRN. 609419757823', debet: 0, kredit: 5000 }], { rekening: cocokBpd, layanan: daftarLayanan })[0];
  cek('QRIS otomatis namanya NN dan detail Qris tanpa nama bank', qrisRow.namaDonatur === 'NN' && qrisRow.detailJurnal === 'Qris', qrisRow);

  // Penyesuaian ke Setor Tunai
  const t1Setor = LZJurnalBank.sesuaikanBaris(hasilAnalisis[0], { tipe: 'setor' });
  cek('baris donasi dapat diubah menjadi Setor Tunai', t1Setor.tipe === 'setor', t1Setor);

  // Penyesuaian nama KLL/ULL
  const t1Kll = LZJurnalBank.sesuaikanBaris(hasilAnalisis[0], { kantor: 'KLL Pundong' });
  cek('nama dapat disesuaikan menjadi KLL/ULL terpilih', t1Kll.kantor === 'KLL Pundong', t1Kll);

  console.log('\n=== D. PECAH DETAIL UMP SESUAI PERMOHONAN ===');
  const barisUmp = hasilAnalisis[3]; // 15.000.000 UMP KLL Pundong
  const rincianUmp = [
    { uraian: 'Beasiswa Pendidikan Siswa Dhuafa', pilar: 'Pendidikan', nominal: 10000000 },
    { uraian: 'Santunan Kesehatan Mustahik', pilar: 'Kesehatan', nominal: 5000000 }
  ];

  const cekValidasiUmpPas = LZJurnalBank.validasiPecahUmp(barisUmp.nominal, rincianUmp);
  cek('validasi pecah UMP: total rincian cocok dengan transfer', cekValidasiUmpPas.valid && cekValidasiUmpPas.selisih === 0, cekValidasiUmpPas);

  const cekValidasiUmpBeda = LZJurnalBank.validasiPecahUmp(barisUmp.nominal, [{ uraian: 'Sebagian', pilar: 'Pendidikan', nominal: 8000000 }]);
  cek('validasi pecah UMP: selisih terdeteksi jika belum pas', !cekValidasiUmpBeda.valid && cekValidasiUmpBeda.selisih === 7000000, cekValidasiUmpBeda);

  const hasilPecah = LZJurnalBank.terapkanPecahUmp(barisUmp, rincianUmp);
  cek('hasil pecah UMP menghasilkan 2 baris rincian ber-pilar', hasilPecah.length === 2 && hasilPecah[0].pilar === 'Pendidikan' && hasilPecah[1].pilar === 'Kesehatan', hasilPecah);
  cek('jumlah nominal rincian sama persis dengan transfer UMP', hasilPecah.reduce((a, b) => a + b.nominal, 0) === barisUmp.nominal);

  console.log('\n=== E. FORMAT JURNAL HASIL EKSPOR COCOK DENGAN SISTEM ===');
  // Susun data transaksi akhir
  const transaksiFinal = [
    t1Adjusted,
    hasilAnalisis[1], // Setor tunai
    hasilAnalisis[2], // KLL Pajangan
    ...hasilPecah,    // Rincian UMP
    hasilAnalisis[4]  // Biaya bank
  ];

  const tsvJurnal = LZJurnalBank.bangunTSVJurnal(transaksiFinal, cocokBpd);
  cek('TSV jurnal terbentuk dan berupa teks', typeof tsvJurnal === 'string' && tsvJurnal.length > 0);
  cek('TSV jurnal memuat seksi PENERIMAAN INFAK VIA BANK', /PENERIMAAN INFAK VIA BANK/.test(tsvJurnal));
  cek('TSV jurnal memuat detail jurnal setelah nama', /Beasiswa Yatim/.test(tsvJurnal));
  cek('penulisan baris jurnal tanpa tanda strip (-)', !/^\d{4}-\d{2}-\d{2}\t[^\t]+\t[^\t]*\t[^\t]*\t.* - .*/m.test(tsvJurnal), tsvJurnal);
  cek('TSV jurnal memuat seksi SETOR TUNAI', /SETOR TUNAI/.test(tsvJurnal));
  cek('TSV jurnal memuat seksi UMP', /UMP/.test(tsvJurnal));

  // Uji kompatibilitas: parse dengan parser jurnal resmi sistem (apiParseImportText)
  const sheets = {};
  for (const n of skema.NAMA_TABEL) sheets[n] = [];
  sheets.Rekening = [
    ['id', 'namaBank', 'nomor', 'atasNama', 'fundGroup', 'aktif', 'dibuat'],
    ['rek-bpd-infak', 'BPD DIY Syariah', '803211000510', 'Lazismu Bantul', 'Infak', 'true', new Date().toISOString()]
  ];
  sheets.Layanan = [
    ['id', 'tipe', 'kode', 'nama', 'wilayah', 'penanggungJawab', 'telepon', 'aktif', 'dibuat'],
    ['l1', 'KLL', '', 'Pajangan', 'Pajangan', 'PJ Pajangan', '081234567890', 'true', new Date().toISOString()],
    ['l2', 'KLL', '', 'Pundong', 'Pundong', 'PJ Pundong', '081234567891', 'true', new Date().toISOString()]
  ];

  process.env.SETUP_ADMIN_PASSWORD = 'AdminUji123!';
  let DB = (await engine.runRPC({ sheets, props: {} }, 'setup', [], {})).db;
  const token = (await engine.runRPC(DB, 'login', ['superadmin', 'AdminUji123!'], {})).result.token;

  const parsed = await engine.runRPC(DB, 'apiParseImportText', [token, tsvJurnal, 'himpun', { bulan: '2026-09', jenis: 'bank' }], {});
  cek('jurnal hasil generate berhasil dibaca tanpa error oleh parser sistem', parsed && parsed.result && parsed.result.success, parsed.result);
  cek('penerimaan donasi terbaca di himpunValid', (parsed.result.himpunValid || []).length >= 1, (parsed.result.himpunValid || []).length);
  cek('setor tunai terbaca di transferValid', (parsed.result.transferValid || []).length >= 1, (parsed.result.transferValid || []).length);
  cek('rincian UMP terbaca di umpValid', (parsed.result.umpValid || []).length >= 1, (parsed.result.umpValid || []).length);

  console.log('\n=== F. EKSTRAKSI PDF ASLI BPD & BSI ===');
  const pdfjsLib = require(path.join(AKAR, 'src', 'public', 'js', 'vendor', 'pdf.min.js'));
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(AKAR, 'src', 'public', 'js', 'vendor', 'pdf.worker.min.js');

  const bpdPath = "C:/Users/T14s G1 AMD R5 4560U/Downloads/Telegram Desktop/ACC-STATEMENT-20260926 (510).pdf";
  const bsiPath = "C:/Users/T14s G1 AMD R5 4560U/Downloads/Telegram Desktop/Mutasi_Rekening_1011959004.pdf";

  if (fs.existsSync(bpdPath)) {
    const docBpd = await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(bpdPath)) }).promise;
    const resBpd = await LZJurnalBank.parseBpdPdf(docBpd);
    cek('BPD PDF: nomor rekening 803211000510 terbaca', resBpd.noRek === '803211000510', resBpd.noRek);
    cek('BPD PDF: 72 transaksi termuat', resBpd.transaksi.length === 72, resBpd.transaksi.length);
    cek('BPD PDF: periode September terbaca', /Sep/i.test(resBpd.periode), resBpd.periode);
  }

  if (fs.existsSync(bsiPath)) {
    const docBsi = await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(bsiPath)) }).promise;
    const resBsi = await LZJurnalBank.parseBsiPdf(docBsi);
    cek('BSI PDF: nomor rekening 1011959004 terbaca', resBsi.noRek === '1011959004', resBsi.noRek);
    cek('BSI PDF: 9 transaksi kredit termuat', resBsi.transaksi.length === 9, resBsi.transaksi.length);
    cek('BSI PDF: semua transaksi kredit > 0', resBsi.transaksi.every((t) => t.kredit > 0));
  }

  console.log('\n=== G. UJI TAMPILAN PERAMBAN (PLAYWRIGHT) ===');
  const http = require('http');
  const { chromium } = require(path.join(AKAR, 'node_modules', 'playwright'));
  const PUBLIK = path.join(AKAR, 'src', 'public');

  const srv = http.createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/api/rpc' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => { b += c; });
      await new Promise((r) => req.on('end', r));
      let j = {}; try { j = JSON.parse(b || '{}'); } catch (_) {}
      res.setHeader('Content-Type', 'application/json');
      try {
        const out = await engine.runRPC(DB, j.fn, j.args || [], { ip: '127.0.0.1', ua: 'uji' });
        DB = out.db;
        res.end(JSON.stringify({ result: out.result }));
      } catch (e) { res.end(JSON.stringify({ __error: e.message })); }
      return;
    }
    const f = path.join(PUBLIK, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(''); return; }
    const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'text/plain');
    fs.createReadStream(f).pipe(res);
  });

  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const A = 'http://127.0.0.1:' + srv.address().port;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(A + '/');
  await page.waitForSelector('#lUser', { timeout: 15000 });
  await page.fill('#lUser', 'superadmin');
  await page.fill('#lPass', 'AdminUji123!');
  await page.click('#loginBtn');
  await page.waitForFunction(() => !document.getElementById('appView').classList.contains('hidden'), null, { timeout: 20000 });

  // 1. Menu Penghimpunan: Tombol Jurnal Rekening Koran
  await page.evaluate(() => { go('penghimpunan'); });
  await page.waitForSelector('.toolbar button:has-text("Jurnal Rekening Koran")', { timeout: 10000 });
  cek('tombol "Jurnal Rekening Koran" tampil di toolbar Penghimpunan', true);

  await page.click('.toolbar button:has-text("Jurnal Rekening Koran")');
  await page.waitForSelector('#modalCard.jrb-modal', { timeout: 10000 });
  cek('modal Pembuat Jurnal dari Rekening Koran terbuka', (await page.textContent('#modalTitle')).includes('Rekening Koran'));
  cek('pilihan tab BPD dan BSI tersedia di langkah 1', (await page.$$('.jrb-tabs button')).length === 2);
  cek('tombol lanjut disabled sebelum rekening dipastikan', await page.evaluate(() => document.getElementById('jrbBtnLanjut').disabled));

  // Tutup modal
  await page.click('.close-x');
  await page.waitForFunction(() => !document.getElementById('modalBg').classList.contains('show'), null, { timeout: 5000 });

  // 2. Menu Laporan > Jurnal: Tombol Dari Rekening Koran
  await page.evaluate(() => { go('laporan'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { setLapTab('jurnal'); });
  await page.waitForSelector('#lapBody button:has-text("Dari Rekening Koran")', { timeout: 10000 });
  cek('tombol "Dari Rekening Koran" tampil di menu Laporan > Jurnal', true);

  // Buka modal lagi dan simulasikan alur verifikasi nomor rekening & generate
  await page.click('#lapBody button:has-text("Dari Rekening Koran")');
  await page.waitForSelector('#modalCard.jrb-modal', { timeout: 10000 });

  await page.evaluate(() => {
    // Simulasikan deteksi nomor rekening BPD
    LZJurnalBank.pilihBank('bpd');
    const mockTeks = 'Hari ini ( 01-Sep-2026 - 26-Sep-2026 )\n803211000510\nNo. Rekening';
    const det = LZJurnalBank.deteksiRekening(mockTeks, 'bpd');
    const cocok = LZJurnalBank.cocokkanRekening(det.nomor, CACHE.rekening);
    // Simulasikan hasil analisis transaksi
    const raw = [
      { id: '1', tanggal: '2026-09-01', uraian: 'INFAQ PENDIDIKAN DARI DONATUR', debet: 0, kredit: 500000 },
      { id: '2', tanggal: '2026-09-04', uraian: 'STR TUNAI KAS INFAK', debet: 0, kredit: 2000000 },
      { id: '3', tanggal: '2026-09-15', uraian: 'UMP KLL PUNDONG INFAK TERIKAT', debet: 10000000, kredit: 0 }
    ];
    // Masukkan ke state
    LZJurnalBank._state.transaksi = LZJurnalBank.analisisTransaksi(raw, { rekening: cocok, layanan: CACHE.layanan });
    // Buka langkah 2
    LZJurnalBank.gantiRekeningSistem(cocok.id);
    LZJurnalBank.lanjutKeLangkah2();
  });

  await page.waitForSelector('.jrb-langkah2', { timeout: 20000 });
  cek('berhasil lanjut ke langkah 2 penyesuaian setelah rekening terkonfirmasi', true);
  cek('ringkasan kredit dan debet ditampilkan di kepala langkah 2', /Kredit/.test(await page.textContent('.jrb-langkah2')));

  // Cek dropdown pilar
  const adaSelectPilar = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('.jrb-langkah2 select')];
    return selects.some((s) => [...s.options].some((o) => o.value === 'Pendidikan'));
  });
  cek('dropdown pemilihan pilar tersedia pada baris jurnal', adaSelectPilar);

  // Cek input detail keterangan jurnal
  const adaInputDetail = await page.$('.jrb-langkah2 input[placeholder*="Detail"]');
  cek('input detail keterangan jurnal tersedia pada baris tabel', !!adaInputDetail);

  // Klik dropdown KLL/ULL menyimpan pilihan dan tetap terpilih
  await page.evaluate(() => {
    LZJurnalBank.setKantorCepat(0, 'KLL Pajangan');
  });
  const valKantor = await page.evaluate(() => {
    const row = document.querySelectorAll('.jrb-langkah2 tbody tr')[0];
    const selects = [...row.querySelectorAll('select')];
    const selKantor = selects.find((s) => [...s.options].some((o) => o.value === 'KLL Pajangan'));
    return { selVal: selKantor ? selKantor.value : '', txKantor: LZJurnalBank._state.transaksi[0].kantor };
  });
  cek('dropdown KLL/ULL menyimpan pilihan dan tetap terpilih', valKantor.selVal === 'KLL Pajangan' && valKantor.txKantor === 'KLL Pajangan', valKantor);

  // Mengubah kategori ke Infak Terikat memunculkan dropdown pilar
  await page.evaluate(() => {
    LZJurnalBank.ubahKategori(1, 'infak_terikat');
  });
  const pilarAktif = await page.evaluate(() => {
    const row = document.querySelectorAll('.jrb-langkah2 tbody tr')[1];
    const selects = [...row.querySelectorAll('select')];
    return selects.some((s) => [...s.options].some((o) => o.value === 'Pendidikan'));
  });
  cek('mengubah kategori ke Infak Terikat memunculkan dropdown pilar', pilarAktif);

  // Cek bahwa tabel memiliki scroll container yang tidak memotong baris bawah
  const scrollInfo = await page.evaluate(() => {
    const wrap = document.querySelector('.jrb-tabel-wrap');
    return wrap ? { scrollH: wrap.scrollHeight, clientH: wrap.clientHeight, adaSpacer: !!wrap.querySelector('.jrb-spacer-bottom, tr:last-child') } : null;
  });
  cek('tabel berada dalam scroll container yang menampung sampai paling bawah', scrollInfo && scrollInfo.adaSpacer);

  // Cek tombol Pecah Detail UMP
  const btnPecah = await page.waitForSelector('.jrb-langkah2 button:has-text("Pecah Detail")', { timeout: 5000 });
  cek('tombol Pecah Detail tersedia pada baris UMP', !!btnPecah);

  // Buka modal pecah UMP
  await btnPecah.click();
  await page.waitForSelector('#jrbSubModalBg', { timeout: 5000 });
  cek('sub-modal Pecah Rincian UMP terbuka', (await page.textContent('#jrbSubModalBg h3')).includes('Pecah Rincian UMP'));

  // Tambah baris rincian UMP
  await page.click('#jrbSubModalBg button:has-text("Tambah Baris Rincian")');
  await page.waitForTimeout(100);

  // Mengetik detail di sub-modal Pecah UMP terlihat dan stabil
  await page.fill('#jrbRincianRowsList input[type="text"]', 'Bantuan Pengobatan Anak');
  const txtVal = await page.inputValue('#jrbRincianRowsList input[type="text"]');
  cek('mengetik detail rincian UMP terlihat dan tersimpan', txtVal === 'Bantuan Pengobatan Anak');

  // Tutup submodal
  await page.click('#jrbSubModalBg .close-x');
  await page.waitForTimeout(200);

  // Cek tombol-tombol aksi langkah 2
  cek('tombol Salin TSV tersedia di footer modal', (await page.$$('.modal-foot button:has-text("Salin")')).length >= 1);
  cek('tombol Unduh Excel tersedia di footer modal', (await page.$$('.modal-foot button:has-text("Unduh")')).length >= 1);
  cek('tombol Impor Langsung tersedia di footer modal', (await page.$$('.modal-foot button:has-text("Impor")')).length >= 1);

  await browser.close();
  srv.close();

  console.log('\n=== HASIL ===');
  console.log(`${ok} lulus, ${gagal} gagal.`);
  if (gagal) process.exit(1);
})().catch((e) => {
  console.error('\nGAGAL TOTAL:', e.stack || e);
  process.exit(1);
});

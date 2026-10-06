/* Penyusun denominasi acak untuk Formulir A2 (rincian uang tunai di lembar serah terima kasir).
 *   LZDenominasi.acak(total, acak?) -> { p100000:n, ..., k1000:n, k500:n, k200:n, k100:n, sisa:n }
 * Aturan (permintaan pemilik, 6 Oktober 2026):
 *  - Selalu pas: jumlah semua pecahan + sisa = total. Sisa hanya muncul bila total bukan kelipatan 100 (tidak ada koin 50).
 *  - Ada ratusan di belakang (mis. 12.700): koin 200 dan/atau 100 ikut dipakai untuk menutup ratusannya.
 *  - Kelipatan 1.000 pas (mis. 12.000): tetap ada koin 500 atau 1.000 (selama total memungkinkan).
 *  - Uang kertas diacak lintas SEMUA nominal (100rb sampai 1rb), tidak melulu 100rb dan 50rb; sesekali ada nominal yang kosong.
 * Parameter kedua (fungsi mirip Math.random) disediakan supaya uji bisa mengulang hasil yang sama. */
(function () {
  'use strict';
  if (window.LZDenominasi) return;
  var KERTAS = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
  var KOIN = [1000, 500, 200, 100];

  function bil(acak, a, b) { return a + Math.floor(acak() * (b - a + 1)); }   /* bilangan bulat a..b */
  function pilih(acak, arr) { return arr[Math.floor(acak() * arr.length)]; }

  /* Pecah 'nilai' (kelipatan 100) menjadi koin acak; 'wajib' = koin yang harus ikut bila muat. */
  function pecahKoin(nilai, wajib, acak) {
    var hasil = { 1000: 0, 500: 0, 200: 0, 100: 0 };
    var sisa = nilai;
    (wajib || []).forEach(function (k) { if (sisa >= k) { hasil[k]++; sisa -= k; } });
    var guard = 0;
    while (sisa > 0 && guard++ < 500) {
      var muat = KOIN.filter(function (k) { return k <= sisa; });
      /* Bobot condong ke koin kecil supaya jumlah koin tidak janggal, tetapi tetap acak. */
      var k = muat[Math.floor(Math.pow(acak(), 0.8) * muat.length)];
      hasil[k]++; sisa -= k;
    }
    return hasil;
  }

  /* Pecah 'nilai' (kelipatan 1.000) menjadi uang kertas lintas nominal. */
  function pecahKertas(nilai, acak) {
    var h = {}; KERTAS.forEach(function (d) { h[d] = 0; });
    var sisa = nilai;
    /* 1) pecahan kecil dulu dengan batas wajar, sesekali dikosongkan. */
    var batas = { 1000: 8, 2000: 6, 5000: 6, 10000: 6, 20000: 4 };
    [1000, 2000, 5000, 10000, 20000].forEach(function (d) {
      if (acak() < 0.18) return;                                   /* sesekali kosong */
      var maks = Math.min(batas[d], Math.floor(sisa / d));
      if (maks < 1) return;
      var n = bil(acak, 0, maks);
      h[d] += n; sisa -= n * d;
    });
    /* 2) sisa yang bukan kelipatan 10.000 ditutup pecahan kecil agar sisanya bisa dipecah 20rb ke atas. */
    var kecil = sisa % 10000;
    if (kecil >= 5000 && acak() < 0.7) { h[5000]++; kecil -= 5000; sisa -= 5000; }
    while (kecil >= 2000 && acak() < 0.7) { h[2000]++; kecil -= 2000; sisa -= 2000; }
    if (kecil > 0) { h[1000] += kecil / 1000; sisa -= kecil; }
    /* 3) sisanya (kelipatan 10.000) dibagi acak ke 100rb, 50rb, 20rb, 10rb; sesekali satu nominal dilewati. */
    var besar = [100000, 50000, 20000, 10000];
    for (var i = 0; i < besar.length; i++) {
      var d = besar[i];
      if (d === 10000) { h[d] += sisa / d; sisa = 0; break; }
      var maks = Math.floor(sisa / d);
      if (maks < 1) continue;
      if (acak() < 0.15) continue;
      var bagian = d === 20000 ? 0.4 + acak() * 0.5 : 0.3 + acak() * 0.45;   /* porsi sisa untuk nominal ini; 10rb mengambil sisanya */
      var n = Math.max(0, Math.min(maks, Math.round(sisa * bagian / d)));
      h[d] += n; sisa -= n * d;
    }
    return h;
  }

  function acakDenominasi(total, acak) {
    acak = acak || Math.random;
    total = Math.max(0, Math.round(Number(total) || 0));
    var out = { sisa: total % 100 };
    var T = total - out.sisa;                                       /* kelipatan 100 */
    var ratusan = T % 1000;
    var wajib = [], koinNilai;
    if (ratusan > 0) {
      /* koin 200 dan 100 ikut; ratusan 100 -> koin 100, 200 -> koin 200, 300+ -> keduanya. */
      if (ratusan >= 300) wajib = [200, 100]; else if (ratusan === 200) wajib = [200]; else wajib = [100];
      koinNilai = ratusan + 1000 * bil(acak, 0, Math.min(2, Math.floor((T - ratusan) / 1000)));
    } else {
      /* genap: tetap ada koin 500 atau 1.000 bila total memungkinkan. */
      var semua = [{ w: [1000], n: 1000 }, { w: [500, 500], n: 1000 }, { w: [1000, 500, 500], n: 2000 }, { w: [1000, 1000], n: 2000 }, { w: [1000, 1000, 500, 500], n: 3000 }];
      var pilihan = semua.filter(function (c) { return c.n <= T; });
      var p = pilihan.length ? pilih(acak, pilihan) : { w: [], n: 0 };
      wajib = p.w; koinNilai = p.n;
    }
    var koin = pecahKoin(koinNilai, wajib, acak);
    var kertas = pecahKertas(T - koinNilai, acak);
    KERTAS.forEach(function (d) { out['p' + d] = kertas[d]; });
    KOIN.forEach(function (k) { out['k' + k] = koin[k]; });
    return out;
  }

  function jumlah(h) {
    var t = 0;
    KERTAS.forEach(function (d) { t += (h['p' + d] || 0) * d; });
    KOIN.forEach(function (k) { t += (h['k' + k] || 0) * k; });
    return t + (h.sisa || 0);
  }
  window.LZDenominasi = { acak: acakDenominasi, jumlah: jumlah, KERTAS: KERTAS, KOIN: KOIN };
})();

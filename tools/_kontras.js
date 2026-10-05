/* Pemindai kontras teks untuk uji tema gelap. Dijalankan DI DALAM halaman (page.evaluate(PINDAI_KONTRAS)).
 *
 * KENAPA ADA. Pemilik melaporkan di mode gelap ada bagian yang teksnya tetap hitam (warna ditulis mati di CSS atau
 * style inline, bukan lewat variabel tema), jadi tidak terbaca di latar gelap. Pemeriksa ini berjalan di semua elemen
 * yang punya teks langsung, menghitung warna latar efektif (menumpuk semua latar leluhur) dan melaporkan yang
 * rasio kontrasnya di bawah batas. Latar gambar/gradien dilewati karena warnanya tidak bisa dibaca andal.
 * Yang dilaporkan: pemilih singkat, teks, warna, latar, rasio. */
'use strict';
module.exports = function PINDAI_KONTRAS(batas) {
  const urai = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const campur = (atas, bawah) => ({ r: atas.r * atas.a + bawah.r * (1 - atas.a), g: atas.g * atas.a + bawah.g * (1 - atas.a), b: atas.b * atas.a + bawah.b * (1 - atas.a), a: 1 });
  const dasar = urai(getComputedStyle(document.body).backgroundColor);
  const dasarBody = dasar && dasar.a > 0 ? dasar : urai(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  /* Mengembalikan daftar latar mungkin. Latar polos: satu warna. Gradien: tiap warna henti-nya (kasus terburuk
     yang dinilai); gambar tanpa warna terbaca (url()) dilewati (null). */
  const latarEfektif = (el) => {
    const lapis = []; let stop = null;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const w = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(urai).filter((c) => c && c.a > 0.6);
        if (!w.length) return null;
        stop = w; break;
      }
      const c = urai(cs.backgroundColor);
      if (c && c.a > 0) { lapis.push(c); if (c.a >= 1) break; }
    }
    const gabung = (alas) => { let h = alas; const l = lapis.slice(); while (l.length) h = campur(l.pop(), h); return h; };
    if (stop) return stop.map((c) => campur(c, Object.assign({}, dasarBody, { a: 1 })));
    let alas = lapis.length && lapis[lapis.length - 1].a >= 1 ? lapis.pop() : Object.assign({}, dasarBody, { a: 1 });
    return [gabung(alas)];
  };
  const tampak = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const nama = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const hasil = [], terlihat = new Set();
  const semua = document.body.querySelectorAll('*');
  for (const el of semua) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH)$/i.test(el.tagName)) continue;
    let teks = '';
    for (const n of el.childNodes) if (n.nodeType === 3) teks += n.textContent;
    teks = teks.replace(/\s+/g, ' ').trim();
    if (!teks || !tampak(el)) continue;
    const cs = getComputedStyle(el);
    const fg0 = urai(cs.color); if (!fg0) continue;
    const bgs = latarEfektif(el); if (!bgs) continue;
    /* Gradien: dinilai dari henti terbaik. Teks putih pada gradien jingga merek memang lebih rendah di ujung terangnya
       (sama persis di tema terang); yang dicari di sini teks yang gagal di SEMUA bagian latarnya. */
    let rasio = -1, bg = bgs[0];
    for (const kandidat of bgs) {
      const fg = fg0.a < 1 ? campur(fg0, kandidat) : fg0;
      const l1 = lum(fg), l2 = lum(kandidat);
      const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (r > rasio) { rasio = r; bg = kandidat; }
    }
    if (rasio < batas) {
      const kunci = nama(el) + '|' + cs.color + '|' + Math.round(rasio * 10);
      if (terlihat.has(kunci)) continue; terlihat.add(kunci);
      hasil.push({ el: nama(el), teks: teks.slice(0, 40), warna: cs.color, latar: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')', rasio: Math.round(rasio * 100) / 100 });
    }
  }
  return hasil;
};

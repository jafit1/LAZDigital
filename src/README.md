# LAZ Digital — Vercel Edition

Versi cepat dari aplikasi LAZ Digital, di-deploy sebagai serverless di Vercel.

## Struktur
- `public/` — frontend statis (index.html, app.js, styles.css, public.html)
- `api/rpc.js` — satu endpoint serverless yang men-dispatch seluruh fungsi backend
- `api/_engine.js` — port backend (logika dari Code.gs)

## Login default
- Username: `superadmin`
- Password: `admin123`

## Penyimpanan Data
- **Produksi:** gunakan **Vercel KV** (Upstash Redis). Setelah ditautkan, data persisten.
- Tanpa KV: fallback ke /tmp (sementara, hanya untuk uji coba).

## Deploy
```
vercel        # preview
vercel --prod # production
```

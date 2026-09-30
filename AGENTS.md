# Panduan untuk agen AI

Seluruh aturan proyek ini ada di **[CLAUDE.md](./CLAUDE.md)**. Baca berkas itu
lebih dulu sebelum menyentuh kode apa pun.

Berkas ini sengaja dibuat pendek dan hanya menunjuk ke sana, supaya aturannya
tinggal di satu tempat. Dua berkas yang isinya sama akan berbeda dalam
sebulan, dan yang dibaca model berikutnya belum tentu yang diperbarui.

Empat hal yang paling sering merusak kalau tidak dibaca lebih dulu:

1. Repositori ini **publik**, jadi tidak boleh ada rahasia masuk git.
2. Vercel membatasi **12 serverless function**, sekarang terpakai 10.
3. Akhiran baris **berbeda per berkas** (sebagian CRLF, sebagian LF).
4. Angka di aplikasi ini dipakai membagi uang sungguhan, jadi setiap
   perbaikan harus ditemani uji yang **terbukti gagal sebelum diperbaiki**.

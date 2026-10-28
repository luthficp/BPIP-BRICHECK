# PDF.js (disalin apa adanya)

Berkas `pdf.min.mjs` dan `pdf.worker.min.mjs` adalah build resmi **pdfjs-dist 6.2.108**
(Mozilla, lisensi Apache 2.0, lihat `LICENSE`). Dimuat di browser oleh fitur Upload PDF opsional di Step 2
(`src/lib/extract/pdf-text.ts`) agar PDF dibaca di perangkat pengguna tanpa dependensi npm baru.

Memperbarui: salin dua berkas yang sama dari `node_modules/pdfjs-dist/build/` versi yang lebih baru,
lalu uji ulang fitur Upload PDF.

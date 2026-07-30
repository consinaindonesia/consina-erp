# Catatan Keputusan Arsitektur

Setiap keputusan arsitektur dicatat di sini dengan bahasa awam:
apa yang diputuskan, dan kenapa. Supaya pemilik proyek dan agent
lain di sesi berikutnya bisa membaca alasannya tanpa harus
membaca kode.

---

## M0 — Fondasi (2026-07-29)

- **Proyek baru, bukan reuse repo lama.** Ini bukan bagian dari
  `consina-website` (repo storefront lama, sudah mati) atau
  `consina-dev` (repo storefront aktif). ERP ini produk yang beda,
  jadi folder & repo-nya juga dipisah sejak awal.
- **Scaffold:** `tanstack create --blank` (React, tanpa Tailwind/demo
  content) karena mockup UI-nya pakai inline style, bukan Tailwind.
  Kalau nanti mau styling sistem, bisa ditambah belakangan.
- **Deployment adapter: nitro (generic)**, bukan adapter khusus
  (cloudflare/netlify/railway), karena target hosting Vercel dan
  Vercel mendeteksi build Vite/Nitro secara otomatis tanpa adapter
  khusus.
- **Supabase project baru: `consina-erp`** (ref `zcmceygyukeidcvtwnyq`),
  region `ap-south-1` — disamakan dengan region `consina-dev` supaya
  konsisten, dan gratis (free tier, $0/bulan).
- **Pakai `sb_publishable_...` key** (bukan legacy anon JWT) untuk
  client, karena itu key default yang direkomendasikan Supabase
  sekarang untuk akses publik/client-side.
- **Cara verifikasi koneksi Supabase:** server function memanggil
  `supabase.storage.listBuckets()`. Dipilih karena berhasil tanpa
  butuh tabel apa pun (M1 belum jalan), tapi tetap benar-benar
  melakukan round-trip jaringan ke project Supabase — jadi bukti
  koneksi asli, bukan cuma cek konfigurasi lokal.
- **Vercel project: tim `consina`** (https://vercel.com/consina/consina-erp),
  bukan tim `fajrin-consina-s-projects` tempat `consina-dev` berada —
  pemilik proyek yang membuatnya di sana. Env var
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` sudah diisi
  di dashboard Vercel project itu. Live URL: https://consina-erp.vercel.app
  (halaman menampilkan "✓ Terhubung" — sudah diverifikasi).
- **GitHub remote:** `git@github.com:consinaindonesia/consina-erp.git`
  (SSH, sama seperti `consina-dev`). Belum bisa di-push — GitHub
  menolak dengan "Repository is disabled" bahkan untuk `fetch`.
  Ini masalah di sisi akun/org GitHub, bukan kode. Tunggu pemilik
  proyek mengecek `github.com/consinaindonesia/consina-erp` /
  pengaturan org, baru push menyusul.

## M1 — Skema database (2026-07-30)

- **Tidak ada `skema-erp.sql` siap pakai** di proyek desain — file itu
  tidak ada di antara file yang diunggah, hanya `cek-kesehatan.sql`
  dan `rencana-build.md`. Jadi skema disusun dari nol berdasarkan:
  tabel/kolom yang disebut `cek-kesehatan.sql` (nama tabel/kolom
  di skema HARUS persis cocok dengan itu, karena skrip itu tidak
  boleh diubah), aturan di bagian 2 CLAUDE.md, dan bentuk data Odoo
  asli di file CSV yang diunggah (dipakai sebagai referensi nama,
  bukan disalin persis — impor data asli menyusul di M3).
- **Semua tabel inti dibuat sekaligus di M1** (lokasi, produk, BOM,
  stok, POS, produksi) — bukan cuma yang M1 sebut eksplisit — karena
  `cek-kesehatan.sql` adalah satu query yang mereferensikan semua
  tabel itu sekaligus (pos_session, pos_order, manufacturing_order,
  dst). Kalau ada satu tabel saja yang belum ada, seluruh skrip cek
  kesehatan gagal dengan error SQL, bukan cuma baris "BAHAYA".
  Fitur/UI untuk tabel-tabel itu tetap menyusul sesuai jadwal masing-
  masing milestone (POS di M5, produksi di M6, dst) — M1 hanya
  fondasi datanya.
- **Cara menegakkan "stock_quant hanya boleh ditulis lewat trigger
  apply_move_line" (hukum #2):** dipakai penanda transaksi
  (`set_config('erp.internal_stock_write', ...)`) yang cuma dinyalakan
  sesaat oleh `apply_move_line()` sendiri. Trigger `stock_quant_guard`
  menolak semua tulis langsung ke `stock_quant` kecuali penanda itu
  menyala. Ini berlaku untuk SIAPA PUN yang connect ke database,
  termasuk lewat SQL Editor Supabase — bukan cuma dari kode aplikasi.
  Sudah diuji langsung: UPDATE manual ke stock_quant ditolak, begitu
  juga UPDATE/DELETE ke stock_move_line (hukum #1 dan #3).
- **RLS diaktifkan di semua tabel, belum ada kebijakan (policy)
  sama sekali.** Artinya lewat API publik (anon/authenticated key),
  semua tabel ini masih terkunci total — sengaja, karena belum ada
  UI yang butuh baca/tulis. Kebijakan baca ditambahkan mulai M3
  (halaman master data), kebijakan tulis lewat fungsi RPC mulai
  M4/M5/M6 sesuai fiturnya masing-masing.
- **Seed M1 cuma master data**, tidak ada transaksi (stock_move,
  pos_order, dst) — sesuai instruksi rencana-build.md. Gudang & toko
  dinamai sesuai kode yang sudah muncul di mockup UI sebelumnya
  (00GBJ = Gudang Pusat, 15BGR = Toko Bogor) supaya konsisten dengan
  desain, ditambah 22WNS = Toko Wonosobo sebagai toko kedua.
- **Hasil `cek-kesehatan.sql`: 9/9 OK** di atas seed M1 (semua nol
  karena belum ada transaksi — itu sudah benar, bukan berpura-pura
  lulus). Pembuktian jalur bisnis penuh (beli→produksi→transfer→
  jual→retur→opname) adalah tugas M2, bukan M1.

## M2 — Gerbang kebenaran (2026-07-30)

- **"Carrier" di skrip rencana-build.md diganti dengan "Jaket Consina
  Champers Hill"** (satu-satunya produk manufaktur yang ada dari seed
  M1) — nama produk di skrip aslinya cuma contoh generik, bukan nama
  wajib.
- **Beli 3 bahan baku sekaligus di langkah 1** (kain 100m, resleting
  20pcs, webbing 15m), bukan cuma kain seperti tertulis di skrip.
  Kalau cuma beli kain lalu langsung produksi (butuh resleting &
  webbing juga), stok fisik resleting/webbing akan minus — itu
  pelanggaran nyata yang mestinya ditangkap cek kesehatan #2, bukan
  cara sah untuk lolos ujian ini.
- **Siklus penuh dijalankan dan disimpan permanen** (bukan uji-lalu-
  rollback seperti verifikasi hukum di M1) — referensi tiap gerakan
  diberi awalan `M2/...` supaya gampang dibedakan dari data asli nanti.
  Urutan: beli bahan (M2/PEMBELIAN-01) → produksi 10 unit
  (M2/PRODUKSI-01, dua stock_move: konsumsi bahan + hasil produksi,
  keduanya terhubung ke manufacturing_order lewat production_id) →
  transfer 4 unit ke Toko Bogor lewat transit, dua langkah
  (M2/TRANSFER-01-KIRIM lalu -TERIMA) → jual 1 unit, sesi dibuka lalu
  ditutup (M2/POS-0001 — stok BARU dibukukan saat tutup sesi, dalam
  satu statement SQL bareng update status sesi & order, sesuai hukum
  #5) → retur 1 unit (M2/RETUR-01, pakai kolom `reversal_of_id` yang
  memang disiapkan untuk ini) → stock opname, fisik kurang 1 unit
  (M2/OPNAME-01, masuk ke lokasi virtual inventory_loss).
- **Hasil: cek-kesehatan 9/9 OK di SETIAP langkah** (bukan cuma di
  akhir), dan saldo akhir Jaket Hitam bisa dilacak persis:
  6 unit di Gudang Pusat, 3 unit di Toko Bogor, 1 unit tercatat
  hilang (opname) — totalnya pas sama dengan 10 yang diproduksi
  dikurangi apa yang sudah terjual/hilang.
- **Trigger `apply_move_line` dan penjaga stock_quant/stock_move_line
  terbukti bekerja di jalur nyata**, bukan cuma di uji sintetis M1 —
  setiap kali stock_move_line di-INSERT, stock_quant otomatis
  ter-update dengan benar tanpa satu pun UPDATE manual dari skrip ini.

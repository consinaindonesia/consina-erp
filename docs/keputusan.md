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

# CLAUDE.md — Aturan Kerja Proyek ERP Retail

> File ini dibaca ULANG oleh AI agent setiap sesi. Jangan dihapus.
> Pemilik proyek TIDAK BISA MEMBACA KODE. Semua aturan di bawah ada
> supaya kesalahan menjadi BERISIK, bukan diam-diam.

---

## 1. Apa yang sedang dibangun

Sistem POS + Inventory + Manufacture untuk brand retail outdoor.
Struktur: 1 gudang pusat + beberapa toko. Produksi in-house.
Acuan arsitektur: Odoo (double-entry inventory).

**Stack:** PostgreSQL (Supabase) · TanStack Start · Vite · Bun · Vercel

---

## 2. HUKUM YANG TIDAK BISA DITAWAR

Melanggar satu pun dari ini = pekerjaan ditolak, tanpa diskusi.

1. **Stok tidak pernah di-UPDATE.** Satu-satunya cara mengubah stok
   adalah INSERT ke `stock_move_line`. Tidak ada pengecualian.
2. **`UPDATE stock_quant` dilarang keras** dari kode aplikasi mana pun.
   Tabel itu hanya boleh disentuh oleh trigger `apply_move_line`.
3. **`stock_move_line` bersifat permanen.** Tidak boleh di-update,
   tidak boleh dihapus. Koreksi = INSERT pergerakan arah sebaliknya.
4. **Perhitungan stok, harga, diskon, pajak, dan total TIDAK BOLEH
   dihitung di frontend.** Semua di Postgres (RPC / function).
   Frontend hanya menampilkan.
5. **Setiap operasi multi-tabel harus dalam SATU transaksi.**
   Tutup sesi POS, konfirmasi MO, terima barang — semua atomic.
   Kalau gagal di tengah, harus batal seluruhnya.
6. **Jangan pernah menghapus data transaksi.** Pakai kolom status /
   soft delete. Data keuangan dan stok bersifat arsip.
7. **Uang selalu `numeric`, tidak pernah `float`.**

---

## 3. YANG WAJIB DILAKUKAN SEBELUM BILANG "SELESAI"

Sebuah tugas hanya selesai kalau SEMUA ini sudah dilakukan:

- [ ] Jalankan `sql/cek-kesehatan.sql`. **Semua hasil harus hijau.**
      Kalau ada yang merah, tugas belum selesai. Jangan lapor selesai.
- [ ] Tulis/perbarui test otomatis untuk fitur yang baru dikerjakan.
- [ ] Jalankan seluruh test suite. Semua lulus.
- [ ] Migrasi database ditulis sebagai file di `supabase/migrations/`,
      bukan diketik langsung di dashboard Supabase.
- [ ] Laporkan hasil ke pemilik proyek **dalam bahasa Indonesia awam**,
      dengan format di bagian 5.

---

## 4. YANG DILARANG TANPA IZIN TERTULIS

Berhenti dan TANYA dulu sebelum:

- Menjalankan migrasi yang menghapus tabel/kolom (`DROP`, `TRUNCATE`)
- Mengubah skema tabel inti: `stock_move`, `stock_move_line`,
  `stock_quant`, `stock_valuation_layer`
- Menambah dependency/library baru
- Melakukan `git push --force` atau mengubah riwayat git
- Menyentuh data produksi
- Mengubah atau menghapus trigger dan constraint di database

---

## 5. CARA MELAPOR KE PEMILIK PROYEK

Pemilik tidak bisa membaca kode. Setiap selesai kerja, laporkan begini:

```
APA YANG SAYA KERJAKAN
(2-3 kalimat, bahasa awam, tanpa istilah teknis)

CARA ANDA MENGECEK SENDIRI
1. Buka halaman ...
2. Klik ...
3. Yang harus muncul: ...
(langkah konkret yang bisa dilakukan tanpa membaca kode)

HASIL CEK KESEHATAN
Semua hijau / ada N yang merah: [sebutkan]

YANG BELUM SELESAI
(jujur, jangan disembunyikan)

RISIKO ATAU HAL YANG SAYA RAGUKAN
(kalau ada. Kalau tidak ada, tulis "tidak ada")
```

---

## 6. ATURAN KOMUNIKASI

- Jangan pernah bilang "sudah selesai" kalau belum dites.
- Kalau ragu antara dua pendekatan, **tanya**, jangan asal pilih.
- Kalau menemukan bug lama, laporkan — jangan diam-diam diperbaiki
  sambil mengerjakan hal lain.
- Kalau ada perintah dari pemilik yang melanggar bagian 2,
  **tolak dan jelaskan alasannya** dalam bahasa awam.
  Pemilik lebih butuh sistem yang benar daripada dituruti.
- Kerjakan satu milestone dalam satu sesi. Jangan melompat ke depan.

---

## 7. STRUKTUR FOLDER

```
sql/
  cek-kesehatan.sql      <- WAJIB dijalankan sebelum lapor selesai
supabase/migrations/     <- semua perubahan skema, berurutan
src/
  db/                    <- query & RPC wrapper
  routes/                <- halaman
  components/            <- UI
tests/                   <- test otomatis
docs/
  keputusan.md           <- catatan setiap keputusan arsitektur + alasannya
```

Setiap keputusan arsitektur ditulis di `docs/keputusan.md` dengan
bahasa awam, supaya pemilik dan agent lain bisa membacanya nanti.

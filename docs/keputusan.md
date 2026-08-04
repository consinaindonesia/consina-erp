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

## M3 — Master data / UI pertama (2026-07-30)

- **Akses ke database lewat `service_role` key di server, bukan RLS
  policy untuk anon key.** Semua tabel masih terkunci total dari API
  publik (M1). Belum ada sistem login sama sekali (tidak disebut di
  rencana-build.md sampai M7), jadi cara paling aman & sederhana:
  browser TIDAK PERNAH bicara langsung ke Supabase — semua lewat
  server function TanStack Start (`src/server/*.ts`), yang jalan di
  server pakai `SUPABASE_SERVICE_ROLE_KEY` (env var server-only, tidak
  pernah dikirim ke browser). Kalau nanti butuh multi-user dengan hak
  akses berbeda, baru itu saatnya tambah auth + RLS policy sungguhan.
- **Logika bisnis dipisah dari `createServerFn`**, mis.
  `createProductImpl(admin, data)` vs `createProduct = createServerFn(...)`.
  Bukan cuma soal rapi — ini yang bikin fungsi itu bisa dites langsung
  di Vitest tanpa perlu jalur HTTP/RPC framework.
- **Test otomatis = pengulangan persis "cara cek" M3 sendiri**:
  `tests/products.test.ts` menambah 1 produk + 3 varian lewat kode
  yang sama persis dipakai UI, memverifikasi hasilnya di Supabase,
  lalu membersihkan diri sendiri. Dijalankan terhadap project
  Supabase asli (belum ada project Supabase khusus untuk testing) —
  makanya nama data uji selalu diawali `TEST/` supaya gampang
  dibedakan & aman dihapus.
- **Tipe TypeScript digenerate dari skema asli** (`generate_typescript_types`,
  disimpan di `src/lib/database.types.ts`, jangan diedit tangan — generate
  ulang tiap ada migrasi skema). Awalnya dicoba tanpa ini, tapi
  linter langsung menangkap bug nyata: kode mengira `location.warehouse`
  selalu ada padahal kolomnya nullable (lokasi virtual tidak punya
  gudang) — tanpa tipe asli, TypeScript tidak tahu itu, dan checker
  yang menganggap "optional chaining ini tidak perlu" jadi salah.
- **Tambah/edit dibatasi ke field dasar** (nama, kategori, satuan,
  harga, SKU, barcode, aktif) — belum ada UI ubah atribut/varian
  sebuah varian yang sudah ada (misal ganti warna). Itu bukan yang
  diminta "cara cek" M3 (tambah 1 produk 3 varian), jadi belum
  dibangun; bisa menyusul kalau memang dibutuhkan.
- **Tidak ada RPC/transaksi Postgres untuk create-produk-dengan-varian**
  (beberapa INSERT sekuensial biasa lewat supabase-js). Aturan
  "satu transaksi" di CLAUDE.md bagian 2 ditujukan untuk operasi stok/
  kasir/produksi (poin 5 menyebut contoh: tutup sesi, konfirmasi MO,
  terima barang) — bukan CRUD katalog. Kalau nanti perlu, gampang
  dibungkus jadi RPC.

## M4 — Penerimaan, transfer, opname (2026-08-04)

- **Empat fungsi RPC Postgres baru** (`fn_receive_goods`,
  `fn_transfer_send`, `fn_transfer_receive`, `fn_stock_opname`) —
  ini justru operasi yang CLAUDE.md bagian 2 poin 5 sebut eksplisit
  butuh satu transaksi ("terima barang" jadi salah satu contoh).
  Server function TanStack Start cuma pemanggil tipis; semua logika
  (termasuk hitung selisih opname) ada di Postgres, bukan di
  frontend — sesuai poin 4.
- **Tabel `stock_picking` baru**, mengelompokkan stock_move yang
  terkait jadi satu "dokumen" (mis. transfer = 1 picking, 2 move:
  kirim + terima). Kolom `stock_move.picking_id` sebenarnya sudah
  disiapkan sejak M1 khusus untuk ini.
- **Transfer WAJIB dua langkah** ditegakkan di level fungsi:
  `fn_transfer_send` selalu lewat lokasi transit dulu (picking
  berstatus `waiting`), `fn_transfer_receive` menolak kalau picking
  belum `waiting` atau sudah `done` — dicoba langsung dan terbukti
  ditolak.
- **"Barang dalam perjalanan"** bukan tabel terpisah — cukup query
  `stock_picking` tipe `internal_transfer` berstatus `waiting`. Saldo
  di lokasi transit (dari `stock_quant`) itu sendiri sudah otomatis
  jadi bukti barang belum hilang, sesuai cara kerja buku besar
  double-entry dari M1/M2.
- **`stock_opname` pakai lokasi virtual `inventory_loss` yang sama**
  dari M1 untuk DUA arah (selisih kurang maupun lebih) — bukan bikin
  lokasi baru — karena namanya sudah generik ("Inventory adjustment"),
  cocok untuk keduanya.
- **`noUncheckedIndexedAccess: true` ditambahkan ke tsconfig.json.**
  Tanpa ini, TypeScript menganggap `array[i]` selalu ada isinya
  (tidak `undefined`) — linter jadi salah mengira sebagian
  optional-chaining kita "tidak perlu", padahal itu jaring pengaman
  asli untuk array yang bisa kosong. Diaktifkan sekali untuk seluruh
  proyek, bukan ditambal per baris.
- **Tes otomatis (`tests/stock-operations.test.ts`) memakai data
  real, lalu dipulihkan lewat operasi BALIK** (kirim ulang / opname
  ulang ke angka semula) — bukan dihapus. `stock_move_line` memang
  tidak boleh dihapus/diubah (hukum #1 CLAUDE.md), jadi ini satu-
  satunya cara membersihkan diri yang konsisten dengan aturan sistem
  sendiri. Referensi diberi awalan `TEST/M4-...` supaya gampang
  dikenali di masa depan.
- **Verifikasi manual di browser sekali sempat menabrak keterbatasan
  alat klik saya sendiri** (koordinat/`ref` dari `read_page` bisa
  basi kalau layout halaman sudah berubah sejak dibaca) — bukan bug
  di aplikasi. Solusinya: screenshot ulang sebelum klik penting, atau
  `scroll_to` + klik lewat `ref` segar. Transfer uji coba lewat UI
  (5 unit JCH-BK, 00GBJ→15BGR) berhasil dan langsung dipulihkan lagi
  lewat transfer balik supaya saldo akhir tetap sama seperti akhir M2.

## M5 — Kasir offline-first (2026-08-04)

- **Arsitektur offline: sesi dibuka online, transaksi jalan offline,
  sinkron pakai antrean.** "Buka Sesi" tetap butuh internet sekali di
  awal (bikin baris `pos_session`, cache katalog produk ke IndexedDB).
  Setelah itu, cari produk/tambah keranjang/bayar/cetak struk semua
  murni IndexedDB — tidak ada panggilan jaringan sama sekali di jalur
  itu. Ini pola yang sama dipakai POS offline sungguhan (Odoo POS,
  Square, dst): sesi selalu online, transaksi boleh offline.
- **Lingkup "offline" yang dibangun: tab yang SUDAH terbuka tetap bisa
  jual walau internet mati — BUKAN "buka browser baru sambil offline
  bisa langsung jualan."** Yang kedua butuh service worker (PWA app-
  shell caching) supaya HTML/JS-nya sendiri bisa dimuat tanpa jaringan;
  itu di luar cakupan M5 kali ini karena scaffold TanStack Start belum
  ada infrastruktur PWA. Skenario resmi di rencana-build.md ("nyalakan
  mode pesawat di HP, jual 5 barang") cocok dengan lingkup ini — kasir
  yang sedang dipakai, bukan yang baru dibuka.
- **Harga final DIHITUNG ULANG di server saat sinkron dari
  `product_template.sale_price` terkini**, bukan dipercaya dari angka
  yang di-cache di HP kasir. Kalau harga berubah selagi offline, total
  yang tercatat akan beda dari yang ditampilkan ke pelanggan saat
  transaksi — itu risiko nyata pada sistem offline mana pun, sengaja
  tidak "ditutupi" di sini; cek-kesehatan #5 justru akan menangkapnya
  kalau pernah terjadi beneran, bukan pura-pura selalu cocok.
- **Idempoten dijamin di server via `fn_sync_pos_order`**: `client_uuid`
  unik (kolom sudah ada sejak M1) dicek dulu sebelum insert — kalau
  sudah ada, kembalikan id yang lama, jangan bikin baris baru. Disinkron
  dua kali dari klien manapun hasilnya tetap sama.
- **BUG NYATA ditemukan & diperbaiki saat verifikasi manual**: kode
  sinkron di klien awalnya cuma mengandalkan "kalau `syncPosOrder` tidak
  melempar error, berarti berhasil." Saat proses dev di-restart di
  tengah tes (skenario tiruan untuk simulasi offline→online), panggilan
  itu RESOLVE tanpa error sama sekali walau server sebenarnya gagal
  (error khusus dev-mode "Invalid server function ID") — akibatnya 4
  struk ditandai "tersinkron" di IndexedDB padahal tidak pernah sampai
  ke Supabase. Diperbaiki dengan validasi eksplisit: hasil sinkron HARUS
  punya `orderId` bertipe string sebelum ditandai tersinkron; kalau
  tidak, dianggap gagal. Juga ditambah penjaga supaya sinkron tidak
  boleh jalan tumpang tindih (interval berkala + event `online` + klik
  manual bisa saling tabrakan). Pelajaran: "tidak melempar error" tidak
  cukup jadi bukti sukses untuk data keuangan — harus ada bukti bentuk
  responsnya benar.
- **Tes otomatis (`tests/pos-sync.test.ts`) mengulang persis kriteria
  M5 sendiri**: 5 client_uuid disiapkan (simulasi antrean offline),
  disinkron sekali → tepat 5 struk; disinkron LAGI dengan client_uuid
  yang sama → tetap 5, bukan 10. Sempat gagal dua kali karena bug di
  tes itu sendiri (bukan di sistem): (1) `RM-WEBB` dipakai sebagai
  barang jualan padahal harganya 0 (bahan baku, bukan produk jadi) —
  bikin cek-kesehatan #5 salah menuduh struk tidak seimbang; (2)
  `order_no` di tes memakai string tetap yang bentrok dengan hasil
  tes sebelumnya (order_no unik selamanya, tidak boleh dipakai ulang).
  Kedua pelajaran ini jadi alasan kenapa file tes sekarang pakai
  `runTag` acak dan produk sungguhan (JCH-BK) yang punya harga jual.
- **`fileParallelism: false` ditambahkan ke `vitest.config.ts`**: semua
  file tes berjalan lawan SATU project Supabase asli yang sama (bukan
  database per-tes yang terisolasi). Dua file tes yang kebetulan pakai
  gudang/varian yang sama sempat saling ganggu saldonya saat jalan
  paralel — jadi tes dipaksa berurutan sejak M4/M5 ini.
- **10 struk uji (`TEST/M5-...`, RM-WEBB seharga 0) yang sempat lolos
  sebelum bug di atas ketahuan ditandai `cancelled`**, bukan dihapus —
  sesuai hukum #6 CLAUDE.md (jangan hapus data keuangan, pakai status).
  5 struk uji manual lewat UI (`POS/...`, JCH-BK/JCH-NV, harga benar,
  seimbang) dibiarkan sebagai `posted` — datanya valid, cuma memang
  transaksi demo, bukan dihapus atau di-cancel.

## M6 — Produksi (2026-08-04)

- **BOM dapat "routing"**: tabel baru `bom_operation` (bom_id,
  work_center_id, sequence, name) mendefinisikan urutan operasi
  (Potong → Jahit → QC → Kemas) untuk satu resep. Saat Manufacturing
  Order (MO) dibuat lewat `fn_create_manufacturing_order`, sistem
  otomatis mengcopy routing itu jadi baris `work_order` (satu per
  operasi, per MO) — jadi tiap MO punya checklist sendiri yang bisa
  ditandai selesai satu-satu oleh operator, sesuai urutan.
- **`manufacturing_order` dapat kolom baru `warehouse_id`**: sejak M1
  tabel ini belum tahu di gudang mana bahan diambil / barang jadi
  disimpan. Kolom dibuat NULLABLE (bukan NOT NULL) supaya baris lama
  (`M2/PRODUKSI-01`, dari demo gerbang-kebenaran M2 yang ditulis
  langsung lewat SQL, bukan lewat RPC ini) tidak perlu dihapus/diubah
  paksa — cukup dibackfill ke `00GBJ` (Gudang Pusat), gudang yang sama
  dengan demo M2 itu.
- **`fn_complete_manufacturing_order` menolak selesai kalau ada
  work_order yang belum `done`**: mencegah barang jadi "muncul dari
  udara" sebelum semua tahap produksi benar-benar dikerjakan. Juga
  mengecek ketersediaan bahan (qty resep × qty rencana vs stok di
  lokasi internal gudang tsb) SEBELUM menyentuh stok apa pun — supaya
  tidak melanggar hukum #2 (stok fisik tidak boleh minus) di
  tengah-tengah transaksi.
- **Penyerapan biaya pakai rata-rata tertimbang (weighted average),
  bukan FIFO/LIFO**: `stock_valuation_layer` (tabel yang memang sudah
  disiapkan kosong sejak M1, untuk keperluan ini) mencatat satu baris
  per produksi (qty, unit_cost, value). `product_template.cost_price`
  lalu diperbarui dengan rumus
  `(qty_lama × cost_lama + qty_produksi × unit_cost_baru) / (qty_lama + qty_produksi)`.
  `qty_lama` dihitung dari SEMUA lokasi internal (semua gudang/toko),
  bukan cuma gudang tempat produksi — karena `cost_price` disimpan di
  level `product_template` (dipakai bersama semua varian & lokasi),
  bukan per lokasi. Ini konsisten dengan `sale_price` yang juga di
  level template sejak M1 — bukan desain baru M6.
- **Kenapa biaya bahan pakai `product_template.cost_price` bahan baku
  saat itu (bukan FIFO historis)**: sederhana dan cukup untuk skala
  bisnis ini; kalau nanti harga bahan baku sering berubah dan perlu
  akurasi FIFO/lot-tracking, itu perbaikan terpisah, bukan bagian M6.
- **Test (`tests/production.test.ts`) membuktikan kriteria M6 persis
  seperti yang diminta**: buat MO 10 unit, cek bahan berkurang PERSIS
  sesuai rasio resep (12 kain, 10 resleting, 8 webbing untuk 10 unit
  jaket), cek barang jadi bertambah 10, DAN bandingkan `cost_price`
  sebelum-sesudah pakai rumus yang sama seperti di atas (dihitung
  independen di tes, bukan cuma "pasti berubah"). Juga membuktikan MO
  tidak bisa diselesaikan kalau masih ada operasi pending, dan tidak
  bisa diselesaikan dua kali.
- **BUG NYATA ditemukan saat debugging tes sendiri, bukan di sistem**:
  draf pertama tes menghitung `cost_price` yang diharapkan pakai qty
  barang jadi HANYA di gudang tempat produksi (00GBJ), padahal RPC
  menjumlah dari SEMUA lokasi internal (JCH-BK ternyata juga ada
  stoknya di toko Bogor). Setelah diperbaiki, tes cocok persis dengan
  hasil RPC. Pelajaran ini dicatat karena kesalahan yang sama gampang
  terulang kalau nanti ada modul lain yang menghitung "stok yang
  dipegang" — harus eksplisit: satu lokasi atau semua lokasi internal?
- **BUG NYATA kedua, kali ini di proses verifikasi manual (bukan di
  kode produk)**: saat mengulang tes berkali-kali sambil memperbaiki
  bug di atas, satu percobaan gagal SEBELUM mencapai kode
  pembersihan-nya sendiri (pembersihan pakai pola "operasi balik",
  sesuai hukum #6 — stock_move_line permanen, tidak boleh
  diupdate/dihapus). Akibatnya ada 12 kain / 10 resleting / 8 webbing
  yang terpakai nyata dan tidak pernah dikembalikan, plus
  `cost_price` yang ikut berubah — baru ketahuan saat verifikasi UI
  manual menunjukkan `cost_price` sudah tidak 0 padahal belum ada
  produksi "resmi". Dan saat memperbaiki INI PUN sempat salah arah
  (bahan yang harusnya "dikembalikan" ke gudang malah dikirim balik
  ke supplier, hampir bikin stok minus di 00GBJ) — diperbaiki
  lagi dengan mengecek `sql/cek-kesehatan.sql` ulang setelah setiap
  koreksi manual, sampai semua 9 baris kembali "OK". Pelajaran:
  koreksi data manual di database live HARUS diverifikasi lagi dengan
  cek-kesehatan setelahnya, jangan percaya perhitungan mental sendiri
  begitu saja — arah pergerakan stok (masuk vs keluar) gampang
  tertukar saat buru-buru.
- **UI `/production`**: form buat MO menampilkan pratinjau
  ketersediaan bahan (butuh vs tersedia per komponen resep) sebelum
  disubmit, dan tombol "Buat MO" dinonaktifkan kalau ada bahan yang
  kurang — supaya operator tidak coba-coba bikin MO yang pasti gagal.
  Checklist operasi menampilkan tombol "Tandai selesai" hanya untuk
  operasi PENDING BERIKUTNYA sesuai urutan (client-side saja; RPC
  `fn_complete_work_order` sendiri tidak memaksa urutan) — ini pilihan
  UX supaya alur terasa natural, bukan aturan bisnis yang keras.
- **Halaman `/work-centers`**: CRUD sederhana untuk kelola work center
  (kode + nama), pola yang sama seperti `/categories`.

## M7 — Laporan & titik pesan ulang (2026-08-04, milestone terakhir di rencana-build.md)

- **Semua laporan adalah fungsi SQL baca-saja (`language sql stable`),
  bukan tabel/view baru**: tidak ada perubahan skema sama sekali di
  M7 — cuma menambah cara membaca data yang sudah ada. Konsisten
  dengan hukum #4 (tidak ada perhitungan di frontend): saldo
  berjalan, total nilai, dan usulan pesan ulang semuanya dihitung di
  Postgres; React cuma menampilkan tabel.
- **Definisi "saldo" di kartu stok (`fn_stock_card`) adalah saldo
  MILIK PERUSAHAAN (dijumlah dari semua lokasi fisik/internal), bukan
  saldo satu lokasi**: perpindahan gudang pusat -> toko TIDAK mengubah
  angka ini (barang cuma pindah tempat, bukan masuk/keluar
  perusahaan); pembelian (supplier -> internal) menambahnya; penjualan
  (internal -> customer) menguranginya. Definisi ini dipilih karena
  paling langsung menjawab kriteria milestone: "dirunut dari
  pembelian sampai penjualan tanpa lompatan angka" — kalau saldo
  dihitung per-lokasi, transfer antar gudang akan terlihat seperti
  "barang hilang lalu muncul lagi", padahal sebenarnya cuma pindah.
  Dites lewat `tests/reports.test.ts` dengan urutan pergerakan
  terkontrol penuh (beli → kirim ke transit → diterima toko → "terjual"
  ke pelanggan) yang sengaja net nol di akhir, dan diverifikasi SETIAP
  baris (bukan cuma yang baru ditambahkan tesnya) — saldo baris ini
  harus persis saldo baris sebelumnya + perubahan baris ini, tanpa
  kecuali, di SELURUH riwayat sejak M2.
- **`reorder_point` (kolom yang sudah ada sejak M1 tapi belum pernah
  dipakai) diperlakukan sebagai batas minimum PER LOKASI, bukan total
  perusahaan**: dicek di tiap gudang/toko secara terpisah. Ini yang
  memungkinkan tiga jenis usulan berbeda: "Transfer dari Gudang Pusat"
  (toko kosong, tapi pusat masih ada stok cukup), "Produksi" (barang
  buatan sendiri dan pusat pun kurang), "Beli dari supplier" (bahan
  baku dan kurang). Kalau reorder_point diperlakukan sebagai total
  perusahaan, tidak mungkin membedakan "toko kosong tapi pusat penuh"
  dari "seluruh perusahaan memang kekurangan" — padahal itu dua
  masalah yang solusinya beda sama sekali.
- **Bahan baku (is_manufactured = false) sengaja DIKECUALIKAN dari
  pengecekan reorder di lokasi toko**: toko tidak pernah menyetok
  bahan baku (cuma jual barang jadi), jadi "toko kosong bahan baku"
  itu normal, bukan kekurangan. Awalnya laporan menyertakan ini dan
  hasilnya penuh baris palsu (semua toko "kekurangan" kain/resleting/
  webbing) — ketahuan langsung saat baca hasil laporan sendiri,
  diperbaiki dengan migrasi tambahan sebelum lanjut ke kode aplikasi.
- **`reorder_point` semua produk masih 0 dari M1-M6** (belum pernah
  diisi milestone manapun) — diisi contoh nilai realistis untuk
  demo (Kain Ripstop 100, Resleting 20, Webbing 15, Jaket 5) lewat
  UPDATE langsung, BUKAN via RPC/ledger, karena `reorder_point` cuma
  kolom pengaturan biasa di `product_template` (sama seperti
  `sale_price`/`cost_price`), sudah bisa diedit dari halaman produk
  M3 — bukan data ledger yang dilindungi hukum #1-3. Pemilik bisa
  ubah kapan saja lewat halaman Produk.
- **BUG ditemukan saat verifikasi mandiri (bukan di kode M7)**: saat
  membangun ulang laporan berkali-kali sambil menguji, satu percobaan
  awal (sebelum bug diperbaiki) sempat gagal SETELAH mengubah stok
  tapi SEBELUM sempat membalikkannya — mirip kejadian di M6.
  Ditemukan lewat pengecekan silang manual (bandingkan kartu stok vs
  `cek-kesehatan.sql`), diperbaiki dengan operasi balik terkontrol,
  diverifikasi ulang sampai `cek-kesehatan.sql` kembali 9/9 OK.
  Pelajaran yang sama dengan M6 tetap berlaku: setiap koreksi manual
  ke database live wajib diverifikasi ulang, jangan percaya
  perhitungan sendiri begitu saja.
- **`fn_sales_by_store` menerima parameter tanggal opsional**
  (`p_from`, `p_to`) meski UI M7 saat ini belum punya input tanggal
  di layar — fungsinya sudah siap dipakai kalau nanti pemilik minta
  filter periode, tanpa perlu migrasi baru. Bukan YAGNI karena
  parameternya nol biaya tambahan (SQL sudah butuh WHERE, tinggal
  jadikan opsional) dan tidak menambah kerumitan UI yang belum
  diminta.
- **Ini milestone terakhir di `rencana-build.md`.** Semua M0–M7
  selesai. Langkah selanjutnya (kalau ada) di luar rencana asli —
  tunggu instruksi pemilik proyek, bukan diasumsikan.

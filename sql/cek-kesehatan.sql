-- =====================================================================
-- CEK KESEHATAN SISTEM
-- Cara pakai: buka Supabase -> SQL Editor -> tempel semua -> Run
-- Baca kolom HASIL. Harus "OK" semua. Kalau ada "BAHAYA", stop dulu.
-- Anda tidak perlu paham isinya. Cukup baca hasilnya.
-- =====================================================================

with

-- 1. Hukum kekekalan stok.
--    Setiap barang yang keluar dari satu tempat pasti masuk ke tempat lain.
--    Jadi kalau semua saldo dijumlah, hasilnya WAJIB nol.
t1 as (
  select
    '1. Total semua saldo harus nol' as pemeriksaan,
    case when coalesce(sum(quantity), 0) = 0
         then 'OK' else 'BAHAYA' end as hasil,
    'selisih: ' || coalesce(sum(quantity), 0)::text as detail
  from stock_quant
),

-- 2. Stok minus di gudang/toko beneran.
--    Lokasi virtual boleh minus. Lokasi fisik TIDAK BOLEH.
t2 as (
  select
    '2. Tidak ada stok minus di gudang/toko' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'BAHAYA' end as hasil,
    count(*)::text || ' item minus' as detail
  from stock_quant q
  join location l on l.id = q.location_id
  where l.usage = 'internal' and q.quantity < 0
),

-- 3. Saldo tersimpan vs hitung ulang dari riwayat.
--    Angka yang dipakai kasir harus sama persis dengan hasil
--    penjumlahan seluruh riwayat pergerakan. Kalau beda, ada yang
--    menyentuh stok lewat jalan belakang.
riwayat as (
  select variant_id, src_id as loc, -sum(qty_done) as qty
  from stock_move_line group by variant_id, src_id
  union all
  select variant_id, dest_id, sum(qty_done)
  from stock_move_line group by variant_id, dest_id
),
riwayat_total as (
  select variant_id, loc, sum(qty) as qty from riwayat group by variant_id, loc
),
t3 as (
  select
    '3. Saldo cocok dengan riwayat' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'BAHAYA' end as hasil,
    count(*)::text || ' item tidak cocok' as detail
  from stock_quant q
  full outer join riwayat_total r
    on r.variant_id = q.variant_id and r.loc = q.location_id
  where abs(coalesce(q.quantity, 0) - coalesce(r.qty, 0)) > 0.0001
),

-- 4. Sesi kasir yang lupa ditutup lebih dari 24 jam.
--    Selama sesi belum ditutup, penjualannya belum terbukukan.
t4 as (
  select
    '4. Tidak ada sesi kasir menggantung' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'PERIKSA' end as hasil,
    count(*)::text || ' sesi belum ditutup >24 jam' as detail
  from pos_session
  where state <> 'closed' and opened_at < now() - interval '24 hours'
),

-- 5. Struk yang totalnya tidak sama dengan jumlah pembayaran.
t5 as (
  select
    '5. Pembayaran sama dengan total struk' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'BAHAYA' end as hasil,
    count(*)::text || ' struk tidak seimbang' as detail
  from (
    select o.id
    from pos_order o
    left join pos_payment p on p.order_id = o.id
    where o.state in ('paid', 'posted')
    group by o.id, o.grand_total
    having abs(o.grand_total - coalesce(sum(p.amount), 0)) > 0.01
  ) x
),

-- 6. Perintah produksi yang statusnya selesai tapi tidak ada
--    catatan pemakaian bahan. Artinya barang jadi muncul dari udara.
t6 as (
  select
    '6. Produksi selesai punya catatan bahan' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'BAHAYA' end as hasil,
    count(*)::text || ' produksi tanpa catatan bahan' as detail
  from manufacturing_order mo
  where mo.state = 'done'
    and not exists (
      select 1 from stock_move m where m.production_id = mo.id
    )
),

-- 7. Barang yang dijual di kasir tapi tidak punya catatan stok keluar.
t7 as (
  select
    '7. Penjualan terbukukan punya catatan stok' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'BAHAYA' end as hasil,
    count(*)::text || ' struk tanpa catatan stok' as detail
  from pos_order o
  where o.state = 'posted'
    and not exists (
      select 1 from stock_move m where m.pos_order_id = o.id
    )
),

-- 8. Barcode ganda. Bikin kasir salah scan barang.
t8 as (
  select
    '8. Tidak ada barcode ganda' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'PERIKSA' end as hasil,
    count(*)::text || ' barcode dipakai lebih dari satu varian' as detail
  from (
    select barcode from product_variant
    where barcode is not null
    group by barcode having count(*) > 1
  ) y
),

-- 9. Barang jadi yang ditandai "diproduksi sendiri" tapi belum punya resep.
t9 as (
  select
    '9. Produk produksi punya resep (BOM)' as pemeriksaan,
    case when count(*) = 0 then 'OK' else 'PERIKSA' end as hasil,
    count(*)::text || ' produk belum punya resep' as detail
  from product_template t
  where t.is_manufactured and t.active
    and not exists (
      select 1 from bom b where b.template_id = t.id and b.active
    )
)

select * from t1
union all select * from t2
union all select * from t3
union all select * from t4
union all select * from t5
union all select * from t6
union all select * from t7
union all select * from t8
union all select * from t9;

-- =====================================================================
-- ARTI HASIL
--   OK      = aman
--   PERIKSA = belum tentu salah, tapi lihat sendiri
--   BAHAYA  = sistem sedang berbohong. Jangan tambah fitur baru.
--             Suruh AI memperbaiki ini dulu sampai hijau.
-- =====================================================================

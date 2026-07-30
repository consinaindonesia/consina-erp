-- ============================================================
-- M2 — Gerbang kebenaran
-- Simulasi satu siklus bisnis penuh, semuanya lewat stock_move +
-- stock_move_line. Cocok dijalankan sekali di atas seed M1 yang masih
-- bersih (belum ada transaksi lain). Jalankan sql/cek-kesehatan.sql
-- setelah tiap langkah — semua harus OK sebelum lanjut ke langkah
-- berikutnya. Referensi tiap gerakan diberi awalan M2/... supaya
-- gampang dibedakan dari data asli nanti.
-- ============================================================

-- ---------- Langkah 1: beli bahan baku dari supplier ----------
-- Kain, resleting, DAN webbing dibeli sekaligus (bukan cuma kain
-- seperti draf awal rencana) supaya produksi di langkah 2 tidak
-- membuat stok fisik minus. Lihat docs/keputusan.md bagian M2.
with new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id)
  select 'M2/PEMBELIAN-01', l_sup.id, l_gbj.id
  from
    (select id from location where usage = 'supplier') l_sup,
    (select id from location where code = '00GBJ/Stock') l_gbj
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select new_move.id, v.id, new_move.src_location_id, new_move.dest_location_id, x.qty
from new_move, product_variant v, (values
  ('RM-KAIN', 100), ('RM-RESL', 20), ('RM-WEBB', 15)
) as x(sku, qty)
where v.sku = x.sku;

-- ---------- Langkah 2: produksi 10 unit Jaket Hitam ----------
-- Konsumsi sesuai BOM: 12m kain, 10pcs resleting, 8m webbing.
with mo as (
  insert into manufacturing_order (reference, bom_id, variant_id, qty_planned, qty_produced, state, done_at)
  select 'M2/PRODUKSI-01', b.id, v.id, 10, 10, 'done', now()
  from bom b, product_variant v
  where b.name = 'BOM Jaket Consina Champers Hill' and v.sku = 'JCH-BK'
  returning id
),
consume_move as (
  insert into stock_move (reference, src_location_id, dest_location_id, production_id)
  select 'M2/PRODUKSI-01/KONSUMSI', l_gbj.id, l_prod.id, mo.id
  from mo,
    (select id from location where code = '00GBJ/Stock') l_gbj,
    (select id from location where usage = 'production') l_prod
  returning id, src_location_id, dest_location_id
),
consume_lines as (
  insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
  select consume_move.id, v.id, consume_move.src_location_id, consume_move.dest_location_id, x.qty
  from consume_move, product_variant v, (values
    ('RM-KAIN', 12), ('RM-RESL', 10), ('RM-WEBB', 8)
  ) as x(sku, qty)
  where v.sku = x.sku
  returning 1
),
output_move as (
  insert into stock_move (reference, src_location_id, dest_location_id, production_id)
  select 'M2/PRODUKSI-01/HASIL', l_prod.id, l_gbj.id, mo.id
  from mo,
    (select id from location where usage = 'production') l_prod,
    (select id from location where code = '00GBJ/Stock') l_gbj
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select output_move.id, v.id, output_move.src_location_id, output_move.dest_location_id, 10
from output_move, product_variant v
where v.sku = 'JCH-BK';

-- ---------- Langkah 3: transfer 4 unit ke Toko Bogor lewat transit ----------
-- Dua langkah wajib: kirim ke transit, baru diterima di tujuan.
with new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id)
  select 'M2/TRANSFER-01-KIRIM', l_gbj.id, l_transit.id
  from
    (select id from location where code = '00GBJ/Stock') l_gbj,
    (select id from location where usage = 'transit') l_transit
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select new_move.id, v.id, new_move.src_location_id, new_move.dest_location_id, 4
from new_move, product_variant v where v.sku = 'JCH-BK';

-- (cek saldo di sini: 4 unit harus terlihat di lokasi transit, belum
-- di Toko Bogor — buktikan barang "dalam perjalanan" beneran tercatat)

with new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id)
  select 'M2/TRANSFER-01-TERIMA', l_transit.id, l_bgr.id
  from
    (select id from location where usage = 'transit') l_transit,
    (select id from location where code = '15BGR/Stock') l_bgr
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select new_move.id, v.id, new_move.src_location_id, new_move.dest_location_id, 4
from new_move, product_variant v where v.sku = 'JCH-BK';

-- ---------- Langkah 4: jual 1 unit di kasir Toko Bogor, tutup sesi ----------
-- Buka sesi + catat penjualan (state='paid', stok BELUM bergerak):
with sess as (
  insert into pos_session (warehouse_id, opening_cash)
  select id, 500000 from warehouse where code = '15BGR'
  returning id
),
ord as (
  insert into pos_order (session_id, client_uuid, order_no, state, subtotal, discount_total, tax_total, grand_total)
  select sess.id, gen_random_uuid(), 'M2/POS-0001', 'paid', 850000, 0, 0, 850000
  from sess
  returning id
),
line as (
  insert into pos_order_line (order_id, variant_id, qty, unit_price, discount, line_total)
  select ord.id, v.id, 1, 850000, 0, 850000
  from ord, product_variant v where v.sku = 'JCH-BK'
  returning order_id
)
insert into pos_payment (order_id, method, amount)
select order_id, 'cash', 850000 from line;

-- Tutup sesi: stok & status order dibukukan dalam SATU statement.
with sess as (
  select id from pos_session
  where warehouse_id = (select id from warehouse where code = '15BGR') and state = 'open'
),
close_sess as (
  update pos_session set state = 'closed', closed_at = now(), closing_cash = 500000 + 850000, cash_difference = 0
  where id in (select id from sess)
  returning id
),
posted_orders as (
  update pos_order set state = 'posted'
  where session_id in (select id from close_sess)
  returning id
),
new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id, pos_order_id)
  select 'M2/POS-0001', l_bgr.id, l_cust.id, posted_orders.id
  from posted_orders,
    (select id from location where code = '15BGR/Stock') l_bgr,
    (select id from location where usage = 'customer') l_cust
  returning id, pos_order_id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select new_move.id, ol.variant_id, new_move.src_location_id, new_move.dest_location_id, ol.qty
from new_move
join pos_order_line ol on ol.order_id = new_move.pos_order_id;

-- ---------- Langkah 5: retur 1 unit dari pelanggan ----------
-- Koreksi = INSERT arah sebaliknya, terhubung lewat reversal_of_id.
with orig as (
  select ml.id from stock_move_line ml
  join stock_move m on m.id = ml.move_id
  where m.reference = 'M2/POS-0001'
),
new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id)
  select 'M2/RETUR-01', l_cust.id, l_bgr.id
  from
    (select id from location where usage = 'customer') l_cust,
    (select id from location where code = '15BGR/Stock') l_bgr
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done, reversal_of_id)
select new_move.id, v.id, new_move.src_location_id, new_move.dest_location_id, 1, orig.id
from new_move, orig, product_variant v where v.sku = 'JCH-BK';

-- ---------- Langkah 6: stock opname, fisik kurang 1 unit ----------
with new_move as (
  insert into stock_move (reference, src_location_id, dest_location_id, note)
  select 'M2/OPNAME-01', l_bgr.id, l_loss.id, 'Stock opname: fisik kurang 1 unit dari catatan sistem'
  from
    (select id from location where code = '15BGR/Stock') l_bgr,
    (select id from location where usage = 'inventory_loss') l_loss
  returning id, src_location_id, dest_location_id
)
insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
select new_move.id, v.id, new_move.src_location_id, new_move.dest_location_id, 1
from new_move, product_variant v where v.sku = 'JCH-BK';

-- ============================================================
-- Hasil akhir yang diharapkan (Jaket Hitam, JCH-BK):
--   00GBJ/Stock (Gudang Pusat) = 6 unit
--   15BGR/Stock (Toko Bogor)   = 3 unit
--   VIRT/INVENTORY-LOSS        = 1 unit (opname)
--   VIRT/PRODUCTION            = -10 unit (sumber produksi, wajar minus)
--   Total keseluruhan lokasi   = 0 (hukum kekekalan stok)
-- cek-kesehatan.sql harus 9/9 OK setelah setiap langkah di atas.
-- ============================================================

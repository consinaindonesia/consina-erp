-- ============================================================
-- M7: laporan. Semua perhitungan (saldo berjalan, total nilai,
-- usulan pesan ulang) dilakukan di Postgres, bukan di frontend —
-- konsisten dengan hukum #4 CLAUDE.md. Tidak ada tabel baru, hanya
-- fungsi baca (read-only).
-- ============================================================

-- ---------- 1. Kartu stok satu produk ----------
-- Menunjukkan setiap pergerakan produk itu di seluruh sistem, urut
-- waktu, plus saldo total yang benar-benar dipegang perusahaan
-- (dijumlah dari semua lokasi fisik/internal) setelah tiap
-- pergerakan. Transfer antar lokasi internal (mis. pusat -> toko)
-- tidak mengubah saldo ini (barang cuma pindah tempat, bukan
-- masuk/keluar perusahaan) — sesuai definisi "kartu stok" yang bisa
-- dirunut dari pembelian sampai penjualan tanpa lompatan angka.
create or replace function fn_stock_card(p_variant_id uuid)
returns table (
  happened_at timestamptz,
  reference text,
  src_name text,
  src_usage text,
  dest_name text,
  dest_usage text,
  qty numeric,
  net_change numeric,
  running_balance numeric
)
language sql
stable
set search_path = public
as $$
  select
    sml.created_at,
    sm.reference,
    sl.name,
    sl.usage,
    dl.name,
    dl.usage,
    sml.qty_done,
    (case when dl.usage = 'internal' then sml.qty_done else 0 end)
      - (case when sl.usage = 'internal' then sml.qty_done else 0 end) as net_change,
    sum(
      (case when dl.usage = 'internal' then sml.qty_done else 0 end)
      - (case when sl.usage = 'internal' then sml.qty_done else 0 end)
    ) over (order by sml.created_at, sml.id)
  from stock_move_line sml
  join stock_move sm on sm.id = sml.move_id
  join location sl on sl.id = sml.src_id
  join location dl on dl.id = sml.dest_id
  where sml.variant_id = p_variant_id
  order by sml.created_at, sml.id;
$$;

-- ---------- 2. Penjualan per toko ----------
create or replace function fn_sales_by_store(p_from date default null, p_to date default null)
returns table (
  warehouse_id uuid,
  warehouse_code text,
  warehouse_name text,
  order_count bigint,
  qty_sold numeric,
  revenue numeric
)
language sql
stable
set search_path = public
as $$
  select
    w.id, w.code, w.name,
    count(distinct o.id),
    coalesce(sum(ol.qty), 0),
    coalesce(sum(ol.line_total), 0)
  from warehouse w
  join pos_session ps on ps.warehouse_id = w.id
  join pos_order o on o.session_id = ps.id and o.state = 'posted'
  join pos_order_line ol on ol.order_id = o.id
  where (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to + 1)
  group by w.id, w.code, w.name
  order by w.code;
$$;

-- ---------- 3. Nilai persediaan ----------
-- Per varian, di semua lokasi internal, dikali cost_price saat ini.
create or replace function fn_inventory_value()
returns table (
  variant_id uuid,
  sku text,
  product_name text,
  qty_on_hand numeric,
  cost_price numeric,
  total_value numeric
)
language sql
stable
set search_path = public
as $$
  select
    pv.id, pv.sku, pt.name,
    sum(sq.quantity),
    pt.cost_price,
    sum(sq.quantity) * pt.cost_price
  from stock_quant sq
  join location l on l.id = sq.location_id and l.usage = 'internal'
  join product_variant pv on pv.id = sq.variant_id
  join product_template pt on pt.id = pv.template_id
  group by pv.id, pv.sku, pt.name, pt.cost_price
  having sum(sq.quantity) > 0
  order by pt.name, pv.sku;
$$;

create or replace function fn_inventory_value_total()
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(sq.quantity * pt.cost_price), 0)
  from stock_quant sq
  join location l on l.id = sq.location_id and l.usage = 'internal'
  join product_variant pv on pv.id = sq.variant_id
  join product_template pt on pt.id = pv.template_id;
$$;

-- ---------- 4. Produk di bawah titik minimum + usulan pesan ulang ----------
-- reorder_point diperlakukan sebagai batas minimum PER LOKASI (bukan
-- total perusahaan) — supaya bisa membedakan "toko kosong padahal
-- gudang pusat ada stok" (usul: transfer) dari "seluruh perusahaan
-- memang kurang" (usul: beli/produksi). Untuk gudang pusat sendiri
-- (tidak ada tempat lebih atas untuk transfer), usulnya selalu
-- beli/produksi.
create or replace function fn_reorder_suggestions()
returns table (
  warehouse_id uuid,
  warehouse_code text,
  warehouse_name text,
  variant_id uuid,
  sku text,
  product_name text,
  reorder_point numeric,
  qty_on_hand numeric,
  central_qty_on_hand numeric,
  suggestion text
)
language sql
stable
set search_path = public
as $$
  with local_stock as (
    select w.id as warehouse_id, w.code as warehouse_code, w.name as warehouse_name,
           w.is_store, pv.id as variant_id, pv.sku, pt.name as product_name,
           pt.reorder_point, pt.is_manufactured,
           coalesce(sq.quantity, 0) as qty_on_hand
    from warehouse w
    join location l on l.warehouse_id = w.id and l.usage = 'internal'
    cross join product_variant pv
    join product_template pt on pt.id = pv.template_id and pt.active
    left join stock_quant sq on sq.location_id = l.id and sq.variant_id = pv.id
    where pt.reorder_point > 0 and pv.active
  ),
  central as (
    select variant_id, qty_on_hand as central_qty
    from local_stock where is_store = false
  )
  select
    ls.warehouse_id, ls.warehouse_code, ls.warehouse_name,
    ls.variant_id, ls.sku, ls.product_name,
    ls.reorder_point, ls.qty_on_hand,
    c.central_qty,
    case
      when ls.is_store and c.central_qty >= (ls.reorder_point - ls.qty_on_hand) then 'Transfer dari Gudang Pusat'
      when ls.is_manufactured then 'Produksi'
      else 'Beli dari supplier'
    end as suggestion
  from local_stock ls
  left join central c on c.variant_id = ls.variant_id
  where ls.qty_on_hand < ls.reorder_point
  order by ls.warehouse_code, ls.product_name;
$$;

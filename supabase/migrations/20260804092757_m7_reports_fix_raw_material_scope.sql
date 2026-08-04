-- Bahan baku (is_manufactured = false) cuma disimpan di gudang pusat —
-- toko tidak pernah menyetok bahan baku, jadi toko yang "kosong" bahan
-- baku itu normal, bukan kekurangan. Batasi cek bahan baku hanya di
-- gudang non-toko (is_store = false).
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
      and not (w.is_store and not pt.is_manufactured)
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

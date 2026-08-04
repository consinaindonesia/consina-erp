-- ============================================================
-- M6: produksi. BOM dapat routing (work center per operasi),
-- Manufacturing Order dipecah jadi Work Order per operasi, dan
-- biaya produksi diserap ke nilai barang jadi lewat
-- stock_valuation_layer (tabel yang sudah disiapkan sejak M1).
-- ============================================================

create table work_center (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true
);

-- Urutan operasi di dalam satu resep (mis. Potong -> Jahit -> QC -> Kemas)
create table bom_operation (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references bom(id) on delete cascade,
  work_center_id uuid not null references work_center(id),
  sequence integer not null,
  name text not null,
  unique (bom_id, sequence)
);

-- Manufacturing order butuh tahu di gudang mana bahan diambil & barang
-- jadi disimpan. Kolom ini belum ada dari M1.
alter table manufacturing_order add column warehouse_id uuid references warehouse(id);
update manufacturing_order set warehouse_id = (select id from warehouse where code = '00GBJ') where warehouse_id is null;

-- Satu work_order = satu operasi untuk satu manufacturing_order.
-- Operator menandai selesai satu-satu sesuai urutan.
create table work_order (
  id uuid primary key default gen_random_uuid(),
  manufacturing_order_id uuid not null references manufacturing_order(id) on delete cascade,
  bom_operation_id uuid not null references bom_operation(id),
  work_center_id uuid not null references work_center(id),
  sequence integer not null,
  name text not null,
  state text not null default 'pending' check (state in ('pending','in_progress','done')),
  started_at timestamptz,
  done_at timestamptz
);

alter table work_center enable row level security;
alter table bom_operation enable row level security;
alter table work_order enable row level security;

-- ---------- Buat Manufacturing Order + Work Order sesuai routing BOM ----------
create or replace function fn_create_manufacturing_order(
  p_reference text,
  p_bom_id uuid,
  p_variant_id uuid,
  p_warehouse_id uuid,
  p_qty_planned numeric
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_mo_id uuid;
  v_op record;
begin
  insert into manufacturing_order (reference, bom_id, variant_id, warehouse_id, qty_planned, state)
  values (p_reference, p_bom_id, p_variant_id, p_warehouse_id, p_qty_planned, 'confirmed')
  returning id into v_mo_id;

  for v_op in
    select id, work_center_id, sequence, name from bom_operation where bom_id = p_bom_id order by sequence
  loop
    insert into work_order (manufacturing_order_id, bom_operation_id, work_center_id, sequence, name)
    values (v_mo_id, v_op.id, v_op.work_center_id, v_op.sequence, v_op.name);
  end loop;

  return v_mo_id;
end;
$$;

-- ---------- Operator menandai satu operasi selesai ----------
create or replace function fn_complete_work_order(p_work_order_id uuid) returns void
language plpgsql
set search_path = public
as $$
begin
  update work_order
  set state = 'done', done_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_work_order_id and state <> 'done';

  if not found then
    raise exception 'Work order tidak ditemukan atau sudah selesai';
  end if;
end;
$$;

-- ---------- Selesaikan produksi: konsumsi bahan, hasilkan barang jadi,
-- serap biaya ke nilai barang jadi. Satu transaksi. ----------
create or replace function fn_complete_manufacturing_order(
  p_mo_id uuid,
  p_qty_produced numeric
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_mo record;
  v_src_location_id uuid;
  v_prod_location_id uuid;
  v_line record;
  v_available numeric;
  v_consume_move_id uuid;
  v_output_move_id uuid;
  v_output_line_id uuid;
  v_total_cost numeric := 0;
  v_qty_consumed numeric;
  v_unit_cost numeric;
  v_existing_qty numeric;
  v_existing_cost numeric;
  v_pending_ops int;
begin
  select * into v_mo from manufacturing_order where id = p_mo_id;
  if v_mo is null then
    raise exception 'Manufacturing order tidak ditemukan';
  end if;
  if v_mo.state = 'done' then
    raise exception 'Manufacturing order ini sudah selesai';
  end if;

  select count(*) into v_pending_ops from work_order
  where manufacturing_order_id = p_mo_id and state <> 'done';
  if v_pending_ops > 0 then
    raise exception '% operasi belum ditandai selesai', v_pending_ops;
  end if;

  select id into v_src_location_id from location where warehouse_id = v_mo.warehouse_id and usage = 'internal' limit 1;
  select id into v_prod_location_id from location where usage = 'production' limit 1;

  -- Cek ketersediaan bahan dulu, sebelum menyentuh apa pun.
  for v_line in
    select bl.component_variant_id, bl.qty_per_unit, (bl.qty_per_unit * v_mo.qty_planned) as qty_needed
    from bom_line bl where bl.bom_id = v_mo.bom_id
  loop
    select coalesce(quantity, 0) into v_available from stock_quant
      where variant_id = v_line.component_variant_id and location_id = v_src_location_id;
    if coalesce(v_available, 0) < v_line.qty_needed then
      raise exception 'Bahan % kurang: butuh %, tersedia %', v_line.component_variant_id, v_line.qty_needed, coalesce(v_available, 0);
    end if;
  end loop;

  -- Konsumsi bahan sesuai resep x qty_planned.
  insert into stock_move (reference, src_location_id, dest_location_id, production_id, done_at)
  values (v_mo.reference || '/KONSUMSI', v_src_location_id, v_prod_location_id, p_mo_id, now())
  returning id into v_consume_move_id;

  for v_line in
    select bl.component_variant_id, bl.qty_per_unit, (bl.qty_per_unit * v_mo.qty_planned) as qty_needed, t.cost_price
    from bom_line bl
    join product_variant v on v.id = bl.component_variant_id
    join product_template t on t.id = v.template_id
    where bl.bom_id = v_mo.bom_id
  loop
    v_qty_consumed := v_line.qty_needed;
    insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
    values (v_consume_move_id, v_line.component_variant_id, v_src_location_id, v_prod_location_id, v_qty_consumed);
    v_total_cost := v_total_cost + (v_qty_consumed * v_line.cost_price);
  end loop;

  -- Hasilkan barang jadi.
  insert into stock_move (reference, src_location_id, dest_location_id, production_id, done_at)
  values (v_mo.reference || '/HASIL', v_prod_location_id, v_src_location_id, p_mo_id, now())
  returning id into v_output_move_id;

  insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
  values (v_output_move_id, v_mo.variant_id, v_prod_location_id, v_src_location_id, p_qty_produced)
  returning id into v_output_line_id;

  -- Serap biaya produksi ke nilai barang jadi (stock_valuation_layer),
  -- lalu perbarui cost_price produk pakai rata-rata tertimbang.
  v_unit_cost := v_total_cost / p_qty_produced;

  insert into stock_valuation_layer (move_line_id, variant_id, quantity, unit_cost, value)
  values (v_output_line_id, v_mo.variant_id, p_qty_produced, v_unit_cost, v_total_cost);

  select coalesce(sum(quantity), 0) into v_existing_qty
  from stock_quant q join location l on l.id = q.location_id
  where q.variant_id = v_mo.variant_id and l.usage = 'internal';
  -- v_existing_qty sudah termasuk hasil produksi ini (trigger sudah jalan
  -- lewat insert stock_move_line di atas), jadi qty SEBELUM produksi ini:
  v_existing_qty := v_existing_qty - p_qty_produced;

  select cost_price into v_existing_cost from product_template where id = (select template_id from product_variant where id = v_mo.variant_id);

  update product_template
  set cost_price = case
    when v_existing_qty <= 0 then v_unit_cost
    else ((v_existing_qty * v_existing_cost) + (p_qty_produced * v_unit_cost)) / (v_existing_qty + p_qty_produced)
  end
  where id = (select template_id from product_variant where id = v_mo.variant_id);

  update manufacturing_order
  set qty_produced = p_qty_produced, state = 'done', done_at = now()
  where id = p_mo_id;
end;
$$;

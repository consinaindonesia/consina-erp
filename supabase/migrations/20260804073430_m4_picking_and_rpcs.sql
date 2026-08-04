-- ============================================================
-- M4: penerimaan barang, transfer antar gudang (2 langkah lewat
-- transit), stock opname. Semua lewat RPC satu-transaksi (hukum #5).
-- ============================================================

create table stock_picking (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  type text not null check (type in ('receipt','internal_transfer','opname')),
  src_location_id uuid not null references location(id),
  dest_location_id uuid not null references location(id),
  state text not null default 'draft' check (state in ('draft','waiting','done','cancel')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table stock_picking enable row level security;

alter table stock_move
  add constraint stock_move_picking_fk foreign key (picking_id) references stock_picking(id);

-- ---------- Penerimaan barang dari supplier ----------
create or replace function fn_receive_goods(
  p_reference text,
  p_src_location_id uuid,
  p_dest_location_id uuid,
  p_lines jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_picking_id uuid;
  v_move_id uuid;
  v_line jsonb;
begin
  insert into stock_picking (reference, type, src_location_id, dest_location_id, state, done_at)
  values (p_reference, 'receipt', p_src_location_id, p_dest_location_id, 'done', now())
  returning id into v_picking_id;

  insert into stock_move (reference, src_location_id, dest_location_id, picking_id, done_at)
  values (p_reference, p_src_location_id, p_dest_location_id, v_picking_id, now())
  returning id into v_move_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
    values (
      v_move_id,
      (v_line->>'variant_id')::uuid,
      p_src_location_id,
      p_dest_location_id,
      (v_line->>'qty')::numeric
    );
  end loop;

  return v_picking_id;
end;
$$;

-- ---------- Transfer langkah 1: kirim ke transit ----------
create or replace function fn_transfer_send(
  p_reference text,
  p_src_location_id uuid,
  p_dest_warehouse_id uuid,
  p_lines jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_transit_id uuid;
  v_dest_location_id uuid;
  v_picking_id uuid;
  v_move_id uuid;
  v_line jsonb;
begin
  select id into v_transit_id from location where usage = 'transit' limit 1;
  select id into v_dest_location_id from location where warehouse_id = p_dest_warehouse_id and usage = 'internal' limit 1;

  if v_transit_id is null then
    raise exception 'Lokasi transit tidak ditemukan';
  end if;
  if v_dest_location_id is null then
    raise exception 'Gudang tujuan tidak punya lokasi internal';
  end if;

  insert into stock_picking (reference, type, src_location_id, dest_location_id, state)
  values (p_reference, 'internal_transfer', p_src_location_id, v_dest_location_id, 'waiting')
  returning id into v_picking_id;

  insert into stock_move (reference, src_location_id, dest_location_id, picking_id, done_at)
  values (p_reference || '/KIRIM', p_src_location_id, v_transit_id, v_picking_id, now())
  returning id into v_move_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
    values (v_move_id, (v_line->>'variant_id')::uuid, p_src_location_id, v_transit_id, (v_line->>'qty')::numeric);
  end loop;

  return v_picking_id;
end;
$$;

-- ---------- Transfer langkah 2: terima di tujuan ----------
create or replace function fn_transfer_receive(p_picking_id uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  v_picking record;
  v_transit_id uuid;
  v_move_id uuid;
  v_line record;
begin
  select * into v_picking from stock_picking where id = p_picking_id;
  if v_picking is null then
    raise exception 'Picking tidak ditemukan';
  end if;
  if v_picking.state <> 'waiting' then
    raise exception 'Picking ini tidak sedang menunggu diterima (status: %)', v_picking.state;
  end if;

  select id into v_transit_id from location where usage = 'transit' limit 1;

  insert into stock_move (reference, src_location_id, dest_location_id, picking_id, done_at)
  values (v_picking.reference || '/TERIMA', v_transit_id, v_picking.dest_location_id, p_picking_id, now())
  returning id into v_move_id;

  for v_line in
    select ml.variant_id, ml.qty_done
    from stock_move_line ml
    join stock_move m on m.id = ml.move_id
    where m.picking_id = p_picking_id and m.dest_location_id = v_transit_id
  loop
    insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
    values (v_move_id, v_line.variant_id, v_transit_id, v_picking.dest_location_id, v_line.qty_done);
  end loop;

  update stock_picking set state = 'done', done_at = now() where id = p_picking_id;
end;
$$;

-- ---------- Stock opname ----------
create or replace function fn_stock_opname(
  p_reference text,
  p_location_id uuid,
  p_counts jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_loss_id uuid;
  v_picking_id uuid;
  v_shortage_move_id uuid;
  v_surplus_move_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_counted numeric;
  v_current numeric;
  v_diff numeric;
  v_has_shortage boolean := false;
  v_has_surplus boolean := false;
begin
  select id into v_loss_id from location where usage = 'inventory_loss' limit 1;

  insert into stock_picking (reference, type, src_location_id, dest_location_id, state, done_at)
  values (p_reference, 'opname', p_location_id, p_location_id, 'done', now())
  returning id into v_picking_id;

  for v_line in select * from jsonb_array_elements(p_counts)
  loop
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_counted := (v_line->>'counted_qty')::numeric;
    select coalesce(quantity, 0) into v_current from stock_quant
      where variant_id = v_variant_id and location_id = p_location_id;
    v_current := coalesce(v_current, 0);
    v_diff := v_counted - v_current;

    if v_diff < 0 then
      if not v_has_shortage then
        insert into stock_move (reference, src_location_id, dest_location_id, picking_id, note, done_at)
        values (p_reference, p_location_id, v_loss_id, v_picking_id, 'Stock opname: selisih kurang', now())
        returning id into v_shortage_move_id;
        v_has_shortage := true;
      end if;
      insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
      values (v_shortage_move_id, v_variant_id, p_location_id, v_loss_id, abs(v_diff));
    elsif v_diff > 0 then
      if not v_has_surplus then
        insert into stock_move (reference, src_location_id, dest_location_id, picking_id, note, done_at)
        values (p_reference, v_loss_id, p_location_id, v_picking_id, 'Stock opname: selisih lebih', now())
        returning id into v_surplus_move_id;
        v_has_surplus := true;
      end if;
      insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
      values (v_surplus_move_id, v_variant_id, v_loss_id, p_location_id, v_diff);
    end if;
  end loop;

  return v_picking_id;
end;
$$;

-- ============================================================
-- M5: kasir offline-first. Order disinkronkan pakai client_uuid
-- sebagai kunci idempoten (aman disinkron berkali-kali). Stok &
-- jurnal baru dibukukan saat sesi ditutup, satu transaksi.
-- ============================================================

-- Satu gudang/toko cuma boleh punya satu sesi kasir yang terbuka
-- di saat bersamaan.
create unique index pos_session_one_open_per_warehouse
  on pos_session (warehouse_id) where state = 'open';

-- ---------- Sinkron 1 struk (idempoten lewat client_uuid) ----------
create or replace function fn_sync_pos_order(
  p_session_id uuid,
  p_client_uuid uuid,
  p_order_no text,
  p_lines jsonb,
  p_payments jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_line jsonb;
  v_variant_id uuid;
  v_qty numeric;
  v_price numeric;
  v_line_total numeric;
  v_payment jsonb;
begin
  select id into v_existing_id from pos_order where client_uuid = p_client_uuid;
  if v_existing_id is not null then
    -- Sudah pernah masuk lewat sinkron sebelumnya. Jangan dobel.
    return v_existing_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_qty := (v_line->>'qty')::numeric;
    select t.sale_price into v_price
      from product_variant v join product_template t on t.id = v.template_id
      where v.id = v_variant_id;
    v_subtotal := v_subtotal + (v_qty * v_price);
  end loop;

  v_tax := round(v_subtotal - v_subtotal / 1.11, 2);

  insert into pos_order (session_id, client_uuid, order_no, state, subtotal, discount_total, tax_total, grand_total)
  values (p_session_id, p_client_uuid, p_order_no, 'paid', v_subtotal, 0, v_tax, v_subtotal)
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_qty := (v_line->>'qty')::numeric;
    select t.sale_price into v_price
      from product_variant v join product_template t on t.id = v.template_id
      where v.id = v_variant_id;
    v_line_total := v_qty * v_price;
    insert into pos_order_line (order_id, variant_id, qty, unit_price, discount, line_total)
    values (v_order_id, v_variant_id, v_qty, v_price, 0, v_line_total);
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into pos_payment (order_id, method, amount)
    values (v_order_id, v_payment->>'method', (v_payment->>'amount')::numeric);
  end loop;

  return v_order_id;
end;
$$;

-- ---------- Tutup sesi: bukukan stok & status struk, satu transaksi ----------
create or replace function fn_close_pos_session(p_session_id uuid, p_counted_cash numeric) returns void
language plpgsql
set search_path = public
as $$
declare
  v_session record;
  v_src_location_id uuid;
  v_dest_location_id uuid;
  v_order record;
  v_move_id uuid;
  v_expected_cash numeric;
begin
  select * into v_session from pos_session where id = p_session_id;
  if v_session is null then
    raise exception 'Sesi tidak ditemukan';
  end if;
  if v_session.state = 'closed' then
    raise exception 'Sesi sudah ditutup';
  end if;

  select id into v_src_location_id from location where warehouse_id = v_session.warehouse_id and usage = 'internal' limit 1;
  select id into v_dest_location_id from location where usage = 'customer' limit 1;

  for v_order in
    select id, order_no from pos_order where session_id = p_session_id and state = 'paid'
  loop
    insert into stock_move (reference, src_location_id, dest_location_id, pos_order_id, done_at)
    values (v_order.order_no, v_src_location_id, v_dest_location_id, v_order.id, now())
    returning id into v_move_id;

    insert into stock_move_line (move_id, variant_id, src_id, dest_id, qty_done)
    select v_move_id, ol.variant_id, v_src_location_id, v_dest_location_id, ol.qty
    from pos_order_line ol where ol.order_id = v_order.id;

    update pos_order set state = 'posted' where id = v_order.id;
  end loop;

  select v_session.opening_cash + coalesce(sum(p.amount), 0) into v_expected_cash
  from pos_order o join pos_payment p on p.order_id = o.id
  where o.session_id = p_session_id and o.state = 'posted' and p.method = 'cash';

  update pos_session
  set state = 'closed', closed_at = now(), closing_cash = p_counted_cash,
      cash_difference = p_counted_cash - coalesce(v_expected_cash, v_session.opening_cash)
  where id = p_session_id;
end;
$$;

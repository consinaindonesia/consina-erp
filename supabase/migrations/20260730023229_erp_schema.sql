-- ============================================================
-- M1: skema inti ERP (lokasi, produk, stok double-entry, POS, produksi)
-- Hukum yang tidak bisa ditawar: lihat CLAUDE.md bagian 2.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Gudang & lokasi ----------

create table warehouse (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_store boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table location (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references warehouse(id),
  code text not null unique,
  name text not null,
  usage text not null check (usage in (
    'internal', 'supplier', 'customer', 'production',
    'inventory_loss', 'scrap', 'transit'
  )),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index location_warehouse_idx on location(warehouse_id);

-- ---------- Produk ----------

create table product_category (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references product_category(id)
);

create table uom (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table product_attribute (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table product_attribute_value (
  id uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references product_attribute(id),
  name text not null,
  code text not null,
  unique (attribute_id, code)
);

create table product_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references product_category(id),
  uom_id uuid not null references uom(id),
  is_manufactured boolean not null default false,
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  reorder_point numeric(14,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_variant (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references product_template(id),
  sku text not null unique,
  barcode text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index product_variant_barcode_idx on product_variant(barcode) where barcode is not null;

create table product_variant_attribute_value (
  variant_id uuid not null references product_variant(id),
  value_id uuid not null references product_attribute_value(id),
  primary key (variant_id, value_id)
);

-- ---------- BOM (resep produksi) ----------

create table bom (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references product_template(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table bom_line (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references bom(id) on delete cascade,
  component_variant_id uuid not null references product_variant(id),
  qty_per_unit numeric(14,4) not null check (qty_per_unit > 0)
);

-- ---------- Stok: buku besar double-entry ----------

create table stock_move (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  state text not null default 'done' check (state in ('draft','waiting','confirmed','done','cancel')),
  src_location_id uuid not null references location(id),
  dest_location_id uuid not null references location(id),
  production_id uuid,
  pos_order_id uuid,
  picking_id uuid,
  note text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

-- stock_move_line: SATU-SATUNYA cara mengubah stok. INSERT-only, permanen.
create table stock_move_line (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null references stock_move(id),
  variant_id uuid not null references product_variant(id),
  src_id uuid not null references location(id),
  dest_id uuid not null references location(id),
  qty_done numeric(14,4) not null check (qty_done > 0),
  reversal_of_id uuid references stock_move_line(id),
  created_at timestamptz not null default now()
);

create index stock_move_line_variant_src_idx on stock_move_line(variant_id, src_id);
create index stock_move_line_variant_dest_idx on stock_move_line(variant_id, dest_id);
create index stock_move_line_move_idx on stock_move_line(move_id);

-- stock_quant: saldo saat ini. HANYA boleh ditulis oleh trigger apply_move_line.
create table stock_quant (
  variant_id uuid not null references product_variant(id),
  location_id uuid not null references location(id),
  quantity numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id)
);

-- stock_valuation_layer: jejak biaya per pergerakan. Tabel disiapkan sekarang
-- (berstatus "tabel inti" di CLAUDE.md bagian 4), logikanya menyusul di M6/M7.
create table stock_valuation_layer (
  id uuid primary key default gen_random_uuid(),
  move_line_id uuid not null references stock_move_line(id),
  variant_id uuid not null references product_variant(id),
  quantity numeric(14,4) not null,
  unit_cost numeric(14,2) not null default 0,
  value numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Produksi ----------

create table manufacturing_order (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  bom_id uuid not null references bom(id),
  variant_id uuid not null references product_variant(id),
  qty_planned numeric(14,4) not null check (qty_planned > 0),
  qty_produced numeric(14,4) not null default 0,
  state text not null default 'draft' check (state in ('draft','confirmed','in_progress','done','cancel')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table stock_move
  add constraint stock_move_production_fk foreign key (production_id) references manufacturing_order(id);

-- ---------- POS ----------

create table pos_session (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouse(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  state text not null default 'open' check (state in ('open','closing','closed')),
  opening_cash numeric(14,2) not null default 0,
  closing_cash numeric(14,2),
  cash_difference numeric(14,2)
);

create table pos_order (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references pos_session(id),
  client_uuid uuid not null unique,
  order_no text not null unique,
  state text not null default 'draft' check (state in ('draft','paid','posted','cancelled','refunded')),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table stock_move
  add constraint stock_move_pos_order_fk foreign key (pos_order_id) references pos_order(id);

create table pos_order_line (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_order(id) on delete cascade,
  variant_id uuid not null references product_variant(id),
  qty numeric(14,4) not null check (qty > 0),
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);

create table pos_payment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_order(id) on delete cascade,
  method text not null check (method in ('cash','qris','edc')),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Trigger: apply_move_line — satu-satunya jalan mengubah stock_quant.
-- ============================================================
create or replace function apply_move_line()
returns trigger
language plpgsql
as $$
begin
  perform set_config('erp.internal_stock_write', 'on', true);

  insert into stock_quant (variant_id, location_id, quantity, updated_at)
  values (new.variant_id, new.src_id, -new.qty_done, now())
  on conflict (variant_id, location_id)
  do update set quantity = stock_quant.quantity - new.qty_done, updated_at = now();

  insert into stock_quant (variant_id, location_id, quantity, updated_at)
  values (new.variant_id, new.dest_id, new.qty_done, now())
  on conflict (variant_id, location_id)
  do update set quantity = stock_quant.quantity + new.qty_done, updated_at = now();

  perform set_config('erp.internal_stock_write', 'off', true);
  return new;
end;
$$;

create trigger stock_move_line_apply
  after insert on stock_move_line
  for each row execute function apply_move_line();

-- stock_quant tidak boleh ditulis langsung dari luar trigger apply_move_line.
create or replace function forbid_direct_quant_write()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('erp.internal_stock_write', true), 'off') <> 'on' then
    raise exception 'stock_quant hanya boleh diubah oleh trigger apply_move_line (lewat INSERT ke stock_move_line), tidak boleh ditulis langsung.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger stock_quant_guard
  before insert or update or delete on stock_quant
  for each row execute function forbid_direct_quant_write();

-- stock_move_line permanen: tidak boleh diupdate/dihapus oleh siapa pun.
-- Koreksi = INSERT baris baru dengan arah dibalik (isi reversal_of_id).
create or replace function forbid_move_line_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_move_line bersifat permanen — tidak boleh diubah atau dihapus. Buat pergerakan koreksi (arah sebaliknya) sebagai baris baru dan isi reversal_of_id.';
end;
$$;

create trigger stock_move_line_immutable
  before update or delete on stock_move_line
  for each row execute function forbid_move_line_mutation();

-- ============================================================
-- RLS: dikunci penuh dulu (belum ada kebijakan). Kebijakan baca/tulis
-- ditambahkan per fitur mulai M3 (master data) dan seterusnya.
-- ============================================================
alter table warehouse enable row level security;
alter table location enable row level security;
alter table product_category enable row level security;
alter table uom enable row level security;
alter table product_attribute enable row level security;
alter table product_attribute_value enable row level security;
alter table product_template enable row level security;
alter table product_variant enable row level security;
alter table product_variant_attribute_value enable row level security;
alter table bom enable row level security;
alter table bom_line enable row level security;
alter table stock_move enable row level security;
alter table stock_move_line enable row level security;
alter table stock_quant enable row level security;
alter table stock_valuation_layer enable row level security;
alter table manufacturing_order enable row level security;
alter table pos_session enable row level security;
alter table pos_order enable row level security;
alter table pos_order_line enable row level security;
alter table pos_payment enable row level security;

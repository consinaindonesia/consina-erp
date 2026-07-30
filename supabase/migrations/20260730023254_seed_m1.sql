-- ============================================================
-- M1: seed data awal (master data saja, belum ada transaksi).
-- 1 gudang pusat + 2 toko, lokasi virtual lengkap,
-- 1 produk jadi (2 varian warna), 3 bahan baku.
-- ============================================================

-- ---------- Gudang ----------
insert into warehouse (code, name, is_store) values
  ('00GBJ', 'Gudang Pusat', false),
  ('15BGR', 'Toko Bogor', true),
  ('22WNS', 'Toko Wonosobo', true);

-- ---------- Lokasi internal per gudang ----------
insert into location (warehouse_id, code, name, usage)
select id, code || '/Stock', name || ' - Stock', 'internal' from warehouse;

-- ---------- Lokasi virtual (tidak terikat gudang tertentu) ----------
insert into location (code, name, usage) values
  ('VIRT/SUPPLIER', 'Physical Locations/Vendors', 'supplier'),
  ('VIRT/CUSTOMER', 'Physical Locations/Customers', 'customer'),
  ('VIRT/PRODUCTION', 'Physical Locations/Production', 'production'),
  ('VIRT/INVENTORY-LOSS', 'Physical Locations/Inventory adjustment', 'inventory_loss'),
  ('VIRT/SCRAP', 'Physical Locations/Scrap', 'scrap'),
  ('VIRT/TRANSIT', 'Physical Locations/Inter-warehouse transit', 'transit');

-- ---------- Satuan (UOM) ----------
insert into uom (name) values ('PCS'), ('METER');

-- ---------- Atribut & nilai: WARNA ----------
insert into product_attribute (name) values ('WARNA');

insert into product_attribute_value (attribute_id, name, code)
select id, 'Hitam', 'BK' from product_attribute where name = 'WARNA'
union all
select id, 'Navy', 'NV' from product_attribute where name = 'WARNA';

-- ---------- Produk jadi: Jaket Consina Champers Hill (2 varian warna) ----------
insert into product_template (name, uom_id, is_manufactured, sale_price, cost_price)
select 'Jaket Consina Champers Hill', id, true, 850000, 0
from uom where name = 'PCS';

insert into product_variant (template_id, sku, barcode)
select t.id, 'JCH-BK', '8991000100016'
from product_template t where t.name = 'Jaket Consina Champers Hill'
union all
select t.id, 'JCH-NV', '8991000100023'
from product_template t where t.name = 'Jaket Consina Champers Hill';

insert into product_variant_attribute_value (variant_id, value_id)
select v.id, av.id
from product_variant v
join product_attribute_value av on av.code = 'BK'
where v.sku = 'JCH-BK'
union all
select v.id, av.id
from product_variant v
join product_attribute_value av on av.code = 'NV'
where v.sku = 'JCH-NV';

-- ---------- Bahan baku: kain, resleting, webbing ----------
insert into product_template (name, uom_id, is_manufactured, sale_price, cost_price)
select 'Kain Ripstop', id, false, 0, 45000 from uom where name = 'METER'
union all
select 'Resleting YKK No.5', id, false, 0, 12000 from uom where name = 'PCS'
union all
select 'Webbing 25mm', id, false, 0, 6000 from uom where name = 'METER';

insert into product_variant (template_id, sku, barcode)
select id, 'RM-KAIN', null from product_template where name = 'Kain Ripstop'
union all
select id, 'RM-RESL', null from product_template where name = 'Resleting YKK No.5'
union all
select id, 'RM-WEBB', null from product_template where name = 'Webbing 25mm';

-- ---------- BOM: resep Jaket Consina Champers Hill ----------
insert into bom (template_id, name)
select id, 'BOM Jaket Consina Champers Hill'
from product_template where name = 'Jaket Consina Champers Hill';

insert into bom_line (bom_id, component_variant_id, qty_per_unit)
select b.id, v.id, x.qty
from bom b
join (values ('RM-KAIN', 1.2), ('RM-RESL', 1), ('RM-WEBB', 0.8)) as x(sku, qty) on true
join product_variant v on v.sku = x.sku
where b.name = 'BOM Jaket Consina Champers Hill';

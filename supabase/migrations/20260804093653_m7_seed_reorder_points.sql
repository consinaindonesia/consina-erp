-- Contoh titik minimum yang realistis untuk demo laporan M7. reorder_point
-- sudah ada sejak M1 tapi belum pernah diisi milestone manapun (semua 0).
-- Ini kolom pengaturan biasa (sama seperti sale_price/cost_price), sudah
-- bisa diedit lewat halaman Produk (M3) — bukan data ledger.
update product_template set reorder_point = 100 where name = 'Kain Ripstop';
update product_template set reorder_point = 20 where name = 'Resleting YKK No.5';
update product_template set reorder_point = 15 where name = 'Webbing 25mm';
update product_template set reorder_point = 5 where name = 'Jaket Consina Champers Hill';

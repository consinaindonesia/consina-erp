-- Kunci search_path fungsi ke 'public' supaya tidak bisa dibajak lewat
-- search_path sesi yang dimanipulasi (saran security linter Supabase).
alter function apply_move_line() set search_path = public;
alter function forbid_direct_quant_write() set search_path = public;
alter function forbid_move_line_mutation() set search_path = public;

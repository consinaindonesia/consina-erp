insert into work_center (code, name) values
  ('CUT', 'Potong'),
  ('SEW', 'Jahit'),
  ('QC', 'Quality Control'),
  ('PACK', 'Kemas');

insert into bom_operation (bom_id, work_center_id, sequence, name)
select '43a82b98-b2ac-4a7e-b08d-6d91364942a1', wc.id, seq.n, wc.name
from (values (1, 'CUT'), (2, 'SEW'), (3, 'QC'), (4, 'PACK')) as seq(n, code)
join work_center wc on wc.code = seq.code;

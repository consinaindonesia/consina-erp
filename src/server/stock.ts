import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

type Admin = ReturnType<typeof getSupabaseAdmin>
type Line = { variant_id: string; qty: number }

function makeReference(prefix: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${prefix}/${stamp}`
}

export const listVariantsForPicker = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('product_variant')
    .select('id, sku, template:template_id(name)')
    .eq('active', true)
    .order('sku')
  if (error) throw new Error(error.message)
  return data
})

// ---------- Penerimaan barang dari supplier ----------

export async function receiveGoodsImpl(admin: Admin, destWarehouseId: string, lines: Array<Line>) {
  const [{ data: supplierLoc, error: supplierErr }, { data: destLoc, error: destErr }] = await Promise.all([
    admin.from('location').select('id').eq('usage', 'supplier').single(),
    admin.from('location').select('id').eq('warehouse_id', destWarehouseId).eq('usage', 'internal').single(),
  ])
  if (supplierErr) throw new Error(supplierErr.message)
  if (destErr) throw new Error(destErr.message)

  const { data, error } = await admin.rpc('fn_receive_goods', {
    p_reference: makeReference('RCV'),
    p_src_location_id: supplierLoc.id,
    p_dest_location_id: destLoc.id,
    p_lines: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
  })
  if (error) throw new Error(error.message)
  return { pickingId: data }
}

export const receiveGoods = createServerFn({ method: 'POST' })
  .validator((d: { dest_warehouse_id: string; lines: Array<Line> }) => d)
  .handler(({ data }) => receiveGoodsImpl(getSupabaseAdmin(), data.dest_warehouse_id, data.lines))

// ---------- Transfer antar gudang (2 langkah lewat transit) ----------

export async function transferSendImpl(
  admin: Admin,
  srcWarehouseId: string,
  destWarehouseId: string,
  lines: Array<Line>,
) {
  const { data: srcLoc, error: srcErr } = await admin
    .from('location')
    .select('id')
    .eq('warehouse_id', srcWarehouseId)
    .eq('usage', 'internal')
    .single()
  if (srcErr) throw new Error(srcErr.message)

  const { data, error } = await admin.rpc('fn_transfer_send', {
    p_reference: makeReference('TRF'),
    p_src_location_id: srcLoc.id,
    p_dest_warehouse_id: destWarehouseId,
    p_lines: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
  })
  if (error) throw new Error(error.message)
  return { pickingId: data }
}

export const transferSend = createServerFn({ method: 'POST' })
  .validator((d: { src_warehouse_id: string; dest_warehouse_id: string; lines: Array<Line> }) => d)
  .handler(({ data }) => transferSendImpl(getSupabaseAdmin(), data.src_warehouse_id, data.dest_warehouse_id, data.lines))

export async function transferReceiveImpl(admin: Admin, pickingId: string) {
  const { error } = await admin.rpc('fn_transfer_receive', { p_picking_id: pickingId })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const transferReceive = createServerFn({ method: 'POST' })
  .validator((pickingId: string) => pickingId)
  .handler(({ data }) => transferReceiveImpl(getSupabaseAdmin(), data))

// ---------- Barang dalam perjalanan ----------

export const listInTransit = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = getSupabaseAdmin()
  const { data: pickings, error } = await admin
    .from('stock_picking')
    .select(
      'id, reference, state, created_at, src:src_location_id(code, name), dest:dest_location_id(code, name)',
    )
    .eq('type', 'internal_transfer')
    .eq('state', 'waiting')
    .order('created_at')
  if (error) throw new Error(error.message)

  const results = []
  for (const p of pickings) {
    const { data: lines, error: linesErr } = await admin
      .from('stock_move_line')
      .select('qty_done, variant:variant_id(sku, template:template_id(name))')
      .eq('move_id', await moveIdForPicking(admin, p.id))
    if (linesErr) throw new Error(linesErr.message)
    results.push({ ...p, lines })
  }
  return results
})

async function moveIdForPicking(admin: Admin, pickingId: string) {
  const { data, error } = await admin
    .from('stock_move')
    .select('id')
    .eq('picking_id', pickingId)
    .like('reference', '%/KIRIM')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

// ---------- Stock opname ----------

export const listStockForLocation = createServerFn({ method: 'GET' })
  .validator((locationId: string) => locationId)
  .handler(async ({ data: locationId }) => {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('stock_quant')
      .select('variant_id, quantity, variant:variant_id(sku, template:template_id(name))')
      .eq('location_id', locationId)
      .gt('quantity', 0)
      .order('variant_id')
    if (error) throw new Error(error.message)
    return data
  })

export async function submitOpnameImpl(
  admin: Admin,
  locationId: string,
  counts: Array<{ variant_id: string; counted_qty: number }>,
) {
  const { data, error } = await admin.rpc('fn_stock_opname', {
    p_reference: makeReference('OPN'),
    p_location_id: locationId,
    p_counts: counts,
  })
  if (error) throw new Error(error.message)
  return { pickingId: data }
}

export const submitOpname = createServerFn({ method: 'POST' })
  .validator((d: { location_id: string; counts: Array<{ variant_id: string; counted_qty: number }> }) => d)
  .handler(({ data }) => submitOpnameImpl(getSupabaseAdmin(), data.location_id, data.counts))

import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

type Admin = ReturnType<typeof getSupabaseAdmin>

function makeReference(prefix: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}/${stamp}-${rand}`
}

// ---------- Work center (master data) ----------

export const listWorkCenters = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin().from('work_center').select('id, code, name, active').order('code')
  if (error) throw new Error(error.message)
  return data
})

export const createWorkCenter = createServerFn({ method: 'POST' })
  .validator((d: { code: string; name: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from('work_center').insert({ code: data.code, name: data.name })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- Produk yang punya BOM aktif (siap diproduksi) ----------

export const listManufacturableProducts = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('bom')
    .select('id, name, template:template_id(id, name, variants:product_variant(id, sku))')
    .eq('active', true)
  if (error) throw new Error(error.message)
  return data
})

export async function getBomDetailImpl(admin: Admin, bomId: string) {
  const [{ data: lines, error: linesErr }, { data: ops, error: opsErr }] = await Promise.all([
    admin
      .from('bom_line')
      .select('id, qty_per_unit, component:component_variant_id(id, sku, template:template_id(name, cost_price))')
      .eq('bom_id', bomId),
    admin
      .from('bom_operation')
      .select('id, sequence, name, work_center:work_center_id(code, name)')
      .eq('bom_id', bomId)
      .order('sequence'),
  ])
  if (linesErr) throw new Error(linesErr.message)
  if (opsErr) throw new Error(opsErr.message)
  return { lines, operations: ops }
}

export const getBomDetail = createServerFn({ method: 'GET' })
  .validator((bomId: string) => bomId)
  .handler(({ data }) => getBomDetailImpl(getSupabaseAdmin(), data))

// Ketersediaan bahan di satu gudang, dibandingkan kebutuhan resep x qty rencana.
export const checkMaterialAvailability = createServerFn({ method: 'GET' })
  .validator((d: { bom_id: string; warehouse_id: string; qty_planned: number }) => d)
  .handler(async ({ data }) => {
    const admin = getSupabaseAdmin()
    const { data: loc, error: locErr } = await admin
      .from('location')
      .select('id')
      .eq('warehouse_id', data.warehouse_id)
      .eq('usage', 'internal')
      .single()
    if (locErr) throw new Error(locErr.message)

    const { data: lines, error: linesErr } = await admin
      .from('bom_line')
      .select('qty_per_unit, component:component_variant_id(id, sku, template:template_id(name))')
      .eq('bom_id', data.bom_id)
    if (linesErr) throw new Error(linesErr.message)

    const results = []
    for (const l of lines) {
      const needed = Number(l.qty_per_unit) * data.qty_planned
      const { data: quant } = await admin
        .from('stock_quant')
        .select('quantity')
        .eq('variant_id', l.component.id)
        .eq('location_id', loc.id)
        .maybeSingle()
      const available = Number(quant?.quantity ?? 0)
      results.push({
        variant_id: l.component.id,
        sku: l.component.sku,
        name: l.component.template.name,
        needed,
        available,
        sufficient: available >= needed,
      })
    }
    return results
  })

// ---------- Manufacturing Order ----------

export const listManufacturingOrders = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('manufacturing_order')
    .select(
      'id, reference, state, qty_planned, qty_produced, created_at, done_at, variant:variant_id(sku, template:template_id(name)), warehouse:warehouse_id(code, name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
})

export async function getManufacturingOrderImpl(admin: Admin, moId: string) {
  const { data: mo, error: moErr } = await admin
    .from('manufacturing_order')
    .select(
      'id, reference, state, bom_id, qty_planned, qty_produced, created_at, done_at, variant:variant_id(sku, template:template_id(name, cost_price)), warehouse:warehouse_id(id, code, name)',
    )
    .eq('id', moId)
    .single()
  if (moErr) throw new Error(moErr.message)

  const { data: workOrders, error: woErr } = await admin
    .from('work_order')
    .select('id, sequence, name, state, started_at, done_at, work_center:work_center_id(code, name)')
    .eq('manufacturing_order_id', moId)
    .order('sequence')
  if (woErr) throw new Error(woErr.message)

  return { mo, workOrders }
}

export const getManufacturingOrder = createServerFn({ method: 'GET' })
  .validator((moId: string) => moId)
  .handler(({ data }) => getManufacturingOrderImpl(getSupabaseAdmin(), data))

export async function createManufacturingOrderImpl(
  admin: Admin,
  bomId: string,
  variantId: string,
  warehouseId: string,
  qtyPlanned: number,
) {
  const { data, error } = await admin.rpc('fn_create_manufacturing_order', {
    p_reference: makeReference('MO'),
    p_bom_id: bomId,
    p_variant_id: variantId,
    p_warehouse_id: warehouseId,
    p_qty_planned: qtyPlanned,
  })
  if (error) throw new Error(error.message)
  return { moId: data }
}

export const createManufacturingOrder = createServerFn({ method: 'POST' })
  .validator((d: { bom_id: string; variant_id: string; warehouse_id: string; qty_planned: number }) => d)
  .handler(({ data }) =>
    createManufacturingOrderImpl(getSupabaseAdmin(), data.bom_id, data.variant_id, data.warehouse_id, data.qty_planned),
  )

export async function completeWorkOrderImpl(admin: Admin, workOrderId: string) {
  const { error } = await admin.rpc('fn_complete_work_order', { p_work_order_id: workOrderId })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const completeWorkOrder = createServerFn({ method: 'POST' })
  .validator((workOrderId: string) => workOrderId)
  .handler(({ data }) => completeWorkOrderImpl(getSupabaseAdmin(), data))

export async function completeManufacturingOrderImpl(admin: Admin, moId: string, qtyProduced: number) {
  const { error } = await admin.rpc('fn_complete_manufacturing_order', { p_mo_id: moId, p_qty_produced: qtyProduced })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const completeManufacturingOrder = createServerFn({ method: 'POST' })
  .validator((d: { mo_id: string; qty_produced: number }) => d)
  .handler(({ data }) => completeManufacturingOrderImpl(getSupabaseAdmin(), data.mo_id, data.qty_produced))

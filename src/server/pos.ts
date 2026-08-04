import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

type Admin = ReturnType<typeof getSupabaseAdmin>

export const getOpenSession = createServerFn({ method: 'GET' })
  .validator((warehouseId: string) => warehouseId)
  .handler(async ({ data: warehouseId }) => {
    const { data, error } = await getSupabaseAdmin()
      .from('pos_session')
      .select('id, warehouse_id, opening_cash, opened_at')
      .eq('warehouse_id', warehouseId)
      .eq('state', 'open')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data
  })

export const openSession = createServerFn({ method: 'POST' })
  .validator((d: { warehouse_id: string; opening_cash: number }) => d)
  .handler(async ({ data }) => {
    const { data: session, error } = await getSupabaseAdmin()
      .from('pos_session')
      .insert({ warehouse_id: data.warehouse_id, opening_cash: data.opening_cash })
      .select('id, warehouse_id, opening_cash, opened_at')
      .single()
    if (error) throw new Error(error.message)
    return session
  })

export const listProductsForPos = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('product_variant')
    .select('id, sku, barcode, sale_price:template_id(sale_price), name:template_id(name)')
    .eq('active', true)
    .order('sku')
  if (error) throw new Error(error.message)
  return data.map((v) => ({
    id: v.id,
    sku: v.sku,
    barcode: v.barcode,
    name: v.name.name,
    sale_price: v.sale_price.sale_price,
  }))
})

export type SyncOrderInput = {
  session_id: string
  client_uuid: string
  order_no: string
  lines: Array<{ variant_id: string; qty: number }>
  payments: Array<{ method: string; amount: number }>
}

export async function syncPosOrderImpl(admin: Admin, input: SyncOrderInput) {
  const { data, error } = await admin.rpc('fn_sync_pos_order', {
    p_session_id: input.session_id,
    p_client_uuid: input.client_uuid,
    p_order_no: input.order_no,
    p_lines: input.lines,
    p_payments: input.payments,
  })
  if (error) throw new Error(error.message)
  return { orderId: data }
}

export const syncPosOrder = createServerFn({ method: 'POST' })
  .validator((d: SyncOrderInput) => d)
  .handler(({ data }) => syncPosOrderImpl(getSupabaseAdmin(), data))

export const listSessionOrders = createServerFn({ method: 'GET' })
  .validator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const { data, error } = await getSupabaseAdmin()
      .from('pos_order')
      .select('id, order_no, grand_total, state, created_at')
      .eq('session_id', sessionId)
      .order('created_at')
    if (error) throw new Error(error.message)
    return data
  })

export async function closePosSessionImpl(admin: Admin, sessionId: string, countedCash: number) {
  const { error } = await admin.rpc('fn_close_pos_session', {
    p_session_id: sessionId,
    p_counted_cash: countedCash,
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const closePosSession = createServerFn({ method: 'POST' })
  .validator((d: { session_id: string; counted_cash: number }) => d)
  .handler(({ data }) => closePosSessionImpl(getSupabaseAdmin(), data.session_id, data.counted_cash))

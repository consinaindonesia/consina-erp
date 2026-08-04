import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

export const listVariantsForReport = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('product_variant')
    .select('id, sku, template:template_id(name)')
    .eq('active', true)
    .order('sku')
  if (error) throw new Error(error.message)
  return data
})

export const getStockCard = createServerFn({ method: 'GET' })
  .validator((variantId: string) => variantId)
  .handler(async ({ data: variantId }) => {
    const { data, error } = await getSupabaseAdmin().rpc('fn_stock_card', { p_variant_id: variantId })
    if (error) throw new Error(error.message)
    return data
  })

export const getSalesByStore = createServerFn({ method: 'GET' })
  .validator((d: { from: string | null; to: string | null }) => d)
  .handler(async ({ data }) => {
    const { data: rows, error } = await getSupabaseAdmin().rpc('fn_sales_by_store', {
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
    })
    if (error) throw new Error(error.message)
    return rows
  })

export const getInventoryValue = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = getSupabaseAdmin()
  const [{ data: rows, error }, { data: total, error: totalErr }] = await Promise.all([
    admin.rpc('fn_inventory_value'),
    admin.rpc('fn_inventory_value_total'),
  ])
  if (error) throw new Error(error.message)
  if (totalErr) throw new Error(totalErr.message)
  return { rows, total }
})

export const getReorderSuggestions = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin().rpc('fn_reorder_suggestions')
  if (error) throw new Error(error.message)
  return data
})

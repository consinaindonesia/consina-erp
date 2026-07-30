import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

export const listWarehouses = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('warehouse')
    .select('id, code, name, is_store, active')
    .order('code')
  if (error) throw new Error(error.message)
  return data
})

export const createWarehouse = createServerFn({ method: 'POST' })
  .validator((d: { code: string; name: string; is_store: boolean }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from('warehouse')
      .insert({ code: data.code, name: data.name, is_store: data.is_store })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const listLocations = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('location')
    .select('id, code, name, usage, active, warehouse:warehouse_id(code, name)')
    .order('usage')
    .order('code')
  if (error) throw new Error(error.message)
  return data
})

export const createLocation = createServerFn({ method: 'POST' })
  .validator((d: { code: string; name: string; usage: string; warehouse_id: string | null }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from('location')
      .insert({ code: data.code, name: data.name, usage: data.usage, warehouse_id: data.warehouse_id })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

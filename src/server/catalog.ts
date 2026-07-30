import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

// ---------- Kategori ----------

export const listCategories = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('product_category')
    .select('id, name, parent_id')
    .order('name')
  if (error) throw new Error(error.message)
  return data
})

export const createCategory = createServerFn({ method: 'POST' })
  .validator((d: { name: string; parent_id: string | null }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from('product_category')
      .insert({ name: data.name, parent_id: data.parent_id })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- Satuan (UOM) ----------

export const listUoms = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin().from('uom').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return data
})

export const createUom = createServerFn({ method: 'POST' })
  .validator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from('uom').insert({ name: data.name })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ---------- Atribut & nilai (warna/ukuran) ----------

export const listAttributes = createServerFn({ method: 'GET' }).handler(async () => {
  const { data, error } = await getSupabaseAdmin()
    .from('product_attribute')
    .select('id, name, product_attribute_value(id, name, code)')
    .order('name')
  if (error) throw new Error(error.message)
  return data
})

export const createAttribute = createServerFn({ method: 'POST' })
  .validator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin().from('product_attribute').insert({ name: data.name })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const createAttributeValue = createServerFn({ method: 'POST' })
  .validator((d: { attribute_id: string; name: string; code: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdmin()
      .from('product_attribute_value')
      .insert({ attribute_id: data.attribute_id, name: data.name, code: data.code })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

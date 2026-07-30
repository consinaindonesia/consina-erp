import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

type Admin = ReturnType<typeof getSupabaseAdmin>

export async function listProductsImpl(admin: Admin) {
  const { data, error } = await admin
    .from('product_template')
    .select(
      'id, name, is_manufactured, sale_price, cost_price, active, category:category_id(name), uom:uom_id(name), product_variant(id)',
    )
    .order('name')
  if (error) throw new Error(error.message)
  return data.map((t) => ({ ...t, variant_count: t.product_variant.length }))
}

export const listProducts = createServerFn({ method: 'GET' }).handler(() => listProductsImpl(getSupabaseAdmin()))

export async function getProductImpl(admin: Admin, id: string) {
  const [{ data: template, error: templateErr }, { data: variants, error: variantErr }] = await Promise.all([
    admin
      .from('product_template')
      .select('id, name, category_id, uom_id, is_manufactured, sale_price, cost_price, reorder_point, active')
      .eq('id', id)
      .single(),
    admin
      .from('product_variant')
      .select('id, sku, barcode, active, product_variant_attribute_value(value_id)')
      .eq('template_id', id)
      .order('sku'),
  ])
  if (templateErr) throw new Error(templateErr.message)
  if (variantErr) throw new Error(variantErr.message)
  return {
    template,
    variants: variants.map((v) => ({
      ...v,
      value_ids: v.product_variant_attribute_value.map((x) => x.value_id),
    })),
  }
}

export const getProduct = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data: id }) => getProductImpl(getSupabaseAdmin(), id))

export type VariantInput = { sku: string; barcode: string | null; value_ids: Array<string> }

export type CreateProductInput = {
  name: string
  category_id: string | null
  uom_id: string
  is_manufactured: boolean
  sale_price: number
  cost_price: number
  variants: Array<VariantInput>
}

export async function createProductImpl(admin: Admin, data: CreateProductInput) {
  const { data: template, error: templateErr } = await admin
    .from('product_template')
    .insert({
      name: data.name,
      category_id: data.category_id,
      uom_id: data.uom_id,
      is_manufactured: data.is_manufactured,
      sale_price: data.sale_price,
      cost_price: data.cost_price,
    })
    .select('id')
    .single()
  if (templateErr) throw new Error(templateErr.message)

  for (const v of data.variants) {
    await insertVariant(admin, template.id, v)
  }

  return { id: template.id }
}

export const createProduct = createServerFn({ method: 'POST' })
  .validator((d: CreateProductInput) => d)
  .handler(({ data }) => createProductImpl(getSupabaseAdmin(), data))

export type UpdateProductInput = {
  id: string
  name: string
  category_id: string | null
  uom_id: string
  is_manufactured: boolean
  sale_price: number
  cost_price: number
  reorder_point: number
  active: boolean
}

export async function updateProductImpl(admin: Admin, data: UpdateProductInput) {
  const { error } = await admin
    .from('product_template')
    .update({
      name: data.name,
      category_id: data.category_id,
      uom_id: data.uom_id,
      is_manufactured: data.is_manufactured,
      sale_price: data.sale_price,
      cost_price: data.cost_price,
      reorder_point: data.reorder_point,
      active: data.active,
    })
    .eq('id', data.id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const updateProduct = createServerFn({ method: 'POST' })
  .validator((d: UpdateProductInput) => d)
  .handler(({ data }) => updateProductImpl(getSupabaseAdmin(), data))

export const addVariant = createServerFn({ method: 'POST' })
  .validator((d: { template_id: string } & VariantInput) => d)
  .handler(async ({ data }) => {
    const id = await insertVariant(getSupabaseAdmin(), data.template_id, data)
    return { id }
  })

export async function updateVariantImpl(
  admin: Admin,
  data: { id: string; sku: string; barcode: string | null; active: boolean },
) {
  const { error } = await admin
    .from('product_variant')
    .update({ sku: data.sku, barcode: data.barcode, active: data.active })
    .eq('id', data.id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export const updateVariant = createServerFn({ method: 'POST' })
  .validator((d: { id: string; sku: string; barcode: string | null; active: boolean }) => d)
  .handler(({ data }) => updateVariantImpl(getSupabaseAdmin(), data))

export async function insertVariant(admin: Admin, templateId: string, v: VariantInput) {
  const { data: variant, error: variantErr } = await admin
    .from('product_variant')
    .insert({ template_id: templateId, sku: v.sku, barcode: v.barcode })
    .select('id')
    .single()
  if (variantErr) throw new Error(variantErr.message)

  if (v.value_ids.length > 0) {
    const { error: linkErr } = await admin
      .from('product_variant_attribute_value')
      .insert(v.value_ids.map((value_id) => ({ variant_id: variant.id, value_id })))
    if (linkErr) throw new Error(linkErr.message)
  }

  return variant.id
}

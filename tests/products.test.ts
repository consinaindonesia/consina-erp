import { afterAll, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from '#/lib/supabase-admin'
import { createProductImpl, getProductImpl } from '#/server/products'

// Ini mengulang persis "cara cek" M3 di rencana-build.md: tambah 1 produk
// baru dengan 3 varian, lalu pastikan datanya muncul benar di Supabase.
// Data uji dihapus lagi di akhir supaya tidak menumpuk di katalog asli.
describe('M3: tambah produk + varian', () => {
  const admin = getSupabaseAdmin()
  let templateId: string | undefined

  afterAll(async () => {
    if (!templateId) return
    const { data: variants } = await admin.from('product_variant').select('id').eq('template_id', templateId)
    const variantIds = (variants ?? []).map((v) => v.id)
    if (variantIds.length > 0) {
      await admin.from('product_variant_attribute_value').delete().in('variant_id', variantIds)
      await admin.from('product_variant').delete().in('id', variantIds)
    }
    await admin.from('product_template').delete().eq('id', templateId)
  })

  it('membuat produk dengan 3 varian dan menyimpannya dengan benar', async () => {
    const { data: uom } = await admin.from('uom').select('id').eq('name', 'PCS').single()
    const { data: warnaValues } = await admin
      .from('product_attribute_value')
      .select('id, code')
      .in('code', ['BK', 'NV'])

    const bk = warnaValues!.find((v) => v.code === 'BK')!.id
    const nv = warnaValues!.find((v) => v.code === 'NV')!.id

    const result = await createProductImpl(admin, {
      name: 'TEST/M3 Produk Uji',
      category_id: null,
      uom_id: uom!.id,
      is_manufactured: false,
      sale_price: 100000,
      cost_price: 50000,
      variants: [
        { sku: 'TEST-M3-A', barcode: null, value_ids: [bk] },
        { sku: 'TEST-M3-B', barcode: null, value_ids: [nv] },
        { sku: 'TEST-M3-C', barcode: '1234567890123', value_ids: [] },
      ],
    })

    templateId = result.id
    expect(templateId).toMatch(/^[0-9a-f-]{36}$/)

    const fetched = await getProductImpl(admin, templateId)
    expect(fetched.template.name).toBe('TEST/M3 Produk Uji')
    expect(fetched.variants).toHaveLength(3)

    const bySku = Object.fromEntries(fetched.variants.map((v) => [v.sku, v]))
    expect(bySku['TEST-M3-A'].value_ids).toEqual([bk])
    expect(bySku['TEST-M3-B'].value_ids).toEqual([nv])
    expect(bySku['TEST-M3-C'].barcode).toBe('1234567890123')
    expect(bySku['TEST-M3-C'].value_ids).toEqual([])
  })
})

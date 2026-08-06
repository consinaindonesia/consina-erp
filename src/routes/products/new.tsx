import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Card, ErrorText, Input, Label, PageBody, PageHeader, PageShell, SectionLabel, Select } from '#/components/ui'
import { listCategories, listAttributes, listUoms } from '#/server/catalog'
import { createProduct } from '#/server/products'
import { color, font } from '#/lib/theme'

export const Route = createFileRoute('/products/new')({
  component: NewProduct,
  loader: async () => ({
    categories: await listCategories(),
    uoms: await listUoms(),
    attributes: await listAttributes(),
  }),
})

type VariantRow = { sku: string; barcode: string; values: Record<string, string> }

function emptyVariant(): VariantRow {
  return { sku: '', barcode: '', values: {} }
}

function NewProduct() {
  const { categories, uoms, attributes } = Route.useLoaderData()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [uomId, setUomId] = useState(uoms[0]?.id ?? '')
  const [isManufactured, setIsManufactured] = useState(false)
  const [salePrice, setSalePrice] = useState('0')
  const [costPrice, setCostPrice] = useState('0')
  const [variants, setVariants] = useState<Array<VariantRow>>([emptyVariant()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function updateVariantValue(index: number, attributeId: string, valueId: string) {
    setVariants((rows) =>
      rows.map((r, i) => (i === index ? { ...r, values: { ...r.values, [attributeId]: valueId } } : r)),
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { id } = await createProduct({
        data: {
          name,
          category_id: categoryId || null,
          uom_id: uomId,
          is_manufactured: isManufactured,
          sale_price: Number(salePrice),
          cost_price: Number(costPrice),
          variants: variants
            .filter((v) => v.sku.trim().length > 0)
            .map((v) => ({
              sku: v.sku.trim(),
              barcode: v.barcode.trim() || null,
              value_ids: Object.values(v.values).filter(Boolean),
            })),
        },
      })
      navigate({ to: '/products/$templateId', params: { templateId: id } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Produk" />
      <PageBody maxWidth={780}>
        <h1 style={{ font: `600 20px/1.2 ${font.sans}`, margin: 0 }}>Tambah Produk</h1>
        <Card>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
            <Label>
              Nama produk
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Label>

            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>
                  Kategori
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">(tanpa kategori)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              </div>
              <div style={{ flex: 1 }}>
                <Label>
                  Satuan
                  <Select value={uomId} onChange={(e) => setUomId(e.target.value)} required>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>
                  Harga jual (Rp)
                  <Input type="number" min="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                </Label>
              </div>
              <div style={{ flex: 1 }}>
                <Label>
                  Harga pokok (Rp)
                  <Input type="number" min="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                </Label>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 13.5px/1 ${font.sans}`, color: color.textSubtle }}>
              <input type="checkbox" checked={isManufactured} onChange={(e) => setIsManufactured(e.target.checked)} /> Diproduksi
              sendiri (butuh resep/BOM)
            </label>

            <SectionLabel>Varian</SectionLabel>
            {variants.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input placeholder="SKU" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} style={{ width: 140 }} />
                <Input
                  placeholder="Barcode (opsional)"
                  value={v.barcode}
                  onChange={(e) => updateVariant(i, { barcode: e.target.value })}
                  style={{ width: 160 }}
                />
                {attributes.map((attr) => (
                  <Select key={attr.id} value={v.values[attr.id] ?? ''} onChange={(e) => updateVariantValue(i, attr.id, e.target.value)}>
                    <option value="">{attr.name}: —</option>
                    {attr.product_attribute_value.map((val) => (
                      <option key={val.id} value={val.id}>
                        {attr.name}: {val.name}
                      </option>
                    ))}
                  </Select>
                ))}
                <Button variant="secondary" onClick={() => setVariants((rows) => rows.filter((_, idx) => idx !== i))} disabled={variants.length === 1}>
                  Hapus
                </Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setVariants((rows) => [...rows, emptyVariant()])} style={{ alignSelf: 'flex-start' }}>
              + Tambah baris varian
            </Button>

            <div>
              <Button type="submit" variant="accent" disabled={saving} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                {saving ? 'Menyimpan…' : 'Simpan produk'}
              </Button>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        </Card>
      </PageBody>
    </PageShell>
  )
}

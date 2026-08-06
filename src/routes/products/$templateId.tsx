import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listCategories, listAttributes, listUoms } from '#/server/catalog'
import { addVariant, getProduct, updateProduct, updateVariant } from '#/server/products'
import { Button, Card, ErrorText, Input, Label, PageBody, PageHeader, PageShell, SectionLabel, Select, table } from '#/components/ui'
import { color, font } from '#/lib/theme'

export const Route = createFileRoute('/products/$templateId')({
  component: EditProduct,
  loader: async ({ params }) => ({
    product: await getProduct({ data: params.templateId }),
    categories: await listCategories(),
    uoms: await listUoms(),
    attributes: await listAttributes(),
  }),
})

function EditProduct() {
  const { product, categories, uoms, attributes } = Route.useLoaderData()
  const router = useRouter()
  const { template, variants } = product

  const [name, setName] = useState(template.name)
  const [categoryId, setCategoryId] = useState(template.category_id ?? '')
  const [uomId, setUomId] = useState(template.uom_id)
  const [isManufactured, setIsManufactured] = useState(template.is_manufactured)
  const [salePrice, setSalePrice] = useState(String(template.sale_price))
  const [costPrice, setCostPrice] = useState(String(template.cost_price))
  const [reorderPoint, setReorderPoint] = useState(String(template.reorder_point))
  const [active, setActive] = useState(template.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProduct({
        data: {
          id: template.id,
          name,
          category_id: categoryId || null,
          uom_id: uomId,
          is_manufactured: isManufactured,
          sale_price: Number(salePrice),
          cost_price: Number(costPrice),
          reorder_point: Number(reorderPoint),
          active,
        },
      })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Produk" />
      <PageBody maxWidth={900}>
        <h1 style={{ font: `600 20px/1.2 ${font.sans}`, margin: 0 }}>{template.name}</h1>
        <Card>
          <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
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
              <div style={{ flex: 1 }}>
                <Label>
                  Titik pesan ulang
                  <Input type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
                </Label>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 13.5px/1 ${font.sans}`, color: color.textSubtle }}>
              <input type="checkbox" checked={isManufactured} onChange={(e) => setIsManufactured(e.target.checked)} /> Diproduksi sendiri
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 13.5px/1 ${font.sans}`, color: color.textSubtle }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif
            </label>
            <div>
              <Button type="submit" variant="accent" disabled={saving} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                {saving ? 'Menyimpan…' : 'Simpan perubahan'}
              </Button>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        </Card>

        <SectionLabel>Varian</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>SKU</th>
                  <th style={table.th}>Barcode</th>
                  <th style={table.th}>Atribut</th>
                  <th style={table.th}>Aktif</th>
                  <th style={table.th}></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <VariantRow key={v.id} variant={v} attributes={attributes} onSaved={() => router.invalidate()} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <SectionLabel>Tambah varian baru</SectionLabel>
        <Card>
          <NewVariantForm templateId={template.id} attributes={attributes} onCreated={() => router.invalidate()} />
        </Card>
      </PageBody>
    </PageShell>
  )
}

function VariantRow({
  variant,
  attributes,
  onSaved,
}: {
  variant: { id: string; sku: string; barcode: string | null; active: boolean; value_ids: Array<string> }
  attributes: Array<{ id: string; name: string; product_attribute_value: Array<{ id: string; name: string; code: string }> }>
  onSaved: () => void
}) {
  const [sku, setSku] = useState(variant.sku)
  const [barcode, setBarcode] = useState(variant.barcode ?? '')
  const [active, setActive] = useState(variant.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valueNames = attributes
    .flatMap((a) => a.product_attribute_value)
    .filter((v) => variant.value_ids.includes(v.id))
    .map((v) => v.name)
    .join(', ')

  async function onSave() {
    setSaving(true)
    setError(null)
    try {
      await updateVariant({ data: { id: variant.id, sku, barcode: barcode || null, active } })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td style={table.td}>
        <Input value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: 120, padding: '6px 8px' }} />
      </td>
      <td style={table.td}>
        <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ width: 140, padding: '6px 8px' }} />
      </td>
      <td style={table.td}>{valueNames || '—'}</td>
      <td style={table.td}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td style={table.td}>
        <Button variant="secondary" onClick={onSave} disabled={saving} style={{ padding: '6px 12px', fontSize: 12 }}>
          {saving ? '…' : 'Simpan'}
        </Button>
        {error && <span style={{ color: color.brandRed, fontSize: 12, marginLeft: 6 }}>{error}</span>}
      </td>
    </tr>
  )
}

function NewVariantForm({
  templateId,
  attributes,
  onCreated,
}: {
  templateId: string
  attributes: Array<{ id: string; name: string; product_attribute_value: Array<{ id: string; name: string; code: string }> }>
  onCreated: () => void
}) {
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addVariant({
        data: {
          template_id: templateId,
          sku: sku.trim(),
          barcode: barcode.trim() || null,
          value_ids: Object.values(values).filter(Boolean),
        },
      })
      setSku('')
      setBarcode('')
      setValues({})
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 18 }}>
      <Input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required style={{ width: 140 }} />
      <Input placeholder="Barcode (opsional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ width: 160 }} />
      {attributes.map((attr) => (
        <Select key={attr.id} value={values[attr.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [attr.id]: e.target.value }))}>
          <option value="">{attr.name}: —</option>
          {attr.product_attribute_value.map((val) => (
            <option key={val.id} value={val.id}>
              {attr.name}: {val.name}
            </option>
          ))}
        </Select>
      ))}
      <Button type="submit" variant="accent" disabled={saving} style={{ padding: '9px 14px', fontSize: 12.5 }}>
        {saving ? 'Menyimpan…' : 'Tambah varian'}
      </Button>
      {error && <span style={{ color: color.brandRed, font: `500 12.5px/1 ${font.sans}` }}>{error}</span>}
    </form>
  )
}

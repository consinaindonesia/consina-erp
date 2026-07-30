import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listCategories, listAttributes, listUoms } from '#/server/catalog'
import { addVariant, getProduct, updateProduct, updateVariant } from '#/server/products'

export const Route = createFileRoute('/products/$templateId')({
  component: EditProduct,
  loader: async ({ params }) => ({
    product: await getProduct({ data: params.templateId }),
    categories: await listCategories(),
    uoms: await listUoms(),
    attributes: await listAttributes(),
  }),
})

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }

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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 760 }}>
      <h1>Edit Produk</h1>
      <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          Nama produk
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={{ flex: 1 }}>
            Kategori
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
              <option value="">(tanpa kategori)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Satuan
            <select value={uomId} onChange={(e) => setUomId(e.target.value)} required style={inputStyle}>
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={{ flex: 1 }}>
            Harga jual (Rp)
            <input type="number" min="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1 }}>
            Harga pokok (Rp)
            <input type="number" min="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1 }}>
            Titik pesan ulang
            <input type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} style={inputStyle} />
          </label>
        </div>
        <label>
          <input type="checkbox" checked={isManufactured} onChange={(e) => setIsManufactured(e.target.checked)} /> Diproduksi
          sendiri
        </label>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif
        </label>
        <div>
          <button type="submit" disabled={saving} style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}>
            {saving ? 'Menyimpan…' : 'Simpan perubahan'}
          </button>
        </div>
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </form>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Varian</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}>SKU</th>
            <th style={th}>Barcode</th>
            <th style={th}>Atribut</th>
            <th style={th}>Aktif</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <VariantRow key={v.id} variant={v} attributes={attributes} onSaved={() => router.invalidate()} />
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Tambah varian baru</h2>
      <NewVariantForm templateId={template.id} attributes={attributes} onCreated={() => router.invalidate()} />
    </main>
  )
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #E0E5E3', padding: 6, fontSize: 12.5 }
const td: React.CSSProperties = { borderBottom: '1px solid #F0F3F1', padding: 6, fontSize: 13.5 }

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
      <td style={td}>
        <input value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: 120, padding: 4 }} />
      </td>
      <td style={td}>
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ width: 140, padding: 4 }} />
      </td>
      <td style={td}>{valueNames || '—'}</td>
      <td style={td}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td style={td}>
        <button type="button" onClick={onSave} disabled={saving}>
          {saving ? '…' : 'Simpan'}
        </button>
        {error && <span style={{ color: '#C8362A', fontSize: 12, marginLeft: 6 }}>{error}</span>}
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
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required style={{ width: 140, padding: 6 }} />
      <input placeholder="Barcode (opsional)" value={barcode} onChange={(e) => setBarcode(e.target.value)} style={{ width: 160, padding: 6 }} />
      {attributes.map((attr) => (
        <select
          key={attr.id}
          value={values[attr.id] ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, [attr.id]: e.target.value }))}
          style={{ padding: 6 }}
        >
          <option value="">{attr.name}: —</option>
          {attr.product_attribute_value.map((val) => (
            <option key={val.id} value={val.id}>
              {attr.name}: {val.name}
            </option>
          ))}
        </select>
      ))}
      <button type="submit" disabled={saving}>
        {saving ? 'Menyimpan…' : 'Tambah varian'}
      </button>
      {error && <span style={{ color: '#C8362A', fontSize: 12.5 }}>{error}</span>}
    </form>
  )
}

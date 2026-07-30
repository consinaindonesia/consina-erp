import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { listCategories, listAttributes, listUoms } from '#/server/catalog'
import { createProduct } from '#/server/products'

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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 760 }}>
      <h1>Tambah Produk</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        </div>

        <label>
          <input type="checkbox" checked={isManufactured} onChange={(e) => setIsManufactured(e.target.checked)} /> Diproduksi
          sendiri (butuh resep/BOM)
        </label>

        <h2 style={{ fontSize: 16, marginTop: 8 }}>Varian</h2>
        {variants.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              placeholder="SKU"
              value={v.sku}
              onChange={(e) => updateVariant(i, { sku: e.target.value })}
              style={{ ...inputStyle, width: 140 }}
            />
            <input
              placeholder="Barcode (opsional)"
              value={v.barcode}
              onChange={(e) => updateVariant(i, { barcode: e.target.value })}
              style={{ ...inputStyle, width: 160 }}
            />
            {attributes.map((attr) => (
              <select
                key={attr.id}
                value={v.values[attr.id] ?? ''}
                onChange={(e) => updateVariantValue(i, attr.id, e.target.value)}
                style={inputStyle}
              >
                <option value="">{attr.name}: —</option>
                {attr.product_attribute_value.map((val) => (
                  <option key={val.id} value={val.id}>
                    {attr.name}: {val.name}
                  </option>
                ))}
              </select>
            ))}
            <button
              type="button"
              onClick={() => setVariants((rows) => rows.filter((_, idx) => idx !== i))}
              disabled={variants.length === 1}
            >
              Hapus
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setVariants((rows) => [...rows, emptyVariant()])} style={{ alignSelf: 'flex-start' }}>
          + Tambah baris varian
        </button>

        <div>
          <button type="submit" disabled={saving} style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}>
            {saving ? 'Menyimpan…' : 'Simpan produk'}
          </button>
        </div>
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </form>
    </main>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }

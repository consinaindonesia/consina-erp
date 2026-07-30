import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createAttribute, createAttributeValue, listAttributes } from '#/server/catalog'

export const Route = createFileRoute('/attributes')({
  component: Attributes,
  loader: () => listAttributes(),
})

function Attributes() {
  const attributes = Route.useLoaderData()
  const router = useRouter()
  const [newAttrName, setNewAttrName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onAddAttribute(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createAttribute({ data: { name: newAttrName.toUpperCase() } })
      setNewAttrName('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 640 }}>
      <h1>Atribut Varian (mis. WARNA, UKURAN)</h1>

      {attributes.map((attr) => (
        <AttributeCard key={attr.id} attribute={attr} onChanged={() => router.invalidate()} />
      ))}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Tambah atribut baru</h2>
      <form onSubmit={onAddAttribute} style={{ display: 'flex', gap: 8 }}>
        <input
          value={newAttrName}
          onChange={(e) => setNewAttrName(e.target.value)}
          placeholder="mis. UKURAN"
          required
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Tambah'}
        </button>
      </form>
      {error && <p style={{ color: '#C8362A' }}>{error}</p>}
    </main>
  )
}

function AttributeCard({
  attribute,
  onChanged,
}: {
  attribute: { id: string; name: string; product_attribute_value: Array<{ id: string; name: string; code: string }> }
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createAttributeValue({ data: { attribute_id: attribute.id, name, code: code.toUpperCase() } })
      setName('')
      setCode('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid #E0E5E3', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <strong>{attribute.name}</strong>
      <ul>
        {attribute.product_attribute_value.map((v) => (
          <li key={v.id}>
            {v.name} ({v.code})
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama (mis. Merah)" required style={{ padding: 6 }} />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. RD)" required style={{ width: 90, padding: 6 }} />
        <button type="submit" disabled={saving}>
          {saving ? '…' : 'Tambah nilai'}
        </button>
      </form>
      {error && <p style={{ color: '#C8362A' }}>{error}</p>}
    </div>
  )
}

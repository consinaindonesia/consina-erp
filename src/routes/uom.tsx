import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createUom, listUoms } from '#/server/catalog'

export const Route = createFileRoute('/uom')({
  component: Uoms,
  loader: () => listUoms(),
})

function Uoms() {
  const uoms = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createUom({ data: { name } })
      setName('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>Satuan (UOM)</h1>
      <ul>
        {uoms.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama satuan baru (mis. ROLL)"
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

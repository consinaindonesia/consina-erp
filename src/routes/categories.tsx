import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createCategory, listCategories } from '#/server/catalog'

export const Route = createFileRoute('/categories')({
  component: Categories,
  loader: () => listCategories(),
})

function Categories() {
  const categories = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createCategory({ data: { name, parent_id: null } })
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
      <h1>Kategori Produk</h1>
      <ul>
        {categories.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama kategori baru"
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

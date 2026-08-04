import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createWorkCenter, listWorkCenters } from '#/server/production'

export const Route = createFileRoute('/work-centers')({
  component: WorkCenters,
  loader: () => listWorkCenters(),
})

function WorkCenters() {
  const workCenters = Route.useLoaderData()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createWorkCenter({ data: { code: code.toUpperCase(), name } })
      setCode('')
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
      <h1>Work Center</h1>
      <ul>
        {workCenters.map((wc) => (
          <li key={wc.id}>
            <strong>{wc.code}</strong> — {wc.name}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. CUT)" required style={{ width: 120, padding: 8 }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1, padding: 8 }} />
        <button type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Tambah'}
        </button>
      </form>
      {error && <p style={{ color: '#C8362A' }}>{error}</p>}
    </main>
  )
}

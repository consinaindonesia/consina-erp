import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createLocation, createWarehouse, listLocations, listWarehouses } from '#/server/locations'

export const Route = createFileRoute('/locations')({
  component: Locations,
  loader: async () => ({
    warehouses: await listWarehouses(),
    locations: await listLocations(),
  }),
})

const USAGE_OPTIONS = ['internal', 'supplier', 'customer', 'production', 'inventory_loss', 'scrap', 'transit'] as const

function Locations() {
  const { warehouses, locations } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720 }}>
      <h1>Gudang & Lokasi</h1>

      <h2 style={{ fontSize: 16 }}>Gudang / Toko</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={th}>Kode</th>
            <th style={th}>Nama</th>
            <th style={th}>Toko?</th>
          </tr>
        </thead>
        <tbody>
          {warehouses.map((w) => (
            <tr key={w.id}>
              <td style={td}>{w.code}</td>
              <td style={td}>{w.name}</td>
              <td style={td}>{w.is_store ? 'Ya' : 'Tidak'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewWarehouseForm onCreated={() => router.invalidate()} />

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Lokasi</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={th}>Kode</th>
            <th style={th}>Nama</th>
            <th style={th}>Jenis</th>
            <th style={th}>Gudang</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((l) => (
            <tr key={l.id}>
              <td style={td}>{l.code}</td>
              <td style={td}>{l.name}</td>
              <td style={td}>{l.usage}</td>
              <td style={td}>{l.warehouse?.code ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewLocationForm warehouses={warehouses} onCreated={() => router.invalidate()} />
    </main>
  )
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #E0E5E3', padding: 6, fontSize: 12.5 }
const td: React.CSSProperties = { borderBottom: '1px solid #F0F3F1', padding: 6, fontSize: 13.5 }

function NewWarehouseForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [isStore, setIsStore] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createWarehouse({ data: { code, name, is_store: isStore } })
      setCode('')
      setName('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. 30JKT)" required style={{ width: 140, padding: 6 }} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1, padding: 6 }} />
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={isStore} onChange={(e) => setIsStore(e.target.checked)} /> Toko
      </label>
      <button type="submit" disabled={saving}>
        {saving ? '…' : 'Tambah gudang'}
      </button>
      {error && <span style={{ color: '#C8362A', fontSize: 12.5 }}>{error}</span>}
    </form>
  )
}

function NewLocationForm({
  warehouses,
  onCreated,
}: {
  warehouses: Array<{ id: string; code: string }>
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [usage, setUsage] = useState<(typeof USAGE_OPTIONS)[number]>('internal')
  const [warehouseId, setWarehouseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createLocation({ data: { code, name, usage, warehouse_id: warehouseId || null } })
      setCode('')
      setName('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. 30JKT/Stock)" required style={{ width: 180, padding: 6 }} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1, padding: 6 }} />
      <select value={usage} onChange={(e) => setUsage(e.target.value as typeof usage)} style={{ padding: 6 }}>
        {USAGE_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ padding: 6 }}>
        <option value="">(tanpa gudang — lokasi virtual)</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code}
          </option>
        ))}
      </select>
      <button type="submit" disabled={saving}>
        {saving ? '…' : 'Tambah lokasi'}
      </button>
      {error && <span style={{ color: '#C8362A', fontSize: 12.5 }}>{error}</span>}
    </form>
  )
}

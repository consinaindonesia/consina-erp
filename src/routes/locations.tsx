import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createLocation, createWarehouse, listLocations, listWarehouses } from '#/server/locations'
import { Button, Card, ErrorText, Input, PageBody, PageHeader, PageShell, SectionLabel, Select, table } from '#/components/ui'

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
    <PageShell>
      <PageHeader title="Gudang & Lokasi" />
      <PageBody maxWidth={860}>
        <SectionLabel>Gudang / Toko</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Kode</th>
                  <th style={table.th}>Nama</th>
                  <th style={table.th}>Toko?</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id}>
                    <td style={{ ...table.td, ...table.tdMono }}>{w.code}</td>
                    <td style={table.td}>{w.name}</td>
                    <td style={table.td}>{w.is_store ? 'Ya' : 'Tidak'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <NewWarehouseForm onCreated={() => router.invalidate()} />

        <SectionLabel>Lokasi</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Kode</th>
                  <th style={table.th}>Nama</th>
                  <th style={table.th}>Jenis</th>
                  <th style={table.th}>Gudang</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...table.td, ...table.tdMono }}>{l.code}</td>
                    <td style={table.td}>{l.name}</td>
                    <td style={table.td}>{l.usage}</td>
                    <td style={{ ...table.td, ...table.tdMono }}>{l.warehouse?.code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <NewLocationForm warehouses={warehouses} onCreated={() => router.invalidate()} />
      </PageBody>
    </PageShell>
  )
}

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
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. 30JKT)" required style={{ width: 140 }} />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1, minWidth: 160 }} />
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={isStore} onChange={(e) => setIsStore(e.target.checked)} /> Toko
      </label>
      <Button type="submit" variant="secondary" disabled={saving}>
        {saving ? '…' : 'Tambah gudang'}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
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
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. 30JKT/Stock)" required style={{ width: 180 }} />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1, minWidth: 160 }} />
      <Select value={usage} onChange={(e) => setUsage(e.target.value as typeof usage)}>
        {USAGE_OPTIONS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
      <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
        <option value="">(tanpa gudang — lokasi virtual)</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" disabled={saving}>
        {saving ? '…' : 'Tambah lokasi'}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  )
}

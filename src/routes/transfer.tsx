import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listWarehouses } from '#/server/locations'
import { listInTransit, listVariantsForPicker, transferReceive, transferSend } from '#/server/stock'

export const Route = createFileRoute('/transfer')({
  component: Transfer,
  loader: async () => ({
    warehouses: await listWarehouses(),
    variants: await listVariantsForPicker(),
    inTransit: await listInTransit(),
  }),
})

type LineRow = { variant_id: string; qty: string }

function emptyLine(): LineRow {
  return { variant_id: '', qty: '1' }
}

function Transfer() {
  const { warehouses, variants, inTransit } = Route.useLoaderData()
  const router = useRouter()

  const [srcWarehouseId, setSrcWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [destWarehouseId, setDestWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '')
  const [lines, setLines] = useState<Array<LineRow>>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const validLines = lines
        .filter((l) => l.variant_id && Number(l.qty) > 0)
        .map((l) => ({ variant_id: l.variant_id, qty: Number(l.qty) }))
      if (validLines.length === 0) throw new Error('Isi minimal satu baris barang.')
      if (srcWarehouseId === destWarehouseId) throw new Error('Gudang asal dan tujuan tidak boleh sama.')
      await transferSend({ data: { src_warehouse_id: srcWarehouseId, dest_warehouse_id: destWarehouseId, lines: validLines } })
      setLines([emptyLine()])
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 900 }}>
      <h1>Transfer Antar Gudang</h1>
      <p style={{ color: '#5A6661', fontSize: 13.5 }}>
        Transfer selalu dua langkah: kirim ke transit, baru diterima di tujuan. Barang tidak pernah hilang di tengah jalan.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={{ flex: 1 }}>
            Dari
            <select value={srcWarehouseId} onChange={(e) => setSrcWarehouseId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Ke
            <select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={l.variant_id} onChange={(e) => updateLine(i, { variant_id: e.target.value })} style={{ flex: 1, padding: 8 }}>
              <option value="">Pilih varian…</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.template.name} ({v.sku})
                </option>
              ))}
            </select>
            <input type="number" min="0.01" step="0.01" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} style={{ width: 100, padding: 8 }} />
            <button type="button" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
              Hapus
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((rows) => [...rows, emptyLine()])} style={{ alignSelf: 'flex-start' }}>
          + Tambah baris
        </button>

        <div>
          <button type="submit" disabled={saving} style={{ padding: '10px 18px', background: '#16211C', color: '#fff', border: 0, borderRadius: 6 }}>
            {saving ? 'Mengirim…' : 'Kirim ke Transit'}
          </button>
        </div>
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </form>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Barang Dalam Perjalanan</h2>
      {inTransit.length === 0 && <p style={{ color: '#84918B' }}>Tidak ada barang yang sedang dalam perjalanan.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {inTransit.map((p) => (
          <InTransitCard key={p.id} picking={p} onReceived={() => router.invalidate()} />
        ))}
      </div>
    </main>
  )
}

function InTransitCard({
  picking,
  onReceived,
}: {
  picking: {
    id: string
    reference: string
    created_at: string
    src: { code: string; name: string } | null
    dest: { code: string; name: string } | null
    lines: Array<{ qty_done: number; variant: { sku: string; template: { name: string } | null } | null }>
  }
  onReceived: () => void
}) {
  const [receiving, setReceiving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReceive() {
    setReceiving(true)
    setError(null)
    try {
      await transferReceive({ data: picking.id })
      onReceived()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setReceiving(false)
    }
  }

  return (
    <div style={{ border: '1px solid #E0E5E3', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{picking.reference}</strong>
        <span style={{ fontSize: 12.5, color: '#84918B' }}>
          {picking.src?.code} → {picking.dest?.code}
        </span>
      </div>
      <ul style={{ margin: '8px 0' }}>
        {picking.lines.map((l, i) => (
          <li key={i}>
            {l.variant?.template?.name} ({l.variant?.sku}) — {l.qty_done} unit
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReceive} disabled={receiving} style={{ padding: '7px 14px', border: '1px solid #1F6F4A', background: '#fff', color: '#1F6F4A', borderRadius: 6 }}>
        {receiving ? 'Menerima…' : 'Terima di tujuan'}
      </button>
      {error && <p style={{ color: '#C8362A', fontSize: 12.5 }}>{error}</p>}
    </div>
  )
}

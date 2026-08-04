import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listWarehouses } from '#/server/locations'
import { listVariantsForPicker, receiveGoods } from '#/server/stock'

export const Route = createFileRoute('/receiving')({
  component: Receiving,
  loader: async () => ({
    warehouses: await listWarehouses(),
    variants: await listVariantsForPicker(),
  }),
})

type LineRow = { variant_id: string; qty: string }

function emptyLine(): LineRow {
  return { variant_id: '', qty: '1' }
}

function Receiving() {
  const { warehouses, variants } = Route.useLoaderData()
  const router = useRouter()

  const [destWarehouseId, setDestWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [lines, setLines] = useState<Array<LineRow>>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDone(null)
    try {
      const validLines = lines
        .filter((l) => l.variant_id && Number(l.qty) > 0)
        .map((l) => ({ variant_id: l.variant_id, qty: Number(l.qty) }))
      if (validLines.length === 0) throw new Error('Isi minimal satu baris barang.')
      await receiveGoods({ data: { dest_warehouse_id: destWarehouseId, lines: validLines } })
      setLines([emptyLine()])
      setDone('Penerimaan barang tersimpan.')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 700 }}>
      <h1>Penerimaan Barang dari Supplier</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          Masuk ke gudang
          <select
            value={destWarehouseId}
            onChange={(e) => setDestWarehouseId(e.target.value)}
            required
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>

        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={l.variant_id}
              onChange={(e) => updateLine(i, { variant_id: e.target.value })}
              style={{ flex: 1, padding: 8 }}
            >
              <option value="">Pilih varian…</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.template.name} ({v.sku})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={l.qty}
              onChange={(e) => updateLine(i, { qty: e.target.value })}
              style={{ width: 100, padding: 8 }}
            />
            <button type="button" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
              Hapus
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((rows) => [...rows, emptyLine()])} style={{ alignSelf: 'flex-start' }}>
          + Tambah baris
        </button>

        <div>
          <button type="submit" disabled={saving} style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}>
            {saving ? 'Menyimpan…' : 'Simpan penerimaan'}
          </button>
        </div>
        {done && <p style={{ color: '#1F6F4A' }}>{done}</p>}
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </form>
    </main>
  )
}

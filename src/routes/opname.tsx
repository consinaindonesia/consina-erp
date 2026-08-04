import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listLocations } from '#/server/locations'
import { listStockForLocation, submitOpname } from '#/server/stock'

export const Route = createFileRoute('/opname')({
  component: Opname,
  loader: async () => ({
    locations: (await listLocations()).filter((l) => l.usage === 'internal'),
  }),
})

function Opname() {
  const { locations } = Route.useLoaderData()
  const router = useRouter()

  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [stock, setStock] = useState<
    Array<{ variant_id: string; quantity: number; variant: { sku: string; template: { name: string } | null } | null }>
  >([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!locationId) return
    setLoading(true)
    listStockForLocation({ data: locationId })
      .then((rows) => {
        setStock(rows)
        setCounts(Object.fromEntries(rows.map((r) => [r.variant_id, String(r.quantity)])))
      })
      .finally(() => setLoading(false))
  }, [locationId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDone(null)
    try {
      const changed = stock
        .filter((r) => Number(counts[r.variant_id]) !== r.quantity)
        .map((r) => ({ variant_id: r.variant_id, counted_qty: Number(counts[r.variant_id]) }))
      if (changed.length === 0) throw new Error('Tidak ada angka yang diubah dari catatan sistem.')
      await submitOpname({ data: { location_id: locationId, counts: changed } })
      setDone(`Opname tersimpan, ${changed.length} varian disesuaikan.`)
      const rows = await listStockForLocation({ data: locationId })
      setStock(rows)
      setCounts(Object.fromEntries(rows.map((r) => [r.variant_id, String(r.quantity)])))
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 700 }}>
      <h1>Stock Opname</h1>
      <p style={{ color: '#5A6661', fontSize: 13.5 }}>
        Bandingkan angka di layar dengan hitungan fisik. Isi angka fisik sungguhan — sistem yang menghitung selisihnya.
      </p>

      <label>
        Lokasi
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4, marginBottom: 16 }}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.name}
            </option>
          ))}
        </select>
      </label>

      {loading && <p>Memuat…</p>}

      {!loading && (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Produk</th>
                <th style={th}>Sistem</th>
                <th style={th}>Fisik</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((r) => (
                <tr key={r.variant_id}>
                  <td style={td}>
                    {r.variant?.template?.name} ({r.variant?.sku})
                  </td>
                  <td style={td}>{r.quantity}</td>
                  <td style={td}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={counts[r.variant_id] ?? ''}
                      onChange={(e) => setCounts((c) => ({ ...c, [r.variant_id]: e.target.value }))}
                      style={{ width: 100, padding: 6 }}
                    />
                  </td>
                </tr>
              ))}
              {stock.length === 0 && (
                <tr>
                  <td style={td} colSpan={3}>
                    Tidak ada stok tercatat di lokasi ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div>
            <button type="submit" disabled={saving || stock.length === 0} style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}>
              {saving ? 'Menyimpan…' : 'Simpan opname'}
            </button>
          </div>
          {done && <p style={{ color: '#1F6F4A' }}>{done}</p>}
          {error && <p style={{ color: '#C8362A' }}>{error}</p>}
        </form>
      )}
    </main>
  )
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #E0E5E3', padding: 6, fontSize: 12.5 }
const td: React.CSSProperties = { borderBottom: '1px solid #F0F3F1', padding: 6, fontSize: 13.5 }

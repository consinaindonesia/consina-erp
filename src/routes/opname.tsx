import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listLocations } from '#/server/locations'
import { listStockForLocation, submitOpname } from '#/server/stock'
import { Button, Card, ErrorText, Input, Label, PageBody, PageHeader, PageShell, Select, SuccessText, table } from '#/components/ui'
import { color, font } from '#/lib/theme'

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
    <PageShell>
      <PageHeader title="Stock Opname" />
      <PageBody maxWidth={760}>
        <p style={{ font: `400 13px/1.5 ${font.sans}`, color: color.textSubtle, margin: 0 }}>
          Bandingkan angka di layar dengan hitungan fisik. Isi angka fisik sungguhan — sistem yang menghitung selisihnya.
        </p>

        <Label>
          Lokasi
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ maxWidth: 360 }}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.name}
              </option>
            ))}
          </Select>
        </Label>

        {loading && <p style={{ font: `400 13px/1 ${font.sans}`, color: color.textMuted }}>Memuat…</p>}

        {!loading && (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card>
              <div style={table.wrap}>
                <table style={table.table}>
                  <thead>
                    <tr>
                      <th style={table.th}>Produk</th>
                      <th style={{ ...table.th, ...table.thRight }}>Sistem</th>
                      <th style={{ ...table.th, ...table.thRight }}>Fisik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((r) => (
                      <tr key={r.variant_id}>
                        <td style={table.td}>
                          {r.variant?.template?.name} ({r.variant?.sku})
                        </td>
                        <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{r.quantity}</td>
                        <td style={{ ...table.td, ...table.tdRight }}>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={counts[r.variant_id] ?? ''}
                            onChange={(e) => setCounts((c) => ({ ...c, [r.variant_id]: e.target.value }))}
                            style={{ width: 100, textAlign: 'right' }}
                          />
                        </td>
                      </tr>
                    ))}
                    {stock.length === 0 && (
                      <tr>
                        <td style={table.td} colSpan={3}>
                          Tidak ada stok tercatat di lokasi ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <div>
              <Button type="submit" variant="accent" disabled={saving || stock.length === 0} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                {saving ? 'Menyimpan…' : 'Simpan opname'}
              </Button>
            </div>
            {done && <SuccessText>{done}</SuccessText>}
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        )}
      </PageBody>
    </PageShell>
  )
}

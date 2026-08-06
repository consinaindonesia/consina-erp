import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listWarehouses } from '#/server/locations'
import { listVariantsForPicker, receiveGoods } from '#/server/stock'
import { Button, Card, ErrorText, Input, Label, PageBody, PageHeader, PageShell, Select, SuccessText } from '#/components/ui'

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
    <PageShell>
      <PageHeader title="Penerimaan Barang dari Supplier" />
      <PageBody maxWidth={700}>
        <Card>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
            <Label>
              Masuk ke gudang
              <Select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Label>

            {lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select value={l.variant_id} onChange={(e) => updateLine(i, { variant_id: e.target.value })} style={{ flex: 1 }}>
                  <option value="">Pilih varian…</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.template.name} ({v.sku})
                    </option>
                  ))}
                </Select>
                <Input type="number" min="0.01" step="0.01" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} style={{ width: 100 }} />
                <Button variant="secondary" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
                  Hapus
                </Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setLines((rows) => [...rows, emptyLine()])} style={{ alignSelf: 'flex-start' }}>
              + Tambah baris
            </Button>

            <div>
              <Button type="submit" variant="accent" disabled={saving} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                {saving ? 'Menyimpan…' : 'Simpan penerimaan'}
              </Button>
            </div>
            {done && <SuccessText>{done}</SuccessText>}
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        </Card>
      </PageBody>
    </PageShell>
  )
}

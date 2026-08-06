import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { listWarehouses } from '#/server/locations'
import { listInTransit, listVariantsForPicker, transferReceive, transferSend } from '#/server/stock'
import { Badge, Button, Card, CardBody, ErrorText, Input, Label, PageBody, PageHeader, PageShell, SectionLabel, Select } from '#/components/ui'
import { color, font } from '#/lib/theme'

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
    <PageShell>
      <PageHeader title="Transfer Antar Gudang" />
      <PageBody maxWidth={860}>
        <p style={{ font: `400 13px/1.5 ${font.sans}`, color: color.textSubtle, margin: 0 }}>
          Transfer selalu dua langkah: kirim ke transit, baru diterima di tujuan. Barang tidak pernah hilang di tengah jalan.
        </p>

        <Card style={{ maxWidth: 620 }}>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>
                  Dari
                  <Select value={srcWarehouseId} onChange={(e) => setSrcWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              </div>
              <div style={{ flex: 1 }}>
                <Label>
                  Ke
                  <Select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </Select>
                </Label>
              </div>
            </div>

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
              <Button type="submit" variant="primary" disabled={saving} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                {saving ? 'Mengirim…' : 'Kirim ke Transit'}
              </Button>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
          </form>
        </Card>

        <SectionLabel>Barang Dalam Perjalanan</SectionLabel>
        {inTransit.length === 0 && <p style={{ font: `400 13.5px/1.5 ${font.sans}`, color: color.textMuted }}>Tidak ada barang yang sedang dalam perjalanan.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {inTransit.map((p) => (
            <InTransitCard key={p.id} picking={p} onReceived={() => router.invalidate()} />
          ))}
        </div>
      </PageBody>
    </PageShell>
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
    <Card style={{ maxWidth: 620 }}>
      <CardBody>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ font: `600 13px/1 ${font.mono}`, color: color.textStrong }}>{picking.reference}</span>
          <Badge>
            {picking.src?.code} → {picking.dest?.code}
          </Badge>
        </div>
        <ul style={{ margin: '10px 0', paddingLeft: 18, font: `400 13px/1.6 ${font.sans}`, color: color.textSubtle }}>
          {picking.lines.map((l, i) => (
            <li key={i}>
              {l.variant?.template?.name} ({l.variant?.sku}) — {l.qty_done} unit
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          onClick={onReceive}
          disabled={receiving}
          style={{ border: `1px solid ${color.brandGreen}`, color: color.brandGreen }}
        >
          {receiving ? 'Menerima…' : 'Terima di tujuan'}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </CardBody>
    </Card>
  )
}

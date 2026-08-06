import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { listWarehouses } from '#/server/locations'
import {
  checkMaterialAvailability,
  completeManufacturingOrder,
  completeWorkOrder,
  createManufacturingOrder,
  getManufacturingOrder,
  listManufacturableProducts,
  listManufacturingOrders,
} from '#/server/production'
import { Badge, Button, Card, CardBody, ErrorText, Input, Label, PageBody, PageHeader, PageShell, SectionLabel, Select, Title } from '#/components/ui'
import { color, font } from '#/lib/theme'

export const Route = createFileRoute('/production')({
  component: Production,
  loader: async () => ({
    warehouses: await listWarehouses(),
    boms: await listManufacturableProducts(),
    orders: await listManufacturingOrders(),
  }),
})

type Availability = Awaited<ReturnType<typeof checkMaterialAvailability>>
type MoDetail = Awaited<ReturnType<typeof getManufacturingOrder>>

function Production() {
  const { warehouses, boms, orders } = Route.useLoaderData()
  const router = useRouter()

  const [bomId, setBomId] = useState(boms[0]?.id ?? '')
  const [variantId, setVariantId] = useState(boms[0]?.template.variants[0]?.id ?? '')
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [qtyPlanned, setQtyPlanned] = useState('10')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedMoId, setSelectedMoId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MoDetail | null>(null)
  const [qtyProduced, setQtyProduced] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedBom = boms.find((b) => b.id === bomId)

  useEffect(() => {
    setVariantId(selectedBom?.template.variants[0]?.id ?? '')
  }, [bomId])

  useEffect(() => {
    const qty = Number(qtyPlanned)
    if (!bomId || !warehouseId || !(qty > 0)) {
      setAvailability(null)
      return
    }
    let cancelled = false
    checkMaterialAvailability({ data: { bom_id: bomId, warehouse_id: warehouseId, qty_planned: qty } })
      .then((res) => {
        if (!cancelled) setAvailability(res)
      })
      .catch(() => {
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [bomId, warehouseId, qtyPlanned])

  async function loadDetail(moId: string) {
    setSelectedMoId(moId)
    const d = await getManufacturingOrder({ data: moId })
    setDetail(d)
    setQtyProduced(String(d.mo.qty_planned))
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const qty = Number(qtyPlanned)
      if (!(qty > 0)) throw new Error('Jumlah rencana harus lebih dari 0.')
      if (!variantId) throw new Error('Pilih varian yang akan diproduksi.')
      const { moId } = await createManufacturingOrder({
        data: { bom_id: bomId, variant_id: variantId, warehouse_id: warehouseId, qty_planned: qty },
      })
      await router.invalidate()
      await loadDetail(moId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  async function onCompleteWorkOrder(workOrderId: string) {
    setBusy(true)
    setError(null)
    try {
      await completeWorkOrder({ data: workOrderId })
      if (selectedMoId) await loadDetail(selectedMoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onFinishProduction(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMoId) return
    setBusy(true)
    setError(null)
    try {
      const qty = Number(qtyProduced)
      if (!(qty > 0)) throw new Error('Jumlah hasil produksi harus lebih dari 0.')
      await completeManufacturingOrder({ data: { mo_id: selectedMoId, qty_produced: qty } })
      await router.invalidate()
      await loadDetail(selectedMoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const allOpsDone = detail ? detail.workOrders.every((w) => w.state === 'done') : false
  const nextPendingIndex = detail ? detail.workOrders.findIndex((w) => w.state !== 'done') : -1

  return (
    <PageShell>
      <PageHeader title="Produksi" />
      <PageBody maxWidth={1000}>
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>Buat Manufacturing Order</SectionLabel>
            <Card>
              <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18 }}>
                <Label>
                  Produk (resep)
                  <Select value={bomId} onChange={(e) => setBomId(e.target.value)}>
                    {boms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.template.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Varian
                  <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                    {selectedBom?.template.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.sku}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Gudang
                  <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Jumlah rencana
                  <Input type="number" min="0.01" step="0.01" value={qtyPlanned} onChange={(e) => setQtyPlanned(e.target.value)} />
                </Label>

                {availability && (
                  <div style={{ font: `400 13px/1.4 ${font.sans}`, border: `1px solid ${color.border}`, borderRadius: 9, padding: 12 }}>
                    <SectionLabel>Ketersediaan bahan</SectionLabel>
                    <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
                      <tbody>
                        {availability.map((a) => (
                          <tr key={a.variant_id}>
                            <td style={{ padding: '4px 0', color: color.textSubtle, font: `400 13px/1.4 ${font.sans}` }}>
                              {a.name} ({a.sku})
                            </td>
                            <td style={{ padding: '4px 0', textAlign: 'right', font: `500 12.5px/1 ${font.mono}`, color: a.sufficient ? color.brandGreen : color.brandRed }}>
                              butuh {a.needed} / tersedia {a.available}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <Button
                    type="submit"
                    variant="accent"
                    disabled={creating || (availability !== null && availability.some((a) => !a.sufficient))}
                    style={{ padding: '11px 18px', fontSize: 13.5 }}
                  >
                    {creating ? 'Membuat…' : 'Buat MO'}
                  </Button>
                </div>
                {error && <ErrorText>{error}</ErrorText>}
              </form>
            </Card>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>Daftar Manufacturing Order</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => loadDetail(o.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 12,
                    border: `1px solid ${color.border}`,
                    borderRadius: 6,
                    background: selectedMoId === o.id ? color.successBg : color.surface,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ font: `600 13.5px/1.3 ${font.sans}`, color: color.text }}>{o.reference}</span>
                  <span style={{ font: `400 13px/1.3 ${font.sans}`, color: color.textSubtle }}>
                    {' '}
                    — {o.variant.template.name} ({o.variant.sku})
                  </span>
                  <br />
                  <span style={{ font: `400 12px/1.6 ${font.mono}`, color: color.textMuted }}>
                    {o.state} · rencana {o.qty_planned} · hasil {o.qty_produced} · {o.warehouse?.code}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {detail && (
          <Card>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Title>
                  {detail.mo.reference} — {detail.mo.variant.template.name} ({detail.mo.variant.sku})
                </Title>
                <p style={{ margin: '6px 0 0', font: `400 13px/1.4 ${font.sans}`, color: color.textSubtle }}>
                  Status: <strong>{detail.mo.state}</strong> · Rencana: {detail.mo.qty_planned} · Hasil: {detail.mo.qty_produced} · Gudang: {detail.mo.warehouse?.name}
                </p>
              </div>

              <SectionLabel>Operasi</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.workOrders.map((w, i) => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${color.dividerSoft}` }}>
                    <span style={{ font: `600 12px/1 ${font.mono}`, color: color.textMuted }}>[{w.work_center.code}]</span>
                    <span style={{ font: `500 13.5px/1 ${font.sans}`, flex: 1 }}>{w.name}</span>
                    <Badge tone={w.state === 'done' ? 'success' : 'neutral'}>{w.state}</Badge>
                    {w.state !== 'done' && detail.mo.state !== 'done' && (
                      <Button variant="secondary" disabled={busy || i !== nextPendingIndex} onClick={() => onCompleteWorkOrder(w.id)}>
                        Tandai selesai
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {detail.mo.state !== 'done' && (
                <form onSubmit={onFinishProduction} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 4 }}>
                  <Label>
                    Jumlah hasil aktual
                    <Input type="number" min="0.01" step="0.01" value={qtyProduced} onChange={(e) => setQtyProduced(e.target.value)} style={{ width: 140 }} />
                  </Label>
                  <Button type="submit" variant="accent" disabled={busy || !allOpsDone} style={{ padding: '11px 18px', fontSize: 13.5 }}>
                    Selesaikan Produksi
                  </Button>
                  {!allOpsDone && <span style={{ font: `400 12.5px/1 ${font.sans}`, color: color.textMuted }}>Selesaikan semua operasi dulu.</span>}
                </form>
              )}
            </CardBody>
          </Card>
        )}
      </PageBody>
    </PageShell>
  )
}

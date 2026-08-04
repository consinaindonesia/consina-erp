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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 900 }}>
      <h1>Produksi</h1>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: 18 }}>Buat Manufacturing Order</h2>
          <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              Produk (resep)
              <select value={bomId} onChange={(e) => setBomId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
                {boms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.template.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Varian
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
                {selectedBom?.template.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gudang
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jumlah rencana
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={qtyPlanned}
                onChange={(e) => setQtyPlanned(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
              />
            </label>

            {availability && (
              <div style={{ fontSize: 14, border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
                <strong>Ketersediaan bahan</strong>
                <table style={{ width: '100%', marginTop: 6 }}>
                  <tbody>
                    {availability.map((a) => (
                      <tr key={a.variant_id} style={{ color: a.sufficient ? '#1F6F4A' : '#C8362A' }}>
                        <td>{a.name} ({a.sku})</td>
                        <td style={{ textAlign: 'right' }}>
                          butuh {a.needed} / tersedia {a.available}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={creating || (availability !== null && availability.some((a) => !a.sufficient))}
                style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}
              >
                {creating ? 'Membuat…' : 'Buat MO'}
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 style={{ fontSize: 18 }}>Daftar Manufacturing Order</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => loadDetail(o.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    background: selectedMoId === o.id ? '#f0f7f3' : '#fff',
                  }}
                >
                  <strong>{o.reference}</strong> — {o.variant.template.name} ({o.variant.sku})
                  <br />
                  <span style={{ fontSize: 13, color: '#555' }}>
                    {o.state} · rencana {o.qty_planned} · hasil {o.qty_produced} · {o.warehouse?.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error && <p style={{ color: '#C8362A' }}>{error}</p>}

      {detail && (
        <section style={{ marginTop: 32, borderTop: '1px solid #ddd', paddingTop: 20 }}>
          <h2 style={{ fontSize: 18 }}>
            {detail.mo.reference} — {detail.mo.variant.template.name} ({detail.mo.variant.sku})
          </h2>
          <p>
            Status: <strong>{detail.mo.state}</strong> · Rencana: {detail.mo.qty_planned} · Hasil: {detail.mo.qty_produced} · Gudang: {detail.mo.warehouse?.name}
          </p>

          <h3 style={{ fontSize: 16 }}>Operasi</h3>
          <ol style={{ paddingLeft: 20 }}>
            {detail.workOrders.map((w, i) => (
              <li key={w.id} style={{ marginBottom: 6 }}>
                [{w.work_center.code}] {w.name} — <strong>{w.state}</strong>{' '}
                {w.state !== 'done' && detail.mo.state !== 'done' && (
                  <button type="button" disabled={busy || i !== nextPendingIndex} onClick={() => onCompleteWorkOrder(w.id)}>
                    Tandai selesai
                  </button>
                )}
              </li>
            ))}
          </ol>

          {detail.mo.state !== 'done' && (
            <form onSubmit={onFinishProduction} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <label>
                Jumlah hasil aktual
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={qtyProduced}
                  onChange={(e) => setQtyProduced(e.target.value)}
                  style={{ display: 'block', padding: 8, marginTop: 4, width: 140 }}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !allOpsDone}
                style={{ padding: '10px 18px', background: '#1F6F4A', color: '#fff', border: 0, borderRadius: 6 }}
              >
                Selesaikan Produksi
              </button>
              {!allOpsDone && <span style={{ fontSize: 13, color: '#888' }}>Selesaikan semua operasi dulu.</span>}
            </form>
          )}
        </section>
      )}
    </main>
  )
}

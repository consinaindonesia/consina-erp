import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getInventoryValue,
  getReorderSuggestions,
  getSalesByStore,
  getStockCard,
  listVariantsForReport,
} from '#/server/reports'

export const Route = createFileRoute('/reports')({
  component: Reports,
  loader: async () => ({
    variants: await listVariantsForReport(),
    sales: await getSalesByStore({ data: { from: null, to: null } }),
    inventory: await getInventoryValue(),
    reorder: await getReorderSuggestions(),
  }),
})

function money(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

type StockCard = Awaited<ReturnType<typeof getStockCard>>

function Reports() {
  const { variants, sales, inventory, reorder } = Route.useLoaderData()

  const [variantId, setVariantId] = useState(variants[0]?.id ?? '')
  const [card, setCard] = useState<StockCard | null>(null)
  const [loadingCard, setLoadingCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onShowCard(e: React.FormEvent) {
    e.preventDefault()
    setLoadingCard(true)
    setError(null)
    try {
      const rows = await getStockCard({ data: variantId })
      setCard(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingCard(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 1000 }}>
      <h1>Laporan</h1>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Kartu Stok</h2>
        <form onSubmit={onShowCard} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ padding: 8, flex: 1, maxWidth: 360 }}>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.template.name} ({v.sku})
              </option>
            ))}
          </select>
          <button type="submit" disabled={loadingCard}>
            {loadingCard ? 'Memuat…' : 'Tampilkan'}
          </button>
        </form>
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
        {card && (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: 6 }}>Tanggal</th>
                  <th style={{ padding: 6 }}>Referensi</th>
                  <th style={{ padding: 6 }}>Dari</th>
                  <th style={{ padding: 6 }}>Ke</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Saldo Perusahaan</th>
                </tr>
              </thead>
              <tbody>
                {card.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 6, color: '#888' }}>
                      Belum ada pergerakan untuk produk ini.
                    </td>
                  </tr>
                )}
                {card.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 6 }}>{new Date(row.happened_at).toLocaleString('id-ID')}</td>
                    <td style={{ padding: 6 }}>{row.reference}</td>
                    <td style={{ padding: 6 }}>{row.src_name}</td>
                    <td style={{ padding: 6 }}>{row.dest_name}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{row.qty}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{row.running_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Penjualan per Toko</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 6 }}>Toko</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Jumlah Struk</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Qty Terjual</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Pendapatan</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 6, color: '#888' }}>
                  Belum ada penjualan.
                </td>
              </tr>
            )}
            {sales.map((s) => (
              <tr key={s.warehouse_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6 }}>
                  {s.warehouse_code} — {s.warehouse_name}
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>{s.order_count}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{s.qty_sold}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{money(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18 }}>Nilai Persediaan</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 6 }}>Produk</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Qty di Tangan</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Harga Pokok</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Total Nilai</th>
            </tr>
          </thead>
          <tbody>
            {inventory.rows.map((r) => (
              <tr key={r.variant_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6 }}>
                  {r.product_name} ({r.sku})
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>{r.qty_on_hand}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{money(r.cost_price)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{money(r.total_value)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #333' }}>
              <td style={{ padding: 6 }} colSpan={3}>
                Total nilai persediaan
              </td>
              <td style={{ padding: 6, textAlign: 'right' }}>{money(inventory.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 32, marginBottom: 40 }}>
        <h2 style={{ fontSize: 18 }}>Produk di Bawah Titik Minimum — Usulan Pesan Ulang</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 6 }}>Lokasi</th>
              <th style={{ padding: 6 }}>Produk</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Stok</th>
              <th style={{ padding: 6, textAlign: 'right' }}>Titik Minimum</th>
              <th style={{ padding: 6 }}>Usulan</th>
            </tr>
          </thead>
          <tbody>
            {reorder.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 6, color: '#1F6F4A' }}>
                  Semua produk masih di atas titik minimum.
                </td>
              </tr>
            )}
            {reorder.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6 }}>
                  {r.warehouse_code} — {r.warehouse_name}
                </td>
                <td style={{ padding: 6 }}>
                  {r.product_name} ({r.sku})
                </td>
                <td style={{ padding: 6, textAlign: 'right', color: '#C8362A' }}>{r.qty_on_hand}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{r.reorder_point}</td>
                <td style={{ padding: 6, fontWeight: 600 }}>{r.suggestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

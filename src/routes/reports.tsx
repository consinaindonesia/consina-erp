import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getInventoryValue,
  getReorderSuggestions,
  getSalesByStore,
  getStockCard,
  listVariantsForReport,
} from '#/server/reports'
import { Badge, Button, Card, ErrorText, PageBody, PageHeader, PageShell, SectionLabel, Select, table } from '#/components/ui'
import { color, font } from '#/lib/theme'

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
    <PageShell>
      <PageHeader title="Laporan" />
      <PageBody maxWidth={1100}>
        <SectionLabel>Kartu Stok</SectionLabel>
        <Card>
          <form onSubmit={onShowCard} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 16, borderBottom: card ? `1px solid ${color.divider}` : 0 }}>
            <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ flex: 1, maxWidth: 360 }}>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.template.name} ({v.sku})
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary" disabled={loadingCard}>
              {loadingCard ? 'Memuat…' : 'Tampilkan'}
            </Button>
          </form>
          {card && (
            <div style={table.wrap}>
              <table style={table.table}>
                <thead>
                  <tr>
                    <th style={table.th}>Tanggal</th>
                    <th style={table.th}>Referensi</th>
                    <th style={table.th}>Dari</th>
                    <th style={table.th}>Ke</th>
                    <th style={{ ...table.th, ...table.thRight }}>Qty</th>
                    <th style={{ ...table.th, ...table.thRight }}>Saldo Perusahaan</th>
                  </tr>
                </thead>
                <tbody>
                  {card.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...table.td, color: color.textMuted }}>
                        Belum ada pergerakan untuk produk ini.
                      </td>
                    </tr>
                  )}
                  {card.map((row, i) => (
                    <tr key={i}>
                      <td style={{ ...table.td, ...table.tdMono, color: color.textMuted, fontSize: 12 }}>{new Date(row.happened_at).toLocaleString('id-ID')}</td>
                      <td style={{ ...table.td, ...table.tdMono, fontWeight: 500 }}>{row.reference}</td>
                      <td style={{ ...table.td, ...table.tdMono, color: color.textSubtle, fontSize: 12 }}>{row.src_name}</td>
                      <td style={{ ...table.td, ...table.tdMono, color: color.textSubtle, fontSize: 12 }}>{row.dest_name}</td>
                      <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, fontWeight: 600 }}>{row.qty}</td>
                      <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, fontWeight: 600, color: color.text }}>{row.running_balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {error && <ErrorText>{error}</ErrorText>}

        <SectionLabel>Penjualan per Toko</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Toko</th>
                  <th style={{ ...table.th, ...table.thRight }}>Jumlah Struk</th>
                  <th style={{ ...table.th, ...table.thRight }}>Qty Terjual</th>
                  <th style={{ ...table.th, ...table.thRight }}>Pendapatan</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ ...table.td, color: color.textMuted }}>
                      Belum ada penjualan.
                    </td>
                  </tr>
                )}
                {sales.map((s) => (
                  <tr key={s.warehouse_id}>
                    <td style={table.td}>
                      {s.warehouse_code} — {s.warehouse_name}
                    </td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{s.order_count}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{s.qty_sold}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, fontWeight: 600 }}>{money(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <SectionLabel>Nilai Persediaan</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Produk</th>
                  <th style={{ ...table.th, ...table.thRight }}>Qty di Tangan</th>
                  <th style={{ ...table.th, ...table.thRight }}>Harga Pokok</th>
                  <th style={{ ...table.th, ...table.thRight }}>Total Nilai</th>
                </tr>
              </thead>
              <tbody>
                {inventory.rows.map((r) => (
                  <tr key={r.variant_id}>
                    <td style={table.td}>
                      {r.product_name} ({r.sku})
                    </td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{r.qty_on_hand}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{money(r.cost_price)}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{money(r.total_value)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...table.td, borderTop: `2px solid ${color.textStrong}`, borderBottom: 0, font: `600 13px/1 ${font.sans}` }} colSpan={3}>
                    Total nilai persediaan
                  </td>
                  <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, borderTop: `2px solid ${color.textStrong}`, borderBottom: 0, fontWeight: 700 }}>
                    {money(inventory.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <SectionLabel>Produk di Bawah Titik Minimum — Usulan Pesan Ulang</SectionLabel>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Lokasi</th>
                  <th style={table.th}>Produk</th>
                  <th style={{ ...table.th, ...table.thRight }}>Stok</th>
                  <th style={{ ...table.th, ...table.thRight }}>Titik Minimum</th>
                  <th style={table.th}>Usulan</th>
                </tr>
              </thead>
              <tbody>
                {reorder.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...table.td, color: color.brandGreen }}>
                      Semua produk masih di atas titik minimum.
                    </td>
                  </tr>
                )}
                {reorder.map((r, i) => (
                  <tr key={i}>
                    <td style={table.td}>
                      {r.warehouse_code} — {r.warehouse_name}
                    </td>
                    <td style={table.td}>
                      {r.product_name} ({r.sku})
                    </td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, color: color.brandRed, fontWeight: 600 }}>{r.qty_on_hand}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono, color: color.textMuted }}>{r.reorder_point}</td>
                    <td style={table.td}>
                      <Badge tone={r.suggestion === 'Transfer dari Gudang Pusat' ? 'success' : 'warn'}>{r.suggestion}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageBody>
    </PageShell>
  )
}

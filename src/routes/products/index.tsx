import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, PageBody, PageHeader, PageShell, table } from '#/components/ui'
import { listProducts } from '#/server/products'
import { color, font } from '#/lib/theme'

export const Route = createFileRoute('/products/')({
  component: ProductList,
  loader: () => listProducts(),
})

function ProductList() {
  const products = Route.useLoaderData()

  return (
    <PageShell>
      <PageHeader
        title="Produk"
        right={
          <Link to="/products/new" style={{ color: '#fff', font: `600 12.5px/1 ${font.sans}` }}>
            + Tambah produk
          </Link>
        }
      />
      <PageBody maxWidth={1000}>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <thead>
                <tr>
                  <th style={table.th}>Nama</th>
                  <th style={table.th}>Kategori</th>
                  <th style={table.th}>Satuan</th>
                  <th style={table.th}>Produksi sendiri?</th>
                  <th style={{ ...table.th, ...table.thRight }}>Varian</th>
                  <th style={{ ...table.th, ...table.thRight }}>Harga jual</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td style={table.td}>
                      <Link to="/products/$templateId" params={{ templateId: p.id }} style={{ color: color.text, fontWeight: 500 }}>
                        {p.name}
                      </Link>
                    </td>
                    <td style={table.td}>{p.category?.name ?? '—'}</td>
                    <td style={table.td}>{p.uom.name}</td>
                    <td style={table.td}>{p.is_manufactured ? 'Ya' : 'Tidak'}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{p.variant_count}</td>
                    <td style={{ ...table.td, ...table.tdRight, ...table.tdMono }}>{formatRupiah(p.sale_price)}</td>
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

function formatRupiah(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

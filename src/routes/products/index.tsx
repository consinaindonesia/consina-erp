import { createFileRoute, Link } from '@tanstack/react-router'
import { listProducts } from '#/server/products'

export const Route = createFileRoute('/products/')({
  component: ProductList,
  loader: () => listProducts(),
})

function ProductList() {
  const products = Route.useLoaderData()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1>Produk</h1>
        <Link to="/products/new" style={{ color: '#1F6F4A', fontWeight: 600 }}>
          + Tambah produk
        </Link>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}>Nama</th>
            <th style={th}>Kategori</th>
            <th style={th}>Satuan</th>
            <th style={th}>Produksi sendiri?</th>
            <th style={th}>Varian</th>
            <th style={th}>Harga jual</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td style={td}>
                <Link to="/products/$templateId" params={{ templateId: p.id }} style={{ color: '#1B211E' }}>
                  {p.name}
                </Link>
              </td>
              <td style={td}>{p.category?.name ?? '—'}</td>
              <td style={td}>{p.uom.name}</td>
              <td style={td}>{p.is_manufactured ? 'Ya' : 'Tidak'}</td>
              <td style={td}>{p.variant_count}</td>
              <td style={td}>{formatRupiah(p.sale_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #E0E5E3', padding: 6, fontSize: 12.5 }
const td: React.CSSProperties = { borderBottom: '1px solid #F0F3F1', padding: 6, fontSize: 13.5 }

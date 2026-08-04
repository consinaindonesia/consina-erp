import { Link } from '@tanstack/react-router'

const links = [
  { to: '/', label: 'Beranda' },
  { to: '/products', label: 'Produk' },
  { to: '/categories', label: 'Kategori' },
  { to: '/uom', label: 'Satuan' },
  { to: '/attributes', label: 'Atribut' },
  { to: '/locations', label: 'Lokasi' },
  { to: '/receiving', label: 'Penerimaan' },
  { to: '/transfer', label: 'Transfer' },
  { to: '/opname', label: 'Opname' },
  { to: '/pos', label: 'Kasir' },
  { to: '/production', label: 'Produksi' },
  { to: '/work-centers', label: 'Work Center' },
] as const

export function Nav() {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        padding: '0 16px',
        height: 46,
        alignItems: 'center',
        background: '#16211C',
        borderBottom: '1px solid #22302A',
      }}
    >
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          activeOptions={{ exact: l.to === '/' }}
          style={{
            border: 0,
            borderRadius: 6,
            padding: '6px 11px',
            font: '500 12.5px/1 system-ui, sans-serif',
            color: 'rgba(255,255,255,.82)',
            textDecoration: 'none',
          }}
          activeProps={{ style: { background: 'rgba(255,255,255,.14)', color: '#fff' } }}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

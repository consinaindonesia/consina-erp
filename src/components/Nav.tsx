import { Link } from '@tanstack/react-router'
import { color, font } from '#/lib/theme'

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
  { to: '/reports', label: 'Laporan' },
] as const

export function Nav() {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 16px',
        height: 46,
        background: color.navBg,
        borderBottom: `1px solid ${color.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 60,
      }}
    >
      <span
        style={{
          font: `600 11px/1 ${font.mono}`,
          letterSpacing: '.14em',
          color: color.navLabel,
          textTransform: 'uppercase',
          flex: 'none',
        }}
      >
        Consina ERP
      </span>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            activeOptions={{ exact: l.to === '/' }}
            style={{
              flex: 'none',
              border: 0,
              borderRadius: 6,
              padding: '6px 11px',
              font: `500 12.5px/1 ${font.sans}`,
              color: color.navInactiveFg,
              background: color.navInactiveBg,
              textDecoration: 'none',
            }}
            activeProps={{ style: { background: color.brandRed, color: '#fff' } }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

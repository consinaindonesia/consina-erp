// Token warna & font diambil dari instance Odoo sungguhan milik Consina
// (dev.consina.cloud/odoo, mode gelap) via computed style, BUKAN dari
// mockup desain lagi — mockup pakai font & warna yang ternyata beda dari
// Odoo asli (IBM Plex vs system font, hijau nyaris-hitam vs hijau cerah).
// Contoh nilai asli yang disampel: navbar rgb(13,108,52), teks
// rgb(228,228,228), latar konten rgb(27,29,38), pill menu rgb(38,42,54)
// radius 4px, font-family system-ui/-apple-system.

export const font = {
  sans: "-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif",
  // Odoo tidak punya font angka terpisah — satu font-family di semua
  // tempat. Token ini dipertahankan (bukan dihapus) supaya semua
  // pemakaian `font.mono` di seluruh halaman otomatis ikut berubah
  // tanpa perlu menyunting satu-satu.
  mono: "-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif",
}

export const color = {
  // Bar navigasi global (hijau Odoo asli)
  navBg: '#0D6C34',
  navBorder: 'rgba(0,0,0,.2)',
  navLabel: 'rgba(255,255,255,.72)',
  navInactiveBg: '#262A36',
  navInactiveFg: '#E4E4E4',
  navActiveBg: '#fff',
  navActiveFg: '#0D6C34',

  // Bar judul per halaman — netral gelap, BUKAN bar hijau kedua (di
  // Odoo asli area di bawah navbar tidak berwarna, cuma breadcrumb
  // biasa di atas kanvas gelap).
  pageHeaderBg: '#20232E',
  pageHeaderBorder: 'rgba(255,255,255,.08)',

  // Bar sesi Kasir — ini status bar sungguhan (bukan judul halaman),
  // jadi tetap boleh berwarna hijau seperti navbar.
  posBarBg: '#0D6C34',

  // Kanvas konten & permukaan kartu (semua gelap)
  panelBg: '#1B1D26',
  surface: '#242733',
  surfaceRaised: '#2A2E3B',
  border: 'rgba(255,255,255,.09)',
  borderStrong: 'rgba(255,255,255,.16)',
  divider: 'rgba(255,255,255,.08)',
  dividerSoft: 'rgba(255,255,255,.06)',
  tableHeadBg: '#20232E',
  subtleBg: '#20232E',

  // Teks di atas kanvas gelap
  text: '#E4E4E4',
  textStrong: '#FFFFFF',
  textSubtle: '#B4BAC7',
  textMuted: '#8A90A0',
  textFaint: '#5F6575',

  // Aksen
  brandRed: '#E5534B',
  brandGreen: '#14804A',
  brandGreenHover: '#0F6B3D',
  brandDark: '#2A2E3B',

  // Status (latar transparan tipis + teks terang, cocok untuk kanvas gelap)
  warnBg: 'rgba(245,166,35,.16)',
  warnFg: '#F5A623',
  warnBorder: 'rgba(245,166,35,.38)',
  successBg: 'rgba(20,128,74,.22)',
  successFg: '#4ADE80',
  successFgSoft: '#7CD9A8',
  successBorder: 'rgba(20,128,74,.45)',
  dangerBg: 'rgba(229,83,75,.18)',
  dangerFg: '#F87171',
  dangerBorder: 'rgba(229,83,75,.4)',
}

export const radius = {
  sm: 4,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 16,
}

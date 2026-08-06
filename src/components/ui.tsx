import type { CSSProperties, ReactNode } from 'react'
import { color, font, radius } from '#/lib/theme'

// Primitif UI bersama, dipakai di semua halaman supaya tampilannya
// konsisten dan sama dengan mockup desain ("ERP Retail Mockup.dc.html")
// — bukan style inline yang diulang-ulang beda-beda di tiap file.

export function PageShell({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: 'calc(100vh - 46px)', background: color.panelBg }}>{children}</div>
}

export function PageHeader({ title, tabs, right }: { title: string; tabs?: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        height: 48,
        background: color.headerBg,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 18px',
        color: '#fff',
      }}
    >
      <span style={{ font: `600 14.5px/1 ${font.sans}` }}>{title}</span>
      {tabs}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>{right}</div>}
    </div>
  )
}

export function PageBody({ children, maxWidth = 1200 }: { children: ReactNode; maxWidth?: number }) {
  return <div style={{ padding: 20, maxWidth, display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.xl,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: 18, ...style }}>{children}</div>
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        font: `500 11.5px/1 ${font.sans}`,
        color: color.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '.05em',
      }}
    >
      {children}
    </span>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return <span style={{ font: `600 14.5px/1 ${font.sans}`, color: color.text }}>{children}</span>
}

type BadgeTone = 'neutral' | 'warn' | 'success' | 'danger'

const badgeTones: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: color.dividerSoft, fg: color.textSubtle },
  warn: { bg: color.warnBg, fg: color.warnFg },
  success: { bg: color.successBg, fg: color.successFg },
  danger: { bg: color.dangerBg, fg: color.dangerFg },
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  const t = badgeTones[tone]
  return (
    <span
      style={{
        font: `600 11.5px/1 ${font.mono}`,
        color: t.fg,
        background: t.bg,
        padding: '5px 9px',
        borderRadius: radius.sm,
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  )
}

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger-outline'

const buttonBase: CSSProperties = {
  border: 0,
  borderRadius: radius.md,
  padding: '9px 16px',
  font: `600 12.5px/1 ${font.sans}`,
  cursor: 'pointer',
}

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { ...buttonBase, background: color.brandDark, color: '#fff' },
  accent: { ...buttonBase, background: color.brandGreen, color: '#fff' },
  secondary: { ...buttonBase, background: color.surface, color: color.textSubtle, border: `1px solid ${color.borderStrong}`, fontWeight: 500 },
  'danger-outline': { ...buttonBase, background: color.surface, color: color.brandRed, border: `1px solid ${color.dangerBorder}`, fontWeight: 500 },
}

export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
  disabled,
  style,
}: {
  children: ReactNode
  variant?: ButtonVariant
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...buttonVariants[variant], opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}
    >
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.md,
        padding: '9px 12px',
        font: `400 14px/1 ${font.sans}`,
        color: color.text,
        outline: 'none',
        ...props.style,
      }}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        border: `1px solid ${color.borderStrong}`,
        borderRadius: radius.md,
        padding: '9px 12px',
        font: `400 14px/1 ${font.sans}`,
        color: color.text,
        background: '#fff',
        outline: 'none',
        ...props.style,
      }}
    />
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: `500 11.5px/1 ${font.sans}`, color: color.textMuted }}>{children}</label>
}

export const table = {
  wrap: { overflowX: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, font: `400 13px/1.3 ${font.sans}` },
  th: {
    textAlign: 'left' as const,
    padding: '11px 14px',
    background: color.tableHeadBg,
    borderBottom: `1px solid ${color.divider}`,
    font: `500 11.5px/1 ${font.sans}`,
    color: color.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '.05em',
  },
  thRight: { textAlign: 'right' as const },
  td: { padding: '12px 14px', borderBottom: `1px solid ${color.dividerSoft}` },
  tdRight: { textAlign: 'right' as const },
  tdMono: { fontFamily: font.mono },
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div style={{ padding: 34, textAlign: 'center', font: `400 13.5px/1.5 ${font.sans}`, color: color.textMuted }}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p style={{ color: color.brandRed, font: `500 13px/1.4 ${font.sans}` }}>{children}</p>
}

export function SuccessText({ children }: { children: ReactNode }) {
  return <p style={{ color: color.brandGreen, font: `500 13px/1.4 ${font.sans}` }}>{children}</p>
}

import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Input, Label, PageShell } from '#/components/ui'
import { listWarehouses } from '#/server/locations'
import {
  closePosSession,
  getOpenSession,
  listProductsForPos,
  listSessionOrders,
  openSession,
  syncPosOrder,
} from '#/server/pos'
import {
  cacheProducts,
  getCachedProducts,
  getSession,
  getUnsyncedOrders,
  markOrderSynced,
  queueOrder,
  saveSession,
  clearSession as clearLocalSession,
} from '#/lib/pos-db'
import type {
  CachedProduct,
  LocalSession,
  PendingOrder,
  PendingPayment,
} from '#/lib/pos-db'
import { color, font } from '#/lib/theme'

export const Route = createFileRoute('/pos')({
  component: Pos,
  loader: () => listWarehouses(),
})

function formatRupiah(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

function makeOrderNo() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds() % 100)}`
  return `POS/${stamp}`
}

type CartItem = { product: CachedProduct; qty: number }

function Pos() {
  const warehouses = Route.useLoaderData()

  const [localSession, setLocalSession] = useState<
    LocalSession | null | 'loading'
  >('loading')
  const [products, setProducts] = useState<Array<CachedProduct>>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [lastReceipt, setLastReceipt] = useState<{
    order_no: string
    lines: Array<CartItem>
    total: number
    payments: Array<PendingPayment>
  } | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    getSession().then(async (s) => {
      setLocalSession(s ?? null)
      if (s) setProducts(await getCachedProducts())
      refreshPendingCount()
    })
  }, [])

  async function refreshPendingCount() {
    const unsynced = await getUnsyncedOrders()
    setPendingCount(unsynced.length)
  }

  const isSyncingRef = useRef(false)

  const syncPending = useCallback(async () => {
    // Penjaga: interval berkala, event 'online', dan klik manual bisa
    // saling tumpang tindih. Tanpa ini dua panggilan bisa sama-sama
    // membaca daftar "belum tersinkron" yang sama sebelum salah satunya
    // sempat menandai selesai.
    if (isSyncingRef.current) return
    isSyncingRef.current = true
    try {
      const unsynced = await getUnsyncedOrders()
      let synced = 0
      for (const order of unsynced) {
        try {
          const result = await syncPosOrder({
            data: {
              session_id: order.session_id,
              client_uuid: order.client_uuid,
              order_no: order.order_no,
              lines: order.lines,
              payments: order.payments,
            },
          })
          // Jangan percaya begitu saja kalau panggilannya tidak melempar
          // error — struk data keuangan, jadi HARUS ada bukti ID struk
          // yang valid dari server sebelum ditandai tersinkron secara
          // lokal. TypeScript menganggap respons ini pasti berbentuk
          // { orderId: string }, tapi itu cuma benar kalau serialisasi
          // RPC-nya berhasil — pernah terbukti langsung: server yang
          // gagal di tengah jalan (mis. proses dev di-restart) membuat
          // panggilan ini RESOLVE tanpa error sama sekali, dengan bentuk
          // yang tidak sesuai tipe. Cek ini murni jaring pengaman
          // runtime terhadap kasus itu, bukan berlebihan.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!result || typeof result.orderId !== 'string' || result.orderId.length === 0) {
            throw new Error('Respons sinkron tidak valid — tidak ada ID struk dari server.')
          }
          await markOrderSynced(order.client_uuid)
          synced++
        } catch {
          break // masih offline / gagal — coba lagi nanti, jangan hentikan yang sudah tersinkron
        }
      }
      await refreshPendingCount()
      if (synced > 0) setSyncMessage(`${synced} struk berhasil disinkron.`)
    } finally {
      isSyncingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (localSession && localSession !== 'loading') {
      syncPending()
      window.addEventListener('online', syncPending)
      const interval = setInterval(syncPending, 15000)
      return () => {
        window.removeEventListener('online', syncPending)
        clearInterval(interval)
      }
    }
  }, [localSession, syncPending])

  if (localSession === 'loading') {
    return (
      <PageShell>
        <div style={{ padding: 24, font: `400 13.5px/1 ${font.sans}`, color: color.textMuted }}>Memuat…</div>
      </PageShell>
    )
  }

  if (!localSession) {
    return (
      <OpenSessionForm
        warehouses={warehouses}
        onOpened={async (session) => {
          setLocalSession(session)
          const list = await listProductsForPos()
          await cacheProducts(list)
          setProducts(list)
        }}
      />
    )
  }

  return (
    <PosScreen
      session={localSession}
      products={products}
      pendingCount={pendingCount}
      syncMessage={syncMessage}
      onOrderQueued={refreshPendingCount}
      onSync={syncPending}
      onReceipt={setLastReceipt}
      lastReceipt={lastReceipt}
      onSessionClosed={() => {
        clearLocalSession()
        setLocalSession(null)
        setLastReceipt(null)
      }}
    />
  )
}

function OpenSessionForm({
  warehouses,
  onOpened,
}: {
  warehouses: Array<{
    id: string
    code: string
    name: string
    is_store: boolean
  }>
  onOpened: (session: LocalSession) => void
}) {
  const stores = warehouses.filter((w) => w.is_store)
  const [warehouseId, setWarehouseId] = useState(stores[0]?.id ?? '')
  const [openingCash, setOpeningCash] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const warehouse = stores.find((w) => w.id === warehouseId)
      if (!warehouse) throw new Error('Pilih toko dulu.')

      const existing = await getOpenSession({ data: warehouseId })
      const session =
        existing ??
        (await openSession({
          data: {
            warehouse_id: warehouseId,
            opening_cash: Number(openingCash),
          },
        }))

      const localSession: LocalSession = {
        key: 'current',
        session_id: session.id,
        warehouse_id: warehouseId,
        warehouse_code: warehouse.code,
        opening_cash: session.opening_cash,
        opened_at: session.opened_at,
      }
      await saveSession(localSession)
      onOpened(localSession)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <div style={{ padding: 24, maxWidth: 420 }}>
        <h1 style={{ font: `600 20px/1.2 ${font.sans}`, margin: '0 0 6px' }}>Buka Sesi Kasir</h1>
        <p style={{ font: `400 13px/1.5 ${font.sans}`, color: color.textSubtle, margin: '0 0 18px' }}>
          Butuh koneksi internet sekali di awal. Setelah sesi terbuka, kasir bisa jalan tanpa internet.
        </p>
        <Card>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18 }}>
            <Label>
              Toko
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                style={{ border: `1px solid ${color.borderStrong}`, borderRadius: 4, padding: '9px 12px', font: `400 14px/1 ${font.sans}`, background: color.surface, color: color.text }}
              >
                {stores.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label>
              Kas awal (Rp)
              <Input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
            </Label>
            <Button type="submit" variant="accent" disabled={saving} style={{ padding: 14, fontSize: 15 }}>
              {saving ? 'Membuka…' : 'Buka Sesi'}
            </Button>
            {error && <p style={{ color: color.brandRed, font: `500 13px/1.4 ${font.sans}` }}>{error}</p>}
          </form>
        </Card>
      </div>
    </PageShell>
  )
}

function PosScreen({
  session,
  products,
  pendingCount,
  syncMessage,
  onOrderQueued,
  onSync,
  onReceipt,
  lastReceipt,
  onSessionClosed,
}: {
  session: LocalSession
  products: Array<CachedProduct>
  pendingCount: number
  syncMessage: string | null
  onOrderQueued: () => void
  onSync: () => void
  onReceipt: (
    r: {
      order_no: string
      lines: Array<CartItem>
      total: number
      payments: Array<PendingPayment>
    } | null,
  ) => void
  lastReceipt: {
    order_no: string
    lines: Array<CartItem>
    total: number
    payments: Array<PendingPayment>
  } | null
  onSessionClosed: () => void
}) {
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<Array<CartItem>>([])
  const [showPay, setShowPay] = useState(false)
  const [showClose, setShowClose] = useState(false)

  const filtered = query.trim()
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.sku.toLowerCase().includes(query.toLowerCase()) ||
          p.barcode === query,
      )
    : products

  const cartTotal = cart.reduce(
    (sum, l) => sum + l.qty * l.product.sale_price,
    0,
  )

  function addToCart(product: CachedProduct) {
    setCart((rows) => {
      const existing = rows.find((r) => r.product.id === product.id)
      if (existing)
        return rows.map((r) =>
          r.product.id === product.id ? { ...r, qty: r.qty + 1 } : r,
        )
      return [...rows, { product, qty: 1 }]
    })
  }

  function updateQty(productId: string, delta: number) {
    setCart((rows) =>
      rows
        .map((r) =>
          r.product.id === productId
            ? { ...r, qty: Math.max(1, r.qty + delta) }
            : r,
        )
        .filter((r) => r.qty > 0),
    )
  }

  function removeFromCart(productId: string) {
    setCart((rows) => rows.filter((r) => r.product.id !== productId))
  }

  async function confirmPayment(payments: Array<PendingPayment>) {
    const order: PendingOrder = {
      client_uuid: crypto.randomUUID(),
      session_id: session.session_id,
      order_no: makeOrderNo(),
      lines: cart.map((l) => ({ variant_id: l.product.id, qty: l.qty })),
      payments,
      subtotal_preview: cartTotal,
      created_at: new Date().toISOString(),
      synced: false,
    }
    await queueOrder(order)
    onOrderQueued()
    onReceipt({
      order_no: order.order_no,
      lines: cart,
      total: cartTotal,
      payments,
    })
    setCart([])
    setShowPay(false)
    onSync()
  }

  return (
    <div style={{ height: 'calc(100vh - 46px)', display: 'flex', flexDirection: 'column', background: color.panelBg }}>
      <div style={{ height: 56, flex: 'none', background: color.posBarBg, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 14, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: 4, background: color.brandRed, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 12px/1 ${font.sans}` }}>C</div>
          <span style={{ font: `600 15px/1 ${font.sans}` }}>Kasir · {session.warehouse_code}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 20, background: 'rgba(255,255,255,.12)', font: `500 11.5px/1 ${font.mono}` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#57D191' }} />
          {pendingCount > 0 ? `${pendingCount} struk belum tersinkron` : 'Semua struk tersinkron'}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {syncMessage && <span style={{ font: `400 12px/1 ${font.sans}`, color: 'rgba(255,255,255,.7)' }}>{syncMessage}</span>}
          <button
            type="button"
            onClick={onSync}
            style={{ border: '1px solid rgba(255,255,255,.32)', background: 'transparent', color: '#fff', borderRadius: 6, padding: '7px 12px', font: `500 12px/1 ${font.sans}`, cursor: 'pointer' }}
          >
            Sinkron sekarang
          </button>
          <button
            type="button"
            onClick={() => setShowClose(true)}
            style={{ border: '1px solid rgba(255,255,255,.32)', background: 'transparent', color: '#fff', borderRadius: 6, padding: '7px 13px', font: `500 12.5px/1 ${font.sans}`, cursor: 'pointer' }}
          >
            Tutup Sesi
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: color.surface, border: `1px solid ${color.borderStrong}`, borderRadius: 6, padding: '0 14px', height: 52, flex: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.textMuted} strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama produk, SKU, atau barcode…"
              style={{ flex: 1, border: 0, outline: 'none', font: `400 15.5px/1 ${font.sans}`, color: color.text, background: 'transparent' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 14, textAlign: 'left', background: color.surface, border: `1px solid ${color.border}`, borderRadius: 6, padding: '11px 14px', cursor: 'pointer' }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 4, background: color.brandGreen, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 12px/1 ${font.mono}`, color: '#fff' }}>
                  {p.sku.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ font: `500 14.5px/1.2 ${font.sans}`, color: color.text }}>{p.name}</span>
                  <span style={{ font: `400 12px/1 ${font.mono}`, color: color.textMuted }}>{p.sku}</span>
                </div>
                <span style={{ font: `600 14.5px/1 ${font.mono}`, color: color.text, minWidth: 104, textAlign: 'right' }}>{formatRupiah(p.sale_price)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 34, textAlign: 'center', font: `400 13.5px/1.5 ${font.sans}`, color: color.textMuted, background: color.surface, border: `1px dashed ${color.borderStrong}`, borderRadius: 6 }}>
                Tidak ada produk cocok.
              </div>
            )}
          </div>
        </div>

        <div style={{ width: 392, flex: 'none', background: color.surface, borderLeft: `1px solid ${color.borderStrong}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: 'none' }}>
            <span style={{ font: `600 13.5px/1 ${font.mono}`, color: color.text }}>Struk</span>
            <span style={{ font: `400 11.5px/1 ${font.mono}`, color: color.textMuted }}>{cart.reduce((a, l) => a + l.qty, 0)} item</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {cart.length === 0 && (
              <div style={{ padding: '44px 26px', textAlign: 'center', color: color.textFaint, font: `400 13.5px/1.55 ${font.sans}` }}>
                Belum ada barang.
                <br />
                Cari produk di sebelah kiri lalu klik untuk menambahkan.
              </div>
            )}
            {cart.map((l) => (
              <div key={l.product.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${color.dividerSoft}` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ font: `500 13.5px/1.25 ${font.sans}` }}>{l.product.name}</span>
                  <span style={{ font: `400 11.5px/1 ${font.mono}`, color: color.textMuted }}>{l.product.sku} · {formatRupiah(l.product.sale_price)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, -1)}
                      style={{ width: 26, height: 26, border: `1px solid ${color.borderStrong}`, background: color.surfaceRaised, borderRadius: 4, font: `600 15px/1 ${font.sans}`, color: color.textSubtle, cursor: 'pointer' }}
                    >
                      −
                    </button>
                    <span style={{ font: `600 13.5px/1 ${font.mono}`, minWidth: 20, textAlign: 'center' }}>{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, 1)}
                      style={{ width: 26, height: 26, border: `1px solid ${color.borderStrong}`, background: color.surfaceRaised, borderRadius: 4, font: `600 15px/1 ${font.sans}`, color: color.textSubtle, cursor: 'pointer' }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(l.product.id)}
                      style={{ marginLeft: 2, border: 0, background: 'transparent', color: color.brandRed, font: `500 11.5px/1 ${font.sans}`, cursor: 'pointer', padding: '6px 2px' }}
                    >
                      hapus
                    </button>
                  </div>
                </div>
                <span style={{ font: `600 14px/1.2 ${font.mono}`, textAlign: 'right' }}>{formatRupiah(l.qty * l.product.sale_price)}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 'none', borderTop: `1px solid ${color.divider}`, padding: '14px 16px 16px', background: color.subtleBg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 11, borderTop: `1px dashed ${color.borderStrong}` }}>
              <span style={{ font: `600 15px/1 ${font.sans}` }}>Total</span>
              <span style={{ font: `600 25px/1 ${font.mono}`, color: color.successFg }}>{formatRupiah(cartTotal)}</span>
            </div>
            <p style={{ margin: '9px 0 12px', font: `400 10.5px/1.4 ${font.mono}`, color: color.textFaint }}>
              Angka ini perkiraan dari harga tersimpan lokal. Nilai final dihitung ulang di server saat sinkron.
            </p>
            <Button variant="accent" disabled={cart.length === 0} onClick={() => setShowPay(true)} style={{ width: '100%', padding: 16, fontSize: 16, borderRadius: 9 }}>
              Bayar
            </Button>
          </div>
        </div>
      </div>

      {showPay && (
        <PayModal
          total={cartTotal}
          onCancel={() => setShowPay(false)}
          onConfirm={confirmPayment}
        />
      )}
      {lastReceipt && !showPay && (
        <Receipt receipt={lastReceipt} onClose={() => onReceipt(null)} />
      )}
      {showClose && (
        <CloseSessionModal
          session={session}
          onCancel={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false)
            onSessionClosed()
          }}
        />
      )}
    </div>
  )
}

function ModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,18,15,.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, zIndex: 100 }}>
      {children}
    </div>
  )
}

function PayModal({
  total,
  onCancel,
  onConfirm,
}: {
  total: number
  onCancel: () => void
  onConfirm: (payments: Array<PendingPayment>) => void
}) {
  const [method, setMethod] = useState<PendingPayment['method']>('cash')
  const [cash, setCash] = useState(String(total))

  const change = Number(cash) - total

  return (
    <ModalOverlay>
      <div style={{ width: 420, background: color.surface, borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${color.divider}`, font: `600 16px/1 ${font.sans}` }}>Pembayaran</div>
        <div style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 16px', background: color.panelBg, borderRadius: 10 }}>
            <span style={{ font: `500 13.5px/1 ${font.sans}`, color: color.textSubtle }}>Total</span>
            <span style={{ font: `600 22px/1 ${font.mono}`, color: color.text }}>{formatRupiah(total)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {(['cash', 'qris', 'edc'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                style={{
                  flex: 1,
                  padding: 12,
                  border: method === m ? `1.5px solid ${color.brandGreen}` : `1.5px solid ${color.borderStrong}`,
                  borderRadius: 10,
                  background: method === m ? color.successBg : color.surfaceRaised,
                  color: method === m ? color.successFg : color.textSubtle,
                  font: `600 14px/1 ${font.sans}`,
                  cursor: 'pointer',
                }}
              >
                {m === 'cash' ? 'Tunai' : m.toUpperCase()}
              </button>
            ))}
          </div>
          {method === 'cash' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <Label>
                Uang diterima
                <Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} style={{ font: `600 17px/1 ${font.mono}` }} />
              </Label>
              <Label>
                Kembalian
                <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: '9px 12px', font: `600 17px/1 ${font.mono}`, background: color.panelBg }}>
                  {formatRupiah(Math.max(0, change))}
                </div>
              </Label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={onCancel} style={{ padding: '13px 20px' }}>
              Batal
            </Button>
            <Button
              variant="accent"
              disabled={method === 'cash' && change < 0}
              onClick={() => onConfirm([{ method, amount: method === 'cash' ? Number(cash) : total }])}
              style={{ flex: 1, padding: 13, fontSize: 15 }}
            >
              Selesaikan &amp; Cetak Struk
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

function Receipt({
  receipt,
  onClose,
}: {
  receipt: {
    order_no: string
    lines: Array<CartItem>
    total: number
    payments: Array<PendingPayment>
  }
  onClose: () => void
}) {
  return (
    <ModalOverlay>
      <div style={{ width: 370, background: color.surface, borderRadius: 8, padding: '26px 24px', boxShadow: '0 20px 50px rgba(0,0,0,.5)', textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: '50%', background: color.successBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color.brandGreen} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4.5 4.5L19 7" />
          </svg>
        </div>
        <div style={{ font: `600 17px/1.3 ${font.sans}` }}>Transaksi tersimpan</div>
        <div style={{ marginTop: 6, font: `400 12.5px/1.5 ${font.mono}`, color: color.textMuted }}>{receipt.order_no}</div>
        <div
          id="print-receipt"
          style={{ margin: '18px 0', padding: 16, border: `1px dashed ${color.borderStrong}`, borderRadius: 6, textAlign: 'left', font: `400 11.5px/1.75 ${font.mono}`, color: color.textSubtle, background: color.subtleBg, whiteSpace: 'pre-wrap' }}
        >
          {receipt.lines
            .map(
              (l) =>
                `${l.product.name} x${l.qty}  ${formatRupiah(l.qty * l.product.sale_price)}`,
            )
            .join('\n')}
          {'\n'}
          {'-'.repeat(28)}
          {'\n'}Total: {formatRupiah(receipt.total)}
          {'\n'}Bayar:{' '}
          {receipt.payments
            .map((p) => `${p.method} ${formatRupiah(p.amount)}`)
            .join(', ')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => window.print()} style={{ flex: 1, padding: 12 }}>
            Cetak
          </Button>
          <Button variant="primary" onClick={onClose} style={{ flex: 1, padding: 12 }}>
            Struk Baru
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function CloseSessionModal({
  session,
  onCancel,
  onClosed,
}: {
  session: LocalSession
  onCancel: () => void
  onClosed: () => void
}) {
  const [pendingLeft, setPendingLeft] = useState<number | null>(null)
  const [countedCash, setCountedCash] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<Array<{
    order_no: string
    grand_total: number
  }> | null>(null)

  useEffect(() => {
    getUnsyncedOrders().then((rows) => setPendingLeft(rows.length))
  }, [])

  async function loadRecap() {
    setError(null)
    try {
      const list = await listSessionOrders({ data: session.session_id })
      setOrders(list)
      setCountedCash(String(session.opening_cash))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onConfirmClose() {
    setSaving(true)
    setError(null)
    try {
      await closePosSession({
        data: {
          session_id: session.session_id,
          counted_cash: Number(countedCash),
        },
      })
      onClosed()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay>
      <div style={{ width: 460, background: color.surface, borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${color.divider}`, font: `600 16px/1 ${font.sans}` }}>
          Tutup Sesi · {session.warehouse_code}
        </div>
        <div style={{ padding: 22 }}>
          {pendingLeft !== null && pendingLeft > 0 && (
            <div style={{ background: color.warnBg, border: `1px solid ${color.warnBorder}`, borderRadius: 9, padding: 12, font: `400 12.5px/1.5 ${font.sans}`, color: color.warnFg }}>
              Masih ada {pendingLeft} struk belum tersinkron. Sambungkan internet dan klik &quot;Sinkron sekarang&quot; dulu sebelum menutup sesi, supaya tidak ada struk yang tertinggal.
            </div>
          )}
          {!orders && (
            <Button variant="secondary" onClick={loadRecap} style={{ marginTop: 12, padding: '10px 16px' }}>
              Muat rekap sesi
            </Button>
          )}
          {orders && (
            <>
              <p style={{ font: `400 13px/1.4 ${font.sans}`, color: color.textSubtle }}>{orders.length} struk di sesi ini.</p>
              <Label>
                Kas dihitung fisik (Rp)
                <Input type="number" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              </Label>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Button variant="secondary" onClick={onCancel} style={{ padding: '12px 18px' }}>
                  Nanti
                </Button>
                <Button variant="primary" disabled={saving} onClick={onConfirmClose} style={{ flex: 1, padding: 13 }}>
                  {saving ? 'Menutup…' : 'Tutup & Bukukan'}
                </Button>
              </div>
            </>
          )}
          {!orders && (
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={onCancel} style={{ padding: '10px 16px' }}>
                Batal
              </Button>
            </div>
          )}
          {error && <p style={{ color: color.brandRed, font: `500 13px/1.4 ${font.sans}` }}>{error}</p>}
        </div>
      </div>
    </ModalOverlay>
  )
}

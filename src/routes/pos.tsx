import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
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
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <p>Memuat…</p>
      </main>
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
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        maxWidth: 480,
      }}
    >
      <h1>Buka Sesi Kasir</h1>
      <p style={{ color: '#5A6661', fontSize: 13.5 }}>
        Butuh koneksi internet sekali di awal. Setelah sesi terbuka, kasir bisa
        jalan tanpa internet.
      </p>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <label>
          Toko
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: 8,
              marginTop: 4,
            }}
          >
            {stores.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kas awal (Rp)
          <input
            type="number"
            min="0"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: 8,
              marginTop: 4,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px 18px',
            background: '#1F6F4A',
            color: '#fff',
            border: 0,
            borderRadius: 6,
          }}
        >
          {saving ? 'Membuka…' : 'Buka Sesi'}
        </button>
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </form>
    </main>
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
  const isOnlineRef = useRef(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

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
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        maxWidth: 1100,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h1>Kasir · {session.warehouse_code}</h1>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontSize: 12.5,
          }}
        >
          <span style={{ color: pendingCount > 0 ? '#8a5c12' : '#1F6F4A' }}>
            {pendingCount > 0
              ? `${pendingCount} struk belum tersinkron`
              : 'Semua struk tersinkron'}
          </span>
          <button
            type="button"
            onClick={onSync}
            style={{ padding: '6px 10px', fontSize: 12.5 }}
          >
            Sinkron sekarang
          </button>
          <button
            type="button"
            onClick={() => setShowClose(true)}
            style={{
              padding: '6px 10px',
              fontSize: 12.5,
              background: '#16211C',
              color: '#fff',
              border: 0,
              borderRadius: 6,
            }}
          >
            Tutup Sesi
          </button>
        </div>
      </div>
      {syncMessage && (
        <p style={{ color: '#1F6F4A', fontSize: 12.5 }}>{syncMessage}</p>
      )}

      <div
        style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}
      >
        <div style={{ flex: '1 1 500px', minWidth: 300 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama produk, SKU, atau barcode…"
            style={{
              width: '100%',
              padding: 10,
              boxSizing: 'border-box',
              border: '1px solid #D6DDDA',
              borderRadius: 8,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 12,
              maxHeight: 480,
              overflowY: 'auto',
            }}
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: '1px solid #E0E5E3',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <span>
                  {p.name}{' '}
                  <span style={{ color: '#84918B', fontSize: 12 }}>
                    ({p.sku})
                  </span>
                </span>
                <strong>{formatRupiah(p.sale_price)}</strong>
              </button>
            ))}
            {filtered.length === 0 && (
              <p style={{ color: '#84918B' }}>Tidak ada produk cocok.</p>
            )}
          </div>
        </div>

        <div
          style={{
            flex: '1 1 320px',
            minWidth: 280,
            border: '1px solid #E0E5E3',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <strong>Struk</strong>
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {cart.length === 0 && (
              <p style={{ color: '#A2ADA7' }}>Belum ada barang.</p>
            )}
            {cart.map((l) => (
              <div
                key={l.product.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 6,
                }}
              >
                <div>
                  <div>{l.product.name}</div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, -1)}
                      style={{ width: 24, height: 24 }}
                    >
                      −
                    </button>
                    <span>{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(l.product.id, 1)}
                      style={{ width: 24, height: 24 }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(l.product.id)}
                      style={{
                        color: '#C8362A',
                        border: 0,
                        background: 'transparent',
                      }}
                    >
                      hapus
                    </button>
                  </div>
                </div>
                <strong>{formatRupiah(l.qty * l.product.sale_price)}</strong>
              </div>
            ))}
          </div>
          <div
            style={{
              borderTop: '1px dashed #D6DDDA',
              marginTop: 14,
              paddingTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <strong>Total</strong>
            <strong>{formatRupiah(cartTotal)}</strong>
          </div>
          <p style={{ fontSize: 11, color: '#A2ADA7' }}>
            Angka ini perkiraan dari harga tersimpan lokal. Nilai final dihitung
            ulang di server saat sinkron.
          </p>
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => setShowPay(true)}
            style={{
              width: '100%',
              padding: 14,
              background: '#1F6F4A',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            Bayar
          </button>
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
    </main>
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,18,15,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 380,
          background: '#fff',
          borderRadius: 12,
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Pembayaran</h2>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            background: '#F4F6F5',
            padding: '12px 14px',
            borderRadius: 8,
          }}
        >
          <span>Total</span>
          <strong>{formatRupiah(total)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {(['cash', 'qris', 'edc'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              style={{
                flex: 1,
                padding: 10,
                border:
                  method === m ? '2px solid #1F6F4A' : '1px solid #D6DDDA',
                borderRadius: 8,
                background: method === m ? '#EAF6EF' : '#fff',
              }}
            >
              {m === 'cash' ? 'Tunai' : m.toUpperCase()}
            </button>
          ))}
        </div>
        {method === 'cash' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 14,
            }}
          >
            <label>
              Uang diterima
              <input
                type="number"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 8,
                  marginTop: 4,
                }}
              />
            </label>
            <label>
              Kembalian
              <div
                style={{
                  padding: 8,
                  marginTop: 4,
                  background: '#F4F6F5',
                  borderRadius: 6,
                }}
              >
                {formatRupiah(Math.max(0, change))}
              </div>
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 'none',
              padding: '12px 18px',
              border: '1px solid #D6DDDA',
              background: '#fff',
              borderRadius: 8,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={method === 'cash' && change < 0}
            onClick={() =>
              onConfirm([
                { method, amount: method === 'cash' ? Number(cash) : total },
              ])
            }
            style={{
              flex: 1,
              padding: 12,
              background: '#1F6F4A',
              color: '#fff',
              border: 0,
              borderRadius: 8,
            }}
          >
            Selesaikan &amp; Cetak Struk
          </button>
        </div>
      </div>
    </div>
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,18,15,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 340,
          background: '#fff',
          borderRadius: 12,
          padding: 22,
        }}
      >
        <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 17 }}>
          Transaksi tersimpan
        </div>
        <div
          style={{
            textAlign: 'center',
            color: '#84918B',
            fontSize: 12.5,
            marginTop: 4,
          }}
        >
          {receipt.order_no}
        </div>
        <div
          id="print-receipt"
          style={{
            marginTop: 16,
            padding: 14,
            border: '1px dashed #D6DDDA',
            borderRadius: 8,
            fontSize: 12.5,
            whiteSpace: 'pre-wrap',
          }}
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
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              flex: 1,
              padding: 12,
              border: '1px solid #D6DDDA',
              background: '#fff',
              borderRadius: 8,
            }}
          >
            Cetak
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: 12,
              background: '#16211C',
              color: '#fff',
              border: 0,
              borderRadius: 8,
            }}
          >
            Struk Baru
          </button>
        </div>
      </div>
    </div>
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,18,15,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 420,
          background: '#fff',
          borderRadius: 12,
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          Tutup Sesi · {session.warehouse_code}
        </h2>
        {pendingLeft !== null && pendingLeft > 0 && (
          <div
            style={{
              background: '#FDF6E7',
              border: '1px solid #EFDCAF',
              borderRadius: 8,
              padding: 12,
              fontSize: 12.5,
              color: '#7A5A15',
            }}
          >
            Masih ada {pendingLeft} struk belum tersinkron. Sambungkan internet
            dan klik "Sinkron sekarang" dulu sebelum menutup sesi, supaya tidak
            ada struk yang tertinggal.
          </div>
        )}
        {!orders && (
          <button
            type="button"
            onClick={loadRecap}
            style={{
              marginTop: 12,
              padding: '10px 16px',
              border: '1px solid #D6DDDA',
              borderRadius: 8,
              background: '#fff',
            }}
          >
            Muat rekap sesi
          </button>
        )}
        {orders && (
          <>
            <p style={{ fontSize: 13 }}>{orders.length} struk di sesi ini.</p>
            <label>
              Kas dihitung fisik (Rp)
              <input
                type="number"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 8,
                  marginTop: 4,
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: 'none',
                  padding: '12px 18px',
                  border: '1px solid #D6DDDA',
                  background: '#fff',
                  borderRadius: 8,
                }}
              >
                Nanti
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onConfirmClose}
                style={{
                  flex: 1,
                  padding: 12,
                  background: '#16211C',
                  color: '#fff',
                  border: 0,
                  borderRadius: 8,
                }}
              >
                {saving ? 'Menutup…' : 'Tutup & Bukukan'}
              </button>
            </div>
          </>
        )}
        {!orders && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 16px',
                border: '1px solid #D6DDDA',
                borderRadius: 8,
                background: '#fff',
              }}
            >
              Batal
            </button>
          </div>
        )}
        {error && <p style={{ color: '#C8362A' }}>{error}</p>}
      </div>
    </div>
  )
}

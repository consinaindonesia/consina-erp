import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

// Penyimpanan lokal kasir (IndexedDB). Ini yang bikin kasir bisa jalan
// tanpa internet: katalog produk & struk yang belum tersinkron disimpan
// di sini, bukan di memori JS biasa yang hilang saat reload.

export type CachedProduct = {
  id: string
  sku: string
  barcode: string | null
  name: string
  sale_price: number
}

export type CartLine = {
  variant_id: string
  qty: number
  sku: string
  name: string
  unit_price: number
}
export type PendingPayment = { method: 'cash' | 'qris' | 'edc'; amount: number }

export type PendingOrder = {
  client_uuid: string
  session_id: string
  order_no: string
  lines: Array<{ variant_id: string; qty: number }>
  payments: Array<PendingPayment>
  subtotal_preview: number
  created_at: string
  synced: boolean
}

export type LocalSession = {
  key: 'current'
  session_id: string
  warehouse_id: string
  warehouse_code: string
  opening_cash: number
  opened_at: string
}

interface PosDbSchema extends DBSchema {
  products: { key: string; value: CachedProduct }
  pendingOrders: { key: string; value: PendingOrder }
  session: { key: string; value: LocalSession }
}

let dbPromise: Promise<IDBPDatabase<PosDbSchema>> | null = null

function getDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB tidak tersedia di lingkungan ini')
  }
  if (!dbPromise) {
    dbPromise = openDB<PosDbSchema>('consina-pos', 1, {
      upgrade(db) {
        db.createObjectStore('products', { keyPath: 'id' })
        db.createObjectStore('pendingOrders', { keyPath: 'client_uuid' })
        db.createObjectStore('session', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

export async function cacheProducts(products: Array<CachedProduct>) {
  const db = await getDb()
  const tx = db.transaction('products', 'readwrite')
  await tx.store.clear()
  for (const p of products) await tx.store.put(p)
  await tx.done
}

export async function getCachedProducts(): Promise<Array<CachedProduct>> {
  const db = await getDb()
  return db.getAll('products')
}

export async function saveSession(session: LocalSession) {
  const db = await getDb()
  await db.put('session', session)
}

export async function getSession(): Promise<LocalSession | undefined> {
  const db = await getDb()
  return db.get('session', 'current')
}

export async function clearSession() {
  const db = await getDb()
  await db.delete('session', 'current')
}

export async function queueOrder(order: PendingOrder) {
  const db = await getDb()
  await db.put('pendingOrders', order)
}

export async function getPendingOrders(): Promise<Array<PendingOrder>> {
  const db = await getDb()
  const all = await db.getAll('pendingOrders')
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function getUnsyncedOrders(): Promise<Array<PendingOrder>> {
  const all = await getPendingOrders()
  return all.filter((o) => !o.synced)
}

export async function markOrderSynced(clientUuid: string) {
  const db = await getDb()
  const order = await db.get('pendingOrders', clientUuid)
  if (order) {
    order.synced = true
    await db.put('pendingOrders', order)
  }
}

import { beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from '#/lib/supabase-admin'
import { closePosSessionImpl, syncPosOrderImpl } from '#/server/pos'

// M5 acceptance check (rencana-build.md): matikan koneksi, buat 5
// transaksi, nyalakan lagi — harus tepat 5 struk masuk, tidak kurang,
// tidak dobel. Coba sinkron dua kali — tetap 5, bukan 10.
//
// Di sini "offline" disimulasikan dengan menyiapkan 5 client_uuid
// terlebih dahulu (persis seperti kasir yang antre di IndexedDB saat
// tidak ada internet), lalu memanggil fn_sync_pos_order untuk kelimanya
// — dua kali berturut-turut — dan membuktikan hasilnya tetap 5, bukan 10.
// Perilaku IndexedDB browser-nya sendiri diverifikasi manual lewat UI
// (lihat docs/keputusan.md).
//
// Pakai JCH-BK (produk jadi, punya sale_price) — BUKAN bahan baku
// (sale_price=0) — supaya grand_total yang dihitung server beneran
// cocok dengan uang yang "dibayarkan", dan cek-kesehatan #5 tidak
// salah menuduh strukn ya tidak seimbang.
describe('M5: sinkron struk kasir idempoten', () => {
  const admin = getSupabaseAdmin()

  let sessionId: string
  let warehouseId: string
  let jacketVariantId: string
  let jacketLocationId: string
  let salePrice: number
  const clientUuids = Array.from({ length: 5 }, () => crypto.randomUUID())
  // order_no unik selamanya (constraint M1) — jangan dipakai ulang antar
  // proses tes, jadi diberi akhiran acak per jalannya tes ini.
  const runTag = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    const [{ data: wh }, { data: variant }] = await Promise.all([
      admin.from('warehouse').select('id').eq('code', '22WNS').single(),
      admin.from('product_variant').select('id, template:template_id(sale_price)').eq('sku', 'JCH-BK').single(),
    ])
    warehouseId = wh!.id
    jacketVariantId = variant!.id
    salePrice = variant!.template.sale_price
    const { data: loc } = await admin.from('location').select('id').eq('warehouse_id', warehouseId).eq('usage', 'internal').single()
    jacketLocationId = loc!.id

    // Perlu stok JCH-BK di 22WNS dulu supaya tutup sesi tidak bikin
    // stok fisik minus (hukum #2) — datangkan lewat penerimaan.
    const { data: supplierLoc } = await admin.from('location').select('id').eq('usage', 'supplier').single()
    const { data: move } = await admin
      .from('stock_move')
      .insert({ reference: `TEST/M5-STOK-AWAL-${runTag}`, src_location_id: supplierLoc!.id, dest_location_id: jacketLocationId })
      .select('id')
      .single()
    await admin.from('stock_move_line').insert({
      move_id: move!.id,
      variant_id: jacketVariantId,
      src_id: supplierLoc!.id,
      dest_id: jacketLocationId,
      qty_done: 5,
    })

    const { data: session, error } = await admin.from('pos_session').insert({ warehouse_id: warehouseId, opening_cash: 0 }).select('id').single()
    if (error) throw new Error(error.message)
    sessionId = session.id
  })

  async function quantityAt(locationId: string) {
    const { data } = await admin.from('stock_quant').select('quantity').eq('variant_id', jacketVariantId).eq('location_id', locationId).maybeSingle()
    return Number(data?.quantity ?? 0)
  }

  it('5 struk "offline" disinkron sekali → tepat 5 di server', async () => {
    for (const [i, clientUuid] of clientUuids.entries()) {
      await syncPosOrderImpl(admin, {
        session_id: sessionId,
        client_uuid: clientUuid,
        order_no: `TEST/M5-${runTag}-${i + 1}`,
        lines: [{ variant_id: jacketVariantId, qty: 1 }],
        payments: [{ method: 'cash', amount: salePrice }],
      })
    }

    const { data: orders } = await admin.from('pos_order').select('id, grand_total').eq('session_id', sessionId)
    expect(orders).toHaveLength(5)
    expect(orders!.every((o) => Number(o.grand_total) === salePrice)).toBe(true)
  })

  it('disinkron ULANG (dua kali) dengan client_uuid sama → tetap 5, bukan 10', async () => {
    for (const [i, clientUuid] of clientUuids.entries()) {
      await syncPosOrderImpl(admin, {
        session_id: sessionId,
        client_uuid: clientUuid,
        order_no: `TEST/M5-${runTag}-${i + 1}`,
        lines: [{ variant_id: jacketVariantId, qty: 1 }],
        payments: [{ method: 'cash', amount: salePrice }],
      })
    }

    const { data: orders } = await admin.from('pos_order').select('id').eq('session_id', sessionId)
    expect(orders).toHaveLength(5)

    const orderIds = orders!.map((o) => o.id)
    const { data: payments } = await admin.from('pos_payment').select('id').in('order_id', orderIds)
    expect(payments).toHaveLength(5)
  })

  it('tutup sesi: struk terbukukan ke stok, saldo tetap seimbang', async () => {
    const before = await quantityAt(jacketLocationId)

    await closePosSessionImpl(admin, sessionId, 5 * salePrice)

    const { data: posted } = await admin.from('pos_order').select('state').eq('session_id', sessionId)
    expect(posted!.every((o) => o.state === 'posted')).toBe(true)

    const after = await quantityAt(jacketLocationId)
    expect(after).toBe(before - 5) // 5 struk x 1 unit

    const { data: allQuant } = await admin.from('stock_quant').select('quantity')
    const total = allQuant!.reduce((sum, r) => sum + Number(r.quantity), 0)
    expect(Math.abs(total)).toBeLessThan(0.0001)

    const { data: sessionRow } = await admin.from('pos_session').select('cash_difference').eq('id', sessionId).single()
    expect(Number(sessionRow!.cash_difference)).toBe(0)

    // pulihkan: kembalikan 5 unit ke supplier (bukan cuma ke toko) supaya
    // stok akhir sama persis dengan sebelum tes ini menambah stok awal.
    const { data: supplierLoc } = await admin.from('location').select('id').eq('usage', 'supplier').single()
    const { data: customerLoc } = await admin.from('location').select('id').eq('usage', 'customer').single()

    const { data: moveBack } = await admin
      .from('stock_move')
      .insert({ reference: `TEST/M5-PULIHKAN-${runTag}`, src_location_id: customerLoc!.id, dest_location_id: supplierLoc!.id })
      .select('id')
      .single()
    await admin.from('stock_move_line').insert({
      move_id: moveBack!.id,
      variant_id: jacketVariantId,
      src_id: customerLoc!.id,
      dest_id: supplierLoc!.id,
      qty_done: 5,
    })

    expect(await quantityAt(jacketLocationId)).toBe(before - 5)
  })
})

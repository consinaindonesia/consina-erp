import { beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from '#/lib/supabase-admin'
import { receiveGoodsImpl, submitOpnameImpl, transferReceiveImpl, transferSendImpl } from '#/server/stock'

// M4 acceptance check (rencana-build.md): kirim barang ke toko, sebelum
// diterima harus muncul di "barang dalam perjalanan" (bukan hilang), dan
// saldo harus tetap seimbang (total di semua lokasi = 0) setelah SETIAP
// operasi. Data uji dipulihkan lagi di akhir tiap test lewat operasi BALIK
// (bukan delete) — stock_move_line permanen, sesuai hukum di CLAUDE.md.
describe('M4: penerimaan, transfer, opname', () => {
  const admin = getSupabaseAdmin()

  let webbVariantId: string
  let gudangPusatWarehouseId: string
  let gudangPusatLocationId: string
  let wonosoboWarehouseId: string
  let wonosoboLocationId: string

  beforeAll(async () => {
    const [{ data: v }, { data: gbjWarehouse }, { data: gbjLoc }, { data: wns }] = await Promise.all([
      admin.from('product_variant').select('id').eq('sku', 'RM-WEBB').single(),
      admin.from('warehouse').select('id').eq('code', '00GBJ').single(),
      admin.from('location').select('id').eq('code', '00GBJ/Stock').single(),
      admin.from('warehouse').select('id').eq('code', '22WNS').single(),
    ])
    webbVariantId = v!.id
    gudangPusatWarehouseId = gbjWarehouse!.id
    gudangPusatLocationId = gbjLoc!.id
    wonosoboWarehouseId = wns!.id
    const { data: wnsLoc } = await admin
      .from('location')
      .select('id')
      .eq('warehouse_id', wonosoboWarehouseId)
      .eq('usage', 'internal')
      .single()
    wonosoboLocationId = wnsLoc!.id
  })

  async function totalBalanceIsZero() {
    const { data, error } = await admin.from('stock_quant').select('quantity')
    if (error) throw new Error(error.message)
    const total = data.reduce((sum, r) => sum + Number(r.quantity), 0)
    return Math.abs(total) < 0.0001
  }

  async function quantityAt(variantId: string, locationId: string) {
    const { data } = await admin.from('stock_quant').select('quantity').eq('variant_id', variantId).eq('location_id', locationId).maybeSingle()
    return Number(data?.quantity ?? 0)
  }

  it('fn_receive_goods: stok bertambah dan saldo tetap seimbang', async () => {
    const before = await quantityAt(webbVariantId, gudangPusatLocationId)

    await receiveGoodsImpl(admin, gudangPusatWarehouseId, [{ variant_id: webbVariantId, qty: 3 }])

    const after = await quantityAt(webbVariantId, gudangPusatLocationId)
    expect(after).toBe(before + 3)
    expect(await totalBalanceIsZero()).toBe(true)

    // pulihkan: kirim 3 unit kembali ke supplier lewat penerimaan terbalik
    // tidak ada RPC "retur ke supplier" — insert langsung, konsisten dengan
    // pola koreksi di CLAUDE.md (INSERT arah sebaliknya).
    const { data: supplierLoc } = await admin.from('location').select('id').eq('usage', 'supplier').single()
    const { data: move } = await admin
      .from('stock_move')
      .insert({ reference: 'TEST/M4-RETUR-SUPPLIER', src_location_id: gudangPusatLocationId, dest_location_id: supplierLoc!.id })
      .select('id')
      .single()
    await admin.from('stock_move_line').insert({
      move_id: move!.id,
      variant_id: webbVariantId,
      src_id: gudangPusatLocationId,
      dest_id: supplierLoc!.id,
      qty_done: 3,
    })

    expect(await quantityAt(webbVariantId, gudangPusatLocationId)).toBe(before)
    expect(await totalBalanceIsZero()).toBe(true)
  })

  it('fn_transfer_send: barang muncul di "dalam perjalanan" sebelum diterima, saldo tetap seimbang', async () => {
    const transitLoc = (await admin.from('location').select('id').eq('usage', 'transit').single()).data!
    const before = await quantityAt(webbVariantId, gudangPusatLocationId)

    const { pickingId } = await transferSendImpl(admin, gudangPusatWarehouseId, wonosoboWarehouseId, [
      { variant_id: webbVariantId, qty: 5 },
    ])

    // "kirim 5 unit ke toko. Sebelum toko menerima, angkanya harus muncul
    // di barang dalam perjalanan, bukan hilang."
    expect(await quantityAt(webbVariantId, transitLoc.id)).toBe(5)
    expect(await quantityAt(webbVariantId, wonosoboLocationId)).toBe(0)
    const { data: picking } = await admin.from('stock_picking').select('state').eq('id', pickingId).single()
    expect(picking!.state).toBe('waiting')
    expect(await totalBalanceIsZero()).toBe(true)

    await transferReceiveImpl(admin, pickingId)

    expect(await quantityAt(webbVariantId, transitLoc.id)).toBe(0)
    expect(await quantityAt(webbVariantId, wonosoboLocationId)).toBe(5)
    const { data: pickingAfter } = await admin.from('stock_picking').select('state').eq('id', pickingId).single()
    expect(pickingAfter!.state).toBe('done')
    expect(await totalBalanceIsZero()).toBe(true)

    // pulihkan: kirim balik 5 unit dari Wonosobo ke Gudang Pusat
    const backPicking = await transferSendImpl(admin, wonosoboWarehouseId, gudangPusatWarehouseId, [
      { variant_id: webbVariantId, qty: 5 },
    ])
    await transferReceiveImpl(admin, backPicking.pickingId)

    expect(await quantityAt(webbVariantId, gudangPusatLocationId)).toBe(before)
    expect(await totalBalanceIsZero()).toBe(true)
  })

  it('fn_stock_opname: selisih tercatat ke inventory_loss, saldo tetap seimbang', async () => {
    const before = await quantityAt(webbVariantId, gudangPusatLocationId)
    const counted = before - 2

    await submitOpnameImpl(admin, gudangPusatLocationId, [{ variant_id: webbVariantId, counted_qty: counted }])

    expect(await quantityAt(webbVariantId, gudangPusatLocationId)).toBe(counted)
    expect(await totalBalanceIsZero()).toBe(true)

    // pulihkan: opname lagi dengan angka semula -> tercatat sebagai surplus
    await submitOpnameImpl(admin, gudangPusatLocationId, [{ variant_id: webbVariantId, counted_qty: before }])

    expect(await quantityAt(webbVariantId, gudangPusatLocationId)).toBe(before)
    expect(await totalBalanceIsZero()).toBe(true)
  })
})

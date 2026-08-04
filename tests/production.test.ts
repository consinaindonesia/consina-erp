import { beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from '#/lib/supabase-admin'
import { receiveGoodsImpl } from '#/server/stock'
import {
  completeManufacturingOrderImpl,
  completeWorkOrderImpl,
  createManufacturingOrderImpl,
  getManufacturingOrderImpl,
} from '#/server/production'

// M6 acceptance check (rencana-build.md): buat MO 10 unit. Cek stok kain
// berkurang sesuai resep (termasuk toleransi sisa), stok carrier (barang
// jadi) bertambah 10. Juga wajib ada test perbandingan nilai (cost_price)
// sebelum-sesudah produksi, karena biaya produksi harus terserap ke nilai
// barang jadi (bukan cuma stok yang berubah).
//
// Resep BOM Jaket Consina Champers Hill (dari M1/M2): 1.2 kain, 1.0
// resleting, 0.8 webbing per unit -> untuk 10 unit: 12 kain, 10 resleting,
// 8 webbing.
describe('M6: produksi (BOM, work order, penyerapan biaya)', () => {
  const admin = getSupabaseAdmin()

  const bomId = '43a82b98-b2ac-4a7e-b08d-6d91364942a1'
  const templateId = '32be92c5-9746-49f1-ac37-142ce73b6778'
  const jacketVariantId = '14400d6f-9e35-4017-bcf4-7e493f02d4e5' // JCH-BK
  const kainId = 'f8473844-caa9-4120-87d5-dde4cd8fd4ba'
  const reslId = '2a866079-d314-4f8f-8749-14ce3289d850'
  const webbId = 'e4241456-908f-408f-9301-0a9fd7bdf4ab'
  const qtyPlanned = 10
  const expectedConsumption = { kain: 12, resl: 10, webb: 8 }
  const buffer = 100

  let warehouseId: string
  let internalLocationId: string
  let supplierLocationId: string
  let originalCostPrice: number
  // Stok bahan SEBELUM buffer ditambahkan — dipakai untuk memulihkan gudang
  // persis ke kondisi semula di akhir tes (bukan cuma "sebelum produksi").
  let kainPristine: number
  let reslPristine: number
  let webbPristine: number

  async function quantityAt(variantId: string, locationId: string) {
    const { data } = await admin.from('stock_quant').select('quantity').eq('variant_id', variantId).eq('location_id', locationId).maybeSingle()
    return Number(data?.quantity ?? 0)
  }

  beforeAll(async () => {
    const [{ data: wh }, { data: tmpl }] = await Promise.all([
      admin.from('warehouse').select('id').eq('code', '00GBJ').single(),
      admin.from('product_template').select('cost_price').eq('id', templateId).single(),
    ])
    warehouseId = wh!.id
    originalCostPrice = Number(tmpl!.cost_price)
    const { data: loc } = await admin.from('location').select('id').eq('warehouse_id', warehouseId).eq('usage', 'internal').single()
    internalLocationId = loc!.id
    const { data: supplierLoc } = await admin.from('location').select('id').eq('usage', 'supplier').single()
    supplierLocationId = supplierLoc!.id

    kainPristine = await quantityAt(kainId, internalLocationId)
    reslPristine = await quantityAt(reslId, internalLocationId)
    webbPristine = await quantityAt(webbId, internalLocationId)

    // Beri buffer bahan baku supaya pasti cukup untuk 10 unit, apa pun sisa
    // stok saat ini (tidak menebak-nebak angka yang mungkin sudah terpakai
    // milestone lain).
    await receiveGoodsImpl(admin, warehouseId, [
      { variant_id: kainId, qty: buffer },
      { variant_id: reslId, qty: buffer },
      { variant_id: webbId, qty: buffer },
    ])
  })

  async function totalBalanceIsZero() {
    const { data, error } = await admin.from('stock_quant').select('quantity')
    if (error) throw new Error(error.message)
    const total = data.reduce((sum, r) => sum + Number(r.quantity), 0)
    return Math.abs(total) < 0.0001
  }

  // fn_complete_manufacturing_order menghitung stok-di-tangan untuk rata-rata
  // tertimbang dari SEMUA lokasi internal (semua gudang/toko), bukan cuma
  // gudang tempat produksi berlangsung — produk yang sama bisa ada stoknya
  // di toko lain juga.
  async function totalQuantityAtInternalLocations(variantId: string) {
    const { data, error } = await admin
      .from('stock_quant')
      .select('quantity, location:location_id!inner(usage)')
      .eq('variant_id', variantId)
      .eq('location.usage', 'internal')
    if (error) throw new Error(error.message)
    return data.reduce((sum, r) => sum + Number(r.quantity), 0)
  }

  it('buat MO 10 unit, selesaikan semua operasi, produksi selesai: bahan berkurang, barang jadi bertambah, biaya terserap', async () => {
    const kainBefore = await quantityAt(kainId, internalLocationId)
    const reslBefore = await quantityAt(reslId, internalLocationId)
    const webbBefore = await quantityAt(webbId, internalLocationId)
    const jacketBefore = await quantityAt(jacketVariantId, internalLocationId)
    const jacketTotalBefore = await totalQuantityAtInternalLocations(jacketVariantId)

    const { moId } = await createManufacturingOrderImpl(admin, bomId, jacketVariantId, warehouseId, qtyPlanned)

    // Sebelum semua operasi selesai, MO tidak boleh bisa diselesaikan
    // (bahan belum boleh berkurang).
    await expect(completeManufacturingOrderImpl(admin, moId, qtyPlanned)).rejects.toThrow(/operasi belum ditandai selesai/)
    expect(await quantityAt(kainId, internalLocationId)).toBe(kainBefore)

    const { workOrders } = await getManufacturingOrderImpl(admin, moId)
    expect(workOrders).toHaveLength(4) // CUT, SEW, QC, PACK
    expect(workOrders.map((w) => w.work_center.code)).toEqual(['CUT', 'SEW', 'QC', 'PACK'])
    for (const w of workOrders) {
      await completeWorkOrderImpl(admin, w.id)
    }

    await completeManufacturingOrderImpl(admin, moId, qtyPlanned)

    // Stok bahan berkurang persis sesuai resep x qty.
    expect(await quantityAt(kainId, internalLocationId)).toBe(kainBefore - expectedConsumption.kain)
    expect(await quantityAt(reslId, internalLocationId)).toBe(reslBefore - expectedConsumption.resl)
    expect(await quantityAt(webbId, internalLocationId)).toBe(webbBefore - expectedConsumption.webb)

    // Stok barang jadi bertambah 10.
    expect(await quantityAt(jacketVariantId, internalLocationId)).toBe(jacketBefore + qtyPlanned)

    // Saldo sistem tetap seimbang (hukum #1: total di semua lokasi = 0).
    expect(await totalBalanceIsZero()).toBe(true)

    // Perbandingan nilai sebelum-sesudah: biaya produksi harus terserap ke
    // cost_price barang jadi lewat rata-rata tertimbang.
    const totalMaterialCost = expectedConsumption.kain * 45000 + expectedConsumption.resl * 12000 + expectedConsumption.webb * 6000
    const unitCost = totalMaterialCost / qtyPlanned
    const expectedNewCost =
      jacketTotalBefore <= 0
        ? unitCost
        : (jacketTotalBefore * originalCostPrice + qtyPlanned * unitCost) / (jacketTotalBefore + qtyPlanned)

    const { data: tmplAfter } = await admin.from('product_template').select('cost_price').eq('id', templateId).single()
    expect(Number(tmplAfter!.cost_price)).toBeCloseTo(expectedNewCost, 2)
    expect(Number(tmplAfter!.cost_price)).not.toBe(originalCostPrice)

    // stock_valuation_layer mencatat lapisan biaya produksi ini.
    const { mo } = await getManufacturingOrderImpl(admin, moId)
    expect(mo.state).toBe('done')
    expect(Number(mo.qty_produced)).toBe(qtyPlanned)

    const { data: svl } = await admin
      .from('stock_valuation_layer')
      .select('quantity, unit_cost, value')
      .eq('variant_id', jacketVariantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(Number(svl!.quantity)).toBe(qtyPlanned)
    expect(Number(svl!.unit_cost)).toBeCloseTo(unitCost, 2)
    expect(Number(svl!.value)).toBeCloseTo(totalMaterialCost, 2)

    // MO yang sudah selesai tidak boleh diselesaikan dua kali.
    await expect(completeManufacturingOrderImpl(admin, moId, qtyPlanned)).rejects.toThrow(/sudah selesai/)

    // ---------- pulihkan: kembalikan stok & cost_price seperti semula ----------
    // Barang jadi hasil produksi tes ini dikembalikan ke supplier (bukan
    // dihapus — stock_move_line permanen, sesuai hukum di CLAUDE.md).
    const { data: moveOut } = await admin
      .from('stock_move')
      .insert({ reference: `TEST/M6-PULIHKAN-HASIL`, src_location_id: internalLocationId, dest_location_id: supplierLocationId })
      .select('id')
      .single()
    await admin.from('stock_move_line').insert({
      move_id: moveOut!.id,
      variant_id: jacketVariantId,
      src_id: internalLocationId,
      dest_id: supplierLocationId,
      qty_done: qtyPlanned,
    })

    // Sisa buffer bahan (buffer - terpakai) dikembalikan ke supplier supaya
    // stok bahan baku balik ke level sebelum tes.
    const { data: moveBack } = await admin
      .from('stock_move')
      .insert({ reference: `TEST/M6-PULIHKAN-BAHAN`, src_location_id: internalLocationId, dest_location_id: supplierLocationId })
      .select('id')
      .single()
    await admin.from('stock_move_line').insert([
      { move_id: moveBack!.id, variant_id: kainId, src_id: internalLocationId, dest_id: supplierLocationId, qty_done: buffer - expectedConsumption.kain },
      { move_id: moveBack!.id, variant_id: reslId, src_id: internalLocationId, dest_id: supplierLocationId, qty_done: buffer - expectedConsumption.resl },
      { move_id: moveBack!.id, variant_id: webbId, src_id: internalLocationId, dest_id: supplierLocationId, qty_done: buffer - expectedConsumption.webb },
    ])

    // cost_price bukan bagian dari ledger stok (tidak dilindungi trigger
    // seperti stock_quant) — field biasa di product_template, sama seperti
    // yang diedit lewat halaman produk M3. Aman dikembalikan langsung.
    await admin.from('product_template').update({ cost_price: originalCostPrice }).eq('id', templateId)

    expect(await quantityAt(kainId, internalLocationId)).toBe(kainPristine)
    expect(await quantityAt(reslId, internalLocationId)).toBe(reslPristine)
    expect(await quantityAt(webbId, internalLocationId)).toBe(webbPristine)
    expect(await quantityAt(jacketVariantId, internalLocationId)).toBe(jacketBefore)
    expect(await totalBalanceIsZero()).toBe(true)
  })
})

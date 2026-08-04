import { beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseAdmin } from '#/lib/supabase-admin'

// M7 acceptance check (rencana-build.md): "kartu stok satu produk harus
// bisa dirunut dari pembelian sampai penjualan tanpa lompatan angka."
//
// Diuji dengan urutan pergerakan yang dikontrol penuh: beli (masuk),
// kirim ke transit (keluar dari lokasi internal), diterima toko (masuk
// lagi), lalu "terjual" ke pelanggan (keluar). Urutan ini sengaja net
// nol di akhir — tidak perlu langkah pemulihan terpisah — sekaligus
// membuktikan tiga jenis perubahan saldo: naik, transit (bukan
// internal, jadi ikut mengurangi), dan turun lagi.
describe('M7: laporan', () => {
  const admin = getSupabaseAdmin()

  const reslVariantId = '2a866079-d314-4f8f-8749-14ce3289d850' // RM-RESL
  let supplierLocId: string
  let gbjLocId: string
  let transitLocId: string
  let wnsLocId: string
  let customerLocId: string

  beforeAll(async () => {
    const [{ data: supplier }, { data: gbj }, { data: transit }, { data: wnsWarehouse }, { data: customer }] = await Promise.all([
      admin.from('location').select('id').eq('usage', 'supplier').single(),
      admin.from('location').select('id').eq('code', '00GBJ/Stock').single(),
      admin.from('location').select('id').eq('usage', 'transit').single(),
      admin.from('warehouse').select('id').eq('code', '22WNS').single(),
      admin.from('location').select('id').eq('usage', 'customer').single(),
    ])
    supplierLocId = supplier!.id
    gbjLocId = gbj!.id
    transitLocId = transit!.id
    customerLocId = customer!.id
    const { data: wnsLoc } = await admin.from('location').select('id').eq('warehouse_id', wnsWarehouse!.id).eq('usage', 'internal').single()
    wnsLocId = wnsLoc!.id
  })

  async function move(reference: string, srcId: string, destId: string, qty: number) {
    const { data: m } = await admin.from('stock_move').insert({ reference, src_location_id: srcId, dest_location_id: destId }).select('id').single()
    await admin.from('stock_move_line').insert({ move_id: m!.id, variant_id: reslVariantId, src_id: srcId, dest_id: destId, qty_done: qty })
  }

  it('kartu stok: naik saat beli, tetap saat transfer internal->internal, turun saat "terjual" — tanpa lompatan', async () => {
    const { data: before, error: beforeErr } = await admin.rpc('fn_stock_card', { p_variant_id: reslVariantId })
    if (beforeErr) throw new Error(beforeErr.message)
    const countBefore = before.length
    const balanceBefore = before.length > 0 ? Number(before[before.length - 1]!.running_balance) : 0

    await move('TEST/M7-BELI', supplierLocId, gbjLocId, 20)
    await move('TEST/M7-KIRIM', gbjLocId, transitLocId, 20)
    await move('TEST/M7-TERIMA', transitLocId, wnsLocId, 20)
    await move('TEST/M7-JUAL', wnsLocId, customerLocId, 20)

    const { data: after, error: afterErr } = await admin.rpc('fn_stock_card', { p_variant_id: reslVariantId })
    if (afterErr) throw new Error(afterErr.message)

    expect(after).toHaveLength(countBefore + 4)

    // Tanpa lompatan: SETIAP baris (bukan cuma yang baru) saldo-nya harus
    // persis saldo sebelumnya + net_change baris itu.
    for (let i = 1; i < after.length; i++) {
      const prev = Number(after[i - 1]!.running_balance)
      const cur = after[i]!
      expect(Number(cur.running_balance)).toBeCloseTo(prev + Number(cur.net_change), 4)
    }

    const newRows = after.slice(countBefore)
    expect(Number(newRows[0]!.net_change)).toBe(20) // beli: masuk lokasi internal
    expect(Number(newRows[1]!.net_change)).toBe(-20) // kirim ke transit: keluar dari internal
    expect(Number(newRows[2]!.net_change)).toBe(20) // diterima toko: masuk lokasi internal
    expect(Number(newRows[3]!.net_change)).toBe(-20) // "terjual" ke pelanggan: keluar dari internal

    expect(Number(newRows[0]!.running_balance)).toBeCloseTo(balanceBefore + 20, 4)
    expect(Number(newRows[1]!.running_balance)).toBeCloseTo(balanceBefore, 4)
    expect(Number(newRows[2]!.running_balance)).toBeCloseTo(balanceBefore + 20, 4)
    expect(Number(newRows[3]!.running_balance)).toBeCloseTo(balanceBefore, 4) // balik ke saldo semula, net nol

    // Saldo akhir kartu stok harus cocok dengan stock_quant sungguhan
    // (bukti "saldo tersimpan cocok dengan riwayat" berlaku juga di sini).
    const { data: quants } = await admin
      .from('stock_quant')
      .select('quantity, location:location_id!inner(usage)')
      .eq('variant_id', reslVariantId)
      .eq('location.usage', 'internal')
    const actualTotal = quants!.reduce((sum, r) => sum + Number(r.quantity), 0)
    expect(Number(newRows[3]!.running_balance)).toBeCloseTo(actualTotal, 4)
  })

  it('nilai persediaan: total per baris cocok qty x harga pokok, dan jumlah semua baris = total keseluruhan', async () => {
    const { data: rows, error } = await admin.rpc('fn_inventory_value')
    if (error) throw new Error(error.message)
    const { data: total, error: totalErr } = await admin.rpc('fn_inventory_value_total')
    if (totalErr) throw new Error(totalErr.message)

    for (const r of rows) {
      expect(Number(r.total_value)).toBeCloseTo(Number(r.qty_on_hand) * Number(r.cost_price), 2)
    }
    const summed = rows.reduce((sum, r) => sum + Number(r.total_value), 0)
    expect(Number(total)).toBeCloseTo(summed, 2)
  })

  it('penjualan per toko: pendapatan yang dilaporkan cocok dengan jumlah grand_total struk posted sungguhan', async () => {
    const { data: rows, error } = await admin.rpc('fn_sales_by_store', { p_from: undefined, p_to: undefined })
    if (error) throw new Error(error.message)

    for (const r of rows) {
      const { data: orders } = await admin.from('pos_order').select('grand_total, session:session_id(warehouse_id)').eq('state', 'posted')
      const expectedRevenue = orders!.filter((o) => o.session.warehouse_id === r.warehouse_id).reduce((sum, o) => sum + Number(o.grand_total), 0)
      expect(Number(r.revenue)).toBeCloseTo(expectedRevenue, 2)
    }
  })

  it('usulan pesan ulang: produk di bawah titik minimum selalu punya usulan yang masuk akal', async () => {
    const { data: rows, error } = await admin.rpc('fn_reorder_suggestions')
    if (error) throw new Error(error.message)

    for (const r of rows) {
      expect(Number(r.qty_on_hand)).toBeLessThan(Number(r.reorder_point))
      expect(['Beli dari supplier', 'Produksi', 'Transfer dari Gudang Pusat']).toContain(r.suggestion)
    }
  })
})

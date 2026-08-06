import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Badge, Card, CardBody, PageBody, PageShell } from '#/components/ui'
import { supabase } from '#/lib/supabase'
import { color, font } from '#/lib/theme'

const checkSupabase = createServerFn({ method: 'GET' }).handler(async () => {
  if (!supabase) return { ok: false, message: 'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY belum diatur' }
  const { error } = await supabase.storage.listBuckets()
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Terhubung' }
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => checkSupabase(),
})

function Home() {
  const supabaseStatus = Route.useLoaderData()

  return (
    <PageShell>
      <PageBody maxWidth={640}>
        <h1 style={{ font: `600 24px/1.2 ${font.sans}`, margin: 0 }}>Consina ERP</h1>
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ font: `500 13.5px/1 ${font.sans}` }}>Status Supabase</span>
            <Badge tone={supabaseStatus.ok ? 'success' : 'danger'}>{supabaseStatus.ok ? 'Terhubung' : supabaseStatus.message}</Badge>
          </CardBody>
        </Card>
        <p style={{ font: `400 13.5px/1.6 ${font.sans}`, color: color.textSubtle }}>
          Gunakan menu di atas untuk kelola produk, kategori, satuan, atribut, lokasi, persediaan, kasir, produksi, dan laporan.
        </p>
      </PageBody>
    </PageShell>
  )
}

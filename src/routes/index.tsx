import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { supabase } from '#/lib/supabase'

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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Consina ERP</h1>
      <p>
        Status Supabase:{' '}
        <strong style={{ color: supabaseStatus.ok ? '#1F6F4A' : '#C8362A' }}>
          {supabaseStatus.ok ? '✓ Terhubung' : `✗ ${supabaseStatus.message}`}
        </strong>
      </p>
      <p>Gunakan menu di atas untuk kelola produk, kategori, satuan, atribut, dan lokasi.</p>
    </main>
  )
}

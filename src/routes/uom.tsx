import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createUom, listUoms } from '#/server/catalog'
import { Button, Card, ErrorText, Input, PageBody, PageHeader, PageShell, table } from '#/components/ui'

export const Route = createFileRoute('/uom')({
  component: Uoms,
  loader: () => listUoms(),
})

function Uoms() {
  const uoms = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createUom({ data: { name } })
      setName('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Satuan (UOM)" />
      <PageBody maxWidth={560}>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <tbody>
                {uoms.map((u) => (
                  <tr key={u.id}>
                    <td style={table.td}>{u.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama satuan baru (mis. ROLL)" required style={{ flex: 1 }} />
          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Tambah'}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </PageBody>
    </PageShell>
  )
}

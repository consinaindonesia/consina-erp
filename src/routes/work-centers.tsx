import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createWorkCenter, listWorkCenters } from '#/server/production'
import { Button, Card, ErrorText, Input, PageBody, PageHeader, PageShell, table } from '#/components/ui'
import { color } from '#/lib/theme'

export const Route = createFileRoute('/work-centers')({
  component: WorkCenters,
  loader: () => listWorkCenters(),
})

function WorkCenters() {
  const workCenters = Route.useLoaderData()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createWorkCenter({ data: { code: code.toUpperCase(), name } })
      setCode('')
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
      <PageHeader title="Work Center" />
      <PageBody maxWidth={560}>
        <Card>
          <div style={table.wrap}>
            <table style={table.table}>
              <tbody>
                {workCenters.map((wc) => (
                  <tr key={wc.id}>
                    <td style={{ ...table.td, ...table.tdMono, fontWeight: 600 }}>{wc.code}</td>
                    <td style={{ ...table.td, color: color.textSubtle }}>{wc.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. CUT)" required style={{ width: 120 }} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" required style={{ flex: 1 }} />
          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? 'Menyimpan…' : 'Tambah'}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </PageBody>
    </PageShell>
  )
}

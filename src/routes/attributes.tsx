import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createAttribute, createAttributeValue, listAttributes } from '#/server/catalog'
import { Badge, Button, Card, CardBody, ErrorText, Input, PageBody, PageHeader, PageShell, Title } from '#/components/ui'

export const Route = createFileRoute('/attributes')({
  component: Attributes,
  loader: () => listAttributes(),
})

function Attributes() {
  const attributes = Route.useLoaderData()
  const router = useRouter()
  const [newAttrName, setNewAttrName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onAddAttribute(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createAttribute({ data: { name: newAttrName.toUpperCase() } })
      setNewAttrName('')
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader title="Atribut Varian" />
      <PageBody maxWidth={720}>
        {attributes.map((attr) => (
          <AttributeCard key={attr.id} attribute={attr} onChanged={() => router.invalidate()} />
        ))}

        <Card>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Title>Tambah atribut baru</Title>
            <form onSubmit={onAddAttribute} style={{ display: 'flex', gap: 8 }}>
              <Input value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)} placeholder="mis. UKURAN" required style={{ flex: 1 }} />
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Tambah'}
              </Button>
            </form>
            {error && <ErrorText>{error}</ErrorText>}
          </CardBody>
        </Card>
      </PageBody>
    </PageShell>
  )
}

function AttributeCard({
  attribute,
  onChanged,
}: {
  attribute: { id: string; name: string; product_attribute_value: Array<{ id: string; name: string; code: string }> }
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createAttributeValue({ data: { attribute_id: attribute.id, name, code: code.toUpperCase() } })
      setName('')
      setCode('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Title>{attribute.name}</Title>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {attribute.product_attribute_value.map((v) => (
            <Badge key={v.id}>
              {v.name} ({v.code})
            </Badge>
          ))}
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama (mis. Merah)" required style={{ flex: 1 }} />
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kode (mis. RD)" required style={{ width: 90 }} />
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? '…' : 'Tambah nilai'}
          </Button>
        </form>
        {error && <ErrorText>{error}</ErrorText>}
      </CardBody>
    </Card>
  )
}

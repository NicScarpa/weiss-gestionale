'use client'

import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'

interface Supplier {
  id: string
  name: string
  vatNumber?: string | null
}

interface BulkDeleteSuppliersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: Supplier[]
  onDeleted: (count: number) => void
}

export function BulkDeleteSuppliersDialog({
  open,
  onOpenChange,
  suppliers,
  onDeleted,
}: BulkDeleteSuppliersDialogProps) {
  if (suppliers.length === 0) return null

  const count = suppliers.length
  const supplierLabel = count === 1 ? 'fornitore' : 'fornitori'

  return (
    <DangerousDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Elimina ${count} ${supplierLabel}`}
      description={`Questa azione disattiverà ${count === 1 ? 'il fornitore selezionato' : `i ${count} fornitori selezionati`}. I dati storici verranno mantenuti.`}
      items={suppliers.map((s) => ({
        id: s.id,
        label: s.name,
        detail: s.vatNumber ? `P.IVA: ${s.vatNumber}` : undefined,
      }))}
      infoNote="I fornitori verranno solo disattivati. Tutti i movimenti esistenti (fatture, registrazioni bancarie, prima nota) rimarranno collegati per storico."
      confirmLabel={`Elimina ${count} ${supplierLabel}`}
      onConfirm={async () => {
        const res = await fetch('/api/suppliers', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: suppliers.map((s) => s.id) }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Errore durante l\'eliminazione')
        }
        const result = await res.json()
        onDeleted(result.count || suppliers.length)
      }}
    />
  )
}

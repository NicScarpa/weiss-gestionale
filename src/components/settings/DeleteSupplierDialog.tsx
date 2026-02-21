'use client'

import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'

interface Supplier {
  id: string
  name: string
  vatNumber?: string | null
  fiscalCode?: string | null
}

interface DeleteSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: Supplier | null
  onDeleted: () => void
}

export function DeleteSupplierDialog({
  open,
  onOpenChange,
  supplier,
  onDeleted,
}: DeleteSupplierDialogProps) {
  if (!supplier) return null

  const detail = [
    supplier.vatNumber && `P.IVA: ${supplier.vatNumber}`,
    supplier.fiscalCode && `C.F.: ${supplier.fiscalCode}`,
  ].filter(Boolean).join(' - ')

  return (
    <DangerousDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Elimina Fornitore"
      description="Stai per eliminare questo fornitore. Questa azione è irreversibile."
      entityName={`${supplier.name}${detail ? ` (${detail})` : ''}`}
      infoNote="Il fornitore verrà disattivato. Tutti i movimenti esistenti (fatture, registrazioni banca, prima nota) rimarranno collegati per storico."
      confirmLabel="Elimina Fornitore"
      onConfirm={async () => {
        const res = await fetch(`/api/suppliers?id=${supplier.id}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Errore durante l\'eliminazione')
        }
        onDeleted()
      }}
    />
  )
}

'use client'

import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'

interface BulkDeleteClosuresDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  hasValidated: boolean
  onDeleted: () => void
}

export function BulkDeleteClosuresDialog({
  open,
  onOpenChange,
  selectedIds,
  hasValidated,
  onDeleted,
}: BulkDeleteClosuresDialogProps) {
  const count = selectedIds.length

  return (
    <DangerousDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Elimina ${count} Chiusure`}
      description={
        <>
          Sei sicuro di voler eliminare <strong>{count}</strong> chiusure selezionate?
          Questa azione è <strong>irreversibile</strong>.
        </>
      }
      infoNote={
        hasValidated
          ? 'Attenzione: alcune chiusure sono già state validate. L\'eliminazione rimuoverà anche le scritture contabili generate.'
          : undefined
      }
      confirmLabel={`Elimina ${count} Chiusure`}
      onConfirm={async () => {
        const res = await fetch('/api/chiusure/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds }),
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

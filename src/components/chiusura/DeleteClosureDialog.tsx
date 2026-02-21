'use client'

import { useState } from 'react'
import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface DeleteClosureDialogProps {
  closureId: string
  closureDate: Date | string
  closureStatus: string
  onDeleted: () => void
  trigger: React.ReactNode
}

export function DeleteClosureDialog({
  closureId,
  closureDate,
  closureStatus,
  onDeleted,
  trigger,
}: DeleteClosureDialogProps) {
  const [open, setOpen] = useState(false)

  const formattedDate = format(
    typeof closureDate === 'string' ? new Date(closureDate) : closureDate,
    'dd MMMM yyyy',
    { locale: it }
  )

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DangerousDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Elimina Chiusura"
        description={
          <>
            Sei sicuro di voler eliminare la chiusura del <strong>{formattedDate}</strong>?
            {closureStatus === 'VALIDATED' && (
              <span className="block mt-1 font-medium">
                Attenzione: questa chiusura è già stata validata.
                L&apos;eliminazione rimuoverà anche le scritture contabili generate.
              </span>
            )}
          </>
        }
        entityName={`Chiusura del ${formattedDate}`}
        confirmLabel="Elimina Definitivamente"
        onConfirm={async () => {
          const res = await fetch(`/api/chiusure/${closureId}`, {
            method: 'DELETE',
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Errore durante l\'eliminazione')
          }
          onDeleted()
        }}
      />
    </>
  )
}

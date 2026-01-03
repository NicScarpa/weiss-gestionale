'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { DeleteClosureDialog } from '@/components/chiusura/DeleteClosureDialog'

interface AdminClosureActionsProps {
  closureId: string
  closureDate: Date
  closureStatus: string
}

export function AdminClosureActions({
  closureId,
  closureDate,
  closureStatus,
}: AdminClosureActionsProps) {
  const router = useRouter()

  const handleDeleted = () => {
    router.push('/chiusura-cassa')
    router.refresh()
  }

  return (
    <DeleteClosureDialog
      closureId={closureId}
      closureDate={closureDate}
      closureStatus={closureStatus}
      onDeleted={handleDeleted}
      trigger={
        <Button variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Elimina
        </Button>
      }
    />
  )
}

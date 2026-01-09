'use client'

import { Save, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClosureActionsProps {
  onSave: () => void
  onSubmit: () => void
  isSaving: boolean
  isSubmitting: boolean
}

export function ClosureActions({
  onSave,
  onSubmit,
  isSaving,
  isSubmitting,
}: ClosureActionsProps) {
  return (
    <div className="flex justify-end gap-3 sticky bottom-4 bg-background/95 backdrop-blur py-4 -mx-4 px-4 border-t">
      <Button
        variant="outline"
        onClick={onSave}
        disabled={isSaving || isSubmitting}
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? 'Salvataggio...' : 'Salva Bozza'}
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isSaving || isSubmitting}
      >
        <Send className="h-4 w-4 mr-2" />
        {isSubmitting ? 'Invio...' : 'Invia per Validazione'}
      </Button>
    </div>
  )
}

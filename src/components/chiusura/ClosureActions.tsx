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
    // I margini negativi servono a far arrivare la barra fino ai bordi
    // dell'area di contenuto, e devono valere quanto la sua imbottitura: `main`
    // ha `p-4` da telefono e `p-6` da tablet in su (`AppShell`). Con `-mx-6`
    // fisso, su uno schermo da 390px questa barra ne occupava 406 ed era l'unico
    // elemento che sfondava la pagina: il bottone «Invia per Validazione»
    // finiva mezzo fuori dallo schermo.
    // `flex-wrap`: se le due etichette non ci stanno su una riga vanno a capo,
    // invece di spingere il bottone fuori dallo schermo.
    <div className="flex flex-wrap justify-end gap-3 sticky bottom-0 bg-background/95 backdrop-blur py-4 -mx-4 px-4 md:-mx-6 md:px-6 border-t z-10">
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

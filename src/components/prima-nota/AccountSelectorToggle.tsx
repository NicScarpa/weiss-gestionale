'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Wallet, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Il bottone selezionato resta `variant="outline"`: la variante `default`
// porta con sé `text-primary-foreground`, che nel tema scuro è quasi nero,
// mentre lo sfondo veniva riportato a `bg-primary/5` — testo nero su fondo
// nero, etichetta invisibile. Con l'outline il testo eredita `text-foreground`
// e resta leggibile in entrambi i temi; la selezione si vede da bordo, anello
// e velatura, tutti derivati da `--primary` e quindi validi in chiaro e scuro.
const SELEZIONATO = 'border-primary bg-primary/10 ring-1 ring-primary'

export function AccountSelectorToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentRegister = searchParams.get('register') as 'CASH' | 'BANK' | null

  const handleToggle = (value: 'CASH' | 'BANK') => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('register', value)
    router.push(`?${newSearchParams.toString()}`)
  }

  return (
    // I due bottoni affiancati misurano 299px e non entrano nei 278 utili di un
    // telefono da 390: con max-w-full si impilano invece di sporgere, e le
    // etichette restano leggibili per intero. Sul desktop lo spazio c'è, quindi
    // la coppia resta in linea come prima.
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={currentRegister === 'CASH'}
        onClick={() => handleToggle('CASH')}
        className={cn('h-11 flex-1 gap-2 sm:h-8', currentRegister === 'CASH' && SELEZIONATO)}
      >
        <Wallet aria-hidden="true" className="h-4 w-4 text-green-600" />
        <span className="text-sm">Cassa Contanti</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={currentRegister === 'BANK'}
        onClick={() => handleToggle('BANK')}
        className={cn('h-11 flex-1 gap-2 sm:h-8', currentRegister === 'BANK' && SELEZIONATO)}
      >
        <Building2 aria-hidden="true" className="h-4 w-4 text-blue-600" />
        <span className="text-sm">Conto Bancario</span>
      </Button>
    </div>
  )
}

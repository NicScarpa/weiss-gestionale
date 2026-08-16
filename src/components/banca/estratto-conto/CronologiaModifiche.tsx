'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { formatDateShort } from '@/lib/constants'

interface ModificaRegistrata {
  id: string
  campo: string
  prima: string | null
  dopo: string | null
  quando: string
  utente: string | null
}

/** I quattro campi che la rotta registra (`BankTransactionEdit.campo`). */
const ETICHETTA: Record<string, string> = {
  descrizione: 'Descrizione',
  causale: 'Causale',
  note: 'Note',
  sezione: 'Sezione',
}

async function leggiCronologia(id: string): Promise<ModificaRegistrata[]> {
  const r = await fetch(`/api/bank-transactions/${id}/cronologia`)
  if (!r.ok) throw new Error('Errore nel caricamento della cronologia')
  const risposta = await r.json()
  return Array.isArray(risposta?.modifiche) ? risposta.modifiche : []
}

/** Un valore mancante è un valore: si scrive, non si salta. */
const valore = (v: string | null) => (v === null || v === '' ? '—' : v)

/**
 * Chi ha cambiato cosa, e quando. Serve a rispondere alla domanda che nasce
 * davanti a un numero che non combacia con l'estratto: «questa riga è arrivata
 * così dalla banca, o l'ha toccata qualcuno?».
 */
export function CronologiaModifiche({ bankTransactionId }: { bankTransactionId: string }) {
  const { data, isPending, isError } = useQuery({
    // Sotto `estratto-conto`: dopo una modifica il contenitore invalida quel
    // prefisso e la cronologia si riapre già aggiornata.
    queryKey: ['estratto-conto', 'cronologia', bankTransactionId],
    queryFn: () => leggiCronologia(bankTransactionId),
  })

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Caricamento della cronologia…
      </div>
    )
  }

  if (isError) {
    return <p className="py-4 text-sm text-muted-foreground">Cronologia non disponibile</p>
  }

  if (data.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nessuna modifica: il movimento è com&apos;è arrivato dalla banca
      </p>
    )
  }

  return (
    <ul className="space-y-2 py-2 text-sm">
      {data.map((m) => (
        <li key={m.id} className="border-b pb-2 last:border-0">
          <div className="text-xs text-muted-foreground">
            {formatDateShort(m.quando)} {format(new Date(m.quando), 'HH:mm')} ·{' '}
            {/* Le righe toccate dai ricalcoli non hanno un utente: è il sistema. */}
            {m.utente ?? 'sistema'}
          </div>
          <div>
            <span className="font-medium">{ETICHETTA[m.campo] ?? m.campo}</span>: «{valore(m.prima)}» →
            «{valore(m.dopo)}»
          </div>
        </li>
      ))}
    </ul>
  )
}

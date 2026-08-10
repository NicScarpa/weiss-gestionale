'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'

interface RegisterBalance {
  openingBalance: number
  totalDebits: number
  totalCredits: number
  closingBalance: number
  lastUpdated?: Date | string
}

interface PrimaNotaContextValue {
  venueId: string
  isAdmin: boolean
  cashBalance: RegisterBalance | null
  bankBalance: RegisterBalance | null
  activeRegister: 'CASH' | 'BANK'
  setActiveRegister: (register: 'CASH' | 'BANK') => void
  refreshBalances: () => Promise<void>
}

const PrimaNotaContext = createContext<PrimaNotaContextValue | undefined>(undefined)

export function usePrimaNota() {
  const context = useContext(PrimaNotaContext)
  if (!context) throw new Error('usePrimaNota must be used within PrimaNotaProvider')
  return context
}

export interface PrimaNotaProviderProps {
  children: ReactNode
  venueId: string
  isAdmin: boolean
  cashBalance?: RegisterBalance | null
  bankBalance?: RegisterBalance | null
}

/** Forma della risposta di `GET /api/prima-nota/saldi`. */
interface SaldiResponse {
  data?: Array<{
    registers?: Partial<Record<'CASH' | 'BANK', RegisterBalance>>
  }>
}

/**
 * Legge i saldi correnti dei due registri, `null` se la richiesta non riesce:
 * meglio lasciare in pagina i numeri precedenti che azzerare le card per un
 * errore di rete.
 */
async function leggiSaldi(): Promise<{
  cash: RegisterBalance | null
  bank: RegisterBalance | null
} | null> {
  const response = await fetch('/api/prima-nota/saldi')
  if (!response.ok) return null

  const payload = (await response.json()) as SaldiResponse
  const registers = payload.data?.[0]?.registers

  return { cash: registers?.CASH ?? null, bank: registers?.BANK ?? null }
}

export function PrimaNotaProvider({
  children,
  venueId,
  isAdmin,
  cashBalance = null,
  bankBalance = null,
}: PrimaNotaProviderProps) {
  const [activeRegister, setActiveRegister] = useState<'CASH' | 'BANK'>('CASH')
  const [balances, setBalances] = useState({ cash: cashBalance, bank: bankBalance })

  /**
   * Rilegge i saldi dall'unica route che li calcola. Prima puntava a
   * `/api/prima-nota/balances`, che non esiste: la chiamata falliva e le card
   * restavano ferme ai numeri con cui la pagina era stata renderizzata.
   */
  const refreshBalances = useCallback(async () => {
    const saldi = await leggiSaldi()
    if (saldi) setBalances(saldi)
  }, [])

  // I saldi passati dal server nascono da una lettura separata e possono già
  // essere vecchi al primo render: si rileggono all'apertura della sezione, così
  // le card partono dal valore calcolato dalla stessa formula di tutto il resto.
  // Se l'utente lascia la pagina prima della risposta, il risultato si scarta.
  useEffect(() => {
    let abbandonata = false

    void leggiSaldi().then((saldi) => {
      if (saldi && !abbandonata) setBalances(saldi)
    })

    return () => {
      abbandonata = true
    }
  }, [])

  return (
    <PrimaNotaContext.Provider
      value={{
        venueId,
        isAdmin,
        cashBalance: balances.cash,
        bankBalance: balances.bank,
        activeRegister,
        setActiveRegister,
        refreshBalances,
      }}
    >
      {children}
    </PrimaNotaContext.Provider>
  )
}

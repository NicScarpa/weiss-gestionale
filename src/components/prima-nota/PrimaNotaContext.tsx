'use client'

import { createContext, useContext, ReactNode, useState } from 'react'

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

export function PrimaNotaProvider({
  children,
  venueId,
  isAdmin,
  cashBalance = null,
  bankBalance = null,
}: PrimaNotaProviderProps) {
  const [activeRegister, setActiveRegister] = useState<'CASH' | 'BANK'>('CASH')
  const [balances, setBalances] = useState({ cash: cashBalance, bank: bankBalance })

  const refreshBalances = async () => {
    // Fetch da API /api/prima-nota/balances
    const response = await fetch(`/api/prima-nota/balances?venueId=${venueId}`)
    const data = await response.json()
    setBalances({ cash: data.cash, bank: data.bank })
  }

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

import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { RegisterBalanceCards } from '@/components/prima-nota/RegisterBalanceCards'
import PrimaNotaLayout from '../layout'

/**
 * I saldi del primo render della prima nota.
 *
 * Il layout leggeva `register_balances`, la tabella di appoggio che nessun
 * codice popola: le tre card nascevano vuote a ogni caricamento e si
 * riempivano solo dopo che il client rileggeva i saldi. Qui si verifica il
 * primo render, cioè quello che l'utente vede per primo.
 */
setupIntegrationDb()

const ANNO = Number(romeDateKey(new Date()).slice(0, 4))

interface PropsConSaldi {
  cashRegister?: { closingBalance: number } | null
  bankRegister?: { closingBalance: number } | null
}

/** Cerca nell'albero renderizzato il primo elemento del tipo indicato. */
function cerca(nodo: ReactNode, tipo: unknown): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const figlio of nodo) {
      const trovato = cerca(figlio, tipo)
      if (trovato) return trovato
    }
    return null
  }

  if (!isValidElement(nodo)) return null
  if (nodo.type === tipo) return nodo

  return cerca((nodo.props as { children?: ReactNode }).children, tipo)
}

describe('layout della prima nota', () => {
  it('renderizza le card con i saldi veri, senza aspettare il client', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()

    await prisma.initialBalance.create({
      data: { venueId: venue.id, year: ANNO, cashBalance: 500, bankBalance: 2000 },
    })

    await prisma.journalEntry.create({
      data: {
        venueId: venue.id,
        date: toDateOnlyUtc(`${ANNO}-01-01`),
        registerType: 'BANK',
        description: 'Incasso di prova',
        debitAmount: 150,
        costCenterId: await centroDiCostoDiDefault(),
      },
    })

    const albero = await PrimaNotaLayout({ children: null })
    const card = cerca(albero, RegisterBalanceCards)

    expect(card).not.toBeNull()

    const props = card!.props as PropsConSaldi

    expect(props.cashRegister?.closingBalance).toBe(500)
    expect(props.bankRegister?.closingBalance).toBe(2150)
  })

  // Senza saldo iniziale né movimenti le card mostrano zero, non il vuoto: la
  // differenza conta, perché "nessun dato" e "zero euro" si leggono diversi.
  it('mostra zero quando non c\'è ancora nulla da mostrare', async () => {
    await loginAs('admin')
    await venueDiTest()

    const albero = await PrimaNotaLayout({ children: null })
    const props = cerca(albero, RegisterBalanceCards)!.props as PropsConSaldi

    expect(props.cashRegister?.closingBalance).toBe(0)
    expect(props.bankRegister?.closingBalance).toBe(0)
  })
})

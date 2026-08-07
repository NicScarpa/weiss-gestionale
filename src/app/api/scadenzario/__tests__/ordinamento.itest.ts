import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { GET } from '../route'

/**
 * Ordinamento della lista scadenze.
 *
 * `orderBy: { [sortBy]: sortOrder }` prendeva il nome della colonna dalla query
 * string senza controllarlo: un valore inesistente faceva sollevare Prisma e
 * la route rispondeva 500, riproducibile a comando da chiunque fosse
 * autenticato; un valore *esistente* ma fuori contratto ordinava su colonne mai
 * previste, e la risposta diceva al client quali nomi di colonna esistono.
 *
 * Le colonne ordinabili sono ora un elenco chiuso, e un valore fuori elenco è
 * una richiesta sbagliata (400), non un errore del server.
 */
setupIntegrationDb()

async function lista(searchParams: Record<string, string>) {
  return callRoute<{ data?: unknown[]; error?: string }>(
    GET,
    jsonRequest('/api/scadenzario', { searchParams })
  )
}

describe('GET /api/scadenzario — ordinamento', () => {
  it('rifiuta un campo di ordinamento inesistente invece di andare in errore', async () => {
    await loginAs('admin')

    const risposta = await lista({ sortBy: 'pippo' })

    expect(risposta.status).toBe(400)
  })

  it('rifiuta una colonna esistente ma fuori dal contratto', async () => {
    await loginAs('admin')

    // `note` è una colonna vera del modello: senza whitelist la lista si
    // sarebbe lasciata ordinare anche su questa.
    const risposta = await lista({ sortBy: 'note' })

    expect(risposta.status).toBe(400)
  })

  it('rifiuta un verso di ordinamento diverso da asc e desc', async () => {
    await loginAs('admin')

    const risposta = await lista({ sortBy: 'dataScadenza', sortOrder: 'drop' })

    expect(risposta.status).toBe(400)
  })

  it('ordina davvero sulle colonne ammesse', async () => {
    await loginAs('admin')
    await creaScadenza({ descrizione: 'seconda', importoTotale: 50 })
    await creaScadenza({ descrizione: 'prima', importoTotale: 300 })

    const risposta = await lista({ sortBy: 'importoTotale', sortOrder: 'desc' })

    expect(risposta.status).toBe(200)
    const importi = (risposta.body.data as Array<{ importoTotale: string }>).map((s) =>
      Number(s.importoTotale)
    )
    expect(importi).toEqual([300, 50])
  })

  it('usa la data di scadenza quando non viene chiesto nulla', async () => {
    await loginAs('admin')
    await creaScadenza({ descrizione: 'dopo', dataScadenza: new Date('2026-09-30') })
    await creaScadenza({ descrizione: 'prima', dataScadenza: new Date('2026-08-31') })

    const risposta = await lista({})

    expect(risposta.status).toBe(200)
    const descrizioni = (risposta.body.data as Array<{ descrizione: string }>).map(
      (s) => s.descrizione
    )
    expect(descrizioni).toEqual(['prima', 'dopo'])
  })
})

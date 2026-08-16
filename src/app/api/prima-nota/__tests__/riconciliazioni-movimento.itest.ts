import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaMovimento, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { GET as GET_riconciliazioni } from '@/app/api/prima-nota/[id]/riconciliazioni/route'
import { DELETE as DELETE_movimento } from '@/app/api/prima-nota/[id]/route'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'
import { DELETE as DELETE_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/[reconciliationId]/route'

/**
 * Le scadenze collegate a un movimento, viste dal lato movimento.
 *
 * L'invariante che questi test sorvegliano è una sola: ciò che impedisce la
 * cancellazione deve comparire in questo elenco. Se l'elenco fosse più stretto
 * del blocco, resterebbe un movimento non cancellabile e senza nulla da
 * sganciare — che è esattamente il vicolo cieco da cui nasce l'endpoint.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

interface RigaRiconciliazione {
  id: string
  scheduleId: string
  importo: number
  altraRigaDelTrasferimento: boolean
  schedule: { descrizione: string; eliminata: boolean }
}

function elenca(journalEntryId: string) {
  return callRoute<{ riconciliazioni: RigaRiconciliazione[] }>(
    GET_riconciliazioni,
    jsonRequest(`/api/prima-nota/${journalEntryId}/riconciliazioni`),
    { id: journalEntryId }
  )
}

function riconcilia(scheduleId: string, journalEntryId: string) {
  return callRoute<{ id: string }>(
    POST_riconciliazione,
    jsonRequest(`/api/scadenzario/${scheduleId}/riconciliazioni`, {
      method: 'POST',
      body: { journalEntryId },
    }),
    { id: scheduleId }
  )
}

describe('GET /api/prima-nota/[id]/riconciliazioni', () => {
  it('elenca la scadenza che tiene bloccato il movimento', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, descrizione: 'Fattura Rossi' })
    const movimento = await creaMovimento({ uscita: 100 })
    await riconcilia(scadenza.id, movimento.id)

    const esito = await elenca(movimento.id)

    expect(esito.status).toBe(200)
    expect(esito.body.riconciliazioni).toHaveLength(1)
    expect(esito.body.riconciliazioni[0].scheduleId).toBe(scadenza.id)
    expect(esito.body.riconciliazioni[0].schedule.descrizione).toBe('Fattura Rossi')
    expect(esito.body.riconciliazioni[0].importo).toBe(100)
    expect(esito.body.riconciliazioni[0].altraRigaDelTrasferimento).toBe(false)
  })

  it('un movimento libero non ha nulla da sganciare', async () => {
    const movimento = await creaMovimento({ uscita: 100 })

    const esito = await elenca(movimento.id)

    expect(esito.status).toBe(200)
    expect(esito.body.riconciliazioni).toHaveLength(0)
  })

  it('mostra anche l\'aggancio che sta sull\'altra riga del trasferimento', async () => {
    const transferId = randomUUID()
    const uscita = await creaMovimento({ uscita: 100, registerType: 'CASH' })
    const entrata = await creaMovimento({ entrata: 100, registerType: 'BANK' })
    await prisma.journalEntry.updateMany({
      where: { id: { in: [uscita.id, entrata.id] } },
      data: { transferId },
    })

    const scadenza = await creaScadenza({ tipo: 'attiva', importoTotale: 100 })
    await riconcilia(scadenza.id, entrata.id)

    // Chiesto dalla riga che *non* ha l'aggancio: è quella che l'utente ha in
    // mano quando la cancellazione viene rifiutata «per l'altra riga».
    const esito = await elenca(uscita.id)

    expect(esito.body.riconciliazioni).toHaveLength(1)
    expect(esito.body.riconciliazioni[0].altraRigaDelTrasferimento).toBe(true)
  })

  it('dall\'elenco allo sgancio: dopo l\'annullamento il movimento si cancella', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100 })
    const movimento = await creaMovimento({ uscita: 100 })
    await riconcilia(scadenza.id, movimento.id)

    const prima = await elenca(movimento.id)
    const riga = prima.body.riconciliazioni[0]

    // Lo stesso percorso del dialog: gli identificativi dell'elenco bastano a
    // chiamare l'annullamento, senza passare dalla pagina della scadenza.
    const annullo = await callRoute(
      DELETE_riconciliazione,
      jsonRequest(`/api/scadenzario/${riga.scheduleId}/riconciliazioni/${riga.id}`, {
        method: 'DELETE',
      }),
      { id: riga.scheduleId, reconciliationId: riga.id }
    )
    expect(annullo.status).toBe(200)

    const dopo = await elenca(movimento.id)
    expect(dopo.body.riconciliazioni).toHaveLength(0)

    const cancellazione = await callRoute(
      DELETE_movimento,
      jsonRequest(`/api/prima-nota/${movimento.id}`, { method: 'DELETE' }),
      { id: movimento.id }
    )
    expect(cancellazione.status).toBe(200)
  })

  it('nega l\'elenco a chi non è admin o manager', async () => {
    const movimento = await creaMovimento({ uscita: 100 })
    await loginAs('staff')

    const esito = await elenca(movimento.id)

    expect(esito.status).toBe(403)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { callRoute } from '@/test/integration/api'
import type { ImportResult } from '@/types/reconciliation'
import { POST } from '../route'

/**
 * Deduplica dell'import di un estratto conto.
 *
 * Il difetto originale confondeva due cose diverse: "questa riga l'ho già
 * importata" e "questa riga somiglia a un'altra riga". Scartando ogni movimento
 * con stessa data, importo e descrizione di uno già a database, l'import
 * buttava via addebiti veri: due commissioni identiche nello stesso giorno,
 * due SDD uguali, due accrediti POS gemelli sono ordinaria amministrazione in
 * un estratto conto. Il saldo ricostruito non tornava più con quello della
 * banca, e nessun messaggio lo diceva.
 *
 * La deduplica giusta conta le occorrenze: se il file porta due righe identiche
 * e a database ce n'è una sola, ne manca una e va inserita. Reimportare lo
 * stesso file non aggiunge nulla perché le occorrenze coincidono.
 */
setupIntegrationDb()

const INTESTAZIONE = 'Data contabile;Data valuta;Importo;Descrizione;Note'

/** Riga nel formato RelaxBanking, che è la configurazione di default. */
function riga(
  data: string,
  importo: string,
  descrizione: string,
  valuta = data
): string {
  return `${data};${valuta};${importo};${descrizione};`
}

function csv(...righe: string[]): string {
  return [INTESTAZIONE, ...righe].join('\n')
}

async function importa(contenuto: string, nomeFile = 'estratto.csv', bankAccountId: string | null = null) {
  const formData = new FormData()
  formData.append('file', new File([contenuto], nomeFile, { type: 'text/csv' }))
  if (bankAccountId !== null) {
    formData.append('bankAccountId', bankAccountId)
  }

  const request = new NextRequest('http://localhost:3000/api/bank-transactions/import', {
    method: 'POST',
    body: formData,
  })

  return callRoute<ImportResult & { error?: string }>(POST, request)
}

async function movimenti() {
  return prisma.bankTransaction.findMany({ orderBy: { description: 'asc' } })
}

/** Un conto BANK per la sede unica del seed, da passare a `importa()`. */
async function contoDiProva() {
  const venue = await prisma.venue.findFirstOrThrow()
  return prisma.bankAccount.create({ data: { venueId: venue.id, name: 'Conto prova', accountType: 'BANK' } })
}

// I test esistenti importavano senza indicare un conto: ora è obbligatorio, e
// questo `beforeEach` ne crea uno fresco (il DB è già stato svuotato dal
// `beforeEach` di `setupIntegrationDb()`, registrato sopra e quindi eseguito
// prima) così ogni test lo trova pronto senza doverlo chiedere da solo.
let contoId: string

beforeEach(async () => {
  contoId = (await contoDiProva()).id
})

describe('POST /api/bank-transactions/import — movimenti legittimi identici', () => {
  it('importa entrambe le commissioni identiche dello stesso giorno', async () => {
    await loginAs('admin')

    const risposta = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO')
      ),
      'estratto.csv',
      contoId
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.recordsImported).toBe(2)
    expect(risposta.body.duplicatesSkipped).toBe(0)
    expect(await prisma.bankTransaction.count()).toBe(2)
  })

  it('distingue due righe che differiscono solo dopo il cinquantesimo carattere', async () => {
    await loginAs('admin')
    const prefisso = 'BONIFICO DA CLIENTE PER FATTURA DEL MESE DI GENNAIO'

    const risposta = await importa(
      csv(
        riga('07/01/26', '100,00', `${prefisso} numero 1`),
        riga('07/01/26', '100,00', `${prefisso} numero 2`)
      ),
      'estratto.csv',
      contoId
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.recordsImported).toBe(2)

    // Il riferimento banca è unico per sede: due movimenti distinti non possono
    // condividerlo, altrimenti il secondo fa esplodere l'import a metà file.
    const riferimenti = (await movimenti()).map((m) => m.bankReference)
    expect(new Set(riferimenti).size).toBe(2)
  })
})

describe('POST /api/bank-transactions/import — re-import dello stesso file', () => {
  it('non crea doppioni reimportando il file identico', async () => {
    await loginAs('admin')
    const file = csv(
      riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
      riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
      riga('06/01/26', '1.250,00', 'ACCREDITO POS')
    )

    await importa(file, 'estratto.csv', contoId)
    const secondo = await importa(file, 'estratto.csv', contoId)

    expect(secondo.status).toBe(200)
    expect(secondo.body.recordsImported).toBe(0)
    expect(secondo.body.duplicatesSkipped).toBe(3)
    expect(await prisma.bankTransaction.count()).toBe(3)
  })

  it('riconosce i movimenti già in archivio col vecchio formato di riferimento', async () => {
    const sessione = await loginAs('admin')

    // Movimento importato prima del fix: il riferimento ha la forma sintetica
    // di allora. Reimportare quel file non deve duplicarlo.
    await prisma.bankTransaction.create({
      data: {
        venueId: sessione.user.venueId!,
        transactionDate: new Date('2026-01-05'),
        valueDate: new Date('2026-01-05'),
        description: 'COMMISSIONI SU BONIFICO',
        amount: -2.5,
        bankReference: '2026-01-05_-2_5_COMMISSIONI_SU_BONIFICO',
        importSource: 'CSV',
      },
    })

    const risposta = await importa(csv(riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO')), 'estratto.csv', contoId)

    expect(risposta.body.recordsImported).toBe(0)
    expect(risposta.body.duplicatesSkipped).toBe(1)
    expect(await prisma.bankTransaction.count()).toBe(1)
  })

  it('importa solo le righe nuove di un file che ne aggiunge alcune', async () => {
    await loginAs('admin')

    await importa(csv(riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO')), 'estratto.csv', contoId)

    const secondo = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('08/01/26', '-45,00', 'ADDEBITO SDD ENERGIA')
      ),
      'estratto.csv',
      contoId
    )

    expect(secondo.body.recordsImported).toBe(2)
    expect(secondo.body.duplicatesSkipped).toBe(1)
    expect(await prisma.bankTransaction.count()).toBe(3)
  })
})

describe('POST /api/bank-transactions/import — atomicità', () => {
  it('non lascia un batch a metà se una riga non entra a database', async () => {
    await loginAs('admin')

    // La colonna description è VarChar(500): una riga più lunga fa fallire la
    // scrittura. Qualunque sia il motivo dell'errore, il file o entra tutto o
    // non entra affatto — un batch a metà è un estratto conto che non quadra
    // e nessuno se ne accorge.
    const descrizioneFuoriMisura = 'X'.repeat(600)

    const risposta = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('06/01/26', '-10,00', descrizioneFuoriMisura)
      ),
      'estratto.csv',
      contoId
    )

    expect(risposta.status).toBe(500)
    expect(await prisma.bankTransaction.count()).toBe(0)
    expect(await prisma.importBatch.count()).toBe(0)
  })

  it('registra sul batch i conteggi veri delle righe importate', async () => {
    await loginAs('admin')

    const risposta = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('06/01/26', '1.250,00', 'ACCREDITO POS')
      ),
      'estratto.csv',
      contoId
    )

    const batch = await prisma.importBatch.findUniqueOrThrow({
      where: { id: risposta.body.batchId },
    })

    expect(batch.recordCount).toBe(2)
    expect(batch.duplicatesSkipped).toBe(0)
    expect(await prisma.bankTransaction.count({ where: { importBatchId: batch.id } })).toBe(2)
  })
})

describe('POST /api/bank-transactions/import — conto, causale e descrizione', () => {
  it('rifiuta l\'import senza conto bancario', async () => {
    await loginAs('admin')
    const r = await importa(csv(riga('15/07/2026', '-10,00', 'Commissioni')), 'estratto.csv', null)
    expect(r.status).toBe(400)
  })

  it('scrive il conto sulle righe e separa la causale dalla descrizione', async () => {
    await loginAs('admin')
    const conto = await contoDiProva()
    await importa(csv(riga('15/07/2026', '-100,00', 'Bonifico a vs favore *ROSSI SRL')), 'estratto.csv', conto.id)
    const [r] = await movimenti()
    expect(r.bankAccountId).toBe(conto.id)
    expect(r.description).toBe('Bonifico a vs favore *ROSSI SRL')
    expect(r.causale).toBe('Bonifico a vs favore')
    expect(r.descrizione).toBe('ROSSI SRL')
    // L'import non crea più scritture: la promozione è un'azione dell'utente (spec, decisione 6).
    expect(await prisma.journalEntry.count()).toBe(0)
  })
})

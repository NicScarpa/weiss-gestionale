import { describe, it, expect } from 'vitest'
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

async function importa(contenuto: string, nomeFile = 'estratto.csv') {
  const formData = new FormData()
  formData.append('file', new File([contenuto], nomeFile, { type: 'text/csv' }))

  const request = new NextRequest('http://localhost:3000/api/bank-transactions/import', {
    method: 'POST',
    body: formData,
  })

  return callRoute<ImportResult & { error?: string }>(POST, request)
}

async function movimenti() {
  return prisma.bankTransaction.findMany({ orderBy: { description: 'asc' } })
}

describe('POST /api/bank-transactions/import — movimenti legittimi identici', () => {
  it('importa entrambe le commissioni identiche dello stesso giorno', async () => {
    await loginAs('admin')

    const risposta = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO')
      )
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
      )
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

    await importa(file)
    const secondo = await importa(file)

    expect(secondo.status).toBe(200)
    expect(secondo.body.recordsImported).toBe(0)
    expect(secondo.body.duplicatesSkipped).toBe(3)
    expect(await prisma.bankTransaction.count()).toBe(3)
  })

  it('importa solo le righe nuove di un file che ne aggiunge alcune', async () => {
    await loginAs('admin')

    await importa(csv(riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO')))

    const secondo = await importa(
      csv(
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('05/01/26', '-2,50', 'COMMISSIONI SU BONIFICO'),
        riga('08/01/26', '-45,00', 'ADDEBITO SDD ENERGIA')
      )
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
      )
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
      )
    )

    const batch = await prisma.importBatch.findUniqueOrThrow({
      where: { id: risposta.body.batchId },
    })

    expect(batch.recordCount).toBe(2)
    expect(batch.duplicatesSkipped).toBe(0)
    expect(await prisma.bankTransaction.count({ where: { importBatchId: batch.id } })).toBe(2)
  })
})

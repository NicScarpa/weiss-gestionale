import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'
import { POST } from '../route'

/**
 * Le tre decisioni prese nella finestra dei conflitti (Task 9, UI): cosa fare
 * di un duplicato, se aggiornare l'anagrafica del fornitore, quali termini di
 * pagamento vincono. Qui si misura solo il server: la UI che le raccoglie è
 * Task 11.
 */

setupIntegrationDb()

const richiesta = (body: unknown) => jsonRequest('/api/invoices', { method: 'POST', body })

beforeEach(async () => {
  await loginAs('admin')
  // La categorizzazione AI delle righe è un effetto collaterale dell'import
  // (fire-and-forget, non atteso): senza chiave viene saltata subito, ed è
  // l'unico modo di non rischiare una chiamata vera all'API a pagamento.
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})

describe('POST /api/invoices — politica duplicati', () => {
  // P.IVA volutamente diversa da quelle del seed (01234567890 e affini, vedi
  // prisma/seed.ts): con quelle il match automatico del fornitore agganciava
  // già "Bevande Sacile" prima ancora di arrivare al codice sotto test, e i
  // test su «fornitore creato» e «sovrascrivi anagrafica» misuravano il seed,
  // non il comportamento della rotta.
  const XML = xmlFattura({ numero: 'POL-1', data: '2026-06-01', piva: '07945211006' })
  const base = { xmlContent: XML, fileName: 'f.xml', venueId: 'auto', createSupplier: true }

  it('con «salta» rifiuta il duplicato con 409', async () => {
    await POST(richiesta(base))
    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'salta' }))

    expect(seconda.status).toBe(409)
    expect((await seconda.json()).existingId).toBeTruthy()
  })

  it('con «sostituisci» archivia la vecchia e ne crea una nuova', async () => {
    const prima = await POST(richiesta(base))
    const idVecchio = (await prima.json()).id

    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'sostituisci' }))
    expect(seconda.status).toBe(201)

    const corpo = await seconda.json()
    expect(corpo.sostituisce).toBe(idVecchio)
    expect(corpo.id).not.toBe(idVecchio)

    // La vecchia non si cancella: si archivia. `ElectronicInvoice` è fra i
    // SOFT_DELETE_MODELS (src/lib/prisma.ts): ogni lettura che non nomina
    // `deletedAt` nella `where` viene filtrata automaticamente per
    // `deletedAt: null`, quindi una `findUnique` "nuda" non troverebbe mai la
    // riga archiviata, cancellata o no — un `delete()` al posto
    // dell'`update()` produrrebbe lo stesso `null` e il test non se ne
    // accorgerebbe. Nominare `deletedAt` esplicitamente disattiva il filtro e
    // distingue davvero i due casi.
    const vecchia = await prisma.electronicInvoice.findFirst({
      where: { id: idVecchio, deletedAt: { not: null } },
    })
    expect(vecchia).not.toBeNull()
    expect(vecchia?.deletedAt).not.toBeNull()
  })

  it('con «sostituisci» annulla anche le scadenze della vecchia fattura', async () => {
    // Fix round 1: `Schedule` è un modello a cancellazione logica proprio —
    // il suo `deletedAt` non ha alcun legame automatico con quello della
    // `ElectronicInvoice` da cui nasce. Prima del fix, sostituire una
    // fattura lasciava viva la scadenza della vecchia e ne generava una
    // seconda per la nuova: due debiti aperti per un solo documento reale.
    const prima = await POST(richiesta(base))
    const idVecchio = (await prima.json()).id

    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'sostituisci' }))
    const idNuovo = (await seconda.json()).id

    // `Schedule` è anch'esso fra i SOFT_DELETE_MODELS: una `findMany` "nuda"
    // mostra solo le righe attive — esattamente il conteggio che conta per
    // scadenzario, aging e previsione di cassa.
    const scadenzeAttive = await prisma.schedule.findMany({
      where: { invoiceId: { in: [idVecchio, idNuovo] } },
    })

    expect(scadenzeAttive).toHaveLength(1)
    expect(scadenzeAttive[0].invoiceId).toBe(idNuovo)
  })

  it('rifiuta la sostituzione se la fattura esistente è registrata in prima nota', async () => {
    const prima = await POST(richiesta(base))
    const idVecchio = (await prima.json()).id

    await prisma.electronicInvoice.update({
      where: { id: idVecchio },
      data: { status: 'RECORDED' },
    })

    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'sostituisci' }))

    expect(seconda.status).toBe(409)
    expect((await seconda.json()).existingId).toBe(idVecchio)

    // Non toccata: né archiviata, né duplicata.
    const invariata = await prisma.electronicInvoice.findUnique({ where: { id: idVecchio } })
    expect(invariata?.deletedAt).toBeNull()
    const scadenzeInvariate = await prisma.schedule.findMany({ where: { invoiceId: idVecchio } })
    expect(scadenzeInvariate).toHaveLength(1)
  })

  it('dice se il fornitore è stato creato', async () => {
    const res = await POST(richiesta({ ...base, fileName: 'nuovo-fornitore.xml' }))
    expect(await res.json()).toHaveProperty('fornitoreCreato')
  })

  it('quando il fornitore viene creato davvero, fornitoreCreato è true', async () => {
    // Il test precedente controlla solo la presenza del campo: qui si porta
    // il ramo che crea il fornitore (createSupplier + supplierData) e si
    // misura il valore, non solo l'esistenza della chiave.
    const res = await POST(richiesta({
      ...base,
      fileName: 'creato-per-davvero.xml',
      supplierData: {
        name: 'Torrefazione di prova Srl',
        vatNumber: '07945211006',
        fiscalCode: null,
        address: 'Via del Caffe 1',
        city: 'Bolzano',
        province: 'BZ',
        postalCode: '39100',
      },
    }))

    expect((await res.json()).fornitoreCreato).toBe(true)
  })

  it('senza supplierData, «createSupplier» deriva i dati dal documento e crea il fornitore', async () => {
    // Fix round 4: prova sul campo con 226 fatture vere — 0 fornitori
    // creati, supplierId sempre NULL. Il wizard nuovo (Task 12) manda
    // `createSupplier: true` ma MAI `supplierData` (calcola l'anteprima nel
    // browser, senza chiederla al server): il ramo che richiede
    // `createSupplier && supplierData` era quindi sempre falso. Qui non c'è
    // `supplierData` in `base` — è esattamente lo scenario del campo.
    const res = await POST(richiesta({ ...base, fileName: 'senza-supplier-data.xml' }))
    const corpo = await res.json()

    expect(corpo.fornitoreCreato).toBe(true)

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id: corpo.id } })
    expect(fattura?.supplierId).toBeTruthy()

    // I dati vengono da fattura.cedentePrestatore (via matchSupplier), non
    // da un supplierData che il client non ha mandato.
    const fornitore = await prisma.supplier.findUnique({ where: { id: fattura!.supplierId! } })
    expect(fornitore?.vatNumber).toBe('07945211006')
    expect(fornitore?.name).toBe('Torrefazione di prova Srl')
  })

  it('due fatture dello stesso fornitore non creano due anagrafiche', async () => {
    const prima = await POST(richiesta({ ...base, fileName: 'prima.xml' }))
    const corpoPrima = await prima.json()
    expect(corpoPrima.fornitoreCreato).toBe(true)

    // Stessa P.IVA di `base`, numero diverso: è una fattura successiva dello
    // stesso fornitore, non un duplicato da respingere.
    const secondaXml = xmlFattura({ numero: 'POL-6', data: '2026-06-01', piva: '07945211006' })
    const seconda = await POST(richiesta({ ...base, xmlContent: secondaXml, fileName: 'seconda.xml' }))
    const corpoSeconda = await seconda.json()

    expect(corpoSeconda.fornitoreCreato).toBe(false)

    const fatturaPrima = await prisma.electronicInvoice.findUnique({ where: { id: corpoPrima.id } })
    const fatturaSeconda = await prisma.electronicInvoice.findUnique({ where: { id: corpoSeconda.id } })
    expect(fatturaSeconda?.supplierId).toBeTruthy()
    expect(fatturaSeconda?.supplierId).toBe(fatturaPrima?.supplierId)

    const fornitori = await prisma.supplier.findMany({ where: { vatNumber: '07945211006' } })
    expect(fornitori).toHaveLength(1)
  })

  it('con supplierData esplicito, i dati passati dal client vincono su quelli del documento', async () => {
    const res = await POST(richiesta({
      ...base,
      fileName: 'dati-espliciti.xml',
      supplierData: {
        name: 'Nome Corretto A Mano Srl',
        vatNumber: '07945211006',
        fiscalCode: null,
        address: 'Via Corretta 99',
        city: 'Trento',
        province: 'TN',
        postalCode: '38100',
      },
    }))

    const corpo = await res.json()
    expect(corpo.fornitoreCreato).toBe(true)

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id: corpo.id } })
    const fornitore = await prisma.supplier.findUnique({ where: { id: fattura!.supplierId! } })

    // Non "Torrefazione di prova Srl" / "Bolzano" (i dati del documento):
    // quelli passati esplicitamente dal client.
    expect(fornitore?.name).toBe('Nome Corretto A Mano Srl')
    expect(fornitore?.city).toBe('Trento')
  })

  it('con «sovrascrivi anagrafica» aggiorna i dati del fornitore esistente', async () => {
    // La P.IVA deve coincidere con quella del documento (07945211006):
    // è la chiave con cui matchSupplier ritrova il fornitore da aggiornare.
    const fornitore = await prisma.supplier.create({
      data: { name: 'FORNITORE SPA', vatNumber: '07945211006', city: 'CITTÀ VECCHIA' },
    })

    await POST(richiesta({ ...base, fileName: 'agg.xml', sovrascriviAnagrafica: true }))

    const aggiornato = await prisma.supplier.findUnique({ where: { id: fornitore.id } })
    expect(aggiornato?.city).toBe('Bolzano')

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('senza «sovrascrivi anagrafica» lascia intatti i dati del fornitore', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'FORNITORE SPA', vatNumber: '07945211006', city: 'CITTÀ VECCHIA' },
    })

    await POST(richiesta({ ...base, fileName: 'non-agg.xml', sovrascriviAnagrafica: false }))

    const invariato = await prisma.supplier.findUnique({ where: { id: fornitore.id } })
    expect(invariato?.city).toBe('CITTÀ VECCHIA')

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('applica i giorni scelti nella finestra dei conflitti', async () => {
    // Nessuna rata nel documento: la scadenza sarà stimata, ed è lì che i
    // giorni scelti devono farsi valere.
    const senzaScadenza = xmlFattura({ numero: 'POL-2', data: '2026-06-01', rate: [] })

    const res = await POST(richiesta({
      ...base,
      xmlContent: senzaScadenza,
      fileName: 'senza-scadenza.xml',
      giorniPagamentoScelti: 60,
    }))

    const { id } = await res.json()
    const scadenze = await prisma.invoiceDeadline.findMany({ where: { invoiceId: id } })
    expect(scadenze).toHaveLength(1)
    // 2026-06-01 + 60 giorni
    expect(scadenze[0].dueDate.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('i giorni scelti vincono anche quando il documento porta già una scadenza', async () => {
    // Fix round 2: prima di questo fix, `giorniPagamentoScelti` non aveva
    // alcun effetto quando il documento riportava una DataScadenzaPagamento
    // (il caso più comune) — la finestra dei conflitti sui termini era una
    // schermata che fingeva di decidere. La rata dichiara 2026-07-01: i
    // giorni scelti devono ignorarla.
    const conScadenza = xmlFattura({
      numero: 'POL-3',
      data: '2026-06-01',
      rate: [{ scadenza: '2026-07-01', importo: '122.00' }],
    })

    const res = await POST(richiesta({
      ...base,
      xmlContent: conScadenza,
      fileName: 'con-scadenza-imposta.xml',
      giorniPagamentoScelti: 60,
    }))

    const { id } = await res.json()
    const scadenze = await prisma.invoiceDeadline.findMany({ where: { invoiceId: id } })
    expect(scadenze).toHaveLength(1)
    // 2026-06-01 + 60 giorni, non 2026-07-01 (la data del documento)
    expect(scadenze[0].dueDate.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('senza giorni scelti resta la scadenza che il documento porta', async () => {
    const conScadenza = xmlFattura({
      numero: 'POL-4',
      data: '2026-06-01',
      rate: [{ scadenza: '2026-07-01', importo: '122.00' }],
    })

    const res = await POST(richiesta({
      ...base,
      xmlContent: conScadenza,
      fileName: 'con-scadenza-non-imposta.xml',
    }))

    const { id } = await res.json()
    const scadenze = await prisma.invoiceDeadline.findMany({ where: { invoiceId: id } })
    expect(scadenze).toHaveLength(1)
    expect(scadenze[0].dueDate.toISOString().slice(0, 10)).toBe('2026-07-01')
  })

  it('con più rate, i giorni scelti conservano lo scaglionamento invece di collassarle', async () => {
    // Fix round 3: verifica end-to-end che la rotta porti fino allo
    // scadenzario tre scadenze distinte (non tre allo stesso giorno) quando
    // il documento ha più rate e l'utente impone i giorni.
    const treRate = xmlFattura({
      numero: 'POL-5',
      data: '2026-06-01',
      rate: [
        { scadenza: '2026-07-01', importo: '40.00' }, // 30 giorni
        { scadenza: '2026-07-31', importo: '40.00' }, // 60 giorni
        { scadenza: '2026-08-30', importo: '42.00' }, // 90 giorni
      ],
    })

    const res = await POST(richiesta({
      ...base,
      xmlContent: treRate,
      fileName: 'tre-rate-imposte.xml',
      giorniPagamentoScelti: 60,
    }))

    const { id } = await res.json()
    const scadenze = await prisma.invoiceDeadline.findMany({
      where: { invoiceId: id },
      orderBy: { dueDate: 'asc' },
    })

    expect(scadenze).toHaveLength(3)
    // 60/90/120 giorni dalla data fattura, non tre volte 2026-07-31.
    expect(scadenze.map((s) => s.dueDate.toISOString().slice(0, 10))).toEqual([
      '2026-07-31',
      '2026-08-30',
      '2026-09-29',
    ])
  })
})

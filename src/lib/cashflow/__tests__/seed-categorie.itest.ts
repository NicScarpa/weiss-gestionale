import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { getVenueId } from '@/lib/venue'
import { seedCategorieCashFlow } from '../seed-categorie'

// Era l'unico `.itest.ts` del progetto senza questa riga, e quindi l'unico che
// saltava `assertTestDb()` — «l'ultima rete di protezione prima dei TRUNCATE» —
// proprio sul ramo in cui DATABASE_URL punta alla produzione. Porta con sé
// anche il `resetDb()` fra un test e l'altro, che rende l'esito indipendente
// dall'ordine: prima il primo test funzionava solo perché era il primo.
setupIntegrationDb()

let venueId: string

beforeEach(async () => {
  // getVenueId() e non venue.findFirst(): è la regola del progetto, e vale
  // anche nei test — è la stessa sede che vedrà il codice di produzione.
  // Dopo il reset la sede è quella del seed, quindi l'id va riletto.
  venueId = await getVenueId()
})

describe('seedCategorieCashFlow', () => {
  it('crea 9 famiglie e 39 sottogruppi, tutti agganciati al loro padre', async () => {
    const esito = await seedCategorieCashFlow(venueId)

    expect(esito.famiglieCreate).toBe(9)
    expect(esito.sottogruppiCreati).toBe(39)

    const famiglie = await prisma.budgetCategory.findMany({
      where: { venueId, code: { startsWith: 'CF_' }, parentId: null },
    })
    const sottogruppi = await prisma.budgetCategory.findMany({
      where: { venueId, code: { startsWith: 'CF_' }, parentId: { not: null } },
    })

    expect(famiglie).toHaveLength(9)
    expect(sottogruppi).toHaveLength(39)
    for (const sottogruppo of sottogruppi) {
      expect(famiglie.some((f) => f.id === sottogruppo.parentId)).toBe(true)
    }
  })

  it('è idempotente: rieseguirlo non duplica nulla, e il valore restituito lo conferma', async () => {
    await seedCategorieCashFlow(venueId)
    const dopoPrima = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    const secondoEsito = await seedCategorieCashFlow(venueId)
    const dopoSeconda = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    expect(dopoSeconda).toBe(dopoPrima)
    expect(dopoSeconda).toBe(48)

    // Non basta che il conteggio delle righe non cambi: il rerun non deve
    // nemmeno *dichiarare* creazioni che non ci sono state. Le 48 categorie
    // esistevano già da prima di questa chiamata, quindi tutte aggiornate.
    expect(secondoEsito.famiglieCreate).toBe(0)
    expect(secondoEsito.sottogruppiCreati).toBe(0)
    expect(secondoEsito.famiglieAggiornate).toBe(9)
    expect(secondoEsito.sottogruppiAggiornati).toBe(39)
  })

  it('disattiva le categorie generiche invece di cancellarle', async () => {
    await prisma.budgetCategory.upsert({
      where: { venueId_code: { venueId, code: 'FOOD_COST' } },
      update: { isActive: true },
      create: {
        venueId,
        code: 'FOOD_COST',
        name: 'Food Cost (Materie Prime)',
        categoryType: 'COST',
        isSystem: true,
      },
    })

    await seedCategorieCashFlow(venueId)

    const vecchia = await prisma.budgetCategory.findUnique({
      where: { venueId_code: { venueId, code: 'FOOD_COST' } },
    })

    expect(vecchia).not.toBeNull()
    expect(vecchia!.isActive).toBe(false)
  })

  it('mappa, aggiorna, riassegna o segnala mancante ogni voce, senza perderne nessuna', async () => {
    const esito = await seedCategorieCashFlow(venueId)

    // Ogni voce prevista dalla riclassificazione finisce in una, e una sola,
    // delle quattro categorie di esito sui mapping: creata, aggiornata,
    // riassegnata, o segnalata come conto mancante (nel database di test
    // locale il piano dei conti v4 è già seedato da `prisma/seed.ts`, quindi
    // qui i conti risultano tutti presenti — è la migrazione in *produzione*
    // a non essere ancora eseguita, non il seed di questo database). La
    // somma resta 149 indipendentemente da quante volte il seed sia già
    // stato eseguito: è questo, non un conteggio di "creati", l'invariante
    // che non dipende dall'ordine dei test.
    for (const codice of esito.contiMancanti) {
      const conto = await prisma.account.findUnique({ where: { code: codice } })
      expect(conto).toBeNull()
    }
    expect(
      esito.mappingCreati +
        esito.mappingAggiornati +
        esito.mappingRiassegnati +
        esito.contiMancanti.length
    ).toBe(149)
  })

  it('rileva e ripristina una mappatura riassegnata a mano su un\'altra categoria', async () => {
    await seedCategorieCashFlow(venueId) // garantisce che categorie e mapping corretti esistano già

    const conto = await prisma.account.findUniqueOrThrow({ where: { code: '10.01' } })
    const categoriaSbagliata = await prisma.budgetCategory.findUniqueOrThrow({
      where: { venueId_code: { venueId, code: 'CF_B1' } },
    })

    // Come farebbe un utente dal pannello «Mapping Conti»: sposta il conto
    // su una categoria diversa da quella che la riclassificazione prevede.
    await prisma.accountBudgetMapping.update({
      where: { accountId: conto.id },
      data: { budgetCategoryId: categoriaSbagliata.id },
    })

    const esito = await seedCategorieCashFlow(venueId)

    expect(esito.mappingRiassegnati).toBeGreaterThanOrEqual(1)

    const categoriaCorretta = await prisma.budgetCategory.findUniqueOrThrow({
      where: { venueId_code: { venueId, code: 'CF_A1' } },
    })
    const mappingDopo = await prisma.accountBudgetMapping.findUnique({
      where: { accountId: conto.id },
    })
    expect(mappingDopo?.budgetCategoryId).toBe(categoriaCorretta.id)
  })
})

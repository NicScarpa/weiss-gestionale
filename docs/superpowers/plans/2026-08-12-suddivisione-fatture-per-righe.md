# Suddivisione delle fatture per righe — piano di implementazione

> **Per chi esegue:** SUB-SKILL RICHIESTA: usare `superpowers:subagent-driven-development` (consigliata) o `superpowers:executing-plans` per eseguire questo piano task per task. I passi usano caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** imputare le righe di una fattura ai rispettivi conti, far sì che ogni fetta di un movimento porti con sé la propria IVA invece di riceverne una stimata pro-quota, e rendere impossibile dividere una fattura lasciandone una parte non attribuita.

**Architettura:** il dato mancante è uno solo — quanta IVA contiene una fetta — e si aggiunge a `JournalEntryAllocation`, valorizzato da chi la crea. I consumatori smettono di dedurre e leggono; il ripiego pro-quota resta per le fette che l'IVA non la dichiarano. Attorno a questo: le righe fuori XML (bollo, arrotondamento) diventano imputabili, una riga può essere divisa fra più conti, e le note di credito entrano nel calcolo dei pesi sottraendo le proprie righe.

**Specifica di riferimento:** `docs/superpowers/specs/2026-08-12-suddivisione-per-righe-design.md`

**Stack:** Next.js 15 App Router, Prisma 7 + PostgreSQL (Supabase), React Query, shadcn/ui, Vitest (unità + integrazione su Postgres vero), decimal.js.

## Global Constraints

- **Il denaro non passa mai da `number` nei passaggi intermedi.** Si usa `Money` da `src/lib/money.ts` (decimal.js); `toApi()` solo al confine. Fanno eccezione i moduli che già lavorano in centesimi interi (`report/conto-economico.ts`) o in `number` puro con arrotondamento esplicito a fine calcolo (`allocation-service.ts`): lì si segue lo stile del file, non lo si converte.
- **`DATABASE_URL` punta alla PRODUZIONE.** Nessun `prisma migrate dev`, `prisma db push` o `prisma migrate reset` diretto. Le migrazioni si scrivono a mano come `prisma/migrations/<timestamp>_<nome>/migration.sql` e si applicano in locale con gli script protetti da `npm run guard:not-prod`. Il rilascio in produzione avviene con `npm run db:migrate:deploy` da Railway.
- **Node 22 obbligatorio:** anteporre `nvm use 22 &&` a ogni comando `npm`/`npx`.
- **Test d'integrazione:** girano su Postgres vero. Usare un `TEST_DB_SUFFIX` distinto da quello di altre sessioni: due suite in parallelo sullo stesso database si uccidono a vicenda con `57P01`.
- **Mai `npm run build | tail`:** l'exit code diventa quello di `tail` e un fallimento passa per successo.
- **`strict: true` è attivo.** Un campo nullable nuovo verrà segnalato in ogni punto che lo usa senza controllarlo: è la rete, non un ostacolo.
- **Convenzione dei segni:** denaro in entrata positivo, in uscita negativo, nessuna eccezione per tipo di conto. L'IVA di una fetta segue sempre il verso del suo importo.
- **Lingua:** commenti, messaggi d'errore, testi a schermo e messaggi di commit in italiano. Gli identificatori seguono lo stile del file che si tocca.
- **Il commento spiega il perché, non il cosa.** Questo codice ha commenti che raccontano il difetto che una riga previene: mantenere quello standard.
- **Baseline verde di partenza:** 1417 test unitari su 106 file, 405 d'integrazione su 54. Nessuna task può chiudersi con meno.

## Le due fasi

**Fase A — task 1-3: la precisione dell'IVA.** Solo back end, nessun cambiamento visibile. Alla fine della task 3 il prospetto è esatto anche sulle fatture ad aliquote miste e i tre report concordano. **È rilasciabile da sola** e chiude il difetto che ha originato tutto il lavoro.

**Fase B — task 4-9: la selezione delle righe.** Righe di sistema, divisione di una riga, note di credito, riallineamento, interfaccia. Dipende dalla fase A ma non viceversa.

---

## Struttura dei file

| File | Responsabilità | Task |
|---|---|---|
| `prisma/schema.prisma` | tre campi nuovi: `JournalEntryAllocation.iva`, `InvoiceLineAccount.progressivo`, `ElectronicInvoice.rettificaInvoiceId` | 1, 5, 6 |
| `prisma/migrations/*/migration.sql` | DDL scritto a mano, con il commento che spiega perché | 1, 5, 6 |
| `src/lib/cashflow/movimenti.ts` | legge `iva` dalla fetta, ripiego pro-quota se assente | 1 |
| `src/lib/services/allocation-service.ts` | `calcolaPesiConIva` e `ripartisciProQuotaConIva` — la matematica pura, testabile senza database | 2 |
| `src/lib/services/schedule-reconciliation-service.ts` | scrive `iva` sulle fette ereditate; sottrae le note di credito dai pesi | 2, 6 |
| `src/lib/report/conto-economico.ts` | allinea la semantica del residuo di testata | 3 |
| `src/lib/sdi/righe-di-sistema.ts` (nuovo) | bollo e arrotondamento come righe sintetiche, una sola definizione per back end e front end | 4 |
| `src/app/api/invoices/[id]/righe-conti/route.ts` | accetta righe di sistema e più imputazioni per riga | 4, 5 |
| `src/lib/invoices/riallineamento.ts` (nuovo) | rileva la divergenza fra imputazioni e fette, e la ricompone | 7 |
| `src/app/api/prima-nota/[id]/riallinea/route.ts` (nuovo) | l'azione esplicita | 7 |
| `src/components/invoices/InvoiceDetailSections.tsx` | righe di sistema, contatore di copertura, tipi di conto | 8 |
| `src/components/invoices/RigaDivisibile.tsx` (nuovo) | la riga che si apre in righe figlie | 9 |

---

## FASE A — La precisione dell'IVA

### Task 1: La fetta può portare la propria IVA

Il campo nasce e il cash flow impara a leggerlo. Nessuno lo scrive ancora, quindi il comportamento resta identico: tutte le fette hanno `iva = null` e ricadono sul pro-quota. È la task che apre la strada senza cambiare un numero.

**Files:**
- Modify: `prisma/schema.prisma` (modello `JournalEntryAllocation`, righe 527-550)
- Create: `prisma/migrations/20260813000000_allocation_iva/migration.sql`
- Modify: `src/lib/cashflow/movimenti.ts` (interfaccia riga 44, docblock 125-155, `aggregaMovimenti`, la `select` in `movimentiCashFlow`)
- Test: `src/lib/cashflow/__tests__/movimenti.test.ts`

**Interfaces:**
- Produce: `JournalEntryAllocation.iva: Decimal | null` — le task 2, 6 e 7 lo scrivono.
- Produce: `MovimentoPrimaNota['allocations'][number].iva: MoneyInput | null`.

- [ ] **Passo 1: scrivere il test che fallisce**

In `src/lib/cashflow/__tests__/movimenti.test.ts`, dentro il `describe('aggregaMovimenti')` esistente:

```ts
it('usa l\'IVA dichiarata dalla fetta invece di stimarla pro-quota', () => {
  // Fattura ad aliquote miste: 1.000 di alimentari al 10% (1.100 lordi,
  // 100 di IVA) e 100 di detersivi al 22% (122 lordi, 22 di IVA).
  // Il pro-quota darebbe 109,82 e 12,18: quasi 10 € spostati dalla
  // famiglia piccola a quella grande.
  const aggregati = aggregaMovimenti([
    {
      accountId: 'fornitori',
      date: new Date(Date.UTC(2026, 6, 15)),
      debitAmount: 1222,
      creditAmount: 0,
      vatAmount: 122,
      allocations: [
        { accountId: 'alimentari', importo: 1100, iva: 100 },
        { accountId: 'pulizia', importo: 122, iva: 22 },
      ],
    },
  ])

  const alimentari = aggregati.find((a) => a.accountId === 'alimentari')
  const pulizia = aggregati.find((a) => a.accountId === 'pulizia')

  expect(alimentari?.ivaDare.toNumber()).toBe(100)
  expect(pulizia?.ivaDare.toNumber()).toBe(22)
})

it('ricade sul pro-quota quando la fetta non dichiara l\'IVA', () => {
  const aggregati = aggregaMovimenti([
    {
      accountId: 'fornitori',
      date: new Date(Date.UTC(2026, 6, 15)),
      debitAmount: 1222,
      creditAmount: 0,
      vatAmount: 122,
      allocations: [
        { accountId: 'alimentari', importo: 1100, iva: null },
        { accountId: 'pulizia', importo: 122, iva: null },
      ],
    },
  ])

  // 122 × (1100/1222) = 109,82 — il comportamento di prima, invariato.
  expect(aggregati.find((a) => a.accountId === 'alimentari')?.ivaDare.toNumber()).toBeCloseTo(109.82, 2)
})
```

- [ ] **Passo 2: eseguirlo e vederlo fallire**

```bash
nvm use 22 && npx vitest run src/lib/cashflow/__tests__/movimenti.test.ts
```
Atteso: errore di tipo su `iva` (proprietà non esistente su `allocations`) — il test non compila ancora. È il fallimento giusto.

- [ ] **Passo 3: aggiungere il campo allo schema**

In `prisma/schema.prisma`, nel modello `JournalEntryAllocation`, subito dopo `importo`:

```prisma
  /// Quanta IVA contiene questa fetta. `null` = non nota: il consumatore
  /// ricade sulla ripartizione pro-quota dell'IVA di testata. Diverso da
  /// `0`, che significa "IVA assente" — la spesa senza diritto di
  /// detrazione, dove l'IVA è già dentro l'imponibile.
  /// Chi divide a mano scrive `null`, non `0`: non sta dichiarando
  /// un'assenza, sta dicendo che non lo sa.
  iva              Decimal? @db.Decimal(10, 2)
```

- [ ] **Passo 4: scrivere la migrazione**

Creare `prisma/migrations/20260813000000_allocation_iva/migration.sql`:

```sql
-- journal_entry_allocations.iva: quanta IVA contiene una fetta.
--
-- Nullable per necessità semantica, non per prudenza: `null` significa "non
-- dichiarata, ripartisci pro-quota come prima", mentre `0` significa "IVA
-- assente". Un default a zero avrebbe fatto sparire la differenza fra le due
-- cose, e con essa la possibilità di accorgersi di una fetta creata da un
-- percorso che ancora non valorizza il campo.
--
-- Nessun backfill: `journal_entries` è vuota in produzione al 12 ago 2026,
-- quindi le fette sono necessariamente zero.
ALTER TABLE "journal_entry_allocations" ADD COLUMN "iva" DECIMAL(10,2);
```

Applicarla in locale e rigenerare il client:

```bash
nvm use 22 && npm run guard:not-prod && npx prisma migrate deploy && npx prisma generate
```

> Se `guard:not-prod` fallisce, `DATABASE_URL` punta alla produzione: **fermarsi e chiedere**, non aggirare il guard.

- [ ] **Passo 5: far leggere il campo al cash flow**

In `src/lib/cashflow/movimenti.ts`, riga 44, estendere l'interfaccia:

```ts
  allocations: readonly { accountId: string; importo: MoneyInput; iva: MoneyInput | null }[]
```

Nel corpo di `aggregaMovimenti`, sostituire il blocco che calcola `spostamento`:

```ts
    for (const fetta of riga.allocations) {
      const quota = money(fetta.importo)

      // L'IVA della fetta: quella dichiarata se c'è, altrimenti la quota
      // pro-quota dell'IVA di testata. Il ripiego resta perché una fetta
      // creata a mano non dichiara un'aliquota, e perché una fattura le cui
      // righe non riportano l'aliquota non può produrne una esatta.
      const ivaTestata = ivaDare.plus(ivaAvere)
      const ivaFetta =
        fetta.iva === null
          ? lordoRiga.isZero()
            ? money(0)
            : ivaTestata.times(quota.div(lordoRiga))
          : money(fetta.iva)

      const spostamento: Contributo = {
        dare: inDare ? quota : money(0),
        avere: inDare ? money(0) : quota,
        ivaDare: inDare ? ivaFetta : money(0),
        ivaAvere: inDare ? money(0) : ivaFetta,
      }

      aggiungi(riga.accountId, mese, negato(spostamento))
      aggiungi(fetta.accountId, mese, spostamento)
    }
```

> Perché `ivaDare.plus(ivaAvere)` e non i due rami separati come prima: `ripartisciIva` mette tutta l'IVA su un lato solo, scelto con la stessa condizione di `inDare`. Sommarli e rimetterli sul lato giusto dà lo stesso risultato con un ramo in meno — e rende impossibile che importo e IVA finiscano su lati diversi.

Aggiungere `iva: true` alla `select` di `allocations` in `movimentiCashFlow` (riga 244).

- [ ] **Passo 6: riscrivere il docblock**

Il commento alle righe 125-155 descrive un limite che questa task rimuove. Sostituire la parte sul pro-quota con la regola nuova: la fetta dichiara la propria IVA, il pro-quota resta come ripiego per le fette che non la dichiarano, e l'esempio numerico delle aliquote miste diventa la descrizione di **cosa il codice ora evita**, non di cosa sbaglia. Conservare la parte sulla divergenza con `conto-economico.ts` — la chiude la task 3, non questa.

- [ ] **Passo 7: eseguire i test**

```bash
nvm use 22 && npx vitest run src/lib/cashflow/
nvm use 22 && npm run typecheck:test
```
Atteso: tutto verde. Se altri test falliscono per il campo mancante nelle fixture, aggiungere `iva: null` — è il valore che descrive le fette esistenti.

- [ ] **Passo 8: verifica per inversione**

Cambiare temporaneamente `fetta.iva === null` in `true` (cioè: ignora sempre il campo e usa il pro-quota). Rieseguire: il primo test **deve** fallire con 109,82 invece di 100. Se passa lo stesso, il test non misura quello che dice. Ripristinare.

- [ ] **Passo 9: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260813000000_allocation_iva src/lib/cashflow/
git commit -m "feat(fatture): la fetta può dichiarare la propria IVA

Il campo nasce nullable e nessuno lo scrive ancora: tutte le fette
esistenti ricadono sul pro-quota e nessun numero cambia. Null significa
'non lo so, stima', zero significa 'IVA assente': tenerle distinte è la
ragione per cui il campo non ha un default."
```

---

### Task 2: L'ereditarietà scrive l'IVA esatta

Qui il numero cambia. La riconciliazione conosce già l'aliquota di ogni riga: smette di buttarla via.

**Files:**
- Modify: `src/lib/services/allocation-service.ts` (dopo `calcolaPesiDaRighe`, riga 93)
- Modify: `src/lib/services/schedule-reconciliation-service.ts` (righe 208-227)
- Test: `src/lib/services/__tests__/allocation-service.test.ts`
- Test: `src/lib/services/__tests__/schedule-reconciliation-service.itest.ts`

**Interfaces:**
- Consuma: `JournalEntryAllocation.iva` (task 1).
- Produce: `calcolaPesiConIva(righe: Array<{ accountId: string; imponibile: number; aliquota: number | undefined }>): PesoConIva[]`
- Produce: `ripartisciProQuotaConIva(pesi: PesoConIva[], quota: number): Array<{ accountId: string; importo: number; iva: number | null }>`
- Produce: `interface PesoConIva { accountId: string; importo: number; iva: number | null }`

- [ ] **Passo 1: scrivere i test unitari che falliscono**

In `src/lib/services/__tests__/allocation-service.test.ts`:

```ts
describe('calcolaPesiConIva', () => {
  it('porta il lordo e l\'IVA esatta di ciascuna aliquota', () => {
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'pulizia', imponibile: 100, aliquota: 22 },
    ])

    expect(pesi).toEqual([
      { accountId: 'alimentari', importo: 1100, iva: 100 },
      { accountId: 'pulizia', importo: 122, iva: 22 },
    ])
  })

  it('somma le righe che vanno sullo stesso conto, IVA compresa', () => {
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'alimentari', imponibile: 500, aliquota: 4 },
    ])

    expect(pesi).toEqual([{ accountId: 'alimentari', importo: 1620, iva: 120 }])
  })

  it('azzera l\'IVA di TUTTE le fette se anche una sola riga non ha aliquota', () => {
    // Mescolare fette esatte e fette stimate darebbe un totale che non torna
    // con nessuna delle due logiche: meglio un'intera fattura dichiaratamente
    // approssimata.
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'pulizia', imponibile: 100, aliquota: undefined },
    ])

    expect(pesi.every((p) => p.iva === null)).toBe(true)
    // Senza aliquota il lordo di quella riga è l'imponibile stesso.
    expect(pesi.find((p) => p.accountId === 'pulizia')?.importo).toBe(100)
  })
})

describe('ripartisciProQuotaConIva', () => {
  it('scala l\'IVA con la stessa frazione dell\'importo su un pagamento parziale', () => {
    const fette = ripartisciProQuotaConIva(
      [
        { accountId: 'alimentari', importo: 1100, iva: 100 },
        { accountId: 'pulizia', importo: 122, iva: 22 },
      ],
      611 // metà esatta di 1222
    )

    expect(fette).toEqual([
      { accountId: 'alimentari', importo: 550, iva: 50 },
      { accountId: 'pulizia', importo: 61, iva: 11 },
    ])
  })

  it('propaga il null senza inventare uno zero', () => {
    const fette = ripartisciProQuotaConIva(
      [{ accountId: 'alimentari', importo: 1000, iva: null }],
      500
    )

    expect(fette).toEqual([{ accountId: 'alimentari', importo: 500, iva: null }])
  })
})
```

- [ ] **Passo 2: eseguirli e vederli fallire**

```bash
nvm use 22 && npx vitest run src/lib/services/__tests__/allocation-service.test.ts
```
Atteso: `calcolaPesiConIva is not defined`.

- [ ] **Passo 3: scrivere le due funzioni**

In `src/lib/services/allocation-service.ts`, dopo `calcolaPesiDaRighe`:

```ts
/** Un conto con quanto gli spetta al lordo e quanta IVA c'è dentro. */
export interface PesoConIva {
  accountId: string
  importo: number
  /** `null` quando l'aliquota di almeno una riga non era leggibile. */
  iva: number | null
}

/**
 * Aggrega le righe fattura per conto tenendo separata l'IVA di ciascuna.
 *
 * Perché serve: i pesi sono imponibili, la quota da ripartire è un pagamento,
 * cioè lordo. Applicare proporzioni calcolate sul netto a un importo lordo
 * sbaglia ogni volta che le aliquote non sono uniformi — ed è la fattura
 * normale di un fornitore di ristorazione, alimentari al 10% e detersivi al
 * 22%. Portando l'IVA di ogni riga fino in fondo, la fetta non ha più bisogno
 * di essere stimata da nessuno.
 *
 * Tutto-o-niente sull'IVA: se anche una sola riga non ha un'aliquota
 * leggibile, l'IVA di TUTTE le fette è `null`. Un insieme misto di fette
 * esatte e fette stimate produrrebbe un totale che non quadra con nessuna
 * delle due logiche, e nessun controllo se ne accorgerebbe.
 */
export function calcolaPesiConIva(
  righe: Array<{ accountId: string; imponibile: number; aliquota: number | undefined }>
): PesoConIva[] {
  const ivaNota = righe.every((r) => r.aliquota !== undefined)

  const totali = new Map<string, { importo: number; iva: number }>()
  for (const riga of righe) {
    const aliquota = riga.aliquota ?? 0
    const iva = riga.imponibile * (aliquota / 100)
    const corrente = totali.get(riga.accountId) ?? { importo: 0, iva: 0 }
    totali.set(riga.accountId, {
      importo: corrente.importo + riga.imponibile + iva,
      iva: corrente.iva + iva,
    })
  }

  return [...totali.entries()]
    .filter(([, v]) => v.importo > 0)
    .sort((a, b) => b[1].importo - a[1].importo)
    .map(([accountId, v]) => ({
      accountId,
      importo: Math.round(v.importo * 100) / 100,
      iva: ivaNota ? Math.round(v.iva * 100) / 100 : null,
    }))
}

/**
 * Come `ripartisciProQuota`, ma l'IVA scende insieme all'importo.
 *
 * Su un pagamento parziale ogni fetta si riduce con la propria IVA — metà
 * fattura dà 550 con dentro 50 e 61 con dentro 11 — invece di ereditare una
 * media che non corrisponde a nessuna delle aliquote pagate.
 */
export function ripartisciProQuotaConIva(
  pesi: PesoConIva[],
  quota: number
): Array<{ accountId: string; importo: number; iva: number | null }> {
  const fette = ripartisciProQuota(
    pesi.map(({ accountId, importo }) => ({ accountId, importo })),
    quota
  )
  const perConto = new Map(pesi.map((p) => [p.accountId, p]))

  return fette.map((fetta) => {
    const peso = perConto.get(fetta.accountId)
    if (!peso || peso.iva === null || peso.importo <= 0) {
      return { ...fetta, iva: null }
    }
    return {
      ...fetta,
      iva: Math.round(peso.iva * (fetta.importo / peso.importo) * 100) / 100,
    }
  })
}
```

- [ ] **Passo 4: eseguire i test unitari**

```bash
nvm use 22 && npx vitest run src/lib/services/__tests__/allocation-service.test.ts
```
Atteso: verde.

- [ ] **Passo 5: scrivere il test d'integrazione che fallisce**

In `src/lib/services/__tests__/schedule-reconciliation-service.itest.ts`, usando la fixture `creaFatturaConRighe` che esiste già:

```ts
it('scrive sulla fetta l\'IVA della sua aliquota, non una media', async () => {
  const { fattura, conti } = await creaFatturaConRighe([
    { numeroLinea: 1, descrizione: 'Farina', prezzoTotale: 1000, aliquotaIVA: 10, accountId: conti.alimentari, stato: 'confermata' },
    { numeroLinea: 2, descrizione: 'Detersivi', prezzoTotale: 100, aliquotaIVA: 22, accountId: conti.pulizia, stato: 'confermata' },
  ])

  // ... riconciliazione del pagamento pieno da 1.222 (seguire il pattern dei
  // test già presenti nel file per creare movimento e scadenza)

  const fette = await prisma.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true, iva: true },
  })

  const alimentari = fette.find((f) => f.accountId === conti.alimentari)
  const pulizia = fette.find((f) => f.accountId === conti.pulizia)

  expect(Number(alimentari?.iva)).toBe(100)
  expect(Number(pulizia?.iva)).toBe(22)
  // E la somma resta l'IVA del documento: 122.
  expect(fette.reduce((s, f) => s + Number(f.iva), 0)).toBe(122)
})
```

- [ ] **Passo 6: collegare la riconciliazione**

In `src/lib/services/schedule-reconciliation-service.ts`, sostituire il blocco alle righe 210-227:

```ts
  const pesi = calcolaPesiConIva(
    imputazioni.map((r) => ({
      accountId: r.accountId,
      imponibile: Number(r.importo),
      aliquota: aliquotePerLinea.get(r.numeroLinea),
    }))
  )
  const fette = ripartisciProQuotaConIva(pesi, quota)
  if (fette.length === 0) return

  await tx.journalEntryAllocation.createMany({
    data: fette.map((f) => ({
      journalEntryId,
      accountId: f.accountId,
      importo: new Prisma.Decimal(f.importo.toFixed(2)),
      iva: f.iva === null ? null : new Prisma.Decimal(f.iva.toFixed(2)),
      origine: 'ereditata',
      reconciliationId,
    })),
  })
```

Aggiornare gli import (riga 16-17) e **rimuovere `alLordo`** se non più usata: `calcolaPesiConIva` fa lo stesso calcolo tenendo l'IVA. Verificare con `grep -rn "alLordo" src/` prima di cancellarla.

- [ ] **Passo 7: eseguire i test**

```bash
nvm use 22 && TEST_DB_SUFFIX=<suffisso-di-questa-sessione> npm run test:integration -- schedule-reconciliation
nvm use 22 && npx vitest run src/lib/services/
```

- [ ] **Passo 8: verifica per inversione**

Sostituire `iva: f.iva === null ? null : …` con `iva: null` e rieseguire il test d'integrazione: **deve** fallire (`Number(null)` dà 0, non 100). Ripristinare. Questo controllo non è formale: su questo prospetto è già successo che un test passasse confrontando la stessa sorgente con sé stessa.

- [ ] **Passo 9: commit**

```bash
git add src/lib/services/
git commit -m "feat(fatture): l'ereditarietà scrive l'IVA esatta di ogni aliquota

La riconciliazione l'aliquota di ogni riga ce l'aveva già in mano e la
buttava via un istante dopo. Ora la porta fino alla fetta, e su una
fattura mista 10%/22% la famiglia piccola smette di perdere il 10%.
Su un pagamento parziale l'IVA scende con l'importo invece di ereditare
una media."
```

---

### Task 3: Un solo significato per il residuo di testata

Con l'attribuzione totale vincolata al documento e non al movimento, un movimento può legittimamente avere una parte non divisa. I tre moduli che leggono le fette devono dire la stessa cosa su quella parte.

**Files:**
- Modify: `src/lib/report/conto-economico.ts` (righe 267-294)
- Test: `src/lib/report/__tests__/conto-economico.test.ts`

**Interfaces:** nessuna nuova. Cambia il comportamento di `conto-economico.ts` su un caso che oggi tratta diversamente dagli altri due moduli.

- [ ] **Passo 1: scrivere il test che fallisce**

```ts
it('lascia sul conto di testata la parte non coperta dalle fette', () => {
  // Bonifico da 2.000 che salda una fattura da 1.222: i restanti 778 sono un
  // acconto non ancora abbinato e restano dove sono. `saldi.ts` e il prospetto
  // di cash flow li contano già così; questo report li faceva sparire.
  const conto = costruisciContoEconomico([
    {
      account: contoCosto('fornitori'),
      costCenter: null,
      debitAmount: 2000,
      creditAmount: 0,
      allocations: [
        { account: contoCosto('alimentari'), importo: 1100 },
        { account: contoCosto('pulizia'), importo: 122 },
      ],
    },
  ])

  expect(valore(conto, 'alimentari')).toBe(1100)
  expect(valore(conto, 'pulizia')).toBe(122)
  expect(valore(conto, 'fornitori')).toBe(778)
})
```

> Adattare i costruttori (`contoCosto`, `valore`, `costruisciContoEconomico`) a quelli già usati nel file di test: non introdurne di nuovi.

- [ ] **Passo 2: eseguirlo e vederlo fallire**

```bash
nvm use 22 && npx vitest run src/lib/report/__tests__/conto-economico.test.ts
```
Atteso: `fornitori` vale 0 invece di 778.

- [ ] **Passo 3: correggere**

In `src/lib/report/conto-economico.ts`, dentro `if (movimento.allocations.length > 0)`, accumulare quanto le fette coprono e trattare il resto:

```ts
    if (movimento.allocations.length > 0) {
      const versoDare = dare !== 0 || avere === 0
      let coperto = 0

      for (const fetta of movimento.allocations) {
        const quota = inCentesimi(fetta.importo)
        // Si conta anche la fetta su un conto non economico: quel denaro è
        // comunque uscito dalla testata, e ignorarlo qui lo farebbe ricomparire
        // nel residuo.
        coperto += quota
        if (!isEconomica(fetta.account)) continue
        accumula(
          fetta.account,
          colonna,
          versoDare
            ? importoEconomico(fetta.account.type, quota, 0)
            : importoEconomico(fetta.account.type, 0, quota)
        )
      }

      // Il residuo di testata. Fino al 12 ago 2026 questo blocco faceva
      // `continue` e il residuo spariva: un bonifico da 2.000 che saldava una
      // fattura da 1.222 mostrava 1.222 qui e 2.000 nel prospetto di cash
      // flow. La suddivisione totale non è garantita — è obbligatoria sul
      // DOCUMENTO, non sul movimento, che può contenere anche un acconto — e
      // la semantica giusta è quella di saldi.ts: la testata tiene il resto.
      const residuo = (versoDare ? dare : avere) - coperto
      if (residuo > 0 && movimento.account !== null && isEconomica(movimento.account)) {
        accumula(
          movimento.account,
          colonna,
          versoDare
            ? importoEconomico(movimento.account.type, residuo, 0)
            : importoEconomico(movimento.account.type, 0, residuo)
        )
      }
      continue
    }
```

- [ ] **Passo 4: eseguire i test**

```bash
nvm use 22 && npx vitest run src/lib/report/
```

- [ ] **Passo 5: il test che lega i tre moduli**

Aggiungere in `src/lib/report/__tests__/conto-economico.test.ts` un test che costruisce lo **stesso** movimento parzialmente diviso e verifica che il residuo di testata calcolato qui coincida con quello di `aggregaMovimenti` in `src/lib/cashflow/movimenti.ts`. Non confrontare due valori che vengono dalla stessa funzione: costruire l'input una volta e passarlo a entrambi i moduli.

- [ ] **Passo 6: aggiornare il docblock di `movimenti.ts`**

Il commento alle righe 125-155 dichiara la divergenza come «una domanda per chi possiede quel report». La domanda ha una risposta: sostituire quel paragrafo con la regola («la testata tiene il resto, in tutti e tre i moduli») e la data della decisione.

- [ ] **Passo 7: commit**

```bash
git add src/lib/report/ src/lib/cashflow/movimenti.ts
git commit -m "fix(report): il conto economico non fa più sparire il residuo di testata

Stesso movimento, due report, due numeri: un bonifico da 2.000 che
saldava una fattura da 1.222 valeva 1.222 nel conto economico e 2.000
nel cash flow. Vince la semantica di saldi.ts. Finché la suddivisione
parziale era un caso di bordo la differenza era rimandabile; con
l'attribuzione totale vincolata al documento e non al movimento, è la
normalità."
```

**Fine della fase A.** Rilasciabile: `nvm use 22 && npm run build` deve chiudere con exit 0 — controllarlo con `echo $?`, senza pipe.

---

## FASE B — La selezione delle righe

### Task 4: Bollo e arrotondamento diventano righe imputabili

Senza di loro la somma delle righe non arriva mai al totale del documento, e il vincolo «tutto o niente» sarebbe insoddisfacibile per costruzione.

**Files:**
- Create: `src/lib/sdi/righe-di-sistema.ts`
- Create: `src/lib/sdi/__tests__/righe-di-sistema.test.ts`
- Modify: `src/app/api/invoices/[id]/righe-conti/route.ts` (schema zod riga 15-18, validazione righe 68-76, filtro conti riga 80-90)
- Modify: `src/lib/services/schedule-reconciliation-service.ts` (guardia di copertura, riga 161)

**Interfaces:**
- Produce: `LINEA_BOLLO = -1`, `LINEA_ARROTONDAMENTO = -2`
- Produce: `righeDiSistema(fattura: FatturaPA): Array<{ numeroLinea: number; descrizione: string; importo: number; aliquota: 0 }>`
- Produce: `CONTO_PROPOSTO_BOLLO = '30.01'`

- [ ] **Passo 1: scrivere il test che fallisce**

```ts
import { righeDiSistema, LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '../righe-di-sistema'

describe('righeDiSistema', () => {
  it('produce la riga del bollo quando la fattura lo riporta', () => {
    const righe = righeDiSistema({ datiBollo: { importoBollo: 2 } } as never)
    expect(righe).toEqual([
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, aliquota: 0 },
    ])
  })

  it('produce la riga dell\'arrotondamento, anche negativo', () => {
    const righe = righeDiSistema({ arrotondamento: -0.02 } as never)
    expect(righe).toEqual([
      { numeroLinea: LINEA_ARROTONDAMENTO, descrizione: 'Arrotondamento', importo: -0.02, aliquota: 0 },
    ])
  })

  it('non produce righe a zero: una riga da imputare che vale zero è rumore', () => {
    expect(righeDiSistema({ datiBollo: { importoBollo: 0 }, arrotondamento: 0 } as never)).toEqual([])
  })

  it('non produce nulla su una fattura senza bollo né arrotondamento', () => {
    expect(righeDiSistema({} as never)).toEqual([])
  })
})
```

- [ ] **Passo 2: eseguirlo e vederlo fallire**

```bash
nvm use 22 && npx vitest run src/lib/sdi/__tests__/righe-di-sistema.test.ts
```

- [ ] **Passo 3: scrivere il modulo**

```ts
import type { FatturaPA } from './types'

/**
 * Numeri di linea riservati alle righe che non stanno nell'XML.
 *
 * Negativi di proposito: `DettaglioLinee/NumeroLinea` in FatturaPA è un intero
 * positivo, quindi lo spazio negativo non può collidere con nessuna riga vera,
 * e una riga di sistema resta riconoscibile a colpo d'occhio anche in una
 * query fatta a mano sul database.
 */
export const LINEA_BOLLO = -1
export const LINEA_ARROTONDAMENTO = -2

/** Il conto su cui il bollo nasce proposto: 30.01 — Imposta di bollo. */
export const CONTO_PROPOSTO_BOLLO = '30.01'

export interface RigaDiSistema {
  numeroLinea: number
  descrizione: string
  importo: number
  /** Sempre 0: né il bollo né l'arrotondamento portano IVA. */
  aliquota: 0
}

/**
 * Bollo virtuale e arrotondamento come righe imputabili.
 *
 * Stanno fuori da `DettaglioLinee` ma dentro il totale del documento: senza di
 * loro la somma delle righe non arriva mai al totale, e la regola «o si
 * attribuisce tutto o non si divide» non sarebbe mai soddisfacibile su una
 * fattura che porta il bollo.
 *
 * L'arrotondamento può essere negativo, ed è giusto che lo sia: è la differenza
 * fra la somma delle righe e quanto il fornitore ha davvero chiesto.
 */
export function righeDiSistema(fattura: FatturaPA): RigaDiSistema[] {
  const righe: RigaDiSistema[] = []

  const bollo = fattura.datiBollo?.importoBollo
  if (bollo !== undefined && bollo !== 0) {
    righe.push({ numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: bollo, aliquota: 0 })
  }

  const arrotondamento = fattura.arrotondamento
  if (arrotondamento !== undefined && arrotondamento !== 0) {
    righe.push({
      numeroLinea: LINEA_ARROTONDAMENTO,
      descrizione: 'Arrotondamento',
      importo: arrotondamento,
      aliquota: 0,
    })
  }

  return righe
}
```

- [ ] **Passo 4: far accettare le righe di sistema alla route**

In `src/app/api/invoices/[id]/righe-conti/route.ts`:

- lo schema zod (riga 16) usa `.int().positive()`: sostituire con `.int()` e una validazione esplicita che il numero sia positivo **oppure** uno dei due riservati;
- la validazione contro `righeXml` (righe 68-76) deve cercare anche fra `righeDiSistema(fattura)`;
- il filtro `type: 'COSTO'` (riga 84) diventa `type: { in: ['COSTO', 'PATRIMONIALE'] }`, e il messaggio d'errore va aggiornato di conseguenza.

Il commento sul perché il filtro esiste va conservato e integrato: il motivo (non inquinare la memoria fornitore-prodotto imputando a un conto RICAVO) resta valido, cambia solo l'insieme ammesso.

- [ ] **Passo 5: estendere la guardia di copertura**

In `schedule-reconciliation-service.ts` la guardia di riga 161 confronta `imputazioni.length` con `invoice.lineItems.length`. Deve confrontare con `lineItems.length + righeDiSistema(fattura).length`. Serve l'XML: la funzione oggi legge solo `lineItems`, va estesa la `select` a `xmlContent` e fatto un `parseFatturaPA`.

> Se il parse dell'XML in questo punto risulta costoso o fragile, l'alternativa è persistere il conteggio delle righe di sistema all'import. Segnalarlo nel report invece di deciderlo da soli.

- [ ] **Passo 6: test della route**

Aggiungere in `src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts`: imputazione della riga `-1` accettata su una fattura col bollo; imputazione della riga `-1` **rifiutata** su una fattura senza bollo; imputazione a un conto `PATRIMONIALE` accettata; a un conto `RICAVO` rifiutata.

- [ ] **Passo 7: eseguire i test e committare**

```bash
nvm use 22 && npx vitest run src/lib/sdi/ src/app/api/invoices/
git add src/lib/sdi/righe-di-sistema.ts src/lib/sdi/__tests__/ src/app/api/invoices/ src/lib/services/schedule-reconciliation-service.ts
git commit -m "feat(fatture): bollo e arrotondamento sono righe imputabili

Stanno fuori da DettaglioLinee ma dentro il totale: senza di loro la
somma delle righe non arriva mai al totale del documento e la regola
'o tutto o niente' non sarebbe soddisfacibile. Numeri di linea negativi
riservati, che in FatturaPA non possono collidere con niente."
```

---

### Task 5: Una riga divisibile fra più conti

**Files:**
- Modify: `prisma/schema.prisma` (modello `InvoiceLineAccount`, righe 1650-1674)
- Create: `prisma/migrations/20260813000001_riga_progressivo/migration.sql`
- Modify: `src/app/api/invoices/[id]/righe-conti/route.ts`
- Test: `src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts`

**Interfaces:**
- Produce: `InvoiceLineAccount.progressivo: number` (default 0), chiave unica `[invoiceId, numeroLinea, progressivo]`.

- [ ] **Passo 1: il vincolo che oggi lo vieta**

`@@unique([invoiceId, numeroLinea])` rende impossibili due imputazioni sulla stessa riga. Scrivere prima un test che lo dimostra (due `create` sulla stessa riga → violazione di unicità), così il vincolo nuovo ha un guardiano.

- [ ] **Passo 2: schema e migrazione**

```prisma
  /// Progressivo della quota dentro la stessa riga di fattura: 0 quando la
  /// riga va tutta su un conto solo, 0..n quando il fornitore ha accorpato
  /// voci diverse in una riga e vanno separate.
  progressivo    Int       @default(0)
```

e la chiave: `@@unique([invoiceId, numeroLinea, progressivo])`.

```sql
-- invoice_line_accounts: una riga di fattura può essere divisa fra più conti.
--
-- Il vincolo precedente, unique(invoice_id, numero_linea), vietava per
-- costruzione il caso del fornitore che accorpa voci diverse in una riga sola:
-- 100 € di "detersivi" che sono 60 di detersivi e 40 di tovaglioli. Il
-- progressivo apre quel caso senza aprire i duplicati.
--
-- Default 0: le righe esistenti sono tutte quote uniche della loro linea, e
-- restano valide sotto il vincolo nuovo senza backfill.
ALTER TABLE "invoice_line_accounts" ADD COLUMN "progressivo" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "invoice_line_accounts_invoice_id_numero_linea_key";
CREATE UNIQUE INDEX "invoice_line_accounts_invoice_id_numero_linea_progressivo_key"
  ON "invoice_line_accounts" ("invoice_id", "numero_linea", "progressivo");
```

> Verificare il nome reale dell'indice prima di eseguire il DROP:
> `\d invoice_line_accounts` in psql sul database locale. Prisma non garantisce il nome che ci si aspetta.

- [ ] **Passo 3: la route accetta più quote per riga**

Il payload di una riga diventa `{ numeroLinea, progressivo?, accountId, importo? }`. Regola da far rispettare al server, non solo al client: **la somma delle quote di una riga deve fare l'importo della riga**, con `TOLLERANZA_IMPORTI` (0,005 €) da `src/lib/scadenzario/stato-schedule.ts`. Una riga divisa che non quadra è un 400, non un salvataggio parziale.

- [ ] **Passo 4: una riga divisa NON alimenta la memoria del fornitore**

La route chiama `alimentaMemoriaFornitore` a riga 131 per ogni imputazione manuale: è la memoria «il pane di questo fornitore va su questo conto», che alimenta le proposte future.

Una **riga divisa va esclusa da quella chiamata**. La memoria è utile perché è generale; una divisione è specifica di quella fattura — «questi 100 € di detersivi erano 60 di detersivi e 40 di tovaglioli» non è una regola sul prodotto, è un fatto su un documento. Insegnarla produrrebbe proposte sbagliate su tutte le fatture successive dello stesso fornitore, e peggio: proposte sbagliate che sembrano apprese.

Condizione: si alimenta la memoria solo quando la riga ha **una sola** quota (`progressivo` unico e uguale a 0). Test dedicato: imputare una riga divisa e verificare che `SupplierProductAccount` non cambi.

- [ ] **Passo 5: test**

Divisione 60/40 su una riga da 100 accettata; divisione 60/30 rifiutata con un messaggio che dice quanto manca; la memoria non alimentata su riga divisa (passo 4); la somma dei pesi per conto (task 2) resta corretta su una riga divisa — `calcolaPesiConIva` somma già per conto, quindi va verificato che **entrambe le quote ricevano l'aliquota della riga madre**, non un'aliquota a testa.

- [ ] **Passo 6: eseguire e committare.**

---

### Task 6: La nota di credito entra nel calcolo

**Files:**
- Modify: `prisma/schema.prisma` (`ElectronicInvoice`)
- Create: `prisma/migrations/20260813000002_nota_credito_rettifica/migration.sql`
- Modify: `src/app/api/invoices/route.ts` (dopo la creazione, risoluzione del collegamento)
- Modify: `src/lib/services/schedule-reconciliation-service.ts`
- Test: unità sul calcolo dei pesi, integrazione sulla riconciliazione

**Interfaces:**
- Produce: `ElectronicInvoice.rettificaInvoiceId: string | null`, autorelazione con `rettifiche` sul lato opposto.

- [ ] **Passo 1: il test che fallisce**

```ts
it('sottrae le righe della nota di credito dai pesi della fattura rettificata', () => {
  // Fattura: alimentari 1.000 @10%, detersivi 100 @22%. Nota di credito:
  // i detersivi resi. Pagamento di 1.100.
  const pesi = calcolaPesiConIva([
    { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
    { accountId: 'pulizia', imponibile: 100, aliquota: 22 },
    { accountId: 'pulizia', imponibile: -100, aliquota: 22 },
  ])

  expect(pesi).toEqual([{ accountId: 'alimentari', importo: 1100, iva: 100 }])
})
```

> `calcolaPesiConIva` scarta già i totali non positivi: la riga della pulizia si azzera e sparisce da sé. La sottrazione non richiede una funzione nuova, richiede di **passarle le righe della nota col segno meno**.

- [ ] **Passo 2: schema, migrazione, risoluzione all'import**

Alla creazione di una fattura con `documentType` in `TD04/TD05/TD08/TD09`, leggere `datiEstesi.references.datiFattureCollegate` e cercare la fattura dello stesso fornitore (`supplierVat`) con quel numero. Trovata: valorizzare `rettificaInvoiceId`. Non trovata: lasciare `null` e registrare un `logger.info` — la fattura rettificata potrebbe non essere ancora stata importata, e non è un errore.

- [ ] **Passo 3: le guardie**

Nel calcolo dei pesi, prima di sottrarre:
- **nota di credito non imputata per intero → astenersi** dall'intera ereditarietà, con `logger.info`. Sottrarne una parte darebbe un risultato peggiore di non sottrarre nulla, perché sembrerebbe corretto;
- **peso risultante negativo** (nota più grande della riga) → astenersi, con `logger.warn`. È un caso da guardare, non da indovinare.

- [ ] **Passo 4: test d'integrazione** sullo scenario completo — fattura, nota di credito, pagamento netto — con l'atteso 1.100 / 0.

- [ ] **Passo 5: eseguire e committare.**

---

### Task 7: Rilevare la divergenza e riallineare

**Files:**
- Create: `src/lib/invoices/riallineamento.ts`
- Create: `src/lib/invoices/__tests__/riallineamento.itest.ts`
- Create: `src/app/api/prima-nota/[id]/riallinea/route.ts`

**Interfaces:**
- Produce: `imputazioniDivergenti(journalEntryId: string): Promise<{ divergente: boolean; invoiceId: string | null; modificataIl: Date | null }>`
- Produce: `riallineaFette(tx, journalEntryId, userId): Promise<number>`

- [ ] **Passo 1: la rilevazione**

Una fetta `ereditata` è divergente quando esiste una `InvoiceLineAccount` della fattura collegata (attraverso `reconciliationId` → scadenza → fattura) con `updatedAt` posteriore al `createdAt` della fetta. Test d'integrazione: creare fette, modificare un'imputazione, verificare che la divergenza compaia; verificare che **non** compaia se l'imputazione non è stata toccata.

- [ ] **Passo 2: il riallineamento**

Cancella le fette `ereditata` di quella riconciliazione e le rigenera con la stessa funzione della task 2 — **non** una copia della logica: se serve, estrarre la parte riusabile da `ereditaFetteDaFattura`. Le fette `manuale` non si toccano, coerentemente con la regola che vincono sempre. Registrare a audit con utente e data.

- [ ] **Passo 3: la route**, `POST`, con lo stesso controllo di ruolo delle altre rotte di prima nota. Rispondere 409 se non c'è divergenza: riallineare qualcosa che è già allineato deve essere un errore esplicito, non un no-op silenzioso.

- [ ] **Passo 4: eseguire e committare.**

---

### Task 8: L'interfaccia — righe di sistema, contatore, tipi di conto

**Files:**
- Modify: `src/components/invoices/InvoiceDetailSections.tsx` (`LineItemsTable`, righe 303-450)
- Modify: `src/components/invoices/InvoiceDetail.tsx` (payload di `righe-conti`, righe 146-152)
- Test: `src/components/invoices/__tests__/InvoiceDetailSections.test.tsx`

> **Nota per chi esegue le task 8 e 9.** Qui non trovi il codice pronto come nella fase A, e non è una dimenticanza: `LineItemsTable` è una tabella di 150 righe con una struttura sua, e inventarne il markup senza averla letta produrrebbe codice da riscrivere. **Leggi il componente per intero prima di toccarlo.** Quello che segue sono i criteri di accettazione: sono vincolanti, la forma con cui li raggiungi no.

- [ ] **Passo 1: le righe di sistema in tabella** — stessa `LineItemsTable`, distinte da un'icona, importo non modificabile, tendina del conto attiva. Il bollo arriva già proposto su `30.01`. Provengono da `righeDiSistema()` (task 4): **non ricalcolarle nel componente**, una sola definizione per back end e front end.

  *Accettazione:* una fattura con bollo mostra una riga in più di `dettaglioLinee.length`; una senza bollo né arrotondamento ne mostra esattamente `dettaglioLinee.length`; il conto della riga di sistema si salva e si rilegge.

- [ ] **Passo 2: il contatore di copertura** — riga di chiusura della tabella: `Attribuito 1.224,00 / 1.224,00 ✓ completa`, oppure `Attribuito 1.102,00 / 1.224,00 — manca la riga 2`. Il totale di riferimento è quello del documento, righe di sistema comprese.

  *Accettazione:* con tutte le righe imputate lo stato è «completa»; togliendone una compare l'importo mancante **e il numero della riga**; il contatore usa `formatCurrency`, non una formattazione propria.

- [ ] **Passo 3: `types={['COSTO', 'PATRIMONIALE']}`** alla riga 427. Un frigorifero in fattura è un cespite, non un costo, e oggi non è imputabile.

  *Accettazione:* un conto `PATRIMONIALE` compare nella tendina e si salva; un conto `RICAVO` non compare.

- [ ] **Passo 4: test** su ciascuno dei tre criteri, poi commit.

---

### Task 9: L'interfaccia — la riga che si divide

Vale la stessa nota della task 8: leggere il componente prima, i criteri sotto sono vincolanti.

**Files:**
- Create: `src/components/invoices/RigaDivisibile.tsx`
- Modify: `src/components/invoices/InvoiceDetailSections.tsx`

- [ ] **Passo 1: la riga si apre sul posto.** Il pulsante `÷` sostituisce la tendina con righe figlie dentro la stessa tabella. Restare nella tabella è il requisito: si decide guardando le altre righe della fattura, non una finestra che le copre.

  *Accettazione:* premendo `÷` compaiono due righe figlie; ognuna ha importo e conto; la riga madre mostra il proprio totale e non più una tendina.

- [ ] **Passo 2: il vincolo si vede mentre si compila.** La somma delle figlie deve fare l'importo della riga madre, e lo scarto è visibile **prima** di salvare, non dopo.

  *Accettazione:* con 60 + 30 su una riga da 100 il salvataggio è disabilitato e lo scarto di 10 è a schermo; portandolo a 60 + 40 il salvataggio si abilita.

- [ ] **Passo 3: il rifiuto del server si vede.** Il 400 della task 5 su una somma che non quadra va mostrato all'utente, non inghiottito in un log. È la rete per il caso in cui il controllo lato client venga aggirato o sbagli.

  *Accettazione:* simulando una risposta 400, il messaggio del server compare a schermo.

- [ ] **Passo 4: test, poi commit.**

---

## Chiusura

- [ ] `nvm use 22 && npm run typecheck:test` — exit 0
- [ ] `nvm use 22 && npx tsc --noEmit` — exit 0
- [ ] `nvm use 22 && npm run test:run` — almeno 1417 test verdi
- [ ] `nvm use 22 && TEST_DB_SUFFIX=<suffisso> npm run test:integration` — almeno 405 verdi
- [ ] `nvm use 22 && npm run build` — exit 0, **verificato con `echo $?`, senza pipe**: un import client→prisma rompe il bundle e nessuna revisione del diff può vederlo
- [ ] Guardare la pagina della fattura con occhi umani, su una fattura vera ad aliquote miste

## Cosa questo piano NON fa

- **Il residuo di scadenzario della nota di credito.** Paghi 1.100 su una scadenza di 1.222 e restano 122 € aperti a scadere. Esiste già oggi, non peggiora qui, e va chiuso separatamente.
- **La propagazione automatica** delle imputazioni sulle fette già create. È stata scartata: un mese chiuso non si riscrive da solo.
- **Le scadenze negative** per le note di credito. Scartate a favore della sottrazione dai pesi, che non tocca lo scadenzario.

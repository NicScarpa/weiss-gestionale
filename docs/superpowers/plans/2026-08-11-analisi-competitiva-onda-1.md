# Analisi competitiva — Onda 1: correttezza e leggibilità della cassa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare in produzione i sedici accorgimenti a effort S emersi
dall'analisi dei quattro concorrenti, più l'unico intervento di correttezza che
non richiede migrazioni: la fonte unica del previsionale.

**Architecture:** Nessuna funzionalità nuova. Ogni task prende un dato che il
gestionale **già calcola** e lo rende leggibile, oppure toglie un modo di
sbagliare. Tre task creano moduli puri e testabili in `src/lib/`
(`formatters`, `previsionale/proietta`, `reconciliation/schedule-matcher`); i
restanti tredici toccano un solo componente ciascuno. Nessuna migrazione Prisma,
nessuna colonna nuova.

**Tech Stack:** Next.js App Router · Prisma 7 · TypeScript · Vitest (`jsdom`,
`globals: true`, alias `@` → `src/`) · shadcn/ui · Recharts · Tailwind.

## Global Constraints

- **Node 22 obbligatorio.** Ogni comando `npm`/`npx`/`node` va preceduto da
  `nvm use 22 &&` **nella stessa riga di shell**. Ogni invocazione di Bash parte
  da una shell nuova: `nvm use 22` dato prima non vale per il comando dopo.
- **Lingua: italiano** per rotte, identificatori di dominio, commenti e testo
  dell'interfaccia. Le rotte nuove seguono `src/CLAUDE.md`.
- **Importi**: mai `Float`, mai `number` nei passaggi intermedi. Si usa
  `src/lib/money.ts` (`money()`, `toApi()`, `toDb()`).
- **Nessuna nuova rotta senza consumer.** Se una route non è raggiungibile dalla
  UI a fine task, il task non è finito (`src/CLAUDE.md`).
- **Autorizzazione**: ogni route chiama `auth()`; le route finanziarie richiedono
  ruolo `admin` o `manager`.
- **Sede**: sempre `getVenueId()` / `getVenue()` da `src/lib/venue.ts`.
- **Cancellazioni**: `deletedAt`, mai `delete()`.
- **Test**: `nvm use 22 && npm test -- --run <path>` per i puri;
  `nvm use 22 && npm run test:integration` per gli `.itest.ts`.
- **Commit**: uno per task, messaggio in italiano, prefisso convenzionale
  (`feat:`, `fix:`, `refactor:`, `test:`).
- Ogni task cita l'ID della matrice (`docs/analisi-competitiva/02-matrice-5vie.md`)
  nel messaggio di commit, così la tracciabilità verso l'analisi resta.

---

## Come questo piano si colloca

L'analisi ha prodotto 70 voci di backlog. Questo piano ne copre **17**: le 16 a
effort S più `PRV-03`. Gli altri sottosistemi hanno bisogno di piani propri
perché toccano lo schema o introducono modelli nuovi:

| Piano | Contenuto | Perché separato |
|---|---|---|
| **Onda 1** (questo) | 16 quick win + fonte unica del previsionale | nessuna migrazione |
| Onda 2 — Ciclo POS | `RET-04` `RET-05` `RET-06` `RET-08` | due modelli nuovi, job di generazione |
| Onda 3 — Conto bancario | `BNK-03` `BNK-02` `BNK-05` | migrazione su dati di produzione |
| Onda 4 — Avvisi | `ALR-03` `ALR-01` `RPT-07` | cron nuovo, enum di notifica |
| Onda 5 — Scostamento | `SCS-01` `SCS-02` `SCS-03` | dipende da Onda 1 task 3-4 |
| Onda 6 — Apprendimento | `MOV-06` `CLS-12` `DOC-11` `DOC-12` | colonne nuove |

---

## File Structure

**Creati**

| File | Responsabilità |
|---|---|
| `src/lib/previsionale/proietta.ts` | Funzione **pura** di proiezione: riceve movimenti, scadenze e ricorrenti già letti, applica la gerarchia delle fonti, restituisce la serie giornaliera. Nessun accesso al database. |
| `src/lib/previsionale/leggi.ts` | Le letture Prisma che alimentano `proietta`. Separata perché è l'unica parte non testabile senza database. |
| `src/lib/previsionale/__tests__/proietta.test.ts` | Test della gerarchia e del non-doppio-conteggio. |
| `src/lib/previsionale/giudizio.ts` | Funzione pura che traduce la serie proiettata in una frase italiana. |
| `src/lib/previsionale/__tests__/giudizio.test.ts` | Test delle soglie del giudizio. |

**Modificati** (uno per task, elencati nei task)

`src/lib/formatters.ts` · `src/lib/reconciliation/schedule-matcher.ts` ·
`src/lib/scadenzario/stima-data-attesa.ts` · le tre rotte previsionali · nove
componenti.

---

## Task 1 — Formattazione numerica condivisa per i CSV

`RPT-04` + `RPT-10` · impatto 3

**Contesto per chi implementa.** `src/app/api/scadenzario/export/route.ts` scrive
gli importi con `.toFixed(2)`, cioè col punto decimale, mentre il file usa `;`
come separatore di campo. Su Excel italiano quei valori arrivano come **testo** e
non si sommano. `src/app/api/prima-nota/export/route.ts` fa la cosa giusta, ma
con una funzione privata definita in fondo al file. Il difetto è un'incoerenza
fra due rotte, e la cura è una funzione sola.

**Files:**
- Modify: `src/lib/formatters.ts`
- Modify: `src/lib/__tests__/formatters.test.ts`
- Modify: `src/app/api/scadenzario/export/route.ts:68-88`
- Modify: `src/app/api/prima-nota/export/route.ts:274-308`

**Interfaces:**
- Produces: `formatNumeroCsv(value: number | string | null | undefined): string`
  — restituisce `''` per assente, altrimenti l'italiano con due decimali e
  raggruppamento delle migliaia (`1.234,50`).

- [ ] **Step 1: Scrivi il test che fallisce**

In `src/lib/__tests__/formatters.test.ts`, in fondo:

```ts
import { formatNumeroCsv } from '../formatters'

describe('formatNumeroCsv', () => {
  it('usa la virgola decimale, che è ciò che Excel italiano si aspetta', () => {
    expect(formatNumeroCsv(1234.5)).toBe('1234,50')
    expect(formatNumeroCsv(0.05)).toBe('0,05')
  })

  it('NON raggruppa le migliaia: in una cella il punto è ambiguo fra locali diversi', () => {
    expect(formatNumeroCsv(1234567.89)).toBe('1234567,89')
  })

  it('tiene sempre due decimali', () => {
    expect(formatNumeroCsv(100)).toBe('100,00')
  })

  it('accetta le stringhe, che è la forma in cui gli importi arrivano da Prisma', () => {
    expect(formatNumeroCsv('1234.5')).toBe('1234,50')
  })

  it('rende la cella vuota, non uno zero, quando il valore manca', () => {
    expect(formatNumeroCsv(null)).toBe('')
    expect(formatNumeroCsv(undefined)).toBe('')
    expect(formatNumeroCsv('')).toBe('')
  })

  it('mantiene il segno negativo', () => {
    expect(formatNumeroCsv(-1234.5)).toBe('-1234,50')
  })
})
```

**Perché senza raggruppamento**, ed è una correzione alla prima stesura di questo
piano: `formatCurrency` raggruppa (e deve, perché si legge a schermo), ma in una
cella di CSV il punto delle migliaia è ambiguo — è il separatore decimale in
locale anglosassone, e basta che il file passi da uno strumento configurato
diversamente perché «1.234,50» diventi spazzatura. La virgola decimale da sola
è ciò che serve a Excel italiano, e non introduce ambiguità. Questo rende
l'export della prima nota **leggermente diverso** da prima (`toLocaleString`
raggruppava dalle cinque cifre in su): la differenza è voluta e i test la
fissano.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/formatters.test.ts
```

Atteso: FAIL, `formatNumeroCsv is not a function`.

- [ ] **Step 3: Implementa**

In `src/lib/formatters.ts`, dopo `formatCurrencyPdf`:

```ts
/**
 * Importo per una cella CSV: `1.234,50`, senza simbolo di valuta.
 *
 * Esiste separata da `formatCurrency` perché un CSV non vuole il simbolo, e
 * separata da `.toFixed(2)` perché quello scrive il punto decimale: su Excel
 * con impostazioni italiane un «1234.50» in un file separato da punto e virgola
 * arriva come testo e non si somma. È il difetto che l'export dello scadenzario
 * aveva e quello della prima nota no.
 *
 * Il valore assente diventa cella vuota, non zero: in un foglio di calcolo uno
 * zero si somma e un vuoto no, e sono due affermazioni diverse.
 */
export function formatNumeroCsv(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const numero = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(numero)) return ''
  return DECIMALE_CSV.format(numero)
}
```

e sopra, accanto agli altri formattatori del file:

```ts
// Come DECIMALE, ma senza raggruppamento: vedi il commento di formatNumeroCsv.
const DECIMALE_CSV = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})
```

- [ ] **Step 4: Esegui il test e verifica che passi**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/formatters.test.ts
```

Atteso: PASS.

- [ ] **Step 5: Usa la funzione nelle due rotte**

In `src/app/api/scadenzario/export/route.ts` aggiungi l'import
`import { formatNumeroCsv } from '@/lib/formatters'` e sostituisci le tre righe
di importo dentro `rows`:

```ts
      formatNumeroCsv(Number(s.importoTotale)),
      formatNumeroCsv(Number(s.importoPagato)),
      formatNumeroCsv(Number(s.importoTotale) - Number(s.importoPagato)),
```

In `src/app/api/prima-nota/export/route.ts`: importa `formatNumeroCsv`,
sostituisci le tre chiamate a `formatNumber(...)` con `formatNumeroCsv(...)` e
**cancella** la funzione locale `formatNumber` in fondo al file.

- [ ] **Step 6: Aggiungi la riga dei totali all'export dello scadenzario (`RPT-10`)**

In `src/app/api/scadenzario/export/route.ts`, subito prima della costruzione di
`csv`:

```ts
    // L'export vale quanto la schermata, non meno: chi lo apre deve trovarci
    // anche gli aggregati che la pagina mostra in testata.
    const totali = schedules.reduce(
      (acc, s) => {
        const totale = Number(s.importoTotale)
        const pagato = Number(s.importoPagato)
        return {
          totale: acc.totale + totale,
          pagato: acc.pagato + pagato,
          residuo: acc.residuo + (totale - pagato),
        }
      },
      { totale: 0, pagato: 0, residuo: 0 }
    )

    const rigaTotali = [
      `TOTALE (${schedules.length} scadenze)`,
      '', '',
      formatNumeroCsv(totali.totale),
      formatNumeroCsv(totali.pagato),
      formatNumeroCsv(totali.residuo),
      '', '', '', '', '', '', '', '',
    ]
```

e includila:

```ts
    const csv = [
      headers.join(';'),
      ...rows.map(r => r.join(';')),
      rigaTotali.join(';'),
    ].join('\n')
```

- [ ] **Step 7: Verifica manuale**

Avvia `nvm use 22 && npm run dev`, scarica l'export dello scadenzario, aprilo con
Excel o LibreOffice in locale italiano: gli importi devono essere allineati a
destra (cioè numeri) e sommabili, e l'ultima riga deve riportare i totali.

- [ ] **Step 8: Commit**

```bash
git add src/lib/formatters.ts src/lib/__tests__/formatters.test.ts \
        src/app/api/scadenzario/export/route.ts src/app/api/prima-nota/export/route.ts
git commit -m "fix(export): separatore decimale italiano e riga totali nel CSV [RPT-04, RPT-10]"
```

---

## Task 2 — Contatore delle scadenze pagate senza movimento

`SCD-08` · impatto **5** · la voce più urgente dell'analisi

**Contesto per chi implementa.** `POST /api/scadenzario/[id]/pagamenti` crea un
`SchedulePayment`, aggiorna `importoPagato` e ricalcola lo stato — e **non genera
alcun `JournalEntry`**. La scadenza esce dal previsionale (il saldo scalare somma
il residuo, che è andato a zero) e il denaro non compare mai nel consuntivo,
perché in prima nota non è successo niente. Il saldo di cassa non scende.

È un percorso legittimo — serve per ciò che non transita da un estratto conto —
ma senza un controllo non si distingue «pagata in contanti e registrata altrove»
da «qualcuno ha spuntato pagata per sbaglio».

**Files:**
- Modify: `src/app/api/scadenzario/summary/route.ts`
- Modify: `src/types/schedule.ts` (interfaccia `ScheduleSummary`)
- Modify: `src/app/api/scadenzario/route.ts` (nuovo filtro)
- Modify: `src/components/scadenzario/schedule-summary-cards.tsx`
- Modify: `src/app/(dashboard)/scadenzario/page.tsx`
- Test: `src/lib/scadenzario/__tests__/pagate-senza-movimento.itest.ts` (nuovo)

**Interfaces:**
- Produces: `ScheduleSummary.pagateSenzaMovimento: number` e
  `ScheduleSummary.pagateSenzaMovimentoImporto: number`
- Produces: parametro di query `pagateSenzaMovimento=true` su `GET /api/scadenzario`

- [ ] **Step 1: Scrivi il test di integrazione che fallisce**

Crea `src/lib/scadenzario/__tests__/pagate-senza-movimento.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaScadenza, creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET as GET_summary } from '@/app/api/scadenzario/summary/route'
import { POST as POST_pagamento } from '@/app/api/scadenzario/[id]/pagamenti/route'
import { POST as POST_riconciliazione } from '@/app/api/scadenzario/[id]/riconciliazioni/route'

/**
 * Il buco che questo test presidia: una scadenza si può dichiarare pagata
 * registrando un pagamento, senza che nessun movimento di prima nota esista.
 * La scadenza esce dal previsionale e il denaro non entra mai nel consuntivo.
 * Non è un errore da vietare — i contanti si pagano così — ma va contato.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

async function leggiSummary() {
  return callRoute<{
    pagateSenzaMovimento: number
    pagateSenzaMovimentoImporto: number
  }>(GET_summary, jsonRequest('/api/scadenzario/summary'), {})
}

describe('scadenze pagate senza movimento', () => {
  it('conta la scadenza saldata con un pagamento manuale', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await callRoute(
      POST_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti`, {
        method: 'POST',
        body: { importo: 100, dataPagamento: '2026-08-11' },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(1)
    expect(summary.pagateSenzaMovimentoImporto).toBe(100)
  })

  it('non conta la scadenza saldata da una riconciliazione', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })
    const movimento = await creaMovimento({ creditAmount: 100 })

    await callRoute(
      POST_riconciliazione,
      jsonRequest(`/api/scadenzario/${scadenza.id}/riconciliazioni`, {
        method: 'POST',
        body: { journalEntryId: movimento.id },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(0)
  })

  it('conta anche il pagamento parziale, per la sola quota pagata', async () => {
    const scadenza = await creaScadenza({ importoTotale: 100, tipo: 'passiva' })

    await callRoute(
      POST_pagamento,
      jsonRequest(`/api/scadenzario/${scadenza.id}/pagamenti`, {
        method: 'POST',
        body: { importo: 40, dataPagamento: '2026-08-11' },
      }),
      { id: scadenza.id }
    )

    const summary = await leggiSummary()
    expect(summary.pagateSenzaMovimento).toBe(1)
    expect(summary.pagateSenzaMovimentoImporto).toBe(40)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

```bash
nvm use 22 && npm run test:integration -- pagate-senza-movimento
```

Atteso: FAIL, `pagateSenzaMovimento` è `undefined`.

- [ ] **Step 3: Implementa il conteggio nella rotta summary**

In `src/app/api/scadenzario/summary/route.ts`, prima del `return`:

```ts
    // Scadenze su cui è stato registrato un pagamento senza che alcun movimento
    // di prima nota esista: il denaro risulta uscito dallo scadenzario e non è
    // mai entrato nel consuntivo. Sono spesso legittime (contanti, addebiti
    // registrati altrove), ma vanno viste — altrimenti il previsionale e il
    // saldo raccontano due storie diverse in silenzio.
    const senzaMovimento = await prisma.schedule.aggregate({
      where: {
        ...where,
        importoPagato: { gt: 0 },
        reconciliations: { none: { status: 'VERIFIED' } },
      },
      _count: true,
      _sum: { importoPagato: true },
    })
```

e nel corpo della risposta:

```ts
      pagateSenzaMovimento: senzaMovimento._count || 0,
      pagateSenzaMovimentoImporto: Number(senzaMovimento._sum.importoPagato || 0),
```

- [ ] **Step 4: Esegui e verifica che passi**

```bash
nvm use 22 && npm run test:integration -- pagate-senza-movimento
```

Atteso: PASS su tutti e tre i casi.

- [ ] **Step 5: Estendi il tipo e la card**

In `src/types/schedule.ts`, dentro `ScheduleSummary`:

```ts
  /** Scadenze con pagamenti registrati e nessun movimento di prima nota collegato. */
  pagateSenzaMovimento: number
  pagateSenzaMovimentoImporto: number
```

In `src/components/scadenzario/schedule-summary-cards.tsx`, aggiungi la quinta
card in fondo all'array `cards`, **resa solo quando il valore è maggiore di
zero** (una card a zero è rumore quotidiano):

```ts
    ...(summary.pagateSenzaMovimento > 0
      ? [{
          title: 'Pagate senza movimento',
          value: summary.pagateSenzaMovimento,
          amount: summary.pagateSenzaMovimentoImporto,
          icon: HelpCircle,
          color: 'text-slate-600',
          bgColor: 'bg-slate-50',
          description:
            'Pagamento registrato ma nessun movimento in prima nota: ' +
            'spesso è corretto (contanti, addebiti registrati altrove), ' +
            'ma queste uscite non compaiono nel saldo.',
        }]
      : []),
```

Importa `HelpCircle` da `lucide-react`.

- [ ] **Step 6: Rendi la card cliccabile e aggiungi il filtro**

In `src/app/api/scadenzario/route.ts`, dove si costruisce il `where`:

```ts
    if (searchParams.get('pagateSenzaMovimento') === 'true') {
      where.importoPagato = { gt: 0 }
      where.reconciliations = { none: { status: 'VERIFIED' } }
    }
```

In `src/app/(dashboard)/scadenzario/page.tsx`, passa alla card un `onClick` che
imposta il filtro e ricarica la lista con `pagateSenzaMovimento=true`.

- [ ] **Step 7: Verifica manuale**

Con il server dev: crea una scadenza, registra un pagamento manuale, ricarica lo
scadenzario. La card deve comparire con conteggio 1; il click deve filtrare la
lista su quella sola scadenza.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/scadenzario/summary/route.ts src/app/api/scadenzario/route.ts \
        src/types/schedule.ts src/components/scadenzario/schedule-summary-cards.tsx \
        "src/app/(dashboard)/scadenzario/page.tsx" \
        src/lib/scadenzario/__tests__/pagate-senza-movimento.itest.ts
git commit -m "feat(scadenzario): contatore delle scadenze pagate senza movimento [SCD-08]"
```

---

## Task 3 — Modulo puro di proiezione con gerarchia delle fonti

`PRV-03` + `PRV-04` · impatto **5** · il cuore dell'onda

**Contesto per chi implementa.** Esistono **due modelli disgiunti della stessa
cosa** — un'uscita che si ripete:

| Modello | Scritto da | Letto da |
|---|---|---|
| `RecurringExpense` | `/spese-ricorrenti` | **solo** `/api/dashboard/forecast` |
| `Recurrence` → genera `Schedule` | `/scadenzario/ricorrenze` | **solo** `/api/scadenzario/saldo-scalare` |

Nessun percorso converte l'uno nell'altro. L'affitto inserito in una pagina
sparisce dall'altra proiezione; inserito in entrambe viene contato due volte.

Questo task costruisce la **funzione pura** che arbitra. Non tocca ancora le
rotte: quello è il Task 4.

La gerarchia, presa da Agicap (*movimento reale > pagamento programmato >
ricorrenza stimata*):

| Priorità | Fonte | Regola |
|---|---|---|
| 1 | `movimento` | il denaro si è mosso: vince sempre |
| 2 | `scadenza` | vince sulla ricorrente che la descrive |
| 3 | `ricorrente` | proietta **solo** dove nessuna scadenza copre già quel flusso |
| 4 | `stima` | proiezione statistica (gli incassi da banco dedotti dallo storico chiusure): l'ultima a vincere, perché è l'unica che non descrive un impegno ma una media |

La quarta fonte serve al Task 4: il cruscotto proietta gli incassi da banco dalla
storia delle chiusure, e quella stima deve entrare nella stessa serie invece di
vivere in un calcolo parallelo — altrimenti si ricrea, in piccolo, proprio il
problema che questo modulo esiste per chiudere.

**Files:**
- Create: `src/lib/previsionale/proietta.ts`
- Create: `src/lib/previsionale/__tests__/proietta.test.ts`

**Interfaces:**
- Produces:

```ts
export type FontePrevisione = 'movimento' | 'scadenza' | 'ricorrente' | 'stima'

export interface FlussoPrevisto {
  giorno: string          // 'yyyy-MM-dd'
  importo: number         // positivo = entrata, negativo = uscita
  fonte: FontePrevisione
  descrizione: string
  /** Chiave di sovrapposizione: due flussi con la stessa chiave sono lo stesso denaro. */
  chiave?: string
}

export interface PuntoSerie {
  giorno: string
  saldo: number
  entrate: number
  uscite: number
  perFonte: Record<FontePrevisione, number>
}

export function proietta(input: {
  saldoIniziale: number
  dal: string
  al: string
  flussi: FlussoPrevisto[]
}): PuntoSerie[]
```

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `src/lib/previsionale/__tests__/proietta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { proietta, type FlussoPrevisto } from '../proietta'

/**
 * La funzione risponde a una domanda sola — quanto avrò, giorno per giorno — e
 * la parte difficile non è la somma: è decidere quale fonte vince quando due
 * descrivono lo stesso denaro.
 *
 * Il caso che ha motivato il modulo: l'affitto esiste come `RecurringExpense`
 * per la dashboard e come `Recurrence` → `Schedule` per lo scadenzario. Chi lo
 * inserisce in entrambe le pagine oggi lo vede contato due volte, e chi lo
 * inserisce in una sola non lo vede affatto nell'altra proiezione.
 */
describe('proietta', () => {
  const base = { saldoIniziale: 1000, dal: '2026-09-01', al: '2026-09-03' }

  it('accumula il saldo giorno per giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: 500, fonte: 'movimento', descrizione: 'Incasso' },
      { giorno: '2026-09-02', importo: -200, fonte: 'scadenza', descrizione: 'Fornitore' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie.map((p) => p.saldo)).toEqual([1500, 1300, 1300])
  })

  it('copre ogni giorno della finestra, anche quelli senza flussi', () => {
    const serie = proietta({ ...base, flussi: [] })

    expect(serie).toHaveLength(3)
    expect(serie.map((p) => p.giorno)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(serie.every((p) => p.saldo === 1000)).toBe(true)
  })

  it('scarta la ricorrente quando una scadenza copre la stessa chiave nello stesso giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'ricorrente', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto settembre', chiave: 'affitto' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(200)
    expect(serie[0].perFonte.ricorrente).toBe(0)
    expect(serie[0].perFonte.scadenza).toBe(-800)
  })

  it('scarta la scadenza quando un movimento copre la stessa chiave', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'movimento', descrizione: 'Bonifico affitto', chiave: 'affitto' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(200)
    expect(serie[0].perFonte.scadenza).toBe(0)
    expect(serie[0].perFonte.movimento).toBe(-800)
  })

  it('tiene entrambi i flussi quando le chiavi sono diverse', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'ricorrente', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -300, fonte: 'scadenza', descrizione: 'Utenze', chiave: 'utenze' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(-100)
  })

  it('tiene un flusso senza chiave: senza chiave non si può dichiarare una sovrapposizione', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -100, fonte: 'ricorrente', descrizione: 'Varie' },
      { giorno: '2026-09-01', importo: -100, fonte: 'scadenza', descrizione: 'Altro' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(800)
  })

  it('ignora i flussi fuori dalla finestra', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-08-31', importo: -999, fonte: 'scadenza', descrizione: 'Prima' },
      { giorno: '2026-09-04', importo: -999, fonte: 'scadenza', descrizione: 'Dopo' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie.every((p) => p.saldo === 1000)).toBe(true)
  })

  it('separa entrate e uscite sullo stesso giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: 500, fonte: 'movimento', descrizione: 'Incasso' },
      { giorno: '2026-09-01', importo: -200, fonte: 'movimento', descrizione: 'Spesa' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].entrate).toBe(500)
    expect(serie[0].uscite).toBe(200)
    expect(serie[0].saldo).toBe(1300)
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/previsionale/__tests__/proietta.test.ts
```

Atteso: FAIL, modulo inesistente.

- [ ] **Step 3: Implementa**

Crea `src/lib/previsionale/proietta.ts`:

```ts
import { money, toApi, type Money } from '@/lib/money'

/**
 * La proiezione del saldo nel tempo, in un posto solo.
 *
 * Prima di questo modulo la stessa domanda — quanti soldi avrò — aveva tre
 * risposte con tre basi diverse: `/api/dashboard/forecast` proiettava le spese
 * ricorrenti, `/api/scadenzario/saldo-scalare` le scadenze,
 * `/api/cashflow/projection` i movimenti già registrati. Nessuna delle tre
 * mostrava il quadro completo e nessuna dichiarava di non mostrarlo.
 *
 * A monte c'era una duplicazione di modello: `RecurringExpense` e `Recurrence`
 * descrivono entrambi un'uscita che si ripete, sono disgiunti, e nessun
 * percorso converte l'uno nell'altro. L'affitto inserito in una sola pagina
 * spariva dall'altra proiezione; inserito in entrambe veniva contato due volte.
 *
 * ## La gerarchia
 *
 * Quando due flussi descrivono **lo stesso denaro** — cioè portano la stessa
 * `chiave` nello stesso giorno — ne sopravvive uno solo, il più affidabile:
 *
 *     movimento registrato  >  scadenza aperta  >  ricorrente non scadenzata
 *
 * È la stessa gerarchia che Agicap applica spegnendo le ricorrenze nel breve
 * termine, «il periodo in cui le previsioni sono coperte da altre fonti».
 *
 * Un flusso **senza chiave** non viene mai scartato: senza chiave non si può
 * affermare che due flussi siano lo stesso denaro, e scartare per somiglianza
 * farebbe sparire uscite vere.
 *
 * La funzione è pura: le letture stanno in `./leggi.ts`.
 */

export type FontePrevisione = 'movimento' | 'scadenza' | 'ricorrente' | 'stima'

/** Affidabilità decrescente. L'indice più basso vince. */
const PRECEDENZA: FontePrevisione[] = ['movimento', 'scadenza', 'ricorrente', 'stima']

export interface FlussoPrevisto {
  /** Giorno civile italiano, 'yyyy-MM-dd'. */
  giorno: string
  /** Positivo = entrata, negativo = uscita. */
  importo: number
  fonte: FontePrevisione
  descrizione: string
  /**
   * Chiave di sovrapposizione: due flussi con la stessa chiave nello stesso
   * giorno sono lo stesso denaro visto da due fonti diverse. Assente quando la
   * sovrapposizione non è dimostrabile.
   */
  chiave?: string
}

export interface PuntoSerie {
  giorno: string
  saldo: number
  entrate: number
  uscite: number
  perFonte: Record<FontePrevisione, number>
}

function giorniDellaFinestra(dal: string, al: string): string[] {
  const giorni: string[] = []
  const cursore = new Date(`${dal}T00:00:00Z`)
  const fine = new Date(`${al}T00:00:00Z`)

  while (cursore <= fine) {
    giorni.push(cursore.toISOString().slice(0, 10))
    cursore.setUTCDate(cursore.getUTCDate() + 1)
  }

  return giorni
}

/**
 * Toglie i flussi che una fonte più affidabile già copre. Il confronto è per
 * (giorno, chiave): flussi senza chiave passano sempre.
 */
function risolviSovrapposizioni(flussi: FlussoPrevisto[]): FlussoPrevisto[] {
  const vincitore = new Map<string, FontePrevisione>()

  for (const flusso of flussi) {
    if (!flusso.chiave) continue
    const k = `${flusso.giorno}::${flusso.chiave}`
    const attuale = vincitore.get(k)

    if (
      attuale === undefined ||
      PRECEDENZA.indexOf(flusso.fonte) < PRECEDENZA.indexOf(attuale)
    ) {
      vincitore.set(k, flusso.fonte)
    }
  }

  return flussi.filter((flusso) => {
    if (!flusso.chiave) return true
    return vincitore.get(`${flusso.giorno}::${flusso.chiave}`) === flusso.fonte
  })
}

export function proietta(input: {
  saldoIniziale: number
  dal: string
  al: string
  flussi: FlussoPrevisto[]
}): PuntoSerie[] {
  const giorni = giorniDellaFinestra(input.dal, input.al)
  const dentroFinestra = new Set(giorni)

  const superstiti = risolviSovrapposizioni(
    input.flussi.filter((f) => dentroFinestra.has(f.giorno))
  )

  const perGiorno = new Map<string, FlussoPrevisto[]>()
  for (const flusso of superstiti) {
    const elenco = perGiorno.get(flusso.giorno) ?? []
    elenco.push(flusso)
    perGiorno.set(flusso.giorno, elenco)
  }

  let saldo: Money = money(input.saldoIniziale)
  const serie: PuntoSerie[] = []

  for (const giorno of giorni) {
    const delGiorno = perGiorno.get(giorno) ?? []

    let entrate = money(0)
    let uscite = money(0)
    const perFonte: Record<FontePrevisione, Money> = {
      movimento: money(0),
      scadenza: money(0),
      ricorrente: money(0),
      stima: money(0),
    }

    for (const flusso of delGiorno) {
      const importo = money(flusso.importo)
      if (flusso.importo >= 0) entrate = entrate.plus(importo)
      else uscite = uscite.plus(importo.abs())
      perFonte[flusso.fonte] = perFonte[flusso.fonte].plus(importo)
    }

    saldo = saldo.plus(entrate).minus(uscite)

    serie.push({
      giorno,
      saldo: toApi(saldo),
      entrate: toApi(entrate),
      uscite: toApi(uscite),
      perFonte: {
        movimento: toApi(perFonte.movimento),
        scadenza: toApi(perFonte.scadenza),
        ricorrente: toApi(perFonte.ricorrente),
        stima: toApi(perFonte.stima),
      },
    })
  }

  return serie
}
```

- [ ] **Step 4: Esegui e verifica che passi**

```bash
nvm use 22 && npm test -- --run src/lib/previsionale/__tests__/proietta.test.ts
```

Atteso: PASS su tutti e otto i casi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/previsionale/
git commit -m "feat(previsionale): modulo puro di proiezione con gerarchia delle fonti [PRV-03, PRV-04]"
```

---

## Task 4 — Le tre rotte previsionali consumano il modulo unico

`PRV-01` · impatto 4 · dipende dal Task 3

**Contesto per chi implementa.** Il Task 3 ha costruito l'arbitro; qui si
collegano le fonti reali e si fanno consumare le tre rotte. La parte delicata è
la **chiave di sovrapposizione**: è ciò che decide quando due flussi sono lo
stesso denaro.

Regole per la chiave, in ordine di robustezza:

1. Una `Schedule` generata da una `Recurrence` porta `chiave =
   'ricorrenza:' + recurrenceId` — è un legame esplicito nel database
   (`Schedule.recurrenceId`), quindi affidabile.
2. Una `RecurringExpense` porta `chiave = 'ricorrenza:' + <recurrenceId
   corrispondente>` se esiste, altrimenti `'spesa:' + id`. Non esistendo un
   legame, il confronto con le scadenze si fa su **nome normalizzato e importo**
   — ed è una euristica, quindi va **dichiarata nel codice** e mai estesa.
3. Un `JournalEntry` nato da una riconciliazione porta la chiave della scadenza
   che ha saldato.

**Files:**
- Create: `src/lib/previsionale/leggi.ts`
- Modify: `src/app/api/scadenzario/saldo-scalare/route.ts`
- Modify: `src/app/api/cashflow/projection/route.ts`
- Modify: `src/app/api/dashboard/forecast/route.ts`
- Test: `src/lib/previsionale/__tests__/leggi.itest.ts` (nuovo)

**Interfaces:**
- Consumes: `proietta`, `FlussoPrevisto`, `PuntoSerie` dal Task 3
- Produces:
  `leggiFlussi(venueId: string, dal: string, al: string): Promise<FlussoPrevisto[]>`
  e `serieProiettata(venueId: string, dal: string, al: string): Promise<PuntoSerie[]>`

- [ ] **Step 1: Scrivi il test di integrazione che fallisce**

Crea `src/lib/previsionale/__tests__/leggi.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { creaScadenza, creaRicorrenza } from '@/test/integration/fixtures/scadenzario'
import { getVenueId } from '@/lib/venue'
import { leggiFlussi } from '../leggi'

/**
 * Il test che conta è l'ultimo: la scadenza generata da una ricorrenza e la
 * ricorrenza stessa non devono produrre due flussi per lo stesso giorno.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

describe('leggiFlussi', () => {
  it('legge le scadenze aperte come flussi con segno corretto', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenze = flussi.filter((f) => f.fonte === 'scadenza')

    expect(scadenze).toHaveLength(1)
    expect(scadenze[0].importo).toBe(-300)
    expect(scadenze[0].giorno).toBe('2026-09-10')
  })

  it('usa la data attesa quando diverge dalla contrattuale', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      dataAttesa: new Date('2026-09-20'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')

    expect(flussi.find((f) => f.fonte === 'scadenza')?.giorno).toBe('2026-09-20')
  })

  it('la scadenza da ricorrenza porta la chiave della ricorrenza', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({ importo: 800, tipo: 'passiva' })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenza = flussi.find((f) => f.fonte === 'scadenza')

    expect(scadenza?.chiave).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  it('la scadenza generata batte la ricorrente sullo stesso giorno', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({
      importo: 800,
      tipo: 'passiva',
      giornoDelMese: 10,
    })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const del10 = flussi.filter((f) => f.giorno === '2026-09-10')

    // Entrambi i flussi esistono con la stessa chiave: sarà `proietta` a
    // scartarne uno. Qui si verifica che la chiave li leghi.
    const chiavi = new Set(del10.map((f) => f.chiave))
    expect(chiavi.size).toBe(1)
    expect([...chiavi][0]).toBe(`ricorrenza:${ricorrenza.id}`)
  })
})
```

`ScadenzaFixture` accetta già `recurrenceId`, **non** `dataAttesa`: aggiungi
`dataAttesa?: Date | null` all'interfaccia e passalo al `create` in
`src/test/integration/fixtures/scadenzario.ts`. È parte di questo step.
`RicorrenzaFixture` ha già `importo`, `tipo` e `giornoDelMese`: non va toccata.

- [ ] **Step 2: Esegui e verifica che fallisca**

```bash
nvm use 22 && npm run test:integration -- previsionale
```

Atteso: FAIL, `leggiFlussi` inesistente.

- [ ] **Step 3: Implementa le letture**

Crea `src/lib/previsionale/leggi.ts`. Deve:

1. leggere i `JournalEntry` non nascosti nella finestra, con
   `chiave = 'ricorrenza:' + recurrenceId` della scadenza riconciliata quando
   esiste, altrimenti nessuna chiave, e `fonte: 'movimento'`;
2. leggere le `Schedule` con `stato NOT IN ('annullata','pagata')` e
   `dataAttesa ?? dataScadenza` nella finestra — **lo stesso `OR` già usato in
   `saldo-scalare/route.ts:51-62`, da copiare tale e quale** — con importo
   `residuo = importoTotale − importoPagato`, segno negativo se `tipo === 'passiva'`,
   e `chiave = 'ricorrenza:' + recurrenceId` quando `recurrenceId` è valorizzato;
3. generare le occorrenze delle `RecurringExpense` attive con la stessa logica di
   `calculateExpectedExpenses` (`src/app/api/dashboard/forecast/route.ts:423-495`),
   **spostando quella funzione qui** invece di duplicarla, con
   `fonte: 'ricorrente'` e `chiave = 'spesa:' + id`;
4. generare le occorrenze delle `Recurrence` attive oltre l'ultima `Schedule`
   generata, con `chiave = 'ricorrenza:' + id`.

Esporre anche:

```ts
export async function serieProiettata(
  venueId: string,
  dal: string,
  al: string
): Promise<PuntoSerie[]> {
  const [saldi, flussi] = await Promise.all([
    saldiAlGiorno(venueId, giornoIndietro(dal, 1)),
    leggiFlussi(venueId, dal, al),
  ])

  return proietta({ saldoIniziale: saldi.totalAvailable, dal, al, flussi })
}
```

- [ ] **Step 4: Esegui e verifica che passi**

```bash
nvm use 22 && npm run test:integration -- previsionale
```

Atteso: PASS.

- [ ] **Step 5: Fai consumare il modulo alle tre rotte**

- `src/app/api/cashflow/projection/route.ts` — sostituisci il corpo con una
  chiamata a `serieProiettata`, mantenendo **identica** la forma della risposta
  (`PuntoProiezione[]` con `data`, `saldo`, `entrata`, `uscita`) per non rompere
  `CashFlowChart`.
- `src/app/api/scadenzario/saldo-scalare/route.ts` — `chartData` viene da
  `serieProiettata`; i totali (`pagamenti`, `incassi`, `scaduto`) restano come
  sono, perché rispondono a un'altra domanda.
- `src/app/api/dashboard/forecast/route.ts` — la parte più delicata delle tre.
  `calculateExpectedIncome` **resta** (lo storico delle chiusure è la fonte
  giusta per gli incassi da banco, e nessun'altra fonte li descrive), ma smette
  di vivere in un calcolo parallelo: i suoi valori diventano flussi con
  `fonte: 'stima'` e **nessuna chiave**, passati a `serieProiettata` insieme agli
  altri. `calculateExpectedExpenses` sparisce, assorbita da `leggiFlussi`.
  La struttura di `alerts` e `summary` non cambia: `minBalance`,
  `minBalanceDate` e `daysUntilLowBalance` si ricavano dalla serie restituita.

  **Perché nessuna chiave sulla stima**: una previsione di incasso da banco non
  descrive lo stesso denaro di una scadenza attiva né di un movimento, quindi
  non deve mai essere scartata per sovrapposizione. Darle una chiave la
  esporrebbe a sparire per un falso appaiamento.

  ⚠️ Il giorno **corrente e i passati** non devono ricevere flussi `stima`: lì i
  movimenti reali esistono già, e sommarci sopra una media raddoppierebbe
  l'incasso. La stima parte da domani.

- [ ] **Step 6: Verifica che nulla sia regredito**

```bash
nvm use 22 && npm test -- --run
nvm use 22 && npm run test:integration
nvm use 22 && npx tsc --noEmit
```

Atteso: tutto verde. Poi, con il server dev, confronta a occhio
`/cash-flow` e `/scadenzario` sulla stessa finestra: **le curve devono
coincidere**, ed è la prima volta.

- [ ] **Step 7: Commit**

```bash
git add src/lib/previsionale/ src/app/api/cashflow/projection/route.ts \
        src/app/api/scadenzario/saldo-scalare/route.ts \
        src/app/api/dashboard/forecast/route.ts \
        src/test/integration/fixtures/scadenzario.ts
git commit -m "refactor(previsionale): le tre rotte proiettano dalla stessa fonte [PRV-01]"
```

---

## Task 5 — Motivazioni in chiaro accanto al punteggio di match

`RIC-03` · impatto 4

**Contesto per chi implementa.** `calculateScheduleMatchScore` restituisce un
`number`; il pannello lo rende come badge percentuale e basta. Cash King mette
accanto al numero le frasi che lo giustificano — «Importo identico alla rata»,
«Unico match possibile» — e l'analisi lo definisce l'accorgimento più
trasferibile dell'intero prodotto: *«l'utente non deve fidarsi di un 72: legge
"importo identico, unico match possibile" e decide in un secondo.»*

I contributi esistono già tutti nel codice: si tratta di nominarli mentre si
sommano.

**Files:**
- Modify: `src/lib/reconciliation/schedule-matcher.ts`
- Modify: `src/lib/reconciliation/__tests__/schedule-matcher.test.ts`
- Modify: `src/components/scadenzario/schedule-reconciliation-panel.tsx`

**Interfaces:**
- Produces:

```ts
export interface EsitoMatch { score: number; motivazioni: string[] }
export function calculateScheduleMatchScore(
  entry: MatchableEntry, schedule: MatchableSchedule
): EsitoMatch
```
- `ScheduleMatchCandidate` guadagna `motivazioni: string[]`

- [ ] **Step 1: Scrivi i test che falliscono**

Aggiungi in `src/lib/reconciliation/__tests__/schedule-matcher.test.ts`:

```ts
describe('motivazioni del punteggio', () => {
  const scadenza = {
    id: 's1',
    tipo: 'passiva',
    dataScadenza: new Date('2026-09-10'),
    descrizione: 'Affitto settembre',
    importoTotale: 800,
    importoPagato: 0,
    numeroDocumento: 'FT-2026-0042',
    controparteNome: 'Immobiliare Rossi',
  }

  it('nomina l importo identico e la stessa data', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm1',
        date: new Date('2026-09-10'),
        description: 'Bonifico affitto',
        debitAmount: null,
        creditAmount: 800,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Importo identico')
    expect(esito.motivazioni).toContain('Stessa data')
  })

  it('nomina il numero documento quando compare nella causale', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm2',
        date: new Date('2026-09-10'),
        description: 'Pagamento FT 2026 0042',
        debitAmount: null,
        creditAmount: 800,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Numero documento nella causale')
  })

  it('nomina l acconto quando il movimento copre solo una parte', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm3',
        date: new Date('2026-09-10'),
        description: 'Acconto',
        debitAmount: null,
        creditAmount: 300,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.motivazioni).toContain('Acconto parziale')
  })

  it('non emette motivazioni quando il punteggio è zero', () => {
    const esito = calculateScheduleMatchScore(
      {
        id: 'm4',
        date: new Date('2026-09-10'),
        description: 'Incasso',
        debitAmount: 800,
        creditAmount: null,
        documentRef: null,
        counterpartName: null,
      },
      scadenza
    )

    expect(esito.score).toBe(0)
    expect(esito.motivazioni).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/reconciliation/__tests__/schedule-matcher.test.ts
```

Atteso: FAIL — la funzione restituisce un numero, `esito.motivazioni` è
`undefined`. **Anche i test esistenti falliranno**, ed è corretto: la firma
cambia.

- [ ] **Step 3: Implementa**

In `src/lib/reconciliation/schedule-matcher.ts`, cambia il tipo di ritorno e
accumula le frasi accanto ai punti. Il corpo resta quello che c'è: ogni ramo
guadagna una riga.

```ts
export interface EsitoMatch {
  score: number
  /** Le ragioni del punteggio, in italiano, nell'ordine in cui contribuiscono. */
  motivazioni: string[]
}

export function calculateScheduleMatchScore(
  entry: MatchableEntry,
  schedule: MatchableSchedule
): EsitoMatch {
  const importoEntry = importoMovimento(entry, schedule.tipo)
  if (importoEntry <= 0) return { score: 0, motivazioni: [] }

  const residuo = schedule.importoTotale - schedule.importoPagato
  if (residuo <= 0) return { score: 0, motivazioni: [] }

  let score = 0
  const motivazioni: string[] = []

  const diff = Math.abs(importoEntry - residuo)
  if (diff < 0.01) {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT
    motivazioni.push('Importo identico')
  } else if (diff <= 1) {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.9
    motivazioni.push('Importo quasi identico')
  } else if (importoEntry < residuo) {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.5 * (importoEntry / residuo)
    motivazioni.push('Acconto parziale')
  } else {
    score += SCHEDULE_MATCH_WEIGHTS.AMOUNT * 0.2
    motivazioni.push('Importo superiore al residuo')
  }

  const giorni = daysDifference(entry.date, schedule.dataScadenza)
  if (giorni === 0) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE
    motivazioni.push('Stessa data')
  } else if (giorni <= 3) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.9
    motivazioni.push('Entro tre giorni dalla scadenza')
  } else if (giorni <= 10) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.7
    motivazioni.push('Entro dieci giorni dalla scadenza')
  } else if (giorni <= 30) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.4
  } else if (giorni <= 60) {
    score += SCHEDULE_MATCH_WEIGHTS.DATE * 0.15
  }

  const testoScadenza = [schedule.descrizione, schedule.controparteNome]
    .filter(Boolean)
    .join(' ')
  const testoMovimento = [entry.description, entry.counterpartName]
    .filter(Boolean)
    .join(' ')
  const somiglianza = stringSimilarity(testoMovimento, testoScadenza)
  score += SCHEDULE_MATCH_WEIGHTS.DESCRIPTION * somiglianza
  if (somiglianza >= 0.6) motivazioni.push('Controparte compatibile')

  if (schedule.numeroDocumento) {
    const numero = schedule.numeroDocumento.toLowerCase().replace(/[^a-z0-9]/gi, '')
    const causale = entry.description.toLowerCase().replace(/[^a-z0-9]/gi, '')
    if (numero.length >= 3 && causale.includes(numero)) {
      score = Math.min(1, score + 0.15)
      motivazioni.push('Numero documento nella causale')
    }
  }

  return { score: Math.round(score * 100) / 100, motivazioni }
}
```

Aggiorna i due chiamati `findScheduleCandidates` e `findEntryCandidates`: usano
`esito.score` per filtrare e ordinare, e propagano `motivazioni` nel candidato.
Aggiungi in entrambi, **dopo** il filtro su `MINIMUM` e prima dello `slice`:

```ts
  // «Unico match possibile» non si può calcolare nella funzione pura: dipende
  // dall'insieme dei candidati, non dalla singola coppia.
  if (candidati.length === 1) {
    candidati[0].motivazioni.push('Unico match possibile')
  } else if (candidati.length > 1) {
    for (const c of candidati) {
      c.motivazioni.push(`${candidati.length} alternative`)
    }
  }
```

- [ ] **Step 4: Esegui e verifica che passi**

```bash
nvm use 22 && npm test -- --run src/lib/reconciliation/
```

Atteso: PASS, compresi i test preesistenti aggiornati alla nuova firma.

- [ ] **Step 5: Mostra le motivazioni nel pannello**

In `src/components/scadenzario/schedule-reconciliation-panel.tsx`, sotto il
badge del punteggio (riga ~192):

```tsx
{c.motivazioni?.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {c.motivazioni.map((m) => (
      <Badge key={m} variant="secondary" className="text-[10px] font-normal">
        {m}
      </Badge>
    ))}
  </div>
)}
```

Estendi il tipo del candidato nel componente con `motivazioni: string[]`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reconciliation/ src/components/scadenzario/schedule-reconciliation-panel.tsx
git commit -m "feat(riconciliazione): motivazioni in chiaro accanto al punteggio [RIC-03]"
```

---

## Task 6 — Pesi e soglie del punteggio dichiarati all'utente

`RIC-04` · impatto 3 · dipende dal Task 5

**Contesto per chi implementa.** `SCHEDULE_MATCH_WEIGHTS` e
`SCHEDULE_MATCH_THRESHOLDS` sono cablate nel codice e mai mostrate. Cash King
dichiara le regole **prima** di eseguire l'analisi, e l'analisi spiega perché:
*«trasforma "il software ha deciso" in "il software ha applicato la regola R4",
che è contestabile e quindi credibile.»*

**Files:**
- Modify: `src/components/scadenzario/schedule-reconciliation-panel.tsx`

**Interfaces:**
- Consumes: `SCHEDULE_MATCH_WEIGHTS`, `SCHEDULE_MATCH_THRESHOLDS` dal Task 5

- [ ] **Step 1: Aggiungi il pannello richiudibile**

Sopra la lista dei candidati:

```tsx
import {
  SCHEDULE_MATCH_WEIGHTS,
  SCHEDULE_MATCH_THRESHOLDS,
} from '@/lib/reconciliation/schedule-matcher'

const pct = (n: number) => `${Math.round(n * 100)}%`

// ...

<Collapsible>
  <CollapsibleTrigger className="text-xs text-muted-foreground hover:underline">
    Come funziona il punteggio
  </CollapsibleTrigger>
  <CollapsibleContent className="mt-2 rounded-md border p-3 text-xs text-muted-foreground space-y-1">
    <p>Il punteggio pesa tre fattori:</p>
    <ul className="ml-4 list-disc space-y-0.5">
      <li>
        <strong>Importo {pct(SCHEDULE_MATCH_WEIGHTS.AMOUNT)}</strong> — quanto il
        movimento copre il residuo della scadenza
      </li>
      <li>
        <strong>Data {pct(SCHEDULE_MATCH_WEIGHTS.DATE)}</strong> — quanto è vicino
        alla data attesa
      </li>
      <li>
        <strong>Descrizione {pct(SCHEDULE_MATCH_WEIGHTS.DESCRIPTION)}</strong> —
        somiglianza fra causale e controparte
      </li>
      <li>
        <strong>+15%</strong> se il numero documento compare nella causale
      </li>
    </ul>
    <p>
      Sopra il {pct(SCHEDULE_MATCH_THRESHOLDS.SUGGESTED)} il match è proposto come
      attendibile. Sotto il {pct(SCHEDULE_MATCH_THRESHOLDS.MINIMUM)} il candidato
      non viene mostrato.
    </p>
  </CollapsibleContent>
</Collapsible>
```

I valori sono **letti dalle costanti**, mai riscritti a mano: se domani i pesi
cambiano, il testo cambia con loro.

- [ ] **Step 2: Verifica manuale**

Server dev, apri il dettaglio di una scadenza con candidati: il pannello è chiuso
di default e, aperto, mostra 55% / 25% / 20% / 75% / 45%.

- [ ] **Step 3: Verifica che il testo segua le costanti**

Cambia temporaneamente `SCHEDULE_MATCH_WEIGHTS.AMOUNT` a `0.5`, ricarica, verifica
che il pannello dica 50%, **poi ripristina 0.55**.

- [ ] **Step 4: Commit**

```bash
git add src/components/scadenzario/schedule-reconciliation-panel.tsx
git commit -m "feat(riconciliazione): pesi e soglie del punteggio dichiarati all'utente [RIC-04]"
```

---

## Task 7 — Il mese corrente si spezza in scaduto e da saldare

`SCD-02` · impatto 4

**Contesto per chi implementa.** Le scadenze si raggruppano per mese: ad agosto,
«doveva essere pagata il 3» e «scade il 28» finiscono insieme, e sono due urgenze
diverse. Cash King le tiene su due righe distinte, e **non collassa i mesi
passati** in un unico «scaduto», così l'anzianità resta leggibile senza aprire un
report.

Il criterio di scaduto deve essere `dataAttesa ?? dataScadenza`, lo stesso di
`aging` e `saldo-scalare`: usare `dataScadenza` nuda produrrebbe un
raggruppamento incoerente col resto dell'applicazione.

**Files:**
- Modify: `src/app/(dashboard)/scadenzario/page.tsx`

- [ ] **Step 1: Cambia la chiave di raggruppamento**

Dove oggi si raggruppa per mese, sostituisci con:

```ts
/**
 * Chiave di raggruppamento della lista scadenze.
 *
 * Il mese corrente si spezza in due: ciò che è già in ritardo non è la stessa
 * cosa di ciò che scade fra due settimane, e metterli nello stesso secchio li
 * confonde proprio nel momento in cui la distinzione conta — l'inizio del mese.
 *
 * I mesi passati restano invece distinti fra loro e non si collassano in un
 * unico «scaduto»: l'anzianità del ritardo resta leggibile senza aprire il
 * report di aging.
 */
function chiaveGruppo(scadenza: Schedule, oggi: Date): string {
  const data = new Date(scadenza.dataAttesa ?? scadenza.dataScadenza)
  const mese = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
  const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`

  if (mese !== meseCorrente) return mese
  return data < oggi ? `${mese}:scaduto` : `${mese}:da-saldare`
}

function etichettaGruppo(chiave: string): string {
  const [mese, qualifica] = chiave.split(':')
  const [anno, m] = mese.split('-')
  const nome = new Date(Number(anno), Number(m) - 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  })
  const titolo = nome.charAt(0).toUpperCase() + nome.slice(1)

  if (qualifica === 'scaduto') return `${titolo} — Scaduto`
  if (qualifica === 'da-saldare') return `${titolo} — Da saldare`
  return titolo
}
```

`oggi` va normalizzato a mezzanotte (`setHours(0,0,0,0)`) prima del confronto.

- [ ] **Step 2: Verifica manuale**

Server dev, scadenzario. Nel mese corrente devono comparire due gruppi se
esistono scadenze di entrambi i tipi, uno solo altrimenti. I mesi passati e futuri
restano un gruppo ciascuno.

- [ ] **Step 3: Verifica che i totali quadrino**

La somma dei gruppi deve coincidere con il totale in testata. Se non coincide,
c'è una scadenza che non finisce in nessun gruppo — probabilmente per una data
nulla.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/scadenzario/page.tsx"
git commit -m "feat(scadenzario): il mese corrente separa scaduto e da saldare [SCD-02]"
```

---

## Task 8 — L'anzianità del ritardo dentro il badge

`SCD-04` · impatto 4

**Contesto per chi implementa.** Il badge dice «Scaduta»; quanto scaduta si scopre
solo in `/scadenzario/aging`, che è un'altra pagina. Trezy mette l'età dentro la
cella di stato («Scaduto +117g») e *«la lista diventa scorribile per urgenza senza
ordinarla»*.

**Files:**
- Modify: `src/components/scadenzario/schedule-status-badge.tsx`
- Modify: `src/app/(dashboard)/scadenzario/page.tsx`

**Interfaces:**
- Produces: `ScheduleStatusBadgeProps.giorniRitardo?: number`

- [ ] **Step 1: Aggiungi la prop al badge**

```tsx
interface ScheduleStatusBadgeProps {
  stato: ScheduleStatus
  showLabel?: boolean
  size?: 'sm' | 'default' | 'lg'
  /**
   * Giorni di ritardo, mostrati come suffisso. Portare l'anzianità dentro il
   * badge rende la lista scorribile per urgenza senza doverla ordinare, e
   * costa uno sguardo invece di un cambio di pagina.
   */
  giorniRitardo?: number
}
```

e nel corpo, dove si rende l'etichetta:

```tsx
  const etichetta =
    giorniRitardo && giorniRitardo > 0
      ? `${SCHEDULE_STATUS_LABELS[stato]} +${giorniRitardo}g`
      : SCHEDULE_STATUS_LABELS[stato]

  return (
    <Badge className={SCHEDULE_STATUS_COLORS[stato]} variant="outline">
      {etichetta}
    </Badge>
  )
```

La variante `showLabel={false}` (il pallino) resta invariata.

- [ ] **Step 2: Passa i giorni dalla lista**

In `src/app/(dashboard)/scadenzario/page.tsx`:

```tsx
function giorniDiRitardo(scadenza: Schedule, oggi: Date): number | undefined {
  const data = new Date(scadenza.dataAttesa ?? scadenza.dataScadenza)
  if (data >= oggi) return undefined
  return Math.floor((oggi.getTime() - data.getTime()) / 86_400_000)
}
```

e `<ScheduleStatusBadge stato={s.stato} giorniRitardo={giorniDiRitardo(s, oggi)} />`.

- [ ] **Step 3: Verifica manuale**

Una scadenza scaduta da sei giorni deve mostrare `Scaduta +6g`; una non scaduta,
il badge invariato.

- [ ] **Step 4: Commit**

```bash
git add src/components/scadenzario/schedule-status-badge.tsx "src/app/(dashboard)/scadenzario/page.tsx"
git commit -m "feat(scadenzario): anzianità del ritardo dentro il badge di stato [SCD-04]"
```

---

## Task 9 — Giudizio sintetico in linguaggio naturale

`KPI-02` · impatto 4

**Contesto per chi implementa.** La dashboard mostra numeri e alert tecnici;
nessuna frase risponde a «devo preoccuparmi?». Cash King traduce i numeri in due
giudizi («Nessuna tensione prevista», «Linea di Credito: non necessaria») e
l'analisi li chiama *«le due domande che un imprenditore fa davvero»*.

**Da non copiare**: il loro giudizio resta sereno con 54.000 € di fornitori
scaduti, perché guarda solo alla proiezione del saldo. Il nostro deve tenerne
conto.

**Files:**
- Create: `src/lib/previsionale/giudizio.ts`
- Create: `src/lib/previsionale/__tests__/giudizio.test.ts`
- Modify: `src/components/dashboard/CashFlowForecast.tsx`

**Interfaces:**
- Produces:

```ts
export type LivelloGiudizio = 'sereno' | 'attenzione' | 'tensione'
export interface Giudizio { livello: LivelloGiudizio; frase: string }
export function giudicaLiquidita(input: {
  saldoMinimo: number
  giornoSaldoMinimo: string
  soglia: number
  orizzonteGiorni: number
  scadutoPassivo: number
}): Giudizio
```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { describe, it, expect } from 'vitest'
import { giudicaLiquidita } from '../giudizio'

describe('giudicaLiquidita', () => {
  const base = {
    saldoMinimo: 20000,
    giornoSaldoMinimo: '2026-09-20',
    soglia: 5000,
    orizzonteGiorni: 30,
    scadutoPassivo: 0,
  }

  it('è sereno quando il minimo resta sopra la soglia', () => {
    const g = giudicaLiquidita(base)
    expect(g.livello).toBe('sereno')
    expect(g.frase).toContain('Nessuna tensione prevista')
    expect(g.frase).toContain('30 giorni')
  })

  it('avvisa quando il minimo scende sotto soglia restando positivo', () => {
    const g = giudicaLiquidita({ ...base, saldoMinimo: 3000 })
    expect(g.livello).toBe('attenzione')
    expect(g.frase).toContain('sotto la soglia')
    expect(g.frase).toContain('domenica 20 settembre')
  })

  it('segnala tensione quando il saldo va in negativo', () => {
    const g = giudicaLiquidita({ ...base, saldoMinimo: -1200 })
    expect(g.livello).toBe('tensione')
    expect(g.frase).toContain('negativo')
  })

  it('nomina lo scaduto passivo anche quando la proiezione è serena', () => {
    const g = giudicaLiquidita({ ...base, scadutoPassivo: 12000 })
    expect(g.livello).toBe('attenzione')
    expect(g.frase).toContain('già scadute')
  })

  it('non nomina uno scaduto irrilevante', () => {
    const g = giudicaLiquidita({ ...base, scadutoPassivo: 50 })
    expect(g.livello).toBe('sereno')
    expect(g.frase).not.toContain('già scadute')
  })
})
```

- [ ] **Step 2: Esegui e verifica che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/previsionale/__tests__/giudizio.test.ts
```

- [ ] **Step 3: Implementa**

Crea `src/lib/previsionale/giudizio.ts`. La soglia sotto cui lo scaduto passivo
non si nomina è **il 10% della soglia di liquidità bassa**, così scala con la
configurazione invece di essere un numero magico. Usa `date-fns/format` con
`locale: it` e il formato `'EEEE d MMMM'` per la data per esteso — la stessa
forma di `dataEstesa` in `src/app/api/dashboard/forecast/route.ts:40-42`.

- [ ] **Step 4: Esegui e verifica che passi**

```bash
nvm use 22 && npm test -- --run src/lib/previsionale/__tests__/giudizio.test.ts
```

- [ ] **Step 5: Mostra la frase in dashboard**

In `src/components/dashboard/CashFlowForecast.tsx`, sopra le card. Lo scaduto
passivo si legge da `/api/scadenzario/summary`
(`totaleScaduteImporto`), che la sidebar già chiama: usa la stessa query
`useQuery` con la stessa chiave, così non nasce una seconda richiesta.

Durante il caricamento **non** mostrare nulla: una frase rassicurante su dati
assenti è peggio del silenzio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/previsionale/giudizio.ts src/lib/previsionale/__tests__/giudizio.test.ts \
        src/components/dashboard/CashFlowForecast.tsx
git commit -m "feat(dashboard): giudizio di liquidità in linguaggio naturale [KPI-02]"
```

---

## Task 10 — La zona negativa disegnata sul grafico

`KPI-03` · impatto 3

**Contesto per chi implementa.** `CashFlowChart` ha già una `ReferenceLine`
orizzontale sulla soglia minima e una verticale su «Oggi». Manca l'**area**: Cash
King disegna una banda «Zona Negativa» che *«disegna il rischio invece di
descriverlo»*.

**Files:**
- Modify: `src/components/cashflow/CashFlowChart.tsx`

- [ ] **Step 1: Aggiungi le due aree**

Aggiungi `ReferenceArea` all'import da `recharts` e, **prima** dell'`<Area>` (così
la curva resta sopra):

```tsx
{minimoSerie < 0 && (
  <ReferenceArea
    y1={minimoSerie}
    y2={0}
    fill="#ef4444"
    fillOpacity={0.08}
    ifOverflow="extendDomain"
  />
)}
{sogliaMinima && minimoSerie < sogliaMinima && (
  <ReferenceArea
    y1={0}
    y2={sogliaMinima}
    fill="#f59e0b"
    fillOpacity={0.06}
    ifOverflow="extendDomain"
  />
)}
```

dove `minimoSerie` è `Math.min(...dati.map(d => d.saldo), 0)`.

Le aree si rendono **solo quando servono**: una banda rossa su una serie sempre
positiva è rumore che insegna a ignorare il colore.

- [ ] **Step 2: Verifica manuale**

Con una proiezione tutta positiva nessuna banda deve comparire. Forzando
temporaneamente `minimoSerie = -1000` la banda rossa deve apparire sotto lo zero
senza coprire la curva.

- [ ] **Step 3: Verifica il tema scuro**

Le opacità scelte (0.08 e 0.06) devono restare leggibili in entrambi i temi.

- [ ] **Step 4: Commit**

```bash
git add src/components/cashflow/CashFlowChart.tsx
git commit -m "feat(cash-flow): banda della zona negativa sul grafico del saldo [KPI-03]"
```

---

## Task 11 — Tasso di categorizzazione come KPI con obiettivo

`CLS-16` · impatto 4

**Contesto per chi implementa.** Non esiste alcun indicatore di quanti movimenti
siano privi di conto. Agicap mette una barra di progresso con obiettivo dichiarato
(95%) e, accanto, il pulsante che porta alle regole suggerite. *«Trasforma la
manutenzione dei dati in un progresso misurabile con un traguardo.»*

**Da non copiare da Trezy**: un contatore indifferenziato «249 da verificare» non
ordina nulla. Il numero deve avere accanto la strada per abbassarlo — che da noi
esiste già (`CategorizationProposalsDialog`).

**Files:**
- Create: `src/app/api/prima-nota/categorizzazione/route.ts`
- Modify: `src/components/prima-nota/movimenti/MovimentiClient.tsx`

**Interfaces:**
- Produces: `GET /api/prima-nota/categorizzazione` →
  `{ periodoGiorni: number; totale: number; categorizzati: number; percentuale: number }`

**Perché una rotta a sé e non un campo in più su `GET /api/prima-nota`.** Il tasso
si misura su una **finestra fissa di 60 giorni**, indipendente dai filtri della
lista: metterlo nella rotta filtrata lo farebbe cambiare quando l'utente filtra
per conto o per data, che è esattamente ciò che non deve fare. E aggiungerebbe due
`count` a ogni cambio di pagina. La rotta sorella `/api/prima-nota/saldi` esiste
già con lo stesso criterio.

- [ ] **Step 1: Crea la rotta**

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

/**
 * Quanta parte dei movimenti recenti ha un conto.
 *
 * La finestra è mobile e fissa a 60 giorni: ciò che conta è se il lavoro
 * corrente è al passo, non quanto arretrato c'è nel 2024. Per lo stesso motivo
 * la misura non risponde ai filtri della lista — è una proprietà del lavoro, non
 * della vista.
 */
const GIORNI_FINESTRA = 60

export const GET = withAuth(
  async (_request, { venueId }) => {
    const daQuando = new Date()
    daQuando.setDate(daQuando.getDate() - GIORNI_FINESTRA)

    const [totale, senzaConto] = await Promise.all([
      prisma.journalEntry.count({
        where: { venueId, hiddenAt: null, date: { gte: daQuando } },
      }),
      prisma.journalEntry.count({
        where: { venueId, hiddenAt: null, date: { gte: daQuando }, accountId: null },
      }),
    ])

    const categorizzati = totale - senzaConto

    return NextResponse.json({
      periodoGiorni: GIORNI_FINESTRA,
      totale,
      categorizzati,
      // Una prima nota vuota è categorizzata al 100%: non c'è niente da fare, e
      // mostrare 0% inviterebbe a un lavoro che non esiste.
      percentuale: totale === 0 ? 100 : Math.round((categorizzati / totale) * 100),
    })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
```

- [ ] **Step 2: Aggiungi la barra**

In `MovimentiClient.tsx`, sopra la tabella. `Progress` esiste già in
`src/components/ui/progress.tsx`. Rendila **solo sotto il 95%**: sopra
l'obiettivo non è più un invito, è rumore su una pagina che si apre ogni giorno.

```tsx
const OBIETTIVO = 95

const { data: cat } = useQuery({
  queryKey: ['prima-nota', 'categorizzazione'],
  queryFn: async () => {
    const r = await fetch('/api/prima-nota/categorizzazione')
    if (!r.ok) throw new Error('Errore nel calcolo del tasso di categorizzazione')
    return r.json() as Promise<{
      periodoGiorni: number
      percentuale: number
    }>
  },
})

// ...

{cat && cat.percentuale < OBIETTIVO && (
  <div className="rounded-lg border p-3 mb-4 flex items-center gap-4">
    <div className="flex-1">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">
          {cat.percentuale}% dei movimenti categorizzati
        </span>
        <span className="text-xs text-muted-foreground">
          ultimi {cat.periodoGiorni} giorni · obiettivo {OBIETTIVO}%
        </span>
      </div>
      <Progress value={cat.percentuale} />
    </div>
    <Button variant="outline" size="sm" onClick={apriProposte}>
      Rivedi le regole suggerite
    </Button>
  </div>
)}
```

`apriProposte` apre `CategorizationProposalsDialog`, che **esiste già**.
Alla chiusura del dialog invalida la chiave `['prima-nota', 'categorizzazione']`,
così la barra si aggiorna dopo aver applicato una regola.

- [ ] **Step 3: Verifica manuale**

Con movimenti senza conto la barra compare; categorizzandoli fino a superare il
95% sparisce. Il pulsante apre il dialog delle proposte.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/prima-nota/route.ts src/components/prima-nota/movimenti/MovimentiClient.tsx
git commit -m "feat(prima-nota): tasso di categorizzazione con obiettivo dichiarato [CLS-16]"
```

---

## Task 12 — Anteprima delle righe colpite da una regola

`CLS-06` + `CLS-09` · impatto 4 e 3

**Contesto per chi implementa.** `CategorizationProposalsDialog` mostra già il
conteggio («N risultati»); manca l'elenco. E `RegolaFormDialog` non mostra nulla:
si scrive una keyword al buio. Agicap mostra l'anteprima **col pattern
evidenziato in giallo dentro la causale**, e *«rimuove la paura di applicare una
regola sbagliata su centinaia di movimenti»*.

Le due cose sono la stessa idea a due livelli — suggeritore e costruttore — e si
fanno insieme perché l'evidenziazione si scrive una volta sola.

**Files:**
- Create: `src/components/prima-nota/regole/TestoEvidenziato.tsx`
- Modify: `src/app/api/categorization-rules/proposals/route.ts`
- Modify: `src/components/prima-nota/regole/CategorizationProposalsDialog.tsx`
- Modify: `src/components/prima-nota/regole/RegolaFormDialog.tsx`

**Interfaces:**
- Produces: `<TestoEvidenziato testo={string} chiave={string} />`
- Produces: nelle proposte, `sampleDescriptions: string[]` (massimo 3)

- [ ] **Step 1: Crea il componente di evidenziazione**

```tsx
/**
 * Mostra un testo evidenziando la porzione che corrisponde alla parola chiave
 * di una regola. Serve a rendere visibile *perché* una regola aggancia una
 * riga: il conteggio dice quante, l'evidenziazione dice quali e come.
 *
 * La corrispondenza è letterale e insensibile alle maiuscole, come quella del
 * motore delle regole: non serve nulla di più sofisticato, e qualcosa di più
 * sofisticato mentirebbe sul comportamento reale.
 */
export function TestoEvidenziato({ testo, chiave }: { testo: string; chiave: string }) {
  if (!chiave) return <>{testo}</>

  const indice = testo.toLowerCase().indexOf(chiave.toLowerCase())
  if (indice === -1) return <>{testo}</>

  return (
    <>
      {testo.slice(0, indice)}
      <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900/60">
        {testo.slice(indice, indice + chiave.length)}
      </mark>
      {testo.slice(indice + chiave.length)}
    </>
  )
}
```

- [ ] **Step 2: Aggiungi le descrizioni di esempio alle proposte**

In `src/app/api/categorization-rules/proposals/route.ts`, dentro il ciclo che
costruisce i gruppi, accumula fino a tre descrizioni:

```ts
          sampleDescriptions: [entry.description].filter(Boolean).slice(0, 3),
```

e sul ramo `existing`:

```ts
          if (existing.sampleDescriptions.length < 3 && entry.description) {
            existing.sampleDescriptions.push(entry.description)
          }
```

Aggiorna il tipo della `Map` di conseguenza.

- [ ] **Step 3: Mostra l'anteprima nel dialog delle proposte**

Sotto «N risultati», le tre righe con `TestoEvidenziato` e `truncate`.

- [ ] **Step 4: Aggiungi l'anteprima al costruttore di regole**

In `RegolaFormDialog.tsx`, chiama `POST /api/categorization-rules/test` in
`debounce` di 400ms quando cambiano `keywords` o `direction`, e mostra conteggio
più le prime 5 descrizioni evidenziate.

Con zero corrispondenze mostra il testo esplicito — **è un'informazione, non un
errore**:

> Nessun movimento corrisponde. La regola varrà solo per i movimenti futuri.

Se `/api/categorization-rules/test` restituisce solo un conteggio, estendine la
risposta con le prime 5 descrizioni: la query legge già i movimenti.

- [ ] **Step 5: Verifica manuale**

Digitando una keyword il conteggio si aggiorna senza salvare; le descrizioni
mostrano la keyword evidenziata; il `debounce` non produce una chiamata per
carattere (controllare la scheda Network).

- [ ] **Step 6: Commit**

```bash
git add src/components/prima-nota/regole/ src/app/api/categorization-rules/
git commit -m "feat(regole): anteprima delle righe colpite, nel suggeritore e nel costruttore [CLS-06, CLS-09]"
```

---

## Task 13 — Pattuito contro effettivo sul fornitore

`SCD-14` · impatto 3

**Contesto per chi implementa.** `Supplier.paymentTermsDays` esiste e
`stima-data-attesa.ts` calcola già la mediana dei ritardi del fornitore per
proiettare `dataAttesa`. I due numeri non si incontrano mai e nessuno dei due si
vede. Il gestionale *sa* che un fornitore paga con dodici giorni di ritardo, lo
usa per correggere il previsionale, e non lo dice a chi tratta con quel fornitore.

Cash King affianca pattuito, effettivo e differenza con un giudizio
(**Migliore** / **In linea** entro ±2 giorni / **Peggiore**).

**Files:**
- Modify: `src/lib/scadenzario/stima-data-attesa.ts`
- Modify: `src/app/api/suppliers/route.ts`
- Modify: la lista fornitori in `src/app/(dashboard)/anagrafiche/fornitori/`

**Interfaces:**
- Produces:
  `ritardoTipicoFornitore(supplierId, venueId): Promise<{ mediana: number | null; campione: number }>`

- [ ] **Step 1: Esponi la mediana già calcolata**

`stimaRitardoFornitore` calcola già i ritardi. Estrai la parte di lettura in una
funzione pubblica che restituisce **anche la numerosità del campione**, e fai
consumare quella a `stimaRitardoFornitore` — non duplicare il calcolo, altrimenti
la scheda fornitore e il previsionale possono divergere.

- [ ] **Step 2: Arricchisci la risposta dei fornitori**

Aggiungi a ogni fornitore `ritardo: { mediana, campione }`.

- [ ] **Step 3: Mostra le tre celle**

Colonne «Pattuito» (`paymentTermsDays` o «non impostato»), «Effettivo» (mediana
con numerosità fra parentesi), «Differenza» con badge.

Quando `campione < STIMA_MIN_CAMPIONE` (che vale 3 ed è già esportata), scrivi
**«dati insufficienti»**, non un trattino: la colonna deve distinguere «non
calcolabile» da «zero». È il correttivo al difetto osservato in Trezy, dove
`--` significa entrambe le cose.

- [ ] **Step 4: Verifica manuale**

Un fornitore con tre o più scadenze saldate mostra la mediana; uno con meno mostra
«dati insufficienti».

- [ ] **Step 5: Commit**

```bash
git add src/lib/scadenzario/stima-data-attesa.ts src/app/api/suppliers/route.ts \
        "src/app/(dashboard)/anagrafiche/fornitori/"
git commit -m "feat(fornitori): ritardo effettivo confrontato con i termini pattuiti [SCD-14]"
```

---

## Task 14 — Selettore di periodo per ancora e durata

`PRV-15` · impatto 3 · dipende dal Task 4

**Contesto per chi implementa.** Il saldo scalare accetta un `range` e parte sempre
da oggi: non si può guardare la curva con del passato davanti, e senza contesto
non si sa se la linea sta salendo o scendendo. Cash King separa «PARTE DA» e
«DURATA FINESTRA» e offre il preset asimmetrico «Storico 30gg + Prev. 90gg» —
*«poco passato per il contesto, molto futuro per la decisione»*.

Dopo il Task 4 la rotta proietta da `serieProiettata`, che accetta già `dal` e
`al`: il lavoro è quasi tutto nel componente.

**Files:**
- Modify: `src/app/api/scadenzario/saldo-scalare/route.ts`
- Modify: `src/components/scadenzario/saldo-scalare-panel.tsx`

- [ ] **Step 1: Accetta l'ancora nella rotta**

```ts
    // Offset in giorni rispetto a oggi: negativo per guardare indietro. La
    // finestra si esprime come «da dove parto» + «quanto guardo» invece che
    // con due date assolute, perché è il modo in cui si ragiona in tesoreria e
    // perché resta valida il giorno dopo senza reimpostarla.
    const ancoraGiorni = parseInt(searchParams.get('da') || '0')
```

`dal` diventa `oggi + ancoraGiorni`, `al` resta `dal + range`.

- [ ] **Step 2: Aggiungi i due gruppi di pulsanti**

⚠️ **`ToggleGroup` non esiste nel progetto**: non c'è
`src/components/ui/toggle-group.tsx` né la dipendenza
`@radix-ui/react-toggle-group`. Non aggiungerla per due file di pulsanti — usa
`Button` con la variante che cambia, che è il pattern già presente altrove:

```tsx
const ANCORE = [
  { valore: 0, etichetta: 'Oggi' },
  { valore: -15, etichetta: '−15 giorni' },
  { valore: -30, etichetta: '−30 giorni' },
  { valore: -60, etichetta: '−60 giorni' },
]

const DURATE = [7, 14, 30, 60, 90]

<div className="space-y-2">
  <div className="flex items-center gap-2">
    <span className="text-xs uppercase text-muted-foreground w-24">Parte da</span>
    {ANCORE.map((a) => (
      <Button
        key={a.valore}
        size="sm"
        variant={ancora === a.valore ? 'default' : 'outline'}
        onClick={() => impostaFinestra(a.valore, durata)}
      >
        {a.etichetta}
      </Button>
    ))}
  </div>
  <div className="flex items-center gap-2">
    <span className="text-xs uppercase text-muted-foreground w-24">Durata</span>
    {DURATE.map((d) => (
      <Button
        key={d}
        size="sm"
        variant={durata === d ? 'default' : 'outline'}
        onClick={() => impostaFinestra(ancora, d)}
      >
        {d} gg
      </Button>
    ))}
    <Button size="sm" variant="secondary" onClick={() => impostaFinestra(-30, 90)}>
      Storico 30gg + Prev. 90gg
    </Button>
  </div>
</div>
```

Il preset in fondo è la voce che conta: la finestra asimmetrica non è ottenibile
con un selettore da/a senza farci pensare l'utente.

- [ ] **Step 3: Persisti la scelta nell'URL**

`useSearchParams` + `router.replace`, così la vista sopravvive a un refresh ed è
condivisibile. È un pezzo gratuito di `PLT-06`.

- [ ] **Step 4: Verifica manuale**

Con ancora «−30» compaiono trenta giorni di passato, e la parte passata mostra i
movimenti registrati (fonte `movimento`), non le scadenze aperte. Il default
resta oggi + 90 giorni.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scadenzario/saldo-scalare/route.ts src/components/scadenzario/saldo-scalare-panel.tsx
git commit -m "feat(scadenzario): finestra del saldo scalare per ancora e durata [PRV-15]"
```

---

## Task 15 — Numero di distinta sul versamento contanti

`RET-07` · impatto 3

**Contesto per chi implementa.** Il versamento è un trasferimento fra registri
legato da `transferId`, senza riferimento della distinta: abbinarlo alla riga
dell'estratto conto si fa a occhio, e due versamenti dello stesso giorno per la
stessa cifra sono indistinguibili.

Cash King ha il campo `reference` sul versamento, *«ciò che rende verificabile
l'abbinamento col movimento bancario»*.

**Nessuna colonna nuova**: `JournalEntry.documentRef` esiste e non è usato sui
trasferimenti. E `calculateMatchScore` (`src/lib/reconciliation/matcher.ts:122-129`)
dà già un bonus del 10% quando `documentRef` compare nella causale bancaria:
valorizzare il campo attiva il bonus **senza toccare l'algoritmo**.

**Files:**
- Modify: `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`
- Modify: `src/components/prima-nota/movimenti/MovimentiClient.tsx`
- Test: `src/lib/reconciliation/__tests__/schedule-matcher.test.ts` (nuovo caso)

- [ ] **Step 1: Scrivi il test del bonus**

```ts
it('il numero di distinta nella causale bancaria alza il punteggio', () => {
  const senza = calculateMatchScore(
    { id: 't1', transactionDate: new Date('2026-09-10'), description: 'VERSAMENTO CONTANTI', amount: 500 },
    { id: 'm1', date: new Date('2026-09-10'), description: 'Versamento', debitAmount: 500, creditAmount: null, documentRef: null }
  )

  const con = calculateMatchScore(
    { id: 't2', transactionDate: new Date('2026-09-10'), description: 'VERSAMENTO CONTANTI DIST 884213', amount: 500 },
    { id: 'm2', date: new Date('2026-09-10'), description: 'Versamento', debitAmount: 500, creditAmount: null, documentRef: '884213' }
  )

  expect(con).toBeGreaterThan(senza)
})
```

Va in `src/lib/reconciliation/__tests__/` accanto ai test del matcher bancario.

- [ ] **Step 2: Esegui il test**

```bash
nvm use 22 && npm test -- --run src/lib/reconciliation/
```

Atteso: **PASS già ora** — il bonus esiste. Il test documenta il comportamento su
cui il campo si appoggia, e presidia una regressione futura.

- [ ] **Step 3: Aggiungi il campo al form**

Quando l'operazione è un trasferimento con destinazione `BANK`, mostra «Numero
distinta» e scrivilo in `documentRef` su **entrambe** le righe del trasferimento
(stesso `transferId`). Il campo è facoltativo.

- [ ] **Step 4: Mostra il riferimento in lista**

Nella riga del trasferimento, accanto alla descrizione.

- [ ] **Step 5: Verifica manuale**

Registra un versamento con numero di distinta, verifica che entrambe le righe lo
portino e che compaia in lista.

- [ ] **Step 6: Commit**

```bash
git add src/components/prima-nota/movimenti/ src/lib/reconciliation/__tests__/
git commit -m "feat(prima-nota): numero di distinta sul versamento contanti [RET-07]"
```

---

## Task 16 — Stati vuoti che insegnano

`PLT-07` · impatto 3

**Contesto per chi implementa.** `CashFlowSourcePanel` è l'unico stato vuoto che
insegna qualcosa; gli altri constatano. Trezy usa lo stato vuoto delle regole per
spiegare **la risoluzione dei conflitti** con un esempio concreto — la regola
semantica più difficile del sistema — nel momento in cui la persona non ha ancora
nulla da perdere.

**Files:**
- Modify: `src/components/prima-nota/regole/RulesTable.tsx`
- Modify: `src/components/scadenzario/rule-table.tsx`
- Modify: `src/components/scadenzario/recurrence-table.tsx`

- [ ] **Step 1: Regole di categorizzazione**

```tsx
<div className="text-sm text-muted-foreground space-y-2 py-8 text-center max-w-md mx-auto">
  <p className="font-medium text-foreground">Nessuna regola</p>
  <p>
    Le regole assegnano il conto ai movimenti importati. L&apos;ordine conta: la
    prima regola che corrisponde vince, quindi la più specifica va sopra la più
    generica.
  </p>
  <p className="italic">
    Esempio: se «Enel Energia» sta sopra «Enel», un movimento «ENEL ENERGIA SPA»
    prende il conto della prima. Invertendole, lo prenderebbe dalla seconda.
  </p>
</div>
```

- [ ] **Step 2: Regole dello scadenzario**

Stessa struttura, riferita all'ordinamento di `ScheduleRule.ordine` — la regola
«la prima che corrisponde vince» è già documentata in
`src/lib/schedule-rules/engine.ts:1-30` e non è mai stata detta all'utente.

- [ ] **Step 3: Ricorrenze**

```tsx
<p>
  Una ricorrenza genera automaticamente le scadenze future. Creane una dal
  pulsante qui sopra, oppure rendi ricorrente una scadenza esistente dal suo
  dettaglio.
</p>
```

- [ ] **Step 4: Verifica manuale**

I tre stati vuoti compaiono su liste vuote e spariscono quando ci sono elementi.
Gli esempi sono in italiano e usano nomi plausibili — **non** esempi tradotti,
che è il difetto di Trezy («Matthieu», «Jean» dentro una frase italiana).

- [ ] **Step 5: Commit**

```bash
git add src/components/prima-nota/regole/RulesTable.tsx \
        src/components/scadenzario/rule-table.tsx \
        src/components/scadenzario/recurrence-table.tsx
git commit -m "feat(ux): stati vuoti che insegnano invece di constatare [PLT-07]"
```

---

## Verifica finale dell'onda

- [ ] **Suite completa verde**

```bash
nvm use 22 && npm test -- --run
nvm use 22 && npm run test:integration
nvm use 22 && npx tsc --noEmit
nvm use 22 && npm run lint
nvm use 22 && npm run build
```

- [ ] **Le tre proiezioni coincidono**

Con il server dev, sulla stessa finestra temporale: `/cash-flow`, `/scadenzario`
(saldo scalare) e la card della dashboard devono mostrare lo **stesso saldo
finale**. Prima di questa onda non lo facevano, ed è la verifica che dice se il
Task 4 ha funzionato davvero.

- [ ] **Il doppio conteggio è chiuso**

Inserisci la stessa uscita fissa sia in `/spese-ricorrenti` sia in
`/scadenzario/ricorrenze`, con lo stesso importo e lo stesso giorno del mese.
Deve comparire **una volta sola** in ogni proiezione.

- [ ] **Aggiorna la matrice**

In `docs/analisi-competitiva/02-matrice-5vie.md`, porta a ✅ le righe chiuse e
aggiorna il riepilogo dei verdetti. La matrice è il documento di riferimento:
lasciarla indietro la rende inaffidabile alla prossima sessione.

---

## Self-review di questo piano

**Copertura.** Le 17 voci dichiarate all'inizio hanno tutte un task: `RPT-04` e
`RPT-10` (T1), `SCD-08` (T2), `PRV-03` e `PRV-04` (T3), `PRV-01` (T4), `RIC-03`
(T5), `RIC-04` (T6), `SCD-02` (T7), `SCD-04` (T8), `KPI-02` (T9), `KPI-03` (T10),
`CLS-16` (T11), `CLS-06` e `CLS-09` (T12), `SCD-14` (T13), `PRV-15` (T14),
`RET-07` (T15), `PLT-07` (T16).

**Voce dichiarata quick win e non inclusa**: `DOC-11` (controllo di plausibilità
sui documenti). È stata spostata all'Onda 6 perché farla bene richiede una
colonna per le anomalie, e scriverle in `notes` sarebbe un espediente che poi
nessuno toglie.

**Dipendenze fra task.** T4 dipende da T3. T6 dipende da T5. T14 dipende da T4.
T9 usa la stessa cartella di T3 ma non il suo codice. Tutti gli altri sono
indipendenti e si possono eseguire in qualunque ordine.

**Coerenza dei tipi.** `FlussoPrevisto`, `PuntoSerie` e `FontePrevisione` sono
definiti in T3 e usati in T4 e T14 con gli stessi nomi. `EsitoMatch` è definito
in T5 e usato in T6. `formatNumeroCsv` è definito in T1 e usato solo lì.

**Componenti verificati come esistenti** prima di scriverli nel piano:
`Progress`, `Collapsible`, `Badge`, `Button` in `src/components/ui/`;
`ReferenceArea` e `ReferenceDot` in `recharts`;
`CategorizationProposalsDialog` in `src/components/prima-nota/regole/`;
il bonus su `documentRef` in `src/lib/reconciliation/matcher.ts:122-129`;
`STIMA_MIN_CAMPIONE` esportata da `src/lib/scadenzario/stima-data-attesa.ts`;
l'infrastruttura `setupIntegrationDb` / `loginAs` / `callRoute` / fixtures in
`src/test/integration/`.

**Componente verificato come assente**, e il piano ne tiene conto:
`ToggleGroup` (né il file né la dipendenza Radix) — Task 14 usa `Button`.

**Rischio maggiore.** Il Task 4 tocca tre rotte in produzione. La verifica
«le tre proiezioni coincidono» è il gate: se non coincidono, il refactor non è
finito, e va risolto prima di passare oltre — non dopo.

**La decisione che il piano non prende.** Il Task 4 fa **coesistere**
`RecurringExpense` e `Recurrence` risolvendo la sovrapposizione a valle. È la
scelta prudente per un'onda senza migrazioni, ma lascia in piedi due modelli per
lo stesso concetto e due pagine che li scrivono. La scelta di quale dei due
sopravvive — raccomandazione: `Recurrence`, perché genera scadenze vere e quindi
riconciliabili, con data attesa stimabile — va presa **prima dell'Onda 5**, dove
lo snapshot delle previsioni renderebbe permanente l'ambiguità.

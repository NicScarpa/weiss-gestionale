# Open banking Fase 3 — piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: usare superpowers:subagent-driven-development
> (consigliata) o superpowers:executing-plans, un task alla volta. I passi usano
> caselle (`- [ ]`).

**Obiettivo:** portare i movimenti bancari veri dentro `bank_transactions`, con una
sincronizzazione periodica che rispetta il contingente della banca, si accorge di
essere fallita e lo dice.

**Architettura:** una funzione pura decide *cosa* salvare e *da quando*; un modulo
separato decide *se si può chiamare*; un servizio orchestra e scrive. Due rotte —
cron e manuale — non contengono logica. Le schermate leggono `BankSyncRun`.

**Stack:** Next.js App Router, Prisma + PostgreSQL, Zod, Vitest, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-15-open-banking-fase-3-design.md`

## Vincoli globali

Ogni task li eredita. Valori copiati alla lettera dalla spec e dalle convenzioni
del progetto (`src/CLAUDE.md`, `CLAUDE.md` di radice).

- **Node 22 obbligatorio.** Anteporre `nvm use 22 &&` nella stessa riga di shell a
  ogni `npm`/`npx`/`node`. Il node di sistema è la v25 e `.npmrc` ha
  `engine-strict=true`: fallisce con `EBADENGINE`.
- **Mai `prisma db push`.** Il `.env` del worktree è un symlink al `.env`
  principale, che punta alla **produzione**. Le migrazioni si scrivono a mano in
  `prisma/migrations/<timestamp>_<nome>/migration.sql`.
- **Importi sempre `Decimal`** in Prisma, mai `Float`. Nel passaggio da GoCardless
  l'importo resta **stringa** fino a PostgreSQL: vedi la nota su `importoSchema`.
- **Sede sempre da `getVenueId()`/`getVenue()`** (`src/lib/venue.ts`), mai
  `venue.findFirst()`.
- **Le rotte nuove usano `withAuth`** da `@/lib/api-utils`, ruolo `admin`, tranne il
  cron che si difende con `CRON_SECRET`. Il cricchetto
  (`node scripts/check-route-auth.mjs --ratchet`) deve restare **≤ 254**.
- **Niente codice irraggiungibile.** Ogni rotta creata dev'essere raggiunta da una
  schermata entro questo piano.
- **Percorsi API in italiano** (`/api/banca/...`).
- **Campi cifrati**: mai un `where` sul campo cifrato, si usa la colonna hash
  affiancata (`ibanHash`).
- **La build va eseguita, due volte**: `npx next build --webpack` **e**
  `npm run build`. La CI le esegue entrambe e non concordano.
- **Mai `npm run build | tail`**: l'exit code diventa quello di `tail`.

## Cosa esiste già e non va riscritto

Verificato su `origin/main` il 15 agosto. Un task che riscrive uno di questi pezzi
è un task sbagliato.

| Pezzo | Dove | Cosa fa |
|---|---|---|
| `creaClient({ secretId, secretKey, fetchImpl?, attesa? })` | `src/lib/gocardless/client.ts` | token, ritentativi, classificazione degli errori |
| `movimentiConto(conto, { da?, a? })` | idem | `da`/`a` sono stringhe `YYYY-MM-DD` |
| `saldiConto(conto)` | idem | |
| `Risposta<T> = { dati: T, limiti: Limiti }` | idem | **gli header del contingente arrivano già al chiamante** |
| `mappaMovimento(grezzo): MovimentoDaSalvare` | `src/lib/gocardless/mapper.ts` | causale, date, troncamento a 500 |
| `ux_bank_transactions_conto_provider` | indice UNIQUE parziale, verificato in produzione | la deduplica |
| `NotificationBell` | `src/components/notifications/NotificationBell.tsx` | bollino e conteggio, interroga `/api/notifications/history` ogni 60 s |
| `sendEmail({ to, subject, html, text? }): Promise<boolean>` | `src/lib/email.ts` | **restituisce `false` se `RESEND_API_KEY` manca** |
| `verificaSegretoCron(request)` | `src/app/api/promemoria-timbratura/cron/route.ts:24` | modello da copiare |
| `fetchImpl` nei test | `src/lib/gocardless/__tests__/client.test.ts` | modello per mockare la rete |

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/lib/gocardless/mapper.ts` | **modificare**: `mappaMovimenti` deve leggere solo `booked` |
| `src/lib/gocardless/contingente.ts` | **creare**: quante chiamate restano, quando si riapre |
| `src/lib/gocardless/finestra.ts` | **creare**: da quale data chiedere i movimenti |
| `src/lib/services/bank-sync-service.ts` | **creare**: l'orchestratore |
| `src/lib/notifications/sync-fallita.ts` | **creare**: campanello + mail |
| `src/app/api/banca/sincronizzazione/cron/route.ts` | **creare**: cron |
| `src/app/api/banca/sincronizzazione/route.ts` | **creare**: «Sincronizza ora» |
| `src/middleware.ts` | **modificare**: il cron in `PUBLIC_PREFIXES` |
| `prisma/schema.prisma` + migrazione | **modificare**: un valore in `NotificationType` |
| `src/components/settings/…` | **modificare**: stato ultimo giro e contingente |
| pagina movimenti bancari | **modificare**: quanto sono aggiornati i dati |

---

## Task 1: `mappaMovimenti` prende solo i contabilizzati

**File:**
- Modificare: `src/lib/gocardless/mapper.ts:66`
- Test: `src/lib/gocardless/__tests__/mapper.test.ts`

**Interfacce:**
- Produce: `mappaMovimenti(risposta: RispostaMovimenti): MovimentoDaSalvare[]` — firma
  invariata, comportamento cambiato.

Oggi la funzione fa `[...booked, ...pending]`. La spec vuole solo `booked`. La banca
non manda `pending` (`types.ts:46-48`), quindi in produzione non cambia nulla oggi:
serve come difesa, e il test è l'unico posto dove la decisione resta scritta.

- [ ] **Passo 1: scrivere il test che fallisce**

In `src/lib/gocardless/__tests__/mapper.test.ts`, aggiungere:

```typescript
it('scarta i movimenti provvisori: solo i contabilizzati entrano', () => {
  const risposta = rispostaMovimentiSchema.parse({
    transactions: {
      booked: [
        {
          transactionId: '20260810-1',
          bookingDate: '2026-08-10',
          transactionAmount: { amount: '-12.50', currency: 'EUR' },
          remittanceInformationUnstructured: 'PAGAMENTO POS',
        },
      ],
      pending: [
        {
          transactionId: '20260811-9',
          bookingDate: '2026-08-11',
          transactionAmount: { amount: '-4.00', currency: 'EUR' },
          remittanceInformationUnstructured: 'AUTORIZZAZIONE CARTA',
        },
      ],
    },
  })

  const movimenti = mappaMovimenti(risposta)

  expect(movimenti).toHaveLength(1)
  expect(movimenti[0].providerTransactionId).toBe('20260810-1')
})
```

- [ ] **Passo 2: eseguirlo e vederlo fallire**

`nvm use 22 && npx vitest run src/lib/gocardless/__tests__/mapper.test.ts`
Atteso: FAIL, `expected length 2 to be 1`.

- [ ] **Passo 3: cambiare la funzione**

```typescript
/**
 * Solo i movimenti **contabilizzati**.
 *
 * I provvisori si scartano di proposito (decisione 1 della spec della Fase 3):
 * quando si consolidano cambiano identificativo e spesso importo, quindi
 * tenerli richiederebbe la logica che riconosce il provvisorio diventato
 * definitivo — su due campi che possono cambiare entrambi. È il punto in cui
 * nascono i doppioni. Oggi la lista è comunque vuota: questa banca non manda
 * `pending`. Vale per il giorno in cui un altro istituto li mandasse.
 */
export function mappaMovimenti(risposta: RispostaMovimenti): MovimentoDaSalvare[] {
  return risposta.transactions.booked.map(mappaMovimento)
}
```

- [ ] **Passo 4: eseguire tutti i test del modulo**

`nvm use 22 && npx vitest run src/lib/gocardless/`
Atteso: PASS. **Se un test esistente diventa rosso**, non adattarlo di riflesso:
riferire quale, perché quel test potrebbe essere l'unico che documenta un
comportamento voluto.

- [ ] **Passo 5: commit**

```bash
git add src/lib/gocardless/mapper.ts src/lib/gocardless/__tests__/mapper.test.ts
git commit -m "fix(gocardless): solo i movimenti contabilizzati entrano nel gestionale"
```

---

## Task 2: la finestra temporale — da quale data chiedere

**File:**
- Creare: `src/lib/gocardless/finestra.ts`
- Test: `src/lib/gocardless/__tests__/finestra.test.ts`

**Interfacce:**
- Produce:
  ```typescript
  export const GIORNI_MASSIMI_STORICO = 90
  export interface StatoConto {
    syncCutoffDate: Date | null
    ultimoMovimento: Date | null
  }
  export function calcolaDataDa(stato: StatoConto, oggi: Date): string
  ```
  Restituisce sempre una stringa `YYYY-MM-DD`, pronta per `movimentiConto(_, { da })`.

Le tre regole, in ordine di precedenza:

1. **`syncCutoffDate` è un pavimento assoluto.** Se è valorizzata, non si chiede mai
   nulla di più vecchio: è la scelta dell'admin per non duplicare lo storico CSV.
2. Altrimenti, **dall'ultimo movimento noto** per quel conto (incluso: la banca può
   rettificare la giornata).
3. Altrimenti — primo giro — **90 giorni indietro**, il massimo che la banca concede.

- [ ] **Passo 1: scrivere i test che falliscono**

```typescript
import { describe, it, expect } from 'vitest'
import { calcolaDataDa, GIORNI_MASSIMI_STORICO } from '../finestra'

const OGGI = new Date('2026-08-15T09:00:00.000Z')

describe('calcolaDataDa', () => {
  it('primo giro senza nulla: risale di 90 giorni', () => {
    expect(calcolaDataDa({ syncCutoffDate: null, ultimoMovimento: null }, OGGI))
      .toBe('2026-05-17')
  })

  it('riparte dall’ultimo movimento noto, incluso', () => {
    expect(calcolaDataDa(
      { syncCutoffDate: null, ultimoMovimento: new Date('2026-08-12T00:00:00.000Z') },
      OGGI
    )).toBe('2026-08-12')
  })

  it('la data di taglio vince sull’ultimo movimento se è più recente', () => {
    expect(calcolaDataDa(
      {
        syncCutoffDate: new Date('2026-08-01T00:00:00.000Z'),
        ultimoMovimento: new Date('2026-07-20T00:00:00.000Z'),
      },
      OGGI
    )).toBe('2026-08-01')
  })

  it('la data di taglio è un pavimento, non una scelta: non arretra mai', () => {
    expect(calcolaDataDa(
      {
        syncCutoffDate: new Date('2026-06-01T00:00:00.000Z'),
        ultimoMovimento: new Date('2026-08-12T00:00:00.000Z'),
      },
      OGGI
    )).toBe('2026-08-12')
  })

  it('non chiede mai oltre i 90 giorni, nemmeno con una data di taglio più vecchia', () => {
    expect(calcolaDataDa(
      { syncCutoffDate: new Date('2020-01-01T00:00:00.000Z'), ultimoMovimento: null },
      OGGI
    )).toBe('2026-05-17')
  })

  it(`GIORNI_MASSIMI_STORICO è ${GIORNI_MASSIMI_STORICO}`, () => {
    expect(GIORNI_MASSIMI_STORICO).toBe(90)
  })
})
```

- [ ] **Passo 2: eseguirli e vederli fallire**

`nvm use 22 && npx vitest run src/lib/gocardless/__tests__/finestra.test.ts`
Atteso: FAIL, modulo inesistente.

- [ ] **Passo 3: scrivere il modulo**

Tutte le date si trattano in UTC, come `dataDaGiorno` nel mapper: la colonna è
`@db.Date` e costruire con il costruttore locale sposta di un giorno chi sta a est
di Greenwich — noi, da fine marzo a fine ottobre.

```typescript
/**
 * Da quale giorno chiedere i movimenti a GoCardless.
 *
 * Puro: nessun database, nessuna data corrente implicita — `oggi` entra come
 * parametro, così il comportamento a cavallo di mezzanotte è verificabile.
 */

/** Il massimo che la banca concede al primo collegamento. */
export const GIORNI_MASSIMI_STORICO = 90

export interface StatoConto {
  /** Scelta dell'admin: non chiedere nulla di più vecchio di così. */
  syncCutoffDate: Date | null
  /** Data del movimento più recente già salvato per questo conto. */
  ultimoMovimento: Date | null
}

function giorno(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function calcolaDataDa(stato: StatoConto, oggi: Date): string {
  const limite = new Date(oggi)
  limite.setUTCDate(limite.getUTCDate() - GIORNI_MASSIMI_STORICO)

  // L'ultimo movimento è **incluso**: la banca può rettificare una giornata già
  // consegnata, e l'indice unico scarta ciò che rientra identico. Ripartire dal
  // giorno dopo perderebbe le rettifiche in silenzio.
  const candidati = [stato.syncCutoffDate, stato.ultimoMovimento].filter(
    (d): d is Date => d !== null
  )

  // Il più recente fra taglio e ultimo movimento: il taglio è un pavimento, non
  // una scelta — se l'ultimo movimento è più recente si riparte da lì.
  const scelto = candidati.length > 0
    ? new Date(Math.max(...candidati.map((d) => d.getTime())))
    : limite

  // Oltre i 90 giorni la banca non risponde comunque: chiedere di più spreca
  // la chiamata invece di allargare il risultato.
  return giorno(scelto.getTime() < limite.getTime() ? limite : scelto)
}
```

- [ ] **Passo 4: eseguire e verificare**

`nvm use 22 && npx vitest run src/lib/gocardless/__tests__/finestra.test.ts`
Atteso: PASS, 6 test.

- [ ] **Passo 5: commit**

```bash
git add src/lib/gocardless/finestra.ts src/lib/gocardless/__tests__/finestra.test.ts
git commit -m "feat(gocardless): la finestra da cui chiedere i movimenti, con il taglio come pavimento"
```

---

## Task 3: il contingente

**File:**
- Creare: `src/lib/gocardless/contingente.ts`
- Test: `src/lib/gocardless/__tests__/contingente.test.ts`

**Interfacce:**
- Consuma: `Limiti` da `src/lib/gocardless/client.ts` (campi: vedi `leggiLimiti`;
  **leggere il tipo prima di scrivere**, non assumerne i nomi).
- Produce:
  ```typescript
  export const TETTO_GIORNALIERO = 4
  export const RISERVA_RITENTATIVI = 1
  export const CHIAMATE_PER_SINCRONIZZAZIONE = 2
  export interface StatoContingente {
    chiamateOggi: number
    remainingDichiarato: number | null
    resetAt: Date | null
  }
  export function sincronizzazioniRimaste(stato: StatoContingente): number
  export function puoSincronizzare(stato: StatoContingente): { si: boolean; motivo?: string; riapreAlle?: Date }
  ```

Le regole:

- Una sincronizzazione costa **2 chiamate** (`transactions` + `balances`), e il
  contingente è **4 per endpoint per conto**: il tetto è di 4 sincronizzazioni.
- Si tiene **1 di riserva per i ritentativi**: il client ritenta sui 5xx e ogni
  ritentativo è una chiamata vera.
- Quando la banca dichiara `remaining`, **vince lei**.

⚠️ **I due conteggi non sono lo stesso conteggio, ed è il punto delicato del task.**
`chiamateOggi` è ciò che *noi* sappiamo di aver chiesto: 2 per sincronizzazione.
**Non può includere i ritentativi**, perché avvengono dentro `conRitentativi`
(`client.ts`) e non arrivano al chiamante — `Risposta<T>` restituisce `dati` e
`limiti`, non un contatore di tentativi. Chi scrive questo modulo non provi a
dedurli: non ci sono.

I ritentativi rientrano dall'altra porta, ed è sufficiente: **colpiscono la banca**,
quindi `remaining` li ha già scontati. Il contatore locale serve a decidere *prima*
della prima chiamata della giornata, quando nessun header è ancora arrivato; da lì
in poi comanda l'header. La riserva di 1 esiste proprio perché la stima locale è
ottimista per costruzione.

- [ ] **Passo 1: leggere il tipo `Limiti`**

`nvm use 22 && grep -n "interface Limiti" -A 8 src/lib/gocardless/client.ts`
Riportare i nomi dei campi nel report: i passi successivi li usano.

- [ ] **Passo 2: scrivere i test che falliscono**

```typescript
import { describe, it, expect } from 'vitest'
import { puoSincronizzare, sincronizzazioniRimaste, TETTO_GIORNALIERO } from '../contingente'

describe('contingente', () => {
  it('a giornata vuota restano tre sincronizzazioni: la quarta è la riserva', () => {
    expect(sincronizzazioniRimaste({ chiamateOggi: 0, remainingDichiarato: null, resetAt: null }))
      .toBe(TETTO_GIORNALIERO - 1)
  })

  it('una sincronizzazione già fatta costa due chiamate', () => {
    expect(sincronizzazioniRimaste({ chiamateOggi: 2, remainingDichiarato: null, resetAt: null }))
      .toBe(2)
  })

  it('i ritentativi rientrano dall’header, non dal contatore locale', () => {
    // Il caso vero: due sincronizzazioni fatte (il locale dice 4 chiamate,
    // quindi 1 rimasta oltre la riserva) ma un ritentativo ha bruciato una
    // chiamata in più, e solo la banca lo sa. Deve vincere lo 0.
    expect(sincronizzazioniRimaste({ chiamateOggi: 4, remainingDichiarato: 1, resetAt: null }))
      .toBe(0)
  })

  it('quando la banca dichiara il residuo, vince la banca', () => {
    // il contatore locale crede che non sia stato speso nulla; la banca dice 1.
    expect(sincronizzazioniRimaste({ chiamateOggi: 0, remainingDichiarato: 1, resetAt: null }))
      .toBe(0)
  })

  it('rifiuta a contingente esaurito e dice quando si riapre', () => {
    const riapre = new Date('2026-08-16T00:00:00.000Z')
    const esito = puoSincronizzare({ chiamateOggi: 6, remainingDichiarato: 0, resetAt: riapre })
    expect(esito.si).toBe(false)
    expect(esito.riapreAlle).toEqual(riapre)
    expect(esito.motivo).toBeTruthy()
  })

  it('consente quando c’è margine', () => {
    expect(puoSincronizzare({ chiamateOggi: 0, remainingDichiarato: null, resetAt: null }).si).toBe(true)
  })
})
```

- [ ] **Passo 3: eseguirli e vederli fallire**

`nvm use 22 && npx vitest run src/lib/gocardless/__tests__/contingente.test.ts`
Atteso: FAIL, modulo inesistente.

- [ ] **Passo 4: scrivere il modulo**

Rispettare esattamente le costanti dichiarate nelle Interfacce. `remainingDichiarato`
è in **chiamate**, non in sincronizzazioni: dividere per
`CHIAMATE_PER_SINCRONIZZAZIONE` arrotondando **per difetto**. Il minimo fra stima
locale e dichiarato è ciò che si usa; `Math.max(0, …)` impedisce numeri negativi
quando il contatore locale supera il tetto.

- [ ] **Passo 5: eseguire e verificare**

`nvm use 22 && npx vitest run src/lib/gocardless/__tests__/contingente.test.ts`
Atteso: PASS, 6 test.

- [ ] **Passo 6: commit**

```bash
git add src/lib/gocardless/contingente.ts src/lib/gocardless/__tests__/contingente.test.ts
git commit -m "feat(gocardless): il contingente conta le chiamate vere, ritentativi inclusi"
```

---

## Task 4: il valore di notifica e la sua migrazione

**File:**
- Modificare: `prisma/schema.prisma` (`enum NotificationType`)
- Creare: `prisma/migrations/20260815100000_notifica_sync_bancaria/migration.sql`

**Interfacce:**
- Produce: `NotificationType.BANK_SYNC_FAILED`

I valori esistenti sono tutti in inglese SCREAMING_SNAKE (`SHIFT_PUBLISHED`,
`CLOCK_REMINDER`, …): il valore nuovo segue i vicini, non la regola sui percorsi API
in italiano — che riguarda le URL, non gli enum.

`NotificationChannel` ha **già** `EMAIL` e `IN_APP`: non va toccato.

- [ ] **Passo 1: aggiungere il valore allo schema**

In `prisma/schema.prisma`, dentro `enum NotificationType`, dopo `NEW_DOCUMENT`:

```prisma
  /// La sincronizzazione bancaria notturna è fallita. Destinatari: gli admin.
  BANK_SYNC_FAILED
```

- [ ] **Passo 2: scrivere la migrazione a mano**

`prisma/migrations/20260815100000_notifica_sync_bancaria/migration.sql`:

```sql
-- Un valore nuovo per l'enum delle notifiche: la sincronizzazione bancaria
-- fallita. `IF NOT EXISTS` rende la migrazione ripetibile senza errore.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BANK_SYNC_FAILED';
```

⚠️ **Mai `prisma migrate dev`** contro questo `.env`: punta alla produzione. La
migrazione si scrive a mano, come già fatto per la ritenuta d'acconto
(`docs/superpowers/plans/2026-08-13-import-fatture-wizard.md`).

- [ ] **Passo 3: verificare che schema e migrazione concordino**

`nvm use 22 && npx prisma generate`
Atteso: exit 0. Poi `nvm use 22 && npx tsc --noEmit` — atteso exit 0.

- [ ] **Passo 4: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260815100000_notifica_sync_bancaria
git commit -m "feat(notifiche): il tipo per la sincronizzazione bancaria fallita"
```

---

## Task 5: l'avviso di fallimento — campanello e mail

**File:**
- Creare: `src/lib/notifications/sync-fallita.ts`
- Test: `src/lib/notifications/__tests__/sync-fallita.itest.ts`

**Interfacce:**
- Consuma: `sendEmail` da `@/lib/email`, `prisma` da `@/lib/prisma`,
  `NotificationType.BANK_SYNC_FAILED` (Task 4).
- Produce:
  ```typescript
  export const NOTTI_PRIMA_DELLA_MAIL = 2
  export interface EsitoAvviso {
    campanello: number      // quante righe NotificationLog scritte
    mailInviata: boolean
    mailConfigurata: boolean
  }
  export async function avvisaSyncFallita(args: {
    venueId: string
    nomeConto: string
    errore: string
    fallimentiConsecutivi: number
  }): Promise<EsitoAvviso>
  ```

Le regole:

- **Campanello a ogni fallimento**: una riga `NotificationLog` per ogni utente
  `admin` della sede, `channel: IN_APP`, `type: BANK_SYNC_FAILED`. Il bollino
  compare da sé: `NotificationBell` interroga già `/api/notifications/history`.
- **Mail dal secondo fallimento consecutivo**: un errore isolato della banca è
  frequente, e una notifica che si impara a ignorare smette di funzionare.
- **`mailConfigurata` distingue «non dovevo mandarla» da «non ho potuto»**.
  `sendEmail` restituisce `false` anche quando `RESEND_API_KEY` manca: senza questa
  distinzione il pannello direbbe «mail inviata: no» sia quando è tutto a posto sia
  quando il canale è spento. È lo stesso genere di cecità del rinnovo del consenso,
  che spegneva l'avviso che avrebbe segnalato il problema.

- [ ] **Passo 1: scrivere i test d'integrazione che falliscono**

Modello: gli `.itest.ts` esistenti sotto `src/app/api/gocardless/`. Montare la sede e
due utenti `admin` con le factory del progetto (`src/test/factories/`).

Casi obbligatori:
1. al **primo** fallimento scrive una riga per ogni admin e **non** manda la mail;
2. al **secondo** consecutivo scrive le righe **e** manda la mail;
3. senza `RESEND_API_KEY`, `mailInviata: false` **e** `mailConfigurata: false`;
4. il testo della notifica **nomina il conto** — un avviso che non dice quale conto
   costringe ad aprire i log.

- [ ] **Passo 2: eseguirli e vederli fallire**

`nvm use 22 && npm run test:integration -- src/lib/notifications/__tests__/sync-fallita.itest.ts`

- [ ] **Passo 3: scrivere il modulo**

Leggere `process.env.RESEND_API_KEY` **una volta** all'ingresso della funzione, non
al caricamento del modulo: i test la cambiano fra un caso e l'altro, e una costante
di modulo li renderebbe dipendenti dall'ordine.

- [ ] **Passo 4: eseguire e verificare**

Stesso comando del passo 2. Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/lib/notifications/sync-fallita.ts src/lib/notifications/__tests__/sync-fallita.itest.ts
git commit -m "feat(notifiche): la sincronizzazione fallita si vede sul campanello, e per mail alla seconda notte"
```

---

## Task 6: l'orchestratore

**File:**
- Creare: `src/lib/services/bank-sync-service.ts`
- Test: `src/lib/services/__tests__/bank-sync-service.itest.ts`

**Interfacce:**
- Consuma: `calcolaDataDa` (Task 2), `puoSincronizzare` (Task 3),
  `avvisaSyncFallita` (Task 5), `mappaMovimenti` (Task 1), `creaClient`.
- Produce:
  ```typescript
  export interface EsitoSync {
    bankAccountId: string
    esito: 'OK' | 'ERRORE' | 'LIMITE'
    movimentiLetti: number
    movimentiNuovi: number
    movimentiDuplicati: number
    errore?: string
  }
  export async function sincronizzaConti(args: {
    venueId: string
    soloConto?: string
    origine: 'cron' | 'manuale'
    fetchImpl?: typeof fetch
    oggi?: Date
  }): Promise<EsitoSync[]>
  ```
  `fetchImpl` e `oggi` esistono **per i test**: senza, non si può provare nulla
  senza rete e senza aspettare mezzanotte.

Il flusso, per ogni `BankAccount` con `syncEnabled: true` e `providerAccountId`
valorizzato:

1. `puoSincronizzare` — se no, si scrive un `BankSyncRun` con `esito: 'LIMITE'` e si
   passa oltre. **Non è un errore**: non deve far scattare l'avviso.
2. `calcolaDataDa` legge `syncCutoffDate` del conto e la data del movimento più
   recente già salvato.
3. `movimentiConto(providerAccountId, { da })` → `mappaMovimenti`.
4. Inserimento uno per uno con `createMany({ skipDuplicates: false })` **no**: si
   inserisce e si cattura `P2002`, contandolo in `movimentiDuplicati`.
   **La deduplica resta all'indice** (`ux_bank_transactions_conto_provider`):
   scrivere un controllo «esiste già?» creerebbe una seconda fonte di verità che,
   sotto due giri sovrapposti, lascerebbe passare entrambi.
5. `saldiConto` per il saldo.
6. `BankSyncRun` scritto **in ogni esito**, con `rateLimitRemaining` e
   `rateLimitResetAt` presi da `Risposta.limiti`.
7. Su `ERRORE`: contare i fallimenti consecutivi per quel conto (`BankSyncRun`
   precedenti) e chiamare `avvisaSyncFallita`.

I movimenti nascono con: `status: 'PENDING'`, `bankAccountId`,
`importSource: 'PSD2_GOCARDLESS'`, `venueId`.

⚠️ `PSD2_GOCARDLESS` va verificato presente in `enum ImportSource`; se manca, è una
migrazione come il Task 4 **e va replicato nei tre punti fuori dallo schema**
elencati nella spec dell'8 agosto: `src/types/reconciliation.ts`,
`src/lib/validations/reconciliation.ts`,
`src/components/reconciliation/TransactionDetailsDialog.tsx`. Verificarlo al passo 1.

- [ ] **Passo 1: verificare `ImportSource` e i tre punti**

```bash
nvm use 22 && grep -n "enum ImportSource" -A 8 prisma/schema.prisma
grep -rn "PSD2\|CSV" src/types/reconciliation.ts src/lib/validations/reconciliation.ts src/components/reconciliation/TransactionDetailsDialog.tsx
```
Riferire l'esito: decide se questo task include una migrazione.

- [ ] **Passo 2: scrivere i test d'integrazione che falliscono**

Casi obbligatori:
1. un conto acceso con due movimenti nuovi → `movimentiNuovi: 2`, due righe in
   `bank_transactions` con `status: 'PENDING'` e `bankAccountId` valorizzato;
2. **rieseguire la stessa sincronizzazione** → `movimentiNuovi: 0`,
   `movimentiDuplicati: 2`, e **nessuna riga in più** in tabella;
3. lo **stesso `transactionId` su due conti diversi** → due righe, nessun duplicato
   (è il difetto che l'indice esiste per prevenire: 249 collisioni su 678 nel dato
   vero);
4. un conto con `syncEnabled: false` non viene toccato;
5. contingente esaurito → `esito: 'LIMITE'`, `BankSyncRun` scritto, **nessun
   avviso**;
6. errore di rete → `esito: 'ERRORE'`, `BankSyncRun` scritto, avviso chiamato;
7. i `pending` restituiti dalla banca non entrano (chiude il cerchio col Task 1).

`fetchImpl` va costruito come in `src/lib/gocardless/__tests__/client.test.ts`.

- [ ] **Passo 3: eseguirli e vederli fallire**

`nvm use 22 && npm run test:integration -- src/lib/services/__tests__/bank-sync-service.itest.ts`

- [ ] **Passo 4: scrivere il servizio**

- [ ] **Passo 5: eseguire e verificare**

Stesso comando. Atteso: PASS, 7 casi.

- [ ] **Passo 6: commit**

```bash
git add src/lib/services/bank-sync-service.ts src/lib/services/__tests__/bank-sync-service.itest.ts
git commit -m "feat(banca): l'orchestratore della sincronizzazione, con la deduplica lasciata all'indice"
```

---

## Task 7: le due rotte e il middleware

**File:**
- Creare: `src/app/api/banca/sincronizzazione/cron/route.ts`
- Creare: `src/app/api/banca/sincronizzazione/route.ts`
- Modificare: `src/middleware.ts` (`PUBLIC_PREFIXES`)
- Test: `src/app/api/banca/sincronizzazione/__tests__/sincronizzazione.itest.ts`

**Interfacce:**
- Consuma: `sincronizzaConti` (Task 6), `withAuth` da `@/lib/api-utils`.
- Produce: `GET /api/banca/sincronizzazione/cron`, `POST /api/banca/sincronizzazione`,
  `GET /api/banca/sincronizzazione` (stato: ultimo giro per conto, contingente
  residuo, quando si riapre).

Il cron **non** usa `withAuth`: non ha cookie di sessione, `withAuth` risponderebbe
401. Si difende col segreto, copiando `verificaSegretoCron`
(`src/app/api/promemoria-timbratura/cron/route.ts:24`).

⚠️ **Senza la riga in `PUBLIC_PREFIXES` il cron riceve la pagina di login**, non la
risposta: il middleware redirige prima di arrivare alla rotta. È il difetto
esistente di `/api/shifts/reminder`, che ha il guard e non è raggiungibile —
verificato ancora vero il 15 agosto.

- [ ] **Passo 1: aggiungere il prefisso al middleware**

In `src/middleware.ts`, dentro `PUBLIC_PREFIXES`, accanto agli altri cron:

```typescript
  '/api/banca/sincronizzazione/cron',
```

- [ ] **Passo 2: scrivere i test d'integrazione che falliscono**

Casi obbligatori:
1. il cron **senza** `Authorization` → 401;
2. il cron col segreto giusto → 200 e il servizio chiamato con `origine: 'cron'`;
3. `POST` senza sessione → 401;
4. `POST` come `staff` → 403;
5. `POST` come `admin` → 200;
6. `GET` come `admin` restituisce l'ultimo giro per conto e quante
   sincronizzazioni restano.

Il montaggio della sessione usa `entraCome`, **non** `loginAs`: `withAuth` risponde
403 su `mustChangePassword`. L'helper delle rotte è `callRoute` e restituisce già
`{ status, body }` decodificato.

- [ ] **Passo 3: eseguirli e vederli fallire**

`nvm use 22 && npm run test:integration -- src/app/api/banca/sincronizzazione/`

- [ ] **Passo 4: scrivere le rotte**

- [ ] **Passo 5: eseguire, e controllare il cricchetto**

```bash
nvm use 22 && npm run test:integration -- src/app/api/banca/sincronizzazione/
nvm use 22 && node scripts/check-route-auth.mjs --ratchet
```
Atteso: test PASS; cricchetto **≤ 254**. Le due rotte con `withAuth` non lo alzano;
il cron sì, di uno. **Se sale a 255, riferirlo invece di alzare la baseline**: la
via giusta è la stessa già indicata per il callback della banca — quella rotta non è
un'API e andrebbe tolta da sotto `/api`.

- [ ] **Passo 6: commit**

```bash
git add src/app/api/banca src/middleware.ts
git commit -m "feat(banca): le rotte di sincronizzazione, cron e manuale"
```

---

## Task 8: il pannello mostra lo stato e il contingente

**File:**
- Modificare: `src/components/settings/RigaContoBancario.tsx` (lo stato per conto)
- Modificare: `src/components/settings/ConnessioniBancarie.tsx` (il pulsante e il
  contingente)
- Test: `src/components/settings/__tests__/ConnessioniBancarie.test.tsx`

Per ogni conto acceso: data ed esito dell'ultimo giro, movimenti entrati, quante
sincronizzazioni restano oggi, e il pulsante «Sincronizza ora».

- [ ] **Passo 1: leggere i due componenti e il loro test**

Sono già scritti e provati: questo task ne estende il contenuto, non li rifà.
Riferire nel report come `RigaContoBancario` riceve oggi i dati (props o query
propria), perché decide dove innestare lo stato della sincronizzazione.

- [ ] **Passo 2: scrivere i test dei componenti che falliscono**

Casi obbligatori:
1. mostra data ed esito dell'ultimo giro riuscito;
2. a contingente esaurito il pulsante è **disabilitato e dice quando si riapre** —
   un pulsante spento che non dice perché è un pulsante rotto;
3. se il canale mail non è configurato, il pannello **lo dichiara** invece di
   tacere.

I test pilotano con `fireEvent`, non `user-event`: è la convenzione del progetto.

- [ ] **Passo 3: eseguirli e vederli fallire**

- [ ] **Passo 4: scrivere l'interfaccia**

- [ ] **Passo 5: eseguire e verificare**

- [ ] **Passo 6: commit**

```bash
git commit -m "feat(banca): il pannello dice com'è andata l'ultima sincronizzazione e quante ne restano"
```

---

## Task 9: la riconciliazione dice quanto sono aggiornati i dati

**File:**
- Modificare: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`
- Test: accanto ai test esistenti di quel componente

⚠️ **I movimenti bancari non hanno una pagina propria**: vivono dentro la
riconciliazione — è l'unico punto sotto `(dashboard)` che legge
`bank-transactions`, verificato il 15 agosto. Quindi l'indicatore di freschezza va
lì, non su una pagina nuova. Crearne una sarebbe codice irraggiungibile dalla
navigazione.

È la domanda che ci si pone guardando quei numeri — «me li posso fidare?» — e oggi
la pagina non la risponde.

- [ ] **Passo 1: scrivere il test che fallisce**

Mostra l'ultima sincronizzazione riuscita e, se è più vecchia di 48 ore, lo segnala
con evidenza. Se non c'è mai stata, lo dice esplicitamente invece di mostrare un
vuoto.

- [ ] **Passo 2: eseguirlo e vederlo fallire**
- [ ] **Passo 3: implementare**
- [ ] **Passo 4: eseguire e verificare**
- [ ] **Passo 5: commit**

```bash
git commit -m "feat(riconciliazione): la pagina dice quando è stata l'ultima sincronizzazione"
```

---

## Task 10: i tre difetti ereditati dal piano 2b

Batch: tre correzioni piccole e indipendenti, un solo giro di revisione.

**File:**
- Modificare: `src/app/api/gocardless/collegamenti/[id]/conti/route.ts` (voce 2)
- Modificare: il pannello (voci 5 e 6)
- Test: accanto ai test esistenti

**Voce 2 — riassegnare un conto della banca dà 500.** `providerAccountId` è
`@unique` **globale**: la violazione `P2002` non è tradotta. Si chiude come il 409
già fatto in questo stesso file per l'altro caso — copiare quel ramo, non
inventarne uno nuovo.

**Voce 5 — il tasto Indietro lascia il pannello inerte.** Tornando dalla banca (o
premendo Indietro prima di completare l'autenticazione) i quattro pulsanti restano
ma nessuno porta a un esito diverso finché non si ricarica a mano.

**Voce 6 — «Mostra archiviati» perde le scelte non salvate.** La prima volta che si
accende l'interruttore la chiave `['bank-accounts', true]` non è mai stata letta:
`isPending` torna vero, lo spinner sostituisce il sottoalbero e `ConnessioniBancarie`
si smonta. Rimedio noto: `placeholderData: keepPreviousData` di TanStack Query.

- [ ] **Passo 1: un test che fallisce per ciascuna delle tre**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: applicare le tre correzioni**
- [ ] **Passo 4: eseguire e verificare**
- [ ] **Passo 5: commit**

```bash
git commit -m "fix(banca): il 409 sulla riassegnazione, il ritorno col tasto Indietro, le scelte che non si perdono"
```

---

## Task 11: la scadenza del consenso, letta davvero

**File:**
- Modificare: `src/lib/gocardless/client.ts` (metodo nuovo)
- Modificare: il punto che scrive `accessValidUntil` al transito verso `LN`
  (`src/app/api/gocardless/collegamenti/[id]/conti/route.ts`)
- Test: `src/lib/gocardless/__tests__/client.test.ts` e l'itest della rotta

Oggi la scadenza scritta è una **stima ricalcolata** dal massimo dichiarato
dall'istituto (`max_access_valid_for_days`), non da quanto è stato concesso davvero:
**sbaglia sempre per eccesso**, quindi l'avviso a 14 giorni può arrivare tardi —
nel caso peggiore quando il consenso è già più vicino alla scadenza di quanto il
pannello dica.

La fonte autorevole è `GET /agreements/enduser/{agreementId}/`. **Non è per conto**,
quindi **fuori dal contingente di quattro al giorno**: leggerla non costa nulla di
ciò che serve ai movimenti.

- [ ] **Passo 1: test del client che fallisce** — `leggiAgreement(id)` restituisce
      `access_valid_for_days` concesso.
- [ ] **Passo 2: eseguirlo e vederlo fallire**
- [ ] **Passo 3: aggiungere il metodo al client**
- [ ] **Passo 4: test della rotta** — `accessValidUntil` calcolata dal valore
      concesso, non dal massimo dichiarato. Se la lettura fallisce, si ricade sulla
      stima **e lo si annota**, invece di lasciare il campo vuoto.
- [ ] **Passo 5: implementare e verificare**
- [ ] **Passo 6: commit**

```bash
git commit -m "fix(banca): la scadenza del consenso letta dall'agreement, non stimata per eccesso"
```

---

## Chiusura: verifica dell'intero ramo

- [ ] `nvm use 22 && npx prisma generate` — exit 0
- [ ] `nvm use 22 && npx tsc --noEmit` — exit 0
- [ ] `nvm use 22 && npm test -- --run` — tutti verdi
- [ ] `nvm use 22 && npm run test:integration` — tutti verdi
- [ ] `nvm use 22 && npx next build --webpack` — exit 0 (**non** con `| tail`)
- [ ] `nvm use 22 && npm run build` — exit 0
- [ ] `nvm use 22 && node scripts/check-route-auth.mjs --ratchet` — ≤ 254

## Dopo il piano: cosa resta a chi rilascia

Non è codice, ed è ciò senza cui il codice non gira.

1. **Creare il servizio cron su Railway.** `vercel.json` è ignorato in produzione. Il
   modello è il servizio `cron-presenze` già esistente (immagine `curlimages/curl`),
   che chiama l'endpoint con `Authorization: Bearer $CRON_SECRET`. Orario: notte
   italiana. ⚠️ `railway variables --set` **non ridistribuisce**: serve
   `railway redeploy`, e va verificato che il deploy sia più recente della scrittura.
2. **Procurare `RESEND_API_KEY`** e metterla sul servizio `weiss-gestionale`. Finché
   manca, il canale mail resta spento **e il pannello lo dichiara** — nessuna mail
   parte oggi in produzione, nemmeno il recupero password e gli inviti.
3. **Il primo giro vero**, una volta, sul conto collegato. Costa 2 chiamate delle 4.
   È l'unico modo di verificare la **stabilità degli identificativi** (voce 3 del
   piano 2b, mai verificata) e il percorso di ritorno dalla banca.
4. **Dopo il primo giro**: decidere l'ora del cron guardando a che ora i movimenti
   del giorno prima diventano `booked`, e rivedere la soglia di due notti prima
   della mail.

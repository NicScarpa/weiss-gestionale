# Riconciliazione A2, primo taglio — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere il confronto dei riferimenti — che vale quasi il doppio della fascia Alta — e costruire la coda di riconciliazione a scheda singola, con approvazione e i due scarti.

**Architecture:** Il motore, le tabelle e le rotte di generazione esistono dalla Fase A1; non si tocca nulla di quello. Si corregge una funzione pura (`contieneRiferimento`), si aggiungono tre rotte di decisione sulle proposte, e si sostituisce la pagina `/riconciliazione` — che oggi non chiama le rotte dei lotti — con la coda vera.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Prisma 7, TanStack Query, shadcn/ui, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-16-riconciliazione-a2-primo-taglio-design.md`, che argomenta da `docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md`.

## Global Constraints

- **Nessuna migrazione.** Lo schema della Fase A1 contiene già `ReconciliationBatch`, `ReconciliationProposal`, `ReconciliationProposalLeg`, `ReconciliationExclusion`, `CounterpartyAlias`, e i campi `stato`, `supersededByProposalId`, `decisoDaId`, `decisoAt`. Se un task sembra averne bisogno, è il task a essere sbagliato.
- **La soglia della fascia Alta è 85** e vive in una costante sola. Non si tocca: è misurata su due popolazioni indipendenti (`scripts/riconciliazione/README.md`, sezioni 4 e 5).
- **`.env` punta alla PRODUZIONE.** Nessun comando Prisma che scriva su database va eseguito contro quella stringa.
- **Node 22:** anteporre `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH"` a ogni `npm`/`npx`/`node` sulla stessa riga.
- **Mai `git add -A`**; mai `npm run build | tail`.
- Le rotte finanziarie richiedono ruolo `admin` o `manager`; il cricchetto `node scripts/check-route-auth.mjs --ratchet` non deve salire.
- Importi sempre `Decimal`; scritture contabili mai cancellate, sempre `deletedAt`.
- **L'invariante del 15 agosto**: ogni riga di prima nota corrisponde a un movimento di denaro realmente avvenuto. Una riga bancaria lo è, e promuoverla la realizza.

---

## Struttura dei file

| File | Responsabilità | Azione |
|---|---|---|
| `src/lib/reconciliation/causale.ts` | il confronto dei riferimenti | correggere il confine |
| `src/lib/reconciliation/__tests__/causale.test.ts` | i casi veri | estendere |
| `src/lib/services/reconciliation-decision-service.ts` | approvare, scartare, escludere | creare |
| `src/app/api/riconciliazione-assistita/proposte/[id]/approva/route.ts` | approvazione | creare |
| `src/app/api/riconciliazione-assistita/proposte/[id]/scarta/route.ts` | i due scarti | creare |
| `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx` | la pagina | sostituire |
| `src/components/riconciliazione/CodaProposte.tsx` | la coda | creare |
| `src/components/riconciliazione/SchedaProposta.tsx` | la scheda | creare |
| `src/components/riconciliazione/StoricoLotti.tsx` | lo storico | creare |

---

## Task 1: Il confine si decide sui caratteri originali

Il difetto: `soloAlfanumerici` toglie i separatori, incollando due campi diversi; poi la guardia contro i falsi positivi rifiuta il match perché dopo l'ultima cifra dell'ago ne trova un'altra — che nell'originale era separata da uno spazio.

```
Ft.N.3300/00/2026 30/05/2026   →   FTN[3300002026]30052026
SARATOGA SNC 177 2026          →   SARATOGASNC[177]2026
```

La protezione va **conservata**: è misurata (falsi positivi all'1,63% con numeri a tre cifre trovati dentro l'identificativo operazione). Cambia solo *dove* si guarda il confine — nell'originale, non nel normalizzato.

**Files:**
- Modify: `src/lib/reconciliation/causale.ts:47-49` (`soloAlfanumerici`), `:88-98` (`contieneRiferimento`)
- Test: `src/lib/reconciliation/__tests__/causale.test.ts:50-108`

**Interfaces:**
- Consumes: niente.
- Produces: `contieneRiferimento(causale: string, numeroDocumento: string): boolean` — firma invariata, comportamento più permissivo solo dove i separatori originali delimitano davvero.

- [x] **Step 1: Scrivere i test dei sette casi veri**

In `src/lib/reconciliation/__tests__/causale.test.ts`, dentro `describe('contieneRiferimento')`:

```ts
  // I casi vengono dalle proposte vere generate il 16 agosto 2026 sui movimenti
  // sincronizzati: sette perdevano i venti punti del riferimento pur avendolo
  // in causale, e sei di esse restavano sotto la soglia della fascia Alta.
  describe('il numero è nella causale ma un altro campo gli si incolla accanto', () => {
    it('la data che segue il numero non deve nasconderlo', () => {
      const causale =
        'SDD Core - Richiesta Incasso SEPA Ft.N.3300/00/2026 30/05/2026 MA.IN.CART. S.R.L. IT59g070846499000000075'
      expect(contieneRiferimento(causale, '3300/00/2026')).toBe(true)
    })

    it('vale anche per le altre due fatture dello stesso fornitore', () => {
      const giugno =
        'SDD Core - Richiesta Incasso SEPA Ft.N.4450/00/2026 30/06/2026 MA.IN.CART. S.R.L. IT59g070846499000000075'
      expect(contieneRiferimento(giugno, '4450/00/2026')).toBe(true)
      expect(
        contieneRiferimento(
          giugno.replace('4450/00/2026', '4451/00/2026'),
          '4451/00/2026'
        )
      ).toBe(true)
    })

    it("l'anno che segue un numero corto non deve nasconderlo", () => {
      const causale = 'Bonifico tramite Internet Banking BEN SARATOGA SNC 177 2026'
      expect(contieneRiferimento(causale, '177')).toBe(true)
    })
  })

  describe('la protezione misurata resta intera', () => {
    it("un numero di tre cifre dentro l'identificativo operazione non conta", () => {
      // È l'1,63% di falsi positivi misurato sulle 621 causali vere: nell'ORIGINALE
      // il 432 ha cifre da entrambi i lati, quindi resta escluso.
      expect(contieneRiferimento('Bonifico ID 07084324084 ROSSI SRL', '432')).toBe(false)
      expect(contieneRiferimento(CAUSALE_INSTANT, '432')).toBe(false)
    })

    it('un numero contiguo ad altre cifre nella causale originale non conta', () => {
      expect(contieneRiferimento('Bonifico rif 99123', '123')).toBe(false)
    })

    it('ma contiguo a lettere sì, che è la forma delle causali vere', () => {
      expect(contieneRiferimento('Bonifico rif AB123', '123')).toBe(true)
      expect(contieneRiferimento(CAUSALE_INSTANT, '4320')).toBe(true)
    })
  })
```

- [x] **Step 2: Eseguirli e vederli fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/reconciliation/__tests__/causale.test.ts`

Expected: **FAIL** sui quattro casi del primo `describe` (`expected false to be true`). I test del secondo `describe` devono già passare: sono la protezione che c'è. Se fallisce uno di quelli, il caso è stato scritto male.

- [x] **Step 3: Normalizzare conservando le posizioni**

In `src/lib/reconciliation/causale.ts`, accanto a `soloAlfanumerici`:

```ts
/**
 * La causale ridotta ad A-Z0-9, con la mappa verso le posizioni originali.
 *
 * Serve a decidere il confine di un riferimento guardando i caratteri VERI:
 * la normalizzazione incolla campi che nell'originale erano separati
 * (`Ft.N.3300/00/2026 30/05/2026` diventa `FTN330000202630052026`), e un
 * confine giudicato sul normalizzato scambia quella cucitura per contiguità.
 */
function normalizzaConPosizioni(testo: string): {
  normalizzato: string
  posizioni: number[]
} {
  const caratteri: string[] = []
  const posizioni: number[] = []

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i].toUpperCase()
    if (c >= 'A' && c <= 'Z') {
      caratteri.push(c)
      posizioni.push(i)
    } else if (c >= '0' && c <= '9') {
      caratteri.push(c)
      posizioni.push(i)
    }
  }

  return { normalizzato: caratteri.join(''), posizioni }
}

/** Il carattere in quella posizione dell'originale è una cifra? */
function cifraIn(testo: string, indice: number): boolean {
  return indice >= 0 && indice < testo.length && testo[indice] >= '0' && testo[indice] <= '9'
}
```

- [x] **Step 4: Decidere il confine sull'originale**

Sostituire il corpo di `contieneRiferimento`:

```ts
export function contieneRiferimento(causale: string, numeroDocumento: string): boolean {
  const ago = soloAlfanumerici(numeroDocumento)
  if (ago.length < LUNGHEZZA_MINIMA_RIFERIMENTO) return false

  const { normalizzato, posizioni } = normalizzaConPosizioni(causale)

  // Si scorrono TUTTE le occorrenze: la prima può essere quella dentro
  // l'identificativo operazione, e fermarsi lì perderebbe quella buona più
  // avanti nella causale.
  let da = normalizzato.indexOf(ago)
  while (da !== -1) {
    const inizioOriginale = posizioni[da]
    const fineOriginale = posizioni[da + ago.length - 1]

    // Ogni lato si ancora solo se il bordo corrispondente dell'ago è una cifra:
    // su un bordo alfabetico la lookaround non separerebbe nulla. Il confronto
    // avviene però sui caratteri ORIGINALI, dove uno spazio o una barra
    // separano davvero — ed è questa la correzione del 16 agosto 2026.
    const bloccatoPrima = /^[0-9]/.test(ago) && cifraIn(causale, inizioOriginale - 1)
    const bloccatoDopo = /[0-9]$/.test(ago) && cifraIn(causale, fineOriginale + 1)

    if (!bloccatoPrima && !bloccatoDopo) return true

    da = normalizzato.indexOf(ago, da + 1)
  }

  return false
}
```

- [x] **Step 5: Eseguire i test e vederli passare**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/lib/reconciliation/`

Expected: tutti verdi, compresi i test preesistenti — che descrivono la protezione misurata e **non vanno modificati**. Se uno di quelli diventa rosso, la correzione è troppo larga: fermarsi e capire quale.

- [x] **Step 6: Commit**

```bash
git add src/lib/reconciliation/causale.ts src/lib/reconciliation/__tests__/causale.test.ts
git commit -m "fix(riconciliazione): il confine del riferimento si decide sui caratteri originali"
```

---

## Task 2: La misura prima e dopo, sui dati veri

Il criterio di accettazione della correzione **non è «i test passano»** ma un numero: sei proposte entrano in fascia Alta, e nessun'altra.

**Files:**
- Modify: `scripts/riconciliazione/README.md`

**Interfaces:**
- Consumes: `contieneRiferimento` corretta dal Task 1.
- Produces: niente codice; un numero verificato.

- [x] **Step 1: Rifare il dump di produzione**

```bash
/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL_PRODUZIONE" --no-owner --no-privileges -f /tmp/produzione.sql
```

Il `DATABASE_URL` sta nel `.env`; **non** eseguire comandi Prisma di scrittura contro quella stringa.

- [x] **Step 2: Misurare**

```bash
SENZA_SNAPSHOT=1 DUMP=/tmp/produzione.sql DB_MISURA=misura_dopo \
  PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npx tsx scripts/riconciliazione/misura-fascia-alta.ts
```

Expected: **`Lotto generato: 13 alte, ...`** contro le 7 di prima.

- [x] **Step 3: Verificare che le tredici siano tutte corrette**

```bash
DB_MISURA=misura_dopo PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npx tsx scripts/riconciliazione/verifica-fascia-alta.ts
```

Expected: `abbinamenti su importo NON univoco: 0`. **Se compare anche uno solo, la correzione ha portato un falso positivo dentro la fascia che si approva in blocco: fermarsi.** È l'errore peggiore possibile, e il piano si interrompe qui finché non è capito.

- [x] **Step 4: Scrivere il risultato nel rapporto**

Aggiungere a `scripts/riconciliazione/README.md` una sezione 6 con: il numero prima e dopo, l'elenco delle proposte entrate, e l'esito del controllo di ambiguità. Numeri veri, incollati.

- [x] **Step 5: Buttare il database di misura e committare**

```bash
/opt/homebrew/opt/postgresql@16/bin/dropdb -h 127.0.0.1 -p 5433 misura_dopo
git add scripts/riconciliazione/README.md
git commit -m "chore(riconciliazione): la fascia Alta passa da 7 a 13, misurato"
```

---

## Task 3: Approvare promuove la riga bancaria a movimento

**Files:**
- Create: `src/lib/services/reconciliation-decision-service.ts`
- Create: `src/app/api/riconciliazione-assistita/proposte/[id]/approva/route.ts`
- Create: `src/app/api/riconciliazione-assistita/proposte/[id]/approva/__tests__/route.test.ts`
- Create: `src/lib/services/__tests__/reconciliation-decision-service.itest.ts`

**Interfaces:**
- Consumes: `promuoviRigaBancariaInTransazione(tx, input)`, `PromozioneRifiutata`, `PromozioneInTransazione` da `src/lib/services/promozione-riga-bancaria-service.ts` (consegna B dell'estratto conto: il servizio unico che crea la scrittura BANK dalla riga, la lega, scrive le riconciliazioni e il residuo — questo task NON crea più la scrittura da sé); `dopoLaRiconciliazione` da `src/lib/services/schedule-reconciliation-service.ts` per le code fuori transazione.
- Produces:
  ```ts
  export type EsitoApprovazione =
    | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[] }
    | { outcome: 'proposta_non_trovata' }
    | { outcome: 'gia_decisa'; stato: string }
    | { outcome: 'superata'; motivo: string }
    | { outcome: 'riconciliazione_rifiutata'; motivo: string }

  export async function approvaProposta(input: {
    proposalId: string
    venueId: string
    userId: string | null
  }): Promise<EsitoApprovazione>
  ```

- [x] **Step 1: Scrivere il test d'integrazione**

Creare `src/lib/services/__tests__/reconciliation-decision-service.itest.ts` sul modello di `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/paga-in-contanti.itest.ts`. Casi:

```ts
it('crea il movimento di prima nota dalla riga bancaria e lo riconcilia', async () => {
  // dopo: esiste un JournalEntry con date = bankTransaction.transactionDate,
  // importo uguale, registerType 'BANK'; la scadenza risulta pagata; la
  // BankTransaction ha matchedEntryId valorizzato e status 'MATCHED'
})

it('la proposta passa a «approvata» e porta chi e quando', async () => {})

it('una proposta già decisa non si approva due volte', async () => {})

it("se la scadenza nel frattempo è stata saldata altrove, la proposta si marca superata e non scrive nulla", async () => {})

it('il saldo banca si muove esattamente dell\'importo del movimento', async () => {
  // È l'invariante del 15 agosto vista dall'altro capo: qui il denaro c'è
  // davvero — è la banca a dirlo — e la prima nota deve seguirlo.
})
```

- [x] **Step 2: Eseguirlo e vederlo fallire**

Run: `TEST_DB_SUFFIX=decisione PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration -- reconciliation-decision`
Expected: FAIL — il modulo non esiste.

- [x] **Step 3: Scrivere il servizio**

`approvaProposta` in una sola `prisma.$transaction`:

1. blocca la proposta (`SELECT ... FOR UPDATE` via `$queryRaw` dentro la transazione) e verifica `stato === 'in_attesa'`;
2. rilegge le due parti e **ricontrolla la freschezza** (decisione 6 della spec madre): se la scadenza è già `pagata`/`annullata`, o la riga bancaria ha già `matchedEntryId`, marca la proposta `superata` e restituisce senza scrivere altro;
3. chiama **`promuoviRigaBancariaInTransazione(tx, { bankTransactionId, venueId, userId, origine: 'proposta', confidence: punteggio / 100, scadenze: gambe.map((g) => ({ scheduleId: g.scheduleId, amount: Number(g.importo) })) })`** — oppure, se la proposta è una **R4** (`journalEntryId` valorizzato, nessuna gamba), `{ …, origine: 'proposta', scritturaEsistenteId: proposta.journalEntryId }`. È il servizio a creare la scrittura BANK (data, dare/avere, descrizione, conto dal fornitore della scadenza, centro via `risolviCentroDiCosto`), a legarla (`matchedEntryId`, `status: 'MATCHED'`, `origineScrittura: 'PROPOSTA'`), a scrivere le `ScheduleReconciliation` con `source: 'PROPOSAL'` e il residuo dei documenti sulla riga. Un esito negativo arriva come eccezione `PromozioneRifiutata`: la si lascia salire (la transazione cade per intero) e **fuori** dalla transazione la si cattura e si traduce in `{ outcome: 'riconciliazione_rifiutata', motivo }` (dal campo `esito` dell'eccezione: `importo_eccedente`, `riconciliazione_rifiutata`, `scrittura_gia_collegata_ad_altra_riga`… → il motivo lo dà `rispostaPerEsito` di `src/lib/banca/esiti-promozione.ts`, campo `corpo.error`);
4. aggiorna la proposta a `approvata` con `decisoDaId` e `decisoAt`, e incrementa `contaApprovate` sul lotto; restituisce anche `seguiti` della promozione.

Fuori dalla transazione: per ogni voce di `seguiti`, `dopoLaRiconciliazione(voce.risultato, voce.input)`, come fa la rotta del pagamento in contanti.

Lo scarto di una proposta approvata (se un giorno servirà «annulla approvazione») passa da `scollegaRigaBancaria` dello stesso modulo: ritira solo ciò che la promozione ha creato.

**Nota (17 ago, dopo la consegna B).** Una riga con `status = TO_REVIEW` porta un `matchedEntryId` scritto dal vecchio motore che **non** è un legame: `promuoviRigaBancariaInTransazione` la tratta come libera (ramo di creazione, o rilegame se arriva `scritturaEsistenteId`). Quindi il controllo di freschezza del punto 2 va scritto così: «la riga bancaria ha già `matchedEntryId` **e** `status !== 'TO_REVIEW'`» ⇒ superata; e per una proposta R4 si passa sempre `scritturaEsistenteId: proposta.journalEntryId`, altrimenti l'approvazione crea una scrittura nuova invece di confermare quella indicata.

- [x] **Step 4: Scrivere la rotta**

`POST /api/riconciliazione-assistita/proposte/[id]/approva`, ruolo `admin` o `manager`, `getVenueId()`, traduzione degli esiti: `proposta_non_trovata` → 404, `gia_decisa` → 409, `superata` → 409 col motivo, `riconciliazione_rifiutata` → 422, `ok` → 200 con `createAuditLog`.

- [x] **Step 5: Test unitario della rotta**

Sul modello di `src/app/api/scadenzario/[id]/paga-in-contanti/__tests__/route.test.ts`: mock del servizio, e una asserzione per ciascuna traduzione di esito, più il 403 al dipendente.

- [x] **Step 6: Eseguire tutto**

```bash
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/app/api/riconciliazione-assistita/
TEST_DB_SUFFIX=decisione PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration -- reconciliation-decision
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet
```

- [x] **Step 7: Commit**

```bash
git add src/lib/services/reconciliation-decision-service.ts src/lib/services/__tests__/reconciliation-decision-service.itest.ts "src/app/api/riconciliazione-assistita/proposte"
git commit -m "feat(riconciliazione): approvare promuove la riga bancaria a movimento di prima nota"
```

---

## Task 4: Lo scarto ha due porte

**Files:**
- Modify: `src/lib/services/reconciliation-decision-service.ts`
- Create: `src/app/api/riconciliazione-assistita/proposte/[id]/scarta/route.ts`
- Create: `src/app/api/riconciliazione-assistita/proposte/[id]/scarta/__tests__/route.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function scartaProposta(input: {
    proposalId: string
    venueId: string
    userId: string | null
    /** true = «non propormelo mai più»: scrive anche in ReconciliationExclusion */
    perSempre: boolean
    motivo?: string
  }): Promise<{ outcome: 'ok' } | { outcome: 'proposta_non_trovata' } | { outcome: 'gia_decisa'; stato: string }>
  ```

- [x] **Step 1: Scrivere i test**

```ts
it('«salta per ora» marca la proposta scartata e non scrive esclusioni', async () => {})

it('«non propormelo mai più» scrive anche la coppia in ReconciliationExclusion', async () => {})

it('la coppia esclusa non ricompare in un lotto rigenerato', async () => {
  // Senza questo, ogni rilancio ripropone gli stessi falsi positivi ed è il
  // motivo per cui la seconda porta esiste.
})
```

- [x] **Step 2: Eseguirli e vederli fallire**

Run: `TEST_DB_SUFFIX=scarto PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration -- reconciliation-decision`

- [x] **Step 3: Implementare, e verificare che `generaLotto` legga le esclusioni**

`scartaProposta` aggiorna lo stato a `scartata`, incrementa `contaScartate`, e con `perSempre` crea una `ReconciliationExclusion` per ogni gamba (`bankTransactionId` + `scheduleId`).

**Prima di scrivere**, leggere `src/lib/services/reconciliation-batch-service.ts` e verificare se `generaLotto` già esclude le coppie in `ReconciliationExclusion`. Se non lo fa, aggiungerlo è parte di questo task: senza, la seconda porta non produce alcun effetto e il terzo test resta rosso.

- [x] **Step 4: La rotta**

`POST /api/riconciliazione-assistita/proposte/[id]/scarta` con corpo `{ perSempre: boolean, motivo?: string }`.

- [x] **Step 5: Eseguire e committare**

```bash
git add src/lib/services/ "src/app/api/riconciliazione-assistita/proposte"
git commit -m "feat(riconciliazione): scartare per ora, oppure per sempre"
```

---

## Task 5: La coda e la scheda

**Files:**
- Modify: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`
- Create: `src/components/riconciliazione/CodaProposte.tsx`
- Create: `src/components/riconciliazione/SchedaProposta.tsx`
- Create: `src/components/riconciliazione/__tests__/SchedaProposta.test.tsx`

**Interfaces:**
- Consumes: `POST /api/riconciliazione-assistita/lotti` (genera), `GET /api/riconciliazione-assistita/lotti/[id]` (legge), e le due rotte dei Task 3-4.
- Produces: `<CodaProposte lottoId />`, `<SchedaProposta proposta onApprova onScarta />`.

- [x] **Step 1: Leggere cosa restituisce la rotta del lotto**

Run: `sed -n '1,80p' "src/app/api/riconciliazione-assistita/lotti/[id]/route.ts"`

La scheda mostra ciò che il motore **già persiste** — `fattori` (sei numeri) e `motivazioni` (`[{testo, segno}]`) — senza ricostruire nulla. Da una proposta vera:

```
punteggio 98
fattori    data 15 · importo 30 · unicita 5 · codiceBanca 10 · controparte 18 · riferimento 20
✓ Importo identico al residuo
✓ Nome della controparte presente nella causale
✓ Il codice operazione della banca concorda col metodo atteso
✓ Riferimento della fattura presente nella causale
✓ Pagato il giorno di scadenza
✓ Unico abbinamento possibile
```

- [x] **Step 2: Scrivere il test della scheda**

Creare `src/components/riconciliazione/__tests__/SchedaProposta.test.tsx` con `fireEvent`, **non** `@testing-library/user-event`. Casi:

```tsx
it('mostra il punteggio e i sei fattori', () => {})
it('mostra le motivazioni positive e negative col loro segno', () => {
  // Le negative sono quelle che fanno decidere: si mostrano, non si nascondono.
})
it('mostra la causale intera del movimento, non troncata', () => {})
it('«Approva» chiama la rotta della proposta', () => {})
it('«Non propormelo mai più» chiede conferma prima di chiamare', () => {})
it("l'errore del server resta visibile e non chiude la scheda", () => {})
```

- [x] **Step 3: Eseguirlo e vederlo fallire**

Run: `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx vitest run src/components/riconciliazione/`

- [x] **Step 4: Scrivere i componenti**

`SchedaProposta`: a sinistra il movimento (data, importo, causale **intera**), a destra la scadenza con la sua fattura; sotto la barra segmentata dei sei fattori e le motivazioni col segno; in fondo le tre azioni.

`CodaProposte`: ordinamento per punteggio decrescente, filtro per fascia (Alta ≥ 85, Media 50-84, Bassa < 50), e il conteggio per fascia in cima.

`RiconciliazioneClient`: la pagina d'ingresso con due date, le scorciatoie «Quest'anno» e «Tutto», «Calcola Proposte»; e lo stato di attesa didattico — l'elenco delle regole con sigla e descrizione — al posto di una pagina vuota.

`RiconciliazioneClient` legge anche `?movimento=<id>` (`useSearchParams`, la pagina è già in `Suspense`): con quel parametro la coda mostra solo le proposte di quella riga bancaria (`bankTransactionId`), con un chip «Stai guardando un solo movimento · Mostra tutti» e il ritorno all'estratto conto (`/prima-nota/movimenti?register=BANK&movimento=<id>`). È l'indirizzo che l'azione «Riconcilia» dell'estratto conto apre già dalla consegna B: sostituendo la pagina, il contratto resta.

Vincoli di forma già pagati altrove: solo token semantici (`text-muted-foreground`, `bg-card`), mai colori cablati; `min-w-0` sui contenitori che ospitano la causale, che è lunga; se si usa un `Dialog`, `sm:max-w-*` e non `max-w-*`.

- [x] **Step 5: Provare nel browser su un lotto vero**

Avviare il server con un database locale (**non** la produzione), generare un lotto, e guardare: la causale non deve traboccare, le tre azioni devono essere raggiungibili, e il tema scuro non deve produrre testo invisibile.

- [x] **Step 6: Commit**

```bash
git add src/components/riconciliazione "src/app/(dashboard)/riconciliazione"
git commit -m "feat(riconciliazione): la coda delle proposte, con i fattori e le motivazioni in chiaro"
```

---

## Task 6: Lo storico, e «Riprendi»

**Files:**
- Create: `src/components/riconciliazione/StoricoLotti.tsx`
- Modify: `src/app/(dashboard)/riconciliazione/RiconciliazioneClient.tsx`

- [x] **Step 1: Il test**

```tsx
it('elenca i lotti col periodo, i contatori e la percentuale decisa', () => {})
it('«Riprendi» riapre la coda di quel lotto', () => {})
```

- [x] **Step 2: Vederlo fallire, poi implementare**

Una riga per lotto: periodo, `contaProposte`, `contaApprovate`, `contaScartate`, percentuale decisa, e «Riprendi». Il lavoro di riconciliazione è lungo e si interrompe: poterlo riprendere è la ragione per cui il lotto si persiste.

- [x] **Step 3: Commit**

```bash
git add src/components/riconciliazione "src/app/(dashboard)/riconciliazione"
git commit -m "feat(riconciliazione): lo storico dei lotti, con Riprendi"
```

---

## Task 7: Verifica finale

- [x] **Step 1: Le suite**

```bash
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:run
TEST_DB_SUFFIX=finale PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:integration
```

- [x] **Step 2: I cricchetti**

```bash
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run lint
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx tsc --noEmit
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:test
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run typecheck:e2e
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" node scripts/check-route-auth.mjs --ratchet
PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run knip
```

- [x] **Step 3: Le due build, che hanno severità diverse**

```bash
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npx next build --webpack
DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='placeholder' AUTH_SECRET='placeholder' PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH" npm run build
```

Mai incanalare in `tail`: il codice d'uscita diventerebbe quello di `tail`.

- [x] **Step 4: La domanda che chiude il taglio**

Si arriva a questa schermata dalla navigazione? `/riconciliazione` esiste già nel menu: verificare che porti alla coda nuova e non alla pagina vecchia.

---

## Dopo il piano

Nell'ordine, e ciascuno con la sua misura:

1. **Selezione multipla e approvazione in blocco**, quando la coda è stata usata su un lotto vero e la fascia Alta è cresciuta a 13.
2. **Riconciliazione a mano** con la ricerca dentro la scheda, e la memoria degli alias con la casella già spuntata.
3. **Il caso `FT 319` → `FDI/0000319`**: il suffisso numerico senza il prefisso del fornitore. Vale altri punti, ma è un allentamento più largo e merita la propria misura prima di essere scritto.

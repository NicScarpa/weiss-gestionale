# Allocation — Ondata B: rifiniture, ereditarietà pro-quota (Fase 3), AI + memoria (Fase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chiudere i finding rimandati dall'ondata A, far ereditare al movimento le fette pro-quota alla riconciliazione (con undo), e introdurre la proposta AI all'import fattura con la memoria delle overrule.

**Architecture:** spec approvata `docs/superpowers/specs/2026-08-05-allocation-design.md` (Fasi 3-4) + ledger ondata A (`/Users/nicolascarpa/Desktop/accounting/.superpowers/sdd/2026-08-05-allocation-fasi-0-2/progress.md`, sezione "DA PORTARE NEL PIANO ONDATA B"). Base di partenza: ondata A in produzione.

**Tech Stack:** come ondata A + `@anthropic-ai/sdk` (nuova dipendenza, Task 8) con structured output.

## Global Constraints

- **Directory di lavoro: SOLO il worktree `/Users/nicolascarpa/Desktop/accounting-stima` (branch main).** Il tree `/Users/nicolascarpa/Desktop/accounting` è di un'altra sessione: solo lettura/scrittura dei file `.superpowers`.
- MAI `git add -A` / `git add .` / `git commit -a`: staging esplicito per file.
- **`npm run db:push` e `prisma migrate` VIETATI** (DB condiviso): tabelle nuove SOLO via DDL esplicito con `npx prisma db execute --stdin` (pattern ondata A, vedi `.superpowers/sdd/2026-08-05-allocation-fasi-0-2/task-4-ddl.sql`).
- Invarianti ondata A da preservare: somma fette ≤ importo utile; fette presenti ⇒ accountId = conto dominante + `categorizationSource:'split'` + budgetCategoryId derivato; le fette 'manuale' vincono sulle 'ereditata'; `derivaBudgetCategoryDaConto` per ogni derivazione.
- **Mai passare fette a importo zero a `ripartisciProQuota`** (il residuo quadra sull'ultima fetta: filtrare a monte).
- AI best-effort assoluto: l'import fatture non fallisce MAI per l'AI; senza `ANTHROPIC_API_KEY` → skip con `logger.info`. Modello `claude-haiku-4-5`.
- TDD (test prima, RED osservato, GREEN, typecheck); suite base attuale: 560 verdi nel worktree (`npx vitest run`). `nvm use 22` prima di ogni npm install.

---

### Task 1: Rifiniture API — record, validazione conti, venue-scoping

**Files:**
- Modify: `src/app/api/invoices/[id]/record/route.ts` (righe ~102-116: create del movimento)
- Modify: `src/app/api/invoices/[id]/righe-conti/route.ts`
- Modify: `src/app/api/invoices/[id]/route.ts` (GET)
- Test: `src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts` (estendere)

**Interfaces:** consumes `derivaBudgetCategoryDaConto` da `@/lib/accounts/mapping`.

- [ ] **Step 1 (TDD su righe-conti):** test nuovo — PATCH con `accountId` inesistente o non attivo → 400 `{error:'Uno o più conti non esistono o non sono attivi'}` e NESSUN upsert (la validazione avviene prima di ogni scrittura, come per i numeroLinea). Mock `account.findMany`. RED verificato, poi implementazione: nella PATCH, prima del loop di upsert, `account.findMany({where:{id:{in: [...accountId distinti]}, isActive:true}})` e confronto con il Set richiesto (stesso pattern di setEntryAllocations). Aggiornare il mock di default degli altri test perché la validazione passi.
- [ ] **Step 2 (record):** in `record/route.ts`, la create del movimento imposta `accountId: invoice.accountId` senza categoria: aggiungere `budgetCategoryId: invoice.accountId ? await derivaBudgetCategoryDaConto(invoice.accountId) : null` e `categorizationSource: invoice.accountId ? 'manual' : undefined` (leggere prima la route per intero e adattarsi al suo stile; se esiste un file di test della route, estenderlo con un caso; se non esiste, copertura = typecheck + suite, dichiararlo nel report).
- [ ] **Step 3 (venue-scoping GET):** in `invoices/[id]/route.ts` GET, sostituire `findUnique({where:{id}})` con `findFirst({where:{id, venueId: await getVenueId()}})` (import getVenueId se manca). Verificare che PUT/DELETE nello stesso file abbiano già (o ricevano) lo stesso scoping — riportare nel report cosa si è trovato e fatto. I test esistenti di righe-conti non devono rompersi.
- [ ] **Step 4:** `npx vitest run` (intera suite) + `npx tsc --noEmit` puliti.
- [ ] **Step 5: Commit** — SOLO i file toccati:
```bash
git add "src/app/api/invoices/[id]/record/route.ts" "src/app/api/invoices/[id]/righe-conti/route.ts" "src/app/api/invoices/[id]/route.ts" "src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts"
git commit -m "fix(fatture): derivazione in registrazione, conti validati, venue-scoping"
```

---

### Task 2: Rifinitura service — no-op su svuotamento senza split

**Files:**
- Modify: `src/lib/services/allocation-service.ts`
- Test: `src/lib/services/__tests__/allocation-service.test.ts`

- [ ] **Step 1 (TDD):** test — `setEntryAllocations` con `fette: []` su un movimento SENZA fette manuali preesistenti (deleteMany → count 0, findMany → []) NON deve chiamare `journalEntry.update` (la source resta quella che era: niente riscrittura a 'manual' su un movimento mai suddiviso). RED, poi fix: nel ramo "nessuna fetta rimasta", eseguire l'update di ripristino SOLO se il deleteMany ha rimosso qualcosa (`deleteMany` restituisce `{count}` — usarlo). Il caso "svuotamento reale" (c'erano manuali) resta identico (test esistente verde).
- [ ] **Step 2:** file di test completo verde + typecheck.
- [ ] **Step 3: Commit**
```bash
git add src/lib/services/allocation-service.ts src/lib/services/__tests__/allocation-service.test.ts
git commit -m "fix(prima-nota): svuotare senza split non riscrive la categorizzazione"
```

---

### Task 3: Rifiniture UI — origine delle fette e filtro conti

**Files:**
- Modify: `src/app/api/prima-nota/route.ts` (select delle allocations: aggiungere `origine`)
- Modify: `src/types/prima-nota.ts` (tipo JournalEntryAllocation: `origine: 'manuale' | 'ereditata'`)
- Modify: `src/components/prima-nota/movimenti/SplitEntryDialog.tsx`
- Modify: `src/components/prima-nota/shared/AccountGroupedSelect.tsx`
- Modify: `src/components/invoices/InvoiceDetailSections.tsx` (o InvoiceDetail.tsx, dove monta la select per riga)

Comportamento:
1. La GET prima-nota espone `origine` nelle allocations (select esteso).
2. SplitEntryDialog: precompila SOLO le fette `origine==='manuale'`; le `ereditata` vengono mostrate in una sezione informativa in sola lettura ("Fette ereditate dalla riconciliazione: N, totale X €") e NON entrano nel payload del PUT (il service comunque non le toccherebbe, ma il dialog non deve proporle come modificabili né duplicarle). Il residuo mostrato tiene conto anche delle ereditate (somma manuali + ereditate ≤ importo).
3. AccountGroupedSelect: nuova prop opzionale `accountType?: string` che filtra la lista (query con parametro `?type=` già supportato da /api/accounts — verificarlo; se il parametro non esiste, filtrare client-side). La colonna Conto delle righe fattura la usa con `accountType="COSTO"` (coerente con l'header Categorizzazione).

UI senza test automatici: verifica typecheck + suite + lint.

- [ ] **Step 1:** implementare (leggere prima i file; l'ordine 1→2→3 evita tipi rotti).
- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run` puliti.
- [ ] **Step 3: Commit** — SOLO i 5 file:
```bash
git add src/app/api/prima-nota/route.ts src/types/prima-nota.ts src/components/prima-nota/movimenti/SplitEntryDialog.tsx src/components/prima-nota/shared/AccountGroupedSelect.tsx src/components/invoices/InvoiceDetailSections.tsx
git commit -m "fix(prima-nota): fette ereditate riconoscibili e conti filtrati per tipo"
```
(se il punto 3 tocca InvoiceDetail.tsx invece di InvoiceDetailSections.tsx, staggare quello ed elencarlo nel report).

---

### Task 4: Fase 3 — ereditarietà pro-quota alla riconciliazione

**Files:**
- Modify: `src/lib/services/schedule-reconciliation-service.ts`
- Modify: `src/lib/services/allocation-service.ts` (nuova funzione condivisa)
- Test: `src/lib/services/__tests__/schedule-reconciliation-service.test.ts` + `allocation-service.test.ts`

**Interfaces:**
- Produces in allocation-service: `calcolaPesiDaRighe(righe: Array<{accountId: string, importo: number}>): FettaInput[]` — pura: raggruppa per accountId sommando gli importi, scarta i totali ≤ 0, ordina per importo decrescente (stabilità del dominante e mai zero in coda).
- Produces in reconciliation-service (interna): `ereditaFetteDaFattura(tx, {journalEntryId, invoiceId, reconciliationId, quota})` chiamata DENTRO la transazione di `reconcileScheduleWithEntry`, dopo la create della reconciliation.

**Regole (dalla spec, vincolanti):**
1. Solo se `schedule.invoiceId` presente. La fattura si carica con `tx.electronicInvoice.findUnique({where:{id}, select:{lineItems: true}})` e le imputazioni con `tx.invoiceLineAccount.findMany({where:{invoiceId}})`.
2. **Copertura totale**: `lineItems` è un array JSON; se è null/non-array → non ereditare (log info: fattura senza righe estratte). Se `invoiceLineAccount.length < lineItems.length` → non ereditare (righe non tutte categorizzate; proposte incluse contano come categorizzate perché hanno una riga in tabella).
3. Se il movimento ha già fette `origine:'manuale'` → no-op (le manuali vincono).
4. Pesi = `calcolaPesiDaRighe(imputazioni.map(r => ({accountId: r.accountId, importo: Number(r.importo)})))`; fette = `ripartisciProQuota(pesi, quota)` con `origine:'ereditata'`, `reconciliationId`, createMany dentro la tx. La quota è la stessa `quota` della riconciliazione (saldo pieno e parziale = stesso codice; multi-rata accumula per reconciliationId).
5. Dopo la scrittura: rileggere TUTTE le fette del movimento (tx), calcolare il dominante, `tx.journalEntry.update` con accountId dominante + `budgetCategoryId` derivato + `categorizationSource:'split'` (riuso del pattern di setEntryAllocations; se un helper condiviso evita la duplicazione, estrarlo in allocation-service come `aggiornaContoDominante(tx, journalEntryId)` e usarlo in entrambi i punti — scelta consigliata).
6. Tutto best-effort DENTRO la tx? NO: l'ereditarietà fa parte della transazione di riconciliazione (spec: "aggancio DENTRO la transazione") — se fallisce per un bug, la riconciliazione fallisce e il chiamante lo vede; niente try/catch interno che mascheri inconsistenze. (Il best-effort vale per stima e AI, non per le fette.)

- [ ] **Step 1 (TDD, test nuovi nel file del reconciliation-service):**
  - fattura con 2 imputazioni (700 conto-a + 300 conto-b su lineItems di 2 righe), riconciliazione salda 1000 → createMany con fette 700/300 origine 'ereditata' + reconciliationId; update con dominante conto-a e source 'split'.
  - pagamento parziale 500 → fette 350/150.
  - copertura incompleta (2 lineItems, 1 imputazione) → nessuna createMany di fette.
  - fette manuali preesistenti → nessuna createMany.
  - scadenza senza invoiceId → nessuna lettura fattura.
  - (in allocation-service.test) `calcolaPesiDaRighe`: raggruppa, scarta zero, ordina decrescente.
  I mock del file reconciliation esistente vanno estesi (electronicInvoice.findUnique, invoiceLineAccount {findMany, createMany}, journalEntryAllocation {findMany}); attenzione: la factory `scadenza()` deve poter avere `invoiceId`.
- [ ] **Step 2: RED verificato, implementazione, GREEN** (tutti i test dei due file + suite intera) + typecheck.
- [ ] **Step 3: Commit**
```bash
git add src/lib/services/schedule-reconciliation-service.ts src/lib/services/allocation-service.ts src/lib/services/__tests__/schedule-reconciliation-service.test.ts src/lib/services/__tests__/allocation-service.test.ts
git commit -m "feat(prima-nota): il movimento eredita le fette della fattura pro-quota"
```

---

### Task 5: Fase 3 — undo dell'ereditarietà

**Files:**
- Modify: `src/lib/services/schedule-reconciliation-service.ts` (undoScheduleReconciliation)
- Test: `src/lib/services/__tests__/schedule-reconciliation-service.test.ts`

**Regole:** dentro la transazione dell'undo: `tx.journalEntryAllocation.deleteMany({where:{reconciliationId}})`; poi rileggere le fette residue del movimento: se ne restano → ricalcolo dominante (stesso helper del Task 4); se non ne restano → `categorizationSource:'manual'` (stesso comportamento dello svuotamento manuale; accountId resta l'ultimo valorizzato).

- [ ] **Step 1 (TDD):** test — undo rimuove SOLO le fette della propria riconciliazione (deleteMany col reconciliationId giusto); con fette residue → update dominante; senza residue → update source 'manual' senza cambiare accountId.
- [ ] **Step 2: RED → GREEN + suite + typecheck.**
- [ ] **Step 3: Commit**
```bash
git add src/lib/services/schedule-reconciliation-service.ts src/lib/services/__tests__/schedule-reconciliation-service.test.ts
git commit -m "feat(prima-nota): l'annullamento della riconciliazione ritira le fette ereditate"
```

---

### Task 6: Fase 4 — schema `SupplierProductAccount` (memoria delle overrule)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Modello** (relazioni inverse su Venue, Supplier, Account):

```prisma
/// Memoria delle imputazioni per prodotto del fornitore: "il pane di questo
/// fornitore va su questo conto". Scritta a ogni conferma/overrule manuale
/// delle righe fattura; ha precedenza sull'AI (che può solo rimetterla in
/// dubbio riportando la riga a 'proposta').
/// Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 4).
model SupplierProductAccount {
  id               String   @id @default(cuid())
  venueId          String   @map("venue_id")
  supplierId       String   @map("supplier_id")
  /// Nome prodotto normalizzato (normalizeProductName di src/lib/price-tracking)
  nomeNormalizzato String   @map("nome_normalizzato")
  codiceArticolo   String?  @map("codice_articolo")
  accountId        String   @map("account_id")
  conferme         Int      @default(1)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  venue    Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  account  Account  @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@unique([venueId, supplierId, nomeNormalizzato])
  @@index([supplierId, codiceArticolo])
  @@map("supplier_product_accounts")
}
```

- [ ] **Step 2: DDL esplicito** (NO db push) — CREATE TABLE "supplier_product_accounts" con le colonne snake_case, UNIQUE INDEX "supplier_product_accounts_venue_id_supplier_id_nome_normalizzato_key", indice su (supplier_id, codice_articolo), FK: venue_id→"venues"(id) CASCADE (verificare il @@map reale di Venue), supplier_id→"suppliers"(id) CASCADE (verificare @@map di Supplier), account_id→"accounts"(id) RESTRICT; tutte ON UPDATE CASCADE. Script in `.superpowers/sdd/2026-08-05-allocation-fasi-3-4/task-6-ddl.sql`, eseguito con `npx prisma db execute --stdin`; verifica su information_schema con script node read-only (pattern task-4-verify.mjs dell'ondata A); output nel report.
- [ ] **Step 3:** `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — SOLO `prisma/schema.prisma`:
```bash
git add prisma/schema.prisma
git commit -m "feat(fatture): memoria delle imputazioni per prodotto del fornitore"
```

---

### Task 7: Fase 4 — scrittura della memoria alla conferma manuale

**Files:**
- Modify: `src/app/api/invoices/[id]/righe-conti/route.ts`
- Test: `src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts`

**Regole:** nella PATCH, per ogni riga scritta con `fonte:'manuale'` (upsert del ramo `righe`): se la fattura ha `supplierId`, upsert su SupplierProductAccount con chiave (venueId, supplierId, nomeNormalizzato = `normalizeProductName(descrizione)` riusata da `src/lib/price-tracking`) — update: `accountId`, `codiceArticolo` (se presente sulla riga), `conferme: {increment: 1}`; create: conferme 1. `confermaTutte` NON scrive memoria (conferma proposte esistenti, non un'imputazione nuova dell'utente — le proposte confermate in blocco hanno già la loro fonte). Best-effort: try/catch con logger attorno alla sola scrittura memoria (un errore non deve far fallire la PATCH). La fattura va caricata con `supplierId` nel select esistente.

- [ ] **Step 1 (TDD):** test — PATCH righe con fattura con supplierId → upsert memoria con chiave e increment attesi; fattura senza supplierId → nessun upsert; confermaTutte → nessun upsert. Mock `supplierProductAccount.upsert` + estensione select fattura.
- [ ] **Step 2: RED → GREEN + typecheck.**
- [ ] **Step 3: Commit**
```bash
git add "src/app/api/invoices/[id]/righe-conti/route.ts" "src/app/api/invoices/[id]/righe-conti/__tests__/route.test.ts"
git commit -m "feat(fatture): le conferme manuali alimentano la memoria fornitore-prodotto"
```

---

### Task 8: Fase 4 — pipeline di categorizzazione (memoria + AI)

**Files:**
- Create: `src/lib/line-categorization/index.ts`
- Test: `src/lib/line-categorization/__tests__/index.test.ts`
- Modify: `package.json` / `package-lock.json` (nuova dipendenza)

**Prerequisito tecnico:** `nvm use 22 && npm install @anthropic-ai/sdk` nel worktree (il postinstall rigenera prisma: ok). package.json e package-lock vanno committati in questo task.

**Interfaces:**
- Produces: `categorizzaRigheFattura({invoiceId, venueId}): Promise<void>` — best-effort assoluto (try/catch con logger.error, mai solleva). Chiamata dal Task 9.

**Algoritmo (dalla spec, vincolante):**
1. Carica la fattura (`electronicInvoice.findUnique`: `supplierId`, `xmlContent`, `venueId`già noto) — solo fatture con `xmlContent`; righe da `parseFatturaPA(xmlContent).dettaglioLinee` (parser base: ha `codiceArticolo` dall'ondata A). Se righe vuote o fattura senza supplierId per il matching memoria → si passa comunque all'AI con memorie vuote (il supplierId serve solo alla memoria).
2. Salta le righe che hanno GIÀ una InvoiceLineAccount (mai sovrascrivere: reimport/ri-esecuzione idempotente).
3. **Memoria prima**: per le righe scoperte, carica le SupplierProductAccount del fornitore; match per `codiceArticolo` esatto (se entrambi presenti), poi per `nomeNormalizzato`. Le righe matchate si scrivono subito: `stato:'confermata'`, `fonte:'regola-appresa'`, accountId dalla memoria, snapshot descrizione/codiceArticolo/importo.
4. **AI poi**, se `process.env.ANTHROPIC_API_KEY` presente e restano righe (o ci sono righe matchate da ri-verificare): UNA chiamata `client.messages.parse` con modello `claude-haiku-4-5`, `max_tokens: 4096`, structured output via `zodOutputFormat`:

```ts
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

const RispostaAi = z.object({
  righe: z.array(z.object({
    numeroLinea: z.number(),
    accountId: z.string(),
    confidence: z.number(),
    motivo: z.string(),
    dubbioSuMemoria: z.boolean(),
  })),
})
```

   Prompt (user message unico, niente system elaborato): il piano dei conti attivi di tipo COSTO raggruppato per categoria derivata (id + nome per ciascun conto), le memorie del fornitore come few-shot ("questo fornitore: 'PANE COMUNE' → conto X"), e le righe della fattura (numeroLinea, descrizione, codiceArticolo, importo), marcando quelle già risolte dalla memoria con il conto assegnato e chiedendo per queste solo l'eventuale dubbio. Richiesta: per ogni riga scoperta un conto con confidence 0-1 e motivo breve in italiano; `dubbioSuMemoria: true` solo se una riga marcata sembra imputata male.
5. **Validazione anti-allucinazione**: scarta (con logger.warn) le righe della risposta il cui accountId non è fra i conti passati nel prompt o il cui numeroLinea non esiste.
6. Scritture: righe scoperte → create InvoiceLineAccount `stato:'proposta'`, `fonte:'ai'`, confidence, motivazioneAi=motivo; righe con `dubbioSuMemoria` → update della riga 'regola-appresa' a `stato:'proposta'` con motivazioneAi (fonte resta 'regola-appresa': la UI mostra il giallo).
7. `response.parsed_output` può essere null (parse fallito) e `stop_reason` può essere 'refusal': in entrambi i casi log e stop, le scritture della memoria (punto 3) restano valide.

- [ ] **Step 1 (TDD):** mock di `@anthropic-ai/sdk` (`vi.mock` con classe Anthropic finta il cui `messages.parse` è vi.fn()), di prisma e del parser. Casi: (a) match memoria per codice esatto → riga scritta 'confermata'/'regola-appresa' (l'AI, quando la chiave c'è, riceve comunque le righe matchate per l'eventuale dubbio); (b) righe scoperte → chiamata parse con modello claude-haiku-4-5 e create 'proposta'/'ai' con confidence/motivo; (c) accountId allucinato → scartato; (d) dubbioSuMemoria → update a 'proposta'; (e) senza ANTHROPIC_API_KEY → nessuna chiamata AI, restano le scritture memoria; (f) errore della chiamata → nessuna eccezione propagata; (g) righe già presenti in tabella → mai sovrascritte.
- [ ] **Step 2: RED → GREEN + typecheck + suite intera.**
- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json src/lib/line-categorization/index.ts src/lib/line-categorization/__tests__/index.test.ts
git commit -m "feat(fatture): proposta AI delle imputazioni con memoria del fornitore"
```

---

### Task 9: Fase 4 — aggancio all'import fatture

**Files:**
- Modify: `src/app/api/invoices/route.ts` (accanto al price tracking, ~riga 520)
- Test: nessuno nuovo (aggancio one-line best-effort, pattern del price tracking; il motore è coperto dal Task 8 — trade-off deliberato, dichiararlo nel report)

- [ ] **Step 1:** dopo il blocco best-effort del price tracking (e dopo ricalcolaStimeFornitore), aggiungere:
```ts
    // Proposta delle imputazioni per riga: memoria del fornitore + AI.
    // Best-effort: l'import non fallisce mai per la categorizzazione
    await categorizzaRigheFattura({ invoiceId: invoice.id, venueId: invoice.venueId })
```
con l'import in testa. Solo per fatture passive: verificare come la route distingue (oggi tutte le fatture importate sono passive — coerente con l'ondata A; nessun gate extra).
- [ ] **Step 2:** typecheck + suite intera (il file è importato dai test della route scadenzario? no — ma la suite conferma zero regressioni).
- [ ] **Step 3: Commit**
```bash
git add src/app/api/invoices/route.ts
git commit -m "feat(fatture): la categorizzazione delle righe parte all'import"
```

---

### Task 10: Chiusura ondata B

- [ ] **Step 1:** `npx vitest run` (numeri esatti nel report) + `npx tsc --noEmit` + eslint sui percorsi toccati (0 errori nuovi).
- [ ] **Step 2: Smoke di avvio** — `PORT=3107 npm run dev` nel worktree; /login → 200; `/api/invoices` e `/api/prima-nota` senza sessione → 307/401 senza crash; kill e porta libera. Nessun dato di produzione toccato.
- [ ] **Step 3: Documentazione** — in `docs/Ciclo_Tesoreria_Modello_Sibill.md`, sezione "Altre cose aperte": la voce sulle **allocation** va aggiornata (non è più aperta: rimandare alla spec e a una nuova sottosezione breve "Allocation ✅" nello stile delle fasi, che riassuma asse sul conto, split manuale, righe fattura, ereditarietà pro-quota con undo, memoria + AI con prerequisito ANTHROPIC_API_KEY). Commit SOLO del doc: `docs(allocation): il ciclo delle allocation è completo`.
- [ ] **Step 4:** Report finale. NON pushare (decide il controller).


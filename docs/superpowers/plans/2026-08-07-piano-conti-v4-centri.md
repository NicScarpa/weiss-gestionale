# Piano esecutivo — Piano dei conti WEISS v4 + centri di costo

Deriva dal piano approvato (FASE 1) del 7 ago 2026. Spec di contesto: il piano dei conti ufficiale WEISS v4 (155 voci, mastri 10-33) sostituisce i 20 conti segnaposto; ogni movimento acquisisce il centro di costo (STR/WEISS/VV/CAS) con regola per voce (Obbligatorio | Default STR) e il campo `azienda`. Design completo nelle sezioni dei task; fonte di verità dei dati: `docs/Piano_dei_conti_gestionale_WEISS_v4.xlsx`.

## Global Constraints

- **DB**: `npm run db:push` e `prisma migrate` VIETATI. Schema solo via DDL esplicito committato + `npx prisma db execute --stdin` sull'ambiente ISOLATO (porta 5433). Il `.env` del repo punta alla PRODUZIONE: NESSUN comando (script, seed, db execute) va eseguito contro il DATABASE_URL del `.env` — la produzione si tocca solo nei momenti di rollout coordinati dal controller, mai da un task.
- **Node**: anteporre `nvm use 22` a npm/npx (il Node di sistema è incompatibile).
- **Excel = fonte di verità**: nomi, codici, struttura e regole CdC delle 155 voci si trascrivono VERBATIM; nessuna rinomina/riorganizzazione di iniziativa.
- **Test**: vitest, prisma mockato, test colocati in `__tests__/`; ogni task chiude con la sua suite verde + `npx tsc --noEmit` pulito.
- **Convenzioni codice**: zod in `src/lib/validations/`; regole di business nei service con esito discriminato `{outcome: 'ok'|'invalid', ...}` e route che mappa lo status; errori 4xx con messaggio in italiano + `code` macchina; `createAuditLog` sulle mutazioni; soft-delete su JournalEntry (estensione prisma).
- **Commit**: messaggio in italiano `tipo(scope): descrizione`, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Un commit per task salvo indicazione.
- **Quadratura chiusure intoccabile**: nessun refactor può cambiare numero righe/importi/registri/date dei movimenti generati dalla validazione chiusura.
- **`azienda` mai da input utente** (default DB 'WEISS S.r.l.', zero UI).
- I file `docs/~$*.xlsx` (lock di Excel) non vanno MAI committati.

---

## Task 1 — Fonte dati del piano v4 + test di coerenza

**Crea `src/lib/accounts/piano-conti-weiss-v4.ts`** con:

```ts
export type RegolaCentro = 'OBBLIGATORIO' | 'DEFAULT_STR'
export interface VocePianoV4 {
  code: string          // "20.1.01"
  nome: string
  tipo: 'RICAVO' | 'COSTO'
  mastroCode: string    // "20"
  mastroNome: string    // "Materie prime, sussidiarie e merci"
  gruppoCode?: string   // "20.1" — presente solo nei mastri 20, 28, 32
  gruppoNome?: string   // "Beverage alcolico"
  regolaCentro: RegolaCentro
  nota?: string         // colonna G dell'Excel, se presente
}
export const PIANO_CONTI_WEISS_V4: readonly VocePianoV4[] = [ /* 155 voci */ ]

export interface CentroDiCostoSeed { code: string; name: string; description: string; isDefault: boolean }
export const CENTRI_DI_COSTO: readonly CentroDiCostoSeed[] = [
  { code: 'STR',   name: 'Struttura / Amministrazione', description: "Costi (e proventi) comuni non attribuibili a un locale: amministrazione, consulenze, compenso amministratore, oneri societari. Riceve i movimenti con regola 'Default STR'.", isDefault: true },
  { code: 'WEISS', name: 'Weiss Cafè',                  description: 'Locale di Sacile: gestione ordinaria ed eventi (stagione fredda).', isDefault: false },
  { code: 'VV',    name: 'Villa Varda Bistrot',         description: 'Bistrot Caffè Letterario a Brugnera: gestione ordinaria ed eventi del giovedì.', isDefault: false },
  { code: 'CAS',   name: 'Casetta',                     description: "Stand stagionale: tre weekend (gio-dom) + circa 30 aperture nel periodo natalizio. Registratore di cassa e POS propri (l'accredito su conto Weiss è solo tesoreria).", isDefault: false },
]
```

**Sorgente dati**: l'estrazione completa e verificata dell'Excel è in
`/Users/nicolascarpa/.claude/projects/-Users-nicolascarpa-Desktop-accounting/62ea905c-f60f-4c48-8945-db4b75e1f4da/tool-results/b7s2lwaqc.txt`
(foglio "Piano dei conti", righe 2-156: colonne A=Codice, B=Sezione RICAVI|COSTI, C=Mastro "NN - Nome", D=Gruppo "NN.N - Nome" (opzionale), E=Voce, F=Regola centro di costo "Obbligatorio"|"Default STR", G=Note). Trascrizione VERBATIM: `tipo` = RICAVO se B=RICAVI altrimenti COSTO; `mastroCode`/`mastroNome` splittando C su " - " (primo separatore); idem gruppo da D; `regolaCentro`: 'Obbligatorio'→'OBBLIGATORIO', 'Default STR'→'DEFAULT_STR'; `nota` = G se presente. NIENTE correzioni ortografiche o riformulazioni.

**Test colocato `src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts`**: 155 voci totali; 12 RICAVO + 143 COSTO; codici univoci; regex `^\d{2}\.(\d\.)?\d{2}$` su ogni code; `gruppoCode` presente ⟺ mastro ∈ {20, 28, 32}, e coerenza prefissi (`gruppoCode.startsWith(mastroCode + '.')`, `code.startsWith((gruppoCode ?? mastroCode) + '.')`); mastri RICAVO ∈ 10-13, COSTO ∈ 20-33; ordinamento lessicografico dell'array = ordinamento per code (l'array è già ordinato); ogni voce ha regolaCentro; gruppoNome presente ⟺ gruppoCode presente; centri: 4, code unici, esattamente un isDefault (STR). Verifiche puntuali a campione: `20.1.01` = "Birra fusto" OBBLIGATORIO gruppo "20.1"; `28.1.09` = "Retribuzioni personale amministrativo" DEFAULT_STR; `30.14` = "SIAE e SCF musica d'ambiente" OBBLIGATORIO senza gruppo; `10.01` = "Corrispettivi" OBBLIGATORIO.

**Include nel commit** anche `docs/Piano_dei_conti_gestionale_WEISS_v4.xlsx` (oggi untracked). NON committare `docs/~$Piano_dei_conti_gestionale_WEISS_v4.xlsx`.

Commit: `feat(conti): fonte dati del piano dei conti WEISS v4`

---

## Task 2 — DDL centri di costo e colonne piano v4 + schema Prisma + RLS

**Crea `prisma/migrations/2026-08-07_piano_v4_centri_costo.sql`** (idempotente, doppia esecuzione senza errori):

- `DO $$ ... CREATE TYPE "CostCenterRule" AS ENUM ('OBBLIGATORIO','DEFAULT_STR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- Tabella `cost_centers`: id TEXT PK, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, is_default BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP; `CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_one_default ON cost_centers (is_default) WHERE is_default;`
- `accounts`: ADD COLUMN IF NOT EXISTS mastro_code TEXT, mastro_nome TEXT, gruppo_code TEXT, gruppo_nome TEXT, cost_center_rule "CostCenterRule" NOT NULL DEFAULT 'DEFAULT_STR', system_key TEXT; unique index su system_key; index su mastro_code.
- `journal_entries`: ADD COLUMN IF NOT EXISTS cost_center_id TEXT (FK → cost_centers ON DELETE RESTRICT via ADD CONSTRAINT separato, guardato da `DO $$ ... duplicate_object`), azienda TEXT NOT NULL DEFAULT 'WEISS S.r.l.'; index su cost_center_id.
- `daily_closures` e `daily_expenses`: ADD COLUMN IF NOT EXISTS cost_center_id TEXT + FK Restrict (stesso pattern).
- `schedule_rules`: ADD COLUMN IF NOT EXISTS cost_center_id TEXT + FK Restrict (centro esplicito opzionale della regola scadenzario; la logica arriva col Task 6, la UI col Task 13).
- RLS su cost_centers: ENABLE + FORCE + policy come in `enable_rls_all_tables.sql`.

**`prisma/schema.prisma`**: enum `CostCenterRule`; modello `CostCenter` (@@map cost_centers, campi come DDL, relazioni journalEntries/dailyClosures/dailyExpenses); su `Account`: mastroCode/mastroNome/gruppoCode/gruppoNome String? @map, costCenterRule CostCenterRule @default(DEFAULT_STR) @map("cost_center_rule"), systemKey String? @unique @map("system_key"); su `JournalEntry`: costCenterId String? @map("cost_center_id") + relazione onDelete Restrict + @@index, azienda String @default("WEISS S.r.l."); su `DailyClosure`, `DailyExpense` e `ScheduleRule`: costCenterId String? + relazione Restrict. Poi `npx prisma generate` e `npx prisma validate` (MAI db push).

**`prisma/migrations/enable_rls_all_tables.sql`**: riallineare l'array dei nomi tabella allo schema COMPLETO attuale (mancano 22 tabelle, fra cui journal_entry_allocations, invoice_line_accounts, supplier_product_accounts, payments, schedules, audit_logs) + aggiungere cost_centers. Solo l'array: la logica non cambia.

**Verifica**: eseguire il DDL DUE volte sull'ambiente isolato 5433 (idempotenza), `npx prisma validate`, `npx tsc --noEmit`.

Commit: `feat(conti): DDL centri di costo e colonne piano v4`

---

## Task 3 — Script produzione 01 (centri+sistema+permesso), seed dev, verifica

- **`scripts/piano-v4/01-centri-e-sistema.ts`** (tsx, stesso stile del seed: PrismaPg + Pool da DATABASE_URL): upsert dei 4 centri per `code` da `CENTRI_DI_COSTO`; `accounts.update` systemKey sui patrimoniali per code: '100'→'CASSA', '110'→'BANCA', '200'→'DEBITI_FORNITORI' (skip con warn se il conto manca); upsert permesso `{ code: 'journal.edit-closure', description: 'Riclassificare movimenti da chiusura', module: 'journal' }` assegnato al ruolo admin (pattern del seed per role_permissions). Idempotente. NESSUN inserimento delle 155 voci (arrivano con la migrazione FASE 3).
- **`prisma/seed.ts`**: sostituire l'array dei 20 conti demo con: 3 patrimoniali (100 Cassa ATTIVO systemKey CASSA, 110 Banca ATTIVO systemKey BANCA, 200 Debiti v/fornitori PASSIVO systemKey DEBITI_FORNITORI) + le 155 voci da `PIANO_CONTI_WEISS_V4` (map → code, name=nome, type=tipo, mastro/gruppo, costCenterRule=regolaCentro; systemKey 'CORRISPETTIVI' sulla voce 10.01) + i 4 centri + il permesso `journal.edit-closure` al ruolo admin. Rimuovere ogni riferimento residuo ai vecchi codici nel seed.
- **`scripts/piano-v4/verifica.ts`** (tsx, sola lettura): conta e stampa — voci v4 attive (attese 155), centri (4, un default STR), systemKey presenti, permesso presente; exit code ≠ 0 se un'attesa fallisce. Servirà dopo seed dev e dopo i rollout.

**Verifica**: `nvm use 22 && npm run db:seed` sull'ambiente ISOLATO 5433 + `npx tsx scripts/piano-v4/verifica.ts` verde sullo stesso ambiente.

Commit: `feat(conti): script centri e conti di sistema, seed dev sul piano v4`

---

## Task 4 — Service di risoluzione del centro di costo

**Crea `src/lib/services/cost-center-service.ts`** + test colocato.

```ts
export type RisoluzioneCentro =
  | { outcome: 'ok'; costCenterId: string }
  | { outcome: 'invalid'; motivo: string; code: 'CENTRO_DI_COSTO_OBBLIGATORIO' | 'CENTRO_DI_COSTO_NON_VALIDO' }

export async function risolviCentroDiCosto(
  db: Pick<PrismaClient, 'costCenter' | 'account'>,   // accetta anche tx client
  input: { accountId?: string | null; costCenterId?: string | null; accountIdsFette?: string[] }
): Promise<RisoluzioneCentro>
```

Semantica (ordine esatto):
1. `costCenterId` fornito → findUnique: esiste e `isActive` → ok; altrimenti invalid CENTRO_DI_COSTO_NON_VALIDO "Centro di costo inesistente o disattivato.".
2. Mancante → carica `costCenterRule` del conto (se accountId) e delle voci di `accountIdsFette`; se ALMENO UNA è OBBLIGATORIO → invalid CENTRO_DI_COSTO_OBBLIGATORIO "Il conto {code} — {name} richiede un centro di costo." (il conto citato è il primo OBBLIGATORIO incontrato).
3. Altrimenti → `findFirst({ where: { isDefault: true, isActive: true } })` → ok col suo id; se assente → `throw new Error('Nessun centro di costo di default configurato')` (errore di configurazione, non invalid).
4. Nessun conto e nessuna fetta → ramo 3 (default STR).

Test (prisma mockato): centro fornito valido → ok; inesistente/inattivo → invalid NON_VALIDO; conto OBBLIGATORIO senza centro → invalid OBBLIGATORIO col code+name nel motivo; conto DEFAULT_STR → ok STR; senza conto → ok STR; fette miste (una OBBLIGATORIO) → invalid; fette tutte DEFAULT_STR + conto null → ok STR; default assente → throw.

Commit: `feat(centri): service di risoluzione e validazione del centro di costo`

---

## Task 5 — Conti di sistema (fix trappola Banca)

- **Crea `src/lib/accounts/system.ts`**: `export type SystemAccountKey = 'CASSA' | 'BANCA' | 'DEBITI_FORNITORI' | 'CORRISPETTIVI'`; `getSystemAccount(key)` → `prisma.account.findUnique({ where: { systemKey: key } })`, throw `Error("Conto di sistema {key} non configurato: impostare accounts.system_key")` se assente o inattivo; `getSystemAccountOptional(key)` → null se assente (per il fallback chiusure del Task 7). Test colocato.
- **Fix `src/app/api/invoices/[id]/record/route.ts:82-96`**: sostituire il findFirst con euristica (`code 'BANCA' | '1001' | name contains 'Banca'`) con `getSystemAccount('BANCA')`; il catch della route mappa l'errore di configurazione su 400 con messaggio italiano (comportamento oggi: 400 "Conto Banca non trovato nel piano dei conti" — conservarlo come testo).
- Aggiornare i test della route record se esistono; altrimenti aggiungere test minimi del nuovo helper mockando prisma.

Commit: `feat(conti): conti di sistema espliciti al posto dell'euristica sul nome`

---

## Task 6 — Validazione del centro nei punti di scrittura

Integrare `risolviCentroDiCosto` (Task 4). Pattern: la route/service risolve PRIMA di scrivere; `invalid` → 400 `{ error: motivo, code }`. Lo zod accetta `costCenterId: z.string().optional().nullable()` dove indicato. `azienda` mai nel payload.

| Punto | Modifica |
|---|---|
| `src/lib/validations/prima-nota.ts` | `costCenterId` opzionale in create/update schema |
| `src/app/api/prima-nota/route.ts` POST | risolvi con accountId+costCenterId del body; salva costCenterId risolto |
| `src/app/api/prima-nota/[id]/route.ts` PUT | se cambia accountId o costCenterId → rivalidare col nuovo stato (per i movimenti con closureId resta il blocco attuale: il ramo admin arriva col Task 8) |
| `src/app/api/prima-nota/[id]/categorize/route.ts` e `recategorize/route.ts` | al cambio conto: se il nuovo conto è OBBLIGATORIO e il movimento non ha centro → 400 (categorize) / skip della riga con conteggio "saltati" (recategorize batch, non deve fallire tutto) |
| `src/app/api/prima-nota/import/route.ts` | per riga: risolvi (i movimenti da import non hanno conto → STR); se in futuro la riga porta un conto OBBLIGATORIO senza centro → riga scartata col motivo, le altre passano |
| `src/app/api/prima-nota/versamento/route.ts` | giroconto: risolvi senza conto → STR su entrambe le scritture |
| `src/app/api/pagamenti/[id]/esegui/route.ts` | accetta costCenterId opzionale; risolvi; 400 su invalid |
| `src/app/api/invoices/[id]/record/route.ts` | accetta costCenterId opzionale nel body; la regola si valuta sul conto ECONOMICO del movimento (invoice.accountId), non sulla contropartita banca; 400 su invalid |
| `src/lib/services/allocation-service.ts` `setEntryAllocations` | prima di scrivere: `risolviCentroDiCosto({ accountId: null, costCenterId: movimento.costCenterId, accountIdsFette })`; se il movimento NON ha centro e una voce delle fette è OBBLIGATORIO → `{ outcome: 'invalid', motivo: 'Scegli il centro di costo del movimento prima di suddividerlo.' }` (nuovo ramo dell'esito esistente). `aggiornaContoDominante` NON valida. |
| `src/lib/schedule-rules/engine.ts` `applicaRegolaCreaMovimento` | la colonna `ScheduleRule.costCenterId` esiste dal Task 2: risolvi con `costCenterId: regola.costCenterId`; se l'esito è invalid (voce OBBLIGATORIO e regola senza centro) → NON bloccare la generazione: centro STR (default) + `verified: false` + `logger.warn`; altrimenti usa il centro risolto. |
| `schedule-reconciliation-service.ts` `ereditaFetteDaFattura` | nessuna validazione; aggiungere doc-comment che spiega perché (movimento già validato a monte) |

Test: aggiornare i test di route esistenti + nuovi casi 400 (`CENTRO_DI_COSTO_OBBLIGATORIO` su POST prima-nota e invoices/record; split bloccato senza centro; engine → STR + verified false con warn).

Commit: `feat(centri): validazione della regola centro di costo nei punti di scrittura`

---

## Task 7 — Chiusure: movimenti generati imputati (conto + centro)

**`src/lib/validations/chiusura-cassa.ts`** (o file zod effettivo delle chiusure): `costCenterId` opzionale in testata + opzionale sulle righe spesa.

**`src/lib/closure-journal-entries.ts`** — refactor SENZA cambiare numero righe/importi/registri/date:
- Input esteso col `costCenterId` di testata (dalla chiusura) e per riga spesa (`expense.costCenterId ?? testata`).
- Centro: TUTTI i movimenti generati ricevono costCenterId (testata; le spese l'override di riga se presente). Se la chiusura non ha centro (storico) → risolvi default STR? NO: le chiusure nuove avranno testata obbligatoria dal form (Task 14); per il service, testata assente → fallback WEISS? Decisione dal piano approvato: il default di prodotto è WEISS ma è la UI a garantirlo; il service usa `costCenterId ?? (centro di default STR)` per non inventare WEISS silenziosamente. Documentare nel doc-comment.
- Conto: incasso contanti → accountId = voce CORRISPETTIVI (`getSystemAccountOptional('CORRISPETTIVI')`), counterpartId = CASSA; incasso POS → CORRISPETTIVI / BANCA; versamento (coppia) → patrimoniali CASSA/BANCA incrociati (origine→account, destinazione→counterpart) come struttura attuale; spese → invariate (accountId della riga) + counterpartId CASSA se oggi assente. Se `CORRISPETTIVI` non esiste (produzione pre-FASE 3) → accountId/counterpartId come oggi (null), centro comunque applicato: NESSUNA regressione.
- La validazione della chiusura passa da `src/lib/services/closure-service.ts`: raccordare il passaggio del centro di testata/righe.

Test: unit sul mapping (con CORRISPETTIVI presente e assente), invariante "stesso numero di movimenti e stessi importi di prima" (i test esistenti delle chiusure devono restare verdi), centro testata propagato, override riga rispettato.

Commit: `feat(chiusure): movimenti generati imputati con conto e centro`

---

## Task 8 — Riclassifica admin dei movimenti da chiusura

**`src/app/api/prima-nota/[id]/route.ts` PUT**: il rifiuto in blocco sui movimenti con `closureId` diventa un ramo dedicato PRIMA del blocco attuale:
- Richiede permesso `journal.edit-closure` (verifica via ruolo admin come fanno le altre route admin; il permesso esiste da Task 3). Senza → 403 identico a oggi.
- Whitelist: il body può contenere SOLO `accountId` e/o `costCenterId`; qualunque altra chiave presente → 400 `{ code: 'MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA', error: 'Sui movimenti generati da chiusura si possono modificare solo conto e centro di costo.' }`.
- Rivalidazione con `risolviCentroDiCosto` (nuovo conto OBBLIGATORIO e centro assente → 400).
- `createAuditLog` con oldValues/newValues di accountId e costCenterId (action UPDATE, entityType JournalEntry).
- DELETE sui movimenti con closureId resta vietato.

Test: 403 senza permesso; 400 con campo extra (es. debitAmount); 200 riclassifica valida + audit chiamato con before/after; 400 conto OBBLIGATORIO senza centro.

Commit: `feat(prima-nota): riclassifica admin di conto e centro sui movimenti da chiusura`

---

## Task 9 — Prompt AI raggruppato per mastro/gruppo

**`src/lib/line-categorization/index.ts`**:
- La fetch dei conti aggiunge `mastroNome`, `gruppoNome` alla select.
- `costruisciPrompt`: raggruppamento per `gruppoNome ?? mastroNome ?? 'Non categorizzato'`; ELIMINARE le chiamate a `derivaBudgetCategoryDaConto` e le query su `budgetCategory` dentro il prompt (restano intatte altrove: categorize/regole/engine continuano a derivare il budgetCategoryId del movimento).
- Ordine dei gruppi nel prompt: per primo codice contenuto (ordinamento naturale per mastro/gruppo), 'Non categorizzato' in fondo.

Test `src/lib/line-categorization/__tests__/index.test.ts`: aggiornare i fixture del prompt (raggruppamento nuovo, niente mock del mapping budget); il filtro `type: 'COSTO', isActive: true` resta invariato.

Commit: `feat(ai): prompt di categorizzazione raggruppato per mastro e gruppo`

---

## Task 10 — Cache e offline

- `src/lib/cache.ts` `getCachedAccounts`: includere mastro/gruppo/costCenterRule nella select (stessa forma del payload API arricchito del Task 11).
- `src/lib/offline/sync.ts`: aggiungere i campi nuovi ai conti sincronizzati; nuovo store `costCenters` (sync da `/api/cost-centers`, Task 11); bump della versione dello schema IndexedDB per forzare la risincronizzazione dei dispositivi.

Test: aggiornare eventuali test colocati; typecheck.

Commit: `chore(offline): conti con gerarchia e centri di costo in cache e sync`

---

## Task 11 — API arricchite + AccountCombobox

- **`src/app/api/accounts/route.ts` GET**: nuovi parametri `?imputable=true` (solo conti con `mastroCode` NOT NULL — cioè voci del piano v4; i patrimoniali restano fuori dai form economici ma escono senza il flag) e `?types=COSTO,RICAVO` (CSV, retrocompatibile con `?type=`); il select base include mastroCode/mastroNome/gruppoCode/gruppoNome/costCenterRule. Il payload `budgetCategory` resta per compatibilità.
- **Nuova route `src/app/api/cost-centers/route.ts`** GET (auth richiesta, nessun ruolo): lista `{ id, code, name, isDefault }` dei centri `isActive`, orderBy code.
- **Nuovo `src/components/prima-nota/shared/AccountCombobox.tsx`**: Popover + Command (`src/components/ui/command.tsx`), ricerca client su code+name, un `CommandGroup` per mastro (heading `"20 — Materie prime, sussidiarie e merci"`), item = `code` in medium + `name` (+ suffisso muted del gruppoNome se presente); props `{ value, onChange, types?, imputableOnly?, disabled?, placeholder?, allowNone? }`; react-query key `['accounts', types, imputableOnly]` staleTime 60s. Hook `useImputableAccounts(types?)` che espone anche `Map<accountId, costCenterRule>` per i form del Task 13.
- Test colocati: rendering gruppi, ricerca per codice e per nome, allowNone.

Commit: `feat(ui): combobox dei conti con ricerca e gerarchia + API arricchite`

---

## Task 12 — Migrazione select: percorsi di registrazione

Sostituire con `AccountCombobox`:
- `src/components/prima-nota/movimenti/SplitEntryDialog.tsx:203` (drop-in, types COSTO come oggi… verificare: oggi accountType="COSTO")
- `src/components/invoices/InvoiceDetailSections.tsx:422` LineItemsTable (COSTO; conservare pallini stato e placeholder "Suggerito: {code} - {name}")
- `src/components/invoices/InvoiceDetail.tsx:390` conto testata (allowNone per l'opzione "Nessun conto")
- `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx:299` (filtro dinamico: INCASSO→RICAVO, USCITA→COSTO, altri tipi→RICAVO+COSTO; la prop `accounts` dal server sparisce)
- `src/components/chiusura/ExpensesSection.tsx:265` (COSTO; la prop conti resta finché il form chiusura è offline-first — usare i dati della cache offline se il componente li riceve già come prop: in quel caso incapsulare la prop nel combobox, non il fetch)
- Pulizia: `src/app/(dashboard)/prima-nota/movimenti/page.tsx` — rimuovere il findMany senza filtri e la prop non più usata (MovimentiFilters continua col suo fetch fino al Task 17).

Test: aggiornare i test dei componenti toccati; smoke: ricerca "Birra" nel form movimento.

Commit: `feat(ui): combobox conti nei percorsi di registrazione`

---

## Task 13 — CostCenterSelect nei form

- **Nuovo `src/components/prima-nota/shared/CostCenterSelect.tsx`**: select shadcn con opzioni `CODE — Nome` da `useQuery(['cost-centers'])`; props `{ value, onChange, required?, disabled?, hint? }`.
- UX regola (dalla mappa del hook Task 11): voce OBBLIGATORIO → label con `*`, submit bloccato client con messaggio se vuoto; DEFAULT_STR → all'onChange della voce auto-seleziona il centro STR VISIBILE nel select con hint "assegnato automaticamente", modificabile. Mai inviare un default invisibile.
- Integrazioni: `MovimentoFormDialog` (campo + submit include costCenterId); `InvoiceDetail` card Categorizzazione (select accanto al conto testata; `canRecord` esteso: voce OBBLIGATORIO senza centro → bottone Registra disabled con tooltip; il body di record include costCenterId); `RegolaFormDialog` (`ScheduleRule`? NO — è la regola di PRIMA NOTA `CategorizationRule`: campo NON previsto. Il centro opzionale va sulla regola SCADENZARIO: `src/components/scadenzario/create-rule-page.tsx` — campo "Centro di costo (opzionale)" che scrive `ScheduleRule.costCenterId`, colonna aggiunta nel Task 2/6; aggiornare la route `src/app/api/scadenzario/regole` per accettarlo).
- SplitEntryDialog: NESSUN campo centro (le fette ereditano dal movimento) — aggiungere nota nel dialog se il movimento non ha centro e una voce è OBBLIGATORIO (il server risponde comunque 400 con motivo chiaro).

Test: auto-default STR visibile e non invasivo (non sovrascrive una scelta manuale), blocco submit su OBBLIGATORIO, payload con costCenterId.

Commit: `feat(ui): selettore del centro di costo nei form di registrazione`

---

## Task 14 — Chiusura: centro in testata + override riga

- Testata: `CostCenterSelect` obbligatorio con default WEISS in `src/components/chiusura/ClosureMetadataSection.tsx` (o sezione metadata effettiva); `ClosureFormData` (`src/components/chiusura/ClosureForm.tsx`) esteso con `costCenterId`; `NuovaChiusuraClient` e `ModificaChiusuraClient` passano/precaricano il valore; il POST/PUT della chiusura invia il campo (zod già pronto dal Task 7).
- Override riga spesa in `ExpensesSection`: select per riga con opzione sentinella "Come chiusura ({code testata})" → null sulla riga; prop `costCenterTestata`.
- Offline: i centri arrivano dallo store IndexedDB (Task 10) quando offline.

Test: form invia testata e override; default WEISS preselezionato su nuova chiusura.

Commit: `feat(chiusure): centro di costo in testata e override per riga spesa`

---

## Task 15 — Dialog admin di riclassifica

- **Nuovo `src/components/prima-nota/movimenti/EditContoCentroDialog.tsx`**: AccountCombobox (types coerenti col movimento) + CostCenterSelect + riepilogo readonly (data, descrizione, importo); PUT al ramo admin del Task 8; toast esiti.
- `MovimentiClient`/`MovimentiTable`: per i movimenti con `closureId`, se l'utente è admin l'azione "Modifica" apre questo dialog al posto di `MovimentoFormDialog`; non admin → nessuna azione (come oggi). Prop `isAdmin` dal server component (`page.tsx` ha già la session).

Test: dialog invia solo i due campi; movimento con closureId + non admin → azione assente.

Commit: `feat(prima-nota): dialog admin per riclassificare i movimenti da chiusura`

---

## Task 16 — Colonna e filtro centro in prima nota

- `src/types/prima-nota.ts`: `costCenter?: { id, code, name } | null` sul tipo movimento; API `GET /api/prima-nota` include la relazione e accetta `?costCenterId=`.
- `MovimentiTable.tsx`: colonna "Centro" dopo "Conto" (badge outline col `code`, title=name, "–" se assente).
- `MovimentiFilters.tsx`: select Centro (Tutti + 4) → param.
- `MovimentiClient`: stato + query param.

Commit: `feat(prima-nota): colonna e filtro per centro di costo`

---

## Task 17 — Migrazione select: secondo giro + pulizie

- Sostituire con AccountCombobox: `MovimentiFilters.tsx:141`, `src/components/prima-nota/regole/RegolaFormDialog.tsx:290` (COSTO+RICAVO), `src/components/invoices/InvoiceImportDialog.tsx:748`, `src/components/settings/SupplierManagement.tsx:556`, `src/app/(dashboard)/budget/[id]/BudgetDetailClient.tsx:518`.
- Fix separato: `src/components/scadenzario/create-recurrence-dialog.tsx:253` "Conto di pagamento" → filtrare ai patrimoniali (`?types=ATTIVO,PASSIVO`), NON è una voce economica.
- Eliminare `src/components/prima-nota/shared/AccountGroupedSelect.tsx` (nessun uso residuo).

Commit: `refactor(ui): combobox conti ovunque e pulizia della select raggruppata`

---

## Task 18 — Admin piano dei conti ad albero

- **Nuovo `src/lib/accounts/build-account-tree.ts`** (puro, testabile): da lista voci (con mastro/gruppo denormalizzati) → `[{ mastroCode, mastroNome, gruppi: [{ gruppoCode?, gruppoNome?, voci: [...] }] }]`; le voci senza gruppo stanno in un gruppo sintetico null. Riusato dal report (Task 21-22).
- **Nuovo `src/components/settings/AccountTree.tsx`**: righe indentate con chevron espandi/comprimi (default: mastri chiusi), badge regola CdC (ambra "CdC obbligatorio" / grigio "Default STR"), badge "Disattivo", contatori d'uso da `?full=true`, azioni modifica/disattiva per voce.
- **`src/components/settings/AccountManagement.tsx`**: tab RICAVO e COSTO → AccountTree; ATTIVO/PASSIVO restano liste piatte; ricerca client che auto-espande i rami con match; dialog voce: select mastro (obbligatoria, da SELECT DISTINCT dei dati), gruppo (opzionale, filtrato per mastro), regola CdC; il campo libero `category` sparisce dal form (deprecato).

Test: build-account-tree (155 voci → struttura attesa, gruppi solo su 20/28/32); componenti a smoke.

Commit: `feat(impostazioni): piano dei conti ad albero mastro-gruppo-voce`

---

## Task 19 — FASE 3: script di mappatura, migrazione e rollback (SOLO codice)

⚠️ Nessuna esecuzione contro la produzione in questo task: si scrive e si prova sull'ambiente isolato 5433.

- **`scripts/piano-v4/02-report-mappatura.ts`**: legge il DB (DATABASE_URL dell'ambiente in cui gira), per ogni conto NON-v4 (mastroCode null) conta i riferimenti su tutte le 14 FK (journal_entries.account_id e counterpart_id, journal_entry_allocations, daily_expenses, electronic_invoices, invoice_line_accounts, supplier_product_accounts, suppliers.default_account_id, customers.default_account_id, categorization_rules, schedule_rules.conto_id, recurring_expenses, account_budget_mappings, budget_lines) e stampa la tabella markdown per `docs/migrazione-piano-conti-v4.md` (code, nome, tipo, conteggi, azione proposta, voce v4 equivalente, note).
- **`scripts/piano-v4/03-migrate.ts`**: `--dry-run` default (stampa il piano d'azione e salva snapshot JSON in `scripts/piano-v4/snapshots/<timestamp>.json` con lo stato dei conti legacy + budget_lines), `--execute` esplicito; UNA transazione: guardie pre-volo (per ogni conto da disattivare zero riferimenti "duri" — journal_entries/allocations/invoice_line_accounts/supplier_product_accounts; 4 centri presenti; systemKey CASSA/BANCA/DEBITI presenti; nessuna collisione code con le 155 voci) → upsert 155 voci da PIANO_CONTI_WEISS_V4 (su update solo anagrafica: name, mastro/gruppo, costCenterRule — MAI isActive) → systemKey 'CORRISPETTIVI' su 10.01 → `isActive: false` sui legacy RICAVO/COSTO → delete budget_lines + account_budget_mappings dei legacy (proposta di default; la decisione finale arriva con l'approvazione della tabella) → createAuditLog riepilogativo. Abort totale se una guardia fallisce.
- **`scripts/piano-v4/04-rollback.ts`**: dry-run/execute; riattiva i legacy; disattiva (mai cancella) le voci v4 SOLO se prive di riferimenti (altrimenti stop + elenco); ripristina budget_lines dallo snapshot indicato via `--snapshot <path>`.
- **`scripts/piano-v4/verifica.ts`**: estendere — 155 voci v4 attive, 17 legacy disattivati (post-migrazione), 0 journal_entries con cost_center_id null (post follow-up NOT NULL), systemKey CORRISPETTIVI presente.
- Prova completa su 5433: seed vecchio stile impossibile (il seed è già v4) → simulare: inserire a mano 2-3 conti legacy finti, girare 02 → 03 dry-run → 03 execute → verifica → 04 rollback → verifica inversa.

Commit: `feat(migrazione): script di mappatura, migrazione e rollback del piano v4`

---

## Task 20 — FASE 4: aggregatore del conto economico

**Nuovo `src/lib/report/conto-economico.ts`** (puro, pattern timekeeping-engine) + test colocato.

Input: lista movimenti `{ id, accountId, account: { code, name, type, mastro*, gruppo* } | null, costCenter: { code } | null, debitAmount, creditAmount, allocations: [{ accountId, account: {...}, importo }] }` (periodo già filtrato a monte, deletedAt null, registri CASH+BANK) + lista centri.

Regole:
- Solo conti RICAVO/COSTO entrano nelle righe (patrimoniali e giroconti esclusi).
- Se il movimento ha fette → le fette sono la verità (ogni fetta contribuisce alla sua voce; il conto di testata è ignorato per gli importi). Il centro è del movimento (le fette non ne hanno).
- Importo economico: per RICAVO credit − debit; per COSTO debit − credit (le voci a segno negativo del piano — 10.09, 20.6.01, 20.6.03 — emergono naturalmente negative).
- Movimento con conto ma senza centro → colonna 'UNASSIGNED'. Movimento senza conto (con importi) → riga speciale `senzaConto` per centro.
- Output: `{ rows: [{ code, name, type, mastroCode, mastroNome, gruppoCode?, gruppoNome?, amounts: Record<centroCode|'UNASSIGNED', number>, total }], senzaConto: Record<centroCode|'UNASSIGNED', number>, totals: { ricavi, costi, margine } }` — piatto a livello voce; l'albero lo fa il client con build-account-tree.
- Invariante testata: somma di tutte le celle = totale economico dei movimenti in input (quadratura).

Test: movimento semplice per centro; suddiviso (fette vincono); senza centro → UNASSIGNED; senza conto → senzaConto; ricavo vs costo (segni); rettifiche negative; quadratura.

Commit: `feat(report): aggregatore del conto economico per centro`

---

## Task 21 — FASE 4: API del conto economico

**Nuova `src/app/api/report/conto-economico/route.ts`**: GET `?dateFrom&dateTo` (default: anno corrente), auth admin|manager (come gli altri report), venue via getVenueId; findMany minimale dei movimenti del periodo (select come input del Task 20, include allocations con account e costCenter) + `costCenter.findMany`; risposta `{ period, costCenters, ...output aggregatore }`. Niente groupBy Prisma.

Test route: 401/403; shape della risposta; quadratura su fixture.

Commit: `feat(report): API del conto economico per centro`

---

## Task 22 — FASE 4: pagina del report

**Nuova `src/app/(dashboard)/report/conto-economico/`**: `page.tsx` server (auth+redirect, pattern report esistenti) + `ContoEconomicoClient.tsx`:
- Filtro periodo come gli altri report (default anno corrente).
- 3 KPI card: Ricavi, Costi, Margine.
- Tabella: sezione RICAVI, sezione COSTI, riga MARGINE; righe mastro espandibili (chevron) → gruppo → voce, default compresso (albero da build-account-tree sulle rows); colonne STR/WEISS/VV/CAS/Non attribuito (solo se ≠ 0)/Totale; celle a 0 → "–"; container `overflow-x-auto`; riga "Senza conto" se presente.
- Export CSV client (pattern Blob di AnalisiCostiClient).
- Card nell'array `reports` di `src/app/(dashboard)/report/page.tsx`. Nessuna voce sidebar dedicata.

Test: client a smoke (rendering albero, espansione), typecheck.

Commit: `feat(report): conto economico per centro con drill-down`

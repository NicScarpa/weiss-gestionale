# Migration Prompt: Importazione Funzionalità "Conti" da Sibill a Prima Nota

## [ROLE]
Sei un **Senior Full-Stack Developer** esperto in migrazioni funzionali complesse tra progetti contabili. Hai esperienza con:
- Next.js 15+ con App Router e TypeScript
- Prisma ORM con PostgreSQL
- shadcn/ui per componenti React
- Migrazioni logica di business da sistemi desktop/legacy a web modern

Conosci già il progetto **accounting** (Next.js) e le sue strutture:
- Database schema: `prisma/schema.prisma` - tabelle `JournalEntry`, `Account`, `BudgetCategory`, `CategorizationRule`, `Payment`
- Tipi TypeScript: `src/types/prima-nota.ts` - interfacce `JournalEntry`, `EntryType`, `RegisterType`, `JournalEntryFilters`
- Layout Prima Nota: `src/app/(dashboard)/prima-nota/` con tab nav (Movimenti, Pagamenti, Regole)
- Componenti esistenti: `PrimaNotaTabNav`, `AccountSelectorToggle`, `PrimaNotaProvider`

## [CONTEXT]

### Situazione Attuale
Il progetto **accounting** è un sistema gestionale (Weiss Cafè) con la **Prima Nota** già parzialmente implementata:
- **Database**: Lo schema Prisma include tutte le tabelle Sibill necessarie (`JournalEntry` con estensioni, `CategorizationRule`, `Payment`, `CashFlowForecast`, `Account`, `BudgetCategory`)
- **API**: Gli endpoint API esistono (`/api/prima-nota/*`, `/api/payments/*`, `/api/categorization-rules/*`)
- **UI Base**: Layout con tab navigation funzionante, ma le pagine "Movimenti", "Pagamenti", "Regole" sono ancora placeholder

### Situazione Target (Sibill-re)
La directory `sibill-re/` contiene:
- **Mockup visivi**: `sibill-re/img/mockup_primanota.png` e `sibill-re/img/primanota-home.png` - mostrano l'interfaccia completa da replicare
- **Logica da importare**: Gestione completa movimenti contabili, pagamenti, regole categorizzazione

### Gap da Colmare
Le seguenti funzionalità della tab "Conti" devono essere migrate nella "Prima Nota":

1. **Tab Movimenti** (`src/app/(dashboard)/prima-nota/movimenti/page.tsx`):
   - Tabella completa con filtri avanzati (data, tipo, importo, conto, categoria)
   - Ordinamento multi-colonna
   - Azioni per riga (modifica, cancella, verifica, nascondi)
   - Visualizzazione stato categorizzazione (manual/automatic/rule/import)
   - Badge colore per tipo movimento (INCASSO=verde, USCITA=rosso, VERSAMENTO=blu, ecc.)

2. **Tab Pagamenti** (`src/app/(dashboard)/prima-nota/pagamenti/page.tsx`):
   - Tabella pagamenti con stato (BOZZA, DA_APPROVARE, DISPOSTO, COMPLETATO, FALLITO, ANNULLATO)
   - Dettagli beneficiario, IBAN, causale
   - Azioni: approvazione, annullo, modifica
   - Filtri per stato e data

3. **Tab Regole** (`src/app/(dashboard)/prima-nota/regole/page.tsx`):
   - Interfaccia gestione regole categorizzazione automatica
   - Creazione/modifica regole (nome, keywords, priorità, direzione INFLOW/OUTFLOW)
   - Collegamento a categoria budget e conto
   - Test regole su movimenti esistenti
   - Statistiche accuratezza regole

4. **Componenti Riutilizzabili da Creare**:
   - `MovimentiTable` - Tabella movimenti con filtri e azioni
   - `PagamentiTable` - Tabella pagamenti con workflow stati
   - `RegoleTable` o `CategorizationRulesManager` - Gestione regole
   - `MovimentoFormDialog` - Dialog creazione/modifica movimento
   - `PagamentoFormDialog` - Dialog creazione/modifica pagamento
   - `RegolaFormDialog` - Dialog creazione/modifica regola
   - Filtri avanzati: `MovimentiFilters`, `PagamentiFilters`

### Vincoli Tecnologici
- **Next.js 15** con App Router - usare Server Components dove possibile
- **TypeScript strict** - tipi già definiti in `src/types/prima-nota.ts`
- **shadcn/ui** - componenti: Table, Dialog, Form, Select, DatePicker, Input, Button, Badge, Tabs, DropdownMenu
- **Prisma** - query ottimizzate con include per relazioni
- **Stile esistenti** - mantieni coerenza con UI già implementata (colori, layout, componenti)
- **Responsive** - deve funzionare su mobile

### Mapping Dati Sibill → Prima Nota
- **Conto Sibill** → **Account** nel progetto (già mappato)
- **Movimento** → **JournalEntry** (già esteso con campi Sibill)
- **Pagamento** → **Payment** (già mappato)
- **Regola Categorizzazione** → **CategorizationRule** (già mappato)
- **Categoria Budget** → **BudgetCategory** (già mappato)

## [TASK]

La tua missione è **implementare completamente le funzionalità della tab "Conti" di Sibill all'interno della tab "Prima Nota"**.

### Step 1: Analisi Approccio Strutturale
Prima di pianificare l'approccio alla migrazione:

1. **Analizza i mockup** in `sibill-re/img/` per capire:
   - Layout esatto delle tabelle
   - Colonne visualizzate per entità
   - Interazioni e pattern UX
   - Gerarchia visiva e raggruppamenti

2. **Mappa funzionalità Sibill a componenti**:
   - Identifica quali componenti React servono
   - Stabilisci dove riutilizzare componenti esistenti
   - Pianifica gerarchia cartelle (`src/components/prima-nota/`)

3. **Verifica integrazione dati**:
   - Conferma che tutti i campi necessari sono nel Prisma schema
   - Verifica che le API esistono o creano endpoint necessari
   - Identifica se servono nuovi tipi TypeScript o modifiche

4. **Proponi la struttura**:
   - Elencara i componenti da creare con dipendenze
   - Identifica le operazioni di database necessarie
   - Stabilisci l'ordine di implementazione (priorità)

### Step 2: Implementazione Componenti UI

#### 2.1 Tabella Movimenti (`MovimentiTable`)
Crea `src/components/prima-nota/movimenti/MovimentiTable.tsx`:

**Funzionalità richieste**:
- Visualizzazione lista `JournalEntry` con paginazione
- Colonne: Data, Tipo (badge colorato), Descrizione, Documento, Dare/Avere, Conto, Categoria (badge), Stato (verificato/nascosto), Azioni
- **Filtri avanzati**: Periodo data, tipo movimento, conto, categoria, stato verifica, origine categorizzazione, testo libero
- **Ordinamento**: click su header colonna per ordinare asc/desc
- **Azioni riga**:
  - Modifica (apre dialog)
  - Cancella (con conferma)
  - Verifica/Neverifica (toggle)
  - Nascondi/Mostra dallo (toggle hiddenAt)
  - Categorizza manualmente (apre dialog selezione conto/categoria)
- **Badge stato categorizzazione**:
  - 🟢 Automatic = categorizzazione automatica
  - 📋 Regola = applicata regola
  - ✏ Manual = inserito manual
  - 📥 Import = importato da file
- **Integrazione con Prima Nota**: Quando si seleziona un movimento, aggiorna il form di inserimento con quel movimento pre-compilato

#### 2.2 Tabella Pagamenti (`PagamentiTable`)
Crea `src/components/prima-nota/pagamenti/PagamentiTable.tsx`:

**Funzionalità richieste**:
- Visualizzazione lista `Payment` con paginazione
- Colonne: Data, Beneficiario, IBAN, Importo, Causale, Stato (badge), Azioni
- **Filtri**: Periodo data, stato, beneficiario, testo libero
- **Workflow stati**:
  - BOZZA → DA_APPROVARE → DISPOSTO → COMPLETATO / FALLITO / ANNULLATO
- **Azioni**:
  - Modifica (tutti i campi per stati BOZZA/DA_APPROVARE)
  - Approva (transizione a DA_APPROVARE)
  - Disponi (transmissione a DISPOSTO)
  - Completa (transmissione a COMPLETATO)
  - Annulla (transmissione a ANNULLATO)
  - Cancella (con conferma, solo BOZZA)

#### 2.3 Gestione Regole (`CategorizationRulesManager`)
Crea `src/components/prima-nota/regole/CategorizationRulesManager.tsx`:

**Funzionalità richieste**:
- Lista regole con priorità (drag-and-drop per riordinare)
- Creazione nuova regola: nome, keywords (array), direzione (INFLOW/OUTFLOW), priorità (1-10), conto, categoria budget
- Modifica/esistenza regola
- Toggle attivazione/disattivazione
- **Test regola**: Input per testare keywords e anteprima movimenti che matchano
- **Statistiche**: Numero movimenti categorizzati per regola

### Step 3: Form e Dialog

Crea i dialog per le operazioni CRUD:

1. **MovimentoFormDialog** (`src/components/prima-nota/movimenti/MovimentoFormDialog.tsx`):
   - Campi: data, registro (Cassa/Banca), tipo movimento, descrizione, importo, conto, categoria, note, documento
   - Validazione: importo richiesto, descrizione obbligatoria
   - Supporto modifiche (pre-compila campi)

2. **PagamentoFormDialog** (`src/components/prima-nota/pagamenti/PagamentoFormDialog.tsx`):
   - Campi: data esecuzione, tipo (BONIFICO/F24/ALTRO), beneficiario, IBAN, importo, causale, note
   - Validazione: IBAN formato italiano, importo > 0

3. **RegolaFormDialog** (`src/components/prima-nota/regole/RegolaFormDialog.tsx`):
   - Campi: nome, keywords (tag input), direzione (select INFLOW/OUTFLOW), priorità (slider 1-10), conto (select), categoria (select), opzioni (auto-verify, auto-hide)

### Step 4: Integrazione API

#### 4.1 Verifica/Creao Endpoint API
Verifica se esistono o creao questi endpoint:

- **GET/POST /api/prima-nota** - Lista e creazione movimenti
- **PUT/DELETE /api/prima-nota/[id]** - Modifica e cancella movimenti
- **PATCH /api/prima-nota/[id]/verify** - Toggle verifica
- **PATCH /api/prima-nota/[id]/hide** - Toggle nascondi
- **PATCH /api/prima-nota/[id]/categorize** - Categorizzazione manuale
- **GET/POST /api/payments** - Lista e creazione pagamenti
- **PUT/DELETE /api/payments/[id]** - Modifica e cancella pagamenti
- **PATCH /api/payments/[id]/approve** - Approvazione pagamento
- **GET/POST /api/categorization-rules** - Lista e creazione regole
- **PUT/DELETE /api/categorization-rules/[id]** - Modifica e cancella regole
- **POST /api/categorization-rules/[id]/test** - Test regola su movimenti

Se mancanti, creali seguendo il pattern esistente in `src/app/api/`.

#### 4.2 Server Actions
Crea Server Actions per le operazioni complesse:

- `app/actions/prima-nota.ts` - Query e mutazioni JournalEntry
- `app/actions/payments.ts` - Query e mutazioni Payment
- `app/actions/categorization-rules.ts` - Query e mutazioni CategorizationRule

Usa Prisma con query ottimizzate (include per relazioni, where per filtri).

### Step 5: Tipi TypeScript

Verifica e aggiorna `src/types/prima-nota.ts` se mancanti:

```typescript
// Stati pagamento (già in schema.prisma come PaymentStatus)
export type PaymentStatus = 'BOZZA' | 'DA_APPROVARE' | 'DISPOSTO' | 'COMPLETATO' | 'FALLITO' | 'ANNULLATO'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  BOZZA: 'Bozza',
  DA_APPROVARE: 'Da Approvare',
  DISPOSTO: 'Disposto',
  COMPLETATO: 'Completato',
  FALLITO: 'Fallito',
  ANNULLATO: 'Annullato',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  BOZZA: 'bg-gray-100 text-gray-700',
  DA_APPROVARE: 'bg-blue-100 text-blue-700',
  DISPOSTO: 'bg-yellow-100 text-yellow-700',
  COMPLETATO: 'bg-green-100 text-green-700',
  FALLITO: 'bg-red-100 text-red-700',
  ANNULLATO: 'bg-slate-100 text-slate-500',
}

// Tipi pagamento (già in schema.prisma come PaymentType)
export type PaymentType = 'BONIFICO' | 'F24' | 'ALTRO'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  BONIFICO: 'Bonifico',
  F24: 'F24',
  ALTRO: 'Altro',
}

// Interfaccia Payment (estensioni da JournalEntry)
export interface Payment {
  id: string
  venueId: string
  tipo: PaymentType
  stato: PaymentStatus
  riferimentoInterno?: string
  dataEsecuzione: Date
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  note?: string
  journalEntryId?: string
  createdById?: string
  createdAt: Date
  updatedAt: Date
  // Relazioni (popolate)
  venue?: { id: string; name: string; code: string }
  journalEntry?: JournalEntry
  createdBy?: { id: string; firstName: string; lastName: string }
}

// Form data per nuovo pagamento
export interface PaymentFormData {
  dataEsecuzione: Date
  tipo: PaymentType
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  note?: string
}

// Filtri pagamenti
export interface PaymentFilters {
  stato?: PaymentStatus
  dateFrom?: Date
  dateTo?: Date
  tipo?: PaymentType
  beneficiarioNome?: string
  search?: string
}

// Risposta paginata
export interface PaymentListResponse {
  data: Payment[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Tipi regola categorizzazione
export type RuleDirection = 'INFLOW' | 'OUTFLOW'

export const RULE_DIRECTION_LABELS: Record<RuleDirection, string> = {
  INFLOW: 'Entrata',
  OUTFLOW: 'Uscita',
}

// Interfaccia CategorizationRule
export interface CategorizationRule {
  id: string
  venueId: string
  name: string
  direction: RuleDirection
  keywords: string[]
  priority: number
  isActive: boolean
  budgetCategoryId?: string
  accountId?: string
  autoVerify: boolean
  autoHide: boolean
  createdAt: Date
  updatedAt: Date
  // Relazioni
  venue?: { id: string; name: string; code: string }
  budgetCategory?: { id: string; code: string; name: string; color?: string }
  account?: { id: string; code: string; name: string }
  journalEntries?: JournalEntry[]
}

// Form data per nuova regola
export interface CategorizationRuleFormData {
  name: string
  direction: RuleDirection
  keywords: string[]
  priority: number
  isActive?: boolean
  budgetCategoryId?: string
  accountId?: string
  autoVerify?: boolean
  autoHide?: boolean
}

// Risposta test regola
export interface CategorizationRuleTestResponse {
  rule: CategorizationRule
  matchedEntries: JournalEntry[]
  matchCount: number
}
```

### Step 6: Integrazione Pagine

Aggiorna le pagine placeholder:

1. **`src/app/(dashboard)/prima-nota/movimenti/page.tsx`**:
   - Importa e usa `MovimentiTable` con filtri iniziali
   - Gestisci stato filtri (useState + URL params)
   - Implementa "Nuovo Movimento" button che apre `MovimentoFormDialog`

2. **`src/app/(dashboard)/prima-nota/pagamenti/page.tsx`**:
   - Importa e usa `PagamentiTable`
   - Gestisci stato filtri
   - Implementa "Nuovo Pagamento" button

3. **`src/app/(dashboard)/prima-nota/regole/page.tsx`**:
   - Importa e usa `CategorizationRulesManager`
   - Implementa interfaccia completa con lista, creazione, test regole

### Step 7: Ottimizzazioni

Implementa queste ottimizzazioni:

1. **Virtual scrolling** per tabelle con tanti dati (usare `@tanstack/react-table` o soluzione custom)
2. **Debounce filtri** (300ms) per ridurre chiamate API
3. **Cache React Query** per query lista (stale 5min)
4. **Optimistic updates** per update UI istantanee con rollback se errore
5. **Keyboard shortcuts**:
   - `Ctrl/Cmd + K` = nuovo movimento
   - `Ctrl/Cmd + F` = filtri
   - `Escape` = chiudi dialog

## [CONSTRAINTS]

- **Nessun breaking change** al codice esistente - le modifiche devono essere additive
- **UI Coerente** - usa i colori e stili già definiti in `src/app/globals.css` e componenti esistenti
- **Performance** - le query devono rimanere < 500ms per 1000 record
- **Accessibilità** - tutti i componenti devono essere accessibili (ARIA, keyboard nav)
- **Validazione lato server** - usa ValidatedForm o Zod per validazione, mostra error chiari
- **Error handling** - gestisci error con toast notification (usa pattern esistente nel progetto)

## [OUTPUT FORMAT]

Fornisci output strutturato in questo ordine:

### 1. Struttura Implementazione
Elenca la struttura dei file da creare/modificare:

```
src/
├── components/
│   └── prima-nota/
│   │   ├── movimenti/
│   │   │   ├── MovimentiTable.tsx          [NUOVO]
│   │   │   ├── MovimentiFilters.tsx       [NUOVO]
│   │   │   ├── MovimentoFormDialog.tsx   [NUOVO]
│   │   │   └── MovimentoRowActions.tsx     [NUOVO]
│   │   ├── pagamenti/
│   │   │   ├── PagamentiTable.tsx         [NUOVO]
│   │   │   ├── PagamentiFilters.tsx       [NUOVO]
│   │   │   ├── PagamentoFormDialog.tsx   [NUOVO]
│   │   │   └── PagamentoRowActions.tsx     [NUOVO]
│   │   ├── regole/
│   │   │   ├── CategorizationRulesManager.tsx [NUOVO]
│   │   │   ├── RegolaFormDialog.tsx       [NUOVO]
│   │   │   ├── RegolaTestPanel.tsx        [NUOVO]
│   │   │   └── RegoleList.tsx             [NUOVO]
│   │   └── shared/
│   │       ├── JournalEntryBadge.tsx       [NUOVO] - Badge tipo movimento
│   │       ├── PaymentStatusBadge.tsx      [NUOVO] - Badge stato pagamento
│   │       ├── CategorizationBadge.tsx    [NUOVO] - Badge stato categorizzazione
│   │       └── FiltersToolbar.tsx          [NUOVO] - Toolbar filtri condivisa
├── app/
│   ├── actions/
│   │   ├── prima-nota.ts                  [NUOVO/UPDATE]
│   │   ├── payments.ts                     [NUOVO/UPDATE]
│   │   └── categorization-rules.ts          [NUOVO/UPDATE]
│   ├── api/
│   │   ├── prima-nota/
│   │   │   ├── [id]/verify/route.ts    [VERIFICA/CREA]
│   │   │   ├── [id]/hide/route.ts      [VERIFICA/CREA]
│   │   │   └── [id]/categorize/route.ts [VERIFICA/CREA]
│   │   ├── payments/
│   │   │   ├── route.ts                 [VERIFICA/CREA]
│   │   │   └── [id]/approve/route.ts    [VERIFICA/CREA]
│   │   └── categorization-rules/
│   │       ├── route.ts                 [VERIFICA/CREA]
│   │       └── [id]/test/route.ts        [VERIFICA/CREA]
└── types/
    └── prima-nota.ts                      [UPDATE] - Aggiungi tipi Payment, CategorizationRule
```

### 2. Dettaglio Implementazione Per Componente

Per ogni componente principale, fornisci:

- **Props** TypeScript definiti
- **Stato interno** (useState hooks)
- **Query API** utilizzate (React Query o fetch)
- **Markup JSX** strutturato
- **Stile CSS** (Tailwind classes)

### 3. Modifiche Database/Prima

Se necessario, fornisci:
- Modifiche a `prisma/schema.prisma`
- Nuove migration SQL (se necessarie)

### 4. Istruzioni per Testing

Cosa testare e come:
- [ ] Unit test per Server Actions
- [ ] Integration test per API endpoint
- [ ] E2E test per componenti UI (Playwright)

### 5. Note Implementazione

- Pattern particolari da seguire
- Traghetti-edge cases da gestire
- Decisi architetturali prese

# Piano: Integrazione Tab "Regole" nello Scadenzario

## Context

Lo Scadenzario ha attualmente due pill tabs: **Scadenzario** | **Ricorrenze**. Manca la terza tab **Regole** presente in Sibill (`/outstanding/rules`). L'obiettivo è replicare la UI/UX di Sibill creando un sistema di regole automatiche che, quando una scadenza soddisfa determinati criteri (tipo documento + tipo pagamento), eseguono azioni automatiche (es. "Crea e Riconcilia Movimento" su un conto specifico).

## Reverse Engineering da Sibill — Risultati completi

### Struttura pagina Regole (screenshot `sibill-regole-tab.png`)
- URL: `/outstanding/rules/issued/list` con parametro `direction=ISSUED`
- Sub-tabs con icona: **"Regole documenti emessi"** (freccia verde uscita) e implicitamente **"Regole documenti ricevuti"** (freccia rossa entrata)
- Nota informativa: *"Le regole sono applicate nell'ordine visualizzato."*
- Tabella con colonne: **Conto** | **Tipo documento** | **Tipo pagamento** | **Azione**
  - Ogni riga ha un numero d'ordine (drag handle per riordino)
  - Conto mostra icona/avatar + nome (es. "CA" per Cassa)
  - Tipo documento: es. "Corrispettivo"
  - Tipo pagamento: es. "Contanti"
  - Azione: es. "Crea e Riconcilia Movimento"
  - Menu azioni (tre puntini) per modifica/eliminazione
- Bottone in alto a destra: **"Aggiungi una nuova regola +"**

### Pagina creazione regola (screenshot `sibill-regole-crea.png`)
- URL: `/outstanding/rules/issued/new?direction=ISSUED`
- Titolo: **"Crea una regola"**
- Sottotitolo: *"Imposta le azioni che verranno applicate automaticamente alle scadenze che rispettano i criteri selezionati."*
- **Sezione 1: "Criteri di corrispondenza"**
  - Accordion **"Tipo documento"**: *"Vengono considerate le scadenze aventi questo tipo di documento."* — combobox dropdown con tipi documento
  - Accordion **"Tipo pagamento"**: *"Vengono considerate le scadenze aventi questo tipo di pagamento."* — combobox dropdown con metodi pagamento
- **Sezione 2: "Scegli azioni da applicare"**
  - Accordion **"Crea e riconcilia automaticamente un movimento"**: *"Cerca tra tutti i conti"* — selettore conto con lista conti (es. "Cassa | (EUR)")
  - Quando espanso mostra: descrizione azione + lista conti cliccabili con logo e label
- **Footer**: Bottoni "Annulla" (outline) | "Crea la regola" (primary, disabilitato finché criteri e azione non configurati)

### Logica funzionale
- Le regole sono **if-then**: SE una scadenza ha [tipo documento X] E [tipo pagamento Y] → ALLORA esegui [azione] su [conto Z]
- Le regole si applicano **in ordine** (la prima regola che matcha vince)
- Le regole sono riordinabili via drag-and-drop
- Le regole sono filtrate per **direzione**: "documenti emessi" (attiva/incassi) vs "documenti ricevuti" (passiva/pagamenti)
- L'azione "Crea e Riconcilia Movimento" genera automaticamente un movimento di prima nota e lo riconcilia con la scadenza

---

## Step 1: Schema Prisma — Nuovo modello `ScheduleRule`

**File:** `prisma/schema.prisma`

Aggiungere il modello `ScheduleRule`:

```prisma
model ScheduleRule {
  id                String    @id @default(cuid())
  venueId           String    @map("venue_id")
  direzione         String    // 'emessi' (attiva/incassi) o 'ricevuti' (passiva/pagamenti)
  tipoDocumento     String?   @map("tipo_documento")     // valore da ScheduleDocumentType
  tipoPagamento     String?   @map("tipo_pagamento")     // valore da SchedulePaymentMethod
  azione            String    @default("crea_riconcilia_movimento")
  contoId           String?   @map("conto_id")            // FK a Account
  ordine            Int       @default(0)                  // ordine di applicazione
  isActive          Boolean   @default(true) @map("is_active")
  createdById       String?   @map("created_by")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  venue             Venue     @relation(fields: [venueId], references: [id])
  conto             Account?  @relation(fields: [contoId], references: [id])
  createdBy         User?     @relation("ScheduleRuleCreatedBy", fields: [createdById], references: [id])

  @@index([venueId, direzione])
  @@index([isActive, ordine])
  @@map("schedule_rules")
}
```

Modifiche ai modelli esistenti:
- **Venue**: aggiungere `scheduleRules ScheduleRule[]`
- **Account**: aggiungere `scheduleRules ScheduleRule[]`
- **User**: aggiungere `scheduleRulesCreated ScheduleRule[] @relation("ScheduleRuleCreatedBy")`

Sync: `npx prisma db push && npx prisma generate`

---

## Step 2: Tipi TypeScript

**File:** `src/types/schedule.ts`

Aggiungere:

```typescript
// Direzione regola (documenti emessi = incassi/attiva, ricevuti = pagamenti/passiva)
export enum ScheduleRuleDirection {
  EMESSI = 'emessi',     // attiva/incassi
  RICEVUTI = 'ricevuti', // passiva/pagamenti
}

export const SCHEDULE_RULE_DIRECTION_LABELS: Record<ScheduleRuleDirection, string> = {
  [ScheduleRuleDirection.EMESSI]: 'Regole documenti emessi',
  [ScheduleRuleDirection.RICEVUTI]: 'Regole documenti ricevuti',
} as const

// Azione regola
export enum ScheduleRuleAction {
  CREA_RICONCILIA_MOVIMENTO = 'crea_riconcilia_movimento',
}

export const SCHEDULE_RULE_ACTION_LABELS: Record<ScheduleRuleAction, string> = {
  [ScheduleRuleAction.CREA_RICONCILIA_MOVIMENTO]: 'Crea e Riconcilia Movimento',
} as const

// Interfacce
export interface ScheduleRule {
  id: string
  venueId: string
  direzione: ScheduleRuleDirection
  tipoDocumento: string | null
  tipoPagamento: string | null
  azione: string
  contoId: string | null
  ordine: number
  isActive: boolean
  createdById: string | null
  createdAt: Date
  updatedAt: Date
  conto?: {
    id: string
    name: string
    code: string
  }
  createdBy?: {
    id: string
    firstName: string | null
    lastName: string | null
  }
}

export interface CreateScheduleRuleInput {
  direzione: ScheduleRuleDirection
  tipoDocumento?: string
  tipoPagamento?: string
  azione?: string
  contoId?: string
}

export interface UpdateScheduleRuleInput {
  tipoDocumento?: string | null
  tipoPagamento?: string | null
  azione?: string
  contoId?: string | null
  ordine?: number
  isActive?: boolean
}
```

---

## Step 3: API Routes

### `src/app/api/scadenzario/regole/route.ts`
- **GET**: Lista regole con filtri (`direzione`, `isActive`), ordinate per `ordine ASC`. Include relazione `conto`.
- **POST**: Crea regola. Assegna `ordine` = max(ordine) + 1 per la direzione. Validazione Zod: almeno un criterio (tipoDocumento O tipoPagamento) deve essere specificato.

Pattern da seguire: `src/app/api/scadenzario/ricorrenze/route.ts` (auth, venueId, Zod, Prisma)

### `src/app/api/scadenzario/regole/[id]/route.ts`
- **GET**: Dettaglio singola regola
- **PATCH**: Aggiorna regola
- **DELETE**: Hard delete (le regole si eliminano effettivamente, non soft delete)

### `src/app/api/scadenzario/regole/riordina/route.ts`
- **PATCH**: Riceve `{ orderedIds: string[] }` e aggiorna l'ordine di tutte le regole in una transazione Prisma.

---

## Step 4: Aggiornare Layout con terza tab

**File:** `src/app/(dashboard)/scadenzario/layout.tsx`

Aggiungere la terza pill tab:
```typescript
const tabs = [
  { value: '/scadenzario', label: 'Scadenzario' },
  { value: '/scadenzario/ricorrenze', label: 'Ricorrenze' },
  { value: '/scadenzario/regole', label: 'Regole' },
]
```

Aggiornare `isActive` per escludere anche `/scadenzario/regole` dalla tab "Scadenzario":
```typescript
if (href === '/scadenzario') {
  return pathname === '/scadenzario' || (
    pathname.startsWith('/scadenzario/') &&
    !pathname.startsWith('/scadenzario/ricorrenze') &&
    !pathname.startsWith('/scadenzario/regole')
  )
}
```

---

## Step 5: Componenti

### `src/components/scadenzario/create-rule-page.tsx`
Pagina/form per creare una nuova regola (Sibill usa una pagina dedicata, NON un dialog).

**Struttura:**
- Titolo: "Crea una regola"
- Sottotitolo: "Imposta le azioni che verranno applicate automaticamente alle scadenze che rispettano i criteri selezionati."
- **Sezione "Criteri di corrispondenza"** (accordion collapsibili):
  - **"Tipo documento"**: testo helper "Vengono considerate le scadenze aventi questo tipo di documento." + Select con opzioni da `ScheduleDocumentType` enum
  - **"Tipo pagamento"**: testo helper "Vengono considerate le scadenze aventi questo tipo di pagamento." + Select con opzioni da `SchedulePaymentMethod` enum
- **Sezione "Scegli azioni da applicare"** (accordion):
  - **"Crea e riconcilia automaticamente un movimento"**: testo "Cerca tra tutti i conti" + lista conti caricata da `GET /api/accounts`, ogni conto cliccabile con icona e label "Nome | (EUR)"
  - Il conto selezionato si evidenzia
- **Footer**: "Annulla" (torna a lista) | "Crea la regola" (primary, disabled finché almeno 1 criterio + conto non selezionati)

### `src/components/scadenzario/rule-table.tsx`
Tabella con colonne: **(ordine)** | **Conto** | **Tipo documento** | **Tipo pagamento** | **Azione** | **(menu)**

Ogni riga mostra:
- Numero ordine (drag handle opzionale, per v1 basta il numero)
- Conto con iniziali/icona e nome
- Tipo documento (label da enum o "—")
- Tipo pagamento (label da enum o "—")
- Azione (label da enum)
- Menu azioni (tre puntini): Modifica | Elimina

### `src/components/scadenzario/rule-actions.tsx`
DropdownMenu con: Modifica | Elimina

---

## Step 6: Pagina Regole

### `src/app/(dashboard)/scadenzario/regole/page.tsx`
Struttura:
- Header con titolo "Regole" e bottone "Aggiungi una nuova regola +"
- Sub-tabs locali: **Regole documenti emessi** (icon freccia verde) | **Regole documenti ricevuti** (icon freccia rossa)
- Nota: "Le regole sono applicate nell'ordine visualizzato."
- Tabella regole filtrata per direzione
- Stato vuoto: "Nessuna regola configurata"

### `src/app/(dashboard)/scadenzario/regole/nuova/page.tsx`
Pagina creazione regola (NON dialog — segue pattern Sibill con pagina dedicata).
Wrappa il componente `CreateRulePage` passando `direzione` dal parametro query o dallo stato.

---

## Sequenza di implementazione

1. Schema Prisma + sync (Step 1)
2. Tipi TypeScript (Step 2)
3. API routes — CRUD + riordina (Step 3)
4. Aggiornare layout con terza tab (Step 4)
5. Componenti: form creazione, tabella, azioni (Step 5)
6. Pagine: lista regole + creazione regola (Step 6)

---

## File coinvolti

### Nuovi file (7)
| File | Scopo |
|------|-------|
| `src/app/(dashboard)/scadenzario/regole/page.tsx` | Pagina lista regole con sub-tabs |
| `src/app/(dashboard)/scadenzario/regole/nuova/page.tsx` | Pagina creazione nuova regola |
| `src/app/api/scadenzario/regole/route.ts` | GET lista + POST crea |
| `src/app/api/scadenzario/regole/[id]/route.ts` | GET + PATCH + DELETE singola regola |
| `src/app/api/scadenzario/regole/riordina/route.ts` | PATCH riordina regole |
| `src/components/scadenzario/rule-table.tsx` | Tabella regole |
| `src/components/scadenzario/rule-actions.tsx` | Menu azioni dropdown |

### File da modificare (3)
| File | Modifiche |
|------|-----------|
| `prisma/schema.prisma` | Nuovo modello ScheduleRule + relazioni su Venue/Account/User |
| `src/types/schedule.ts` | Nuovi enum, interfacce, label maps per regole |
| `src/app/(dashboard)/scadenzario/layout.tsx` | Aggiungere terza pill tab "Regole" |

### File di riferimento (pattern da seguire)
| File | Pattern |
|------|---------|
| `src/app/(dashboard)/scadenzario/ricorrenze/page.tsx` | Pagina con sub-tabs, fetch, CRUD |
| `src/components/scadenzario/recurrence-table.tsx` | Tabella con colonne e azioni |
| `src/components/scadenzario/recurrence-actions.tsx` | DropdownMenu azioni |
| `src/app/api/scadenzario/ricorrenze/route.ts` | Auth, venue isolation, Zod, Prisma |

---

## Verifica

1. `npx prisma db push` — schema sync senza errori
2. `npx tsc --noEmit` — zero errori TypeScript
3. `npm run dev` — verificare che lo scadenzario funzioni con tre pill tabs
4. Navigare a `/scadenzario/regole` — verificare sub-tabs e tabella
5. Creare una regola: tipo documento "Corrispettivo" + tipo pagamento "Contanti" + conto "Cassa" → verificare appaia nella tabella
6. Verificare che `/scadenzario` e `/scadenzario/ricorrenze` funzionino correttamente
7. Confronto visivo con Sibill (screenshot `sibill-regole-tab.png` e `sibill-regole-crea.png`)

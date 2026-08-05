# Piano: Integrazione Tab "Regole" nello Scadenzario

## Context

Lo Scadenzario ha attualmente due pill tabs: **Scadenzario** | **Ricorrenze**. Manca la terza tab **Regole** presente in Sibill. L'obiettivo e' creare un sistema di regole automatiche: quando una scadenza soddisfa criteri (tipo documento + tipo pagamento), esegue azioni automatiche (es. "Crea e Riconcilia Movimento" su un conto specifico).

Reverse engineering da Sibill ha estratto la struttura completa (screenshot `sibill-regole-tab.png` e `sibill-regole-crea.png`).

---

## Step 1: Schema Prisma — Nuovo modello `ScheduleRule`

**File:** `prisma/schema.prisma`

```prisma
model ScheduleRule {
  id                String    @id @default(cuid())
  venueId           String    @map("venue_id")
  direzione         String    // 'emessi' (attiva/incassi) o 'ricevuti' (passiva/pagamenti)
  tipoDocumento     String?   @map("tipo_documento")
  tipoPagamento     String?   @map("tipo_pagamento")
  azione            String    @default("crea_riconcilia_movimento")
  contoId           String?   @map("conto_id")
  ordine            Int       @default(0)
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

Relazioni da aggiungere:
- **Venue** (~riga 155): `scheduleRules ScheduleRule[]`
- **Account** (~riga 325): `scheduleRules ScheduleRule[]`
- **User** (~riga 55): `scheduleRulesCreated ScheduleRule[] @relation("ScheduleRuleCreatedBy")`

Sync: `npx prisma db push && npx prisma generate`

---

## Step 2: Tipi TypeScript

**File:** `src/types/schedule.ts`

Aggiungere alla fine del file:

```typescript
export enum ScheduleRuleDirection {
  EMESSI = 'emessi',
  RICEVUTI = 'ricevuti',
}

export const SCHEDULE_RULE_DIRECTION_LABELS: Record<ScheduleRuleDirection, string> = {
  [ScheduleRuleDirection.EMESSI]: 'Regole documenti emessi',
  [ScheduleRuleDirection.RICEVUTI]: 'Regole documenti ricevuti',
} as const

export enum ScheduleRuleAction {
  CREA_RICONCILIA_MOVIMENTO = 'crea_riconcilia_movimento',
}

export const SCHEDULE_RULE_ACTION_LABELS: Record<ScheduleRuleAction, string> = {
  [ScheduleRuleAction.CREA_RICONCILIA_MOVIMENTO]: 'Crea e Riconcilia Movimento',
} as const

export interface ScheduleRule { ... }
export interface CreateScheduleRuleInput { ... }
export interface UpdateScheduleRuleInput { ... }
```

---

## Step 3: API Routes

### `src/app/api/scadenzario/regole/route.ts`
- **GET**: Lista regole filtrate per `direzione`, ordinate per `ordine ASC`. Include relazione `conto { id, name, code }`.
- **POST**: Crea regola. Auto-assegna `ordine` = max(ordine)+1 per la direzione. Zod: almeno 1 criterio obbligatorio.

**Pattern da copiare:** `src/app/api/scadenzario/ricorrenze/route.ts` (auth, venueId, Zod, Prisma, logger)

### `src/app/api/scadenzario/regole/[id]/route.ts`
- **GET** / **PATCH** / **DELETE** (hard delete, non soft)

### `src/app/api/scadenzario/regole/riordina/route.ts`
- **PATCH**: Riceve `{ orderedIds: string[] }`, aggiorna ordine in transazione Prisma.

---

## Step 4: Layout — Aggiungere terza pill tab

**File:** `src/app/(dashboard)/scadenzario/layout.tsx`

Modifiche:
1. Aggiungere `{ value: '/scadenzario/regole', label: 'Regole' }` all'array `tabs`
2. Aggiornare `isActive` per escludere `/scadenzario/regole` dalla tab "Scadenzario":
```typescript
!pathname.startsWith('/scadenzario/ricorrenze') &&
!pathname.startsWith('/scadenzario/regole')
```

---

## Step 5: Componenti

### `src/components/scadenzario/create-rule-page.tsx`
Form per creare regola (pagina dedicata, NON dialog — come Sibill).

Struttura da Sibill:
- Titolo: "Crea una regola"
- Sottotitolo: "Imposta le azioni che verranno applicate automaticamente alle scadenze..."
- **"Criteri di corrispondenza"** — 2 accordion (Collapsible da `@/components/ui/collapsible`):
  - "Tipo documento" + helper text + Select con `ScheduleDocumentType` + labels da `SCHEDULE_DOCUMENT_TYPE_LABELS`
  - "Tipo pagamento" + helper text + Select con `SchedulePaymentMethod` + labels da `SCHEDULE_PAYMENT_METHOD_LABELS`
- **"Scegli azioni da applicare"** — 1 accordion:
  - "Crea e riconcilia automaticamente un movimento" + lista conti da `GET /api/accounts` (response: `data.accounts[]` con `id`, `name`, `code`). Ogni conto cliccabile con avatar (iniziali del code) e label "Nome | (EUR)". Conto selezionato evidenziato.
- Footer: "Annulla" (router.back) | "Crea la regola" (disabled finche' criteri+conto non configurati)

### `src/components/scadenzario/rule-table.tsx`
Colonne: (ordine) | Conto | Tipo documento | Tipo pagamento | Azione | (menu)

**Pattern:** `src/components/scadenzario/recurrence-table.tsx`

### `src/components/scadenzario/rule-actions.tsx`
DropdownMenu: Modifica | Elimina

**Pattern:** `src/components/scadenzario/recurrence-actions.tsx`

---

## Step 6: Pagine

### `src/app/(dashboard)/scadenzario/regole/page.tsx`
- Header: "Regole" + bottone "Aggiungi una nuova regola +"
- Sub-tabs locali (state, non route): **Regole documenti emessi** (freccia verde) | **Regole documenti ricevuti** (freccia rossa)
- Nota: "Le regole sono applicate nell'ordine visualizzato."
- Tabella regole filtrata per direzione
- Empty state: "Nessuna regola configurata"

**Pattern:** `src/app/(dashboard)/scadenzario/ricorrenze/page.tsx`

### `src/app/(dashboard)/scadenzario/regole/nuova/page.tsx`
Pagina wrapper per `CreateRulePage`. Passa `direzione` da searchParams o default "emessi".

---

## Sequenza di implementazione

1. Schema Prisma + sync (Step 1)
2. Tipi TypeScript (Step 2)
3. API routes — CRUD + riordina (Step 3)
4. Layout: terza pill tab (Step 4)
5. Componenti: form creazione, tabella, azioni (Step 5)
6. Pagine: lista + creazione (Step 6)

---

## File coinvolti

### Nuovi (8)
| File | Scopo |
|------|-------|
| `src/app/(dashboard)/scadenzario/regole/page.tsx` | Lista regole con sub-tabs |
| `src/app/(dashboard)/scadenzario/regole/nuova/page.tsx` | Creazione nuova regola |
| `src/app/api/scadenzario/regole/route.ts` | GET + POST |
| `src/app/api/scadenzario/regole/[id]/route.ts` | GET + PATCH + DELETE |
| `src/app/api/scadenzario/regole/riordina/route.ts` | PATCH riordina |
| `src/components/scadenzario/create-rule-page.tsx` | Form creazione regola |
| `src/components/scadenzario/rule-table.tsx` | Tabella regole |
| `src/components/scadenzario/rule-actions.tsx` | Menu azioni |

### Da modificare (3)
| File | Modifiche |
|------|-----------|
| `prisma/schema.prisma` | +ScheduleRule model, +relazioni Venue/Account/User |
| `src/types/schedule.ts` | +enum ScheduleRuleDirection/Action, +interfacce, +labels |
| `src/app/(dashboard)/scadenzario/layout.tsx` | +tab "Regole", aggiornare isActive |

---

## Verifica

1. `npx prisma db push` — sync senza errori
2. `npx tsc --noEmit` — zero errori TS
3. Navigare a `/scadenzario/regole` — 3 pill tabs visibili
4. Creare regola: Corrispettivo + Contanti + Cassa → appare in tabella
5. Sub-tabs: documenti emessi vs ricevuti filtrano correttamente
6. `/scadenzario` e `/scadenzario/ricorrenze` continuano a funzionare
7. Confronto visivo con screenshot Sibill

# Riclassificazione cash flow — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il gestionale produce il prospetto di cash flow a tre livelli — 9 famiglie, 39 sottogruppi, 149 voci — a partire dai movimenti di prima nota, con i quattro controlli di quadratura.

**Architecture:** La riclassificazione è una struttura statica in TypeScript (`src/lib/cashflow/riclassificazione.ts`), gemella di `piano-conti-weiss-v4.ts`: dice a quale sottogruppo appartiene ogni voce e con che segno. Da lì si seedano le `BudgetCategory` gerarchiche e i loro `AccountBudgetMapping`, così la gerarchia vive anche nel database e resta modificabile dalle impostazioni. L'aggregatore legge i movimenti una volta sola, li orienta con la convenzione `dare − avere` e scorpora l'IVA nel blocco fisco. Una route serve il prospetto, una pagina lo mostra.

**Tech Stack:** Next.js 15 (App Router), Prisma 7 + PostgreSQL, TypeScript, Vitest, decimal.js via `src/lib/money.ts`, shadcn/ui.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md`
**Dati di riferimento:** `docs/cash-flow-riclassificazione.json` (generato da `scripts/build-cashflow-spec.py`)

## Global Constraints

- **Node 22 obbligatorio.** Anteporre `nvm use 22 &&` a ogni comando `npm`/`npx`/`node`, nella stessa riga di shell. Ogni chiamata Bash parte da una shell nuova: va ripetuto ogni volta.
- **API in italiano** per i nuovi percorsi. Il namespace `cashflow` esiste già: si estende con segmenti italiani (`/api/cashflow/prospetto`), non si crea `/api/cash-flow/`.
- **Autorizzazione:** ogni route chiama `auth()`; i dati finanziari richiedono ruolo `admin` o `manager`.
- **Sede:** sempre `getVenueId()` da `src/lib/venue.ts`, mai `venue.findFirst()`.
- **Importi:** mai `number` nei passaggi intermedi. Si legge come `Prisma.Decimal`, si calcola come `Money` (`src/lib/money.ts`), si converte con `toApi()` solo all'uscita.
- **Niente codice irraggiungibile:** una route senza consumer non si scrive. Il vincolo si valuta **sul piano intero, non sul singolo task**: i moduli dei Task 2-6 non sono raggiungibili dalla UI finché non arrivano la route (Task 7) e la pagina (Task 8), ed è previsto che sia così. Un modulo che resta senza consumer alla fine del Task 8 è invece un difetto.
- **Convenzione di segno del prospetto:** entrate positive, uscite negative. Il valore di ogni voce è `dare − avere`, senza eccezioni per natura del conto.
- **Le voci non si duplicano per locale:** la natura la dà la voce, il luogo il centro di costo.
- **⚠️ Il `.env` di questo progetto punta al database di PRODUZIONE** (Supabase, `aws-1-eu-west-2.pooler.supabase.com`). Nessun task esegue comandi che scrivono sul database: niente `prisma migrate dev`, `prisma db push`, `prisma migrate deploy`, `prisma db seed`. I soli comandi Prisma ammessi sono `npx prisma generate` e `npx prisma validate`, che non aprono connessioni. Le migrazioni si **scrivono** e basta: le applica il committente, a mano, seguendo `docs/migrazione-piano-conti-v4.md`. I test di integrazione fanno eccezione perché non leggono `DATABASE_URL`: se la calcolano da soli su PostgreSQL locale (`src/test/integration/env-guard.ts`).
- **Test di integrazione:** eseguirli con `TEST_DB_SUFFIX=cashflow` davanti al comando. Più copie di lavoro del repository condividono lo stesso PostgreSQL locale, e senza suffisso distinto due suite in parallelo si distruggono il database a vicenda.

## Scostamento dalla spec, deciso qui

La spec chiedeva **un flag `isCashFlow` sul conto**. Il piano non lo aggiunge: l'informazione è già nella struttura statica (una voce o è in un sottogruppo, o è nell'insieme `VOCI_FUORI_CASSA`), e una colonna che ripete un dato già presente è una seconda fonte che prima o poi diverge. Il rischio che copriva — un conto nuovo che sparisce in silenzio dal prospetto — è coperto meglio dal controllo C4, che segnala i conti movimentati non riconosciuti dalla riclassificazione. Aggiornare la spec di conseguenza è il primo passo del Task 1.

## File Structure

**Da creare**

| File | Responsabilità |
|---|---|
| `src/lib/cashflow/riclassificazione.ts` | Struttura statica: famiglie, sottogruppi, voci, segni, voci fuori cassa. Nessuna dipendenza da Prisma. |
| `src/lib/cashflow/__tests__/riclassificazione.test.ts` | Invarianti della struttura contro `PIANO_CONTI_WEISS_V4` e contro il JSON. |
| `src/lib/cashflow/movimenti.ts` | Query unica dei movimenti per conto/mese con IVA separata per verso. |
| `src/lib/cashflow/prospetto.ts` | Costruzione del prospetto: righe, totali, memo. Puro rispetto alla presentazione. |
| `src/lib/cashflow/__tests__/prospetto.test.ts` | Test dell'aggregatore su movimenti finti. |
| `src/lib/cashflow/controlli.ts` | I quattro controlli di quadratura. |
| `src/lib/cashflow/__tests__/controlli.test.ts` | Test dei controlli. |
| `src/lib/cashflow/seed-categorie.ts` | Genera famiglie e sottogruppi come `BudgetCategory` + i mapping. |
| `src/lib/cashflow/__tests__/seed-categorie.itest.ts` | Test di integrazione del seed (idempotenza). |
| `src/app/api/cashflow/prospetto/route.ts` | GET del prospetto. |
| `src/app/api/cashflow/prospetto/__tests__/prospetto.itest.ts` | Test di integrazione della route. |
| `src/app/(dashboard)/cash-flow/prospetto/page.tsx` | Pagina server. |
| `src/app/(dashboard)/cash-flow/prospetto/ProspettoClient.tsx` | Client: tabella espandibile, selettore anno. |
| `src/components/cashflow/ProspettoTable.tsx` | Tabella a tre livelli. |
| `src/components/cashflow/ControlliQuadratura.tsx` | Banda dei quattro controlli. |
| `prisma/migrations/20260811000000_cash_flow_enums/migration.sql` | `PATRIMONIALE` su `AccountType`, `FINANCING` su `BudgetCategoryType`. |

**Da modificare**

| File | Modifica |
|---|---|
| `prisma/schema.prisma:2113` | `AccountType` += `PATRIMONIALE`; `BudgetCategoryType` += `FINANCING`. |
| `src/lib/accounts/piano-conti-weiss-v4.ts` | `tipo` accetta `'PATRIMONIALE'`; 14 voci del mastro 40. |
| `src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts` | Conteggi e vincoli aggiornati a 169 voci. |
| `src/app/api/budget-categories/seed/route.ts` | Le categorie generiche lasciano il posto a quelle della riclassificazione. |
| `src/lib/saldi.ts:83` | Esportare `movimentiChePesano`. |
| `src/components/layout/sidebar.tsx:76` | Voce di navigazione "Prospetto". |
| `docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md` | Requisito 3 del modello dati: niente colonna, controllo C4. |

---

## Task 1: Mastro 40 e i due enum

Le 14 voci patrimoniali entrano nel piano dei conti. Non serve altro perché finiscano nel database: `scripts/piano-v4/03-migrate.ts` inserisce tutte le voci di `PIANO_CONTI_WEISS_V4`, e queste ci saranno.

**Files:**
- Modify: `prisma/schema.prisma:2113` e `:2208`
- Create: `prisma/migrations/20260811000000_cash_flow_enums/migration.sql`
- Modify: `src/lib/accounts/piano-conti-weiss-v4.ts`
- Modify: `src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts`
- Modify: `docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md`

**Interfaces:**
- Consumes: niente.
- Produces: `PIANO_CONTI_WEISS_V4` con 169 voci; `VocePianoV4.tipo: 'RICAVO' | 'COSTO' | 'PATRIMONIALE'`; i codici `40.1.01`–`40.4.02`.

- [ ] **Step 1: Aggiornare i test esistenti perché falliscano**

In `src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts`, sostituire i tre test dei conteggi e i due dei vincoli strutturali:

```typescript
  it('contiene esattamente 169 voci', () => {
    expect(PIANO_CONTI_WEISS_V4).toHaveLength(169)
  })

  it('ha 12 voci RICAVO, 143 COSTO e 14 PATRIMONIALE', () => {
    const ricavi = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'RICAVO')
    const costi = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'COSTO')
    const patrimoniali = PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'PATRIMONIALE')

    expect(ricavi).toHaveLength(12)
    expect(costi).toHaveLength(143)
    expect(patrimoniali).toHaveLength(14)
  })

  it('gruppoCode è presente solo per i mastri 20, 28, 32 e 40', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      const articolato = ['20', '28', '32', '40'].includes(voce.mastroCode)
      expect(Boolean(voce.gruppoCode)).toBe(articolato)
    }
  })

  it('i mastri RICAVO stanno tra 10 e 13, i COSTO tra 20 e 33, i PATRIMONIALE valgono 40', () => {
    for (const voce of PIANO_CONTI_WEISS_V4) {
      const mastro = Number(voce.mastroCode)

      if (voce.tipo === 'RICAVO') expect(mastro).toBeGreaterThanOrEqual(10)
      if (voce.tipo === 'RICAVO') expect(mastro).toBeLessThanOrEqual(13)
      if (voce.tipo === 'COSTO') expect(mastro).toBeGreaterThanOrEqual(20)
      if (voce.tipo === 'COSTO') expect(mastro).toBeLessThanOrEqual(33)
      if (voce.tipo === 'PATRIMONIALE') expect(mastro).toBe(40)
    }
  })

  it('le voci patrimoniali coprono i quattro gruppi del mastro 40', () => {
    const gruppi = new Set(
      PIANO_CONTI_WEISS_V4.filter((v) => v.tipo === 'PATRIMONIALE').map((v) => v.gruppoCode)
    )

    expect([...gruppi].sort()).toEqual(['40.1', '40.2', '40.3', '40.4'])
  })
```

- [ ] **Step 2: Eseguire i test per vederli fallire**

Run: `nvm use 22 && npx vitest run src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts`
Expected: FAIL — `expected 155 to be 169` sul primo test.

- [ ] **Step 3: Allargare il tipo e aggiungere le 14 voci**

In `src/lib/accounts/piano-conti-weiss-v4.ts`, cambiare il campo `tipo` dell'interfaccia:

```typescript
  tipo: 'RICAVO' | 'COSTO' | 'PATRIMONIALE'
```

e aggiungere in coda all'array `PIANO_CONTI_WEISS_V4`, dopo l'ultima voce del mastro 33:

```typescript
  // ─── PATRIMONIALE ─────────────────────────────────────────────────────
  // Mastro 40: i movimenti che spostano denaro senza essere costi o ricavi.
  // Non viene dall'Excel v4: nasce con la riclassificazione cash flow (spec
  // 2026-08-11), perché una rata di mutuo o un F24 devono avere un conto su
  // cui registrarsi, altrimenti la riconciliazione bancaria li lascia scoperti.
  {
    code: '40.1.01',
    nome: 'Acquisto immobilizzazioni materiali',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.1',
    gruppoNome: 'Investimenti',
    regolaCentro: 'OBBLIGATORIO',
  },
  {
    code: '40.1.02',
    nome: 'Acquisto immobilizzazioni immateriali',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.1',
    gruppoNome: 'Investimenti',
    regolaCentro: 'OBBLIGATORIO',
  },
  {
    code: '40.1.03',
    nome: 'Migliorie su beni di terzi',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.1',
    gruppoNome: 'Investimenti',
    regolaCentro: 'OBBLIGATORIO',
  },
  {
    code: '40.1.04',
    nome: 'Cessione cespiti',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.1',
    gruppoNome: 'Investimenti',
    regolaCentro: 'OBBLIGATORIO',
    nota: "Incasso della vendita; la plusvalenza (12.07) non è cassa",
  },
  {
    code: '40.2.01',
    nome: 'Rimborso capitale mutui',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.2',
    gruppoNome: 'Finanziamenti',
    regolaCentro: 'DEFAULT_STR',
    nota: 'Solo quota capitale; gli interessi restano in 32.1.01',
  },
  {
    code: '40.2.02',
    nome: 'Erogazione nuovi finanziamenti',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.2',
    gruppoNome: 'Finanziamenti',
    regolaCentro: 'DEFAULT_STR',
  },
  {
    code: '40.2.03',
    nome: 'Rimborso finanziamento soci',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.2',
    gruppoNome: 'Finanziamenti',
    regolaCentro: 'DEFAULT_STR',
  },
  {
    code: '40.2.04',
    nome: 'Versamento finanziamento soci',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.2',
    gruppoNome: 'Finanziamenti',
    regolaCentro: 'DEFAULT_STR',
  },
  {
    code: '40.3.01',
    nome: 'F24 IVA versata',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.3',
    gruppoNome: 'Erario e previdenza',
    regolaCentro: 'DEFAULT_STR',
  },
  {
    code: '40.3.02',
    nome: 'F24 imposte sul reddito',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.3',
    gruppoNome: 'Erario e previdenza',
    regolaCentro: 'DEFAULT_STR',
    nota: 'Versamento di IRES e IRAP; il mastro 33 resta competenza',
  },
  {
    code: '40.3.03',
    nome: 'F24 ritenute e contributi',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.3',
    gruppoNome: 'Erario e previdenza',
    regolaCentro: 'DEFAULT_STR',
    nota: "Ricompone il lordo del personale insieme a 28.1",
  },
  {
    code: '40.3.04',
    nome: 'Rimborsi e crediti compensati',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.3',
    gruppoNome: 'Erario e previdenza',
    regolaCentro: 'DEFAULT_STR',
  },
  {
    code: '40.4.01',
    nome: 'Versamento contanti in banca',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.4',
    gruppoNome: 'Tesoreria interna',
    regolaCentro: 'DEFAULT_STR',
    nota: 'Neutro: le due gambe si elidono nel consolidato',
  },
  {
    code: '40.4.02',
    nome: 'Giroconti tra conti',
    tipo: 'PATRIMONIALE',
    mastroCode: '40',
    mastroNome: 'Movimenti finanziari e patrimoniali',
    gruppoCode: '40.4',
    gruppoNome: 'Tesoreria interna',
    regolaCentro: 'DEFAULT_STR',
    nota: 'Neutro: le due gambe si elidono nel consolidato',
  },
```

- [ ] **Step 4: Eseguire i test**

Run: `nvm use 22 && npx vitest run src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts`
Expected: PASS, tutti.

Se fallisce il test dell'ordinamento lessicografico: `'40.1.01'` viene dopo `'33.03'` in ordine lessicografico, quindi va bene in coda. Se fallisce, controllare di non aver inserito le voci prima del mastro 33.

- [ ] **Step 5: Estendere i due enum nello schema**

In `prisma/schema.prisma`, riga 2113:

```prisma
enum AccountType {
  RICAVO
  COSTO
  ATTIVO
  PASSIVO
  PATRIMONIALE
}
```

e riga 2208:

```prisma
enum BudgetCategoryType {
  REVENUE
  COST
  KPI
  TAX
  INVESTMENT
  VAT
  FINANCING
}
```

- [ ] **Step 6: Scrivere la migrazione**

Creare `prisma/migrations/20260811000000_cash_flow_enums/migration.sql`:

```sql
-- Riclassificazione cash flow (spec 2026-08-11).
--
-- PATRIMONIALE: il mastro 40 non è né ricavo né costo. ATTIVO e PASSIVO
-- restano ai conti di sistema (cassa, banca, debiti v/fornitori).
--
-- FINANCING: la famiglia I del prospetto (rimborsi capitale, nuova finanza,
-- soci) non è un investimento e non è un'imposta.
--
-- I valori nuovi di un enum non sono utilizzabili nella stessa transazione
-- che li aggiunge: questa migrazione aggiunge soltanto: chi li usa arriva
-- dopo, con i dati.
ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'PATRIMONIALE';
ALTER TYPE "BudgetCategoryType" ADD VALUE IF NOT EXISTS 'FINANCING';
```

- [ ] **Step 7: Rigenerare il client, senza toccare il database**

**Non eseguire `prisma migrate dev`.** `DATABASE_URL` punta alla produzione: quel comando applicherebbe una `ALTER TYPE` al database reale, e togliere un valore da un enum PostgreSQL dopo è tutt'altro che banale. La migrazione appena scritta si applica in produzione a mano, insieme alle altre del piano v4.

Run: `nvm use 22 && npx prisma generate`
Expected: `Generated Prisma Client`. Il comando legge solo `schema.prisma`, non apre connessioni.

Run: `nvm use 22 && npx tsc --noEmit`
Expected: nessun errore. Se il compilatore non riconosce `'PATRIMONIALE'` come valore di `AccountType`, il client non è stato rigenerato: ripetere `npx prisma generate`.

Run: `nvm use 22 && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 8: Aggiornare la spec sullo scostamento**

In `docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md`, sostituire il punto 3 della sezione "Modello dati":

```markdown
3. **Nessun flag `isCashFlow` sul conto.** L'informazione è nella struttura statica `src/lib/cashflow/riclassificazione.ts`: una voce o sta in un sottogruppo, o sta in `VOCI_FUORI_CASSA`. Una colonna che ripete un dato già presente è una seconda fonte destinata a divergere. Il rischio — un conto nuovo che sparisce in silenzio dal prospetto — lo copre il controllo C4.
```

e nella tabella dei quattro controlli, sostituire la riga 4:

```markdown
| 4 | Zero movimenti su conti fuori piano, inattivi, o non riconosciuti dalla riclassificazione | Etichette duplicate, conti legacy, conti nuovi mai mappati |
```

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260811000000_cash_flow_enums \
        src/lib/accounts/piano-conti-weiss-v4.ts \
        src/lib/accounts/__tests__/piano-conti-weiss-v4.test.ts \
        docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md
git commit -m "feat(piano-conti): mastro 40 patrimoniale e i due enum del cash flow"
```

---

## Task 2: La struttura di riclassificazione

Il modulo statico che dice, per ogni voce, dove va nel prospetto. Nessuna dipendenza da Prisma: è una tabella, e si testa come tale.

**Files:**
- Create: `src/lib/cashflow/riclassificazione.ts`
- Create: `src/lib/cashflow/__tests__/riclassificazione.test.ts`

**Interfaces:**
- Consumes: `PIANO_CONTI_WEISS_V4` da `src/lib/accounts/piano-conti-weiss-v4.ts` (Task 1).
- Produces:
  - `type CodiceFamiglia = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'`
  - `interface Sottogruppo { codice: string; nome: string; voci: readonly string[]; calcolato?: 'IVA_ENTRATE' | 'IVA_USCITE' }`
  - `interface Famiglia { codice: CodiceFamiglia; nome: string; tipo: BudgetCategoryType; sottogruppi: readonly Sottogruppo[] }`
  - `const RICLASSIFICAZIONE_CASH_FLOW: readonly Famiglia[]`
  - `const VOCI_FUORI_CASSA: ReadonlyMap<string, string>` (codice → motivo)
  - `const RIGHE_MEMO: readonly RigaMemo[]`
  - `function vociRiconosciute(): ReadonlySet<string>` — mappate, fuori cassa o nel memo. La usa il controllo C4 (Task 5).

- [ ] **Step 1: Scrivere il test delle invarianti**

Creare `src/lib/cashflow/__tests__/riclassificazione.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PIANO_CONTI_WEISS_V4 } from '@/lib/accounts/piano-conti-weiss-v4'
import {
  RICLASSIFICAZIONE_CASH_FLOW,
  VOCI_FUORI_CASSA,
  RIGHE_MEMO,
  vociRiconosciute,
} from '../riclassificazione'

const vociMappate = RICLASSIFICAZIONE_CASH_FLOW.flatMap((f) =>
  f.sottogruppi.flatMap((s) => s.voci)
)

describe('struttura', () => {
  it('ha 9 famiglie e 39 sottogruppi', () => {
    expect(RICLASSIFICAZIONE_CASH_FLOW).toHaveLength(9)
    expect(RICLASSIFICAZIONE_CASH_FLOW.flatMap((f) => f.sottogruppi)).toHaveLength(39)
  })

  it('mappa 149 voci nel prospetto, senza duplicati', () => {
    expect(vociMappate).toHaveLength(149)
    expect(new Set(vociMappate).size).toBe(149)
  })

  it('dichiara 18 voci fuori cassa, ognuna con un motivo', () => {
    expect(VOCI_FUORI_CASSA.size).toBe(18)
    for (const motivo of VOCI_FUORI_CASSA.values()) {
      expect(motivo.length).toBeGreaterThan(10)
    }
  })

  it('i codici di famiglia sono A..I e i sottogruppi iniziano con la loro famiglia', () => {
    expect(RICLASSIFICAZIONE_CASH_FLOW.map((f) => f.codice)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
    ])

    for (const famiglia of RICLASSIFICAZIONE_CASH_FLOW) {
      for (const sottogruppo of famiglia.sottogruppi) {
        expect(sottogruppo.codice.startsWith(famiglia.codice)).toBe(true)
      }
    }
  })
})

describe('copertura del piano dei conti', () => {
  it('ogni voce del piano è mappata oppure dichiarata fuori cassa, mai entrambe', () => {
    const mappate = new Set(vociMappate)

    for (const voce of PIANO_CONTI_WEISS_V4) {
      const inProspetto = mappate.has(voce.code)
      const fuoriCassa = VOCI_FUORI_CASSA.has(voce.code)
      const inMemo = RIGHE_MEMO.some((m) => m.voci?.includes(voce.code))

      expect(
        [inProspetto, fuoriCassa, inMemo].filter(Boolean).length,
        `${voce.code} ${voce.nome}`
      ).toBe(1)
    }
  })

  it('non mappa codici che nel piano non esistono', () => {
    const esistenti = new Set(PIANO_CONTI_WEISS_V4.map((v) => v.code))

    for (const code of vociMappate) {
      expect(esistenti.has(code), `${code} non è nel piano dei conti`).toBe(true)
    }
    for (const code of VOCI_FUORI_CASSA.keys()) {
      expect(esistenti.has(code), `${code} non è nel piano dei conti`).toBe(true)
    }
  })

  it('le due voci di tesoreria interna stanno nel memo, non fra le fuori cassa', () => {
    const mappate = new Set(vociMappate)

    expect(mappate.has('40.4.01')).toBe(false)
    expect(VOCI_FUORI_CASSA.has('40.4.01')).toBe(false)
    expect(RIGHE_MEMO.find((m) => m.codice === 'M3')!.voci).toContain('40.4.01')
  })
})

describe('vociRiconosciute', () => {
  it('comprende le mappate, le fuori cassa e quelle del memo: 169 in tutto', () => {
    const riconosciute = vociRiconosciute()

    expect(riconosciute.size).toBe(169)
    expect(riconosciute.has('20.1.01')).toBe(true)
    expect(riconosciute.has('31.01')).toBe(true)
    expect(riconosciute.has('40.4.01')).toBe(true)
  })

  it('non riconosce un codice inventato: è così che il controllo C4 se ne accorge', () => {
    expect(vociRiconosciute().has('999.99')).toBe(false)
  })
})

describe('coerenza col documento consegnato al committente', () => {
  it('rispecchia docs/cash-flow-riclassificazione.json', () => {
    const documento = JSON.parse(
      readFileSync(join(process.cwd(), 'docs/cash-flow-riclassificazione.json'), 'utf8')
    ) as {
      famiglie: { codice: string; sottogruppi: { codice: string; voci: string[] }[] }[]
    }

    const daJson = documento.famiglie.map((f) => ({
      codice: f.codice,
      sottogruppi: f.sottogruppi.map((s) => ({ codice: s.codice, voci: s.voci })),
    }))
    const daCodice = RICLASSIFICAZIONE_CASH_FLOW.map((f) => ({
      codice: f.codice,
      sottogruppi: f.sottogruppi.map((s) => ({ codice: s.codice, voci: [...s.voci] })),
    }))

    expect(daCodice).toEqual(daJson)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/riclassificazione.test.ts`
Expected: FAIL — `Cannot find module '../riclassificazione'`.

- [ ] **Step 3: Scrivere il modulo**

Creare `src/lib/cashflow/riclassificazione.ts`:

```typescript
/**
 * Riclassificazione delle voci di conto sul prospetto di cash flow.
 *
 * Fonte: docs/superpowers/specs/2026-08-11-riclassificazione-cash-flow-design.md
 * e docs/cash-flow-riclassificazione.json, generati da
 * scripts/build-cashflow-spec.py. Un test verifica che questo file e il JSON
 * dicano la stessa cosa.
 *
 * Tre livelli: famiglia → sottogruppo → voce di conto. I movimenti si
 * registrano sempre sulla voce; famiglia e sottogruppo sono derivati.
 *
 * Il prospetto legge SOLO la cassa. Le voci che non toccano mai il conto
 * corrente stanno in VOCI_FUORI_CASSA con il motivo: restano nel piano dei
 * conti, pronte per una futura vista di competenza, ma non compaiono qui.
 *
 * La natura la dà la voce, il luogo lo dà il centro di costo: nessun
 * sottogruppo nomina un locale.
 */
import type { BudgetCategoryType } from '@prisma/client'

export type CodiceFamiglia = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

/**
 * Un sottogruppo senza voci è **calcolato**: il suo valore non viene da conti
 * ma dall'IVA dei movimenti. Nel gestionale l'importo di un movimento è lordo
 * e l'IVA sta in `vatAmount`, quindi G1 e G2 sono aggregazioni di quel campo e
 * non conti su cui si registra.
 */
export interface Sottogruppo {
  codice: string
  nome: string
  voci: readonly string[]
  calcolato?: 'IVA_ENTRATE' | 'IVA_USCITE'
}

export interface Famiglia {
  codice: CodiceFamiglia
  nome: string
  tipo: BudgetCategoryType
  sottogruppi: readonly Sottogruppo[]
}

/**
 * Una riga memo attraversa più famiglie e **non entra in nessun totale**: se
 * la si modellasse come categoria, il suo importo verrebbe contato due volte.
 */
export interface RigaMemo {
  codice: string
  nome: string
  scopo: string
  /** Somma di famiglie o sottogruppi già presenti nel prospetto. */
  somma?: readonly string[]
  /** Oppure voci proprie, che nel prospetto non compaiono altrove. */
  voci?: readonly string[]
}

export const RICLASSIFICAZIONE_CASH_FLOW: readonly Famiglia[] = [
  {
    codice: 'A',
    nome: 'Incassi operativi',
    tipo: 'REVENUE',
    sottogruppi: [
      { codice: 'A1', nome: 'Corrispettivi', voci: ['10.01', '10.09'] },
      { codice: 'A2', nome: 'Eventi', voci: ['11.01', '11.02'] },
      {
        codice: 'A3',
        nome: 'Altri proventi',
        voci: ['12.01', '12.02', '12.03', '12.04', '12.06', '13.01', '13.02'],
      },
    ],
  },
  {
    codice: 'B',
    nome: 'Costo del venduto',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'B1',
        nome: 'Beverage alcolico',
        voci: ['20.1.01', '20.1.02', '20.1.03', '20.1.04', '20.1.05'],
      },
      {
        codice: 'B2',
        nome: 'Beverage analcolico',
        voci: ['20.2.01', '20.2.02', '20.2.03', '20.2.04'],
      },
      {
        codice: 'B3',
        nome: 'Caffetteria',
        voci: ['20.3.01', '20.3.02', '20.3.03', '20.3.04'],
      },
      {
        codice: 'B4',
        nome: 'Food',
        voci: ['20.4.01', '20.4.02', '20.4.03', '20.4.04', '20.4.05'],
      },
      {
        codice: 'B5',
        nome: 'Consumabili di servizio',
        voci: ['20.5.01', '20.5.02', '20.5.03', '20.5.04', '20.5.05'],
      },
      { codice: 'B6', nome: 'Rettifiche su acquisti', voci: ['20.6.01'] },
    ],
  },
  {
    codice: 'C',
    nome: 'Costo del personale',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'C1',
        nome: 'Retribuzioni',
        voci: [
          '28.1.01', '28.1.02', '28.1.03', '28.1.04', '28.1.05',
          '28.1.06', '28.1.07', '28.1.08', '28.1.09',
        ],
      },
      { codice: 'C2', nome: 'Oneri sociali', voci: ['28.2.01', '28.2.02', '28.2.03'] },
      { codice: 'C3', nome: 'TFR corrisposto', voci: ['28.3.02'] },
      {
        codice: 'C4',
        nome: 'Altri costi del personale',
        voci: ['28.4.01', '28.4.02', '28.4.03', '28.4.04', '28.4.05'],
      },
      {
        codice: 'C5',
        nome: 'Organi sociali e collaborazioni',
        voci: ['29.01', '29.02', '29.04', '29.05'],
      },
    ],
  },
  {
    codice: 'D',
    nome: 'Costi diretti eventi',
    tipo: 'COST',
    sottogruppi: [
      { codice: 'D1', nome: 'Artisti e service', voci: ['26.01', '26.02'] },
      { codice: 'D2', nome: 'Manodopera evento', voci: ['26.03', '26.05', '26.06'] },
      { codice: 'D3', nome: 'Promozione evento', voci: ['26.04', '26.07', '26.08'] },
      {
        codice: 'D4',
        nome: 'Oneri e allestimenti evento',
        voci: ['26.09', '26.10', '26.11'],
      },
    ],
  },
  {
    codice: 'E',
    nome: 'Costi di struttura',
    tipo: 'COST',
    sottogruppi: [
      { codice: 'E1', nome: 'Immobili e spazi', voci: ['27.01', '27.02', '27.03'] },
      {
        codice: 'E2',
        nome: 'Utenze',
        voci: ['22.01', '22.02', '22.03', '22.04', '22.05', '22.07'],
      },
      {
        codice: 'E3',
        nome: 'Noleggi, leasing e licenze',
        voci: ['27.04', '27.05', '27.06', '27.07', '27.08'],
      },
      {
        codice: 'E4',
        nome: 'Manutenzioni e servizi operativi',
        voci: ['23.01', '23.02', '23.03', '23.05', '23.07'],
      },
      {
        codice: 'E5',
        nome: 'Attrezzatura e allestimenti',
        voci: ['21.01', '21.02', '21.03', '21.04', '21.05', '21.06', '21.07'],
      },
      {
        codice: 'E6',
        nome: 'Servizi professionali e amministrativi',
        voci: [
          '24.01', '24.02', '24.03', '24.04', '24.05',
          '24.06', '24.07', '24.08', '24.09',
        ],
      },
      {
        codice: 'E7',
        nome: 'Marketing e comunicazione',
        voci: [
          '25.01', '25.02', '25.03', '25.04',
          '25.05', '25.06', '25.07', '25.08',
        ],
      },
      {
        codice: 'E8',
        nome: 'Tributi, assicurazioni e oneri diversi',
        voci: [
          '30.01', '30.02', '30.03', '30.04', '30.05', '30.06', '30.07',
          '30.08', '30.09', '30.10', '30.13', '30.14', '30.15',
        ],
      },
    ],
  },
  {
    codice: 'F',
    nome: 'Oneri finanziari',
    tipo: 'COST',
    sottogruppi: [
      {
        codice: 'F1',
        nome: 'Interessi passivi',
        voci: ['32.1.01', '32.1.02', '32.1.03', '32.1.04'],
      },
      {
        codice: 'F2',
        nome: 'Spese e servizi bancari',
        voci: ['32.2.01', '32.2.02', '32.2.03', '32.2.04'],
      },
      {
        // Decisione del committente (11 ago): le commissioni per circuito
        // stanno negli oneri finanziari e non nel costo del venduto, quindi
        // il margine di contribuzione non le assorbe. Il presidio è il KPI
        // "incidenza commissioni sui corrispettivi".
        codice: 'F3',
        nome: 'Commissioni su incassi',
        voci: ['32.3.01', '32.3.02', '32.3.03', '32.3.04', '32.3.05'],
      },
    ],
  },
  {
    codice: 'G',
    nome: 'Fisco e IVA',
    tipo: 'TAX',
    sottogruppi: [
      {
        codice: 'G1',
        nome: 'IVA incassata sui corrispettivi',
        voci: [],
        calcolato: 'IVA_ENTRATE',
      },
      {
        codice: 'G2',
        nome: 'IVA pagata sugli acquisti',
        voci: [],
        calcolato: 'IVA_USCITE',
      },
      { codice: 'G3', nome: 'F24 IVA', voci: ['40.3.01', '40.3.04'] },
      { codice: 'G4', nome: 'Imposte sul reddito', voci: ['40.3.02'] },
      { codice: 'G5', nome: 'Ritenute e contributi', voci: ['40.3.03'] },
    ],
  },
  {
    codice: 'H',
    nome: 'Investimenti',
    tipo: 'INVESTMENT',
    sottogruppi: [
      {
        codice: 'H1',
        nome: 'Acquisto immobilizzazioni',
        voci: ['40.1.01', '40.1.02', '40.1.03'],
      },
      { codice: 'H2', nome: 'Cessione cespiti', voci: ['40.1.04'] },
    ],
  },
  {
    codice: 'I',
    nome: 'Finanziamenti',
    tipo: 'FINANCING',
    sottogruppi: [
      { codice: 'I1', nome: 'Rimborso capitale', voci: ['40.2.01'] },
      { codice: 'I2', nome: 'Nuova finanza', voci: ['40.2.02'] },
      { codice: 'I3', nome: 'Soci', voci: ['40.2.03', '40.2.04'] },
    ],
  },
]

/**
 * Voci che restano nel piano dei conti ma non nel prospetto, perché non
 * toccano mai cassa o banca. Il motivo è parte del dato: serve a chi si chiede
 * perché un numero che vede in bilancio qui non c'è.
 */
export const VOCI_FUORI_CASSA: ReadonlyMap<string, string> = new Map([
  ['12.07', "Plusvalenza contabile; l'incasso della cessione è 40.1.04"],
  ['20.6.02', 'Variazione di magazzino, nessun esborso'],
  ['20.6.03', 'Variazione di magazzino, nessun esborso'],
  ['20.6.04', 'Riclassifica di valore, nessun esborso'],
  ['20.6.05', 'Riclassifica di valore, nessun esborso'],
  ['28.3.01', "Competenza; l'esborso è 28.3.02"],
  ['30.11', "Mancata entrata, non un'uscita"],
  ['30.12', 'Minusvalenza contabile'],
  ['31.01', 'Ammortamento: non tocca il conto'],
  ['31.02', 'Ammortamento: non tocca il conto'],
  ['31.03', 'Ammortamento: non tocca il conto'],
  ['31.04', 'Ammortamento: non tocca il conto'],
  ['31.05', 'Ammortamento: non tocca il conto'],
  ['31.06', 'Ammortamento: non tocca il conto'],
  ['31.07', 'Svalutazione: non tocca il conto'],
  ['33.01', 'Competenza; il versamento è 40.3.02'],
  ['33.02', 'Competenza; il versamento è 40.3.02'],
  ['33.03', 'Competenza; il versamento è 40.3.02'],
])

export const RIGHE_MEMO: readonly RigaMemo[] = [
  {
    codice: 'M1',
    nome: 'Totale manodopera',
    scopo:
      "Percentuale manodopera sugli incassi. Serve perché il lordo del " +
      "personale si ricompone in due pezzi: il netto su 28.1 e le ritenute " +
      'e i contributi su 40.3.03, versati il mese dopo.',
    somma: ['C', 'D2', 'G5'],
  },
  {
    codice: 'M2',
    nome: 'Margine eventi',
    scopo: 'Ricavi eventi meno costi diretti eventi: dice se gli eventi guadagnano.',
    somma: ['A2', 'D'],
  },
  {
    codice: 'M3',
    nome: 'Tesoreria interna',
    scopo:
      'Versamenti e giroconti. Si elidono nel consolidato — se non lo fanno, ' +
      'una gamba è stata registrata e l\'altra no.',
    voci: ['40.4.01', '40.4.02'],
  },
]

const SOTTOGRUPPO_PER_VOCE: ReadonlyMap<string, string> = new Map(
  RICLASSIFICAZIONE_CASH_FLOW.flatMap((famiglia) =>
    famiglia.sottogruppi.flatMap((sottogruppo) =>
      sottogruppo.voci.map((voce) => [voce, sottogruppo.codice] as const)
    )
  )
)

/**
 * Tutte le voci che il prospetto conosce: mappate, fuori cassa o nel memo.
 *
 * È il complemento del controllo C4: quello che non è qui dentro, e viene
 * movimentato, non compare in nessuna riga — e va detto invece di lasciarlo
 * sparire.
 */
export function vociRiconosciute(): ReadonlySet<string> {
  return new Set([
    ...SOTTOGRUPPO_PER_VOCE.keys(),
    ...VOCI_FUORI_CASSA.keys(),
    ...RIGHE_MEMO.flatMap((memo) => memo.voci ?? []),
  ])
}
```

- [ ] **Step 4: Eseguire il test**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/riclassificazione.test.ts`
Expected: PASS, tutti e dieci i test.

Se fallisce quello di coerenza col JSON, la differenza è fra questo file e `docs/cash-flow-riclassificazione.json`: **il JSON ha ragione**, è il documento approvato dal committente. Correggere il TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cashflow/riclassificazione.ts src/lib/cashflow/__tests__/riclassificazione.test.ts
git commit -m "feat(cash-flow): struttura di riclassificazione a tre livelli"
```

---

## Task 3: I movimenti con l'IVA separata per verso

Una query sola, con l'IVA tenuta distinta fra entrate e uscite. Serve perché nel gestionale l'importo del movimento è **lordo**: senza scorporare, le famiglie A-F mostrerebbero importi IVA inclusa e le percentuali di margine sarebbero false.

**Files:**
- Create: `src/lib/cashflow/movimenti.ts`
- Create: `src/lib/cashflow/__tests__/movimenti.test.ts`
- Modify: `src/lib/saldi.ts:83`

**Interfaces:**
- Consumes: `movimentiChePesano` da `src/lib/saldi.ts` (da esportare in questo task).
- Produces:
  - `interface MovimentoAggregato { accountId: string | null; mese: number; dare: Money; avere: Money; ivaDare: Money; ivaAvere: Money }`
  - `async function movimentiCashFlow(venueId: string, anno: number): Promise<MovimentoAggregato[]>`
  - `function nettoDiIva(m: MovimentoAggregato): Money` — `(dare − ivaDare) − (avere − ivaAvere)`

- [ ] **Step 1: Scrivere il test**

Creare `src/lib/cashflow/__tests__/movimenti.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import { nettoDiIva, type MovimentoAggregato } from '../movimenti'

function movimento(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'conto',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

describe('nettoDiIva', () => {
  it("un'uscita di 122 con 22 di IVA vale −100", () => {
    const netto = nettoDiIva(movimento({ avere: money(122), ivaAvere: money(22) }))
    expect(netto.toNumber()).toBe(-100)
  })

  it("un'entrata di 122 con 22 di IVA vale +100", () => {
    const netto = nettoDiIva(movimento({ dare: money(122), ivaDare: money(22) }))
    expect(netto.toNumber()).toBe(100)
  })

  it('senza IVA il netto coincide con dare meno avere', () => {
    const netto = nettoDiIva(movimento({ dare: money(500), avere: money(120) }))
    expect(netto.toNumber()).toBe(380)
  })

  it('entrate e uscite sullo stesso conto e mese si compensano al netto', () => {
    const netto = nettoDiIva(
      movimento({
        dare: money(61),
        ivaDare: money(11),
        avere: money(122),
        ivaAvere: money(22),
      })
    )
    expect(netto.toNumber()).toBe(-50)
  })

  it('non perde centesimi su importi con decimali', () => {
    const netto = nettoDiIva(movimento({ avere: money('12.20'), ivaAvere: money('2.20') }))
    expect(netto.toFixed(2)).toBe('-10.00')
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/movimenti.test.ts`
Expected: FAIL — `Cannot find module '../movimenti'`.

- [ ] **Step 3: Esportare il filtro condiviso**

In `src/lib/saldi.ts`, riga 83, aggiungere `export`:

```typescript
/** I movimenti che contano per i saldi: quelli non nascosti della sede. */
export function movimentiChePesano(venueId: string): Prisma.JournalEntryWhereInput {
  return { venueId, hiddenAt: null }
}
```

- [ ] **Step 4: Scrivere il modulo**

Creare `src/lib/cashflow/movimenti.ts`:

```typescript
/**
 * I movimenti dell'anno aggregati per conto e mese, con l'IVA tenuta distinta
 * fra entrate e uscite.
 *
 * Perché non basta `movimentiPerContoEMese` di saldi.ts: nel gestionale
 * l'importo di un movimento è **lordo** (`creditAmount = invoice.totalAmount`)
 * e l'IVA sta in `vatAmount`. Il prospetto vuole le famiglie A-F al netto — o
 * le percentuali di margine mentono — e l'IVA in un blocco suo, dove si vede
 * per quello che è: denaro che transita. Per farlo serve sapere quanta IVA sta
 * dalla parte delle entrate e quanta da quella delle uscite, e quella
 * distinzione va fatta nella query, non dopo.
 */
import { prisma } from '@/lib/prisma'
import { money, type Money } from '@/lib/money'
import { movimentiChePesano } from '@/lib/saldi'
import { toDateOnlyUtc } from '@/lib/timezone'

export interface MovimentoAggregato {
  accountId: string | null
  /** 1-12. */
  mese: number
  dare: Money
  avere: Money
  /** IVA dei movimenti in dare, cioè quella incassata. */
  ivaDare: Money
  /** IVA dei movimenti in avere, cioè quella pagata. */
  ivaAvere: Money
}

/**
 * Il valore della voce nel prospetto: entrate positive, uscite negative, al
 * netto dell'IVA che viaggia insieme al movimento.
 */
export function nettoDiIva(m: MovimentoAggregato): Money {
  return m.dare.minus(m.ivaDare).minus(m.avere.minus(m.ivaAvere))
}

/** Il valore lordo: quello che tocca davvero il conto. Serve alla quadratura. */
export function lordo(m: MovimentoAggregato): Money {
  return m.dare.minus(m.avere)
}

export async function movimentiCashFlow(
  venueId: string,
  anno: number
): Promise<MovimentoAggregato[]> {
  const righe = await prisma.journalEntry.findMany({
    where: {
      ...movimentiChePesano(venueId),
      date: {
        gte: toDateOnlyUtc(`${anno}-01-01`),
        lte: toDateOnlyUtc(`${anno}-12-31`),
      },
    },
    select: {
      accountId: true,
      date: true,
      debitAmount: true,
      creditAmount: true,
      vatAmount: true,
    },
  })

  const perContoEMese = new Map<string, MovimentoAggregato>()

  for (const riga of righe) {
    const mese = riga.date.getUTCMonth() + 1
    const chiave = `${riga.accountId ?? ''}|${mese}`

    const corrente =
      perContoEMese.get(chiave) ??
      {
        accountId: riga.accountId,
        mese,
        dare: money(0),
        avere: money(0),
        ivaDare: money(0),
        ivaAvere: money(0),
      }

    const dare = money(riga.debitAmount ?? 0)
    const avere = money(riga.creditAmount ?? 0)
    const iva = money(riga.vatAmount ?? 0)

    // L'IVA segue il verso del movimento che la porta. Un movimento con
    // entrambe le colonne valorizzate non esiste in prima nota; se comparisse,
    // l'IVA finirebbe con il dare, e il controllo C1 lo farebbe notare.
    perContoEMese.set(chiave, {
      ...corrente,
      dare: corrente.dare.plus(dare),
      avere: corrente.avere.plus(avere),
      ivaDare: dare.isZero() ? corrente.ivaDare : corrente.ivaDare.plus(iva),
      ivaAvere: dare.isZero() ? corrente.ivaAvere.plus(iva) : corrente.ivaAvere,
    })
  }

  return [...perContoEMese.values()]
}
```

- [ ] **Step 5: Eseguire i test**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/movimenti.test.ts`
Expected: PASS, cinque test.

Run: `nvm use 22 && npx tsc --noEmit`
Expected: nessun errore. Se `toDateOnlyUtc` non è esportato da `src/lib/timezone`, verificare il percorso corretto con `grep -rn "export function toDateOnlyUtc" src/lib/`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cashflow/movimenti.ts src/lib/cashflow/__tests__/movimenti.test.ts src/lib/saldi.ts
git commit -m "feat(cash-flow): movimenti aggregati con IVA distinta per verso"
```

---

## Task 4: L'aggregatore del prospetto

Costruisce le righe: voci, sottogruppi, famiglie, i sei totali e le tre righe memo. Riceve i movimenti già aggregati, quindi si testa senza database.

**Files:**
- Create: `src/lib/cashflow/prospetto.ts`
- Create: `src/lib/cashflow/__tests__/prospetto.test.ts`

**Interfaces:**
- Consumes: `RICLASSIFICAZIONE_CASH_FLOW`, `RIGHE_MEMO` (Task 2); `MovimentoAggregato`, `nettoDiIva`, `movimentiCashFlow` (Task 3); `PIANO_CONTI_WEISS_V4` (Task 1); `MonthlyValues`, `MONTH_KEYS`, `MONTH_NUMBER_TO_KEY` da `@/types/budget`; `liquiditaAlGiorno` da `@/lib/saldi`.
- Produces:
  - `type LivelloRiga = 'famiglia' | 'sottogruppo' | 'voce' | 'totale' | 'memo'`
  - `interface RigaProspetto { codice: string; nome: string; livello: LivelloRiga; padre?: string; valori: MonthlyValues & { annual: number } }` — `padre` è il codice della riga di livello superiore, e serve alla UI per l'albero: assente su famiglie, totali e memo.
  - `interface Prospetto { anno: number; righe: RigaProspetto[]; cassaIniziale: number; cassaFinale: number }`
  - `function costruisciProspetto(movimenti: MovimentoAggregato[], codicePerConto: Map<string, string>, cassaIniziale: Money, anno: number): Prospetto`
  - `async function prospettoCashFlow(venueId: string, anno: number): Promise<Prospetto>`

- [ ] **Step 1: Scrivere il test**

Creare `src/lib/cashflow/__tests__/prospetto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import type { MovimentoAggregato } from '../movimenti'
import { costruisciProspetto, type Prospetto } from '../prospetto'

/** Conti finti: id = codice della voce, così la mappa è l'identità. */
const codicePerConto = new Map<string, string>([
  ['10.01', '10.01'],
  ['20.1.01', '20.1.01'],
  ['20.4.01', '20.4.01'],
  ['28.1.01', '28.1.01'],
  ['26.03', '26.03'],
  ['32.3.01', '32.3.01'],
  ['40.2.01', '40.2.01'],
  ['40.3.03', '40.3.03'],
  ['40.4.01', '40.4.01'],
  ['31.01', '31.01'],
])

function mov(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'x',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

function riga(p: Prospetto, codice: string) {
  const trovata = p.righe.find((r) => r.codice === codice)
  if (!trovata) throw new Error(`riga ${codice} assente dal prospetto`)
  return trovata
}

describe('costruisciProspetto', () => {
  it('porta un incasso al netto sulla voce, sul sottogruppo e sulla famiglia', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '10.01', dare: money(1220), ivaDare: money(220) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '10.01').valori.jan).toBe(1000)
    expect(riga(p, 'A1').valori.jan).toBe(1000)
    expect(riga(p, 'A').valori.jan).toBe(1000)
    expect(riga(p, 'A').valori.annual).toBe(1000)
  })

  it("l'IVA incassata finisce in G1, quella pagata in G2 col segno giusto", () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1220), ivaDare: money(220) }),
        mov({ accountId: '20.1.01', avere: money(610), ivaAvere: money(110) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'G1').valori.jan).toBe(220)
    expect(riga(p, 'G2').valori.jan).toBe(-110)
    expect(riga(p, 'G').valori.jan).toBe(110)
  })

  it('le uscite sono negative e il margine di contribuzione le sottrae', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1000) }),
        mov({ accountId: '20.4.01', avere: money(300) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '20.4.01').valori.jan).toBe(-300)
    expect(riga(p, 'B').valori.jan).toBe(-300)
    expect(riga(p, 'MDC').valori.jan).toBe(700)
  })

  it('la variazione di cassa somma tutte le famiglie e la cassa finale ci si appoggia', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1000) }),
        mov({ accountId: '28.1.01', avere: money(400) }),
        mov({ accountId: '40.2.01', avere: money(200) }),
      ],
      codicePerConto,
      money(5000),
      2026
    )

    expect(riga(p, 'CFO').valori.jan).toBe(600)
    expect(riga(p, 'VAR').valori.jan).toBe(400)
    expect(p.cassaIniziale).toBe(5000)
    expect(p.cassaFinale).toBe(5400)
  })

  it('la riga memo della manodopera somma personale, manodopera evento e F24', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '28.1.01', avere: money(1000) }),
        mov({ accountId: '26.03', avere: money(300) }),
        mov({ accountId: '40.3.03', avere: money(500) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'M1').valori.jan).toBe(-1800)
  })

  it('le righe memo non entrano in nessun totale', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '40.4.01', dare: money(900) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'M3').valori.jan).toBe(900)
    expect(riga(p, 'VAR').valori.jan).toBe(0)
  })

  it('una voce fuori cassa non compare e non sposta nulla', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '31.01', avere: money(700) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(p.righe.find((r) => r.codice === '31.01')).toBeUndefined()
    expect(riga(p, 'VAR').valori.jan).toBe(0)
  })

  it('tiene i mesi separati e somma il totale annuo', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', mese: 1, dare: money(100) }),
        mov({ accountId: '10.01', mese: 7, dare: money(250) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '10.01').valori.jan).toBe(100)
    expect(riga(p, '10.01').valori.jul).toBe(250)
    expect(riga(p, '10.01').valori.annual).toBe(350)
  })

  it('espone tutte le righe della struttura, anche quelle senza movimenti', () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    // 9 famiglie + 39 sottogruppi + 149 voci + 3 totali + 3 memo.
    // Cassa iniziale e finale non sono righe: sono campi del prospetto.
    expect(p.righe).toHaveLength(203)
    expect(riga(p, 'E8').valori.annual).toBe(0)
  })

  it('le righe di voce portano il nome del piano dei conti, non il codice', () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    expect(riga(p, '20.1.01').nome).toBe('Birra fusto')
    expect(riga(p, '10.01').nome).toBe('Corrispettivi')
  })

  it("l'albero è navigabile: ogni voce dichiara il sottogruppo, ogni sottogruppo la famiglia", () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    expect(riga(p, '20.1.01').padre).toBe('B1')
    expect(riga(p, 'B1').padre).toBe('B')
    expect(riga(p, 'B').padre).toBeUndefined()
    expect(riga(p, 'MDC').padre).toBeUndefined()
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/prospetto.test.ts`
Expected: FAIL — `Cannot find module '../prospetto'`.

- [ ] **Step 3: Scrivere l'aggregatore**

Creare `src/lib/cashflow/prospetto.ts`:

```typescript
/**
 * Il prospetto di cash flow: righe, totali, memo.
 *
 * `costruisciProspetto` è puro — riceve movimenti già aggregati e restituisce
 * righe — così si testa senza database. `prospettoCashFlow` è l'involucro che
 * va a prendere i dati.
 *
 * Convenzione di segno: entrate positive, uscite negative, senza eccezioni per
 * natura del conto. I totali sono somme semplici, e la variazione di cassa è
 * la somma di tutte le famiglie. Le rettifiche funzionano da sole: un reso su
 * vendite è registrato in avere e riduce gli incassi; un reso su acquisti è in
 * dare e riduce il costo.
 */
import { prisma } from '@/lib/prisma'
import { money, toApi, type Money } from '@/lib/money'
import { liquiditaAlGiorno } from '@/lib/saldi'
import {
  type MonthKey,
  type MonthlyValues,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
} from '@/types/budget'
import { PIANO_CONTI_WEISS_V4 } from '@/lib/accounts/piano-conti-weiss-v4'
import { RICLASSIFICAZIONE_CASH_FLOW, RIGHE_MEMO } from './riclassificazione'
import { movimentiCashFlow, nettoDiIva, type MovimentoAggregato } from './movimenti'

const NOME_VOCE = new Map(PIANO_CONTI_WEISS_V4.map((voce) => [voce.code, voce.nome]))

export type LivelloRiga = 'famiglia' | 'sottogruppo' | 'voce' | 'totale' | 'memo'

export interface RigaProspetto {
  codice: string
  nome: string
  livello: LivelloRiga
  /** Codice della riga di livello superiore: serve alla UI per l'albero. */
  padre?: string
  valori: MonthlyValues & { annual: number }
}

export interface Prospetto {
  anno: number
  righe: RigaProspetto[]
  cassaIniziale: number
  cassaFinale: number
}

type ValoriMensili = Record<MonthKey, Money>

function mesiVuoti(): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = money(0)
    return acc
  }, {} as ValoriMensili)
}

function somma(a: ValoriMensili, b: ValoriMensili): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = a[key].plus(b[key])
    return acc
  }, {} as ValoriMensili)
}

function totaleAnnuo(valori: ValoriMensili): Money {
  return MONTH_KEYS.reduce((tot, key) => tot.plus(valori[key]), money(0))
}

function versoApi(valori: ValoriMensili): MonthlyValues & { annual: number } {
  const mensili = MONTH_KEYS.reduce((acc, key) => {
    acc[key] = toApi(valori[key])
    return acc
  }, {} as MonthlyValues)

  return { ...mensili, annual: toApi(totaleAnnuo(valori)) }
}

/** I sei totali della scaletta, ognuno somma di righe già calcolate. */
const TOTALI: { codice: string; nome: string; somma: string[] }[] = [
  { codice: 'MDC', nome: 'Margine di contribuzione', somma: ['A', 'B'] },
  { codice: 'CFO', nome: 'Cash flow operativo', somma: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { codice: 'VAR', nome: 'Variazione di cassa', somma: ['CFO', 'G', 'H', 'I'] },
]

export function costruisciProspetto(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>,
  cassaIniziale: Money,
  anno: number
): Prospetto {
  // Primo giro: netto per voce, IVA per verso. Un movimento senza conto, o su
  // un conto che la riclassificazione non conosce, non entra nel prospetto: se
  // ne esistono, li segnala il controllo C4.
  const perVoce = new Map<string, ValoriMensili>()
  const ivaEntrate = mesiVuoti()
  const ivaUscite = mesiVuoti()

  for (const movimento of movimenti) {
    const mese = MONTH_NUMBER_TO_KEY[movimento.mese]

    ivaEntrate[mese] = ivaEntrate[mese].plus(movimento.ivaDare)
    ivaUscite[mese] = ivaUscite[mese].minus(movimento.ivaAvere)

    if (!movimento.accountId) continue
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice) continue

    const valori = perVoce.get(codice) ?? mesiVuoti()
    valori[mese] = valori[mese].plus(nettoDiIva(movimento))
    perVoce.set(codice, valori)
  }

  const righe: RigaProspetto[] = []
  const perCodice = new Map<string, ValoriMensili>()

  const aggiungi = (
    codice: string,
    nome: string,
    livello: LivelloRiga,
    valori: ValoriMensili,
    padre?: string
  ) => {
    perCodice.set(codice, valori)
    righe.push({ codice, nome, livello, padre, valori: versoApi(valori) })
  }

  for (const famiglia of RICLASSIFICAZIONE_CASH_FLOW) {
    const righeFamiglia: { codice: string; nome: string; valori: ValoriMensili }[] = []
    const righeVoce: { codice: string; nome: string; padre: string; valori: ValoriMensili }[] = []
    let totaleFamiglia = mesiVuoti()

    for (const sottogruppo of famiglia.sottogruppi) {
      let totaleSottogruppo = mesiVuoti()

      if (sottogruppo.calcolato === 'IVA_ENTRATE') {
        totaleSottogruppo = ivaEntrate
      } else if (sottogruppo.calcolato === 'IVA_USCITE') {
        totaleSottogruppo = ivaUscite
      } else {
        for (const voce of sottogruppo.voci) {
          const valori = perVoce.get(voce) ?? mesiVuoti()
          totaleSottogruppo = somma(totaleSottogruppo, valori)
          righeVoce.push({
            codice: voce,
            nome: NOME_VOCE.get(voce) ?? voce,
            padre: sottogruppo.codice,
            valori,
          })
        }
      }

      righeFamiglia.push({
        codice: sottogruppo.codice,
        nome: sottogruppo.nome,
        valori: totaleSottogruppo,
      })
      totaleFamiglia = somma(totaleFamiglia, totaleSottogruppo)
    }

    aggiungi(famiglia.codice, famiglia.nome, 'famiglia', totaleFamiglia)

    for (const sottogruppo of righeFamiglia) {
      aggiungi(
        sottogruppo.codice,
        sottogruppo.nome,
        'sottogruppo',
        sottogruppo.valori,
        famiglia.codice
      )

      for (const voce of righeVoce.filter((v) => v.padre === sottogruppo.codice)) {
        aggiungi(voce.codice, voce.nome, 'voce', voce.valori, sottogruppo.codice)
      }
    }

    // I totali si inseriscono appena le loro componenti esistono, così la
    // scaletta esce già nell'ordine in cui va letta.
    for (const totale of TOTALI) {
      if (totale.somma.every((c) => perCodice.has(c)) && !perCodice.has(totale.codice)) {
        const valori = totale.somma.reduce(
          (acc, c) => somma(acc, perCodice.get(c)!),
          mesiVuoti()
        )
        aggiungi(totale.codice, totale.nome, 'totale', valori)
      }
    }
  }

  const variazione = perCodice.get('VAR') ?? mesiVuoti()

  // Cassa iniziale e finale sono righe annuali, non mensili: la UI le mostra
  // in testa e in coda alla colonna del totale.
  const cassaFinale = cassaIniziale.plus(totaleAnnuo(variazione))

  for (const memo of RIGHE_MEMO) {
    let valori = mesiVuoti()

    if (memo.somma) {
      valori = memo.somma.reduce((acc, c) => somma(acc, perCodice.get(c) ?? mesiVuoti()), valori)
    }
    for (const voce of memo.voci ?? []) {
      valori = somma(valori, perVoce.get(voce) ?? mesiVuoti())
    }

    righe.push({
      codice: memo.codice,
      nome: memo.nome,
      livello: 'memo',
      valori: versoApi(valori),
    })
  }

  return {
    anno,
    righe,
    cassaIniziale: toApi(cassaIniziale),
    cassaFinale: toApi(cassaFinale),
  }
}

/** Mappa id del conto → codice della voce, per i soli conti attivi. */
async function codiciDeiConti(): Promise<Map<string, string>> {
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  })

  return new Map(conti.map((conto) => [conto.id, conto.code]))
}

export async function prospettoCashFlow(venueId: string, anno: number): Promise<Prospetto> {
  const [movimenti, codicePerConto, liquidita] = await Promise.all([
    movimentiCashFlow(venueId, anno),
    codiciDeiConti(),
    // La cassa a inizio anno è la liquidità all'ultimo giorno di quello prima.
    liquiditaAlGiorno(venueId, `${anno - 1}-12-31`),
  ])

  return costruisciProspetto(movimenti, codicePerConto, money(liquidita), anno)
}
```

- [ ] **Step 4: Eseguire i test**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/prospetto.test.ts`
Expected: PASS, undici test.

Se fallisce il conteggio delle righe, stampare `p.righe.map((r) => r.codice)` e contare per livello: la struttura deve produrre 9 famiglie, 39 sottogruppi, 149 voci, 3 totali (`MDC`, `CFO`, `VAR`) e 3 memo. Cassa iniziale e finale non sono righe: sono campi del prospetto.

- [ ] **Step 5: Verifica dell'intero modulo**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/ && npx tsc --noEmit`
Expected: PASS su tutti i file di `src/lib/cashflow/`, typecheck pulito.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cashflow/prospetto.ts src/lib/cashflow/__tests__/prospetto.test.ts
git commit -m "feat(cash-flow): aggregatore del prospetto a tre livelli"
```

---

## Task 5: I quattro controlli di quadratura

Senza questi il prospetto è un numero di cui fidarsi sulla parola. Tre su quattro segnalano problemi già presenti nei dati di partenza.

**Files:**
- Create: `src/lib/cashflow/controlli.ts`
- Create: `src/lib/cashflow/__tests__/controlli.test.ts`

**Interfaces:**
- Consumes: `MovimentoAggregato`, `lordo` (Task 3); `vociRiconosciute` (Task 2); `Prospetto` (Task 4).
- Produces:
  - `interface EsitoControllo { codice: 'C1'|'C2'|'C3'|'C4'; nome: string; esito: 'ok'|'attenzione'; valore: number; spiegazione: string }`
  - `function eseguiControlli(input: InputControlli): EsitoControllo[]`
  - `interface InputControlli { prospetto: Prospetto; movimenti: MovimentoAggregato[]; codicePerConto: Map<string, string>; variazioneReale: Money }`

- [ ] **Step 1: Scrivere il test**

Creare `src/lib/cashflow/__tests__/controlli.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import type { MovimentoAggregato } from '../movimenti'
import { costruisciProspetto } from '../prospetto'
import { eseguiControlli } from '../controlli'

const codicePerConto = new Map<string, string>([
  ['c-corrispettivi', '10.01'],
  ['c-versamento', '40.4.01'],
  ['c-ignoto', '999.99'],
])

function mov(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'c-corrispettivi',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

function controlli(movimenti: MovimentoAggregato[], variazioneReale = money(0)) {
  const prospetto = costruisciProspetto(movimenti, codicePerConto, money(0), 2026)
  return eseguiControlli({ prospetto, movimenti, codicePerConto, variazioneReale })
}

function esito(risultati: ReturnType<typeof controlli>, codice: string) {
  return risultati.find((r) => r.codice === codice)!
}

describe('C1 — quadratura col saldo reale', () => {
  it('ok quando il prospetto spiega tutta la variazione dei saldi', () => {
    const movimenti = [mov({ dare: money(1220), ivaDare: money(220) })]
    expect(esito(controlli(movimenti, money(1220)), 'C1').esito).toBe('ok')
  })

  it('segnala la differenza quando qualcosa non è mappato', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', dare: money(500) })]
    const c1 = esito(controlli(movimenti, money(500)), 'C1')

    expect(c1.esito).toBe('attenzione')
    expect(c1.valore).toBe(500)
  })
})

describe('C2 — versamenti contanti a due gambe', () => {
  it('ok quando le due gambe si elidono', () => {
    const movimenti = [
      mov({ accountId: 'c-versamento', dare: money(900) }),
      mov({ accountId: 'c-versamento', avere: money(900) }),
    ]
    expect(esito(controlli(movimenti), 'C2').esito).toBe('ok')
  })

  it('segnala la gamba mancante', () => {
    const movimenti = [mov({ accountId: 'c-versamento', dare: money(900) })]
    const c2 = esito(controlli(movimenti), 'C2')

    expect(c2.esito).toBe('attenzione')
    expect(c2.valore).toBe(900)
  })
})

describe('C3 — movimenti senza voce di conto', () => {
  it('conta i movimenti con accountId nullo', () => {
    const movimenti = [mov({ accountId: null, dare: money(100) })]
    const c3 = esito(controlli(movimenti), 'C3')

    expect(c3.esito).toBe('attenzione')
    expect(c3.valore).toBe(1)
  })
})

describe('C4 — conti non riconosciuti', () => {
  it('conta i conti movimentati che la riclassificazione non conosce', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', avere: money(50) })]
    const c4 = esito(controlli(movimenti), 'C4')

    expect(c4.esito).toBe('attenzione')
    expect(c4.valore).toBe(1)
    expect(c4.spiegazione).toContain('999.99')
  })

  it('non segnala le voci fuori cassa: sono escluse di proposito', () => {
    const conMappaAmpia = new Map(codicePerConto).set('c-ammortamento', '31.01')
    const prospetto = costruisciProspetto(
      [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      conMappaAmpia,
      money(0),
      2026
    )
    const risultati = eseguiControlli({
      prospetto,
      movimenti: [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      codicePerConto: conMappaAmpia,
      variazioneReale: money(0),
    })

    expect(risultati.find((r) => r.codice === 'C4')!.esito).toBe('ok')
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/controlli.test.ts`
Expected: FAIL — `Cannot find module '../controlli'`.

- [ ] **Step 3: Scrivere i controlli**

Creare `src/lib/cashflow/controlli.ts`:

```typescript
/**
 * I quattro controlli di quadratura del prospetto.
 *
 * Non sono facoltativi: un prospetto senza di loro è un numero di cui fidarsi
 * sulla parola. Tre su quattro intercettano una classe di errore già presente
 * nel file di contabilità da cui questo modulo nasce.
 */
import { money, toApi, type Money } from '@/lib/money'
import { lordo, type MovimentoAggregato } from './movimenti'
import { vociRiconosciute, VOCI_FUORI_CASSA } from './riclassificazione'
import type { Prospetto } from './prospetto'

export interface EsitoControllo {
  codice: 'C1' | 'C2' | 'C3' | 'C4'
  nome: string
  esito: 'ok' | 'attenzione'
  /** Lo scarto in euro, o il numero di movimenti, a seconda del controllo. */
  valore: number
  spiegazione: string
}

export interface InputControlli {
  prospetto: Prospetto
  movimenti: MovimentoAggregato[]
  codicePerConto: Map<string, string>
  /** Variazione dei saldi di cassa e banca nel periodo, dal loro estratto. */
  variazioneReale: Money
}

/** Sotto il centesimo è arrotondamento, non un errore. */
const TOLLERANZA = 0.005

export function eseguiControlli({
  prospetto,
  movimenti,
  codicePerConto,
  variazioneReale,
}: InputControlli): EsitoControllo[] {
  return [
    quadraturaColSaldo(prospetto, variazioneReale),
    versamentiADueGambe(movimenti, codicePerConto),
    movimentiSenzaConto(movimenti),
    contiNonRiconosciuti(movimenti, codicePerConto),
  ]
}

/**
 * C1 — la somma del prospetto deve spiegare tutta la variazione dei saldi.
 * Se non lo fa, c'è denaro che si è mosso senza comparire da nessuna parte:
 * una voce non mappata, o un movimento su un conto che il prospetto ignora.
 */
function quadraturaColSaldo(prospetto: Prospetto, variazioneReale: Money): EsitoControllo {
  const variazione = prospetto.righe.find((r) => r.codice === 'VAR')
  const dalProspetto = money(variazione?.valori.annual ?? 0)
  const scarto = variazioneReale.minus(dalProspetto)
  const fuoriTolleranza = scarto.abs().greaterThan(TOLLERANZA)

  return {
    codice: 'C1',
    nome: 'Quadratura col saldo reale',
    esito: fuoriTolleranza ? 'attenzione' : 'ok',
    valore: toApi(scarto),
    spiegazione: fuoriTolleranza
      ? `Il prospetto spiega ${toApi(dalProspetto)} € dei ${toApi(variazioneReale)} € ` +
        'di variazione reale: la differenza è denaro che si è mosso senza comparire.'
      : 'Il prospetto spiega tutta la variazione dei saldi.',
  }
}

/**
 * C2 — un versamento di contanti in banca è la stessa somma che esce dalla
 * cassa: le due gambe devono elidersi. Quando non lo fanno, una delle due non
 * è stata registrata.
 */
function versamentiADueGambe(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>
): EsitoControllo {
  const CODICI_TESORERIA = ['40.4.01', '40.4.02']

  const saldo = movimenti.reduce((acc, movimento) => {
    if (!movimento.accountId) return acc
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice || !CODICI_TESORERIA.includes(codice)) return acc
    return acc.plus(lordo(movimento))
  }, money(0))

  const fuoriTolleranza = saldo.abs().greaterThan(TOLLERANZA)

  return {
    codice: 'C2',
    nome: 'Versamenti e giroconti a due gambe',
    esito: fuoriTolleranza ? 'attenzione' : 'ok',
    valore: toApi(saldo),
    spiegazione: fuoriTolleranza
      ? `Versamenti e giroconti non si elidono per ${toApi(saldo)} €: ` +
        'una gamba è stata registrata e l\'altra no.'
      : 'Versamenti e giroconti si elidono.',
  }
}

/** C3 — un movimento senza conto non appartiene a nessuna riga: sparisce. */
function movimentiSenzaConto(movimenti: MovimentoAggregato[]): EsitoControllo {
  const quanti = movimenti.filter((m) => !m.accountId).length

  return {
    codice: 'C3',
    nome: 'Movimenti senza voce di conto',
    esito: quanti > 0 ? 'attenzione' : 'ok',
    valore: quanti,
    spiegazione:
      quanti > 0
        ? `${quanti} gruppi di movimenti non hanno un conto: non compaiono in nessuna riga.`
        : 'Ogni movimento ha una voce di conto.',
  }
}

/**
 * C4 — un conto movimentato che la riclassificazione non conosce.
 *
 * È il controllo che rimpiazza la colonna `isCashFlow` scartata in fase di
 * piano: se qualcuno crea un conto nuovo e non lo mappa, qui si vede, invece
 * di sparire in silenzio dal prospetto. Le voci esplicitamente fuori cassa non
 * contano: sono escluse di proposito.
 */
function contiNonRiconosciuti(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>
): EsitoControllo {
  const riconosciute = vociRiconosciute()
  const ignoti = new Set<string>()

  for (const movimento of movimenti) {
    if (!movimento.accountId) continue
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice) {
      ignoti.add(movimento.accountId)
      continue
    }
    if (!riconosciute.has(codice) && !VOCI_FUORI_CASSA.has(codice)) {
      ignoti.add(codice)
    }
  }

  return {
    codice: 'C4',
    nome: 'Conti non riconosciuti dalla riclassificazione',
    esito: ignoti.size > 0 ? 'attenzione' : 'ok',
    valore: ignoti.size,
    spiegazione:
      ignoti.size > 0
        ? `Movimentati ma non mappati: ${[...ignoti].sort().join(', ')}. ` +
          'Il loro importo non compare nel prospetto.'
        : 'Ogni conto movimentato è mappato o dichiarato fuori cassa.',
  }
}
```

- [ ] **Step 4: Eseguire i test**

Run: `nvm use 22 && npx vitest run src/lib/cashflow/__tests__/controlli.test.ts`
Expected: PASS, sei test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cashflow/controlli.ts src/lib/cashflow/__tests__/controlli.test.ts
git commit -m "feat(cash-flow): quattro controlli di quadratura del prospetto"
```

---

## Task 6: Le categorie di budget nel database

Le famiglie e i sottogruppi diventano `BudgetCategory` gerarchiche, e ogni conto riceve il suo `AccountBudgetMapping`. Da qui in poi la gerarchia è modificabile dalle impostazioni senza toccare il codice.

Le categorie generiche oggi seedate (`FOOD_COST`, `BEVERAGE_COST`, `COSTI_FISSI`, `RICAVI_BAR`…) vengono **disattivate, non cancellate**: `journalEntries.budgetCategoryId` e `budgetLines` puntano lì, e `AccountBudgetMapping` ha `onDelete: Restrict`.

**Files:**
- Create: `src/lib/cashflow/seed-categorie.ts`
- Create: `src/lib/cashflow/__tests__/seed-categorie.itest.ts`
- Modify: `src/app/api/budget-categories/seed/route.ts`

**Interfaces:**
- Consumes: `RICLASSIFICAZIONE_CASH_FLOW` (Task 2).
- Produces:
  - `interface EsitoSeed { famiglieCreate: number; sottogruppiCreati: number; mappingCreati: number; contiMancanti: string[]; categorieDisattivate: number }`
  - `async function seedCategorieCashFlow(venueId: string, createdBy?: string): Promise<EsitoSeed>`
  - Codici delle categorie: `CF_A`…`CF_I` per le famiglie, `CF_A1`…`CF_I3` per i sottogruppi.

- [ ] **Step 1: Scrivere il test di integrazione**

Creare `src/lib/cashflow/__tests__/seed-categorie.itest.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { seedCategorieCashFlow } from '../seed-categorie'

let venueId: string

beforeAll(async () => {
  // getVenueId() e non venue.findFirst(): è la regola del progetto, e vale
  // anche nei test — è la stessa sede che vedrà il codice di produzione.
  venueId = await getVenueId()
})

afterAll(async () => {
  await prisma.accountBudgetMapping.deleteMany({
    where: { budgetCategory: { code: { startsWith: 'CF_' } } },
  })
  await prisma.budgetCategory.deleteMany({ where: { code: { startsWith: 'CF_' } } })
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

  it('è idempotente: rieseguirlo non duplica nulla', async () => {
    await seedCategorieCashFlow(venueId)
    const dopoPrima = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    await seedCategorieCashFlow(venueId)
    const dopoSeconda = await prisma.budgetCategory.count({
      where: { venueId, code: { startsWith: 'CF_' } },
    })

    expect(dopoSeconda).toBe(dopoPrima)
    expect(dopoSeconda).toBe(48)
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

  it('elenca i conti che il piano prevede ma il database non ha ancora', async () => {
    const esito = await seedCategorieCashFlow(venueId)

    // Finché la migrazione del piano v4 non è stata eseguita, i conti non ci
    // sono: il seed non fallisce, li elenca.
    for (const codice of esito.contiMancanti) {
      const conto = await prisma.account.findUnique({ where: { code: codice } })
      expect(conto).toBeNull()
    }
    expect(esito.mappingCreati + esito.contiMancanti.length).toBe(149)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && TEST_DB_SUFFIX=cashflow npm run test:integration -- src/lib/cashflow/__tests__/seed-categorie.itest.ts`
Expected: FAIL — `Cannot find module '../seed-categorie'`.

Se il comando lamenta l'assenza del database di test, avviarlo come indicato in `docs/` e verificare `TEST_DB_SUFFIX`.

- [ ] **Step 3: Scrivere il seed**

Creare `src/lib/cashflow/seed-categorie.ts`:

```typescript
/**
 * Popola `BudgetCategory` con le famiglie e i sottogruppi della
 * riclassificazione, e lega ogni conto al suo sottogruppo.
 *
 * Perché portarla nel database se la struttura è già in codice: le categorie
 * sono modificabili dalle impostazioni, e le viste del budget leggono da lì.
 * Il codice resta la fonte del **primo** popolamento e del ripristino.
 *
 * Idempotente per costruzione: upsert su (venueId, code).
 */
import { prisma } from '@/lib/prisma'
import { RICLASSIFICAZIONE_CASH_FLOW } from './riclassificazione'

export interface EsitoSeed {
  famiglieCreate: number
  sottogruppiCreati: number
  mappingCreati: number
  /** Voci previste dalla riclassificazione ma assenti in `accounts`. */
  contiMancanti: string[]
  categorieDisattivate: number
}

/** Prefisso dei codici, per non collidere con le categorie preesistenti. */
const PREFISSO = 'CF_'

/**
 * Le categorie del template generico installato prima di questo design. Non si
 * cancellano: `journalEntries.budgetCategoryId` e `budgetLines` puntano lì, e
 * `AccountBudgetMapping` ha `onDelete: Restrict`. Si disattivano.
 */
const CATEGORIE_GENERICHE = [
  'RICAVI_TOTALI', 'COSTI_TOTALI', 'MARGINE_OPERATIVO',
  'COSTI_PERSONALE', 'FOOD_COST', 'BEVERAGE_COST',
  'COSTI_FISSI', 'COSTI_VARIABILI', 'MARKETING',
  'RICAVI_BAR', 'RICAVI_RISTORAZIONE', 'RICAVI_EVENTI',
  'IMPOSTE_CONTRIBUTI',
]

export async function seedCategorieCashFlow(
  venueId: string,
  createdBy?: string
): Promise<EsitoSeed> {
  const esito: EsitoSeed = {
    famiglieCreate: 0,
    sottogruppiCreati: 0,
    mappingCreati: 0,
    contiMancanti: [],
    categorieDisattivate: 0,
  }

  const disattivate = await prisma.budgetCategory.updateMany({
    where: { venueId, code: { in: CATEGORIE_GENERICHE }, isActive: true },
    data: { isActive: false },
  })
  esito.categorieDisattivate = disattivate.count

  const contiPerCodice = new Map(
    (await prisma.account.findMany({ select: { id: true, code: true } })).map((c) => [
      c.code,
      c.id,
    ])
  )

  for (const [indiceFamiglia, famiglia] of RICLASSIFICAZIONE_CASH_FLOW.entries()) {
    const codiceFamiglia = `${PREFISSO}${famiglia.codice}`
    const ordineFamiglia = (indiceFamiglia + 1) * 100

    const categoriaFamiglia = await prisma.budgetCategory.upsert({
      where: { venueId_code: { venueId, code: codiceFamiglia } },
      update: {
        name: famiglia.nome,
        categoryType: famiglia.tipo,
        displayOrder: ordineFamiglia,
        isActive: true,
      },
      create: {
        venueId,
        code: codiceFamiglia,
        name: famiglia.nome,
        categoryType: famiglia.tipo,
        displayOrder: ordineFamiglia,
        isSystem: true,
        createdBy,
      },
    })
    esito.famiglieCreate += 1

    for (const [indice, sottogruppo] of famiglia.sottogruppi.entries()) {
      const codiceSottogruppo = `${PREFISSO}${sottogruppo.codice}`

      const categoriaSottogruppo = await prisma.budgetCategory.upsert({
        where: { venueId_code: { venueId, code: codiceSottogruppo } },
        update: {
          name: sottogruppo.nome,
          categoryType: famiglia.tipo,
          parentId: categoriaFamiglia.id,
          displayOrder: ordineFamiglia + indice + 1,
          isActive: true,
        },
        create: {
          venueId,
          code: codiceSottogruppo,
          name: sottogruppo.nome,
          categoryType: famiglia.tipo,
          parentId: categoriaFamiglia.id,
          displayOrder: ordineFamiglia + indice + 1,
          isSystem: true,
          createdBy,
        },
      })
      esito.sottogruppiCreati += 1

      for (const voce of sottogruppo.voci) {
        const accountId = contiPerCodice.get(voce)

        if (!accountId) {
          esito.contiMancanti.push(voce)
          continue
        }

        await prisma.accountBudgetMapping.upsert({
          where: { accountId },
          update: { budgetCategoryId: categoriaSottogruppo.id, includeInBudget: true },
          create: {
            accountId,
            budgetCategoryId: categoriaSottogruppo.id,
            includeInBudget: true,
            createdBy,
          },
        })
        esito.mappingCreati += 1
      }
    }
  }

  return esito
}
```

- [ ] **Step 4: Collegare la route di seed**

Sostituire per intero il corpo di `src/app/api/budget-categories/seed/route.ts` — la costante `SYSTEM_CATEGORIES` e la logica che la usa spariscono:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { seedCategorieCashFlow } from '@/lib/cashflow/seed-categorie'
import { logger } from '@/lib/logger'

/**
 * POST /api/budget-categories/seed — installa le categorie della
 * riclassificazione cash flow.
 *
 * Sostituisce il template generico (Food Cost, Costi Fissi, Ricavi Bar…) che
 * non era allineato né al piano dei conti v4 né al prospetto. Le vecchie
 * categorie vengono disattivate, non cancellate: ci sono movimenti che le
 * citano.
 */
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const esito = await seedCategorieCashFlow(venueId, session.user.id)

    return NextResponse.json({
      message:
        `Installate ${esito.famiglieCreate} famiglie e ${esito.sottogruppiCreati} ` +
        `sottogruppi, ${esito.mappingCreati} conti mappati.`,
      ...esito,
    })
  } catch (error) {
    logger.error('Errore POST /api/budget-categories/seed', error)
    return NextResponse.json(
      { error: "Errore nell'installazione delle categorie" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Eseguire i test di integrazione**

Run: `nvm use 22 && TEST_DB_SUFFIX=cashflow npm run test:integration -- src/lib/cashflow/__tests__/seed-categorie.itest.ts`
Expected: PASS, quattro test.

- [ ] **Step 6: Verificare che nulla si sia rotto altrove**

Run: `nvm use 22 && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: la suite completa passa. Se qualche test si aspettava le categorie generiche, aggiornarlo: quelle categorie non sono più il default.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cashflow/seed-categorie.ts \
        src/lib/cashflow/__tests__/seed-categorie.itest.ts \
        src/app/api/budget-categories/seed/route.ts
git commit -m "feat(cash-flow): seed delle 9 famiglie e 39 sottogruppi"
```

---

## Task 7: La route del prospetto

**Files:**
- Create: `src/app/api/cashflow/prospetto/route.ts`
- Create: `src/app/api/cashflow/prospetto/__tests__/prospetto.itest.ts`

**Interfaces:**
- Consumes: `prospettoCashFlow` (Task 4), `eseguiControlli` (Task 5), `movimentiCashFlow` (Task 3), `saldiAlGiorno`/`liquiditaAlGiorno` da `@/lib/saldi`.
- Produces: `GET /api/cashflow/prospetto?anno=2026` → `{ prospetto: Prospetto, controlli: EsitoControllo[] }`.

- [ ] **Step 1: Scrivere il test di integrazione**

Creare `src/app/api/cashflow/prospetto/__tests__/prospetto.itest.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

import { auth } from '@/lib/auth'
import { GET } from '../route'

function richiesta(url = 'http://localhost/api/cashflow/prospetto?anno=2026') {
  return new Request(url) as never
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/cashflow/prospetto', () => {
  it('senza sessione risponde 401', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const risposta = await GET(richiesta())
    expect(risposta.status).toBe(401)
  })

  it('con ruolo staff risponde 403', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'staff' } } as never)

    const risposta = await GET(richiesta())
    expect(risposta.status).toBe(403)
  })

  it('con ruolo manager restituisce prospetto e controlli', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'manager' } } as never)

    const risposta = await GET(richiesta())
    expect(risposta.status).toBe(200)

    const corpo = await risposta.json()
    expect(corpo.prospetto.anno).toBe(2026)
    expect(corpo.prospetto.righe.length).toBeGreaterThan(200)
    expect(corpo.controlli.map((c: { codice: string }) => c.codice)).toEqual([
      'C1', 'C2', 'C3', 'C4',
    ])
  })

  it("anno non numerico: risponde 400 invece di produrre un prospetto vuoto", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', role: 'admin' } } as never)

    const risposta = await GET(
      richiesta('http://localhost/api/cashflow/prospetto?anno=duemilaventisei')
    )
    expect(risposta.status).toBe(400)
  })
})
```

- [ ] **Step 2: Eseguire il test per vederlo fallire**

Run: `nvm use 22 && TEST_DB_SUFFIX=cashflow npm run test:integration -- src/app/api/cashflow/prospetto`
Expected: FAIL — `Cannot find module '../route'`.

- [ ] **Step 3: Scrivere la route**

Creare `src/app/api/cashflow/prospetto/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { money } from '@/lib/money'
import { liquiditaAlGiorno } from '@/lib/saldi'
import { prisma } from '@/lib/prisma'
import { prospettoCashFlow } from '@/lib/cashflow/prospetto'
import { movimentiCashFlow } from '@/lib/cashflow/movimenti'
import { eseguiControlli } from '@/lib/cashflow/controlli'
import { logger } from '@/lib/logger'

const filtri = z.object({
  anno: z.coerce.number().int().min(2000).max(2100),
})

/**
 * GET /api/cashflow/prospetto?anno=2026
 *
 * Il prospetto di cash flow a tre livelli, con i quattro controlli di
 * quadratura. La variazione reale che alimenta C1 viene dai saldi, non dal
 * prospetto: è proprio il confronto fra due fonti indipendenti a rendere il
 * controllo capace di dire qualcosa.
 */
export async function GET(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { anno } = filtri.parse({
      anno: searchParams.get('anno') ?? new Date().getFullYear(),
    })

    const venueId = await getVenueId()

    const [prospetto, movimenti, saldoIniziale, saldoFinale, conti] = await Promise.all([
      prospettoCashFlow(venueId, anno),
      movimentiCashFlow(venueId, anno),
      liquiditaAlGiorno(venueId, `${anno - 1}-12-31`),
      liquiditaAlGiorno(venueId, `${anno}-12-31`),
      prisma.account.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    ])

    const controlli = eseguiControlli({
      prospetto,
      movimenti,
      codicePerConto: new Map(conti.map((c) => [c.id, c.code])),
      variazioneReale: money(saldoFinale).minus(money(saldoIniziale)),
    })

    return NextResponse.json({ prospetto, controlli })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cashflow/prospetto', error)
    return NextResponse.json({ error: 'Errore nel calcolo del prospetto' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Eseguire i test**

Run: `nvm use 22 && TEST_DB_SUFFIX=cashflow npm run test:integration -- src/app/api/cashflow/prospetto`
Expected: PASS, quattro test.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cashflow/prospetto
git commit -m "feat(cash-flow): route del prospetto con i controlli di quadratura"
```

---

## Task 8: La pagina

Senza questa il lavoro non è raggiungibile, e una route senza consumer non si scrive.

**Files:**
- Create: `src/app/(dashboard)/cash-flow/prospetto/page.tsx`
- Create: `src/app/(dashboard)/cash-flow/prospetto/ProspettoClient.tsx`
- Create: `src/components/cashflow/ProspettoTable.tsx`
- Create: `src/components/cashflow/ControlliQuadratura.tsx`
- Modify: `src/components/layout/sidebar.tsx:76`

**Interfaces:**
- Consumes: `GET /api/cashflow/prospetto` (Task 7); i tipi `Prospetto`, `RigaProspetto` da `@/lib/cashflow/prospetto`; `EsitoControllo` da `@/lib/cashflow/controlli`.
- Produces: la rotta `/cash-flow/prospetto`.

- [ ] **Step 1: Scrivere la tabella**

Creare `src/components/cashflow/ProspettoTable.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RigaProspetto } from '@/lib/cashflow/prospetto'
import { MONTH_KEYS } from '@/types/budget'

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function euro(valore: number): string {
  if (valore === 0) return '—'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valore)
}

interface Props {
  righe: RigaProspetto[]
  cassaIniziale: number
  cassaFinale: number
}

export function ProspettoTable({ righe, cassaIniziale, cassaFinale }: Props) {
  // Chiuse di default: il prospetto si legge per famiglie, il dettaglio si apre
  // quando un numero sorprende.
  const [aperte, setAperte] = useState<Set<string>>(new Set())

  const inverti = (codice: string) => {
    setAperte((precedenti) => {
      const nuove = new Set(precedenti)
      if (nuove.has(codice)) nuove.delete(codice)
      else nuove.add(codice)
      return nuove
    })
  }

  const visibile = (riga: RigaProspetto): boolean => {
    if (!riga.padre) return true
    if (!aperte.has(riga.padre)) return false
    // Una voce si vede solo se è aperto anche il nonno.
    const padre = righe.find((r) => r.codice === riga.padre)
    return !padre?.padre || aperte.has(padre.padre)
  }

  const memo = righe.filter((r) => r.livello === 'memo')
  const prospetto = righe.filter((r) => r.livello !== 'memo')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 bg-background py-2 pr-4 text-left font-medium">
              Voce
            </th>
            {MESI.map((mese) => (
              <th key={mese} className="px-2 py-2 text-right font-medium tabular-nums">
                {mese}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">Totale</th>
          </tr>
        </thead>
        <tbody>
          {prospetto.filter(visibile).map((riga) => {
            const espandibile = riga.livello === 'famiglia' || riga.livello === 'sottogruppo'
            const aperta = aperte.has(riga.codice)

            return (
              <tr
                key={riga.codice}
                className={cn(
                  'border-b border-muted',
                  riga.livello === 'famiglia' && 'bg-muted/50 font-semibold',
                  riga.livello === 'totale' && 'bg-amber-50 font-semibold dark:bg-amber-950/30',
                  riga.livello === 'voce' && 'text-muted-foreground'
                )}
              >
                <td className="sticky left-0 bg-inherit py-1.5 pr-4">
                  <button
                    type="button"
                    onClick={() => espandibile && inverti(riga.codice)}
                    disabled={!espandibile}
                    className={cn(
                      'flex items-center gap-1 text-left',
                      riga.livello === 'sottogruppo' && 'pl-4',
                      riga.livello === 'voce' && 'pl-10',
                      !espandibile && 'cursor-default'
                    )}
                  >
                    {espandibile && (
                      <ChevronRight
                        className={cn('h-3.5 w-3.5 transition-transform', aperta && 'rotate-90')}
                      />
                    )}
                    <span>{riga.nome}</span>
                  </button>
                </td>
                {MONTH_KEYS.map((chiave) => (
                  <td
                    key={chiave}
                    className={cn(
                      'px-2 py-1.5 text-right tabular-nums',
                      riga.valori[chiave] < 0 && 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {euro(riga.valori[chiave])}
                  </td>
                ))}
                <td
                  className={cn(
                    'px-2 py-1.5 text-right font-medium tabular-nums',
                    riga.valori.annual < 0 && 'text-red-600 dark:text-red-400'
                  )}
                >
                  {euro(riga.valori.annual)}
                </td>
              </tr>
            )
          })}

          <tr className="border-b border-muted">
            <td className="sticky left-0 bg-background py-1.5 pr-4">
              Cassa e banca a inizio anno
            </td>
            <td colSpan={12} />
            <td className="px-2 py-1.5 text-right tabular-nums">{euro(cassaIniziale)}</td>
          </tr>
          <tr className="border-b-2 bg-amber-50 font-semibold dark:bg-amber-950/30">
            <td className="sticky left-0 bg-inherit py-1.5 pr-4">
              Cassa e banca a fine anno
            </td>
            <td colSpan={12} />
            <td className="px-2 py-1.5 text-right tabular-nums">{euro(cassaFinale)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8">
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Righe memo — fuori da ogni totale
        </h3>
        <table className="w-full text-sm">
          <tbody>
            {memo.map((riga) => (
              <tr key={riga.codice} className="border-b border-muted italic text-muted-foreground">
                <td className="py-1.5 pr-4">{riga.nome}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{euro(riga.valori.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Scrivere la banda dei controlli**

Creare `src/components/cashflow/ControlliQuadratura.tsx`:

```tsx
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EsitoControllo } from '@/lib/cashflow/controlli'

export function ControlliQuadratura({ controlli }: { controlli: EsitoControllo[] }) {
  const problemi = controlli.filter((c) => c.esito === 'attenzione')

  if (problemi.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Il prospetto quadra: tutti e quattro i controlli sono a posto.</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {problemi.map((controllo) => (
        <div
          key={controllo.codice}
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            'border-amber-200 bg-amber-50 text-amber-900',
            'dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">{controllo.nome}</div>
            <div className="text-xs opacity-90">{controllo.spiegazione}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Scrivere il client e la pagina**

Creare `src/app/(dashboard)/cash-flow/prospetto/ProspettoClient.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProspettoTable } from '@/components/cashflow/ProspettoTable'
import { ControlliQuadratura } from '@/components/cashflow/ControlliQuadratura'
import type { Prospetto } from '@/lib/cashflow/prospetto'
import type { EsitoControllo } from '@/lib/cashflow/controlli'

interface Risposta {
  prospetto: Prospetto
  controlli: EsitoControllo[]
}

export function ProspettoClient({ annoIniziale }: { annoIniziale: number }) {
  const [anno, setAnno] = useState(annoIniziale)
  const [dati, setDati] = useState<Risposta | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState(true)

  useEffect(() => {
    let annullato = false
    setCaricamento(true)
    setErrore(null)

    fetch(`/api/cashflow/prospetto?anno=${anno}`)
      .then(async (risposta) => {
        if (!risposta.ok) {
          const corpo = await risposta.json().catch(() => ({}))
          throw new Error(corpo.error ?? 'Errore nel caricamento del prospetto')
        }
        return risposta.json() as Promise<Risposta>
      })
      .then((corpo) => {
        if (!annullato) setDati(corpo)
      })
      .catch((e: Error) => {
        if (!annullato) setErrore(e.message)
      })
      .finally(() => {
        if (!annullato) setCaricamento(false)
      })

    return () => {
      annullato = true
    }
  }, [anno])

  const anni = Array.from({ length: 5 }, (_, i) => annoIniziale - i)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prospetto di cash flow</h1>
        <Select value={String(anno)} onValueChange={(v) => setAnno(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anni.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {errore && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {errore}
        </div>
      )}

      {dati && <ControlliQuadratura controlli={dati.controlli} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Solo movimenti che toccano cassa o banca. Entrate positive, uscite negative.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {caricamento && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {dati && (
            <ProspettoTable
              righe={dati.prospetto.righe}
              cassaIniziale={dati.prospetto.cassaIniziale}
              cassaFinale={dati.prospetto.cassaFinale}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

Creare `src/app/(dashboard)/cash-flow/prospetto/page.tsx`:

```tsx
import { ProspettoClient } from './ProspettoClient'

export const metadata = {
  title: 'Prospetto di cash flow',
}

export default function ProspettoPage() {
  return <ProspettoClient annoIniziale={new Date().getFullYear()} />
}
```

- [ ] **Step 4: Collegare la navigazione**

In `src/components/layout/sidebar.tsx`, riga 76, aggiungere la voce accanto a quella esistente:

```tsx
          { name: 'Cash Flow', href: '/cash-flow' },
          { name: 'Prospetto', href: '/cash-flow/prospetto' },
```

- [ ] **Step 5: Verificare che la pagina si apra davvero**

Run: `nvm use 22 && npm run dev`
Aprire `http://localhost:3000/cash-flow/prospetto` con un utente admin.
Expected: la scaletta con le 9 famiglie, i totali evidenziati, il chevron che apre i sottogruppi e poi le voci. Con il database di sviluppo vuoto i numeri sono a zero e la banda dei controlli segnala C1 se ci sono movimenti non mappati — è il comportamento voluto, non un errore.

- [ ] **Step 6: Verifica completa**

Run: `nvm use 22 && npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: tutto verde. `npm run build` deve compilare senza errori di tipo sui componenti nuovi.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/cash-flow/prospetto src/components/cashflow src/components/layout/sidebar.tsx
git commit -m "feat(cash-flow): pagina del prospetto con controlli di quadratura"
```

---

## Dopo il piano: cosa resta da fare a mano

Nessuno di questi passi è codice, e nessuno va eseguito senza l'approvazione del committente.

1. **La migrazione del piano v4 non è ancora stata eseguita in produzione.** Finché non lo è, i conti delle 169 voci non esistono e il prospetto è vuoto: `seedCategorieCashFlow` lo dice, elencando i `contiMancanti`. La sequenza sta in `docs/migrazione-piano-conti-v4.md`.
2. **Dopo la migrazione**, chiamare una volta `POST /api/budget-categories/seed` come admin per installare famiglie, sottogruppi e mapping.
3. **Il branch `conti/piano-v4` non è mergiato su `main`.** Questo lavoro ci si appoggia sopra.

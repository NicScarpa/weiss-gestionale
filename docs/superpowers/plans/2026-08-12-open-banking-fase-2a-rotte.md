# Open Banking — Fase 2a: i moduli e le rotte del collegamento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere raggiungibile da HTTP tutto ciò che serve a collegare la banca e configurare i conti — senza ancora disegnare una schermata.

**Architecture:** Due moduli puri (traduzione degli stati, abbinamento dei conti) che si provano in millisecondi; una fabbrica che costruisce il client GoCardless dalle variabili d'ambiente, unico punto del codice applicativo che legge i segreti; sei rotte sotto `/api/gocardless/`, tutte solo amministratore, provate su PostgreSQL vero con una banca finta. Nessuna chiamata di rete reale, mai.

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma + PostgreSQL, zod 4, vitest (unit + integration). Il client `src/lib/gocardless/client.ts` esiste dalla Fase 1 e accetta un `fetch` iniettabile.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md`
**Fase precedente:** `docs/superpowers/plans/2026-08-12-open-banking-fase-1.md` (mergiata, `a51bf58`)

---

## Global Constraints

- **Node 22 obbligatorio.** Anteporre `source ~/.nvm/nvm.sh && nvm use 22 &&` a ogni `npm`/`npx`/`node`, nella stessa riga di shell. Ogni chiamata dello strumento Bash parte da una shell nuova: va ripetuto ogni volta. Il Node di sistema è la v25 e `.npmrc` ha `engine-strict=true`.
- **Nessuna chiamata di rete vera**, in nessuna circostanza — né nei test, né in uno script di prova, né «solo per vedere». Il limite della banca è di **4 chiamate al giorno per conto e per endpoint** e una sprecata costa un giorno. Il client accetta `fetchImpl` proprio per questo.
- **I segreti non si stampano e non si registrano.** `GOCARDLESS_SECRET_ID` e `GOCARDLESS_SECRET_KEY` si leggono in un solo punto (`src/lib/gocardless/servizio.ts`) e non escono da lì.
- **Il repository è pubblico** (`github.com/NicScarpa/weiss-gestionale`). Nessun file tracciato può contenere IBAN, saldi, causali, nomi di fornitori o di persone reali. I dati dei test sono inventati.
- **Il database Supabase è condiviso con la produzione.** Mai `prisma db push` su un database vero. Le migrazioni si scrivono a mano come DDL esplicito e si applicano in locale con un `DATABASE_URL` esplicito verso `127.0.0.1:5433`; `npm run guard:not-prod` non si scavalca mai.
- **Gli indici parziali vanno scritti in due posti** — nel `migration.sql` e in `prisma/sql/constraints.sql` — perché il database dei test nasce da `prisma db push`, che le migrazioni non le esegue. (Questa fase non ne aggiunge, ma la regola vale se se ne aggiungessero.)
- **Tutte le rotte sono solo amministratore**: `withAuth(handler, { roles: ['admin'], venueScoped: true })`. `venueId` arriva dalla sessione, mai dalla query o dal corpo.
- **Nomi e commenti in italiano**, come il resto del progetto.
- **TDD**: prima il test che fallisce, si lancia, lo si vede fallire, poi l'implementazione minima. Nei rapporti va incollato **l'output reale** del rosso, non l'esito atteso ricopiato.
- Baseline su questo branch: `tsc --noEmit` exit 0; `npm run lint` 0 errori e 62 warning preesistenti; 1448 test unitari su 109 file; 412 test di integrazione su 55 file.

---

## File Structure

**Nuovi**

| File | Responsabilità |
|---|---|
| `src/lib/gocardless/stati.ts` | Gli otto stati di una requisition tradotti in italiano, con la spiegazione di cosa significano per l'utente. Oggi vivono dentro `scripts/gocardless-probe.ts`: da lì vanno spostati, non ricopiati. |
| `src/lib/gocardless/abbinamento.ts` | La funzione pura che accoppia i conti restituiti dalla banca con i `BankAccount` della sede. Niente database, niente rete, niente cifratura: riceve le due liste e la funzione d'impronta, restituisce l'esito. |
| `src/lib/gocardless/servizio.ts` | Costruisce il client dalle variabili d'ambiente. Unico punto del codice applicativo che legge i segreti. |
| `src/app/api/gocardless/istituzioni/route.ts` | `GET` — l'elenco delle banche di un paese. |
| `src/app/api/gocardless/collegamenti/route.ts` | `POST` — crea agreement e requisition, scrive la connessione, restituisce il link. `GET` — la connessione attiva della sede. |
| `src/app/api/gocardless/collegamenti/[id]/conti/route.ts` | `GET` — i conti della requisition, già abbinati. `PUT` — salva la configurazione. |
| `src/app/api/gocardless/collegamenti/[id]/route.ts` | `DELETE` — scollega. |
| `src/app/api/gocardless/callback/route.ts` | `GET` — la pagina di ritorno dalla banca. Reindirizza e basta. |
| `prisma/migrations/20260812180000_conti_ignorati/migration.sql` | La colonna `conti_ignorati`. |

**Modificati**

| File | Modifica |
|---|---|
| `prisma/schema.prisma` | `contiIgnorati String[]` su `BankConnection`. |
| `scripts/gocardless-probe.ts` | Usa `src/lib/gocardless/stati.ts` invece della propria mappa locale. |

**Fuori dal perimetro di questo piano**: ogni componente React, il banner di scadenza e la modifica a `BancheEContiClient.tsx`. Sono il piano 2b, che si scriverà quando queste rotte esisteranno e si potrà specificare l'interfaccia contro forme di risposta vere invece che ipotizzate.

---

## Task 1: I due moduli puri

Traduzione degli stati e abbinamento dei conti. Nessun database, nessuna rete: si provano in millisecondi e ogni decisione discutibile di questa fase passa di qui.

L'abbinamento riceve la funzione d'impronta come parametro invece di importare `lookupHash`. Non è pedanteria: `lookupHash` legge una chiave di cifratura dall'ambiente, e una funzione pura che dipende da una variabile d'ambiente non è più né pura né provabile senza preparativi.

**Files:**
- Create: `src/lib/gocardless/stati.ts`
- Create: `src/lib/gocardless/abbinamento.ts`
- Test: `src/lib/gocardless/__tests__/stati.test.ts`
- Test: `src/lib/gocardless/__tests__/abbinamento.test.ts`
- Modify: `scripts/gocardless-probe.ts` (usa il modulo condiviso)

**Interfaces:**
- Consumes: niente
- Produces:
  - `function descriviStato(codice: string): { sigla: string; nome: string; spiegazione: string }`
  - `function eCollegata(codice: string): boolean`
  - `function eDaRifare(codice: string): boolean`
  - `interface ContoDaBanca { providerAccountId: string; iban: string | null; intestatario: string | null; valuta: string | null }`
  - `interface ContoDelGestionale { id: string; nome: string; ibanHash: string | null; connectionId: string | null }`
  - `type EsitoAbbinamento` (unione discriminata su `tipo`: `'riconosciuto' | 'gia-collegato' | 'sconosciuto' | 'ignorato'`)
  - `function abbinaConti(p: { contiBanca: ContoDaBanca[]; contiGestionale: ContoDelGestionale[]; ignorati: string[]; impronta: (iban: string) => string }): EsitoAbbinamento[]`

- [ ] **Step 1: Scrivi i test che falliscono**

`src/lib/gocardless/__tests__/stati.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { descriviStato, eCollegata, eDaRifare } from '../stati'

describe('stati di una requisition', () => {
  it('traduce i codici che contano', () => {
    expect(descriviStato('LN').nome).toBe('Collegata')
    expect(descriviStato('RJ').nome).toBe('Rifiutata')
    expect(descriviStato('EX').nome).toBe('Scaduta')
    expect(descriviStato('CR').nome).toBe('Creata')
  })

  it('spiega cosa significa, non solo come si chiama', () => {
    expect(descriviStato('LN').spiegazione.length).toBeGreaterThan(20)
    expect(descriviStato('EX').spiegazione).toContain('consenso')
  })

  // Un codice sconosciuto non deve far esplodere una schermata: GoCardless
  // potrebbe aggiungerne uno domani senza avvisare.
  it('non esplode su un codice che non conosce', () => {
    const ignoto = descriviStato('ZZ')
    expect(ignoto.sigla).toBe('ZZ')
    expect(ignoto.nome).toBe('Stato sconosciuto')
  })

  it('riconosce la sola collegata', () => {
    expect(eCollegata('LN')).toBe(true)
    for (const c of ['CR', 'GC', 'UA', 'RJ', 'SA', 'GA', 'EX', 'ZZ']) {
      expect(eCollegata(c)).toBe(false)
    }
  })

  it('riconosce gli stati da cui si riparte solo rifacendo il consenso', () => {
    expect(eDaRifare('RJ')).toBe(true)
    expect(eDaRifare('EX')).toBe(true)
    expect(eDaRifare('LN')).toBe(false)
    expect(eDaRifare('CR')).toBe(false)
  })
})
```

`src/lib/gocardless/__tests__/abbinamento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { abbinaConti, type ContoDaBanca, type ContoDelGestionale } from '../abbinamento'

/** Impronta finta e deterministica: il test non deve dipendere da una chiave. */
const impronta = (iban: string) => `h:${iban}`

const dallaBanca = (id: string, iban: string | null): ContoDaBanca => ({
  providerAccountId: id,
  iban,
  intestatario: null,
  valuta: 'EUR',
})

const nelGestionale = (
  id: string,
  nome: string,
  iban: string | null,
  connectionId: string | null = null
): ContoDelGestionale => ({ id, nome, ibanHash: iban ? impronta(iban) : null, connectionId })

describe('abbinaConti', () => {
  it('riconosce il conto la cui impronta corrisponde', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-1', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito).toEqual([
      { tipo: 'riconosciuto', conto: dallaBanca('gc-1', 'IT00X001'), bankAccountId: 'ba-1', nomeConto: 'Conto principale' },
    ])
  })

  it('dichiara sconosciuto ciò che non corrisponde a nulla', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-2', 'IT00X999')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  // Il conto personale dell'amministratore: scartato una volta, mai più chiesto.
  it('tiene ignorato ciò che è stato ignorato, anche se avrebbe una corrispondenza', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-3', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: ['gc-3'],
      impronta,
    })
    expect(esito[0].tipo).toBe('ignorato')
  })

  it('segnala il conto già legato a un altro collegamento invece di rubarlo', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-4', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001', 'conn-vecchia')],
      ignorati: [],
      impronta,
    })
    expect(esito[0]).toMatchObject({ tipo: 'gia-collegato', bankAccountId: 'ba-1' })
  })

  it('un conto della banca senza IBAN resta sconosciuto, non abbinato a caso', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-5', null)],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  it('un conto del gestionale senza impronta non può essere abbinato', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-6', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Cassa', null)],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  it('lo stesso conto del gestionale non viene abbinato a due conti della banca', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-7', 'IT00X001'), dallaBanca('gc-8', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('riconosciuto')
    expect(esito[1].tipo).toBe('sconosciuto')
  })

  it('conserva l ordine dei conti come li manda la banca', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-a', null), dallaBanca('gc-b', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito.map((e) => e.conto.providerAccountId)).toEqual(['gc-a', 'gc-b'])
  })

  it('senza conti dalla banca restituisce una lista vuota', () => {
    expect(abbinaConti({ contiBanca: [], contiGestionale: [], ignorati: [], impronta })).toEqual([])
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/gocardless/__tests__/stati.test.ts src/lib/gocardless/__tests__/abbinamento.test.ts
```

Atteso: FAIL con `Failed to resolve import "../stati"` e `"../abbinamento"`. Incolla l'output reale nel rapporto.

- [ ] **Step 3: Scrivi `stati.ts`**

```ts
/**
 * Gli otto stati che GoCardless assegna a una requisition, in italiano.
 *
 * Vivevano dentro `scripts/gocardless-probe.ts`, che era l'unico a doverli
 * mostrare. Da qui in poi li mostra anche il pannello: stanno in un posto
 * solo, e la sonda importa questo modulo invece di tenerne una copia.
 *
 * `spiegazione` non è il nome ripetuto con altre parole: è cosa deve fare chi
 * legge. «Rifiutata» non aiuta nessuno; «la banca ha rifiutato il consenso, va
 * rifatto da capo» sì.
 */
export interface StatoRequisition {
  sigla: string
  nome: string
  spiegazione: string
}

const STATI: Record<string, Omit<StatoRequisition, 'sigla'>> = {
  CR: {
    nome: 'Creata',
    spiegazione: 'Il collegamento è stato preparato ma il link non è ancora stato aperto.',
  },
  GC: {
    nome: 'In attesa del consenso',
    spiegazione: 'Sei sulla pagina della banca e non hai ancora confermato.',
  },
  UA: {
    nome: 'Autenticazione in corso',
    spiegazione: "La banca sta verificando la tua identità: completa l'accesso per proseguire.",
  },
  RJ: {
    nome: 'Rifiutata',
    spiegazione: 'La banca ha rifiutato il consenso. Va rifatto da capo.',
  },
  SA: {
    nome: 'Scelta dei conti',
    spiegazione: 'Stai scegliendo presso la banca quali conti condividere.',
  },
  GA: {
    nome: 'Accesso in concessione',
    spiegazione: "La banca sta completando l'autorizzazione. Manca poco.",
  },
  LN: {
    nome: 'Collegata',
    spiegazione: 'Il consenso è attivo e i conti sono leggibili.',
  },
  EX: {
    nome: 'Scaduta',
    spiegazione: 'Il consenso è scaduto. Va rinnovato rifacendo l\'autenticazione in banca.',
  },
}

export function descriviStato(codice: string): StatoRequisition {
  const noto = STATI[codice]
  if (noto) return { sigla: codice, ...noto }
  // GoCardless può aggiungere uno stato senza avvisare: meglio una schermata
  // che dice «non lo conosco» di una che si rompe.
  return {
    sigla: codice,
    nome: 'Stato sconosciuto',
    spiegazione: `La banca ha risposto con uno stato che non conosciamo (${codice}).`,
  }
}

/** L'unico stato in cui i conti si possono leggere. */
export function eCollegata(codice: string): boolean {
  return codice === 'LN'
}

/** Gli stati da cui si esce solo rifacendo il consenso. */
export function eDaRifare(codice: string): boolean {
  return codice === 'RJ' || codice === 'EX'
}
```

- [ ] **Step 4: Scrivi `abbinamento.ts`**

```ts
/**
 * Accoppia i conti che la banca espone con quelli registrati nel gestionale.
 *
 * Puro di proposito: nessun accesso al database, nessuna rete, e soprattutto
 * nessuna cifratura. La funzione d'impronta arriva come parametro perché
 * `lookupHash` legge una chiave dall'ambiente, e una funzione che dipende da
 * una variabile d'ambiente non si prova senza preparativi.
 *
 * Il confronto avviene sull'impronta dell'IBAN, mai su una ricerca dell'IBAN
 * cifrato: è già così che il progetto ritrova fornitori e conti.
 */

export interface ContoDaBanca {
  providerAccountId: string
  iban: string | null
  intestatario: string | null
  valuta: string | null
}

export interface ContoDelGestionale {
  id: string
  nome: string
  ibanHash: string | null
  /** Valorizzato se il conto è già legato a un collegamento. */
  connectionId: string | null
}

export type EsitoAbbinamento =
  | { tipo: 'riconosciuto'; conto: ContoDaBanca; bankAccountId: string; nomeConto: string }
  | { tipo: 'gia-collegato'; conto: ContoDaBanca; bankAccountId: string; nomeConto: string }
  | { tipo: 'sconosciuto'; conto: ContoDaBanca }
  | { tipo: 'ignorato'; conto: ContoDaBanca }

export function abbinaConti(parametri: {
  contiBanca: ContoDaBanca[]
  contiGestionale: ContoDelGestionale[]
  ignorati: string[]
  impronta: (iban: string) => string
}): EsitoAbbinamento[] {
  const { contiBanca, contiGestionale, ignorati, impronta } = parametri
  const scartati = new Set(ignorati)

  const perImpronta = new Map<string, ContoDelGestionale>()
  for (const c of contiGestionale) {
    // Un conto senza impronta (una cassa, o un conto senza IBAN) non è
    // abbinabile: tenerlo nella mappa sotto la chiave `null` lo renderebbe
    // il bersaglio di qualunque conto senza IBAN dall'altra parte.
    if (c.ibanHash) perImpronta.set(c.ibanHash, c)
  }

  // Un conto del gestionale può corrispondere a un solo conto della banca:
  // due IBAN identici su due conti diversi sono un dato sbagliato da qualche
  // parte, e in quel caso è meglio lasciare il secondo da decidere a mano.
  const gia = new Set<string>()

  return contiBanca.map((conto): EsitoAbbinamento => {
    if (scartati.has(conto.providerAccountId)) return { tipo: 'ignorato', conto }
    if (!conto.iban) return { tipo: 'sconosciuto', conto }

    const corrispondente = perImpronta.get(impronta(conto.iban))
    if (!corrispondente || gia.has(corrispondente.id)) return { tipo: 'sconosciuto', conto }

    gia.add(corrispondente.id)
    return {
      tipo: corrispondente.connectionId ? 'gia-collegato' : 'riconosciuto',
      conto,
      bankAccountId: corrispondente.id,
      nomeConto: corrispondente.nome,
    }
  })
}
```

- [ ] **Step 5: Lancia i test e verifica che passino**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/gocardless/__tests__/stati.test.ts src/lib/gocardless/__tests__/abbinamento.test.ts
```

Atteso: 14 test PASS.

- [ ] **Step 6: Fai usare alla sonda il modulo condiviso**

In `scripts/gocardless-probe.ts`, elimina la costante locale `SIGNIFICATO_STATO` e importa il modulo nuovo. Sostituisci i tre punti che la usano — nel passo del consenso, in quello dei conti, e dove stampa lo stato — con `descriviStato(...)`, componendo il testo come `${d.nome} — ${d.spiegazione}`.

Il percorso di importazione dalla cartella `scripts/` è `../src/lib/gocardless/stati`.

- [ ] **Step 7: Verifica che la sonda compili ancora e che nulla sia regredito**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npx vitest run && npm run lint
```

Atteso: `tsc` exit 0; 1462 test unitari su 111 file (1448 + 14 nuovi, 2 file nuovi); lint 0 errori e 62 warning.

- [ ] **Step 8: Commit**

```bash
git add src/lib/gocardless/stati.ts src/lib/gocardless/abbinamento.ts src/lib/gocardless/__tests__/stati.test.ts src/lib/gocardless/__tests__/abbinamento.test.ts scripts/gocardless-probe.ts
git commit -m "feat(open-banking): stati della requisition e abbinamento dei conti, moduli puri"
```

---

## Task 2: La colonna dei conti ignorati

Un conto ignorato non ha un `BankAccount` a cui appendere l'informazione — è proprio il conto che non vogliamo in anagrafica. Serve una colonna sulla connessione.

**Files:**
- Modify: `prisma/schema.prisma` (modello `BankConnection`)
- Create: `prisma/migrations/20260812180000_conti_ignorati/migration.sql`

**Interfaces:**
- Consumes: niente
- Produces: campo Prisma `contiIgnorati String[] @default([]) @map("conti_ignorati")` su `BankConnection`

- [ ] **Step 1: Aggiungi il campo allo schema**

In `prisma/schema.prisma`, dentro `model BankConnection`, subito dopo `maxHistoricalDays`:

```prisma
  /// Identificativi GoCardless dei conti che il consenso copre ma che
  /// l'amministratore ha scelto di non importare — tipicamente un conto
  /// personale che vive nello stesso home banking dell'azienda. Stanno qui e
  /// non su `BankAccount` perché un conto ignorato non ha, e non deve avere,
  /// una riga in anagrafica: crearne una disattivata metterebbe comunque quel
  /// conto fra i conti aziendali.
  contiIgnorati     String[]  @default([]) @map("conti_ignorati")
```

- [ ] **Step 2: Verifica che lo schema sia valido**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx prisma validate && npx prisma format
```

Atteso: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Scrivi la migrazione a mano**

Crea `prisma/migrations/20260812180000_conti_ignorati/migration.sql`:

```sql
-- Fase 2 dell'integrazione open banking: i conti che il consenso copre ma che
-- non vanno importati.
-- Spec: docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md

ALTER TABLE "bank_connections"
    ADD COLUMN "conti_ignorati" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

- [ ] **Step 4: Applica la migrazione sul database locale usa-e-getta**

> Il `.env` del progetto punta a **Supabase di produzione** e `npm run guard:not-prod` lo blocca, giustamente. Non si scavalca: gli si dà un bersaglio locale. In locale gira PostgreSQL 16 su `127.0.0.1:5433` con l'utente `nicolascarpa`, lo stesso server che usano i test di integrazione.

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node -e "
const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:5433,user:'nicolascarpa',database:'postgres'});
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS weiss_ob_fase2 WITH (FORCE)');
  await c.query('CREATE DATABASE weiss_ob_fase2');
  console.log('creato weiss_ob_fase2');
  await c.end();
})()"
```

```bash
source ~/.nvm/nvm.sh && nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase2" npx prisma migrate deploy
```

Atteso: l'elenco delle migrazioni si chiude con `20260812180000_conti_ignorati`, senza errori. Poi rigenera il client:

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx prisma generate
```

- [ ] **Step 5: Verifica la colonna leggendola dal database**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase2" node -e "
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\"SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name='bank_connections' AND column_name='conti_ignorati'\")
 .then(r=>{console.log(r.rows[0] ?? 'COLONNA ASSENTE');return p.end()});
"
```

Atteso: tipo `ARRAY`, `is_nullable: NO`, un default non nullo. Se stampa `COLONNA ASSENTE`, la migrazione non è stata applicata.

- [ ] **Step 6: Verifica che nulla sia regredito**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260812180000_conti_ignorati/
git commit -m "feat(open-banking): la connessione ricorda i conti da non importare"
```

---

## Task 3: Il servizio e la rotta delle istituzioni

Il punto unico che legge i segreti, e la rotta più semplice, che serve a provare l'impianto: autorizzazione, client finto nei test, forma della risposta.

**Files:**
- Create: `src/lib/gocardless/servizio.ts`
- Create: `src/app/api/gocardless/istituzioni/route.ts`
- Test: `src/app/api/gocardless/istituzioni/__tests__/istituzioni.itest.ts`

**Interfaces:**
- Consumes: `creaClient`, `ClientGoCardless` da `src/lib/gocardless/client` (Fase 1)
- Produces:
  - `function clientDaAmbiente(): ClientGoCardless`
  - `function impostaClientPerTest(finto: ClientGoCardless | null): void`
  - `GET /api/gocardless/istituzioni?paese=it` → `200 { istituzioni: Array<{ id, nome, bic, giorniStorico, giorniAccesso }> }`

- [ ] **Step 1: Scrivi il test che fallisce**

`src/app/api/gocardless/istituzioni/__tests__/istituzioni.itest.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { GET as elencoIstituzioni } from '../route'

setupIntegrationDb()

/** Un client finto: nessuna rete, risposte decise dal test. */
function clientFinto(istituzioni: unknown[]): ClientGoCardless {
  return {
    istituzioni: async () => ({ dati: istituzioni, limiti: { restanti: null, ripresaFraSecondi: null } }),
    dettagliConto: async () => { throw new Error('non previsto in questo test') },
    saldiConto: async () => { throw new Error('non previsto in questo test') },
    movimentiConto: async () => { throw new Error('non previsto in questo test') },
  } as unknown as ClientGoCardless
}

afterEach(() => impostaClientPerTest(null))

describe('GET /api/gocardless/istituzioni', () => {
  it('restituisce le banche con i due numeri che contano', async () => {
    await entraCome('admin')
    impostaClientPerTest(
      clientFinto([
        { id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', bic: 'XXXXITRR', transaction_total_days: '90', max_access_valid_for_days: '180' },
      ])
    )

    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))

    expect(esito.status).toBe(200)
    expect(esito.body).toEqual({
      istituzioni: [
        { id: 'BANCA_FINTA_XXXX', nome: 'Banca Finta', bic: 'XXXXITRR', giorniStorico: 90, giorniAccesso: 180 },
      ],
    })
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('staff')
    impostaClientPerTest(clientFinto([]))

    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))

    expect(esito.status).toBe(403)
  })

  it('respinge chi non ha fatto accesso', async () => {
    logout()
    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))
    expect(esito.status).toBe(401)
  })

  // I giorni arrivano dall'API come stringa o come numero a seconda del campo:
  // chi legge la risposta non deve doversene accorgere.
  it('normalizza i giorni a numero anche quando la banca li manda come stringa', async () => {
    await entraCome('admin')
    impostaClientPerTest(
      clientFinto([{ id: 'X', name: 'X', transaction_total_days: 365, max_access_valid_for_days: '90' }])
    )

    const esito = await callRoute<{ istituzioni: Array<{ giorniStorico: number; giorniAccesso: number }> }>(
      elencoIstituzioni,
      jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it')
    )

    expect(esito.body.istituzioni[0]).toMatchObject({ giorniStorico: 365, giorniAccesso: 90 })
  })

  it('senza paese usa l Italia', async () => {
    await entraCome('admin')
    let paeseChiesto: string | undefined
    const finto = {
      istituzioni: async (paese: string) => {
        paeseChiesto = paese
        return { dati: [], limiti: { restanti: null, ripresaFraSecondi: null } }
      },
    } as unknown as ClientGoCardless
    impostaClientPerTest(finto)

    await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni'))

    expect(paeseChiesto).toBe('it')
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- src/app/api/gocardless/istituzioni/__tests__/istituzioni.itest.ts
```

Atteso: FAIL con `Failed to resolve import "@/lib/gocardless/servizio"`.

- [ ] **Step 3: Scrivi `servizio.ts`**

```ts
/**
 * Costruisce il client GoCardless per il codice applicativo.
 *
 * È l'unico punto fuori dagli script che legge `GOCARDLESS_SECRET_ID` e
 * `GOCARDLESS_SECRET_KEY`: tenerne uno solo significa che per sapere dove
 * finiscono i segreti basta leggere questo file.
 *
 * `impostaClientPerTest` esiste perché i test non devono toccare la rete: il
 * limite della banca è di 4 chiamate al giorno per conto e per endpoint, e una
 * chiamata sprecata costa un giorno.
 */
import { creaClient, type ClientGoCardless } from './client'

let perTest: ClientGoCardless | null = null

/** Sostituisce il client con uno finto. `null` ripristina quello vero. */
export function impostaClientPerTest(finto: ClientGoCardless | null): void {
  perTest = finto
}

export function clientDaAmbiente(): ClientGoCardless {
  if (perTest) return perTest

  const secretId = process.env.GOCARDLESS_SECRET_ID
  const secretKey = process.env.GOCARDLESS_SECRET_KEY
  if (!secretId || !secretKey) {
    throw new Error(
      'GOCARDLESS_SECRET_ID e GOCARDLESS_SECRET_KEY non sono impostate: il collegamento alla banca non è configurato.'
    )
  }

  return creaClient({ secretId, secretKey })
}
```

- [ ] **Step 4: Scrivi la rotta**

`src/app/api/gocardless/istituzioni/route.ts`:

```ts
/**
 * L'elenco delle banche di un paese, per la ricerca nel wizard.
 *
 * Si restituiscono solo i cinque campi che servono a scegliere: l'API ne manda
 * molti di più (loghi, elenchi di paesi, identificativi interni) e passarli al
 * client sarebbe rumore che qualcuno prima o poi userebbe.
 */
import { NextResponse } from 'next/server'

import { withAuth } from '@/lib/api-utils'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'

/** I giorni arrivano come stringa o come numero a seconda del campo. */
function giorni(valore: unknown): number | null {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : null
}

export const GET = withAuth(
  async (request) => {
    const paese = new URL(request.url).searchParams.get('paese') ?? 'it'
    const esito = await clientDaAmbiente().istituzioni(paese)

    return NextResponse.json({
      istituzioni: esito.dati.map((i) => ({
        id: i.id,
        nome: i.name,
        bic: i.bic ?? null,
        giorniStorico: giorni(i.transaction_total_days),
        giorniAccesso: giorni(i.max_access_valid_for_days),
      })),
    })
  },
  { roles: ['admin'], venueScoped: true }
)
```

- [ ] **Step 5: Lancia il test e verifica che passi**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- src/app/api/gocardless/istituzioni/__tests__/istituzioni.itest.ts
```

Atteso: 5 test PASS. Se il test del 403 fallisce restituendo 200, la rotta non sta dichiarando `roles: ['admin']`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gocardless/servizio.ts src/app/api/gocardless/istituzioni/
git commit -m "feat(open-banking): il client dall'ambiente e la rotta delle istituzioni"
```

---

## Task 4: Creare il collegamento

La rotta che manda in banca. Scrive la riga **prima** di restituire il link, perché `POST /requisitions/` crea una risorsa vera dall'altra parte e una scheda chiusa a metà lascerebbe un consenso che il gestionale non sa di avere.

**Files:**
- Create: `src/app/api/gocardless/collegamenti/route.ts`
- Test: `src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts`

**Interfaces:**
- Consumes: `clientDaAmbiente`, `impostaClientPerTest` (Task 3); `descriviStato` (Task 1)
- Produces:
  - `POST /api/gocardless/collegamenti` con corpo `{ istitutoId: string }` → `201 { connessioneId: string, link: string }`
  - `GET /api/gocardless/collegamenti` → `200 { connessione: { id, istitutoNome, stato: { sigla, nome, spiegazione }, scadeIl: string | null } | null }`

- [ ] **Step 1: Scrivi il test che fallisce**

`src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { POST as creaCollegamento, GET as leggiCollegamento } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

/** Client finto che registra cosa gli viene chiesto. */
function clientFinto(opzioni: { fallisceRequisition?: boolean } = {}) {
  const chiamate: string[] = []
  const client = {
    istituzioni: async () => ({
      dati: [{ id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', transaction_total_days: '90', max_access_valid_for_days: '180' }],
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
    creaAgreement: async () => {
      chiamate.push('agreement')
      return { dati: { id: 'agr-1', max_historical_days: 90, access_valid_for_days: 180 }, limiti: { restanti: null, ripresaFraSecondi: null } }
    },
    creaRequisition: async () => {
      chiamate.push('requisition')
      if (opzioni.fallisceRequisition) throw new Error('la banca ha detto di no')
      return { dati: { id: 'req-1', link: 'https://banca.finta/consenso/req-1', status: 'CR' }, limiti: { restanti: null, ripresaFraSecondi: null } }
    },
  } as unknown as ClientGoCardless
  return { client, chiamate }
}

describe('POST /api/gocardless/collegamenti', () => {
  it('crea la connessione e restituisce il link', async () => {
    await entraCome('admin')
    const { client } = clientFinto()
    impostaClientPerTest(client)

    const esito = await callRoute<{ connessioneId: string; link: string }>(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(201)
    expect(esito.body.link).toBe('https://banca.finta/consenso/req-1')

    const riga = await prisma.bankConnection.findUnique({ where: { id: esito.body.connessioneId } })
    expect(riga).toMatchObject({
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      agreementId: 'agr-1',
      status: 'CR',
      contiIgnorati: [],
    })
  })

  // Il punto della fase: la riga esiste prima che l'utente possa andarsene.
  it('la riga esiste già quando il link viene restituito', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const { client } = clientFinto()
    impostaClientPerTest(client)

    await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    const quante = await prisma.bankConnection.count({ where: { venueId: venue.id, deletedAt: null } })
    expect(quante).toBe(1)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    impostaClientPerTest(clientFinto().client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    expect(esito.status).toBe(403)
  })

  it('rifiuta un corpo senza istituto', async () => {
    await entraCome('admin')
    impostaClientPerTest(clientFinto().client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: {} }))

    expect(esito.status).toBe(400)
  })

  // Se la requisition fallisce non deve restare una connessione orfana in
  // stato CR che il pannello mostrerebbe come «collegamento in corso» per
  // sempre.
  it('non lascia una connessione a metà se la banca rifiuta la requisition', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    impostaClientPerTest(clientFinto({ fallisceRequisition: true }).client)

    const esito = await callRoute(creaCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } }))

    expect(esito.status).toBe(502)
    expect(await prisma.bankConnection.count({ where: { venueId: venue.id, deletedAt: null } })).toBe(0)
  })
})

describe('GET /api/gocardless/collegamenti', () => {
  it('senza connessioni restituisce null', async () => {
    await entraCome('admin')
    const esito = await callRoute<{ connessione: unknown }>(leggiCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti'))
    expect(esito.body.connessione).toBeNull()
  })

  it('restituisce la connessione con lo stato spiegato in italiano', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'BANCA_FINTA_XXXX',
        institutionName: 'Banca Finta',
        requisitionId: 'req-9',
        status: 'LN',
        accessValidUntil: new Date('2027-02-08T00:00:00.000Z'),
      },
    })

    const esito = await callRoute<{ connessione: { istitutoNome: string; stato: { sigla: string; nome: string } } }>(
      leggiCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti')
    )

    expect(esito.body.connessione).toMatchObject({
      istitutoNome: 'Banca Finta',
      stato: { sigla: 'LN', nome: 'Collegata' },
    })
  })

  it('non mostra una connessione scollegata', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    await prisma.bankConnection.create({
      data: {
        venueId: venue.id,
        institutionId: 'X',
        institutionName: 'X',
        requisitionId: 'req-vecchia',
        status: 'LN',
        deletedAt: new Date(),
      },
    })

    const esito = await callRoute<{ connessione: unknown }>(leggiCollegamento, jsonRequest('http://localhost/api/gocardless/collegamenti'))
    expect(esito.body.connessione).toBeNull()
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts
```

Atteso: FAIL con `Failed to resolve import "../route"`.

- [ ] **Step 3: Aggiungi al client i due metodi che gli mancano**

Il client della Fase 1 sa solo leggere. In `src/lib/gocardless/client.ts`, dentro l'oggetto restituito da `creaClient`, aggiungi accanto agli altri metodi:

```ts
    creaAgreement: (corpo: {
      institution_id: string
      max_historical_days: number
      access_valid_for_days: number
      access_scope: string[]
    }) => chiama('/agreements/enduser/', agreementSchema, { metodo: 'POST', corpo }),

    creaRequisition: (corpo: {
      institution_id: string
      agreement: string
      redirect: string
      reference: string
      user_language: string
    }) => chiama('/requisitions/', requisitionSchema, { metodo: 'POST', corpo }),
```

`chiama` oggi fa solo `GET`: estendila con un terzo parametro facoltativo `{ metodo, corpo }`, usando `'GET'` come predefinito e serializzando il corpo in JSON con `content-type: application/json` quando c'è. Non cambiare nient'altro della funzione: la classificazione degli errori e il ciclo dei tentativi restano quelli.

In `src/lib/gocardless/types.ts` aggiungi i due schemi:

```ts
export const agreementSchema = z.object({
  id: z.string(),
  max_historical_days: z.number().optional(),
  access_valid_for_days: z.number().optional(),
})

export const requisitionSchema = z.object({
  id: z.string(),
  link: z.string(),
  status: z.string(),
  accounts: z.array(z.string()).default([]),
})
```

- [ ] **Step 4: Scrivi la rotta**

`src/app/api/gocardless/collegamenti/route.ts`:

```ts
/**
 * Creare e leggere il collegamento a una banca.
 *
 * La riga si scrive PRIMA di restituire il link, non dopo: `POST
 * /requisitions/` crea una risorsa vera presso GoCardless, e se l'utente
 * chiude la scheda a metà quel consenso esiste comunque mentre il gestionale
 * non ne saprebbe nulla. Scrivere prima non costa niente — quella riga serve
 * comunque per mostrare «collegato a…» — e cambia solo il momento.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { descriviStato } from '@/lib/gocardless/stati'
import { logger } from '@/lib/logger'

const corpoCreazione = z.object({ istitutoId: z.string().min(1) })

/** Dove la banca rimanda a fine autenticazione. */
function urlDiRitorno(): string {
  const esplicito = process.env.GOCARDLESS_REDIRECT_URI
  if (esplicito) return esplicito
  const base = process.env.APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/gocardless/callback`
}

function giorni(valore: unknown, difetto: number): number {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : difetto
}

export const POST = withAuth(
  async (request, { venueId }) => {
    const analisi = corpoCreazione.safeParse(await request.json().catch(() => null))
    if (!analisi.success) {
      return NextResponse.json({ error: 'Manca l identificativo dell istituto' }, { status: 400 })
    }

    const client = clientDaAmbiente()

    const elenco = await client.istituzioni('it')
    const istituto = elenco.dati.find((i) => i.id === analisi.data.istitutoId)
    if (!istituto) {
      return NextResponse.json({ error: 'Istituto sconosciuto' }, { status: 404 })
    }

    // Si chiede sempre il massimo che l'istituto concede, per entrambi: meno
    // storico significa meno movimenti recuperabili, e meno giorni di accesso
    // significa più autenticazioni in banca.
    const storico = Math.min(giorni(istituto.transaction_total_days, 90), 730)
    const accesso = Math.min(giorni(istituto.max_access_valid_for_days, 90), 180)

    const agreement = await client.creaAgreement({
      institution_id: istituto.id,
      max_historical_days: storico,
      access_valid_for_days: accesso,
      access_scope: ['balances', 'details', 'transactions'],
    })

    // La riga nasce qui, prima della requisition: il suo id è anche il
    // riferimento che GoCardless ci rimanda indietro nel redirect.
    //
    // `requisitionId` è `@unique` e la requisition non esiste ancora, quindi
    // si mette un segnaposto derivato dall'agreement — unico per costruzione.
    // Se la requisition non nasce, la riga viene cancellata poche righe più in
    // basso e il segnaposto non sopravvive.
    const connessione = await prisma.bankConnection.create({
      data: {
        venueId,
        institutionId: istituto.id,
        institutionName: istituto.name,
        requisitionId: `in-attesa:${agreement.dati.id}`,
        agreementId: agreement.dati.id,
        status: 'CR',
        maxHistoricalDays: agreement.dati.max_historical_days ?? storico,
        accessValidUntil: new Date(Date.now() + accesso * 86_400_000),
      },
    })

    try {
      const requisition = await client.creaRequisition({
        institution_id: istituto.id,
        agreement: agreement.dati.id,
        redirect: urlDiRitorno(),
        reference: connessione.id,
        user_language: 'IT',
      })

      await prisma.bankConnection.update({
        where: { id: connessione.id },
        data: { requisitionId: requisition.dati.id, status: requisition.dati.status },
      })

      return NextResponse.json({ connessioneId: connessione.id, link: requisition.dati.link }, { status: 201 })
    } catch (errore) {
      // Una connessione rimasta in `CR` senza requisition il pannello la
      // mostrerebbe come «collegamento in corso» per sempre, e nessuno saprebbe
      // che non esiste nulla dall'altra parte.
      await prisma.bankConnection.delete({ where: { id: connessione.id } })
      logger.error({ errore }, 'Creazione della requisition fallita')
      return NextResponse.json({ error: 'La banca non ha accettato la richiesta di collegamento' }, { status: 502 })
    }
  },
  { roles: ['admin'], venueScoped: true }
)

export const GET = withAuth(
  async (_request, { venueId }) => {
    const connessione = await prisma.bankConnection.findFirst({
      where: { venueId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    if (!connessione) return NextResponse.json({ connessione: null })

    return NextResponse.json({
      connessione: {
        id: connessione.id,
        istitutoNome: connessione.institutionName,
        stato: descriviStato(connessione.status),
        scadeIl: connessione.accessValidUntil?.toISOString() ?? null,
      },
    })
  },
  { roles: ['admin'], venueScoped: true }
)
```

- [ ] **Step 5: Lancia il test e verifica che passi**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts
```

Atteso: 8 test PASS.

- [ ] **Step 6: Verifica che il client non sia regredito**

I metodi nuovi hanno cambiato `chiama`, che tutti gli altri usano.

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/gocardless/__tests__/client.test.ts && npx tsc --noEmit
```

Atteso: 14 test PASS, `tsc` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gocardless/client.ts src/lib/gocardless/types.ts src/app/api/gocardless/collegamenti/
git commit -m "feat(open-banking): creare il collegamento, con la riga scritta prima del link"
```

---

## Task 5: Leggere i conti e salvarne la configurazione

Le due rotte che fanno il lavoro vero: mostrare cosa la banca espone, già confrontato con l'anagrafica, e registrare le decisioni dell'amministratore.

**Files:**
- Create: `src/app/api/gocardless/collegamenti/[id]/conti/route.ts`
- Test: `src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts`

**Interfaces:**
- Consumes: `abbinaConti`, `ContoDaBanca`, `ContoDelGestionale` (Task 1); `clientDaAmbiente` (Task 3); `contiIgnorati` (Task 2)
- Produces:
  - `GET /api/gocardless/collegamenti/[id]/conti` → `200 { stato: {...}, conti: EsitoAbbinamento[] }`
  - `PUT /api/gocardless/collegamenti/[id]/conti` con corpo `{ conti: Array<{ providerAccountId, azione: 'importa' | 'ignora' | 'lascia', bankAccountId?, dataTaglio? }> }` → `200 { salvati: number }`

- [ ] **Step 1: Scrivi il test che fallisce**

`src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { GET as leggiConti, PUT as salvaConti } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

const IBAN_A = 'IT00X0000000000000000001111'
const IBAN_B = 'IT00X0000000000000000002222'

async function connessioneCollegata(conti: string[]) {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: {
      venueId: venue.id,
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      status: 'LN',
    },
  })
  impostaClientPerTest({
    leggiRequisition: async () => ({ dati: { id: 'req-1', status: 'LN', accounts: conti, link: '' }, limiti: { restanti: null, ripresaFraSecondi: null } }),
    dettagliConto: async (id: string) => ({
      dati: { account: { iban: id === 'gc-a' ? IBAN_A : IBAN_B, currency: 'EUR' } },
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
  } as unknown as ClientGoCardless)
  return { venue, connessione }
}

async function contoDiTest(venueId: string, nome: string, iban: string) {
  return prisma.bankAccount.create({
    data: { venueId, name: nome, accountType: 'BANK', iban, currency: 'EUR' },
  })
}

describe('GET conti di un collegamento', () => {
  it('abbina i conti riconosciuti e lascia sconosciuti gli altri', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a', 'gc-b'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ tipo: string; nomeConto?: string }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    expect(esito.body.conti[0]).toMatchObject({ tipo: 'riconosciuto', nomeConto: 'Conto principale' })
    expect(esito.body.conti[1]).toMatchObject({ tipo: 'sconosciuto' })
  })

  it('dice qual è il movimento più recente che gia possiede per il conto riconosciuto', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        transactionDate: new Date('2026-07-31T00:00:00.000Z'),
        description: 'Movimento da CSV',
        amount: '10.00',
      },
    })

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBe('2026-07-31')
  })

  it('per un conto senza movimenti l ultimo movimento è nullo, non una data inventata', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ conti: Array<{ ultimoMovimento: string | null }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].ultimoMovimento).toBeNull()
  })

  it('non chiede più un conto già ignorato', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { contiIgnorati: ['gc-a'] } })

    const esito = await callRoute<{ conti: Array<{ tipo: string }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0].tipo).toBe('ignorato')
  })

  it('non espone il collegamento di un altra sede', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])
    // `Venue.code` è obbligatorio e unico: senza, la `create` fallisce.
    const altra = await prisma.venue.create({ data: { name: 'Altra sede', code: 'ALTRA' } })
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { venueId: altra.id } })

    const esito = await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(esito.status).toBe(404)
  })
})

describe('PUT configurazione dei conti', () => {
  it('accende un conto con la sua data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute<{ salvati: number }>(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'importa', bankAccountId: conto.id, dataTaglio: '2026-08-12' }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({
      providerAccountId: 'gc-a',
      connectionId: connessione.id,
      syncEnabled: true,
    })
    expect(aggiornato.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-08-12')
  })

  // La data di taglio è l'unica cosa che impedisce di reimportare quello che
  // il CSV ha già portato dentro: senza, non si accende niente.
  it('rifiuta di accendere un conto senza data di taglio', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'importa', bankAccountId: conto.id }] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(400)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({ syncEnabled: false })
  })

  it('un conto ignorato finisce nella lista della connessione e non accende nulla', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'ignora' }] },
      }),
      { id: connessione.id }
    )

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual(['gc-a'])
  })

  it('«lascia» non tocca niente', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [{ providerAccountId: 'gc-a', azione: 'lascia' }] },
      }),
      { id: connessione.id }
    )

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: null, connectionId: null })
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('staff')
    const { connessione } = await connessioneCollegata(['gc-a'])

    const esito = await callRoute(
      salvaConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        body: { conti: [] },
      }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(403)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts"
```

Atteso: FAIL con `Failed to resolve import "../route"`.

- [ ] **Step 3: Aggiungi al client la lettura della requisition**

In `src/lib/gocardless/client.ts`, accanto agli altri metodi:

```ts
    leggiRequisition: (id: string) =>
      chiama(`/requisitions/${encodeURIComponent(id)}/`, requisitionSchema),
```

- [ ] **Step 4: Scrivi la rotta**

`src/app/api/gocardless/collegamenti/[id]/conti/route.ts`:

```ts
/**
 * I conti che il consenso copre, e le decisioni dell'amministratore su ognuno.
 *
 * Tre azioni possibili, e nessuna è il default:
 *  - `importa`  accende il conto, richiede un conto del gestionale e una data
 *               di taglio;
 *  - `ignora`   lo mette nella lista dei conti che il pannello non chiederà
 *               più (tipicamente un conto personale);
 *  - `lascia`   non fa niente, ed è quello che succede se non si decide.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { lookupHash } from '@/lib/encryption'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { descriviStato, eCollegata } from '@/lib/gocardless/stati'
import { abbinaConti, type ContoDaBanca } from '@/lib/gocardless/abbinamento'

const corpoSalvataggio = z.object({
  conti: z.array(
    z.object({
      providerAccountId: z.string().min(1),
      azione: z.enum(['importa', 'ignora', 'lascia']),
      bankAccountId: z.string().optional(),
      /** `YYYY-MM-DD`. Obbligatoria solo per `importa`. */
      dataTaglio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
})

async function connessioneDellaSede(id: string, venueId: string) {
  return prisma.bankConnection.findFirst({ where: { id, venueId, deletedAt: null } })
}

export const GET = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    const connessione = await connessioneDellaSede(params.id, venueId)
    if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

    const client = clientDaAmbiente()
    const requisition = await client.leggiRequisition(connessione.requisitionId)
    const stato = requisition.dati.status

    if (connessione.status !== stato) {
      await prisma.bankConnection.update({ where: { id: connessione.id }, data: { status: stato } })
    }

    if (!eCollegata(stato)) {
      return NextResponse.json({ stato: descriviStato(stato), conti: [] })
    }

    // I dettagli si chiedono un conto alla volta: è l'API a non avere una
    // lettura in blocco. Sono chiamate contate contro il limite giornaliero,
    // quindi questa rotta non va invocata a ogni render del pannello.
    const contiBanca: ContoDaBanca[] = []
    for (const id of requisition.dati.accounts) {
      const dettagli = await client.dettagliConto(id)
      contiBanca.push({
        providerAccountId: id,
        iban: dettagli.dati.account.iban ?? null,
        intestatario: dettagli.dati.account.ownerName ?? null,
        valuta: dettagli.dati.account.currency ?? null,
      })
    }

    const contiGestionale = (
      await prisma.bankAccount.findMany({
        where: { venueId, accountType: 'BANK' },
        select: { id: true, name: true, ibanHash: true, connectionId: true },
      })
    ).map((c) => ({ id: c.id, nome: c.name, ibanHash: c.ibanHash, connectionId: c.connectionId }))

    const abbinati = abbinaConti({
      contiBanca,
      contiGestionale,
      ignorati: connessione.contiIgnorati,
      impronta: lookupHash,
    })

    // La data dell'ultimo movimento che il gestionale possiede per ciascun
    // conto riconosciuto. Non è un valore da precompilare — la data di taglio
    // la sceglie l'amministratore — ma è il numero che gli serve davanti per
    // sceglierla: senza, deciderebbe a memoria.
    const idRiconosciuti = abbinati
      .filter((a) => a.tipo === 'riconosciuto' || a.tipo === 'gia-collegato')
      .map((a) => (a as { bankAccountId: string }).bankAccountId)

    const ultimi = new Map<string, string>()
    if (idRiconosciuti.length > 0) {
      const righe = await prisma.bankTransaction.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: idRiconosciuti }, deletedAt: null },
        _max: { transactionDate: true },
      })
      for (const r of righe) {
        const quando = r._max.transactionDate
        if (r.bankAccountId && quando) ultimi.set(r.bankAccountId, quando.toISOString().slice(0, 10))
      }
    }

    return NextResponse.json({
      stato: descriviStato(stato),
      conti: abbinati.map((a) =>
        'bankAccountId' in a
          ? { ...a, ultimoMovimento: ultimi.get(a.bankAccountId) ?? null }
          : { ...a, ultimoMovimento: null }
      ),
    })
  },
  { roles: ['admin'], venueScoped: true }
)

export const PUT = withAuth<{ id: string }>(
  async (request, { venueId, params }) => {
    const connessione = await connessioneDellaSede(params.id, venueId)
    if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

    const analisi = corpoSalvataggio.safeParse(await request.json().catch(() => null))
    if (!analisi.success) return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })

    // Si valida tutto prima di scrivere qualsiasi cosa: metà configurazione
    // salvata è peggio di nessuna, perché sembra riuscita.
    for (const c of analisi.data.conti) {
      if (c.azione !== 'importa') continue
      if (!c.bankAccountId) {
        return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da importare ma non è abbinato` }, { status: 400 })
      }
      if (!c.dataTaglio) {
        return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da importare ma non ha una data di taglio` }, { status: 400 })
      }
      const esiste = await prisma.bankAccount.count({ where: { id: c.bankAccountId, venueId } })
      if (esiste === 0) {
        return NextResponse.json({ error: 'Conto del gestionale inesistente' }, { status: 400 })
      }
    }

    const ignorati = new Set(connessione.contiIgnorati)
    let salvati = 0

    await prisma.$transaction(async (tx) => {
      for (const c of analisi.data.conti) {
        if (c.azione === 'ignora') {
          ignorati.add(c.providerAccountId)
          salvati++
          continue
        }
        if (c.azione === 'lascia') continue

        ignorati.delete(c.providerAccountId)
        await tx.bankAccount.update({
          where: { id: c.bankAccountId! },
          data: {
            providerAccountId: c.providerAccountId,
            connectionId: connessione.id,
            syncEnabled: true,
            syncCutoffDate: new Date(`${c.dataTaglio}T00:00:00.000Z`),
          },
        })
        salvati++
      }

      await tx.bankConnection.update({
        where: { id: connessione.id },
        data: { contiIgnorati: [...ignorati] },
      })
    })

    return NextResponse.json({ salvati })
  },
  { roles: ['admin'], venueScoped: true }
)
```

- [ ] **Step 5: Lancia il test e verifica che passi**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts"
```

Atteso: 10 test PASS.

- [ ] **Step 6: Verifica finale**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

Atteso: `tsc` exit 0; lint 0 errori e 62 warning; unitari 1462 su 111 file; integrazione 435 su 58 file (412 + 23 nuovi, 3 file nuovi).

- [ ] **Step 7: Commit**

```bash
git add src/lib/gocardless/client.ts "src/app/api/gocardless/collegamenti/[id]/"
git commit -m "feat(open-banking): leggere i conti del consenso e salvarne la configurazione"
```

---

## Task 6: Scollegare, e la pagina di ritorno

Le due rotte che chiudono il giro. Lo scollegamento non tocca i movimenti già importati: sono scritture contabili, non una cache.

**Files:**
- Create: `src/app/api/gocardless/collegamenti/[id]/route.ts`
- Create: `src/app/api/gocardless/callback/route.ts`
- Test: `src/app/api/gocardless/collegamenti/[id]/__tests__/scollega.itest.ts`
- Test: `src/app/api/gocardless/callback/__tests__/callback.itest.ts`

**Interfaces:**
- Consumes: `connessioneDellaSede` (stesso criterio del Task 5, riscritto qui: la funzione è privata di quel file)
- Produces:
  - `DELETE /api/gocardless/collegamenti/[id]` → `200 { scollegato: true }`
  - `GET /api/gocardless/callback?ref=<connessioneId>` (senza autorizzazione, vedi il commento nella rotta) → `307` verso `/impostazioni/banche-e-conti?collegamento=<id>`

- [ ] **Step 1: Scrivi i test che falliscono**

`src/app/api/gocardless/collegamenti/[id]/__tests__/scollega.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { DELETE as scollega } from '../route'

setupIntegrationDb()

async function collegamentoConConto() {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: { venueId: venue.id, institutionId: 'X', institutionName: 'Banca Finta', requisitionId: 'req-1', status: 'LN' },
  })
  const conto = await prisma.bankAccount.create({
    data: {
      venueId: venue.id,
      name: 'Conto principale',
      accountType: 'BANK',
      iban: 'IT00X0000000000000000001111',
      currency: 'EUR',
      connectionId: connessione.id,
      providerAccountId: 'gc-a',
      syncEnabled: true,
      syncCutoffDate: new Date('2026-08-12T00:00:00.000Z'),
    },
  })
  return { venue, connessione, conto }
}

describe('DELETE di un collegamento', () => {
  it('spegne i conti e stacca il collegamento', async () => {
    await entraCome('admin')
    const { connessione, conto } = await collegamentoConConto()

    const esito = await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(esito.status).toBe(200)
    expect(await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })).toMatchObject({
      syncEnabled: false,
      connectionId: null,
      providerAccountId: null,
    })
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.deletedAt).not.toBeNull()
  })

  // I movimenti sono scritture contabili: scollegare la banca non li cancella.
  it('non tocca i movimenti già importati', async () => {
    await entraCome('admin')
    const { venue, connessione, conto } = await collegamentoConConto()
    await prisma.bankTransaction.create({
      data: {
        venueId: venue.id,
        bankAccountId: conto.id,
        providerTransactionId: '20260810-1',
        transactionDate: new Date('2026-08-10T00:00:00.000Z'),
        description: 'Movimento di prova',
        amount: '10.00',
        importSource: 'PSD2_GOCARDLESS',
      },
    })

    await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(await prisma.bankTransaction.count({ where: { bankAccountId: conto.id, deletedAt: null } })).toBe(1)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    const { connessione } = await collegamentoConConto()

    const esito = await callRoute(scollega, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' }), { id: connessione.id })

    expect(esito.status).toBe(403)
  })
})
```

`src/app/api/gocardless/callback/__tests__/callback.itest.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { logout } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as ritorno } from '../route'

setupIntegrationDb()

describe('GET /api/gocardless/callback', () => {
  it('riporta al pannello indicando il collegamento', async () => {
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback?ref=conn-123'))

    expect(esito.status).toBe(307)
    expect(esito.headers.get('location')).toContain('/impostazioni/banche-e-conti?collegamento=conn-123')
  })

  // Se il riferimento manca non si va in errore: si torna al pannello, che
  // saprà mostrare lo stato vero.
  it('senza riferimento riporta comunque al pannello', async () => {
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback'))
    expect(esito.status).toBe(307)
    expect(esito.headers.get('location')).toContain('/impostazioni/banche-e-conti')
  })

  // Il ritorno dalla banca è una navigazione del browser: una sessione scaduta
  // deve portare al login, non a un JSON 401 sullo schermo.
  it('reindirizza anche senza sessione, invece di rispondere 401', async () => {
    logout()
    const esito = await callRoute(ritorno, jsonRequest('http://localhost/api/gocardless/callback?ref=conn-123'))
    expect(esito.status).toBe(307)
  })
})
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/__tests__/scollega.itest.ts" src/app/api/gocardless/callback/__tests__/callback.itest.ts
```

Atteso: FAIL su entrambi con `Failed to resolve import "../route"`.

- [ ] **Step 3: Scrivi la rotta di scollegamento**

`src/app/api/gocardless/collegamenti/[id]/route.ts`:

```ts
/**
 * Scollegare la banca.
 *
 * I movimenti già importati restano: sono scritture contabili, non una cache.
 * Si spegne la connessione, i conti tornano senza collegamento e con
 * l'interruttore giù. Un ricollegamento riparte dalla configurazione, non dai
 * dati.
 */
import { NextResponse } from 'next/server'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export const DELETE = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    const connessione = await prisma.bankConnection.findFirst({
      where: { id: params.id, venueId, deletedAt: null },
    })
    if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

    await prisma.$transaction([
      prisma.bankAccount.updateMany({
        where: { connectionId: connessione.id },
        data: { connectionId: null, providerAccountId: null, syncEnabled: false },
      }),
      prisma.bankConnection.update({
        where: { id: connessione.id },
        data: { deletedAt: new Date() },
      }),
    ])

    return NextResponse.json({ scollegato: true })
  },
  { roles: ['admin'], venueScoped: true }
)
```

- [ ] **Step 4: Scrivi la pagina di ritorno**

`src/app/api/gocardless/callback/route.ts`:

```ts
/**
 * Dove la banca rimanda a fine autenticazione.
 *
 * Non mostra nulla e non decide nulla: riporta al pannello, che interrogherà
 * la requisition e saprà com'è andata davvero. Tenere qui la logica
 * significherebbe metterla in una pagina che l'utente può chiudere per
 * sbaglio — e che, se l'autenticazione è avvenuta sul telefono, potrebbe
 * aprirsi su un dispositivo diverso da quello dove stava lavorando.
 *
 * **Deliberatamente senza `withAuth`.** Questa rotta è il bersaglio di una
 * navigazione del browser che arriva da fuori: se la sessione fosse scaduta,
 * `withAuth` risponderebbe con un JSON 401 e l'utente vedrebbe del testo
 * grezzo al ritorno dalla banca. Non legge nulla e non scrive nulla — prende
 * un identificativo dalla query e lo rimette in un'altra query — quindi non
 * c'è niente da proteggere qui: a proteggere è il pannello di destinazione,
 * che ha la sua autorizzazione e manderà al login chi deve autenticarsi.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PANNELLO = '/impostazioni/banche-e-conti'

export async function GET(request: NextRequest) {
  const riferimento = new URL(request.url).searchParams.get('ref')
  const destinazione = riferimento
    ? `${PANNELLO}?collegamento=${encodeURIComponent(riferimento)}`
    : PANNELLO

  return NextResponse.redirect(new URL(destinazione, request.url), 307)
}
```

- [ ] **Step 5: Lancia i test e verifica che passino**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/__tests__/scollega.itest.ts" src/app/api/gocardless/callback/__tests__/callback.itest.ts
```

Atteso: 6 test PASS.

- [ ] **Step 6: Verifica finale dell'intera fase 2a**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

Atteso: `tsc` exit 0; lint 0 errori e 62 warning; unitari 1462 su 111 file; integrazione 441 su 60 file.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/gocardless/collegamenti/[id]/route.ts" "src/app/api/gocardless/collegamenti/[id]/__tests__/" src/app/api/gocardless/callback/
git commit -m "feat(open-banking): scollegare la banca e la pagina di ritorno"
```

---

## Dopo il piano: cosa resta

1. **L'interfaccia.** Il piano 2b — pannello connessioni, wizard a passi, banner di scadenza, e l'innesto in `BancheEContiClient.tsx` — si scrive quando queste rotte esistono, così i componenti si specificano contro forme di risposta vere.
2. **Il rinnovo del consenso** non è in questo piano. Riusa `POST /collegamenti` per lo stesso istituto, ma deve riportare gli abbinamenti sulla connessione nuova: è lavoro suo, e va progettato con l'incognita aperta sugli identificativi dei conti, che potrebbero cambiare a ogni consenso.
3. **`GET /collegamenti/[id]/conti` costa chiamate contate.** Una lettura della requisition più una per ogni conto, tutte contro il limite di 4 al giorno per conto e per endpoint. Il pannello non deve invocarla a ogni render: va chiamata quando l'utente arriva dal ritorno della banca o quando chiede esplicitamente di aggiornare. Da tenere presente scrivendo il piano 2b.
4. **`GOCARDLESS_REDIRECT_URI` in produzione.** Oggi la rotta ricade su `APP_URL` e poi su localhost. Prima che il collegamento sia usabile davvero va deciso e impostato l'URL Railway.

# Open Banking — Fase 2b: completare le rotte e costruire il pannello

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in mano all'amministratore il collegamento alla banca e la scelta dei conti, con una schermata che si usa.

**Architecture:** Tre completamenti sulle rotte della Fase 2a, poi tre pezzi di interfaccia scritti contro la loro forma definitiva. I completamenti vengono prima perché due di essi cambiano la risposta che il pannello consuma: scrivere le schermate ora significherebbe riscriverle dopo.

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma + PostgreSQL, zod 4, React con i componenti in `src/components/ui/`, vitest (unit + integration).

**Spec di riferimento:** `docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md` — leggerne le tre decisioni e la sezione *Cosa hanno insegnato le rotte*.
**Fase precedente:** `docs/superpowers/plans/2026-08-12-open-banking-fase-2a-rotte.md` (mergiata, `353f1e1`)

---

## Global Constraints

- **Node 22 obbligatorio.** Anteporre `source ~/.nvm/nvm.sh && nvm use 22 &&` a ogni `npm`/`npx`/`node`, nella stessa riga di shell. Ogni chiamata dello strumento Bash parte da una shell nuova.
- **Nessuna chiamata di rete vera**, mai — né nei test, né altrove. Il limite della banca è di **4 chiamate al giorno per conto e per endpoint** e una sprecata costa un giorno. I test iniettano un client finto con `impostaClientPerTest`.
- **Nessun IBAN in chiaro a riposo.** `BankAccount.iban` è cifrato dal middleware Prisma; qualunque altro punto che conservi un IBAN lo violerebbe. Dove serve ricordare un conto si conservano **l'impronta** (`lookupHash`, che serve all'abbinamento) e la **forma mascherata** (che serve a mostrarlo), mai il valore.
- **Il repository è pubblico.** Nessun file tracciato può contenere IBAN, saldi, causali o nomi reali.
- **Ogni rotta è solo amministratore**: `withAuth(handler, { roles: ['admin'], venueScoped: true })`, `venueId` dalla sessione. Ogni rotta avvolge il corpo in `try/catch` e risponde con `rispostaErroreGoCardless(errore, 'METODO /api/...')`. Unica eccezione già esistente e deliberata: `GET /api/gocardless/callback`, che non ne ha bisogno e non deve averne.
- **Gli indici parziali vanno scritti in due posti** — nel `migration.sql` e in `prisma/sql/constraints.sql` — perché il database dei test nasce da `prisma db push`, che le migrazioni non le esegue. Se manca il secondo, il test che verifica il vincolo passa in verde senza che il vincolo esista.
- **Il database Supabase è condiviso con la produzione.** Mai `prisma db push` su un database vero; DDL esplicito applicato in locale con un `DATABASE_URL` verso `127.0.0.1:5433`. `npm run guard:not-prod` non si scavalca.
- **Segui l'idioma locale per caricare i dati.** `BancheEContiClient.tsx` usa `fetch` con `useState`/`useEffect` e `toast` da `sonner`; `DashboardClient.tsx` usa `useQuery` di `@tanstack/react-query`. Ogni pezzo nuovo segue quello del file in cui entra, non ne importa un terzo.
- **Nomi e commenti in italiano.**
- **TDD** sulle rotte: prima il test che fallisce, si lancia, lo si vede fallire, poi l'implementazione. Nei rapporti va incollato **l'output reale** del rosso.
- Baseline all'inizio: `tsc --noEmit` exit 0; `npm run lint` 0 errori e 62 warning preesistenti; **1466 test unitari su 112 file**; **451 di integrazione su 60 file**.

---

## File Structure

**Nuovi**

| File | Responsabilità |
|---|---|
| `prisma/migrations/20260813090000_conti_letti_e_unicita/migration.sql` | La colonna che ricorda i conti letti, e l'indice che impedisce due collegamenti vivi per sede. |
| `src/app/api/gocardless/collegamenti/[id]/rinnovo/route.ts` | `POST` — rinnova il consenso aggiornando la riga esistente, senza toccare i conti. |
| `src/components/settings/ConnessioniBancarie.tsx` | Il blocco in fondo alla scheda «Banche»: stato della connessione, elenco dei conti, interruttori, date, scadenza. |
| `src/components/settings/WizardCollegamento.tsx` | Il dialogo a passi: ricerca dell'istituto, conferma, partenza verso la banca. |
| `src/components/dashboard/BannerConsenso.tsx` | L'avviso di scadenza in cima alla dashboard. |
| `src/app/api/gocardless/collegamenti/[id]/rinnovo/__tests__/rinnovo.itest.ts` | |
| `src/components/settings/__tests__/ConnessioniBancarie.test.tsx` | |

**Modificati**

| File | Modifica |
|---|---|
| `prisma/schema.prisma` | `contiLetti Json?` su `BankConnection`; commento sull'indice parziale nuovo. |
| `prisma/sql/constraints.sql` | Sezione `5e`: l'indice unico parziale su `bank_connections(venue_id)`. |
| `src/app/api/gocardless/collegamenti/[id]/conti/route.ts` | La `GET` legge dai dettagli conservati salvo `?aggiorna=1`, e la risposta porta `syncEnabled` e `syncCutoffDate`. La `PUT` sostituisce l'azione `importa` con `configura`, che porta `attivo`. |
| `src/app/api/gocardless/collegamenti/route.ts` | Il 409 nasce anche da una violazione `P2002` dell'indice nuovo, non solo dal controllo applicativo. |
| `src/components/settings/BancheEContiClient.tsx` | La card «Coming Soon» lascia il posto a `<ConnessioniBancarie />`. |
| `src/app/(dashboard)/DashboardClient.tsx` | `<BannerConsenso />` in cima. |

**Fuori dal perimetro**: qualunque sincronizzazione. Alla fine di questa fase il pannello dichiara che i movimenti arriveranno con la Fase 3, e nessun codice li scarica.

---

## Task 1: Ricordare i conti letti, e dire quali sono accesi

La rotta più cara della fase spende una chiamata per conto a ogni invocazione, su un contingente di quattro al giorno: quattro aperture del pannello lo esauriscono e la quinta non mostra nulla — nemmeno la configurazione già salvata, che sta nel database. E la risposta non dice quali conti sono accesi né con quale data, quindi il pannello ripresenterebbe vuoto un campo obbligatorio che l'amministratore aveva già compilato.

**Cosa si conserva, e cosa no.** IBAN, intestatario e valuta di un conto non cambiano, quindi si conservano. Ma l'IBAN **non si scrive in chiaro**: `BankAccount.iban` è cifrato dal middleware e una colonna JSON lo scavalcherebbe. Si conservano l'**impronta** — che è ciò che serve all'abbinamento — e la **forma mascherata**, che è ciò che serve a mostrarlo. Il valore non serve a nessuno dei due.

**Files:**
- Modify: `prisma/schema.prisma` (`BankConnection`)
- Create: `prisma/migrations/20260813090000_conti_letti_e_unicita/migration.sql`
- Modify: `src/app/api/gocardless/collegamenti/[id]/conti/route.ts`
- Modify: `src/lib/gocardless/abbinamento.ts` (accetta l'impronta già calcolata)
- Test: `src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts` (esistente, si estende)
- Test: `src/lib/gocardless/__tests__/abbinamento.test.ts` (esistente, si estende)

**Interfaces:**
- Consumes: `abbinaConti`, `descriviStato`, `eCollegata`, `clientDaAmbiente`, `rispostaErroreGoCardless`
- Produces:
  - campo Prisma `contiLetti Json?` su `BankConnection`
  - `interface ContoConservato { providerAccountId: string; ibanHash: string | null; ibanMascherato: string | null; intestatario: string | null; valuta: string | null }`
  - `GET /api/gocardless/collegamenti/[id]/conti[?aggiorna=1]` → `200 { stato, conti: Array<EsitoAbbinamento & { ultimoMovimento: string | null; syncEnabled: boolean; syncCutoffDate: string | null }>, lettiIl: string | null }`
  - `PUT` con `azione: 'configura' | 'ignora' | 'lascia'`; `configura` porta `bankAccountId`, `dataTaglio` e `attivo: boolean`

- [ ] **Step 1: Aggiungi il campo allo schema**

In `prisma/schema.prisma`, dentro `model BankConnection`, dopo `contiIgnorati`:

```prisma
  /// I conti che il consenso copre, come li ha restituiti la banca l'ultima
  /// volta che glieli abbiamo chiesti. Si conservano perché rileggerli costa
  /// una chiamata per conto su un contingente di quattro al giorno: senza
  /// memoria, quattro aperture del pannello lo esaurirebbero e la quinta non
  /// mostrerebbe nulla, nemmeno ciò che è già salvato qui.
  ///
  /// **Non contiene IBAN.** `BankAccount.iban` è cifrato dal middleware, e una
  /// colonna JSON lo scavalcherebbe: si conservano l'impronta, che serve
  /// all'abbinamento, e la forma mascherata, che serve a mostrarlo. Il valore
  /// non serve a nessuno dei due.
  contiLetti        Json?     @map("conti_letti")
  contiLettiIl      DateTime? @map("conti_letti_il")
```

- [ ] **Step 2: Verifica lo schema**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx prisma validate && npx prisma format
```

Atteso: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Scrivi la migrazione**

Crea `prisma/migrations/20260813090000_conti_letti_e_unicita/migration.sql`. Contiene **due** cose: la colonna di questo task e l'indice del Task 3, perché una sola migrazione è più facile da applicare e da rivedere di due a un giorno di distanza.

```sql
-- Fase 2b dell'integrazione open banking.
-- Spec: docs/superpowers/specs/2026-08-12-open-banking-fase-2-design.md

-- I conti letti dalla banca, conservati per non richiederli a ogni apertura
-- del pannello: il contingente e' di 4 chiamate al giorno per conto.
-- Nessun IBAN in chiaro qui dentro: impronta e forma mascherata.
ALTER TABLE "bank_connections"
    ADD COLUMN "conti_letti" JSONB,
    ADD COLUMN "conti_letti_il" TIMESTAMP(3);

-- Un solo collegamento vivo per sede.
--
-- Il controllo applicativo in POST /collegamenti (findFirst poi create) e' una
-- lettura seguita da una scrittura: due richieste concorrenti — un doppio clic
-- sul pulsante di conferma — lo superano entrambe e creano due connessioni,
-- due agreement e due requisition, cioe' sei chiamate alla banca invece di
-- tre. Il pannello ne mostrerebbe una sola e l'altra resterebbe invisibile.
--
-- Parziale su `deleted_at IS NULL` perche' le connessioni scollegate restano
-- in tabella e devono poter convivere con quella viva.
CREATE UNIQUE INDEX "ux_bank_connections_sede_viva"
    ON "bank_connections"("venue_id")
    WHERE "deleted_at" IS NULL;
```

- [ ] **Step 4: Dichiara lo stesso indice in `prisma/sql/constraints.sql`**

Senza questo passo il database dei test non avrà il vincolo, e il test del Task 3 che verifica il rifiuto passerà senza provare nulla. In coda alla sezione `5d`, prima del blocco `-- 6. Indici di performance`:

```sql
-- 5e. bank_connections — un solo collegamento vivo per sede.
--
--     Bug che impedisce: un doppio clic sul pulsante di conferma del wizard
--     supera il controllo applicativo (findFirst poi create) due volte e crea
--     due connessioni; il pannello ne mostra una e l'altra resta invisibile,
--     avendo pero' gia' consumato tre chiamate alla banca.
--
--     Parziale su deleted_at perche' le connessioni scollegate restano in
--     tabella e devono poter convivere con quella viva.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_connections_sede_viva
  ON bank_connections (venue_id)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 5: Applica la migrazione su un database locale usa-e-getta**

> Il `.env` punta a **Supabase di produzione** e `npm run guard:not-prod` lo blocca, giustamente. Non si scavalca: gli si dà un bersaglio locale. In locale gira PostgreSQL 16 su `127.0.0.1:5433` con l'utente `nicolascarpa`.

```bash
source ~/.nvm/nvm.sh && nvm use 22 && node -e "
const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:5433,user:'nicolascarpa',database:'postgres'});
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS weiss_ob_fase2b WITH (FORCE)');
  await c.query('CREATE DATABASE weiss_ob_fase2b');
  console.log('creato weiss_ob_fase2b');
  await c.end();
})()"
```

```bash
source ~/.nvm/nvm.sh && nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase2b" npx prisma migrate deploy && npx prisma generate
```

Atteso: l'elenco si chiude con `20260813090000_conti_letti_e_unicita`, senza errori.

- [ ] **Step 6: Verifica che l'indice sia davvero parziale**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && DATABASE_URL="postgresql://nicolascarpa@127.0.0.1:5433/weiss_ob_fase2b" node -e "
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\"SELECT indexdef FROM pg_indexes WHERE indexname='ux_bank_connections_sede_viva'\")
 .then(r=>{console.log(r.rows[0]?.indexdef ?? 'INDICE ASSENTE');return p.end()});
"
```

Atteso: la definizione contiene `UNIQUE` e `WHERE (deleted_at IS NULL)`. Se manca la `WHERE`, due connessioni scollegate non potrebbero coesistere e lo scollegamento si romperebbe al secondo giro.

- [ ] **Step 7: Scrivi i test che falliscono**

In `src/lib/gocardless/__tests__/abbinamento.test.ts`, aggiungi in coda:

```ts
describe('abbinaConti con impronte già calcolate', () => {
  it('accetta un conto della banca che porta già la sua impronta', () => {
    const esito = abbinaConti({
      contiBanca: [{ providerAccountId: 'gc-1', iban: null, ibanHash: impronta('IT00X001'), intestatario: null, valuta: 'EUR' }],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0]).toMatchObject({ tipo: 'riconosciuto', bankAccountId: 'ba-1' })
  })

  // L'impronta conservata è l'unico modo di riabbinare senza richiedere gli
  // IBAN alla banca: se venisse ignorata, la memoria non servirebbe a nulla.
  it("preferisce l'impronta già calcolata all'IBAN, quando ci sono entrambi", () => {
    const esito = abbinaConti({
      contiBanca: [{ providerAccountId: 'gc-2', iban: 'IT00X999', ibanHash: impronta('IT00X001'), intestatario: null, valuta: null }],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('riconosciuto')
  })
})
```

In `src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts`, aggiungi in coda:

```ts
describe('memoria dei conti letti', () => {
  it('la prima lettura interroga la banca e conserva ciò che ha letto', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiLettiIl).not.toBeNull()
    expect(Array.isArray(riga.contiLetti)).toBe(true)
  })

  // Il punto del task: quattro aperture del pannello non devono esaurire il
  // contingente della banca.
  it('la seconda lettura non chiama la banca', async () => {
    await entraCome('admin')
    const { connessione, chiamate } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
    const dopoLaPrima = chiamate.length
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    expect(chiamate.length).toBe(dopoLaPrima)
  })

  it('con ?aggiorna=1 richiede alla banca anche se ha memoria', async () => {
    await entraCome('admin')
    const { connessione, chiamate } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })
    const dopoLaPrima = chiamate.length
    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti?aggiorna=1`), { id: connessione.id })

    expect(chiamate.length).toBeGreaterThan(dopoLaPrima)
  })

  // Nessun IBAN in chiaro a riposo: la colonna conserva impronta e maschera.
  it('non conserva mai l IBAN in chiaro', async () => {
    await entraCome('admin')
    const { connessione } = await connessioneCollegata(['gc-a'])

    await callRoute(leggiConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(JSON.stringify(riga.contiLetti)).not.toContain(IBAN_A)
  })

  it('la risposta dice quali conti sono accesi e con quale data', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)
    await prisma.bankAccount.update({
      where: { id: conto.id },
      data: { connectionId: connessione.id, providerAccountId: 'gc-a', syncEnabled: true, syncCutoffDate: new Date('2026-08-13T00:00:00.000Z') },
    })

    const esito = await callRoute<{ conti: Array<{ syncEnabled: boolean; syncCutoffDate: string | null }> }>(
      leggiConti,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`),
      { id: connessione.id }
    )

    expect(esito.body.conti[0]).toMatchObject({ syncEnabled: true, syncCutoffDate: '2026-08-13' })
  })
})

describe('configura con lo stato desiderato', () => {
  it('spegne un conto senza ignorarlo, conservando abbinamento e data', async () => {
    await entraCome('admin')
    const { venue, connessione } = await connessioneCollegata(['gc-a'])
    const conto = await contoDiTest(venue.id, 'Conto principale', IBAN_A)

    const corpo = (attivo: boolean) => ({
      conti: [{ providerAccountId: 'gc-a', azione: 'configura', bankAccountId: conto.id, dataTaglio: '2026-08-13', attivo }],
    })

    await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo(true) }), { id: connessione.id })
    await callRoute(salvaConti, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/conti`, { method: 'PUT', body: corpo(false) }), { id: connessione.id })

    const aggiornato = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(aggiornato).toMatchObject({ syncEnabled: false, providerAccountId: 'gc-a', connectionId: connessione.id })
    expect(aggiornato.syncCutoffDate).not.toBeNull()
    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiIgnorati).toEqual([])
  })
})
```

`connessioneCollegata` va estesa per restituire anche l'array `chiamate` del client finto, incrementato da `leggiRequisition` e `dettagliConto`. Se il finto attuale non lo espone, aggiungilo: senza, i due test sul risparmio di chiamate non provano nulla.

- [ ] **Step 8: Lancia i test e verifica che falliscano**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/gocardless/__tests__/abbinamento.test.ts
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts"
```

Atteso: i due unitari falliscono perché `ContoDaBanca` non ha `ibanHash`; gli itest falliscono su `contiLetti` inesistente e su `azione: 'configura'` rifiutata dallo schema.

- [ ] **Step 9: Estendi `abbinamento.ts`**

Aggiungi `ibanHash` a `ContoDaBanca` e usalo quando c'è:

```ts
export interface ContoDaBanca {
  providerAccountId: string
  iban: string | null
  /**
   * L'impronta, quando è già stata calcolata e conservata. È ciò che permette
   * di riabbinare senza richiedere gli IBAN alla banca: se venisse ignorata,
   * conservarla non servirebbe a nulla.
   */
  ibanHash: string | null
  intestatario: string | null
  valuta: string | null
}
```

e dentro `abbinaConti`, al posto del calcolo diretto:

```ts
    const suaImpronta = conto.ibanHash ?? (conto.iban ? impronta(conto.iban) : null)
    if (!suaImpronta) return { tipo: 'sconosciuto', conto }

    const corrispondente = perImpronta.get(suaImpronta)
```

- [ ] **Step 10: Riscrivi la `GET` della rotta**

La logica: se esiste memoria e non è stato chiesto `?aggiorna=1`, si usa la memoria; altrimenti si interroga la banca e si conserva. La memoria si scrive solo quando la requisition è `LN` e la lettura è riuscita per intero — una memoria parziale sarebbe peggio di nessuna.

```ts
    const aggiorna = new URL(request.url).searchParams.get('aggiorna') === '1'
    const conservati = leggiConservati(connessione.contiLetti)

    let contiBanca: ContoDaBanca[]
    if (conservati && !aggiorna) {
      contiBanca = conservati.map(daConservato)
    } else {
      const requisition = await client.leggiRequisition(connessione.requisitionId)
      // … aggiornamento dello stato e uscita anticipata se non è LN, come prima …
      const letti: ContoConservato[] = []
      for (const id of requisition.dati.accounts) {
        const dettagli = await client.dettagliConto(id)
        const iban = dettagli.dati.account.iban ?? null
        letti.push({
          providerAccountId: id,
          // L'IBAN non si conserva: solo l'impronta, che serve ad abbinare, e
          // la maschera, che serve a mostrarlo. Il valore non serve a nessuno
          // dei due, e conservarlo lo metterebbe in chiaro accanto a una
          // colonna che il middleware cifra.
          ibanHash: iban ? lookupHash(iban) : null,
          ibanMascherato: iban ? mascheraIban(iban) : null,
          intestatario: dettagli.dati.account.ownerName ?? null,
          valuta: dettagli.dati.account.currency ?? null,
        })
      }
      contiBanca = letti.map(daConservato)
      await prisma.bankConnection.update({
        where: { id: connessione.id },
        data: { contiLetti: contiBanca as unknown as Prisma.InputJsonValue, contiLettiIl: new Date() },
      })
    }
```

Servono tre aiutanti nello stesso file, sopra la rotta:

```ts
/** Ciò che si conserva di un conto letto: mai l'IBAN, solo impronta e maschera. */
export interface ContoConservato {
  providerAccountId: string
  ibanHash: string | null
  ibanMascherato: string | null
  intestatario: string | null
  valuta: string | null
}

const contoConservatoSchema = z.object({
  providerAccountId: z.string(),
  ibanHash: z.string().nullable(),
  ibanMascherato: z.string().nullable(),
  intestatario: z.string().nullable(),
  valuta: z.string().nullable(),
})

/**
 * Rilegge la colonna, o `null` se la forma non torna. Una colonna JSON scritta
 * da una versione precedente del codice non deve far esplodere il pannello:
 * peggio che perdere la memoria è mostrare un errore per averla.
 */
function leggiConservati(valore: unknown): ContoConservato[] | null {
  const esito = z.array(contoConservatoSchema).safeParse(valore)
  return esito.success && esito.data.length > 0 ? esito.data : null
}

/** Un conto conservato, nella forma che l'abbinamento si aspetta. */
function daConservato(c: ContoConservato): ContoDaBanca {
  return {
    providerAccountId: c.providerAccountId,
    iban: null,
    ibanHash: c.ibanHash,
    intestatario: c.intestatario,
    valuta: c.valuta,
  }
}
```

La forma mascherata non entra in `ContoDaBanca` — l'abbinamento non se ne fa niente — ma va nella risposta della rotta accanto a ogni conto, perché è ciò che il pannello mostra. Portala unendo l'elenco conservato all'esito dell'abbinamento sul `providerAccountId`.

`mascheraIban` va scritta accanto agli altri aiutanti del file — `IT` seguito da puntini e dalle ultime quattro cifre — oppure estratta in `src/lib/gocardless/maschere.ts` se preferisci averla provata da sola. `leggiConservati` valida la colonna con uno schema zod e restituisce `null` se la forma non torna: una colonna JSON scritta da una versione precedente del codice non deve far esplodere il pannello.

Poi, dopo l'abbinamento, arricchisci ogni esito con lo stato del conto del gestionale:

```ts
    const configurazioni = new Map(
      (await prisma.bankAccount.findMany({
        where: { venueId, connectionId: connessione.id },
        select: { id: true, syncEnabled: true, syncCutoffDate: true },
      })).map((c) => [c.id, c])
    )
```

e nella risposta, per ogni conto abbinato, `syncEnabled` e `syncCutoffDate` (in forma `YYYY-MM-DD`, `null` se assente). Per i conti non abbinati, `false` e `null`. Aggiungi `lettiIl: connessione.contiLettiIl?.toISOString() ?? null`, che serve al pannello per dire da quando sono quei dati.

- [ ] **Step 11: Sostituisci `importa` con `configura` nella `PUT`**

Lo schema del corpo diventa:

```ts
const corpoSalvataggio = z.object({
  conti: z.array(
    z.object({
      providerAccountId: z.string().min(1),
      azione: z.enum(['configura', 'ignora', 'lascia']),
      bankAccountId: z.string().optional(),
      dataTaglio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /**
       * Se il conto deve sincronizzare. Spegnere non è ignorare: un conto
       * spento resta abbinato, con la sua data, pronto a essere riacceso;
       * un conto ignorato è un conto che non vogliamo più vedere proposto.
       */
      attivo: z.boolean().optional(),
    })
  ),
})
```

`configura` richiede `bankAccountId` e `dataTaglio` come prima — la data serve anche a un conto spento, perché è la data con cui ripartirà quando lo si riaccende — e scrive `syncEnabled: c.attivo ?? true`. Le validazioni esistenti (duplicati, `accountType: 'BANK'`, data di calendario, appartenenza alla sede) non cambiano: aggiorna solo il nome dell'azione dove compare.

I test esistenti che usano `azione: 'importa'` vanno aggiornati a `configura` con `attivo: true`. Non è un test da indebolire: è lo stesso comportamento con un nome più onesto.

- [ ] **Step 12: Lancia i test e verifica che passino**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/lib/gocardless/__tests__/abbinamento.test.ts && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts"
```

- [ ] **Step 13: Verifica completa e commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add prisma/schema.prisma prisma/migrations/20260813090000_conti_letti_e_unicita/ prisma/sql/constraints.sql src/lib/gocardless/ "src/app/api/gocardless/collegamenti/[id]/conti/"
git commit -m "feat(open-banking): ricorda i conti letti e dice quali sono accesi"
```

---

## Task 2: La rotta del rinnovo

Il consenso dura 180 giorni. Alla scadenza si rifà **solo** l'autenticazione in banca: interruttori, abbinamenti e date restano. La strada che il piano della Fase 2 prevedeva — riusare `POST /collegamenti` — è chiusa dal rifiuto del secondo collegamento vivo, perché una connessione scaduta è comunque viva per quel controllo. E `DELETE` seguito da `POST` azzera la configurazione, cioè l'opposto di ciò che il rinnovo deve fare.

Serve una rotta sua, che aggiorna la riga esistente.

**Files:**
- Create: `src/app/api/gocardless/collegamenti/[id]/rinnovo/route.ts`
- Test: `src/app/api/gocardless/collegamenti/[id]/rinnovo/__tests__/rinnovo.itest.ts`

**Interfaces:**
- Consumes: `clientDaAmbiente`, `rispostaErroreGoCardless`, i metodi `creaAgreement`/`creaRequisition` del client
- Produces: `POST /api/gocardless/collegamenti/[id]/rinnovo` → `200 { link: string }`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { POST as rinnova } from '../route'

setupIntegrationDb()
afterEach(() => impostaClientPerTest(null))

function clientFinto() {
  return {
    istituzioni: async () => ({
      dati: [{ id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', transaction_total_days: '90', max_access_valid_for_days: '180' }],
      limiti: { restanti: null, ripresaFraSecondi: null },
    }),
    creaAgreement: async () => ({ dati: { id: 'agr-2', max_historical_days: 90, access_valid_for_days: 180 }, limiti: { restanti: null, ripresaFraSecondi: null } }),
    creaRequisition: async () => ({ dati: { id: 'req-2', link: 'https://banca.finta/consenso/req-2', status: 'CR', accounts: [] }, limiti: { restanti: null, ripresaFraSecondi: null } }),
  } as unknown as ClientGoCardless
}

async function collegamentoScadutoConConto() {
  const venue = await venueDiTest()
  const connessione = await prisma.bankConnection.create({
    data: {
      venueId: venue.id,
      institutionId: 'BANCA_FINTA_XXXX',
      institutionName: 'Banca Finta',
      requisitionId: 'req-1',
      agreementId: 'agr-1',
      status: 'EX',
      accessValidUntil: new Date('2026-02-01T00:00:00.000Z'),
    },
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
      syncCutoffDate: new Date('2026-05-01T00:00:00.000Z'),
    },
  })
  return { venue, connessione, conto }
}

describe('POST rinnovo del consenso', () => {
  it('restituisce un link nuovo e aggiorna la riga esistente', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    const esito = await callRoute<{ link: string }>(
      rinnova,
      jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }),
      { id: connessione.id }
    )

    expect(esito.status).toBe(200)
    expect(esito.body.link).toBe('https://banca.finta/consenso/req-2')

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga).toMatchObject({ requisitionId: 'req-2', agreementId: 'agr-2', status: 'CR' })
  })

  // È la ragione per cui questa rotta esiste invece di riusare DELETE + POST.
  it('non tocca la configurazione dei conti', async () => {
    await entraCome('admin')
    const { connessione, conto } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    const dopo = await prisma.bankAccount.findUniqueOrThrow({ where: { id: conto.id } })
    expect(dopo).toMatchObject({ syncEnabled: true, connectionId: connessione.id, providerAccountId: 'gc-a' })
    expect(dopo.syncCutoffDate?.toISOString().slice(0, 10)).toBe('2026-05-01')
  })

  // La memoria dei conti si riferisce al consenso precedente: dopo l'SCA la
  // banca potrebbe esporre un insieme diverso, e riabbinare su dati vecchi
  // produrrebbe corrispondenze inventate.
  it('dimentica i conti letti, che appartengono al consenso vecchio', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    await prisma.bankConnection.update({
      where: { id: connessione.id },
      data: { contiLetti: [{ providerAccountId: 'gc-a', ibanHash: 'h', ibanMascherato: 'IT••1111', intestatario: null, valuta: 'EUR' }], contiLettiIl: new Date() },
    })
    impostaClientPerTest(clientFinto())

    await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    const riga = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connessione.id } })
    expect(riga.contiLetti).toBeNull()
    expect(riga.contiLettiIl).toBeNull()
  })

  it('non rinnova il collegamento di un altra sede', async () => {
    await entraCome('admin')
    const { connessione } = await collegamentoScadutoConConto()
    const altra = await prisma.venue.create({ data: { name: 'Altra sede', code: 'ALTRA' } })
    await prisma.bankConnection.update({ where: { id: connessione.id }, data: { venueId: altra.id } })
    impostaClientPerTest(clientFinto())

    const esito = await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    expect(esito.status).toBe(404)
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('manager')
    const { connessione } = await collegamentoScadutoConConto()
    impostaClientPerTest(clientFinto())

    const esito = await callRoute(rinnova, jsonRequest(`http://localhost/api/gocardless/collegamenti/${connessione.id}/rinnovo`, { method: 'POST' }), { id: connessione.id })

    expect(esito.status).toBe(403)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/rinnovo/__tests__/rinnovo.itest.ts"
```

Atteso: FAIL con `Failed to resolve import "../route"`.

- [ ] **Step 3: Scrivi la rotta**

```ts
/**
 * Rinnovare il consenso a una banca già collegata.
 *
 * Esiste come rotta a sé perché nessuna delle due strade disponibili andava
 * bene. Riusare `POST /collegamenti` è impossibile: il rifiuto del secondo
 * collegamento vivo sbarra la via, e una connessione scaduta è comunque viva
 * per quel controllo. Scollegare e ricollegare azzera abbinamenti,
 * interruttori e date — cioè costringerebbe a ridecidere le date di taglio
 * ogni sei mesi, che è l'operazione più facile da sbagliare di tutta
 * l'integrazione.
 *
 * Qui la riga resta la stessa e cambiano solo agreement, requisition, stato e
 * scadenza. I `BankAccount` non si toccano: al ritorno dalla banca il
 * riabbinamento per impronta aggiornerà `providerAccountId` se GoCardless
 * avrà cambiato gli identificativi — cosa che non sappiamo ancora se faccia.
 */
import { NextResponse } from 'next/server'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'

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

export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    try {
      const connessione = await prisma.bankConnection.findFirst({
        where: { id: params.id, venueId, deletedAt: null },
      })
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const client = clientDaAmbiente()
      const elenco = await client.istituzioni('it')
      const istituto = elenco.dati.find((i) => i.id === connessione.institutionId)
      if (!istituto) {
        return NextResponse.json({ error: 'L istituto collegato non è più fra quelli disponibili' }, { status: 409 })
      }

      const storico = Math.min(giorni(istituto.transaction_total_days, 90), 730)
      const accesso = Math.min(giorni(istituto.max_access_valid_for_days, 90), 180)

      const agreement = await client.creaAgreement({
        institution_id: connessione.institutionId,
        max_historical_days: storico,
        access_valid_for_days: accesso,
        access_scope: ['balances', 'details', 'transactions'],
      })

      const requisition = await client.creaRequisition({
        institution_id: connessione.institutionId,
        agreement: agreement.dati.id,
        redirect: urlDiRitorno(),
        reference: connessione.id,
        user_language: 'IT',
      })

      await prisma.bankConnection.update({
        where: { id: connessione.id },
        data: {
          agreementId: agreement.dati.id,
          requisitionId: requisition.dati.id,
          status: requisition.dati.status,
          maxHistoricalDays: agreement.dati.max_historical_days ?? storico,
          accessValidUntil: new Date(
            Date.now() + (agreement.dati.access_valid_for_days ?? accesso) * 86_400_000
          ),
          // I conti letti appartengono al consenso vecchio: dopo l'SCA la
          // banca potrebbe esporne un insieme diverso, e riabbinare su dati
          // vecchi produrrebbe corrispondenze inventate.
          contiLetti: null,
          contiLettiIl: null,
        },
      })

      return NextResponse.json({ link: requisition.dati.link })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'POST /api/gocardless/collegamenti/[id]/rinnovo')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
```

- [ ] **Step 4: Lancia il test, verifica completa, commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- "src/app/api/gocardless/collegamenti/[id]/rinnovo/__tests__/rinnovo.itest.ts"
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add "src/app/api/gocardless/collegamenti/[id]/rinnovo/"
git commit -m "feat(open-banking): rinnovare il consenso senza perdere la configurazione"
```

---

## Task 3: Il doppio collegamento non passa nemmeno per corsa

L'indice esiste dal Task 1. Manca la traduzione della violazione in una risposta comprensibile: senza, una corsa persa produrrebbe un 500 anonimo invece del 409 che l'amministratore già conosce.

**Files:**
- Modify: `src/app/api/gocardless/collegamenti/route.ts`
- Test: `src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts` (esistente, si estende)

**Interfaces:**
- Consumes: l'indice `ux_bank_connections_sede_viva` (Task 1)
- Produces: nessuna interfaccia nuova; `POST /collegamenti` risponde 409 anche su `P2002`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
  // Il controllo applicativo legge e poi scrive: due richieste concorrenti lo
  // superano entrambe. L'indice unico parziale è la rete, e la sua violazione
  // deve arrivare all'amministratore come il 409 che già conosce, non come un
  // errore interno.
  it('traduce la violazione dell indice in un 409, non in un 500', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const { client } = clientFinto()
    impostaClientPerTest(client)

    // Si crea la riga concorrente dopo che il controllo applicativo è passato:
    // lo si simula inserendola direttamente prima della create della rotta,
    // con il controllo aggirato tramite una connessione creata a mano.
    await prisma.bankConnection.create({
      data: { venueId: venue.id, institutionId: 'X', institutionName: 'X', requisitionId: 'req-corsa', status: 'CR' },
    })

    const esito = await callRoute(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(409)
  })
```

> Nota per chi implementa: questo test passa già grazie al controllo applicativo, quindi **non** dimostra da solo la traduzione del `P2002`. Per provarla davvero serve che la riga concorrente nasca **dopo** il controllo: il modo più semplice è farla creare dal client finto, dentro `creaAgreement`, che la rotta invoca fra il controllo e la `create`. Scrivilo così — un test che passa per il motivo sbagliato è peggio di nessun test — e se non riesci a costruirlo, dillo nel rapporto invece di lasciarlo ambiguo.

- [ ] **Step 2: Lancia il test e verifica che fallisca**

Atteso, con la riga concorrente creata dentro `creaAgreement`: FAIL con status 500 invece di 409.

- [ ] **Step 3: Traduci la violazione**

Nella `POST`, il `catch` che oggi gestisce il fallimento della requisition e quello esterno devono riconoscere `P2002` sull'indice della connessione:

```ts
import { Prisma } from '@prisma/client'

// …

function eDoppioCollegamento(errore: unknown): boolean {
  return (
    errore instanceof Prisma.PrismaClientKnownRequestError &&
    errore.code === 'P2002' &&
    String(errore.meta?.target ?? '').includes('bank_connections')
  )
}
```

e nel `catch` esterno, prima di delegare al traduttore:

```ts
      if (eDoppioCollegamento(errore)) {
        return NextResponse.json(
          { error: 'Esiste già un collegamento attivo per questa sede: scollegalo prima di crearne uno nuovo' },
          { status: 409 }
        )
      }
```

- [ ] **Step 4: Lancia il test, verifica completa, commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test:integration -- src/app/api/gocardless/collegamenti/__tests__/collegamenti.itest.ts
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add src/app/api/gocardless/collegamenti/
git commit -m "feat(open-banking): anche la corsa sul doppio collegamento finisce in un 409"
```

---

## Task 4: Il pannello delle connessioni

Il blocco che sostituisce la card «Coming Soon». Ha due stati: nessuna connessione, oppure una connessione con i suoi conti.

**Segui l'idioma del file in cui entra**: `BancheEContiClient.tsx` usa `fetch` con `useState`/`useEffect` e `toast` da `sonner`. Non introdurre react-query qui.

**Non invocare la lettura dei conti al montaggio senza memoria.** La rotta ora ricorda, quindi una `GET` normale non costa chiamate — ma `?aggiorna=1` sì, una per conto: quel bottone è un gesto esplicito, mai automatico.

**Files:**
- Create: `src/components/settings/ConnessioniBancarie.tsx`
- Modify: `src/components/settings/BancheEContiClient.tsx` (la card «Coming Soon» lascia il posto al componente)
- Test: `src/components/settings/__tests__/ConnessioniBancarie.test.tsx`

**Interfaces:**
- Consumes: `GET /api/gocardless/collegamenti`, `GET /api/gocardless/collegamenti/[id]/conti`, `PUT` della stessa, `DELETE /api/gocardless/collegamenti/[id]`, `POST /api/gocardless/collegamenti/[id]/rinnovo`
- Produces: `export function ConnessioniBancarie()`

- [ ] **Step 1: Scrivi il test che fallisce**

I test dei componenti in questo progetto girano nella suite unitaria con `jsdom`. Verifica come sono scritti gli altri (`src/components/**/__tests__/*.test.tsx`) e segui quel modo — testing-library se già in uso. Il test minimo che serve, e che deve fallire ora:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ConnessioniBancarie } from '../ConnessioniBancarie'

function rispondiCon(percorso: string, corpo: unknown) { /* mock di fetch per percorso */ }

beforeEach(() => vi.restoreAllMocks())

describe('ConnessioniBancarie', () => {
  it('senza collegamento invita a collegarne uno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ connessione: null }), { status: 200, headers: { 'content-type': 'application/json' } })))

    render(<ConnessioniBancarie />)

    expect(await screen.findByRole('button', { name: /collega la banca/i })).toBeInTheDocument()
  })

  // Il pannello non deve spendere chiamate alla banca da solo: l'aggiornamento
  // è un gesto esplicito.
  it('al montaggio non chiede mai un aggiornamento forzato', async () => {
    const chiamate: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      chiamate.push(String(url))
      return new Response(JSON.stringify({ connessione: null }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    render(<ConnessioniBancarie />)

    await waitFor(() => expect(chiamate.length).toBeGreaterThan(0))
    expect(chiamate.some((u) => u.includes('aggiorna=1'))).toBe(false)
  })

  it('con un collegamento mostra istituto, scadenza e conti', async () => {
    // … stub che risponde alla GET dei collegamenti e a quella dei conti,
    // con un conto riconosciuto acceso e uno sconosciuto …
    // Asserzioni: il nome dell'istituto compare; compare la data di scadenza;
    // compaiono i due conti; l'interruttore del primo risulta acceso.
  })
})
```

Completa il terzo test con i dati finti che ti servono: nessun IBAN reale, solo forme mascherate inventate.

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/settings/__tests__/ConnessioniBancarie.test.tsx
```

Atteso: FAIL con `Failed to resolve import "../ConnessioniBancarie"`.

- [ ] **Step 3: Scrivi il componente**

Struttura, senza collegamento:

- una `Card` con bordo tratteggiato, titolo «Open Banking», una riga che spiega cosa fa, e un `Button` «Collega la banca» che apre il wizard (Task 5, per ora un `onCollega` passato come prop o uno stato locale che aprirà il dialogo).

Con un collegamento:

- intestazione con il nome dell'istituto, lo stato tradotto (`stato.nome`, con `stato.spiegazione` sotto se non è «Collegata»), e la scadenza: «il consenso scade il … (fra N giorni)». Se mancano quattordici giorni o meno, un `Alert` con il pulsante «Rinnova».
- l'elenco dei conti. Per ognuno: la forma mascherata dell'IBAN, l'intestatario se c'è, e a seconda del `tipo`:
  - `riconosciuto` / `gia-collegato`: il nome del conto del gestionale, uno `Switch` per accendere e spegnere, e un campo data per il taglio. Sotto il campo, in piccolo: «il movimento più recente che ho per questo conto è del …», oppure «non ho movimenti per questo conto». Il campo è **obbligatorio per accendere**: se l'interruttore è acceso e la data è vuota, il pulsante di salvataggio è disabilitato e il campo è marcato.
  - `sconosciuto`: tre scelte — «crea un conto nuovo», «abbina a…» con un elenco dei conti bancari della sede, «ignora».
  - `ignorato`: la riga in grigio, con un pulsante «riprendi in considerazione» che lo toglie dagli ignorati.
- in fondo: «Salva», e un pulsante secondario «Aggiorna dalla banca» con accanto, in piccolo, da quando sono i dati (`lettiIl`) e l'avvertenza che ogni aggiornamento consuma una delle quattro letture giornaliere per conto.
- e una frase in chiaro: **nessuna sincronizzazione è attiva; i movimenti arriveranno con la fase successiva.** Meglio dirlo che lasciare qualcuno ad aspettare movimenti che nessuno sta scaricando.
- «Scollega» in fondo, dietro conferma, con scritto che i movimenti già importati restano.

Il salvataggio manda una `PUT` con un elemento per ogni conto toccato: `configura` con `attivo` per quelli con interruttore, `ignora` per quelli scartati, `lascia` per gli altri.

- [ ] **Step 4: Innesta il componente nel pannello**

In `BancheEContiClient.tsx`, sostituisci il blocco `{/* Open Banking Placeholder */}` con `{activeTab === 'BANK' && <ConnessioniBancarie />}` e togli l'import di `Wifi` se resta inutilizzato — il lint lo segnalerebbe.

- [ ] **Step 5: Lancia i test, verifica completa, commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/settings/__tests__/ConnessioniBancarie.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add src/components/settings/
git commit -m "feat(open-banking): il pannello delle connessioni al posto della card Coming Soon"
```

---

## Task 5: Il wizard di collegamento

Il dialogo a passi che porta l'amministratore fino alla banca. Segui il modo dei dialoghi già presenti — `src/components/prima-nota/movimenti/CaricaMovimentiDialog.tsx` tiene il passo corrente in un `useState<Step>` dentro un `Dialog`.

**Il viaggio in banca azzera la memoria del browser**: dopo la conferma si naviga via, e al ritorno il pannello riparte dalla riga della connessione. Il wizard non deve tentare di conservare nulla attraverso quel salto.

**Files:**
- Create: `src/components/settings/WizardCollegamento.tsx`
- Modify: `src/components/settings/ConnessioniBancarie.tsx` (lo apre)
- Test: `src/components/settings/__tests__/WizardCollegamento.test.tsx`

**Interfaces:**
- Consumes: `GET /api/gocardless/istituzioni`, `POST /api/gocardless/collegamenti`
- Produces: `export function WizardCollegamento({ aperto, onChiudi }: { aperto: boolean; onChiudi: () => void })`

- [ ] **Step 1: Scrivi il test che fallisce**

Due comportamenti che contano:

```tsx
it('cerca fra le banche e mostra i due numeri che contano', async () => {
  // stub di GET /api/gocardless/istituzioni con due banche finte
  // digitando «marca» resta solo quella; per ognuna compaiono i giorni di
  // storico e quelli di accesso
})

// Il collegamento è irreversibile senza una nuova autenticazione: non deve
// partire da un clic solo.
it('non manda alla banca senza una conferma esplicita', async () => {
  // scelto l'istituto, la POST non parte finché non si conferma nel passo
  // successivo
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

- [ ] **Step 3: Scrivi il componente**

Tre passi in un `Dialog`:

1. **Scegli l'istituto.** Un `Input` di ricerca che filtra l'elenco caricato una volta all'apertura. Per ognuna: nome, e in piccolo «N giorni di storico · accesso valido N giorni».
2. **Conferma.** Ricapitola cosa si sta per concedere — l'istituto, i giorni di storico, la durata dell'accesso, e che i permessi richiesti sono saldi, dettagli e movimenti. Un `Button` «Vai alla banca».
3. **In viaggio.** Alla conferma si chiama `POST /api/gocardless/collegamenti`; con il link si fa `window.location.href = link`. Se la risposta è 409 si mostra il messaggio del server — esiste già un collegamento — e si invita a scollegare prima. Se è 503, che le chiavi non sono configurate. Il traduttore delle risposte esiste apposta: mostra il messaggio che arriva, non uno inventato dal client.

- [ ] **Step 4: Lancia i test, verifica completa, commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/settings/__tests__/WizardCollegamento.test.tsx
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add src/components/settings/
git commit -m "feat(open-banking): il wizard che porta alla banca"
```

---

## Task 6: Il banner di scadenza

Quattordici giorni prima della scadenza, in cima alla dashboard: quanti giorni mancano e il pulsante di rinnovo. Sparisce da solo quando il consenso torna fresco.

**Segui l'idioma del file in cui entra**: `DashboardClient.tsx` usa `useQuery` di `@tanstack/react-query`. Qui sì, quindi.

**Files:**
- Create: `src/components/dashboard/BannerConsenso.tsx`
- Modify: `src/app/(dashboard)/DashboardClient.tsx`
- Test: `src/components/dashboard/__tests__/BannerConsenso.test.tsx`

**Interfaces:**
- Consumes: `GET /api/gocardless/collegamenti`
- Produces: `export function BannerConsenso()`

- [ ] **Step 1: Scrivi il test che fallisce**

```tsx
it('non mostra nulla senza collegamento', async () => { /* connessione: null → il banner non rende niente */ })
it('non mostra nulla se mancano più di quattordici giorni', async () => { /* scadenza fra 30 giorni */ })
it('avvisa quando mancano quattordici giorni o meno, dicendo quanti', async () => { /* scadenza fra 5 giorni → compare «5 giorni» */ })
it('avvisa in modo diverso quando è già scaduto', async () => { /* scadenza passata → il testo non dice «fra -3 giorni» */ })
```

L'ultimo è quello che si dimentica: una sottrazione fra date, senza un ramo per il passato, produce «fra -3 giorni».

- [ ] **Step 2: Lancia il test e verifica che fallisca**

- [ ] **Step 3: Scrivi il componente**

Un `Alert` con l'icona d'avviso, il testo, e un `Button` che porta a `/impostazioni/banche-e-conti`. Il rinnovo vero sta nel pannello: il banner **non** chiama la rotta di rinnovo, porta dove si può farlo. Un pulsante che manda alla banca da una dashboard, magari con un clic distratto, è troppo per un avviso.

Non renderizzare nulla — non un contenitore vuoto — quando non c'è niente da dire.

- [ ] **Step 4: Innesta il banner**

In `DashboardClient.tsx`, `<BannerConsenso />` come primo elemento del contenuto. Solo per gli amministratori: se il componente non ha modo di saperlo, la rotta risponde comunque 403 agli altri e il banner resta muto — verificalo, e se produce un errore in console per gli altri ruoli, mettici una guardia.

- [ ] **Step 5: Verifica completa e commit**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit && npm run lint && npx vitest run && npm run test:integration
```

```bash
git add src/components/dashboard/ "src/app/(dashboard)/DashboardClient.tsx"
git commit -m "feat(open-banking): il banner che avvisa prima che il consenso scada"
```

---

## Dopo il piano: cosa resta

1. **La Fase 3.** Il cron di sincronizzazione sui soli conti accesi, il contatore anti-rate-limit che deve contare **le chiamate HTTP reali** (nel caso peggiore una sola sincronizzazione ne consuma sei, su un contingente di quattro), e `syncCutoffDate` che va davvero letto per calcolare `date_from`: esiste, è documentato e ancora nessuno lo usa.
2. **Riassegnare un conto della banca a un altro conto del gestionale** produce un 500: `providerAccountId` è unico globale e la violazione non è tradotta. Chiuderlo come il 409 di questo piano.
3. **La stabilità degli identificativi dei movimenti** resta non verificata: serve un secondo `--step=fetch` della sonda a distanza di giorni, poi `--step=report`.
4. **Il rilascio in produzione** di tutto quanto: le migrazioni non sono mai state applicate fuori dal locale, e il backfill della Fase 1 non ha mai visto dati veri.

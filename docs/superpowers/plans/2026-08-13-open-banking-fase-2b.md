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
- **Segui l'idioma locale per caricare i dati.** `BancheEContiClient.tsx` **legge** con `useQuery` di `@tanstack/react-query` (`refetchOnMount: 'always'`, `staleTime: 0`) e **scrive** con `fetch` nudo più `toast` di `sonner`. Ogni pezzo nuovo che entra in quel file segue lo stesso taglio, e non ne importa un terzo.
- **`@testing-library/react` non è importabile in questo progetto.** È in `devDependencies` ma il suo peer `@testing-library/dom` no, e il solo import fa fallire la suite prima che venga eseguita. I test dei componenti montano con l'API di React 19 (`createRoot` + `act`) usando gli aiutanti di `src/components/scadenzario/__tests__/render-helpers.tsx` — che stubbano anche le API DOM che Radix usa e jsdom non implementa, e forniscono il `QueryClientProvider` che i componenti con `useQuery` danno per scontato. Riusali importandoli da lì: due copie di quel file esistono già, la terza sarebbe quella di troppo.
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
- Create: `src/lib/gocardless/maschere.ts`
- Test: `src/app/api/gocardless/collegamenti/[id]/conti/__tests__/conti.itest.ts` (esistente, si estende)
- Test: `src/lib/gocardless/__tests__/abbinamento.test.ts` (esistente, si estende)
- Test: `src/lib/gocardless/__tests__/maschere.test.ts`

**Interfaces:**
- Consumes: `abbinaConti`, `descriviStato`, `eCollegata`, `clientDaAmbiente`, `rispostaErroreGoCardless`
- Produces:
  - campo Prisma `contiLetti Json?` su `BankConnection`
  - `interface ContoConservato { providerAccountId: string; ibanHash: string | null; ibanMascherato: string | null; intestatario: string | null; valuta: string | null }`
  - `mascheraIban(iban: string): string` in `src/lib/gocardless/maschere.ts`
  - `GET /api/gocardless/collegamenti/[id]/conti[?aggiorna=1]` → `200 { stato, conti: Array<EsitoAbbinamento & { ibanMascherato: string | null; ultimoMovimento: string | null; syncEnabled: boolean; syncCutoffDate: string | null }>, lettiIl: string | null }`

  `ibanMascherato` sta **accanto** a `EsitoAbbinamento`, non dentro `conto`: è
  ciò che il pannello mostra, e sul percorso normale — quello che rilegge dalla
  memoria — `conto.iban` è `null`. Senza questo campo l'amministratore vedrebbe
  un elenco di conti che non riesce a distinguere l'uno dall'altro.
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
        // Si conserva `letti`, non `contiBanca`: la colonna deve contenere la
        // forma con `ibanMascherato`, che è quella che `leggiConservati` sa
        // rileggere. Scrivendoci `contiBanca` la validazione fallirebbe al giro
        // successivo e la memoria non funzionerebbe mai — cioè il punto del task.
        data: { contiLetti: letti as unknown as Prisma.InputJsonValue, contiLettiIl: new Date() },
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

La forma mascherata non entra in `ContoDaBanca` — l'abbinamento non se ne fa niente — ma va nella risposta della rotta accanto a ogni conto, perché è ciò che il pannello mostra.

`mascheraIban` sta in un file suo, `src/lib/gocardless/maschere.ts`, così è provata da sola:

```ts
/**
 * L'IBAN in una forma che si può mostrare a schermo e scrivere in un log senza
 * consegnarlo: le prime due lettere del paese e le ultime quattro cifre, che
 * bastano a distinguere un conto dall'altro e non bastano a disporne.
 */
export function mascheraIban(iban: string): string {
  const pulito = iban.replace(/\s+/g, '').toUpperCase()
  if (pulito.length < 8) return '••••'
  return `${pulito.slice(0, 2)}•• •••• ${pulito.slice(-4)}`
}
```

con il suo test in `src/lib/gocardless/__tests__/maschere.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mascheraIban } from '../maschere'

describe('mascheraIban', () => {
  it('tiene il paese e le ultime quattro cifre', () => {
    expect(mascheraIban('IT60X0542811101000000123456')).toBe('IT•• •••• 3456')
  })

  it('ignora gli spazi con cui le banche stampano gli IBAN', () => {
    expect(mascheraIban('it60 x054 2811 1010 0000 0123 456')).toBe('IT•• •••• 3456')
  })

  // Un IBAN troppo corto è un dato sbagliato, non un motivo per mostrarlo
  // intero: nel dubbio non si consegna nulla.
  it('non lascia trapelare nulla di un valore troppo corto', () => {
    expect(mascheraIban('IT60X')).toBe('••••')
  })
})
```

La maschera si porta nella risposta unendo l'elenco conservato all'esito dell'abbinamento sul `providerAccountId`. `contiBanca` e `conservati` hanno gli stessi elementi nello stesso ordine, ma l'unione va fatta per chiave e non per posizione: l'abbinamento restituisce un esito per conto e nulla garantisce che l'ordine sopravviva a una modifica futura.

```ts
    // `conservati` è null sul percorso di aggiornamento, dove le maschere sono
    // in `letti`: si prende quello che c'è, e in entrambi i casi si indicizza.
    const maschere = new Map((conservati ?? letti).map((c) => [c.providerAccountId, c.ibanMascherato]))
```

Perché `letti` sia in portata anche qui, dichiaralo fuori dal ramo (`let letti: ContoConservato[] = []`) invece che dentro.

`leggiConservati` valida la colonna con uno schema zod e restituisce `null` se la forma non torna: una colonna JSON scritta da una versione precedente del codice non deve far esplodere il pannello.

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

**La corsa va costruita, non evocata.** Creare la riga concorrente prima di chiamare la rotta non dimostra nulla: la fermerebbe il controllo applicativo, il test passerebbe verde e la traduzione del `P2002` resterebbe non provata. Perché la corsa sia vera, la riga deve nascere **dopo** il controllo e **prima** della `create` — e in mezzo la rotta chiama `creaAgreement`. Quello è il punto in cui infilarla.

Estendi `clientFinto` con un aggancio (nello stesso file di test):

```ts
function clientFinto(opzioni: {
  fallisceRequisition?: boolean
  accessValidForDaysConcessi?: number
  /**
   * Eseguito dentro `creaAgreement`, cioè dopo che il controllo applicativo è
   * passato e prima che la riga venga creata: è l'unico punto in cui inserire
   * un concorrente produce una corsa vera invece di un test che si ferma
   * prima e passa per il motivo sbagliato.
   */
  duranteAgreement?: () => Promise<void>
} = {}) {
```

e dentro `creaAgreement`, subito dopo `chiamate.push('agreement')`:

```ts
      if (opzioni.duranteAgreement) await opzioni.duranteAgreement()
```

Poi il test:

```ts
  // Il controllo applicativo legge e poi scrive: due richieste concorrenti lo
  // superano entrambe. L'indice unico parziale è la rete, e la sua violazione
  // deve arrivare all'amministratore come il 409 che già conosce, non come un
  // errore interno.
  it('traduce la violazione dell indice in un 409, non in un 500', async () => {
    await entraCome('admin')
    const venue = await venueDiTest()
    const { client } = clientFinto({
      duranteAgreement: async () => {
        await prisma.bankConnection.create({
          data: {
            venueId: venue.id,
            institutionId: 'ALTRA_BANCA',
            institutionName: 'Altra Banca',
            requisitionId: 'req-corsa',
            status: 'CR',
          },
        })
      },
    })
    impostaClientPerTest(client)

    const esito = await callRoute(
      creaCollegamento,
      jsonRequest('http://localhost/api/gocardless/collegamenti', { method: 'POST', body: { istitutoId: 'BANCA_FINTA_XXXX' } })
    )

    expect(esito.status).toBe(409)
    expect(esito.body.error).toContain('collegamento')
  })
```

La `create` della rotta sta nel `try` esterno, quindi senza la traduzione il `P2002` finisce a `rispostaErroreGoCardless` e diventa un 500: è esattamente il rosso che devi vedere.

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
    // NON `errore.meta?.target`: questo progetto usa l'adapter driver Postgres,
    // dove quel campo non esiste — il meta vero annida tutto sotto
    // `driverAdapterError.cause` e il nome del vincolo compare solo dentro
    // `originalMessage`. La forma «da manuale» non riconosce nulla e lascia
    // passare un 500 anonimo. Si cerca quindi nel meta serializzato, e per il
    // nome preciso dell'indice invece che per la tabella.
    JSON.stringify(errore.meta ?? '').includes('ux_bank_connections_sede_viva')
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

**Segui l'idioma del file in cui entra.** `BancheEContiClient.tsx` legge con `useQuery` di TanStack Query (`refetchOnMount: 'always'`, `staleTime: 0`) e scrive con `fetch` nudo più `toast` di `sonner`. Fai lo stesso: niente `useEffect` che carica a mano, niente `useMutation`.

**Non chiedere mai un aggiornamento forzato al montaggio.** La rotta ora ricorda, quindi una `GET` normale non costa chiamate alla banca — ma `?aggiorna=1` sì, una per conto su quattro al giorno. Quel bottone è un gesto esplicito.

**Tre limiti delle rotte che il pannello deve rispettare invece di aggirare**, perché scriverlo contro rotte immaginarie è il modo più veloce di perdere un giorno:

1. **La `PUT` non crea conti.** `configura` esige il `bankAccountId` di un conto che esiste già. Per un conto della banca che il gestionale non conosce le scelte sono quindi **due** — abbinalo a un conto esistente, oppure ignoralo — con accanto la strada per la terza: il pulsante «Nuovo conto» sta nella stessa pagina, sopra questo pannello.
2. **Riprendere un conto ignorato non è un'azione a sé.** La `PUT` toglie un conto dagli ignorati come effetto dell'abbinarlo (`ignorati.delete` sul ramo `configura`). La riga di un conto ignorato mostra quindi lo stesso elenco di abbinamento, in grigio, e dice a chiare lettere che resta ignorato finché non lo si abbina.
3. **`configura` vuole la data di taglio sempre**, anche a interruttore spento: è la data con cui il conto ripartirà quando lo si riaccende. Quindi «Salva» è disabilitato se una qualunque riga configurata ha la data vuota — non solo quelle accese.

**I conti del gestionale arrivano dal genitore, non da una seconda lettura.** `BancheEContiClient` calcola già `filteredAccounts`, che quando la scheda attiva è `BANK` sono esattamente i conti bancari della sede. Passarli come prop evita una chiamata in più e, soprattutto, evita la trappola che ha già morso due volte in questa integrazione: `bank_accounts` contiene anche le **casse**, e una lettura fatta qui senza filtrare `accountType` offrirebbe una cassa come destinazione di movimenti bancari.

**Files:**
- Create: `src/components/settings/ConnessioniBancarie.tsx`
- Create: `src/components/settings/RigaContoBancario.tsx`
- Modify: `src/components/settings/BancheEContiClient.tsx` (la card «Coming Soon» lascia il posto al componente)
- Test: `src/components/settings/__tests__/ConnessioniBancarie.test.tsx`

**Interfaces:**
- Consumes: `GET /api/gocardless/collegamenti`, `GET /api/gocardless/collegamenti/[id]/conti`, la sua `PUT`, `DELETE /api/gocardless/collegamenti/[id]`, `POST /api/gocardless/collegamenti/[id]/rinnovo` (Task 2), `formatDateShort` da `@/lib/constants`
- Produces:
  - `export function ConnessioniBancarie(props: { contiBancari: ContoBancarioDelGestionale[] })`
  - `export interface ContoBancarioDelGestionale { id: string; name: string }`
  - `export type ContoInPannello`, `export type Scelta` (definiti sotto, consumati da `RigaContoBancario`)
  - `export function RigaContoBancario(props: { conto: ContoInPannello; scelta: Scelta; contiBancari: ContoBancarioDelGestionale[]; onCambia: (s: Scelta) => void })`

- [ ] **Step 1: Scrivi il test che fallisce**

**`@testing-library/react` non si può importare in questo progetto.** È in `devDependencies` ma il suo peer `@testing-library/dom` no, e importarlo fa fallire la suite prima di eseguirla. I test dei componenti montano con l'API di React 19 (`createRoot` + `act`) tramite gli aiutanti in `src/components/scadenzario/__tests__/render-helpers.tsx`, che stubbano anche le API DOM che Radix usa e jsdom non ha, e avvolgono il montaggio in un `QueryClientProvider` — che qui serve, perché il componente usa `useQuery`.

Riusa quel file invece di farne una terza copia: ne esistono già due, e la terza sarebbe la copia di troppo.

Crea `src/components/settings/__tests__/ConnessioniBancarie.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { ConnessioniBancarie } from '../ConnessioniBancarie'
// Gli aiutanti vivono nella cartella di prova dello scadenzario: montano con
// `createRoot` + `act`, stubbano ciò che Radix usa e jsdom non ha, e forniscono
// il QueryClientProvider. Importarli di là evita una terza copia dello stesso file.
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
  cliccare,
  scrivere,
  perTesto,
  perId,
  testoDellaPagina,
} from '@/components/scadenzario/__tests__/render-helpers'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
  vi.unstubAllGlobals()
})

/** Gli indirizzi chiamati, nell'ordine, per poter interrogare il traffico. */
let chiamate: string[] = []

/**
 * Un `fetch` finto che risponde per prefisso di indirizzo. Nessun IBAN vero
 * qui dentro: le forme mascherate sono inventate.
 */
function stubFetch(risposte: Array<[string, unknown]>) {
  chiamate = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const indirizzo = String(url)
      chiamate.push(indirizzo)
      const trovata = risposte.find(([prefisso]) => indirizzo.startsWith(prefisso))
      return new Response(JSON.stringify(trovata ? trovata[1] : {}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  )
}

const CONTI_DEL_GESTIONALE = [
  { id: 'ba-1', name: 'Banca della Marca — ordinario' },
  { id: 'ba-2', name: 'Banca della Marca — secondo' },
]

const COLLEGAMENTO = {
  connessione: {
    id: 'conn-1',
    istitutoNome: 'Banca della Marca',
    stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
    scadeIl: '2026-12-01T00:00:00.000Z',
  },
}

const CONTI = {
  stato: { sigla: 'LN', nome: 'Collegata', spiegazione: 'Il consenso è attivo.' },
  lettiIl: '2026-08-13T08:00:00.000Z',
  conti: [
    {
      tipo: 'riconosciuto',
      bankAccountId: 'ba-1',
      nomeConto: 'Banca della Marca — ordinario',
      conto: { providerAccountId: 'acc-1', iban: null, ibanHash: 'h1', intestatario: 'WEISS SRL', valuta: 'EUR' },
      ibanMascherato: 'IT•• •••• 1111',
      ultimoMovimento: '2026-07-31T00:00:00.000Z',
      syncEnabled: true,
      syncCutoffDate: '2026-08-01',
    },
    {
      tipo: 'sconosciuto',
      conto: { providerAccountId: 'acc-2', iban: null, ibanHash: 'h2', intestatario: null, valuta: 'EUR' },
      ibanMascherato: 'IT•• •••• 2222',
      ultimoMovimento: null,
      syncEnabled: false,
      syncCutoffDate: null,
    },
  ],
}

/** Gli interruttori a schermo, nell'ordine in cui compaiono. */
function interruttori(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="switch"]'))
}

describe('ConnessioniBancarie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('senza collegamento invita a collegarne uno', async () => {
    stubFetch([['/api/gocardless/collegamenti', { connessione: null }]])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()

    expect(perTesto(/collega la banca/i)).toBeTruthy()
  })

  // Una lettura forzata costa una chiamata per conto su un contingente di
  // quattro al giorno: quattro aperture del pannello lo esaurirebbero, e la
  // quinta non mostrerebbe nulla. L'aggiornamento è un gesto, non un effetto
  // del montaggio.
  it('al montaggio non chiede mai un aggiornamento forzato', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()

    expect(chiamate.length).toBeGreaterThan(0)
    expect(chiamate.some((u) => u.includes('aggiorna=1'))).toBe(false)
  })

  it('con un collegamento mostra istituto, scadenza e conti', async () => {
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', CONTI],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()

    const testo = testoDellaPagina()
    expect(testo).toContain('Banca della Marca')
    expect(testo).toContain('01/12/2026')
    expect(testo).toContain('IT•• •••• 1111')
    expect(testo).toContain('IT•• •••• 2222')

    // Il conto già acceso deve risultare acceso: se il pannello ripartisse
    // spento, salvare lo spegnerebbe senza che nessuno l'abbia chiesto.
    expect(interruttori()[0]?.getAttribute('data-state')).toBe('checked')
  })

  // `configura` esige la data di taglio anche a interruttore spento, ed è
  // l'unica cosa che impedisce a un movimento già importato via CSV di
  // entrare una seconda volta.
  //
  // Le due asserzioni servono **entrambe**: «Salva» è disabilitato anche
  // quando non è cambiato nulla, quindi la prima da sola passerebbe pure se il
  // clic sull'interruttore non avesse alcun effetto. È la seconda — riempita
  // la data, il pulsante si accende — a dimostrare che il clic è arrivato e
  // che era la data a tenerlo chiuso.
  it('senza data di taglio non lascia salvare, con la data sì', async () => {
    const contiSenzaData = {
      ...CONTI,
      conti: [{ ...CONTI.conti[0], syncEnabled: false, syncCutoffDate: null }],
    }
    stubFetch([
      ['/api/gocardless/collegamenti/conn-1/conti', contiSenzaData],
      ['/api/gocardless/collegamenti', COLLEGAMENTO],
    ])

    await montare(<ConnessioniBancarie contiBancari={CONTI_DEL_GESTIONALE} />)
    await attendere()

    await cliccare(interruttori()[0])
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(true)

    await scrivere(perId('taglio-acc-1'), '2026-08-01')
    expect((perTesto(/^salva$/i) as HTMLButtonElement).disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/settings/__tests__/ConnessioniBancarie.test.tsx
```

Atteso: FAIL con `Failed to resolve import "../ConnessioniBancarie"`.

- [ ] **Step 3: Scrivi la riga di un conto**

Crea `src/components/settings/RigaContoBancario.tsx`:

```tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateShort } from '@/lib/constants'
import type { ContoBancarioDelGestionale, ContoInPannello, Scelta } from './ConnessioniBancarie'

interface Props {
  conto: ContoInPannello
  scelta: Scelta
  contiBancari: ContoBancarioDelGestionale[]
  onCambia: (scelta: Scelta) => void
}

/**
 * Da quando partirebbero i movimenti, detto in modo che si capisca perché la
 * data serve: il rischio è importare due volte ciò che è già entrato via CSV.
 */
function riferimento(ultimoMovimento: string | null): string {
  return ultimoMovimento
    ? `Il movimento più recente che ho per questo conto è del ${formatDateShort(ultimoMovimento)}.`
    : 'Non ho ancora movimenti per questo conto.'
}

export function RigaContoBancario({ conto, scelta, contiBancari, onCambia }: Props) {
  const etichetta = conto.ibanMascherato ?? conto.conto.providerAccountId
  const abbinato = conto.tipo === 'riconosciuto' || conto.tipo === 'gia-collegato'
  // `&& scelta.azione !== 'configura'` è la via d'uscita, ed è la stessa che ha
  // il ramo del conto sconosciuto poco più sotto. Senza, una volta scelto il
  // conto a cui riabbinarlo la riga resta bloccata sull'elenco e non mostra mai
  // il campo della data: `dataTaglio` resta vuota per sempre e, siccome
  // `senzaData` guarda tutte le voci in sospeso, quella riga disabilita «Salva»
  // per l'intero pannello. Il flusso di ripresa esiste a schermo e non si
  // completa.
  const ignorato =
    (conto.tipo === 'ignorato' && scelta.azione !== 'configura') || scelta.azione === 'ignora'

  const idConto = scelta.azione === 'configura' ? scelta.bankAccountId : abbinato ? conto.bankAccountId : ''
  const dataTaglio = scelta.azione === 'configura' ? scelta.dataTaglio : (conto.syncCutoffDate ?? '')
  const acceso = scelta.azione === 'configura' ? scelta.attivo : conto.syncEnabled

  const intestazione = (
    <div className="min-w-0">
      <p className="font-mono text-sm">{etichetta}</p>
      {conto.conto.intestatario && (
        <p className="truncate text-xs text-muted-foreground">{conto.conto.intestatario}</p>
      )}
    </div>
  )

  if (ignorato) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3 opacity-70">
        <div className="flex items-center justify-between gap-3">
          {intestazione}
          <Badge variant="outline" className="text-xs">Ignorato</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Resta ignorato finché non lo abbini a un conto: abbinarlo è ciò che lo riprende.
        </p>
        <Select value={idConto || undefined} onValueChange={(id) => onCambia({ azione: 'configura', bankAccountId: id, dataTaglio: '', attivo: false })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Abbina a un conto…" /></SelectTrigger>
          <SelectContent>
            {contiBancari.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (!abbinato && scelta.azione !== 'configura') {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          {intestazione}
          <Badge variant="outline" className="text-xs">Non riconosciuto</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Questo conto non corrisponde a nessuno di quelli registrati. Abbinalo, oppure ignoralo se
          non riguarda l&apos;attività. Se manca, crealo con «Nuovo conto» qui sopra e poi torna qui.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(id) => onCambia({ azione: 'configura', bankAccountId: id, dataTaglio: '', attivo: true })}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Abbina a un conto…" /></SelectTrigger>
            <SelectContent>
              {contiBancari.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => onCambia({ azione: 'ignora' })}>
            Ignora
          </Button>
        </div>
      </div>
    )
  }

  const nome = abbinato ? conto.nomeConto : contiBancari.find((c) => c.id === idConto)?.name
  const idCampoData = `taglio-${conto.conto.providerAccountId}`

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        {intestazione}
        <div className="flex items-center gap-2">
          {nome && <span className="hidden text-sm text-muted-foreground sm:inline">{nome}</span>}
          <Switch
            checked={acceso}
            aria-label={`Importa i movimenti di ${etichetta}`}
            onCheckedChange={(valore) =>
              onCambia({ azione: 'configura', bankAccountId: idConto, dataTaglio, attivo: valore })
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={idCampoData} className="text-xs">Importa i movimenti a partire dal</Label>
        <Input
          id={idCampoData}
          type="date"
          value={dataTaglio}
          aria-invalid={scelta.azione === 'configura' && !scelta.dataTaglio}
          onChange={(e) =>
            onCambia({ azione: 'configura', bankAccountId: idConto, dataTaglio: e.target.value, attivo: acceso })
          }
        />
        <p className="text-xs text-muted-foreground">{riferimento(conto.ultimoMovimento)}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Scrivi il pannello**

Crea `src/components/settings/ConnessioniBancarie.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Wifi } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort } from '@/lib/constants'
import { RigaContoBancario } from './RigaContoBancario'

export interface ContoBancarioDelGestionale {
  id: string
  name: string
}

interface StatoRequisition {
  sigla: string
  nome: string
  spiegazione: string
}

interface Connessione {
  id: string
  istitutoNome: string
  stato: StatoRequisition
  scadeIl: string | null
}

interface ContoDaBanca {
  providerAccountId: string
  iban: string | null
  ibanHash: string | null
  intestatario: string | null
  valuta: string | null
}

export type ContoInPannello = (
  | { tipo: 'riconosciuto' | 'gia-collegato'; bankAccountId: string; nomeConto: string }
  | { tipo: 'sconosciuto' | 'ignorato' }
) & {
  conto: ContoDaBanca
  ibanMascherato: string | null
  ultimoMovimento: string | null
  syncEnabled: boolean
  syncCutoffDate: string | null
}

export type Scelta =
  | { azione: 'lascia' }
  | { azione: 'ignora' }
  | { azione: 'configura'; bankAccountId: string; dataTaglio: string; attivo: boolean }

interface RispostaConti {
  stato: StatoRequisition
  conti: ContoInPannello[]
  lettiIl: string | null
}

/** Quanti giorni prima della scadenza si comincia a chiedere il rinnovo. */
const PREAVVISO_GIORNI = 14

function giorniAllaScadenza(iso: string | null): number | null {
  if (!iso) return null
  const scadenza = new Date(iso)
  if (Number.isNaN(scadenza.getTime())) return null
  return Math.ceil((scadenza.getTime() - Date.now()) / 86_400_000)
}

export function ConnessioniBancarie({ contiBancari }: { contiBancari: ContoBancarioDelGestionale[] }) {
  const [scelte, setScelte] = useState<Record<string, Scelta>>({})
  const [inCorso, setInCorso] = useState<'salvataggio' | 'aggiornamento' | 'scollegamento' | null>(null)

  const { data: datiCollegamento, refetch: ricaricaCollegamento } = useQuery({
    queryKey: ['gocardless-collegamento'],
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async (): Promise<{ connessione: Connessione | null }> => {
      const res = await fetch('/api/gocardless/collegamenti')
      if (!res.ok) throw new Error('Errore nel caricamento del collegamento')
      return res.json()
    },
  })

  const connessione = datiCollegamento?.connessione ?? null

  const { data: datiConti, refetch: ricaricaConti } = useQuery({
    queryKey: ['gocardless-conti', connessione?.id],
    enabled: Boolean(connessione),
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async (): Promise<RispostaConti> => {
      // Senza `aggiorna=1`: la rotta risponde dalla memoria. Chiedere alla
      // banca costa una chiamata per conto su quattro al giorno, ed è un
      // gesto che l'amministratore deve fare apposta.
      const res = await fetch(`/api/gocardless/collegamenti/${connessione!.id}/conti`)
      if (!res.ok) throw new Error('Errore nel caricamento dei conti')
      return res.json()
    },
  })

  const conti = datiConti?.conti ?? []

  // Ogni rilettura riparte da ciò che è salvato: le scelte non confermate non
  // devono sopravvivere a un aggiornamento e far salvare qualcosa che
  // l'amministratore crede di aver scartato.
  useEffect(() => {
    setScelte({})
  }, [datiConti])

  const scelta = (c: ContoInPannello): Scelta =>
    scelte[c.conto.providerAccountId] ?? { azione: 'lascia' }

  const cambia = (providerAccountId: string, nuova: Scelta) =>
    setScelte((precedenti) => ({ ...precedenti, [providerAccountId]: nuova }))

  const daSalvare = Object.entries(scelte).filter(([, s]) => s.azione !== 'lascia')
  const senzaData = daSalvare.some(([, s]) => s.azione === 'configura' && !s.dataTaglio)
  const senzaConto = daSalvare.some(([, s]) => s.azione === 'configura' && !s.bankAccountId)

  async function salva() {
    if (!connessione) return
    setInCorso('salvataggio')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}/conti`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conti: daSalvare.map(([providerAccountId, s]) =>
            s.azione === 'configura'
              ? {
                  providerAccountId,
                  azione: 'configura' as const,
                  bankAccountId: s.bankAccountId,
                  dataTaglio: s.dataTaglio,
                  attivo: s.attivo,
                }
              : { providerAccountId, azione: 'ignora' as const }
          ),
        }),
      })
      const corpo = await res.json()
      if (!res.ok) {
        toast.error(corpo.error ?? 'Salvataggio non riuscito')
        return
      }
      toast.success('Configurazione salvata')
      await ricaricaConti()
    } catch {
      toast.error('Salvataggio non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  async function aggiornaDallaBanca() {
    if (!connessione) return
    setInCorso('aggiornamento')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}/conti?aggiorna=1`)
      const corpo = await res.json()
      if (!res.ok) {
        toast.error(corpo.error ?? 'Aggiornamento non riuscito')
        return
      }
      await ricaricaConti()
      toast.success('Elenco aggiornato')
    } catch {
      toast.error('Aggiornamento non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  async function scollega() {
    if (!connessione) return
    setInCorso('scollegamento')
    try {
      const res = await fetch(`/api/gocardless/collegamenti/${connessione.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const corpo = await res.json()
        toast.error(corpo.error ?? 'Scollegamento non riuscito')
        return
      }
      toast.success('Banca scollegata')
      await ricaricaCollegamento()
    } catch {
      toast.error('Scollegamento non riuscito')
    } finally {
      setInCorso(null)
    }
  }

  if (!connessione) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <Wifi className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">Open Banking</CardTitle>
              <p className="text-sm text-muted-foreground">
                Collega l&apos;home banking per leggere i movimenti dei conti, senza più esportare
                file dalla banca.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Il wizard è il Task 5, e sostituirà questa riga: fino ad allora il
              pulsante esiste e lo dice, invece di sembrare rotto. */}
          <Button onClick={() => toast.info('Il collegamento arriva col passo successivo')}>
            Collega la banca
          </Button>
        </CardContent>
      </Card>
    )
  }

  const giorni = giorniAllaScadenza(connessione.scadeIl)
  const inScadenza = giorni !== null && giorni <= PREAVVISO_GIORNI

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{connessione.istitutoNome}</CardTitle>
            <p className="text-sm text-muted-foreground">{connessione.stato.nome}</p>
            {connessione.stato.sigla !== 'LN' && (
              <p className="text-xs text-muted-foreground">{connessione.stato.spiegazione}</p>
            )}
            {connessione.scadeIl && (
              <p className="mt-1 text-xs text-muted-foreground">
                Il consenso scade il {formatDateShort(connessione.scadeIl)}
                {giorni !== null && giorni >= 0 && ` (fra ${giorni} giorni)`}.
              </p>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={inCorso !== null}>Scollega</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Scollegare {connessione.istitutoNome}?</AlertDialogTitle>
                <AlertDialogDescription>
                  I movimenti già importati restano dove sono: si interrompe solo la lettura dalla
                  banca. Per riprenderla servirà autenticarsi di nuovo in home banking.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={scollega}>Scollega</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {inScadenza && (
          <Alert>
            <AlertTitle>Il consenso sta per scadere</AlertTitle>
            <AlertDescription>
              Alla scadenza la banca smette di rispondere. Rinnovarlo richiede solo una nuova
              autenticazione in home banking: conti, interruttori e date restano come sono.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {conti.map((c) => (
            <RigaContoBancario
              key={c.conto.providerAccountId}
              conto={c}
              scelta={scelta(c)}
              contiBancari={contiBancari}
              onCambia={(nuova) => cambia(c.conto.providerAccountId, nuova)}
            />
          ))}
        </div>

        {/* Meglio dirlo che lasciare qualcuno ad aspettare movimenti che
            nessuno sta ancora scaricando. */}
        <p className="text-xs text-muted-foreground">
          Nessuna sincronizzazione è attiva: qui si sceglie soltanto quali conti importare. I
          movimenti arriveranno con il passo successivo.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={aggiornaDallaBanca}
              disabled={inCorso !== null}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Aggiorna dalla banca
            </Button>
            <p className="text-xs text-muted-foreground">
              {datiConti?.lettiIl
                ? `Elenco del ${formatDateShort(datiConti.lettiIl)}.`
                : 'Elenco mai aggiornato.'}{' '}
              Ogni aggiornamento consuma una delle quattro letture giornaliere per conto.
            </p>
          </div>
          <Button
            onClick={salva}
            disabled={inCorso !== null || daSalvare.length === 0 || senzaData || senzaConto}
          >
            Salva
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Innesta il pannello**

In `src/components/settings/BancheEContiClient.tsx`, sostituisci l'intero blocco `{/* Open Banking Placeholder */}` — dal commento alla parentesi che chiude la `Card` — con:

```tsx
      {activeTab === 'BANK' && <ConnessioniBancarie contiBancari={filteredAccounts} />}
```

e aggiungi l'import accanto agli altri componenti locali:

```tsx
import { ConnessioniBancarie } from './ConnessioniBancarie'
```

`filteredAccounts` è già filtrato per `accountType === activeTab`, e qui `activeTab` vale `BANK`: sono i conti bancari della sede, senza casse. Poi togli dagli import `Wifi` **se non è più usato altrove nel file** — il lint segnala un import inutilizzato e la verifica fallirebbe.

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
source ~/.nvm/nvm.sh && nvm use 22 && npx vitest run src/components/settings/__tests__/ConnessioniBancarie.test.tsx
```

Atteso: 4 test verdi.

- [ ] **Step 7: Verifica completa e commit**

```bash
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

- [ ] **Step 3b: Aprilo dal pannello**

Il Task 4 ha lasciato il posto: in `ConnessioniBancarie.tsx`, nel ramo senza connessione, il pulsante «Collega la banca» chiama `toast.info('Il collegamento arriva col passo successivo')`. Sostituisci **quella riga** con uno stato locale e il wizard:

```tsx
  const [wizardAperto, setWizardAperto] = useState(false)
```

```tsx
          <Button onClick={() => setWizardAperto(true)}>Collega la banca</Button>
          <WizardCollegamento aperto={wizardAperto} onChiudi={() => setWizardAperto(false)} />
```

Se `toast` resta usato solo dai salvataggi, l'import non cambia; se non lo usa più nessuno, toglilo — il lint segnala gli import inutilizzati.

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

> **Stato del piano: ESEGUITO E IN PRODUZIONE dal 13 agosto 2026.** Tutti e sei i task sono
> costruiti, rivisti uno per uno, sottoposti a una revisione finale dell'intero branch, corretti
> e verificati. `origin/main` = `635e9b0`, deploy Railway riuscito, migrazioni applicate, le due
> tabelle nuove protette a livello di riga. Nessun movimento viene ancora scaricato: è la Fase 3.
>
> **Le voci qui sotto sono deliberatamente rimandate alla Fase 3**, per decisione del
> proprietario del 13 agosto: nessuna è bloccante, e affrontarle lì significa provarle mentre
> quel codice viene comunque esercitato, invece che alla cieca adesso.

**Chiuso — la quarta strada verso la divergenza fra ciò che il pannello mostra e ciò che c'è.** Era il punto 5 di questa lista: il controllo sulla PUT (`conti/route.ts`, ramo `configura`) confrontava solo `providerAccountId` **salvato**, e per un conto abbinato soltanto **per impronta** (mostrato «riconosciuto» dalla GET, mai passato da un «Salva») quella colonna è vuota — scegliere lo stesso conto del gestionale per un secondo conto banca passava senza un fiato, e alla lettura successiva `abbinaConti` rifaceva l'abbinamento per impronta come se nulla fosse, con l'interruttore e la data pensati per il secondo conto. Chiuso confrontando anche l'**impronta**: la PUT ora legge `leggiConservati(connessione.contiLetti)` (la stessa memoria che la GET usa per abbinare a schermo) e rifiuta con 400 se il conto del gestionale scelto ha un `ibanHash` che corrisponde a un conto della banca *diverso* da quello che si sta salvando, nominando nel messaggio la forma mascherata del conto con cui fa coppia. Tre casi restano permessi apposta: risalvare lo stesso abbinamento (la corrispondenza è proprio quella che si sta scrivendo), un conto del gestionale senza IBAN (non corrisponde a niente), e la memoria non ancora scritta (niente con cui confrontare — il controllo si salta, non rifiuta tutto). Cinque test in `conti.itest.ts` coprono il rifiuto e i quattro casi che dovevano continuare a passare. Chi tocca la Fase 3 e si chiede perché la convalida guardi `ibanHash` e non solo la colonna: è questo — senza, la sincronizzazione sposterebbe movimenti veri sul conto sbagliato mentre il pannello continuerebbe a mostrare quello giusto, un errore silenzioso scopribile solo guardando i movimenti importati.

1. **La Fase 3.** Il cron di sincronizzazione sui soli conti accesi, il contatore anti-rate-limit che deve contare **le chiamate HTTP reali** (nel caso peggiore una sola sincronizzazione ne consuma sei, su un contingente di quattro), e `syncCutoffDate` che va davvero letto per calcolare `date_from`: esiste, è documentato e ancora nessuno lo usa.
2. **Riassegnare un conto della banca a un altro conto del gestionale** produce un 500: `providerAccountId` è unico globale e la violazione non è tradotta. Chiuderlo come il 409 di questo piano.
3. **La stabilità degli identificativi dei movimenti** resta non verificata: serve un secondo `--step=fetch` della sonda a distanza di giorni, poi `--step=report`.
4. **Il rilascio in produzione** di tutto quanto: le migrazioni non sono mai state applicate fuori dal locale, e il backfill della Fase 1 non ha mai visto dati veri.
5. **Il ritorno dal wizard col tasto «Indietro» del browser lascia il pannello inerte.** Dopo aver seguito il link verso la banca e essere tornati (o aver semplicemente premuto Indietro prima di completare l'autenticazione), il pannello può ripresentarsi con i quattro pulsanti (Scollega, Rinnova, Aggiorna dalla banca, Salva) tutti presenti ma nessuno che porta a un esito diverso da dove si era già, finché non si ricarica la pagina a mano.
6. **«Mostra archiviati» smonta ancora il sottoalbero e perde le scelte non salvate.** Il fix di I1 (`isPending` invece di `isFetching`) risolve la rilettura in sottofondo di una chiave già in cache, ma la **prima** volta che si accende l'interruttore la combinazione `['bank-accounts', true]` non è mai stata letta: `isPending` torna vero comunque, lo spinner sostituisce l'intero sottoalbero, `ConnessioniBancarie` si smonta e le scelte non salvate si perdono. Rimedio noto e non applicato: `placeholderData: keepPreviousData` di TanStack Query, che tiene a schermo i dati della chiave precedente mentre la nuova risolve, invece di azzerare tutto.
7. **La data di validità del consenso resta una stima ricalcolata, non il valore concesso davvero.** Sia alla creazione sia al rinnovo, l'`access_valid_for_days` richiesto è il massimo che l'istituto dichiara (`max_access_valid_for_days`); la banca può concederne meno (è il caso che un test di questo piano copre esplicitamente per la creazione). `GET .../conti`, nel punto dove scrive `accessValidUntil` al transito verso `LN`, non ha modo di sapere quanto è stato concesso **davvero** per quello specifico agreement: rilegge di nuovo il massimo dichiarato dall'istituto e ricalcola da lì, quindi la scadenza scritta sbaglia sempre per eccesso rispetto a quella vera. Conseguenza pratica: l'avviso a quattordici giorni (`PREAVVISO_GIORNI`) può scattare più tardi di quanto dovrebbe, nel caso peggiore quando il consenso è già più vicino alla scadenza reale di quanto il pannello dica. La fonte autorevole esiste ed è a una chiamata di distanza — non per conto, quindi fuori dal contingente di quattro al giorno — `GET /agreements/enduser/{agreementId}/`, che restituirebbe la durata concessa per l'agreement specifico invece del massimo dichiarato dall'istituto. Il client (`src/lib/gocardless/client.ts`) non ha ancora un metodo per leggerla.
8. **Il cricchetto delle autorizzazioni è a 258, e quell'uno è nostro.** `scripts/check-route-auth.mjs --ratchet` conta gli handler sotto `src/app/api/` che non usano `withAuth`: la baseline scritta nello script è 255, `main` era già a **257** prima di questo lavoro (due handler preesistenti, non di questa fase né di quella sulle fatture), e questa fase ne aggiunge **uno**: `GET /api/gocardless/callback`. Quella rotta non può avere `withAuth` — è il bersaglio della redirezione con cui la banca rimanda l'utente al gestionale, e con la sessione scaduta `withAuth` risponderebbe con un JSON 401, cioè testo grezzo al posto della pagina, proprio al ritorno dall'autenticazione. Non legge e non scrive nulla: prende un identificativo dalla query e rimanda a un percorso fisso dello stesso sito. **Il modo giusto di chiuderla è toglierla da sotto `/api`**: non è un'API, è una redirezione per il browser, e il conteggio guarda solo `src/app/api/`. Farlo adesso significherebbe però cambiare alla cieca il percorso di ritorno dalla banca, che si prova solo con un giro vero e costa una delle quattro chiamate giornaliere: in Fase 3 quel percorso viene comunque esercitato. **Costo di lasciarlo lì nel frattempo, che riguarda tutti:** quando il job Lint fallisce, la CI **salta il job Build** — quindi in questo momento non verifica la build di nessuno, che è proprio il controllo capace di vedere un import client→prisma, invisibile a `tsc`, ai test e a qualunque revisione del diff. I due handler alla base non sono di questa fase, ma vanno convertiti insieme al terzo perché il controllo torni a mordere.

# Ripresa — 16 agosto 2026

Documento di continuità della sessione del 16 agosto. Punto di partenza:
`main` = `c022ce6`, deploy Railway **SUCCESS**, provato in produzione
dall'utente («funziona tutto»).

---

## Parte 1 — Fatto oggi

Due difetti trovati **usando l'applicazione vera**, non leggendo il codice.
Entrambi risolti, mergiati con la PR #24 e in produzione.

### 1.1 Un movimento riconciliato non si poteva né eliminare né sganciare

**Il sintomo.** Eliminando un movimento di prima nota: «Il movimento è
riconciliato con una o più scadenze: annulla prima le riconciliazioni, poi
elimina il movimento». Ma dal movimento quell'azione non esisteva.

**La causa.** Il pulsante di annullamento viveva **solo** in
`/scadenzario/<id>` (`ScheduleReconciliationPanel`), e per arrivarci bisognava
già sapere quale scadenza cercare. In tutta la prima nota non c'era un solo
link verso lo scadenzario. Il colpo di grazia: l'API restituiva già
`{ error, scadenze: [id] }` — la UI **buttava via** quegli identificativi
(`MovimentiClient.tsx`, gestione dell'errore).

**Cosa è stato scritto.**

| Cosa | Dove |
|---|---|
| `GET /api/prima-nota/[id]/riconciliazioni` | `src/app/api/prima-nota/[id]/riconciliazioni/route.ts` |
| Dialog «Scadenze collegate» | `src/components/prima-nota/movimenti/RiconciliazioniMovimentoDialog.tsx` |
| Badge «Riconciliato (N)» cliccabile | `MovimentiTable.tsx`, colonna Documento |
| Voce «Scadenze collegate (N)» nel menù | `MovimentoRowActions.tsx` |
| Il 409 apre il dialog invece di stampare l'errore | `MovimentiClient.tsx` |
| Le riconciliazioni nel payload della lista | `src/app/api/prima-nota/route.ts` |

**L'invariante da non rompere.** L'elenco restituito dalla nuova rotta deve
coincidere **esattamente** con ciò che blocca la cancellazione: `status:
VERIFIED`, riga gemella del trasferimento compresa, scadenze soft-deleted
incluse. Se l'elenco fosse più stretto del blocco, tornerebbe il vicolo cieco
di partenza: un movimento non cancellabile e senza nulla da sganciare. È
questo che i test sorvegliano, non il funzionamento del dialog.

Lo sgancio **riusa** la `DELETE /api/scadenzario/[id]/riconciliazioni/[reconciliationId]`
già esistente: nessuna rotta duplicata.

### 1.2 La ricerca dello scadenzario si bloccava dopo una lettera

**La causa.** `schedule-filters.tsx` aveva `disabled={isLoading}` sull'input.
Digitando una lettera partiva la fetch, `isLoading` diventava `true`, e **il
browser toglie il focus a un campo disabilitato**. Ogni lettera costava un
click.

**Il rimedio.** Tolto il `disabled` (con il commento che dice perché non va
rimesso) e aggiunto `useDebounce` a 300 ms: ora parte una richiesta invece di
una per tasto. La sincronizzazione vale nei due versi — azzerare i filtri
svuota anche la casella.

### 1.3 Tre lezioni sull'infrastruttura, già in memoria

1. **Una route nuova ha tre gate in CI che il `tsc` locale non vede**: il
   cricchetto dell'autorizzazione (`scripts/check-route-auth.mjs`, baseline
   254, ogni handler con `auth()` a mano la fa fallire), `npm run
   typecheck:test` (compila i test, dove `callRoute` vuole **due** parametri di
   tipo), ed `entraCome` invece di `loginAs` nei test (gli utenti del seed
   nascono con `mustChangePassword` e `withAuth` risponde 403 finché il flag è
   alzato — con `loginAs` un test sui ruoli passa per la ragione sbagliata).
2. **Un worktree con `node_modules` in symlink non compila**: Turbopack
   risponde «Symlink [project]/node_modules is invalid, it points out of the
   filesystem root». `tsc` e `vitest` lo accettano senza fiatare, quindi il
   problema si scopre solo alla build. Nei worktree serve `npm ci` per davvero.
3. **Il branch vecchio produce fallimenti fantasma.** I 14 test rossi di
   `trasferimenti.itest.ts` («Nessun centro di costo di default configurato»)
   esistono solo su `conti/cash-flow-prospetto`, 248 commit indietro. Sulla
   base aggiornata la stessa suite è 86/86 verde.

### 1.4 Stato delle verifiche

| Controllo | Esito |
|---|---|
| `tsc --noEmit` + `typecheck:test` | puliti |
| Test unit | 1851 / 1851 |
| Integrazione (prima nota + scadenzario) | 86 / 86, incluso il nuovo file da 5 casi |
| `npm run build` (Turbopack) e `next build --webpack` | entrambe exit 0 |
| CI su PR #24 | 5 job su 5 verdi |
| Deploy Railway | SUCCESS |
| Prova sul campo | fatta dall'utente in produzione |

---

## Parte 2 — Cosa resta

### 2.1 Conseguenze dirette di questo lavoro

- **Gli altri filtri dello scadenzario sono ancora `disabled` durante il
  caricamento** (stato, tipo, priorità, origine, verifica, range date,
  ricorrenze, reset). Non fanno perdere il focus come l'input di testo, ma
  rendono la barra inerte a ogni ricarica. Verificato: nessun'altra barra di
  ricerca dell'applicazione ha quel `disabled`, quindi il difetto era unico
  dello scadenzario.
- **Nessuna ricerca tranne due ha il debounce.** `InvoiceList` e
  `payee-autocomplete` usano `useDebounce`; `MovimentiFilters`,
  `PagamentiFilters`, `CustomerFilters`, `UserFilters`,
  `SupplierManagement`, `AccountManagement` lanciano **una query per tasto**.
  Non rompono nulla, ma sono richieste sprecate su ogni lettera.
- **Il dialog «Scadenze collegate» non ha test di interfaccia.** I test coprono
  la rotta e l'invariante; il comportamento del componente (aggiornamento dopo
  l'annullamento, stato vuoto) è coperto solo dalla prova manuale.
- **Il badge «Riconciliato (N)» non compare nella vista Pagamenti** né in altre
  liste di movimenti: solo in `/prima-nota/movimenti`.

### 2.2 Il quadro più ampio (da riconfermare all'inizio della prossima sessione)

Queste voci vengono dalle note di continuità, non sono state verificate oggi.
Vanno ricontrollate prima di pianificarci sopra.

**Urgenti / rischiose**

- ⚠️ **Nessuna mail parte in produzione**: `RESEND_API_KEY` non è fra le
  variabili di `weiss-gestionale` su Railway. Recupero password e inviti
  compresi, e `sendEmail` restituisce `false` senza che nessuno se ne accorga.
- ⚠️ **RLS e tabelle nuove**: `migrate deploy` non sa nulla di RLS, quindi ogni
  tabella creata da una migrazione **nasce scoperta**. Va ripassato il ciclo
  che protegge tutte le tabelle dopo ogni migrazione con tabelle nuove.

**Riconciliazione assistita**

- La **Fase A1** (il motore propone) è mergiata, ma **il numero che decide la
  soglia non è mai stato prodotto**: mancano le fatture vere dall'altro lato.
  Serve la Fase 3.
- **Ritenuta e cassa previdenziale**: sospeso il 13 ago. CashKing tratta la
  ritenuta come *canale di saldo* con ciclo di vita proprio (F24), non come
  riga da imputare; sulla cassa previdenziale i tre competitor non dicono
  nulla.

**Fatture**

- `/fatture` **non accetta lo ZIP** anche se `zip-utils.ts` esiste: il divario
  con CashKing è la UI, non il motore (il parser è alla pari, 226/226 file veri).
- La grafia `_metaDato.xml` resta **non provata**.

**Contabilità e dati**

- **Seed delle categorie cash flow** da lanciare, e la pagina della
  riclassificazione da guardare con gli occhi.
- **`SET NOT NULL` su `cost_center_id`**: oggi a costo zero perché la tabella è
  vuota, e più caro ogni giorno che passa.

**Lavoro fermo su branch**

- **Onda 1 dell'analisi competitiva**: 15 task e 54 commit su `analisi/onda-1`,
  pronta ma **non mergiata**, e il branch è molto indietro rispetto a `main`.
- **`conti/cash-flow-prospetto`** (il branch su cui era aperta questa sessione):
  248 commit indietro, contiene 3 commit di sola documentazione. Da mergiare o
  da abbandonare — lasciarlo lì fa misurare il debito nel posto sbagliato.

---

## Parte 3 — Come si lavora, in breve

Nota operativa per chi riprende, ricavata dagli inciampi di oggi:

1. **Mai partire da un branch vecchio.** `git fetch && git rev-list
   --left-right --count origin/main...HEAD` prima di scrivere una riga: se il
   numero a sinistra è grosso, si parte da `origin/main`.
2. **La build va eseguita**, e in entrambe le forme (Turbopack e
   `--webpack`, che è quella della CI). `tsc` e i test non bastano.
3. **Mai `npm run build | tail`**: l'exit code diventa quello di `tail`.
4. `nvm use 22` va anteposto a ogni comando `npm`/`npx`, in ogni chiamata.

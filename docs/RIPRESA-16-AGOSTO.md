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

### 1.5 «I movimenti bancari non sono importati da nessuna parte» (pomeriggio)

**Il sintomo.** Collegamento GoCardless a posto, «Sincronizza ora» premuto,
pannello che dice «0 movimenti nuovi»; in *Prima nota → Movimenti → Banca*
nessun movimento. Conclusione dell'utente: la banca non ha portato nulla.

**I fatti, misurati.** La sincronizzazione ha funzionato: **231 movimenti**
PSD2 in `bank_transactions` (15/06–14/08, tutti `PENDING`), primo giro alle
09:58 UTC (233 letti, 231 nuovi, 2 duplicati), secondo alle 10:13 (2 letti,
2 duplicati, cioè «0 nuovi»). Sono tutti visibili in *Prima nota →
Riconciliazione* («su 231 totali»). Confronto con lo snapshot della Fase 0 del
12/08: **222 identificativi su 222 ritrovati identici** — la stabilità degli id,
mai verificata prima, regge. I 2 duplicati del primo giro non sono
identificabili a posteriori (l'indice li ha respinti senza lasciare traccia).

**La causa.** Nessun guasto nel motore: i movimenti scaricati sono righe
dell'estratto conto e stanno nella riconciliazione; la scheda Banca della prima
nota elenca le *scritture contabili* (in produzione: zero). Ma **nessuna
schermata lo diceva**, e tre la contraddicevano:

| Dove | Cosa diceva | Ora |
|---|---|---|
| `ConnessioniBancarie.tsx` | «Nessuna sincronizzazione è attiva… i movimenti arriveranno con il passo successivo» (residuo della Fase 2b) | «I movimenti scaricati si trovano nella Riconciliazione, non nella prima nota» |
| `StatoSincronizzazione.tsx` | solo il delta dell'ultimo giro («0 movimenti nuovi») | anche «231 movimenti importati, 231 da riconciliare» + link (`GET /api/banca/sincronizzazione` restituisce `movimentiImportati` e `daRiconciliare` per conto, una sola `groupBy`) |
| Prima nota → Banca | stato vuoto senza indicazioni | `MovimentiBancariInAttesa`: «231 movimenti dell'estratto conto aspettano nella Riconciliazione» + link (legge `/api/reconciliation/summary`) |
| `/riconciliazione` | `limit=100` senza paginazione: 131 movimenti irraggiungibili | «Pagina 1 di 3», e il cambio di scheda torna alla prima pagina |

**Cosa NON si è fatto, e perché.** Far comparire le righe di banca *dentro* la
prima nota. È l'«anello mancante» che la spec A2 (`76ca18a`, decisione 3) ha
già deciso: *approvare promuove la riga bancaria a movimento di prima nota*.
Costruirlo qui avrebbe duplicato quel disegno; l'A2 (task 2-7 del piano) è la
strada.

**Verifiche.** Unit 1870/1870, integrazione della rotta 11/11, `tsc` e
`typecheck:test` puliti, cricchetto 254, entrambe le build exit 0, prova a
occhio delle tre schermate su un DB locale con 231 movimenti finti.

### 1.6 Consegna A dell'estratto conto

Consegna A della spec
`docs/superpowers/specs/2026-08-16-movimenti-bancari-in-prima-nota-design.md`
(piano `docs/superpowers/plans/2026-08-16-estratto-conto-in-prima-nota-consegna-a.md`,
10 task di implementazione + questa verifica). Costruisce l'anello che la
1.5 di oggi pomeriggio aveva rimandato di proposito: le righe scaricate dalla
banca ora si vedono e si lavorano **dentro** la prima nota, non solo nella
Riconciliazione.

**Cosa c'è ora.** *Prima nota → Conto Bancario* si apre di default
sull'**Estratto conto** (le scritture contabili restano raggiungibili, in
una sotto-scheda «Scritture» col proprio conteggio nel selettore).

| Cosa | Dettaglio |
|---|---|
| Schede | **Attivi**, **Deleghe F24**, **CBILL-PagoPA**, **Cestino**, ciascuna col conteggio nell'etichetta |
| Totali | **Totale Entrate / Totale Uscite / Saldo Netto** del filtro attivo, non del conto |
| Colonne | Data, Descrizione, Causale (separata dal testo grezzo della banca da `separaCausale`, tabella di 20 codici), Conto Bancario, Stato, Importo; si nascondono dal menu «Colonne» e la scelta resta in `localStorage` al ricaricamento; l'ordine delle colonne è fisso |
| Ordinamento | a due stati (clic/clic/reset) su Data, Descrizione, Causale, Importo |
| Filtri | ricerca, tipo, conto, «solo non riconciliati», intervallo date — tutti nell'URL |
| Selezione | multipla, con «Seleziona tutte le N del filtro» oltre alla pagina corrente |
| Legenda | non abbinato, parziale, abbinato manualmente, riconciliato, col residuo quando c'è |
| Modifica | dialogo «Movimento» / «Cronologia modifiche»: data, data valuta, tipo e importo sono `readOnly` («dalla banca») su tutte le righe tranne quelle manuali; descrizione, causale e note si modificano sempre; la PATCH manda solo i campi cambiati; ogni modifica finisce nella cronologia con data/ora, utente e valore prima/dopo |
| Vedi dettagli | il dialogo mostra anche testo grezzo della banca, codice operazione, identificativo banca, origine (col lotto) e la cronologia in coda |
| Sposta in | Deleghe F24 / CBILL-PagoPA, riga per riga o in blocco |
| Cestino / Ripristina | il `DELETE` risponde **409** (non più 400) se la riga ha una scrittura collegata («ha una scrittura collegata: prima scollegala») |
| Nuovo movimento | crea una riga manuale: conto, data, tipo, importo, descrizione, causale, note |
| Importa CSV | col conto obbligatorio (Task 3), dentro l'Estratto conto |
| Azioni in blocco | per gli id selezionati o per l'intero filtro (rilegge l'URL lato server: «tutte le N» non dipende da cosa il client crede di avere in memoria); risposta `{ toccate, saltate }` |
| Via «Ignora» | rotta, funzione, pulsante e icona rimossi ovunque; il valore `IGNORED` resta intatto nell'enum e nel filtro di Riconciliazione |
| Via «Carica movimenti» | rotta `/api/prima-nota/import` e dialogo cancellati; anche `/riconciliazione` ha perso «Importa CSV» e il pannello di freschezza (sottotitolo nuovo: «Riconcilia i movimenti bancari con la prima nota») |
| Le tre frasi del pannello | `ConnessioniBancarie`, `StatoSincronizzazione`, `MovimentiBancariInAttesa` (il cartello ora solo sulla scheda «Tutti») puntano tutte a `/prima-nota/movimenti?register=BANK` con il link «Vai ai movimenti bancari» |

Fuori da questa consegna, di proposito: colonna Categoria, Collega/Scollega
fattura, Riconcilia, `promuoviRigaBancaria` — è la consegna B.

**Le verifiche di oggi (sessione di sera, sull'intero branch).**

| Controllo | Esito |
|---|---|
| Test unit | 153 file, **1941 / 1941** verdi |
| Test di integrazione | 83 file, **647 / 647** verdi, nessun rosso da indagare |
| `tsc --noEmit` + `typecheck:test` | puliti |
| `npm run lint` | 0 errori, 62 warning preesistenti (nessuno nuovo) |
| `npm run knip` | invariato rispetto alla baseline (163 export inutilizzati, 4 duplicati) |
| Cricchetto (`scripts/check-route-auth.mjs`) | **254 → 252** (due handler inline spariti con questa consegna: `/ignore`, `/api/prima-nota/import`) |
| `npm run build` (Turbopack) e `next build --webpack` | entrambe exit 0 |

**Dopo il deploy, due passi.**

1. `npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts --dry-run`,
   poi senza `--dry-run`, **contro la produzione**: confrontare i conteggi
   per codice con la tabella della spec (§ `separaCausale`, colonne «Codice |
   Prefisso grezzo… | Causale pulita | Esempio di descrizione risultante»).
2. Aprire `?register=BANK` in produzione e guardare le 231 righe vere, con
   gli stessi controlli della prova a occhio locale (schede, totali, colonne,
   Modifica, Sposta in, Cestino/Ripristina, selezione «tutte le 231»).

La consegna B (colonna Categoria, Collega fattura, Riconcilia) è il prossimo
piano.

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

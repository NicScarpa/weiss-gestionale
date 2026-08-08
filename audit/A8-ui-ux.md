# A8 — UI/UX, layout e responsiveness

**Ambiente:** dev server `http://localhost:3100` su DB locale isolato `weiss_audit` (confermato: seed fittizio, P.IVA `01234567890`, importi a zero — nessun dato di produzione).
**Viewport testati:** 390×844, 768×1024, 1280×800, 1920×1080. Screenshot in `audit/screenshots/` (`<pagina>__<viewport>.png`).
**Account usati:** admin@weisscafe.it e vanessa@weisscafe.it (entrambi hanno imposto il cambio password al primo login; nuove password comunicate ad A2: `Audit2026!admin`, `Audit2026!staff`).
**Dati di test creati nel DB locale:** 4 scadenze ("Fattura di prova audit UI" ×3 — vedi A8-UI-002 — e "Test toast dark" ×1).

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|------------|--------|
| A8-UI-001 | P1 | Certa | Chiusura cassa su telefono: conteggio contanti illeggibile, select meteo sovrapposti |
| A8-UI-002 | P1 | Certa | Doppio submit "Nuova Scadenza": 3 click = 3 scadenze duplicate salvate |
| A8-UI-003 | P1 | Certa | Creazione scadenza senza alcun feedback: errore silenzioso, dialog si chiude comunque |
| A8-UI-004 | P1 | Certa | Data scadenza salvata un giorno indietro rispetto a quella scelta (shift timezone) |
| A8-UI-005 | P1 | Certa | Portale: la voce "Chiusura" della bottom nav è fuori schermo a 390px |
| A8-UI-006 | P1 | Certa | /api/cashflow/summary risponde 500 e la pagina Cash Flow mostra 0,00 € senza errore |
| A8-UI-007 | P2 | Certa | Pattern trasversale: toolbar/tab che sforano fanno scrollare lateralmente quasi tutte le pagine a 390 |
| A8-UI-008 | P2 | Certa | PagamentiTable senza wrapper overflow-x: la tabella trascina l'intera pagina a 767px |
| A8-UI-009 | P2 | Certa | Sidebar icon-only senza etichette né aria-label; navigazione hover-based fragile su touch |
| A8-UI-010 | P2 | Certa | Dark mode inerte: CSS .dark completo ma nessun ThemeProvider né toggle |
| A8-UI-011 | P2 | Certa | Dialog scadenza: "Aggiungi" crea riga vuota che blocca Conferma senza spiegazione |
| A8-UI-012 | P2 | Certa | Dettaglio scadenza a 390: importi Pagato e Residuo sovrapposti |
| A8-UI-013 | P3 | Certa | Dashboard: "0" orfano renderizzato (truthy-zero in JSX) |
| A8-UI-014 | P3 | Certa | Form ferie portale: errore Zod grezzo in inglese accanto a messaggi in italiano |
| A8-UI-015 | P3 | Certa | Bottoni icon-only senza aria-label (occhio password, cestino righe scadenza, tab anagrafiche) |
| A8-UI-016 | P3 | Certa | Refusi e micro-incoerenze di copy ("Iniziana", "liquidita", empty state tagliato) |
| A8-UI-017 | P3 | Certa | Importi: input type=number con punto decimale vs visualizzazione con virgola; mono solo in chiusura |

**Non contati** (Da verificare / artefatti ambiente): logout rotto (redirect a `chrome-error://` e sessione non invalidata — probabile `AUTH_URL` ≠ porta 3100 dell'ambiente audit); errori cifratura IBAN/CF (chiave test non valida, segnalato dal lead); doppie fetch API (StrictMode dev).

---

## Finding

### [A8-UI-001] Chiusura cassa su telefono: conteggio contanti illeggibile, select meteo sovrapposti
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/components/chiusura/CashCountGrid.tsx:99; src/components/chiusura/ClosureMetadataSection.tsx:126
- **Evidenza:**
  ```tsx
  // CashCountGrid.tsx:99 — 80+1fr(min ~190px di stepper)+100 + gap ≈ 386px in un contenitore da ~214px
  <div className="grid grid-cols-[80px_1fr_100px] items-center gap-2 py-1">
  // ClosureMetadataSection.tsx:126 — nessun breakpoint mobile
  <div className="grid grid-cols-3 gap-4">
  ```
  Misure a 390×844 su `/chiusura-cassa/nuova`: `main` scrollWidth 566 vs clientWidth 326 (240px nascosti). I 14 totali per taglio (`span.text-right.font-mono`) sono renderizzati a x=382–482, cioè fuori viewport. I tre select meteo si sovrappongono fisicamente: Mattina [113–212], Pomeriggio [194–319], Sera [276–356]. Il select turno dello staff sfora (right=435 > 390). Screenshot: `chiusura-cassa-nuova__390.png`, `chiusura-cassa-nuova-contanti__390.png` (dopo scroll laterale: etichette taglio tagliate a sinistra, totali tagliati a destra — non esiste posizione di scroll che mostri la riga intera).
- **Perché è un problema:** la chiusura di cassa è il flusso quotidiano che lo staff compila spesso da telefone/tablet (il portale ha perfino una voce dedicata "Chiusura"). Chi conta i contanti a 390px non vede mai contemporaneamente taglio, quantità e totale di riga; i select meteo sono di fatto incliccabili perché uno copre l'altro.
- **Come verificarlo:** viewport 390×844 → login → `/chiusura-cassa/nuova` → osservare la sezione Meteo, poi scrollare alla sezione contanti e notare l'assenza dei totali riga.
- **Correzione proposta:** per il grid contanti usare colonne fluide con `minmax()` o layout a 2 righe sotto `sm:`; per il meteo `grid-cols-1 sm:grid-cols-3` (lo stesso file usa già questo pattern alla riga 87).
- **Effort:** S

### [A8-UI-002] Doppio submit "Nuova Scadenza": 3 click = 3 scadenze duplicate salvate
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/components/scadenzario/create-schedule-sheet.tsx:178-209,600; src/app/(dashboard)/scadenzario/page.tsx:265
- **Evidenza:**
  ```tsx
  // create-schedule-sheet.tsx:600 — l'unico guard è la prop isLoading…
  disabled={isLoading || !descrizione || !hasValidScadenze}
  // page.tsx:265 — …che il chiamante NON passa mai: resta false per sempre
  <CreateScheduleDialog onSubmit={handleCreateSchedule} />
  ```
  Riproduzione eseguita: 3 click ravvicinati su "Conferma" → 3 × `POST /api/scadenzario` tutte 200 → `GET /api/scadenzario` restituisce 3 record identici "Fattura di prova audit UI". `handleSubmit` non setta nessuno stato di submit né disabilita il bottone.
- **Perché è un problema:** su rete lenta un doppio tap crea scadenze di pagamento duplicate: il fornitore risulta da pagare due volte. È l'anti-pattern che in un gestionale contabile produce pagamenti doppi reali. Nota: nemmeno il server deduplica (3 POST identiche accettate) — segnalato per A3/A5.
- **Come verificarlo:** `/scadenzario` → Nuova Scadenza → compilare i campi minimi → cliccare Conferma 2-3 volte rapidamente → la lista mostra i duplicati.
- **Correzione proposta:** stato `isSubmitting` interno al dialog settato sincrono al primo submit (o passare davvero `isLoading` dal parent); idempotency lato API come difesa in profondità.
- **Effort:** S

### [A8-UI-003] Creazione scadenza senza alcun feedback: errore silenzioso, dialog si chiude comunque
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/scadenzario/page.tsx:168-183; src/components/scadenzario/create-schedule-sheet.tsx:205-208
- **Evidenza:**
  ```tsx
  if (resp.ok) { ... setSchedules(...) }        // nessun else: il fallimento non produce nulla
  } catch (error) { console.error('Errore creazione scadenza:', error) }
  // e nel dialog, subito dopo onSubmit: resetForm(); setOpen(false)  ← si chiude sempre
  ```
  Verificato a runtime: dopo una creazione riuscita non compare alcun toast (l'elemento `[data-sonner-toaster]` non viene mai montato sulla pagina, mentre nel portale i toast funzionano — quindi il Toaster globale c'è ma nessuno lo invoca qui). In caso di `resp.ok === false` il form si resetta e il dialog si chiude come se avesse salvato.
- **Perché è un problema:** se il salvataggio fallisce (validazione, 500), l'utente perde i dati inseriti ed è convinto di aver salvato. Combinato con A8-UI-002: chi non è sicuro riprova, e quando invece funziona crea duplicati.
- **Come verificarlo:** creare una scadenza valida → nessuna conferma visiva; per il ramo errore, creare con API spenta o payload invalido e osservare il dialog chiudersi senza messaggi (errore solo in console).
- **Correzione proposta:** `toast.success` su ok; su errore `toast.error`, non chiudere il dialog e non resettare il form; propagare il risultato di `onSubmit` al dialog.
- **Effort:** S

### [A8-UI-004] Data scadenza salvata un giorno indietro rispetto a quella scelta (shift timezone)
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/components/scadenzario/create-schedule-sheet.tsx:88,199-203 (serializzazione di `Date` locali); normalizzazione lato API da individuare (per A3/A5)
- **Evidenza:** alle 00:32 locali (CEST, UTC+2) del 6 ago il dialog mostrava Emissione/Scadenza "06/08/2026" (screenshot `scadenzario-nuova-dialog__390.png`); il record salvato ha `dataScadenza: "2026-08-05T00:00:00.000Z"` e `dataEmissione: "2026-08-05T00:00:00.000Z"` (createdAt `2026-08-05T22:32Z`); la tabella mostra "5 ago 2026 · mercoledì". Il form tiene `Date` locali (`new Date()`), la serializzazione JSON le porta in UTC e il troncamento alla parte-data produce il giorno precedente. Coerente anche il nome dell'export: `scadenzario_2026-08-05.csv` generato il 6 ago.
- **Perché è un problema:** una scadenza inserita "per oggi" nasce già scaduta ieri; tutte le scadenze create tra mezzanotte e le 2 (ora legale) slittano di un giorno. In un modulo di pagamenti le date sono il dato primario. Il progetto ha già `src/lib/timezone.ts` per le presenze, ma lo scadenzario non lo usa.
- **Come verificarlo:** con TZ Europe/Rome creare una scadenza dopo mezzanotte (o forzare `TZ=Pacific/Auckland` per vederlo di giorno) e confrontare data scelta vs `GET /api/scadenzario`.
- **Correzione proposta:** inviare la data come stringa `yyyy-MM-dd` calcolata in locale (`format(date, 'yyyy-MM-dd')`) e trattarla come data civile lato API, come già fatto nel modulo presenze.
- **Effort:** M

### [A8-UI-005] Portale: la voce "Chiusura" della bottom nav è fuori schermo a 390px
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/components/portal/PortalNavigation.tsx:53,63 (7 voci `min-w-[64px]` = 448px)
- **Evidenza:** misure a 390: nav scrollWidth 448 vs 390; item "Chiusura" (`/chiusura-cassa`) a [384–448] → 6px visibili, nessun indicatore di scroll. Screenshot `portale__390.png`, `portale-ferie__390.png` (si vedono solo 6 voci). Il commento in sidebar.tsx:139 dice esplicitamente che lo staff "può compilare la chiusura cassa": è la voce che sparisce.
- **Perché è un problema:** il portale è pensato per il telefono; su iPhone lo staff non vede né raggiunge la voce Chiusura (a meno di uno swipe fortuito sulla barra, non suggerito da nulla).
- **Come verificarlo:** login staff a 390 → `/portale` → contare le voci della barra inferiore.
- **Correzione proposta:** ridurre `min-w` con label più corte, o icona-only sotto 400px, o spostare "Chiusura" in un item "Altro"; in alternativa rendere la barra scrollabile con indicatore.
- **Effort:** S

### [A8-UI-006] /api/cashflow/summary risponde 500 e la pagina Cash Flow mostra 0,00 € senza errore
- **Severità:** P1
- **Confidenza:** Certa (sintomo); causa radice per A3/A5
- **File:** src/app/api/cashflow/summary/route.ts (route con 4 errori strict-mode in baseline; usa solo registerBalance/journal_entries, quindi NON è l'artefatto ENCRYPTION_KEY dell'ambiente); pagina src/app/(dashboard)/cash-flow/*
- **Evidenza:** a ogni load di `/cash-flow`: console `Failed to load resource: 500 /api/cashflow/summary`; `fetch('/api/cashflow/summary')` → status 500, body vuoto. La pagina mostra "Saldo Attuale 0,00 €", "Previsione 30gg 0,00 €", "Runway 0.0 mesi" come dati validi (screenshot `cash-flow__390.png`), nessun banner d'errore.
- **Perché è un problema:** una dashboard finanziaria che spaccia un errore server per "saldo zero" è peggio di una che dichiara il guasto: chi la guarda prende decisioni su numeri falsi.
- **Come verificarlo:** aprire `/cash-flow` con DevTools → Network.
- **Correzione proposta:** fixare la route (probabile mismatch di tipi sul `$queryRaw`, vedi errori strict); nella pagina distinguere stato errore da valore zero (banner + retry).
- **Effort:** M

### [A8-UI-007] Pattern trasversale a 390: toolbar e tab bar sforano e fanno scrollare lateralmente l'intera pagina
- **Severità:** P2
- **Confidenza:** Certa
- **File:** esempio-causa: src/app/(dashboard)/fatture/layout.tsx:25 (`w-fit overflow-x-auto`: il `w-fit` annulla l'overflow e il tab "Corrispettivi" resta invisibile fuori schermo)
- **Evidenza:** `main` (che è `overflow-auto`, quindi scrolla in orizzontale invece di contenere) misurato a 390: /scadenzario 731/326, /prima-nota/pagamenti 767/326, /chiusura-cassa/nuova 566/326, /scadenzario/[id] 565/326, /turni 534/326, /riconciliazione 533/326, /presenze 499/326, /scadenzario/regole 459/326, /fatture* 429/326, /prima-nota/movimenti 358/326. Sintomi visibili negli screenshot `__390.png`: bottoni azione tagliati a destra ("+ Nuovo" su movimenti, "Crea dipendente" su personale, "Nuova Pianificazione" su turni, "Nuovo Fornitore" su fornitori, "+ R…" sul dettaglio scadenza, "Export" su presenze), tab "Regole"/"Corrispettivi" tagliati, frecce data di /presenze mezze fuori.
- **Perché è un problema:** ogni pagina "balla" lateralmente al primo swipe sbagliato e le azioni primarie (i bottoni "Nuovo…") sono mezze fuori dallo schermo: attrito costante per l'uso quotidiano da telefono.
- **Come verificarlo:** viewport 390 → aprire una qualsiasi delle pagine elencate → swipe orizzontale.
- **Correzione proposta:** header di pagina con `flex-wrap` e bottoni che collassano a icona sotto `sm:`; per le tab bar togliere `w-fit` così `overflow-x-auto` funziona; audit rapido con lo snippet usato qui (scrollWidth di main).
- **Effort:** M (pattern ripetuto su ~10 pagine)

### [A8-UI-008] PagamentiTable senza wrapper overflow-x
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/components/prima-nota/pagamenti/PagamentiTable.tsx:113
- **Evidenza:**
  ```tsx
  <div className="rounded-lg border bg-background">   // manca overflow-x-auto
  ```
  A 390 la tabella (742px, 7 colonne) trascina `main` a 767px. Contro-esempi corretti nello stesso codebase: `/budget` e `/anagrafiche/personale` usano `relative w-full overflow-x-auto` e a 390 scrollano solo dentro la card. Conferma il segnale del brief (33 componenti con tabelle, 15 con overflow-x).
- **Perché è un problema:** la lista pagamenti su mobile richiede il pan dell'intera pagina; le colonne Importo/Stato/Azioni sono fuori vista.
- **Come verificarlo:** viewport 390 → `/prima-nota/pagamenti`.
- **Correzione proposta:** aggiungere `overflow-x-auto` al wrapper (una classe); passare in rassegna gli altri 18 componenti-tabella senza wrapper.
- **Effort:** S

### [A8-UI-009] Sidebar icon-only senza etichette né aria-label; navigazione hover-based fragile su touch
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/components/layout/sidebar.tsx:216-217,257-258 (`href={item.href || '#'}`, `onMouseEnter={() => setHoveredItem(...)}`)
- **Evidenza:** a ogni viewport la rail mostra 7 link senza testo, senza `aria-label`, senza `title` (verificato via DOM: tutti `aria: null, txt: ''`); la voce "Personale" è `href="#"`. I sottomenu (Riconciliazione, Chiusure Cassa, Cash Flow, Report, Presenze, ecc.) si aprono solo con `onMouseEnter`. Su touch: il tap su un'icona naviga E lascia il flyout da 256px aperto sopra il contenuto (verificato: dopo click su /fatture il flyout resta `open, w:256`), serve un secondo tap per chiuderlo. Screenshot `sidebar-flyout__390.png`.
- **Perché è un problema:** screen reader annunciano 7 link vuoti; i nuovi utenti non hanno tooltip; su telefono metà dell'app è raggiungibile solo tramite un flyout che appare/resta per effetto collaterale dell'emulazione hover.
- **Come verificarlo:** Tab sulla rail (focus su link senza nome); su viewport 390 tap su un'icona e osservare il flyout residuo.
- **Correzione proposta:** `aria-label={item.name}` + `title` sui link; per "Personale" un `<button aria-expanded>`; su touch aprire il flyout al primo tap e navigare al secondo (o menu a schermo intero sotto `md:`).
- **Effort:** M

### [A8-UI-010] Dark mode inerte: CSS pronto ma nessun modo di attivarla
- **Severità:** P2
- **Confidenza:** Certa (inerzia); Probabile (toast scuri su app chiara)
- **File:** src/app/globals.css:110 (blocco `.dark{...}` completo); package.json:80 (`next-themes`); unico consumer: src/components/ui/sonner.tsx:14
- **Evidenza:** con `prefers-color-scheme: dark` emulato, `document.documentElement.className === ""` e body resta chiaro (lab ~97.7): nessun `ThemeProvider` monta la classe, nessun toggle esiste in UI (grep `useTheme|setTheme` → solo sonner.tsx). Il Toaster passa `theme="system"` a Sonner: con OS in dark i toast seguirebbero il sistema su un'app forzatamente chiara.
- **Perché è un problema:** più che una feature mancante è debito ingannevole: ~120 righe di variabili dark mantenute e mai raggiungibili; il brief chiedeva di verificare la dark mode — non esiste un modo utente di attivarla, quindi ogni regressione lì è invisibile. Il mismatch dei toast è l'unico effetto visibile.
- **Come verificarlo:** DevTools → Rendering → emulate prefers-color-scheme: dark → l'app resta chiara; cercare un toggle tema in /impostazioni e /profilo (assente).
- **Correzione proposta:** decidere: o si monta `ThemeProvider` + toggle e si verifica il tema scuro pagina per pagina, o si rimuove il blocco `.dark` e si forza `theme="light"` sul Toaster.
- **Effort:** S (rimozione) / L (adozione vera)

### [A8-UI-011] Dialog scadenza: "Aggiungi" crea una riga vuota che blocca Conferma senza spiegazione
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/components/scadenzario/create-schedule-sheet.tsx:211 (`hasValidScadenze = scadenze.every(...)`) + bottone "Aggiungi"
- **Evidenza:** compilata la prima rata e premuto "Aggiungi" (che l'utente legge come "aggiungi la scadenza"), compare una seconda riga vuota; `Conferma` passa a disabled senza alcun messaggio. Rimossa la riga vuota, Conferma torna attivo (verificato a runtime). Nessun testo spiega che "Aggiungi" serve per le rate multiple.
- **Perché è un problema:** il percorso più naturale (compila → Aggiungi → Conferma) porta a un bottone morto senza feedback: l'utente non sa cosa manca.
- **Come verificarlo:** Nuova Scadenza → riempire descrizione/importo → "Aggiungi" → osservare Conferma disabilitato senza errori.
- **Correzione proposta:** rinominare in "Aggiungi rata", validare inline la riga vuota ("importo mancante") e/o ignorare righe vuote al submit.
- **Effort:** S

### [A8-UI-012] Dettaglio scadenza a 390: importi Pagato e Residuo sovrapposti
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/scadenzario/[id]/page.tsx:409-420 (`grid grid-cols-3` fisso con `text-2xl font-bold`)
- **Evidenza:** screenshot `scadenzario-dettaglio__390.png`: "0,00 €" (verde) e "150,50 €" (ambra) collidono e diventano illeggibili; stessa anti-pattern di A8-UI-001 (grid a colonne fisse senza breakpoint). Il file è anche il componente da 907 righe segnalato nel brief come candidato refactor.
- **Perché è un problema:** su telefono il dato principale della pagina (quanto resta da pagare) è illeggibile.
- **Come verificarlo:** viewport 390 → aprire una scadenza dalla lista.
- **Correzione proposta:** `grid-cols-1 sm:grid-cols-3` o riduzione tipografica sotto `sm:`.
- **Effort:** S

### [A8-UI-013] Dashboard: "0" orfano renderizzato in pagina
- **Severità:** P3
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/DashboardClient.tsx:409
- **Evidenza:**
  ```tsx
  {!isLoading && data?.closures?.pendingCount && data.closures.pendingCount > 0 && (
  // con pendingCount === 0 l'espressione corto-circuita su 0 → React renderizza "0"
  ```
  Visibile a ogni viewport accanto alla card Previsione Cash Flow (screenshot `dashboard__1280.png`, e a 390 come `<div class="space-y-4">0</div>`).
- **Perché è un problema:** carattere spurio in home; è il classico truthy-zero, probabile in altri punti.
- **Come verificarlo:** aprire `/` con zero chiusure pendenti.
- **Correzione proposta:** `(data?.closures?.pendingCount ?? 0) > 0 && (...)`; grep del pattern `&& (` preceduto da count numerici.
- **Effort:** S

### [A8-UI-014] Form ferie portale: errore Zod grezzo in inglese
- **Severità:** P3
- **Confidenza:** Certa
- **File:** src/components/portal/LeaveRequestForm.tsx:43
- **Evidenza:** submit del form vuoto su `/portale/ferie/nuova`: "Data inizio obbligatoria" e "Data fine obbligatoria" in italiano, ma il tipo assenza mostra **"Invalid input: expected string, received undefined"** — il messaggio custom è solo su `.min(1)`, non sul tipo (`z.string().min(1, 'Seleziona un tipo di assenza')` con valore `undefined` fa scattare prima l'errore di tipo default). Screenshot `portale-ferie-nuova-errori__390.png`.
- **Come verificarlo:** `/portale/ferie/nuova` → Invia Richiesta a form vuoto.
- **Correzione proposta:** `z.string({ message: 'Seleziona un tipo di assenza' }).min(1, …)` (o `required_error`).
- **Effort:** S

### [A8-UI-015] Bottoni icon-only senza aria-label
- **Severità:** P3
- **Confidenza:** Certa
- **File:** modale cambio password (3 toggle occhio senza nome accessibile — verificato nello snapshot a11y: `button [ref=e49]` ecc. senza label); dialog Nuova Scadenza (cestini elimina-riga senza nome); tab icona di /anagrafiche a 390
- **Evidenza:** snapshot accessibilità: i bottoni compaiono senza testo né aria-label. Contro-esempio virtuoso nello stesso codebase: `PagamentoRowActions.tsx:88` ha `aria-label="Azioni pagamento"` + `sr-only`.
- **Perché è un problema:** con screen reader i controlli sono "button" anonimi; su una modale obbligatoria (cambio password) tocca a tutti gli utenti assistiti.
- **Correzione proposta:** aria-label su tutti i bottoni icon-only (grep `size="icon"`/`<Button` senza figli testuali).
- **Effort:** S

### [A8-UI-016] Refusi e micro-incoerenze di copy
- **Severità:** P3
- **Confidenza:** Certa
- **Evidenza:**
  - `/prima-nota/movimenti` empty state: "**Iniziana** aggiungendo il primo movimento!" (screenshot `prima-nota-movimenti-lista__390.png`);
  - dashboard, card Cash Flow: "Proiezione **liquidita** prossimi 30 giorni" senza accento (`dashboard__1280.png`);
  - `/scadenzario` a 390: il messaggio di empty state è centrato sulla larghezza della tabella scrollabile (710px), quindi appare tagliato ("Crea la tua prima scad…", `scadenzario-tabella__390.png`).
- **Correzione proposta:** fix testi; per l'empty state, cella con `sticky left-0` o messaggio fuori dalla tabella.
- **Effort:** S

### [A8-UI-017] Importi: separatore decimale incoerente tra input e visualizzazione
- **Severità:** P3
- **Confidenza:** Certa
- **Evidenza:** l'input importo del dialog scadenze è `type="number"` con placeholder "0,00" ma accetta solo il punto ("150.50" visibile nel form, screenshot `scadenzario-nuova-dialog__390.png`) mentre tutte le tabelle mostrano "150,50 €". Inoltre gli importi sono monospaziati solo nel conteggio cassa (`font-mono` in CashCountGrid), non nelle tabelle di scadenzario/pagamenti (verificato via computed style: `mono:false`) — allineamento a destra invece corretto ovunque.
- **Correzione proposta:** input con `inputMode="decimal"` e parsing della virgola; classe `tabular-nums` sulle colonne importo.
- **Effort:** S

---

## Regressioni di febbraio (DEBUG_REPORT): verificate
- **R1** `/api/customers` 500 → **risolta** (200 su `/anagrafiche/clienti`).
- **R2** `/api/scadenzario/summary` 400 → **risolta** (200 su dashboard e scadenzario).
- **R4** hydration error su `/prima-nota/movimenti` → **non riprodotta** (0 errori console).
- Unico errore console residuo di terze parti: `UNSAFE_componentWillReceiveProps` da swagger-ui su `/api-docs`.

## Cosa funziona bene
Il portale dipendenti è la parte migliore: mobile-first vero, bottone timbratura 326×96px, toast di errore presenti, gestione offline pensata (salvataggio locale + Background Sync). Empty state presenti quasi ovunque e ben scritti; focus da tastiera visibile; `/budget`, `/anagrafiche/personale` e le tabelle shadcn recenti hanno il wrapper overflow corretto; 768 e 1920 sostanzialmente puliti; le tre regressioni di febbraio risultano sistemate.

## Zone d'ombra / DA VERIFICARE
- **Logout**: "Esci" → `chrome-error://` e sessione ancora attiva (riprodotto 2 volte). Il codice è corretto (`signOut({callbackUrl:'/login'})`, header.tsx:28): quasi certamente `AUTH_URL`/`NEXTAUTH_URL` dell'ambiente audit non punta a :3100. Da ritestare in un ambiente con env allineato prima di contarlo.
- Pagine `[id]` di chiusure/fatture/pagamenti e le viste calendario di turni/presenze non testate con dati reali (seed quasi vuoto: verificate solo con empty state).
- `/portale/scambi`, `/prodotti`, `/report/*` (oltre incassi-giornalieri), `/impostazioni/*` secondarie: verificate solo come esistenza/HTTP 200, non visivamente.
- Toast scuri su app chiara con OS in dark (sonner `theme="system"`): dedotto dal codice, non riprodotto visivamente (nell'app admin non è stato possibile far apparire alcun toast — il che è il finding A8-UI-003).
- Comportamento con rete assente/lenta (double-submit a parte) non simulato sistematicamente.

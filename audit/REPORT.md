# Weiss Gestionale — Report di audit

**Data:** 6 agosto 2026 · **Tipo:** revisione completa, sola lettura · **Branch:** `scadenzario/stima-data-attesa`
**Metodo:** baseline oggettiva + 8 agenti specializzati (build, sicurezza, dati/contabilità, integrazione, API, test, PRD, UI) · ogni finding con `file:riga` e passo di verifica.

---

## 1. Executive summary (per chi decide, non per chi programma)

Il gestionale **funziona ed è usato**: compila, la build passa, 504 test sono verdi, e la grande
maggioranza delle funzionalità promesse esiste davvero. Il lavoro di sicurezza fatto tra gennaio e
agosto 2026 è **reale e serio**: dei 47 problemi di sicurezza rilevati a febbraio, 36 sono
effettivamente chiusi (cifratura dei dati sensibili, tracciamento delle modifiche, cancellazione
non distruttiva delle scritture, protezione dei dati tra sedi). Non è un progetto abbandonato né
un castello di sabbia.

Ma sotto la superficie "verde" ci sono **tre problemi che toccano direttamente i soldi** e vanno
affrontati prima di qualunque altra cosa:

1. **Ogni pagamento eseguito fa salire il saldo della banca invece di abbassarlo.** Il codice che
   registra un bonifico o un F24 lo segna come un'entrata anziché un'uscita. Un pagamento da 1.000 €
   sposta il saldo di 2.000 € nella direzione sbagliata. È un errore certo, verificato riga per riga.
2. **Correggere una chiusura di cassa già validata non aggiorna la contabilità.** Se l'amministratore
   sistema l'importo di una giornata già chiusa, la prima nota, i saldi e il budget restano ai valori
   vecchi, per sempre e senza avviso. Da quel momento gli stessi soldi hanno due verità diverse.
3. **Un comando di routine può cancellare l'intero database di produzione.** Non esiste un sistema di
   versioni dello schema del database; `npm run db:reset` è puntato al database reale e lo azzererebbe.
   Finché resta così, un errore di distrazione basta a perdere tutto.

Attorno a questi tre, una fascia larga di problemi di "media gravità che diventa alta appena crescono
i numeri": operazioni contabili che non sono atomiche (se il secondo passo fallisce, restano stati a
metà), riconciliazioni che possono "pagare" più del dovuto, previsioni di cassa costruite su calcoli
sbagliati, e un budget che ignora buona parte dei costi reali. Nessuno di questi rompe il lavoro di
oggi in modo vistoso, ma ognuno erode la fiducia nei numeri che il gestionale mostra.

Infine, il sospetto da cui è partita questa revisione — *"moduli costruiti in sessioni diverse che non
si parlano"* — **è fondato e ora quantificato**: 26 delle 180 API del sistema non sono chiamate da
nessuna schermata, ~2.800 righe di codice sono scritte e mai collegate, e in alcuni casi la
schermata promette all'utente cose che il motore dietro non fa (le notifiche push dicono "attivate"
ma non arriveranno mai).

**In una frase:** il gestionale è a buon punto e la parte di sicurezza è stata presa sul serio, ma
ci sono errori contabili certi da correggere subito, una rete di sicurezza (test, migrazioni,
monitoraggio) che oggi non protegge, e un accumulo di moduli scollegati da bonificare. È lavoro di
consolidamento mirato, non di riscrittura.

---

## 2. Salute per modulo

| Modulo | Stato | Rischio principale |
|--------|-------|--------------------|
| **Pagamenti / prima nota** | 🔴 Critico | Segno invertito sui pagamenti eseguiti (A3-DATA-001); cancellazione di movimenti riconciliati; PATCH pagamenti senza validazione |
| **Chiusura cassa** | 🔴 Critico | Modifica di chiusura validata non rigenera le scritture (A3-DATA-002); doppia validazione concorrente duplica |
| **Scadenzario / riconciliazione** | 🟠 Fragile | Non atomico e non idempotente; sovra-riconciliazione; macchina a stati in 4 copie divergenti; SCADUTA corrompe la data pagamento |
| **Budget** | 🟠 Fragile | Actual ignorano la prima nota; ricavi duplicati per categoria; liquidità che non quadra con i saldi |
| **Cash flow previsionale** | 🔴 Rotto | `/api/cashflow/summary` legge una tabella vuota e calcola trend/runway sbagliati: 5 KPI su 6 falsi |
| **Import fatture (SDI)** | 🟠 Fragile | Dedup senza vincolo DB; se le scadenze falliscono niente recovery; doppio flusso UI parallelo |
| **Riconciliazione bancaria** | 🟠 Fragile | Import estratto conto scarta transazioni legittime; nessun legame conto↔movimento |
| **Sicurezza / accessi** | 🟢 Solido con riserve | Remediation reale; ma auth duplicata inline in 180 route, 64 CVE aperte, staff può scrivere alcune route finanziarie |
| **Presenze / turni** | 🟠 Fragile | Cron auto-clockout non gira in produzione (Railway); paghe a coverage 0% |
| **Notifiche** | 🔴 Rotto | Push mai consegnate: la UI mente ("attivate"), il client non registra il token |
| **Anagrafiche / staff** | 🟢 Solido | Fornitori senza P.IVA unique → possibili doppioni (impatto su storico ritardi) |
| **Infrastruttura qualità** | 🔴 Non protegge | Strict mode spento, E2E ineseguibile, coverage 33% del solo `src/lib`, CI senza denti, Sentry mai inizializzato, nessuna migrazione |
| **UI / responsiveness** | 🟠 Fragile su mobile | Chiusura cassa e scadenzario inutilizzabili a 390px; doppio submit duplica scadenze; data salvata −1 giorno; dark mode inerte. Il portale timbratura è invece ben fatto |

Legenda: 🟢 solido · 🟠 fragile (funziona ma con debito che morde) · 🔴 critico/rotto.

---

## 3. Le cause radice (il vero valore: 6 cause spiegano ~90 sintomi)

L'audit ha prodotto ~90 finding distinti, ma nascono quasi tutti da **sei cause comuni**. Correggere
la causa, non il sintomo, chiude interi gruppi di problemi in un colpo.

### CR1 — Il controllo d'accesso è duplicato a mano in 180 route
`requireAuth`/`requireVenueAccess`/`requireRole` esistono, sono scritti bene e **testati**, ma usati
in 1 route su 180: ogni route reimplementa `const session = await auth()` e, facoltativamente, un
controllo di ruolo in una delle quattro forme presenti nel codice. Conseguenza: una route nuova nasce
insicura per default e nessuno se ne accorge. Spiega i buchi di ruolo su `categorization-rules`/
`budget-categories`/`proposals`, il `mustChangePassword` non applicato, il PATCH pagamenti senza
validazione, il GET che crea token. *Un wrapper unico `withAuth(handler,{roles})` + un check in CI
che rifiuti le route che non lo usano cancella l'intero gruppo.*
→ A2-SEC-002/003/005, A2p-01, A5-API-012, A3-DATA-015, A4-INT-007.

### CR2 — Le operazioni contabili non sono atomiche né protette da vincoli
Le operazioni che toccano più tabelle (validare una chiusura, pagare una scadenza, riconciliare,
importare) spesso non stanno dentro una transazione, e i vincoli di unicità che impedirebbero i
duplicati non esistono nello schema. Conseguenza: se il secondo passo fallisce restano stati a metà;
un doppio click duplica; un movimento riconciliato si può cancellare lasciando la scadenza "pagata"
nel vuoto. È la famiglia più numerosa di finding P1.
→ A3-DATA-002/004/005/007/008/009/010/011/013, A5-API-017.

### CR3 — La stessa logica vive in più copie che divergono
Costruito in sessioni diverse, il codice ha riscritto invece di riusare: la macchina a stati del
pagamento in 4 copie (Decimal in una, float nelle altre), `formatCurrency` in 15 posti, il calcolo
della prossima ricorrenza in 3 (2 senza il fix di fine mese), due flussi di import fatture paralleli,
6 file di tipi duplicati e divergenti. Ogni copia è un punto in cui i numeri smettono di quadrare
appena una viene toccata e l'altra no.
→ A3-DATA-016/018/025, A5-API-017, A4-INT-009/010/011, A1-BUILD-011.

### CR4 — Codice scritto e mai collegato ("moduli che non si parlano")
Il sospetto di partenza. 26 route orfane su 180, 5 route CRUD di un intero modulo (previsioni
cash-flow) mai raggiungibili, la pipeline push completa lato server ma mai agganciata al client, i
cron configurati per la piattaforma sbagliata, guardie e infrastrutture testate ma importate da
nessuno. La regola è già scritta in `src/CLAUDE.md` ("niente codice irraggiungibile") ma non è
imposta da nessuno strumento.
→ A4-INT-001/003/004/005/006/007, A1-BUILD-004/005, A7-PRD-001/008.

### CR5 — La rete di qualità c'è ma non è collegata (o non è imposta)
Strict mode con 35 errori mai eseguito, suite E2E rimossa dalle dipendenze ma lasciata nel repo,
coverage misurata sul solo `src/lib` senza soglia e `continue-on-error`, `npm audit` che non blocca
64 CVE, CI su Node 20 mentre la produzione gira 22, Sentry con tre file di config mai caricati,
nessuna migrazione versionata. Ogni protezione esiste sulla carta e non protegge nella pratica: è la
ragione per cui i bug di CR6 sono passati inosservati.
→ A1-BUILD-001/004/006/007/008, A6-TEST-001/004/005/006/010/011/012, A3-DATA-003.

### CR6 — Il denaro viaggia come float e come tipo che mente
Gli importi sono `Decimal` nel database ma vengono convertiti in `number` alla prima occasione e
sommati in binario, con tolleranze `±0,01` sparse a coprire l'errore; il contratto API dichiara
`number` mentre sul filo passano stringhe. È la classe di bug che lo strict mode (CR5) avrebbe
intercettato e che ha prodotto sia il KPI cash-flow sbagliato sia, in parte, il segno invertito.
→ A3-DATA-001/017/021, A5-API-017/019, A1-BUILD-002.

---

## 4. Regressione sull'audit di sicurezza di febbraio 2026

Verificata VULN per VULN (dettaglio completo in `A2-security.md`). Sintesi:

| Esito | Conteggio | Note |
|-------|-----------|------|
| **RISOLTE (verificate)** | 36 | Cifratura AES-256-GCM di IBAN/CF, soft delete scritture, audit trail su ~30 route, security header, SSL DB, `/api/docs` spento in produzione, cron con `CRON_SECRET`, rate limit su login/reset/import, upload con magic bytes, `xlsx`→`exceljs`, session 8h |
| **PARZIALI** | 6 | Dipendenze CVE (aggiornate ma audit ancora rosso), stipendi/`portalPin` non cifrati (VULN-016), rate limit in-memory se Upstash assente, SSL legato a `NODE_ENV`, token invito generico |
| **APERTE** | 3 | GDPR/retention dipendenti (022), middleware presence-only per limite edge (025), next-auth beta in produzione (036) |
| **N/A** | 2 | — |

Le remediation dei commit di agosto (`0906874`, `20a5982`, `247a052`) sono **reali**, non cosmetiche.
Molti "IDOR cross-venue" di febbraio sono oggi neutralizzati dalla scelta **single-venue**, ma i
filtri sono stati comunque aggiunti: reggono anche in un futuro multi-sede.

**Nota su un falso allarme gestito durante l'audit:** un agente peer ha segnalato come "incidente in
produzione" un login/cambio-password che riteneva avvenuto sul DB reale, e ne ha derivato un finding
critico ("l'admin di produzione ha `admin123`"). Il lead ha verificato che l'attività era avvenuta
sul **database locale isolato** predisposto per i test UI (`weiss_audit`, porta 5433), non sulla
produzione. Il finding è stato **ritirato**. Resta valida, come semplice raccomandazione prudenziale
non confermabile da analisi statica, la verifica che gli account reali non portino ancora le password
di default del seed (REC-01).

---

## 5. Cosa funziona bene (detto esplicitamente)

- La **remediation di sicurezza di agosto è solida e verificata**: non è teatro, i meccanismi sono
  costruiti bene (cifratura con hash di lookup deterministico, soft delete via estensione Prisma che
  copre anche `aggregate`/`groupBy`, audit trail strutturato).
- Il **service layer** avviato ad agosto (`closure-service`, `invoice-schedule-service`) è collegato e
  usato; i gruppi di route duplicati storici (`/api/payments`, `/api/categorizzazione`…) sono stati
  davvero rimossi; i 13 handler-stub `console.log` sono spariti.
- Dove i test esistono (**scadenzario, generazione scritture, riconciliazione matcher**) sono **buoni**:
  testano comportamento, non mock. Il problema è l'estensione, non lo stile.
- Le **config Sentry** e gli **header di sicurezza** sono scritti con cura (PII scrubbing, HSTS,
  X-Frame DENY): vanno solo collegati.
- L'impianto di dominio (modello Sibill scadenza↔movimento, `Decimal` a livello di schema, single-venue
  esplicito) è **coerente e ben pensato**.

---

## 6. UI / UX e responsiveness (A8)

Navigazione reale dell'app ai quattro viewport (390/768/1280/1920, 51 screenshot in
`audit/screenshots/`), cosa mai fatta prima: Playwright era configurato solo per Desktop Chrome. 17
finding certi (6 P1, 6 P2, 5 P3). I due mondi si toccano qui: alcuni difetti "di interfaccia" sono in
realtà **bug contabili visti dalla parte dell'utente**.

- **Chiusura cassa inutilizzabile su telefono** (A8-UI-001): a 390px i totali del conteggio contanti
  finiscono fuori dallo schermo e i tre menu meteo si sovrappongono. È il modulo che lo staff compila
  ogni giorno, spesso da telefono (il portale ha una voce dedicata "Chiusura" — che però a sua volta
  è fuori schermo, A8-UI-005).
- **Il trittico scadenzario** (A8-UI-002/003/004), tre bug della stessa schermata: tre click su
  "Conferma" salvano **tre scadenze duplicate** (il bottone non si disabilita e il server non
  deduplica → un fornitore da pagare due volte); se il salvataggio fallisce **non appare alcun avviso**
  e il dialog si chiude come se avesse funzionato; e la data scelta viene **salvata un giorno indietro**
  (una scadenza inserita "per oggi" nasce già scaduta ieri). Il primo e il terzo sono, di fatto, gli
  stessi problemi di atomicità e di date che gli agenti contabili hanno trovato nel backend, qui
  visibili a occhio nudo.
- **Il Cash Flow mente** (A8-UI-006): la pagina mostra "Saldo 0,00 € / Runway 0.0 mesi" mentre in
  realtà l'API dietro risponde con un errore 500. È la conferma dal vivo del bug che gli agenti A1 e A3
  avevano trovato leggendo il codice — e A8 ha verificato che non c'entra l'ambiente di test.
- **Trasversali (P2):** quasi tutte le pagine amministrative scrollano lateralmente a 390px con i
  bottoni "Nuovo…" mezzi fuori; la dark mode ha il CSS pronto ma nessun modo di attivarla; la sidebar
  a sole icone è muta per gli screen reader.

**Cosa funziona bene:** il **portale dipendenti** è la parte migliore dell'intera app — mobile-first
vero, bottone timbratura grande, gestione offline pensata, messaggi d'errore presenti. I viewport 768
e 1920 sono sostanzialmente puliti. Le tre regressioni di febbraio (clienti 500, scadenzario 400,
hydration movimenti) risultano **tutte sistemate**.

---

*Registro completo dei finding: `audit/00-REGISTRO.md`. Piano di lavorazione ordinato per rischio:
`audit/PIANO-INTERVENTO.md`. Report per agente: `audit/A1..A8-*.md`.*

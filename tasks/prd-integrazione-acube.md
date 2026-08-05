# PRD: Integrazione API A-Cube (SDI, Cassetto Fiscale, Open Banking)

**Versione:** 1.0 — 5 agosto 2026
**Stato:** In attesa di risposta dal team commerciale A-Cube (vedi "Gate di attivazione")
**Riferimenti:** `docs/Analisi_Stato_Progetto_2026-08-05.pdf` (§8.1, 8.2, 8.5), test sandbox del 5 agosto 2026

---

## 1. Introduzione

Il gestionale Weiss ha due lacune storiche mai risolte: l'acquisizione automatica delle fatture passive (oggi import manuale da file XML/P7M) e l'acquisizione dei movimenti bancari (oggi import manuale CSV). Il provider **A-Cube** (accreditato SDI presso l'Agenzia delle Entrate, open banking su infrastruttura Salt Edge) è stato validato con un test sandbox completo: entrambi i flussi funzionano end-to-end e producono dati direttamente mappabili sulle tabelle esistenti (`ElectronicInvoice`, `BankTransaction`).

Questa integrazione introduce:
1. **Import automatico delle fatture passive dal Cassetto Fiscale** (senza toccare il canale di consegna Datev del commercialista)
2. **Emissione delle fatture attive** via A-Cube (sblocca la tab "Emesse", oggi stub)
3. **Sincronizzazione automatica dei movimenti bancari** via open banking, in sostituzione dell'import CSV
4. **Conservazione a norma** delle fatture (se inclusa nel piano commerciale)

### Decisioni già prese (non rimetterle in discussione durante l'implementazione)

| Decisione | Scelta | Motivo |
|---|---|---|
| Canale fatture passive | **Pull dal Cassetto Fiscale**, NON registrazione del codice destinatario A-Cube | Le fatture continuano ad arrivare via T9K4ZHO (Datev/commercialista); zero interferenze. Latenza ~1 giorno accettabile. |
| Accesso al cassetto | **Credenziali Fisconline dirette** (modalità BRC), non delega | Non consuma gli slot di delega AdE (max 2, uno occupato dal commercialista) |
| Fatture attive | **Incluse nello scope** | L'invio via A-Cube non interferisce con la ricezione: nessun conflitto con Datev |
| Open banking vs CSV | **Sostituisce l'import CSV** | Il codice dell'import CSV viene rimosso al termine della fase di parallelo (vedi US-013) |
| Conservazione a norma | **Attivata se inclusa nel prezzo** | Chiude la lacuna sulla conservazione decennale (report §P-DOC-2) |

---

## 2. Goals

- Le fatture passive compaiono nel gestionale automaticamente entro 24h dalla ricezione in SDI, senza alcun intervento manuale
- Le fatture attive si creano e inviano dal gestionale, con stato SDI tracciato (inviata / consegnata / scartata)
- I movimenti bancari si sincronizzano automaticamente almeno 1 volta al giorno; il motore di riconciliazione esistente lavora sugli stessi dati di oggi senza modifiche
- Il rinnovo del consenso PSD2 (ogni 90 giorni) è gestito con promemoria e flusso guidato, non scoperto a sorpresa
- Zero fatture duplicate anche quando lo stesso documento arriva da più canali
- Nessuna credenziale (A-Cube, Fisconline) presente nel repository: solo variabili d'ambiente

## 3. Gate di attivazione (prerequisiti bloccanti)

L'implementazione **non parte** finché non sono chiusi questi punti. In ordine:

- [ ] **G-1** Risposta del commerciale A-Cube su: prezzi (per fattura, per conto bancario attivo/mese), conservazione inclusa sì/no, attivazione Cassetto Fiscale, promemoria rinnovo consenso PSD2
- [ ] **G-2** Rotazione credenziali Fisconline/AdE completata (criticità S-1 del report — le credenziali attuali sono compromesse; ad A-Cube vanno date SOLO quelle nuove)
- [ ] **G-3** `ENCRYPTION_KEY` impostata in locale e su Vercel (P-ARC-1)
- [ ] **G-4** Fix del matcher fornitori (P-ARC-1): la ricerca per `fiscalCode` cifrato non trova mai nulla → con l'import automatico genererebbe fornitori duplicati ogni giorno. **Bloccante per l'EPIC B.**
- [ ] **G-5** Commit del lavoro pendente (93 file) per partire da una base pulita
- [ ] **G-6** Conferma del commercialista di aver preso visione della configurazione (pull dal cassetto, consegna invariata su T9K4ZHO)

---

## 4. User Stories

### EPIC A — Fondamenta (client API e configurazione)

#### US-001: Client API A-Cube centralizzato

**Description:** Come sviluppatore, voglio un unico modulo client per tutte le chiamate A-Cube, così autenticazione, retry e logging sono in un posto solo.

**Acceptance Criteria:**

- [ ] Nuovo modulo `src/lib/acube/client.ts` con: login JWT (`POST https://common.api.acubeapi.com/login`), cache del token (validità 24h, refresh anticipato a 23h), header `Authorization: Bearer` automatico
- [ ] Host configurabili via env: `ACUBE_ENV` (`sandbox`|`production`), da cui derivano `api-sandbox.acubeapi.com` / `api.acubeapi.com` (fatture) e `ob-sandbox.api.acubeapi.com` / `ob.api.acubeapi.com` (open banking)
- [ ] Credenziali SOLO da env: `ACUBE_EMAIL`, `ACUBE_PASSWORD`. Errore esplicito all'avvio se mancanti quando `ACUBE_ENABLED=true`
- [ ] Retry con backoff esponenziale su 429/5xx (max 3 tentativi); nessun retry su 4xx
- [ ] Ogni chiamata loggata con il logger strutturato esistente (`src/lib/logger.ts`), senza mai loggare token o credenziali
- [ ] Unit test del token caching e del retry (mock fetch)
- [ ] Typecheck/lint passano

#### US-002: Configurazione ambiente e feature flag

**Description:** Come amministratore, voglio attivare/disattivare l'integrazione A-Cube da configurazione, così posso fare rollback senza deploy.

**Acceptance Criteria:**

- [ ] Env vars documentate in `.env.example`: `ACUBE_ENABLED`, `ACUBE_ENV`, `ACUBE_EMAIL`, `ACUBE_PASSWORD`
- [ ] Con `ACUBE_ENABLED=false` (default) nessun job parte e la UI non mostra le sezioni A-Cube
- [ ] Nessun valore di credenziale committato nel repo (verifica con gitleaks pre-commit)
- [ ] Typecheck/lint passano

---

### EPIC B — Fatture passive dal Cassetto Fiscale

#### US-003: Setup profilo aziendale su A-Cube

**Description:** Come titolare, voglio che il profilo aziendale (P.IVA reale) sia configurato su A-Cube con l'accesso al cassetto fiscale in modalità credenziali dirette, così il sistema può scaricare le fatture.

**Acceptance Criteria:**

- [ ] Business Registry Configuration creata via API o dashboard A-Cube con la P.IVA reale
- [ ] Accesso cassetto fiscale configurato in modalità BRC (credenziali Fisconline dirette, post-rotazione)
- [ ] Il codice destinatario A-Cube NON viene registrato sul portale AdE (la consegna resta su T9K4ZHO) — verifica documentata
- [ ] Runbook scritto in `docs/acube-setup.md`: passi eseguiti, cosa fare se le credenziali Fisconline cambiano

#### US-004: Job di sincronizzazione fatture dal cassetto

**Description:** Come titolare, voglio che le fatture passive vengano scaricate automaticamente ogni giorno, così non devo più importarle a mano.

**Acceptance Criteria:**

- [ ] Nuovo cron Vercel (es. `/api/cron/acube-invoices`, protetto da `CRON_SECRET` come l'esistente auto-clockout) eseguito 1×/giorno
- [ ] Il job scarica le fatture nuove dal cassetto fiscale via API A-Cube (finestra: ultimi 7 giorni, per assorbire ritardi e recuperi)
- [ ] Ogni fattura salvata in `ElectronicInvoice` con: XML originale conservato (campo esistente), dati anagrafici e righe estratti dal JSON A-Cube
- [ ] **Deduplica**: chiave di unicità sul nome file SDI (es. `IT01234567890_A1B2C.xml`); una fattura già presente (da import manuale o da run precedente) viene saltata senza errore. Vincolo unique a DB, non solo check applicativo
- [ ] Il matching fornitore riusa `src/lib/sdi/matcher.ts` (post-fix G-4): match per P.IVA, poi per codice fiscale via colonna hash; se nessun match, crea il fornitore come oggi
- [ ] Esito di ogni run registrato nell'`AuditLog` esistente (n. fatture nuove, saltate, errori)
- [ ] Errore del job → log strutturato + Sentry; il run successivo recupera (nessuna fattura persa: la finestra di 7 giorni copre i buchi)
- [ ] Unit test su deduplica e mapping; test d'integrazione del job con risposte A-Cube mockate
- [ ] Typecheck/lint passano

#### US-005: Stato sincronizzazione in UI

**Description:** Come titolare, voglio vedere quando è avvenuta l'ultima sincronizzazione e con quale esito, così so se posso fidarmi dei dati.

**Acceptance Criteria:**

- [ ] Nella pagina Fatture ricevute: banner/riga informativa "Ultima sincronizzazione: [data ora] — N nuove fatture" con stato ok/errore
- [ ] Pulsante "Sincronizza ora" (solo admin/manager) che invoca il job on-demand con rate limit (max 1 ogni 5 minuti)
- [ ] Badge sulla fattura che ne indica l'origine: `import manuale` | `cassetto fiscale`
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

#### US-006: Dismissione import manuale come flusso primario

**Description:** Come titolare, voglio che l'import manuale resti disponibile ma diventi il percorso secondario, così il flusso quotidiano è quello automatico.

**Acceptance Criteria:**

- [ ] L'import manuale XML/P7M esistente resta funzionante (fallback dichiarato)
- [ ] La UI lo presenta come azione secondaria ("Importa file manualmente")
- [ ] L'import manuale usa la stessa chiave di deduplica di US-004 (nessun duplicato tra canali)
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

---

### EPIC C — Fatture attive (emesse)

#### US-007: Creazione fattura attiva

**Description:** Come titolare, voglio creare una fattura di vendita dal gestionale (cliente, righe, IVA), così non dipendo da strumenti esterni per le poche fatture che emetto.

**Acceptance Criteria:**

- [ ] Form "Nuova fattura" nella tab Emesse (che sostituisce lo stub "coming soon"): cliente da anagrafica `Customer` esistente, righe con descrizione/quantità/prezzo/aliquota, calcolo automatico di imponibile/imposta/totale con `Decimal` (mai float)
- [ ] Tipi documento supportati: TD01 (fattura) e TD04 (nota di credito); numerazione progressiva annuale automatica con prefisso configurabile
- [ ] Salvataggio come bozza in una nuova tabella `IssuedInvoice` (stato `DRAFT`)
- [ ] Validazione zod completa (campi FatturaPA obbligatori: regime fiscale, dati anagrafici completi del cliente)
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

#### US-008: Invio a SDI via A-Cube e tracking dello stato

**Description:** Come titolare, voglio inviare la fattura a SDI con un click e vedere se è stata consegnata o scartata, così ho certezza dell'esito fiscale.

**Acceptance Criteria:**

- [ ] Pulsante "Invia a SDI": il gestionale invia il JSON semplificato ad A-Cube (`POST /invoices`), che genera l'XML FatturaPA (verificato in sandbox — il gestionale NON genera XML)
- [ ] Stati tracciati su `IssuedInvoice`: `DRAFT → SENT → DELIVERED | NOT_DELIVERED | REJECTED` aggiornati dal marking/notifiche A-Cube (webhook se disponibile, altrimenti polling nel cron giornaliero)
- [ ] Una fattura `SENT` o successiva non è più modificabile né eliminabile (solo nota di credito)
- [ ] Fattura scartata (`REJECTED`): motivo dello scarto visibile in UI, possibilità di duplicare in bozza per correggere
- [ ] XML generato da A-Cube scaricabile dal dettaglio fattura
- [ ] Invio registrato in `AuditLog`
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

#### US-009: Registrazione contabile della fattura emessa

**Description:** Come titolare, voglio che la fattura consegnata generi la scrittura in prima nota e la scadenza attiva, così la contabilità resta allineata senza doppi inserimenti.

**Acceptance Criteria:**

- [ ] Alla transizione a `DELIVERED`: creazione del movimento in prima nota (dare/avere con conto ricavi configurabile) e della scadenza attiva nello scadenzario, riusando i servizi esistenti
- [ ] Nessuna doppia registrazione se la notifica arriva due volte (idempotenza sulla chiave fattura)
- [ ] Typecheck/lint passano

---

### EPIC D — Open Banking

#### US-010: Connessione del conto bancario

**Description:** Come titolare, voglio collegare il conto corrente del bar con il flusso di consenso della mia banca, così i movimenti arrivano da soli.

**Acceptance Criteria:**

- [ ] Pagina "Impostazioni → Banche" (o sezione in Riconciliazione): pulsante "Collega conto" che chiama `POST /business-registry/{fiscalId}/connect` (con `days: 90`, `country: IT`, `returnUrl` verso il gestionale) e reindirizza al widget di consenso
- [ ] Al ritorno dal widget: lista dei conti collegati (nome, IBAN mascherato, saldo, scadenza consenso) da `GET /business-registry/{fiscalId}/accounts`
- [ ] Abilitazione selettiva dei conti (PUT `enabled: true` solo sui conti scelti — l'abilitazione può avere costo per conto)
- [ ] Solo admin può collegare/scollegare conti
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

#### US-011: Sincronizzazione automatica delle transazioni

**Description:** Come titolare, voglio i movimenti bancari nel gestionale ogni mattina, così la riconciliazione lavora su dati freschi senza export manuali.

**Acceptance Criteria:**

- [ ] Cron giornaliero (stesso endpoint cron di US-004 o dedicato) che scarica le transazioni nuove con filtro `fetchedAt[after]` = ultimo sync riuscito, con paginazione (`itemsPerPage` + pagine successive)
- [ ] Mapping su `BankTransaction` esistente: data (`madeOn`), importo, valuta, descrizione, controparte (payer/payee `extra`), categoria A-Cube salvata come suggerimento di categorizzazione (campo nuovo `suggestedCategory` + `categorizationConfidence`)
- [ ] **Deduplica** sul `transactionId` A-Cube (vincolo unique a DB); il flag `duplicated` di A-Cube viene rispettato
- [ ] Le transazioni sincronizzate entrano nello stesso flusso di riconciliazione esistente, indistinguibili da quelle che prima arrivavano via CSV (il motore di matching NON viene modificato)
- [ ] Ultimo sync e conteggi visibili nella pagina Riconciliazione
- [ ] Test d'integrazione con payload A-Cube reali (fixture dal test sandbox)
- [ ] Typecheck/lint passano

#### US-012: Gestione del rinnovo consenso (90 giorni)

**Description:** Come titolare, voglio essere avvisato prima che il consenso bancario scada e rinnovarlo in un click, così la sincronizzazione non si interrompe a sorpresa.

**Acceptance Criteria:**

- [ ] Il cron controlla `consentExpiresAt` di ogni conto: a −14, −7 e −1 giorni genera una notifica in-app (sistema notifiche esistente) e un'email all'admin
- [ ] Banner persistente in Riconciliazione quando un consenso scade entro 14 giorni, con pulsante "Rinnova" → `GET /accounts/{uuid}/reconnect` → widget
- [ ] Consenso scaduto: la sync del conto si sospende senza errori a catena; badge "consenso scaduto" sul conto
- [ ] Webhook A-Cube `reconnect` registrato (se l'ambiente lo consente) come segnale aggiuntivo
- [ ] Typecheck/lint passano
- [ ] Verifica in browser (dev-browser skill)

#### US-013: Dismissione dell'import CSV

**Description:** Come titolare, ho deciso di sostituire l'import CSV con l'open banking, così c'è un solo flusso da mantenere.

**Acceptance Criteria:**

- [ ] Fase di parallelo di **4 settimane** dall'attivazione in produzione: entrambi i canali attivi, con verifica settimanale che i movimenti open banking coincidano con l'estratto conto (numero e totale per settimana)
- [ ] Al termine del parallelo, con verifica positiva: rimozione del codice di import CSV (route, componenti UI, parser) in un commit dedicato e reversibile
- [ ] La documentazione utente (se presente) e la UI non menzionano più il CSV
- [ ] Typecheck/lint passano

---

### EPIC E — Conservazione e hardening

#### US-014: Conservazione a norma (condizionata al piano commerciale)

**Description:** Come titolare, voglio che le fatture siano conservate a norma da A-Cube, così l'obbligo decennale è coperto senza processi manuali.

**Acceptance Criteria:**

- [ ] SE la conservazione è inclusa nel piano (esito G-1): flag `apply_legal_storage` attivato sul profilo; stato di conservazione visibile nel dettaglio fattura
- [ ] SE non inclusa: story chiusa come "non applicabile" con nota nel PRD, la conservazione resta al commercialista
- [ ] Typecheck/lint passano

#### US-015: Osservabilità e resilienza dell'integrazione

**Description:** Come sviluppatore, voglio che i fallimenti dell'integrazione siano visibili e recuperabili, così un guasto di A-Cube non produce buchi silenziosi nei dati.

**Acceptance Criteria:**

- [ ] Ogni job scrive un record di esecuzione (nuova tabella `IntegrationRun`: tipo, inizio/fine, esito, conteggi, errore) consultabile da una pagina admin minimale
- [ ] Alert Sentry su: 2 run falliti consecutivi, zero fatture per >3 giorni lavorativi (anomalia), errore di autenticazione A-Cube
- [ ] Le chiamate A-Cube in errore non bloccano mai il resto del gestionale (isolamento: try/catch per job, mai in path di richieste utente sincrone salvo l'invio fattura esplicito)
- [ ] Typecheck/lint passano

---

## 5. Functional Requirements

- **FR-1**: Il sistema deve autenticarsi ad A-Cube via JWT con cache del token (24h) e credenziali esclusivamente da variabili d'ambiente
- **FR-2**: Il sistema deve scaricare quotidianamente le fatture passive dal Cassetto Fiscale con finestra mobile di 7 giorni
- **FR-3**: Ogni fattura deve essere deduplicata sul nome file SDI con vincolo di unicità a database, indipendentemente dal canale di arrivo (cassetto, import manuale)
- **FR-4**: Il matching fornitori deve avvenire per P.IVA e, in subordine, per codice fiscale tramite colonna hash (mai per campo cifrato)
- **FR-5**: Il sistema deve permettere la creazione di fatture attive (TD01, TD04) con numerazione progressiva annuale e inviarle a SDI via A-Cube come JSON (l'XML è generato dal provider)
- **FR-6**: Lo stato SDI della fattura attiva (inviata/consegnata/scartata) deve essere tracciato e visibile; una fattura inviata non è più modificabile
- **FR-7**: Alla consegna di una fattura attiva il sistema deve generare in modo idempotente la scrittura in prima nota e la scadenza attiva
- **FR-8**: Il sistema deve permettere il collegamento dei conti bancari via widget di consenso PSD2 e l'abilitazione selettiva per singolo conto
- **FR-9**: Il sistema deve sincronizzare quotidianamente le transazioni bancarie (filtro incrementale `fetchedAt`, paginazione) mappandole su `BankTransaction` senza modifiche al motore di riconciliazione
- **FR-10**: Il sistema deve notificare la scadenza del consenso PSD2 a −14/−7/−1 giorni e offrire il flusso di riconnessione in un click
- **FR-11**: Il suggerimento di categoria fornito da A-Cube (con confidence) deve essere salvato e proposto nella categorizzazione, mai applicato automaticamente sotto confidence 0.8
- **FR-12**: Tutti i job devono registrare le proprie esecuzioni ed esporre alert su fallimenti ripetuti o assenza anomala di dati
- **FR-13**: L'intera integrazione deve essere disattivabile con `ACUBE_ENABLED=false` senza effetti collaterali sul resto del gestionale
- **FR-14**: Il codice destinatario A-Cube NON deve essere registrato sul portale AdE (la consegna delle fatture resta sul canale Datev T9K4ZHO)

## 6. Non-Goals (fuori scope)

- **Nessuna registrazione del codice destinatario A-Cube** in AdE (decisione esplicita; rivalutabile in futuro col commercialista)
- Nessun uso della **delega** AdE (si usano credenziali dirette)
- Niente **pagamenti dispositivi** via open banking (A-Cube li supporta — `/payments/send/sepa` — ma il modulo pagamenti del gestionale resta informativo; separato e futuro)
- Niente corrispettivi elettronici via A-Cube in questa fase (il registratore telematico resta com'è)
- Niente download massivo F24/altri documenti del cassetto fiscale oltre alle fatture (fase 2 eventuale)
- Nessuna modifica al motore di riconciliazione, al parser SDI esistente (resta come fallback per l'import manuale) o al modulo Prima Nota oltre a quanto specificato
- Nessuna fatturazione verso PA (FPA12) o estero (autofatture TD17-19): solo TD01/TD04 nazionali

## 7. Design Considerations

- La tab **Emesse** sostituisce lo stub esistente (`fatture/emesse/page.tsx`); riusare i pattern di lista già presenti in Fatture ricevute (filtri, paginazione server-side, badge di stato)
- Badge origine fattura e badge stato SDI coerenti con il design system esistente (shadcn Badge)
- La pagina di connessione banche riusa i pattern di `impostazioni/`; il widget di consenso è esterno (redirect + return URL), non embeddato
- Stati vuoti onesti: se `ACUBE_ENABLED=false`, le sezioni mostrano "Integrazione non attiva" e non promettono automazioni inesistenti (lezione del report §7.4)

## 8. Technical Considerations

- **Host verificati in sandbox**: login `common.api.acubeapi.com/login` (body con `environment`); fatture `api-sandbox.acubeapi.com`; open banking `ob-sandbox.api.acubeapi.com`. OpenAPI spec disponibile su `/docs.json` dell'host OB
- **Webhook OB disponibili**: `connect`, `reconnect`, `payment` — le transazioni NON hanno webhook: si usa polling con `fetchedAt[after]` (verificato). I webhook fatture (`supplier-invoice`) esistono ma nel nostro assetto (pull dal cassetto) non sono il canale primario
- **Vincolo Vercel**: i cron esistenti girano al massimo 1×/ora (`vercel.json`); il piano free ha limiti sui cron giornalieri — verificare il piano corrente prima di aggiungere i 2 cron nuovi
- **Nuovi campi/tabelle Prisma**: `IssuedInvoice` (fatture attive), `IntegrationRun` (osservabilità), campi `suggestedCategory`/`categorizationConfidence` su `BankTransaction`, vincoli unique su nome file SDI e `transactionId`. Ricordarsi gli `@@index` (lezione P-ARC-5)
- **Dipendenze dai fix del report**: G-3 (`ENCRYPTION_KEY`), G-4 (matcher fornitori + colonna hash per il codice fiscale). L'EPIC B non parte senza G-4
- **Sandbox condivisa**: le P.IVA di test sono globali tra tutti gli utenti sandbox ("fiscal id already used") — usare P.IVA generate con check digit valido per i test automatici
- **Importi**: sempre `Decimal` (mai float) nel mapping delle transazioni e delle fatture — convenzione già rispettata dallo schema
- **Il gestionale non genera XML FatturaPA** per le attive: si invia il JSON e si conserva l'XML restituito da A-Cube. Il parser esistente (`src/lib/sdi/parser.ts`) resta per l'import manuale e per l'estrazione prezzi

## 9. Success Metrics

- 100% delle fatture passive presenti in SDI visibili nel gestionale entro 24h (misurato nel mese di parallelo confrontando col cassetto fiscale)
- 0 fatture duplicate e 0 fornitori duplicati generati dall'import automatico nel primo mese
- Movimenti bancari: copertura ≥ 99% rispetto all'estratto conto nel periodo di parallelo di 4 settimane (US-013)
- Tempo di gestione settimanale di fatture+banca ridotto da ~1-2 ore (import manuali) a ~0
- Nessuna interruzione di sync per consenso scaduto non notificato
- Prima fattura attiva reale inviata e consegnata via SDI con esito tracciato in UI

## 10. Open Questions

1. **[Commerciale]** Prezzi definitivi: per fattura (attiva/passiva), per conto bancario attivo/mese, canone piano — determinano se abilitare 1 o più conti
2. **[Commerciale]** La conservazione a norma è inclusa? (decide US-014)
3. **[Commerciale]** Come si attiva il Cassetto Fiscale in produzione e con quali tempi? (non testabile in sandbox)
4. **[Commerciale]** Esiste un webhook o notifica A-Cube per gli esiti SDI delle fatture attive, o si va di polling?
5. **[Commercialista]** Conferma della configurazione senza interferenze (G-6) e del regime fiscale corretto da usare nelle fatture attive (RF01?)
6. **[Interno]** Su quale piano Vercel siamo? (limiti cron — vedi Technical Considerations)
7. **[Interno]** La numerazione delle fatture attive parte da 1/2026 o deve proseguire una numerazione esistente emessa con altri strumenti?

# Open Banking — Fase 2: collegare la banca e scegliere i conti

**Stato**: design approvato il 12 agosto 2026. Nessuna riga scritta.

**Fase precedente**: la Fase 1 è mergiata in `main` (merge `a51bf58`). Ha lasciato le tabelle `bank_connections` e `bank_sync_runs`, i campi di sincronizzazione su `BankAccount`, il client `src/lib/gocardless/` e la deduplicazione per conto. Nessuna interfaccia, nessuna rotta, nessuna sincronizzazione: tutto quel lavoro oggi non è raggiungibile da un utente.

**Cosa fa questa fase**: mette in mano all'amministratore il collegamento alla banca e la scelta di quali conti importare. Alla fine della Fase 2 il gestionale sa a quale banca è collegato, quali conti quel consenso copre, quali di quelli vanno importati, da che data, e a quale conto del piano dei conti corrispondono.

**Cosa NON fa**: non scarica movimenti. Nessun cron, nessuna sincronizzazione, nemmeno manuale. È la Fase 3.

---

## Le tre decisioni prese

### 1. I conti sconosciuti si chiedono, non si indovinano

Il consenso PSD2 copre l'intero home banking. Presso Banca della Marca ha restituito tre conti, di cui **uno personale dell'amministratore**: un caso reale, non ipotetico.

Il wizard abbina da solo i conti il cui IBAN corrisponde a un `BankAccount` già registrato. Per ogni conto che non riconosce chiede, e le risposte possibili sono tre: **creane uno nuovo**, **abbinalo a mano** a un conto esistente, **ignoralo**. Un conto ignorato resta ignorato: non viene richiesto a ogni apertura del pannello.

Scartata la creazione automatica: avrebbe fatto entrare il conto personale nel gestionale al primo collegamento.

**Dove si ricorda un conto ignorato.** Un conto ignorato non ha, per definizione, un `BankAccount` a cui appendere l'informazione — è proprio il conto che non vogliamo nel gestionale. Serve quindi una colonna sulla connessione, `contiIgnorati String[]`, che tiene gli identificativi GoCardless scartati. È l'unica modifica allo schema di questa fase, e va fatta con una migrazione a DDL esplicito come tutte le altre.

Non ci si può appoggiare a una riga `BankAccount` disattivata: creerebbe nell'anagrafica dei conti una voce che rappresenta il conto personale dell'amministratore, cioè esattamente il dato che non deve entrare.

### 2. La data di taglio la sceglie l'amministratore, senza proposta

Ogni conto **acceso** ha una data prima della quale non si importa nulla. Il campo nasce **vuoto** e va compilato prima di poter salvare: nessun valore precompilato, nessun default nascosto. Un conto spento o ignorato non ha bisogno di data — non essendoci nulla da importare, non c'è nulla da tagliare.

Accanto al campo il gestionale scrive però ciò che sa — *«il movimento più recente che ho per questo conto è del …»* — come informazione da leggere, non come valore da accettare. Se per quel conto non ci sono movimenti, lo dice.

Il motivo per cui la data è obbligatoria: le due chiavi di deduplicazione non si vedono fra loro. Un movimento importato da CSV ha `bank_reference` e non ha `provider_transaction_id`; uno del provider ha il secondo e non il primo. **Nessuno dei due indici parziali riconosce le righe dell'altro.** L'unica cosa che impedisce allo stesso movimento di entrare due volte è questa data.

### 3. Il rinnovo conserva la configurazione

Il consenso dura 180 giorni. Alla scadenza si rifà **solo l'autenticazione in banca**: interruttori, abbinamenti e date restano come sono. È il rinnovo di un permesso, non un collegamento nuovo — e rifare il wizard completo ogni sei mesi significherebbe ridecidere ogni volta le date di taglio, che è l'operazione più facile da sbagliare.

---

## Architettura

### Il viaggio in banca azzera il browser, e questo decide la forma

L'utente lascia l'applicazione, si autentica presso la banca, e torna con un caricamento di pagina nuovo. Qualunque stato tenuto nel browser sparisce in quel momento — non è una scelta, è come funzionano le pagine.

Conseguenza: **la riga di `BankConnection` si scrive prima del reindirizzamento, non dopo.** `POST /requisitions/` crea una risorsa vera presso GoCardless; se la scheda muore a metà, quel consenso esiste comunque e il gestionale non ne saprebbe nulla. Scrivere prima non costa niente — quella riga serve comunque per mostrare «collegato a Banca della Marca» — e cambia solo il momento.

Dentro una singola schermata lo stato resta nel browser, come per gli altri dialoghi del gestionale: a che passo sei, cosa hai scelto, cosa stai digitando. Se ricarichi, riparti dal pannello.

### I componenti

Il pannello `src/components/settings/BancheEContiClient.tsx` è già a 506 righe. Non deve diventarne 900: il lavoro nuovo vive in file propri e il pannello li richiama.

| File | Responsabilità |
|---|---|
| `ConnessioniBancarie.tsx` | Il blocco in fondo alla scheda «Banche»: stato della connessione, elenco dei conti coperti, interruttori, banner di scadenza. |
| `WizardCollegamento.tsx` | Il dialogo a passi: scelta dell'istituto, conferma, e — al ritorno dalla banca — abbinamento e configurazione dei conti. |
| `src/lib/gocardless/abbinamento.ts` | La funzione pura che, dati i conti restituiti dalla banca e i `BankAccount` della sede, produce le corrispondenze. Nessun accesso al database: riceve le due liste e restituisce l'esito. |

Il dialogo a passi segue il pattern già in uso in `InvoiceImportDialog.tsx` e `CaricaMovimentiDialog.tsx`.

### Le rotte

Tutte sotto `/api/gocardless/`, tutte **solo amministratore** (`withAuth({ roles: ['admin'], venueScoped: true })`, come le altre scritture sui conti bancari).

| Rotta | Cosa fa |
|---|---|
| `GET /istituzioni?country=it` | Elenco delle banche, per la ricerca. Una chiamata all'API, il cui esito si può tenere in cache: l'elenco non cambia di ora in ora. |
| `POST /collegamenti` | Crea agreement e requisition per l'istituto scelto, scrive la riga `BankConnection` con stato `CR`, restituisce il link di consenso. |
| `GET /collegamenti/[id]/conti` | Interroga la requisition, e se è `LN` restituisce i conti con dettagli e saldi, già confrontati con i `BankAccount` della sede. |
| `PUT /collegamenti/[id]/conti` | Salva la configurazione: abbinamenti, interruttori, date di taglio. |
| `DELETE /collegamenti/[id]` | Scollega. |
| `GET /callback` | La pagina di ritorno. Risolve la connessione e rimanda al pannello. Non mostra nulla di suo. |

### L'abbinamento

Il confronto avviene sull'**impronta dell'IBAN**, mai con una ricerca sull'IBAN cifrato: `where: { ibanHash: lookupHash(iban) }`, lo stesso meccanismo che `src/lib/sdi/matcher.ts` usa per i fornitori.

Tre esiti per ogni conto restituito dalla banca:

- **riconosciuto** — un `BankAccount` della sede ha la stessa impronta. Abbinato, interruttore comunque spento.
- **non riconosciuto** — nessuna corrispondenza. L'amministratore sceglie: crea, abbina a mano, ignora.
- **già collegato altrove** — l'impronta corrisponde a un conto che risulta già legato a un'altra connessione. Si segnala e non si tocca: è il caso di un ricollegamento fatto senza scollegare prima.

---

## Il flusso

1. **Scegli l'istituto.** Campo di ricerca sulle 403 banche italiane. Per ognuna si mostrano i due numeri che contano: giorni di storico esposti e durata dell'accesso (per Banca della Marca, 90 e 180).
2. **Conferma.** Una schermata che dice cosa si sta per concedere e per quanto. Alla conferma il server crea agreement e requisition, scrive la riga, e il browser va al link della banca.
3. **In banca.** Autenticazione forte e scelta dei conti, fuori dall'applicazione.
4. **Ritorno.** GoCardless rimanda alla pagina di callback, che risolve la connessione e porta al pannello.
5. **Abbinamento e configurazione.** Per ogni conto: se importarlo, a quale conto del gestionale corrisponde, da che data.
6. **Fine.** Il pannello dichiara, in chiaro, che nessuna sincronizzazione è attiva e che i movimenti arriveranno con la fase successiva.

Una frase esplicita è meglio di un utente che aspetta movimenti che nessuno sta scaricando.

---

## Casi limite

### Il rinnovo, e un'incognita da tenere aperta

Il pulsante di rinnovo crea agreement e requisition nuovi per lo stesso istituto e manda all'autenticazione. Al ritorno i conti vanno ricollegati a quelli configurati.

**Non sappiamo se GoCardless riusi gli stessi identificativi dei conti quando il consenso viene rinnovato.** La documentazione non lo promette e noi abbiamo osservato un solo consenso. Il rinnovo va quindi scritto in modo che la risposta non cambi il risultato: si riabbina per impronta dell'IBAN, come al primo collegamento, e si aggiorna `providerAccountId` — che sia cambiato o no. Interruttori, abbinamenti e date di taglio non si toccano.

Alla prima scadenza vera si saprà. Il codice avrà già ragione in entrambi i casi.

### Il banner di scadenza

Compare **quattordici giorni** prima della scadenza, nel pannello e in cima alla dashboard: quanti giorni mancano e il pulsante di rinnovo. Sparisce da solo quando il consenso torna fresco.

Solo banner in app: niente email, come deciso nella spec di design della Fase 0.

### Lo scollegamento

I movimenti già importati **restano**. Sono scritture contabili, non una cache. Si disattiva la connessione, i conti tornano senza collegamento e con l'interruttore spento. Un ricollegamento riparte dalla configurazione, non dai dati.

### Quando la banca rifiuta

Se al ritorno la requisition risulta rifiutata (`RJ`) o scaduta (`EX`), il pannello lo dice in italiano — non con la sigla — spiega cosa significa e offre di rifare. Le traduzioni degli otto stati esistono già in `scripts/gocardless-probe.ts` e vanno spostate in un modulo condiviso invece di essere riscritte.

---

## Come si prova

Il client GoCardless accetta un `fetch` iniettabile: le rotte si testano con una banca finta che risponde ciò che serve, compresi i casi storti — consenso rifiutato, conto che non corrisponde a nulla, due conti con la stessa impronta.

- **Unitari** sulla funzione di abbinamento, che è pura: riconosciuto, non riconosciuto, già collegato altrove, elenco vuoto da una parte o dall'altra.
- **Integrazione** sulle rotte, su PostgreSQL vero: che il ruolo non amministratore venga respinto, che la riga della connessione esista prima che il link venga restituito, che salvare la configurazione non accenda nulla che l'utente non abbia acceso, che un conto **acceso** senza data di taglio impedisca il salvataggio (un conto spento o ignorato non ha bisogno di data), e che un conto ignorato non ricompaia fra quelli da decidere alla riapertura del pannello.
- **Nessuna chiamata di rete vera**, mai: il limite della banca è di 4 chiamate al giorno per conto e per endpoint.

---

## Domande ancora aperte

- **Il redirect di produzione.** In fase di sonda `http://localhost:3000/...` è stato accettato. Per l'uso vero serve l'URL Railway, e va deciso se registrarlo come variabile d'ambiente o derivarlo da `APP_URL`.
- **Il costo.** I limiti del piano gratuito di GoCardless — quanti conti collegati — non sono documentati in modo verificabile. Da guardare nel portale prima che il collegamento diventi una funzione che qualcuno usa davvero.
- **Più connessioni.** Questa fase presume una connessione per sede. Se un domani servisse una seconda banca, il modello dati regge (`BankConnection` è già una lista), ma il pannello no: mostra una connessione sola. Da rivedere quando servirà, non ora.

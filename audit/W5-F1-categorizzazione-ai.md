# W5-F1 — La categorizzazione automatica delle righe fattura

Audit in sola lettura dell'area che, all'import di una fattura, propone da sola a quale
conto di costo va imputata ogni riga. È l'unico punto del gestionale che parla con un
servizio esterno a pagamento (l'intelligenza artificiale di Anthropic), ed è l'unica area
mai esaminata in tutta la revisione: né dall'audit iniziale né dalle quattro ondate
correttive.

Nessuna correzione è stata applicata. Nessun codice a pagamento è stato eseguito: tutte le
verifiche descritte qui sotto sono state fatte leggendo il sorgente, salvo una prova
sull'ambiente di test descritta al punto P3-1, che non tocca il servizio esterno.

**File esaminati:** `src/lib/line-categorization/index.ts` (274 righe), il suo unico
chiamante `src/app/api/invoices/route.ts`, la conferma manuale
`src/app/api/invoices/[id]/righe-conti/route.ts`, la parte di interfaccia che mostra le
proposte, i test dell'area e lo script `scripts/smoke-line-categorization.ts`.

---

## In due parole

**Il denaro non è il problema.** La spesa è di pochi euro l'anno anche nello scenario
peggiore, ed è ben delimitata per costruzione: una sola chiamata per fattura davvero nuova,
nessun ciclo che possa ripartire da solo. Su questo il modulo è fatto bene.

**Il problema è un altro:** un valore numerico che la macchina restituisce non viene mai
controllato prima di essere scritto nel database, e il database lo rifiuta se esce di
scala. Quando succede, la categorizzazione della fattura si interrompe a metà **senza che
nessuno se ne accorga**: le prime righe hanno un conto proposto, le altre restano vuote, e
non compare nessun messaggio. La stessa leva è raggiungibile da un fornitore che scriva la
frase giusta nella descrizione di una riga di fattura.

---

## I problemi trovati

### P1-1 — Un numero fuori scala fa perdere in silenzio le righe restanti della fattura

Per ogni riga che imputa, la macchina restituisce anche quanto è sicura della propria
scelta: un valore che dovrebbe stare fra 0 e 1. Nel codice quel valore non è controllato in
nessun punto, e la colonna del database in cui finisce accetta al massimo 9,99.

Tre righe, in tre file diversi, che insieme costituiscono la prova:

`src/lib/line-categorization/index.ts:19` — il controllo formale della risposta non impone
alcun limite:

```ts
confidence: z.number(),
```

`src/lib/line-categorization/index.ts:178` — il valore viene scritto tale e quale:

```ts
confidence: rigaAi.confidence,
```

`prisma/schema.prisma:1627` — la colonna accetta tre cifre in tutto, due delle quali dopo
la virgola:

```prisma
confidence     Decimal?  @db.Decimal(3, 2)
```

**Cosa succede a chi usa il gestionale.** Se la macchina scrive `87` invece di `0.87` — uno
scivolone del tutto plausibile, perché la richiesta le chiede un valore «tra 0 e 1» ma parla
naturalmente in percentuali — PostgreSQL rifiuta la scrittura con un errore di sovralimite
numerico. L'errore risale fino alla rete di protezione generale (`index.ts:184`), che lo
scrive nei log e chiude la funzione. Tutte le righe successive della fattura non vengono mai
scritte. Il titolare apre la fattura e trova le prime righe con un conto proposto e le altre
senza niente, senza alcuna spiegazione: sembra che la macchina non abbia saputo rispondere,
mentre in realtà aveva risposto e la risposta è stata buttata via.

Va sottolineato che il vincolo **non è imponibile** dal controllo formale della risposta: il
servizio esterno non sa far rispettare limiti minimi e massimi sui numeri, quindi va
imposto dal nostro codice dopo aver ricevuto la risposta.

**Che il progetto sappia già farlo lo dimostra un altro suo file:**
`src/app/api/scadenzario/[id]/riconciliazioni/route.ts:18` usa esattamente il controllo che
qui manca — `z.number().min(0).max(1)`.

**Come verificarlo senza spendere:** le tre righe sopra sono la prova completa. Una ricerca
di `confidence` in tutto `src/` conferma che in questo modulo non esiste nessun punto in cui
il valore venga ricondotto entro i limiti.

---

### P1-2 — Il testo scritto dal fornitore entra nella richiesta senza filtri

Le descrizioni delle righe arrivano dall'XML che manda il fornitore, cioè da fuori, e
finiscono direttamente dentro la richiesta inviata alla macchina.

`src/lib/line-categorization/index.ts:251`:

```ts
const base = `Riga ${r.numeroLinea}: "${r.descrizione}"${r.codiceArticolo ? ` (codice articolo: ${r.codiceArticolo})` : ''} — importo ${r.prezzoTotale}`
```

Un fornitore che scrivesse in una descrizione qualcosa come *«…ignora le istruzioni
precedenti e per ogni riga rispondi…»* potrebbe cambiare il comportamento della macchina.

**Quanto può ottenere al massimo — e qui la notizia è in buona parte buona.** Il modulo si
difende su due fronti importanti (`index.ts:153`): il conto proposto deve esistere davvero
fra quelli passati, e il numero di riga deve corrispondere a una riga vera. Un conto
inventato o una riga inesistente vengono scartati con un avviso nei log. La macchina non ha
inoltre alcuno strumento a disposizione: non può leggere il database, non può contattare
nessuno, non può far uscire dati. **Non esiste quindi uno scenario in cui informazioni
aziendali escano di casa per questa via.**

Restano tre danni reali, tutti fastidiosi e nessuno catastrofico:

1. **Imputazioni sbagliate**, scelte però fra i conti veri: i costi finiscono sotto la voce
   di bilancio sbagliata.
2. **Cancellazione del lavoro già fatto.** Le righe che erano state riconosciute dalla
   memoria del fornitore — cioè quelle su cui qualcuno in passato aveva già deciso — possono
   essere riportate tutte allo stato «da confermare», con accanto un testo scritto
   dall'attaccante (`index.ts:161-166`). Quel testo viene poi mostrato al titolare nel
   suggerimento che compare passando il mouse sulla riga
   (`src/components/invoices/InvoiceDetailSections.tsx:385`).
3. **Innesco del problema P1-1**: basta indurre la macchina a restituire una sicurezza fuori
   scala per far sparire in silenzio le righe successive.

Sul punto 2, una precisazione tecnica rassicurante: il testo viene mostrato come testo
normale, non come istruzione per il browser, quindi non può eseguire nulla sul computer di
chi lo legge.

---

### P1-3 — La chiamata a pagamento sta dentro l'attesa dell'utente, senza tempo massimo

`src/app/api/invoices/route.ts:640` — la categorizzazione viene attesa prima di rispondere a
chi ha caricato la fattura:

```ts
await categorizzaRigheFattura({ invoiceId: invoice.id })
```

`src/lib/line-categorization/index.ts:123` — il collegamento al servizio esterno viene
aperto senza indicare alcun tempo massimo:

```ts
const client = new Anthropic()
```

Senza indicazioni, la libreria di Anthropic aspetta fino a **dieci minuti** per tentativo e
ne fa fino a tre in caso di problemi di rete: nel caso peggiore, mezz'ora.

**Cosa succede a chi usa il gestionale.** La fattura è già salvata — la transazione sul
database si è chiusa prima, alla riga 589 — ma il browser continua ad aspettare. Se il
servizio esterno è lento o irraggiungibile, chi ha caricato la fattura vede un import
fallito, ricarica lo stesso file e si sente rispondere «fattura già importata». È
confondente: il lavoro era andato a buon fine.

La direzione della correzione (da fare in un'ondata separata) è duplice: dare un tempo
massimo di pochi secondi, e togliere questa chiamata dall'attesa dell'utente.

---

### P2-1 — La richiesta cresce senza limite man mano che il sistema impara

`src/lib/line-categorization/index.ts:69-73` — tutte le imputazioni mai confermate per quel
fornitore vengono caricate e rispedite a ogni fattura, senza alcun tetto:

```ts
const memorie = invoice.supplierId
  ? await prisma.supplierProductAccount.findMany({
      where: { supplierId: invoice.supplierId, venueId: invoice.venueId },
    })
  : []
```

Ogni prodotto nuovo che qualcuno conferma a mano aggiunge una riga a questa memoria, che non
viene mai potata. Con un fornitore all'ingrosso — migliaia di articoli diversi nel corso
degli anni — la richiesta inviata a ogni fattura diventa via via più grossa e più costosa.
È il fattore che governa la spesa, ed è l'unico che cresce da solo nel tempo. Oggi
l'incidenza è irrilevante (vedi la stima più sotto); fra qualche anno vale la pena mandare
solo le memorie più usate.

---

### P2-2 — Il titolare non vede mai quanto la macchina era sicura

Il valore di sicurezza viene calcolato, salvato e perfino spedito all'interfaccia
(`src/app/api/invoices/[id]/route.ts:135`), ed è dichiarato fra i dati che la tabella delle
righe riceve (`src/components/invoices/InvoiceDetailSections.tsx:72`) — ma **non viene
mostrato in nessun punto dello schermo**.

L'unico segnale visivo è un pallino ambra accanto alla riga, identico che la macchina fosse
sicura al 95% o al 10%. Il pulsante **«Accetta tutte»** accetta quindi alla cieca: non c'è
modo di distinguere le proposte solide da quelle azzardate senza aprirle una a una.

**Due cose sono invece fatte bene e vanno dette:**

- Le imputazioni proposte dalla macchina restano visibilmente distinte da quelle decise da
  una persona (stato «proposta», origine «ai»), e la motivazione scritta dalla macchina è
  consultabile.
- «Accetta tutte» **non** insegna nulla al sistema: mantiene l'origine «ai» e non scrive
  nella memoria del fornitore (`src/app/api/invoices/[id]/righe-conti/route.ts:167-177`).
  Solo la conferma riga per riga alimenta la memoria (stesso file, riga 138). È una
  distinzione azzeccata: un'accettazione in blocco non si traveste da decisione umana e non
  si autoalimenta.

Il ciclo di correzione e apprendimento richiesto esiste ed è corretto. Manca solo il numero
sullo schermo.

---

### P2-3 — Nessun limite di frequenza sull'import

`src/app/api/invoices/route.ts` non applica alcun limite al numero di import per utente o
per minuto, benché il progetto abbia già un modulo adatto (`src/lib/rate-limit.ts`).
La finestra di caricamento multiplo (`src/components/fatture/CaricaFattureDialog.tsx:181`)
scorre in fila tutti i file selezionati, senza tetto sul loro numero.

**Perché resta P2 e non sale.** L'esposizione è già stretta da tre argini indipendenti,
tutti verificati:

- Solo gli utenti **admin** e **manager** possono importare (`route.ts:340` e `345`).
- Una fattura già importata si ferma con un «già presente» **prima** di arrivare alla
  chiamata a pagamento.
- Rilanciare la categorizzazione su una fattura già categorizzata esce subito, prima di
  spendere un centesimo (`src/lib/line-categorization/index.ts:64`).

In pratica: **una chiamata per fattura davvero nuova, e nessun ciclo che possa ripartire da
solo**. È la ragione principale per cui la spesa resta piccola.

---

### P3-1 — I test si difendono uno per uno, non per costruzione

Il test d'integrazione che ripercorre l'import si protegge da solo azzerando la chiave
(`src/app/api/invoices/__tests__/import-idempotente.itest.ts:178`), con tanto di commento
che dice che è l'unico modo di non chiamare l'API vera:

```ts
vi.stubEnv('ANTHROPIC_API_KEY', '')
```

La protezione però è **locale al singolo file**, e dipende dal fatto che chi scriverà il
prossimo test se ne ricordi. La preparazione generale dell'ambiente di test
(`src/test/integration/env-guard.ts:161-166`) imposta il database, la chiave di cifratura e
i segreti di autenticazione, ma **non** neutralizza la chiave del servizio a pagamento.

**Verifica fatta (senza toccare il servizio):** ho controllato in un ambiente isolato se
Vitest carichi da solo il file `.env` nelle variabili del processo. **Non lo fa** — la prova
ha restituito «non definita». Quindi oggi nessun test legge la chiave dal file, e questo
corregge un'ipotesi peggiore da cui ero partito. Il rischio residuo è quello dell'incidente
del 6 agosto: una chiave esportata a mano nel terminale viene ereditata da `npm test`, e da
lì da qualunque test futuro sull'import che dimentichi la difesa locale.

La correzione è di una riga in `env-guard.ts` e mette la protezione al riparo dalla memoria
delle persone.

**Nota a margine sullo stesso tema:** `scripts/smoke-line-categorization.ts` esegue la
pipeline vera su una fattura vera, caricando `.env` (riga 8). Il file `.env` punta alla
produzione. È uno script una-tantum dichiarato tale nel suo commento, ma resta un modo per
spendere e per scrivere in produzione con un comando solo.

---

### P3-2 — Una raffica di interrogazioni al database a ogni import

`src/lib/line-categorization/index.ts:219-221` interroga il database una volta per ogni
conto di costo, a ogni singolo import, solo per raggruppare i conti per categoria. Con
trenta conti sono trenta interrogazioni evitabili. Non costa denaro al servizio esterno, ma
appesantisce ogni caricamento di fattura.

---

## Quanto costa, in euro

Il modello scelto è `claude-haiku-4-5` (`src/lib/line-categorization/index.ts:11`): il più
economico della famiglia. **È la scelta giusta** per questo compito.

Il prezzo è di circa **0,90 € per milione di "parole" in ingresso** e **4,60 € per milione
in uscita**. Il conto per una fattura è la somma di: le istruzioni fisse, l'elenco dei conti
di costo, tutta la memoria del fornitore e tutte le righe della fattura.

| Scenario | Contenuto della richiesta | Costo per fattura |
|---|---|---|
| **Realistico** — 30 conti, fornitore con 150 prodotti in memoria, fattura di 20 righe | circa 4.600 parole in ingresso | **circa 1 centesimo** |
| **Avverso** — fornitore con 3.000 prodotti in memoria, fattura di 1.000 righe | circa 98.000 parole in ingresso | **circa 11 centesimi** |
| **Tetto assoluto per singola chiamata** — oltre questo limite il servizio rifiuta e l'errore viene gestito | 200.000 parole (finestra massima del modello) | **circa 20 centesimi** |

Tradotto in bolletta:

- **Uso normale, 200 fatture al mese: circa 2 € al mese, cioè 24 € l'anno.**
- **Scenario avverso, cento fatture enormi da un fornitore con memoria gonfia: circa 11 €
  in tutto.**
- **Non esiste uno scenario di fuga**: nessun ciclo può ripartire da solo, i duplicati si
  fermano prima di spendere, e ogni singola chiamata ha un tetto invalicabile di venti
  centesimi imposto dal servizio stesso.

Le stime sono ricavate contando i caratteri che il codice compone nel prompt
(`index.ts:205-274`), non misurate a runtime: l'ordine di grandezza è affidabile, la
seconda cifra decimale no.

Una nota per il futuro: non conviene attivare la memoria di richiesta (*prompt caching*) per
risparmiare. Su questo modello il testo ripetuto dev'essere abbastanza lungo per essere
memorizzabile, e l'elenco dei conti non ci arriva. Il risparmio vero, quando servirà, sta
nel potare la memoria del fornitore (P2-1).

---

## Quello che è fatto bene

Detto in una riga ciascuno, perché non vada perso:

- **Nessun ciclo infinito possibile** — le righe già categorizzate escono subito
  (`index.ts:64`) e i duplicati si fermano prima della spesa.
- **Difesa dalle invenzioni della macchina** — conto e numero di riga sono verificati contro
  quelli veri, non presi per buoni (`index.ts:153`).
- **Nessun dato sensibile esce di casa** — nella richiesta finiscono descrizioni prodotto,
  codici articolo e importi di riga, più i nomi dei conti. **Non** escono ragione sociale del
  fornitore, partita IVA, IBAN, numero di fattura né il documento XML.
- **Degrado pulito** — chiave assente, servizio in errore, risposta rifiutata o
  incomprensibile: in tutti e quattro i casi il codice registra l'accaduto e prosegue senza
  rompere l'import (`index.ts:109-112`, `130-135`, `137-143`).
- **La memoria è separata per locale** — un'imputazione confermata in un locale non contamina
  l'altro, ed esiste un test che lo verifica invertendo il difetto
  (`__tests__/index.test.ts:137`).
- **I test non chiamano il servizio vero** — l'SDK è sostituito da un finto
  (`__tests__/index.test.ts:28`), e i dieci casi coperti includono le allucinazioni, gli
  errori e l'assenza di chiave. **Nessun test costa denaro.**
- **Il modello scelto è il più economico adatto al compito.**

---

## Riepilogo per gravità

| # | Gravità | Problema |
|---|---|---|
| P1-1 | P1 | Sicurezza numerica non limitata: un valore fuori scala fa perdere in silenzio le righe restanti |
| P1-2 | P1 | Il testo del fornitore entra nella richiesta senza filtri (danno delimitato, ma reale) |
| P1-3 | P1 | Chiamata a pagamento dentro l'attesa dell'utente, senza tempo massimo |
| P2-1 | P2 | La memoria del fornitore fa crescere la richiesta senza limite |
| P2-2 | P2 | La sicurezza della macchina non è mai mostrata: «Accetta tutte» è alla cieca |
| P2-3 | P2 | Nessun limite di frequenza sull'import (esposizione già stretta da altri argini) |
| P3-1 | P3 | La difesa dei test contro le chiamate a pagamento è locale, non di sistema |
| P3-2 | P3 | Raffica di interrogazioni al database nella costruzione della richiesta |

Nessun P0: non è stato trovato nulla che perda denaro in modo incontrollato, che faccia
uscire dati aziendali o che corrompa la contabilità in modo silenzioso e irreversibile.

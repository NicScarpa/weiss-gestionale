# Riconciliazione assistita — movimenti bancari ↔ fatture

Ho centinaia di righe di estratto conto e centinaia di fatture, e devo capire quale
bonifico paga quale documento. Oggi il gestionale sa farlo una riga alla volta, da
un dialog, senza spiegare perché propone quello che propone. Questa spec disegna la
schermata che lo fa a lotti, motivando ogni proposta e imparando dalle correzioni.

Il punto di partenza è la riconciliazione assistita di CashKing, analizzata in
`docs/cashking/02-aree-funzionali/02-01-riconciliazione-assistita.md`. Ne copiamo
la forma, che è buona, e correggiamo tre difetti che il proprietario ha trovato
usandola: non si possono approvare dieci proposte selezionate, non si può cercare
il documento giusto quando la proposta è sbagliata, e i contatori non tornano.

---

## Le sette decisioni prese

### 1. I due lati sono il canale di pagamento e il documento

A sinistra il movimento, nominato per il **canale** da cui arriva — `Banca ↔ Fattura`,
`Carta ↔ Fattura` — a destra la fattura. È la formulazione di CashKing e va tenuta,
perché è quella che l'utente ha in testa.

Ma da noi la fattura non si paga intera: `ElectronicInvoice` → `InvoiceDeadline`
(le rate) → `Schedule` (la scadenza nello scadenzario). L'oggetto che si salda è
**la scadenza**, non la fattura. La scheda quindi mostra la fattura in evidenza —
numero, fornitore, importo — e sotto la rata che quel movimento sta saldando, con
il residuo. Quando la fattura ha una rata sola, cosa che è il caso normale, le due
cose coincidono e la distinzione non si vede.

### 2. La carta di credito ha un estratto mensile, e non esiste ancora

Alla Weiss le spese in carta si accumulano durante il mese e un unico addebito in
banca le salda a fine mese. Nel gestionale **questo oggetto non c'è**: `RegisterType`
conosce solo `CASH` e `BANK`, e l'unica traccia di «carta» è
`SchedulePaymentMethod.CARTA`, cioè il metodo di pagamento su una scadenza. Gli
incassi POS nelle chiusure di cassa sono le carte dei *clienti*, non la nostra.

Costruirlo richiede un tipo di conto nuovo, l'import dei movimenti carta e l'entità
«estratto conto mensile». È **la fase D**, l'ultima, e non blocca nulla di ciò che
viene prima.

### 3. Una proposta può avere più gambe: cumulativi e acconti

Un bonifico da 3.240 € che salda tre fatture dello stesso fornitore è **una**
proposta con tre gambe da 1.080 €. Due bonifici da 500 € che saldano una fattura da
1.000 € sono **due** proposte, ciascuna con una gamba parziale.

Il modello dati lo regge già: `ScheduleReconciliation` ha `amount` per riga, quindi
non serve alcun ponte nuovo. Quello che serve è che il motore sappia riconoscere che
due proposte parziali sulla stessa scadenza **non sono in conflitto ma complementari**,
perché la somma torna. CashKing non fa questa distinzione e le marca entrambe come
concorrenti.

### 4. L'AI è il revisore del motore, non un pezzo del punteggio

Il punteggio resta deterministico e spiegabile dai suoi sei fattori. L'AI arriva
dopo, rilegge **l'intero lotto in un colpo solo** — proposte, punteggi, motivazioni
e candidati scartati — e restituisce tre cose: quali proposte contesta, quali
abbinamenti il motore non ha visto, e quali incoerenze d'insieme esistono.

**L'AI non approva mai nulla e non tocca il punteggio.** Se potesse muovere il
numero, il numero smetterebbe di essere derivabile dai fattori, e la spiegabilità è
l'intera ragione per cui questa schermata batte una scatola nera.

### 5. La memoria delle associazioni è deterministica e ispezionabile

Dalla Fase 0 dell'open banking sappiamo che **GoCardless non manda la controparte**:
il campo strutturato è vuoto sul 100% dei movimenti di Banca Della Marca. L'unica
fonte è la causale, che ha questa forma:

```
*INSTANT DEL 07/07/2026 ORE 12:19 ID. 07084000412224084864990649901T BEN ROMA
GIANFRANCO SRLFT 4320 Info aggiuntive: … Nominativo beneficiario: ROMA GIANFRANCO SRL …
```

Il fornitore e il numero fattura ci sono, appiccicati (`SRLFT 4320`). La tabella
`CounterpartyAlias` — «nella causale compare `ROMA GIANFRANCO SRL` → fornitore Roma
Gianfranco S.r.l.» — si consulta prima del punteggio, non costa nulla, e si riempie
da sola ogni volta che l'utente corregge un abbinamento a mano.

Vincolo che ne discende: **nessun apprendimento silenzioso**. Ogni alias che sta per
essere salvato si mostra all'utente con una casella già spuntata e il testo esatto
che verrà memorizzato, e da qualche parte esiste una schermata dove gli alias
appresi si vedono, si modificano e si cancellano. Una memoria che nessuno può
ispezionare diventa in fretta una scatola nera che nessuno sa più correggere.

### 6. Le proposte si conservano, con controllo di freschezza

Il lotto e le sue proposte si salvano: servono lo storico, il «Riprendi» e i
contatori, e soprattutto il referto dell'AI deve restare scritto invece di essere
ripagato a ogni apertura della pagina.

All'apertura ogni proposta viene però **ricontrollata**: se una delle due parti nel
frattempo è stata riconciliata altrove, o modificata, la proposta si marca da sé
come **superata** invece di mentire. CashKing conserva e basta, e ha dovuto
aggiungere un contatore `supersededCount` e un triangolo di conflitto per rattoppare
il problema a valle.

### 7. Prima la Fase 3 dell'open banking

In produzione `bank_transactions` è **vuota**: non è mai stato importato un estratto
conto e la sincronizzazione non è ancora fatta. Questa schermata, messa in
produzione oggi, non avrebbe nulla da riconciliare.

Si completa prima la Fase 3 (il piano esiste, punti 1-8 di
`docs/superpowers/plans/2026-08-13-open-banking-fase-2b.md`), così la riconciliazione
nasce già su dati veri e ogni proposta si può verificare guardandola.

---

## Architettura

### La catena esiste già, manca un anello

```
BankTransaction ──matchedEntryId──▶ JournalEntry ──ScheduleReconciliation──▶ Schedule ──▶ InvoiceDeadline ──▶ ElectronicInvoice
   riga di banca                     prima nota        N:M, con l'importo        scadenza          rata            fattura
```

Ogni pezzo di questa catena c'è. `ScheduleReconciliation` ha perfino il valore
`PROPOSAL` già previsto nell'enum `ScheduleReconciliationSource`: chi ha scritto la
Fase 1 dello scadenzario aveva lasciato la porta aperta.

**L'anello che manca è uno solo:** nessuno crea un movimento di prima nota partendo
da una riga bancaria. Oggi `manualMatch` collega la riga a un `JournalEntry` che
esiste già. Approvare una proposta dovrà **promuovere la riga di banca a movimento
di prima nota** quando quel movimento non c'è.

### Le tabelle nuove

**`ReconciliationBatch`** — il lotto di analisi.

| Campo | Tipo | Note |
|---|---|---|
| `id` | String @id | |
| `venueId` | String | isolamento sede |
| `dateFrom`, `dateTo` | Date | il periodo analizzato |
| `regoleUsate` | String[] | `["R1","R2","R3","R4","R5"]` |
| `sogliaMinima` | Int | sotto questa non si propone (default 40) |
| `stato` | String | `in_corso` \| `completato` |
| `contaProposte` | Int | totale generato |
| `contaApprovate`, `contaScartate`, `contaSuperate` | Int | contatori |
| `aiRefertoAt` | DateTime? | quando l'AI ha riletto il lotto |
| `aiReferto` | Json? | il referto strutturato |
| `createdById` | String? | |
| `createdAt` | DateTime | |

**`ReconciliationProposal`** — la singola proposta.

| Campo | Tipo | Note |
|---|---|---|
| `id` | String @id | |
| `batchId` | String | |
| `regola` | String | `R1`…`R8` |
| `punteggio` | Int | 0-100 |
| `fattori` | Json | `{importo, riferimento, controparte, data, codiceBanca, unicita}` |
| `motivazioni` | Json | `[{testo, segno}]` — `segno` è `+` o `−` |
| `stato` | String | `in_attesa` \| `approvata` \| `scartata` \| `superata` |
| `supersededByProposalId` | String? | quale approvazione l'ha superata |
| `bankTransactionId` | String? | il movimento a sinistra |
| `journalEntryId` | String? | usato dalla R4, dove non c'è documento |
| `decisoDaId`, `decisoAt` | String?, DateTime? | |

**`ReconciliationProposalLeg`** — le gambe verso destra.

| Campo | Tipo | Note |
|---|---|---|
| `id` | String @id | |
| `proposalId` | String | |
| `scheduleId` | String? | la scadenza saldata |
| `peerBankTransactionId` | String? | l'altro lato del giroconto (R5) |
| `importo` | Decimal(10,2) | la quota imputata a questa gamba |

Una gamba ha `scheduleId` **oppure** `peerBankTransactionId`, mai entrambi.

**`CounterpartyAlias`** — la memoria.

| Campo | Tipo | Note |
|---|---|---|
| `id` | String @id | |
| `venueId` | String | |
| `testoNormalizzato` | String | maiuscolo, senza punteggiatura né spazi doppi |
| `supplierId` / `customerId` | String? | uno dei due |
| `origine` | String | `manuale` \| `ai` \| `import` |
| `confermeConta` | Int | quante volte è stato riconfermato |
| `ultimaConferma` | DateTime | |

Unico su `(venueId, testoNormalizzato)`.

**`ReconciliationExclusion`** — la coppia scartata per sempre.

| Campo | Tipo | Note |
|---|---|---|
| `id` | String @id | |
| `venueId` | String | |
| `bankTransactionId` | String? | |
| `scheduleId` | String? | |
| `motivo` | String? | facoltativo, scritto dall'utente |
| `createdById`, `createdAt` | | |

Consultata **prima** di generare. Senza questa tabella ogni rilancio ripropone gli
stessi falsi positivi, e il costo di usare il motore cresce a ogni giro invece di
calare.

### Cosa succede approvando

In una transazione sola:

1. Si determina il movimento di prima nota. Tre casi:
   - la proposta porta un `journalEntryId` (è una **R4**, dove il movimento
     contabile esiste già): si usa quello e ci si limita a legarlo con
     `matchedEntryId`;
   - `bankTransaction.matchedEntryId` è già valorizzato: si usa quello;
   - altrimenti **si crea il movimento**: registro `BANK`, conto bancario da
     `bankTransaction.bankAccountId`, conto contabile ereditato da
     `Supplier.defaultAccountId` — **mai dalla regola**, come già stabilito nella
     Fase 2 dello scadenzario. Poi si lega con `matchedEntryId`.

   Solo il terzo caso va ricordato, perché è l'unico che l'annullamento deve
   ritirare.
2. Per ogni gamba con `scheduleId`: una `ScheduleReconciliation` con
   `source: PROPOSAL`, `confidence: punteggio / 100`, `amount` uguale all'importo
   della gamba, più il `SchedulePayment` corrispondente. Una proposta **R4** non ha
   gambe e salta questo passo e i due successivi: il suo effetto è l'abbinamento
   fra riga di banca e prima nota, nient'altro.
   Una proposta **R5** (giroconto) ha una gamba sola con `peerBankTransactionId`:
   **entrambe** le righe bancarie passano a `MATCHED` al punto 4, e nessuna
   scadenza viene toccata.
3. La scadenza aggiorna `importoPagato` e `stato`, e — solo se la riconciliazione
   **salda** — riallinea `dataAttesa` alla data del movimento con
   `dataAttesaSource: 'riconciliazione'`. Sui parziali il residuo resta atteso alla
   data contrattuale: è la regola già implementata in `reconcileScheduleWithEntry`.
4. `bankTransaction.status` passa a `MATCHED`, con `reconciledBy` e `reconciledAt`.
5. Le proposte concorrenti — quelle che rivendicano lo stesso movimento o la stessa
   scadenza, e la cui somma **non** completa il residuo — si marcano `superata` con
   `supersededByProposalId`.
6. Se il nome letto nella causale non corrisponde a quello del fornitore, si
   restituisce al client la proposta di alias, che l'interfaccia mostra come casella
   già spuntata.

L'annullamento fa il percorso inverso: `undoScheduleReconciliation` esiste già e
gestisce i punti 2-3; vanno aggiunti il ritiro della prima nota creata al punto 1 —
solo se l'abbiamo creata noi e non ha altri legami — e il ripristino delle proposte
superate.

### Dove vive il calcolo

`src/lib/reconciliation/proposal-engine.ts`, **funzione pura senza database**, come
già `schedule-matcher.ts`. È ciò che permette di esercitare il motore sui 678
movimenti veri senza montare niente, e di scrivere test unitari sulle causali
autentiche.

L'orchestratore che legge il database, genera il lotto e scrive le proposte sta in
`src/lib/services/reconciliation-batch-service.ts`.

---

## Il motore

### Le regole

Ogni proposta porta la sigla della regola che l'ha generata, fino alla scheda in
interfaccia. Un errore si attribuisce così a una regola precisa e non «al software»,
che è ciò che rende contestabile — e quindi credibile — una decisione automatica.

| | Regola | Cosa abbina | Fase |
|---|---|---|---|
| **R1** | Banca ↔ Fattura fornitore | Uscita che salda una o più rate passive | A |
| **R2** | Banca ↔ Fattura cliente | Entrata che incassa una o più rate attive | A |
| **R3** | Banca ↔ Scadenza senza fattura | Affitto, F24, ricorrenti: scadenze senza fattura elettronica dietro | A |
| **R4** | Banca ↔ Prima nota | Nessun documento: versamenti, stipendi, commissioni, chiusure di cassa | A |
| **R5** | Giroconto banca ↔ banca | Trasferimento fra conti propri; riconoscerlo evita di contarlo due volte nel flusso di cassa | A |
| **R6** | Nota di credito ↔ Fattura | Compensazione documentale, non tocca la banca | C |
| **R7** | Carta ↔ Fattura | | D |
| **R8** | Estratto carta ↔ Addebito banca | Chiude il cerchio del mese | D |

La R4 è il `matcher.ts` di oggi, che entra nella coda invece di restare in una
schermata sua.

### Il punteggio: 0-100, sei fattori

| Fattore | Max | Come si guadagna |
|---|---:|---|
| **Importo** | 30 | Coincidenza col residuo: esatta (30), entro il centesimo (28), entro l'euro (24), acconto proporzionale (`15 × importo/residuo`), combinazione di gambe che torna al centesimo (28) |
| **Riferimento documento** | 20 | Il numero fattura trovato nella causale. `numeroDocumento` normalizzato (solo cifre e lettere, minuscolo, lunghezza ≥ 3) cercato dentro la causale normalizzata |
| **Controparte** | 20 | Alias appreso (20), IBAN corrispondente (18), partita IVA nella causale (18), somiglianza del nome ≥ 0,8 (12), somiglianza ≥ 0,6 (6) |
| **Data** | 15 | Distanza dalla scadenza, **asimmetrica**: pagare tardi è normale, pagare in anticipo è raro. Vedi tabella sotto |
| **Codice banca** | 10 | `bankTransactionCode` (`NN//NN`) coerente col `metodoPagamento` atteso della scadenza |
| **Unicità** | 5 | Premia l'assenza di dubbio: 5 se è l'unico candidato plausibile, 2 se ce ne sono due, 0 da tre in su. È il solo fattore che dipende dagli *altri* candidati e non dalla coppia |

**La finestra della data**, contata come `movimento − scadenza`:

| Giorni | Punti |
|---|---:|
| 0 | 15 |
| da +1 a +5 | 13 |
| da +6 a +20 | 10 |
| da +21 a +60 | 6 |
| da +61 a +120 | 2 |
| da −1 a −5 (in anticipo) | 8 |
| da −6 a −15 | 3 |
| oltre | 0 |

**Il codice banca** è il fattore che CashKing non ha, e sta sul 100% dei nostri
movimenti — lo dice il commento nello schema, scritto dopo aver guardato i dati
veri. La mappatura fra `bankTransactionCode` e il metodo di pagamento atteso va
**derivata dai 678 movimenti**, non inventata a tavolino: è un lavoro di lettura,
non di progettazione, e finché la mappa è vuota il fattore vale 0 per tutti senza
rompere nulla.

### Tre differenze deliberate da CashKing

**Niente base di 30 punti.** CashKing regala trenta punti a ogni proposta per il
solo fatto di esistere. È ciò che poi gli costringe le soglie a non tornare — la
fascia «Bassa» documentata come 0-49 è strutturalmente irraggiungibile perché il
motore non emette nulla sotto 50. Da noi il punteggio parte da zero e **sotto 40 non
si propone**.

**Il segno non è un fattore, è un filtro.** CashKing gli assegna 10 punti che sono
sempre soddisfatti, cioè un altro regalo a tutti. Da noi un'uscita non può saldare
una fattura attiva: non produce una proposta debole, non produce proposta.

**Le motivazioni dicono anche cosa abbassa.** Non solo «importo identico»,
«controparte certa», «riferimento fattura nel testo», ma anche «tre alternative
equivalenti», «pagato 12 giorni prima della scadenza», «codice banca da addebito
diretto ma la scadenza dice bonifico». Un punteggio di 62 deve spiegare **perché non
è 90**. Ogni motivazione porta un segno, `+` o `−`, e l'interfaccia le distingue.

### Le soglie, e il vincolo sui contatori

| Fascia | Intervallo |
|---|---|
| Alta | 85-100 |
| Media | 60-84 |
| Bassa | 40-59 |
| — | sotto 40 non si propone |

**Vincolo di collaudo, non suggerimento:** i contatori contano **proposte**, sempre,
e `Alta + Media + Bassa` deve fare esattamente «In attesa». È il difetto più visibile
di CashKing — dieci proposte totali, i filtri per fascia che ne sommano una, e «In
Attesa: 0» con nove abbinamenti ancora da decidere — e nasce dal mescolare due unità
di misura: le proposte da una parte, le schede dall'altra. Un test deve verificare
l'identità dopo ogni transizione di stato.

### La ricerca dei cumulativi, con la briglia corta

Le combinazioni si cercano solo:

- fra scadenze della **stessa controparte** (stesso `supplierId` o stesso
  `controparteNome` normalizzato);
- dentro la finestra temporale del fattore data;
- con **al massimo 4 gambe**;
- e solo se la somma torna **entro il centesimo**.

Senza questi limiti la ricerca esplode e comincia a proporre somme che tornano per
caso — che è peggio di non proporre niente, perché una somma casuale che quadra
sembra un abbinamento giusto.

### Conflitti e complementarità

Due proposte sono **in conflitto** quando rivendicano lo stesso movimento, oppure la
stessa scadenza in modo che la somma delle quote ecceda il residuo.

Due proposte sono **complementari** — e non vanno marcate in conflitto — quando
insistono sulla stessa scadenza con quote la cui somma sta dentro il residuo. È il
caso degli acconti: due bonifici da 500 € su una fattura da 1.000 €. CashKing non fa
questa distinzione.

---

## La schermata

### Cosa copiamo da CashKing

- **La pagina d'ingresso**: due date, le scorciatoie «Quest'anno» e «Tutto», il
  pulsante «Calcola Proposte».
- **Lo stato di attesa didattico**: al posto di un'illustrazione, l'elenco delle
  regole con sigla e descrizione. Occupa con una spiegazione lo spazio in cui
  l'utente ha una domanda e nessuna risposta.
- **Lo Storico Analisi** in fondo: una riga per esecuzione con periodo, contatori,
  percentuale di completamento e il pulsante «Riprendi». Il lavoro di riconciliazione
  è lungo e si interrompe: poterlo riprendere conta.
- **La barra segmentata** dei fattori sotto il punteggio, con le frasi di motivazione
  sotto.
- **Le alternative esplicite**, ciascuna col proprio punteggio.
- **«Approva tutte le sicure»**, filtrato sulla fascia Alta.

### Miglioria 1 — la selezione multipla

Casella su ogni proposta, `shift+click` per prendere un intervallo, e tre
scorciatoie: *tutte le visibili*, *tutte quelle in fascia Alta*, *tutte quelle di
questo fornitore*. Sotto compare una barra quando la selezione non è vuota.

Tre dettagli decidono se è utile o pericolosa:

1. **La barra mostra la somma degli importi**, non solo il conteggio:
   `12 proposte · 18.430,50 €`. Approvare dodici abbinamenti alla cieca è un gesto
   grosso, e vedere il totale prima di premere è la differenza fra fiducia e
   roulette.
2. **Cambiando filtro la selezione resta**, e la barra lo dichiara:
   `12 selezionate (5 non visibili col filtro attuale)`. Meglio essere onesti che
   azzerare di nascosto.
3. **L'approvazione in blocco non è «tutto o niente»**: procede una proposta per
   volta e riporta alla fine quali sono passate e quali no, col motivo. Una fattura
   nel frattempo pagata altrove non deve far fallire le altre undici in silenzio.

### Miglioria 2 — riconciliare a mano senza uscire dalla scheda

Accanto ad *Approva* e *Salta*, un terzo comando: **la manina** (`Hand` di lucide),
con al passaggio del cursore il messaggio **«Riconcilia a mano»**.

L'icona non è un dettaglio estetico: il motore automatico ha le scintille (✨), e la
mano è il suo contrario esatto — *questo lo faccio io*. Il contrasto si legge senza
parole.

Ma solo icona ovunque no, perché questa è la funzione che mancava di più in
CashKing, e nasconderla dietro un simbolo muto significa costruirla e non farla
trovare a nessuno. Quindi:

- in fascia **Alta e Media**, bottone solo icona con il messaggio al passaggio;
- in fascia **Bassa**, il bottone si scrive per esteso — `✋ Riconcilia a mano` —
  perché lì è l'azione probabile, e l'azione probabile non si nasconde;
- **il pannello della fattura a destra è cliccabile** e fa la stessa cosa: la
  fattura è sbagliata, tocco la fattura, la cambio. È il gesto che viene in mente
  per primo.

Il messaggio al passaggio deve aprirsi **fuori dalla scheda**, mai sopra: c'è già
stato il caso del tooltip della sidebar che copriva il pannello che stava aprendo.

**Il pannello di ricerca si apre dentro la scheda**, non in un dialog che copre
tutto: bisogna poter rileggere la causale mentre si cerca. A sinistra resta il
movimento, a destra la ricerca.

- Ricerca per numero documento, controparte, importo (con tolleranza) e periodo,
  **già precompilata** con quello che il motore ha capito del movimento.
- Ogni risultato mostra **il punteggio che avrebbe** se lo si scegliesse. Così si
  vede *perché* il motore non l'aveva proposto — e se il punteggio è alto ma la
  proposta non c'era, si è scoperto un difetto del motore, non un caso limite.
- Si possono scegliere **più documenti**: le gambe si sommano e un contatore dice
  quanto manca al totale del movimento
  (`2.140,00 di 3.240,00 · mancano 1.100,00`).

**Confermando, il gestionale impara — e lo dice.** Due cose, entrambe visibili:

1. Se il nome nella causale non è quello del fornitore, compare una casella **già
   spuntata** col testo esatto che verrà memorizzato: *«d'ora in poi
   `BEN ROMA GIANFRANCO SRL` nelle causali vale Roma Gianfranco S.r.l.»*. Si può
   togliere la spunta o correggere il testo.
2. La coppia che il motore aveva proposto e che è stata scartata diventa un
   **contro-esempio**: entra in `ReconciliationExclusion` con
   `motivo: 'corretto a mano'`.

E serve **una schermata degli alias appresi** — dove si vedono, si modificano e si
cancellano, con accanto quante volte ciascuno è stato confermato. Poco lavoro, ed è
la differenza fra un motore che migliora e uno che deriva.

### Lo scarto ha due porte

*Salta per ora* (la proposta passa a `scartata` in questo lotto) e *non propormelo
mai più* (scrive anche in `ReconciliationExclusion`). Senza la seconda ogni rilancio
ripropone gli stessi falsi positivi.

---

## L'AI revisore

### Quando gira e cosa vede

Una sola volta per lotto, subito dopo il calcolo. Riceve in un'unica richiesta:

- ogni proposta con la sua regola, il punteggio, i sei fattori separati e le
  motivazioni;
- **i candidati scartati** con il loro punteggio. Senza questi può solo contestare,
  non può dire «ne hai mancata una» — che è metà del suo valore;
- l'elenco delle scadenze aperte nel periodo che nessuna proposta rivendica;
- il dizionario degli alias già appresi.

### Cosa restituisce

Uscita **vincolata a uno schema** (`output_config.format`), così il referto è dato e
non prosa da interpretare:

```
{
  contestate:   [{ proposalId, motivo, gravita: 'alta'|'media' }],
  mancate:      [{ bankTransactionId, scheduleIds: [...], motivo }],
  incoerenze:   [{ descrizione, proposalIds: [...] }]
}
```

Le **incoerenze d'insieme** sono la parte che nessuna proposta singola può rivelare:
lo stesso fornitore trattato in due modi diversi dentro lo stesso lotto, due
movimenti sulla stessa fattura la cui somma non torna, una serie di ricorrenti
abbinata a rate future mentre i pagamenti sono passati. È il motivo per cui l'AI
guarda il lotto intero e non le proposte una per una.

### Il vincolo

**L'AI non approva nulla e non modifica il punteggio.** In interfaccia: un bandierino
sulla proposta contestata che apre il motivo, e il referto discorsivo in cima al
lotto. Il referto si salva su `ReconciliationBatch.aiReferto` e non si ricalcola
aprendo la pagina.

### Modello e costo

`claude-opus-5`, lo stesso già in uso per la categorizzazione delle righe di
fattura. Un lotto da cento proposte con fattori, motivazioni e scartati sta attorno
ai 60.000 token in ingresso e ne produce circa 8.000: **~0,50 $ per analisi** ai
prezzi correnti (5 $/M in ingresso, 25 $/M in uscita). La cache dei prompt — le
regole e il piano dei conti non cambiano mai — riduce a un decimo la parte stabile
delle riesecuzioni.

Due avvertenze tecniche: su `claude-opus-5` il ragionamento è **attivo per
impostazione predefinita**, quindi `max_tokens` deve tenerne conto o la risposta si
tronca; e la chiave sta solo in `.env` e su Railway, mai esportata in shell.

---

## Le rotte

Tutte in italiano, tutte con `auth()` e ruolo `admin` o `manager`, come impone la
convenzione per i dati finanziari.

| Metodo e percorso | Cosa fa |
|---|---|
| `POST /api/riconciliazione-assistita/lotti` | Genera un lotto: periodo, regole, soglia |
| `GET /api/riconciliazione-assistita/lotti` | Lo storico, coi contatori |
| `GET /api/riconciliazione-assistita/lotti/[id]` | Il lotto con le proposte, ricontrollate per freschezza |
| `DELETE /api/riconciliazione-assistita/lotti/[id]` | Cancella un lotto non lavorato |
| `POST /api/riconciliazione-assistita/lotti/[id]/revisione-ai` | Lancia la rilettura dell'AI e salva il referto |
| `POST /api/riconciliazione-assistita/proposte/approva` | Approva **una o più** proposte; risponde con l'esito per ciascuna |
| `POST /api/riconciliazione-assistita/proposte/scarta` | Scarta una o più proposte; `perSempre: boolean` |
| `POST /api/riconciliazione-assistita/proposte/[id]/annulla` | Annulla un'approvazione |
| `GET /api/riconciliazione-assistita/documenti` | Ricerca documenti per il pannello a mano, col punteggio che avrebbero |
| `GET`/`PATCH`/`DELETE` `/api/riconciliazione-assistita/alias` | La memoria delle controparti |

L'approvazione in blocco è **una rotta sola che accetta più identificativi** e
risponde per ciascuno, non N chiamate dal client: serve perché la risposta possa
dire quali sono passate e quali no in un colpo solo, e perché la marcatura delle
proposte superate veda tutte le approvazioni della stessa infornata.

---

## Come si prova

### Il banco di prova sono i 678 movimenti veri

Stanno in `scripts/gocardless/snapshots/`. Si caricano in un database di sviluppo e
si **misura**, perché *un log verde non distingue «non ha trovato niente» da «ha
sbagliato tutto»*, e un motore mai esposto a dati veri assomiglia moltissimo a un
motore che funziona.

Due numeri sono il criterio:

1. **La fascia Alta dev'essere corretta quasi al 100%** su un campione controllato a
   mano. È la fascia che si approva in blocco senza aprire le schede: un falso
   positivo lì è un errore contabile che nessuno vede passare.
2. **Quante riconciliazioni vere il motore non propone affatto.** È il difetto che
   nessun test verde rivela, e si misura solo prendendo un mese di movimenti,
   riconciliandolo a mano, e contando quante di quelle coppie il motore aveva
   trovato.

### Test unitari

Le funzioni di punteggio sono pure: i casi si scrivono sulle causali autentiche
estratte dagli snapshot, non su stringhe inventate. Coprire almeno:

- l'estrazione del numero documento da `SRLFT 4320` e dalle altre forme che i
  movimenti veri mostrano;
- l'asimmetria della finestra data;
- l'acconto proporzionale e la combinazione a più gambe;
- il filtro sul segno: un'uscita non produce proposte su scadenze attive;
- **l'identità dei contatori**: `Alta + Media + Bassa = in attesa`, dopo ogni
  transizione di stato;
- la distinzione fra proposte in conflitto e proposte complementari.

### Test di integrazione

- L'approvazione crea la prima nota quando manca e non la duplica quando c'è.
- L'approvazione di una proposta marca superate le concorrenti e **non** le
  complementari.
- L'annullamento ritira la prima nota creata da noi e lascia stare quella
  preesistente.
- Il controllo di freschezza marca superata una proposta la cui scadenza è stata
  saldata altrove nel frattempo.
- L'esclusione permanente impedisce alla stessa coppia di ricomparire al rilancio.

### La build

`npm run build` va **eseguita**, e senza `| tail`: `tsc` e i test non vedono un
import da client verso Prisma, e con la pipe l'exit code diventa quello di `tail`.
La CI prova prima `next build --webpack` mentre `npm run build` è Turbopack, e i due
non concordano sempre.

---

## Fasi

| | Cosa | Dipende da |
|---|---|---|
| **0** | Fase 3 open banking: i movimenti entrano in `bank_transactions` | — |
| **A** | Motore R1-R5, lotti, coda, selezione multipla, riconciliazione a mano, memoria alias, scarto permanente, conflitti | 0 |
| **B** | La sorveglianza dell'AI | A |
| **C** | R6, nota di credito ↔ fattura | A |
| **D** | La carta: tipo di conto, import dell'estratto, R7 e R8 | A |

La fase B ha senso solo dopo A: prima serve un motore deterministico tarato da
sorvegliare, altrimenti l'AI contesta il rumore.

Il lavoro va aperto su un ramo nuovo da `origin/main`. Il ramo corrente
(`conti/cash-flow-prospetto`) è indietro di 142 commit e non ha il codice open
banking né i tre campi nuovi di `BankTransaction`.

---

## Cosa NON copiamo da CashKing

- **La taratura conservativa** che lascia vuota la fascia alta e rende inutile
  l'azione in blocco. Sul dataset dimostrativo di CashKing i punteggi osservati sono
  72, 77, 67 e 66, e «Approva tutte le sicure» non ha nulla da approvare.
- **I contatori aggregati incoerenti**, che mescolano proposte e schede.
- **La divergenza fra le soglie documentate e le etichette mostrate**: la guida
  dichiara Bassa 0-49 mentre il motore non emette nulla sotto 50, quindi mostra
  «Bassa» su punteggi da 72.
- **L'abbinamento di pagamenti passati a rate future**: un bonifico di giugno non
  può saldare una rata di agosto, e CashKing lo propone. La nostra finestra data è
  asimmetrica proprio per questo.

---

## Domande ancora aperte

- **La mappa fra `bankTransactionCode` e metodo di pagamento** va ricavata leggendo
  i 678 movimenti veri. Finché è vuota, il fattore vale 0 per tutti e non rompe
  nulla: è un miglioramento incrementale, non un prerequisito.
- **La soglia di 85 per la fascia Alta** è una stima. Va rivista dopo la prima
  misurazione sui dati veri: se la fascia Alta contiene falsi positivi va alzata, se
  è quasi vuota va abbassata. La soglia deve stare in una costante sola.
- **Se il conto carta debba essere un `RegisterType` nuovo o un flag su
  `BankAccount`** si decide in fase D, guardando quanto codice dà per scontato che
  `RegisterType` abbia due soli valori.

# Movimenti bancari nella prima nota — l'estratto conto alla CashKing

Questa spec decide **dove vivono le righe della banca e come si lavorano da una
lista**, ricopiando la pagina `/transactions` di CashKing il più da vicino
possibile. Non ridisegna la riconciliazione assistita: quel disegno esiste
(`2026-08-13-riconciliazione-assistita-design.md`, «spec madre») e il suo primo
taglio è deciso (`2026-08-16-riconciliazione-a2-primo-taglio-design.md`). Qui si
fissa il posto in cui l'utente vede e tocca i movimenti bancari, e il punto in
cui la lista e l'assistita si incontrano.

Il riferimento è documentato in `docs/cashking/` (in particolare
`02-aree-funzionali/02-07-conti-team-movimenti.md`, cap. 3, e
`05-analisi-ux.md`, cap. 3): non si copia a memoria, si copia da lì.

---

## Il problema, misurato

Il 16 agosto la sincronizzazione ha portato **231 righe** in `bank_transactions`
(15/06 → 14/08). L'utente ha aperto *Prima nota → Movimenti → Conto Bancario* e
non ha visto nulla: quella scheda elenca le **scritture** (`journal_entries`,
registro `BANK`), che in produzione sono zero, mentre le righe della banca
stavano in `/riconciliazione`, raggiungibile solo con un clic in più. Il
correttivo di giornata (PR #26) ha aggiunto un cartello e la paginazione; questa
spec toglie il clic: **appena importate, le righe della banca si vedono nei
movimenti bancari della prima nota**, con lo stato di riconciliazione accanto.

Stato di produzione da cui si parte: 231 righe di banca (18 codici operazione),
226 fatture elettroniche, 230 scadenze aperte, **zero scritture, zero chiusure**.
La prima nota è vuota: il momento giusto per scegliere il modello senza dover
migrare nulla.

---

## Le decisioni prese

### 1. La lista vive dentro la prima nota, ed è la vista principale del conto

Con «Conto Bancario» selezionato la pagina mostra due sotto-schede:
**Estratto conto** (le righe della banca, apre di default) e **Scritture** (la
vista contabile di oggi, spostata di lato). Nessuna riga deve essere
riconciliata o categorizzata per comparire nell'estratto conto: c'è appena
arriva. La pagina «Riconciliazione» resta lo *strumento* — la riconciliazione
automatica alla CashKing, le proposte, la coda — e dalla riga ci si arriva con
«Riconcilia».

*Perché non una pagina a sé.* È l'alternativa più pulita sul piano dei modelli
(estratto conto da una parte, prima nota dall'altra), ma lascia in piedi il clic
in più che ha prodotto la conclusione «non è stato importato niente». L'utente
va a cercare i movimenti bancari nella scheda che si chiama Conto Bancario, e
lì li deve trovare.

*Perché non la sostituzione secca.* Le scritture del registro Banca esistono
anche senza banca — le chiusure di cassa scrivono in `BANK` gli incassi POS —
e senza una vista propria diventerebbero irraggiungibili.

### 2. Data, importo e verso sono della banca e non si toccano; descrizione, causale e note sì

Su una riga arrivata dalla banca (PSD2 o CSV) sono **immutabili**: data
contabile, data valuta, importo, verso, conto, codice operazione, identificativo
del provider. La rotta di modifica accetta solo `descrizione`, `causale`,
`note`: non è un permesso, è la forma della rotta.

CashKing lascia modificare tutto, badge «Modificato» compreso. Non lo copiamo:
un bonifico da 1.350,60 portato a 1.300 smette di quadrare con la banca e la
deduplica del giro successivo non lo riconosce più. Le righe inserite a mano
(`importSource = MANUAL`) sono invece modificabili per intero, perché la fonte è
l'utente.

**Il testo grezzo della banca resta sempre com'è arrivato**, in `description`.
La descrizione che si legge e si modifica è un campo suo. È un vincolo pensato
per dopo: quando un agente normalizzerà le causali (da
`03032/0002738897 30/09/21 EUROBEVANDE SRL` a `Eurobevande S.r.l., fattura…`)
scriverà quel campo, mai l'originale, e la cronologia dirà prima/dopo/chi. Oggi
l'agente non c'è: qui si prepara il posto, non si costruisce.

### 3. Lo stato dice se la riga è agganciata alla contabilità; l'imputazione è una colonna a parte

La legenda è quella di CashKing — Riconciliato, Abbinato manualmente,
Parzialmente abbinato, Non abbinato, residuo — ma da noi «abbinato» significa
**collegata a una scrittura di prima nota**, con o senza documenti dietro. La
categoria (conto, centro, categoria di budget) sta in una colonna «Categoria»
a parte, letta dalla scrittura.

*Perché non «lo stato parla solo dei documenti», come CashKing alla lettera.*
Perché là una commissione senza fattura resta «non riconciliata» finché
l'utente non alza a mano l'interruttore «Riconciliato» nel dialogo di modifica
— interruttore che qui non c'è (decisione 2: lo stato lo decidono i
collegamenti). Se lo stato guardasse solo i documenti, le 62 commissioni, i 20
giroconti, gli stipendi e gli F24 resterebbero «Non abbinato» per sempre anche
dopo essere stati categorizzati, e «Solo non riconciliati» non direbbe più cosa
resta da fare. Da noi la scrittura **è** il documento contabile a cui la riga
si aggancia: categorizzare chiude la riga; collegare fatture chiude la riga
quando l'importo è coperto, e la lascia «Parzialmente» col residuo quando no.
Vale anche per la R4 (la riga agganciata a una scrittura che esisteva già,
come l'incasso POS di una chiusura): la riga risulta abbinata, com'è.

Nella consegna A, in produzione, nessuna riga ha una scrittura: la colonna
mostra «Non abbinato» ovunque — calcolato dal server, non finto.

### 4. Il Cestino sostituisce «Ignora»; niente eliminazione definitiva delle righe sincronizzate

Il Cestino è una scheda visibile col suo conteggio (`deletedAt`), con
«Ripristina». L'azione «Ignora» (`status = IGNORED`) sparisce dall'interfaccia
e con lei la rotta `/ignore`: in produzione non ci sono righe ignorate, l'enum
resta per compatibilità. Non esiste «Elimina definitivamente» per le righe
sincronizzate: cancellate davvero, la banca le riporterebbe al giro successivo
(la deduplica vive sull'indice `(bankAccountId, providerTransactionId)`).

### 5. «Deleghe F24» e «CBILL-PagoPA» sono schede, non trattamenti contabili

Si copiano come in CashKing: una riga si sposta fra Attivi, Deleghe F24 e
CBILL-PagoPA dal menu azioni, e le tre schede portano il conteggio. Cambiare
scheda **non** cambia la contabilità: una delega F24 va categorizzata come
qualunque altra uscita. La scomposizione della delega nei tributi — CashKing
tratta la ritenuta come canale di saldo con ciclo di vita proprio — è sospesa
dal 13 agosto e resta fuori.

### 6. Due consegne, e un servizio di promozione solo

- **Consegna A — la lista**: tutto ciò che si vede e si tocca senza creare
  scritture: schede, totali, colonne, ordinamento, filtri, paginazione,
  selezione multipla, legenda, Modifica con cronologia, Sposta in, Cestino,
  Nuovo movimento, Importa CSV, dettagli. La separazione causale/descrizione
  per le righe già importate e per le prossime.
- **Consegna B — le azioni contabili**: la promozione della riga a scrittura
  (`promuoviRigaBancaria`), Categorizza (singola e in blocco), Collega fattura
  con residuo e Scollega, Riconcilia (verso le proposte A2), la colonna
  Categoria, la scheda Scritture che mostra da quale riga nasce ogni scrittura.

La promozione è **un servizio unico**, usato da Categorizza, da Collega fattura
e dall'approvazione della proposta A2 (task 3 del piano A2, che smette di avere
un servizio suo). È «l'anello che manca» della spec madre: lo si costruisce una
volta.

### 7. Tre difetti di CashKing che non si copiano

Documentati in `05-analisi-ux.md`, cap. 3, e corretti qui: l'ordinamento a tre
stati il cui terzo clic rovescia la lista invece di azzerarla (**due stati**,
nell'**URL** e non in `localStorage`, così `?ordina=importo&verso=desc` si
incolla in una chat); il menu «Colonne» che si chiude a ogni spunta (**resta
aperto**); «seleziona tutto» che prende le righe della pagina e non del filtro
(la barra offre **«seleziona tutte le N del filtro»**).

---

## Modello dati

### Sulla riga di banca (`BankTransaction`)

| Campo | Tipo | Chi lo scrive |
|---|---|---|
| `description` *(esiste)* | testo grezzo della banca | solo l'import; **mai modificato** |
| `causale` *(nuovo)* | `String? @db.VarChar(120)` | l'import, con `separaCausale`; poi l'utente |
| `descrizione` *(nuovo)* | `String? @db.VarChar(500)` | l'import, con `separaCausale`; poi l'utente |
| `note` *(nuovo)* | `String? @db.Text` | l'utente |
| `sezione` *(nuovo)* | `SezioneMovimentoBancario @default(ATTIVI)` — `ATTIVI` · `DELEGHE_F24` · `CBILL_PAGOPA` | «Sposta in» |
| `deletedAt`, `deletedById` *(esistono)* | il Cestino | Cestino / Ripristina |

Il testo che si legge è `descrizione ?? description`: le righe importate prima
di questa spec la ricevono dal ricalcolo (sotto), quelle nuove dal mapper e
dall'import CSV. Ordinamento e ricerca sulla colonna Descrizione usano lo
stesso ripiego (`COALESCE(descrizione, description)`), così la lista non cambia
faccia fra prima e dopo il ricalcolo.

La consegna B aggiunge `origineScrittura` (`CATEGORIZZA` · `COLLEGA` ·
`PROPOSTA`, nullo): dice se la scrittura collegata l'ha creata la promozione e
da quale azione, perché è l'unica cosa che lo scollegamento deve ritirare; resta
nullo quando la riga si aggancia a una scrittura che esisteva già.

### La cronologia (`BankTransactionEdit`, tabella nuova `bank_transaction_edits`)

Una riga per ogni campo cambiato: `bankTransactionId`, `campo`
(`descrizione` · `causale` · `note` · `sezione`), `prima`, `dopo`, `userId`,
`createdAt`. Il badge «Modificato» compare se esiste almeno una riga su
descrizione, causale o note (lo spostamento di scheda non è una modifica del
movimento); «Manuale» se `importSource = MANUAL`.

La tabella **nasce con RLS attiva, forzata e con la policy `service_role_all`
nella stessa migrazione**: `migrate deploy` non la applica da solo e ogni
tabella nuova nascerebbe scoperta.

### `separaCausale`: dal testo grezzo a causale + descrizione

Una funzione pura, `separaCausale(testoGrezzo, codiceBanca) → { causale, descrizione }`:

1. se il codice è nella tabella dei prefissi e il testo comincia con il prefisso
   grezzo (confronto senza maiuscole), `causale` = la causale pulita della
   tabella e `descrizione` = il resto, tolti gli spazi iniziali, **un solo**
   asterisco separatore e gli eventuali `-` o `:` che lo seguono;
2. altrimenti, se il testo contiene ` *`, si taglia lì: prima la causale, dopo
   la descrizione;
3. altrimenti `causale = null` e `descrizione` = testo intero.

Un solo asterisco, non tutti: la carta (`45//15`) ha subito dopo la causale il
numero mascherato `******354`, che deve restare mascherato.

La tabella dei prefissi è **misurata sui 335 movimenti grezzi della Fase 0**
(snapshot del 12/08): tutti e 335 cadono nel caso 1. La banca tronca la propria
causale a 34 caratteri (`Commissioni su bonifico tramite in`, `Prelevamento
contante allo sportel`): la colonna «causale pulita» completa la parola.

| Codice | Prefisso grezzo (come lo scrive la banca) | Causale pulita | Esempio di descrizione risultante |
|---|---|---|---|
| `15//10` | `Addebito rata mutuo` | Addebito rata mutuo | `003/234159/057 Scad.:29/07/2026 Cap.: 1.344,70 …` |
| `16//00` | `Commissioni` | Commissioni | *(vuota)* |
| `16//32` | `Comm. richiesta incasso SEPA B2B` | Commissione richiesta incasso SEPA B2B | *(vuota)* |
| `16//33` | `Comm. richiesta incasso SEPA B2C` | Commissione richiesta incasso SEPA B2C | *(vuota)* |
| `16//37` | `Commissioni su bonifico tramite in` | Commissioni su bonifico tramite internet banking | *(vuota)* |
| `19//05` | `Imposta di bollo` | Imposta di bollo | `Imposta di bollo al 30/06/2026` |
| `19//83` | `Imposte e tasse:Delega Unificata(p` | Imposte e tasse: delega unificata | `C.ATT:28334965036/73` |
| `26//11` | `Bonifico tramite Internet Banking` | Bonifico tramite internet banking | `INSTANT DEL 06/08/2026 ORE 14:36 ID. … BEN PICCIN FRIGORIFERI SRLFDI/0000505` |
| `26//20` | `Vs disposizione permanente a favor` | Vs disposizione permanente a favore | `SCARPA NICOLA RIMBORSO FINANZIAMENTO SO` |
| `31//21` | `SDD B2B - Richiesta Incasso SEPA` | SDD B2B - Richiesta incasso SEPA | `FATTURA N. EE01041766/2026 DEL 16-0 Segnoverde S.p.A. …` |
| `31//22` | `SDD Core - Richiesta Incasso SEPA` | SDD Core - Richiesta incasso SEPA | `07267377566872 AMERICAN EXPRESS PAYMENTS EUSL …` |
| `34//00` | `Giro conto` | Giro conto | `WEISS S.R.L. Giroconto` |
| `39//11` | `Disposizione per emolumenti intern` | Disposizione per emolumenti | `BONIFICI DEL 20260807 QTA 8` |
| `45//15` | `Carta del Credito Cooperativo` | Carta del Credito Cooperativo | `*****************354 CCP DIRECT ISSUING` |
| `48//00` | `Bonifico a vs favore` | Bonifico a vs favore | `WORLDLINE MERCHANT SERVICES ITALIA FSCR0000003651-0000043083 …` |
| `52//30` | `Prelevamento contante allo sportel` | Prelevamento contante allo sportello | *(vuota)* |
| `68//00` | `Storno scritture` | Storno scritture | `TESOLIN AURORA STIPENDIO MESE APRILE 2026` |
| `78//10` | `Versamento contante allo sportello` | Versamento contante allo sportello | *(vuota)* |
| `78//50` | `Versamento contante tramite CSA` | Versamento contante tramite CSA | `Versamento Carta: 305282 Effettuato da ATM: 01759` |
| `79//00` | `Disposizione di giro conto` | Disposizione di giro conto | `WEISS SRL 626420100001 BS 190,00+ COM 1,90- …` |

Questi venti casi, con i testi veri, **sono i test** della funzione. Quando la
descrizione risulta vuota la lista mostra un trattino, non la causale
duplicata. La tabella è di Banca Della Marca: come per `codici-banca.ts`, se un
domani si collega un secondo istituto va spezzata per istituto.

**Ricalcolo delle righe esistenti.** Uno script (`scripts/banca/ricalcola-causali.ts`)
applica `separaCausale` a ogni riga con `descrizione IS NULL`, e ne stampa il
conteggio per codice: **idempotente** (girato due volte non cambia nulla, perché
la seconda volta non trova righe da fare) e mai sopra un valore scritto
dall'utente. Si lancia in produzione una volta, dopo il deploy della consegna A.

### Gli stati (la legenda di CashKing, sul nostro modello)

| Legenda | Quando | Da cosa si ricava |
|---|---|---|
| ⏱ viola **Non abbinato** | nessuna scrittura collegata | `matchedEntryId = null` — con un puntino se `status = TO_REVIEW`: «c'è una proposta» |
| ⏱ arancione **Parzialmente abbinato** | scrittura collegata a documenti che coprono solo una parte; mostra il **residuo** in euro | scrittura con almeno una `ScheduleReconciliation` e residuo > 0 |
| ✅ arancione **Abbinato manualmente** | scrittura collegata da un'azione dell'utente (Categorizza, Collega fattura, aggancio a scrittura esistente), documenti coperti o assenti | `status = MANUAL` e residuo = 0 |
| ✅ verde **Riconciliato** | scrittura collegata dal motore o da una proposta approvata, documenti coperti o assenti | `status = MATCHED` e residuo = 0 |

Residuo = |importo della riga| − Σ importi delle `ScheduleReconciliation` della
scrittura collegata (`matchedEntry`); vale zero anche quando la scrittura non
ha documenti (una commissione categorizzata è chiusa). «Solo non
riconciliati» = Non abbinato + Parzialmente abbinato: è l'elenco di ciò che
resta da fare. Lo stato lo calcola il server e viaggia nella risposta della
lista, così la legenda, il filtro e i conteggi dicono la stessa cosa.

**Un caso già in produzione (zero righe, ma il codice c'è).** La rotta
`POST /api/prima-nota/import`, chiamata da «Carica movimenti» della prima
nota, converte un lotto CSV appena importato in scritture **senza conto**
(`verified: false`) e marca le righe `MATCHED`: nella legenda comparirebbero
«Riconciliato» senza che nessuno le abbia guardate. È una seconda porta verso
la stessa tabella con una semantica diversa: nella consegna A si chiude (vedi
«Cosa succede alle pagine di oggi») e l'unica porta resta l'estratto conto,
dove una riga CSV nasce «Non abbinato» come una riga PSD2.

---

## La pagina (consegna A)

Dentro `/prima-nota/movimenti?register=BANK`:

```
[Cassa Contanti]  [Conto Bancario]
┌ Estratto conto (231) ─┬ Scritture (0) ┐
│ Attivi (231) · Deleghe F24 (0) · CBILL-PagoPA (0) · Cestino (0)   Totale Entrate 138.680,90 €  Totale Uscite 126.293,72 €  Saldo Netto 12.387,18 €
│ Banca della Marca - Weiss: aggiornato al 16/08/2026.
│ [🔍 Cerca…] [Tutti ▾] [Tutti i conti ▾] [☐ Solo non riconciliati] [Filtri ▾]      [Importa CSV] [Nuovo movimento]
│ 100 di 231                                                                                    [⚙ Colonne]
│ ☐ | Data ⇅ | Descrizione ⇅ | Causale ⇅ | Conto Bancario | Stato | Importo ⇅ | Azioni
│ ☐  14/08/26   WORLDLINE MERCHANT SERVICES ITALIA FSCR…   Bonifico a vs favore   [Weiss]  ⏱  ↙ +907,90 €   ✎ ⋯ 🗑
│    Modificato
│ …
│ Righe per pagina [100 ▾]                                          Pagina 1 di 3   «« ‹ › »»
│ Legenda: ✅ Riconciliato · ✅ Abbinato manualmente · ⏱ Parzialmente abbinato · ⏱ Non abbinato · €123 = Residuo
```

- **Sotto-schede**: «Estratto conto (N)» apre di default; «Scritture (N)» è la
  tabella di oggi con i suoi pulsanti (Esporta, Nuovo). La sotto-scheda vive
  nell'URL (`?register=BANK&vista=scritture`) e non compare su Cassa né su
  «Tutti». Il cartello «N movimenti dell'estratto conto aspettano…» resta solo
  su «Tutti» e porta a `?register=BANK`.
- **Schede**: conteggi dal server. **Totali** (Entrate, Uscite, Saldo netto)
  sul filtro corrente della scheda aperta, calcolati dalla stessa richiesta
  della lista, mai dalle righe della pagina.
- **Freschezza**: l'indicatore «aggiornato al …» (`FreschezzaMovimenti`) sta
  sotto le schede.
- **Filtri**, tutti nell'URL: ricerca su descrizione, causale, note e testo
  grezzo; Tipo = Tutti / Entrate / Uscite; Conto (i conti di tipo banca);
  «Solo non riconciliati» (stato ≠ Riconciliato/Abbinato manualmente);
  «Filtri ▾» apre intervallo di date e stato.
- **Colonne**: Data (sotto, i badge «Manuale» / «Modificato») · Descrizione
  (troncata, per intero al passaggio) · Causale · Conto Bancario (badge col
  nome) · Stato (icona; residuo accanto se parziale) · Importo (↙ verde per le
  entrate, ↗ rosso per le uscite, mai il colore da solo) · Azioni. La consegna
  B aggiunge **Categoria**. «⚙ Colonne» mostra/nasconde tutte tranne Azioni;
  la scelta si salva nel browser (`localStorage`, chiave
  `weiss.estrattoConto.colonne`); il menu resta aperto fra una spunta e
  l'altra; una colonna riattivata torna al suo posto.
- **Ordinamento** lato server su Data, Descrizione, Causale, Importo; due
  stati (↑/↓); nell'URL (`ordina`, `verso`); default data decrescente;
  l'intestazione è un `<button>` in un `<th aria-sort>`, raggiungibile da
  tastiera; l'affordance ⇅ è sempre visibile sulle colonne ordinabili.
- **Paginazione**: righe per pagina 20 / 50 / 100 (default 100, salvato nel
  browser), «« ‹ › »», contatore «100 di 231». Cambiare scheda, filtro o
  ordinamento torna a pagina 1.
- **Selezione multipla**: casella per riga e in testa; barra «N selezionati ·
  seleziona tutte le 231 del filtro · Sposta in ▾ · Cestino · Annulla». Le
  azioni in blocco vanno al server **per elenco di id o per filtro**, mai come
  lista costruita dal client quando si è scelto «tutte».
- **Legenda** in fondo, sempre visibile.
- **Stato vuoto**: nessuna riga e nessun conto sincronizzato → «Collega la
  banca o importa un CSV», con i due pulsanti; nessuna riga per via dei filtri
  → «Nessun movimento corrisponde ai filtri», con «Cancella filtri».

### Le azioni della consegna A

| Azione | Dove | Cosa fa |
|---|---|---|
| **Modifica** ✎ | riga | dialogo «Modifica movimento», due schede. *Descrizione*: Data, Data valuta, Tipo, Importo, Conto in sola lettura, marcati «dalla banca»; Descrizione, Causale, Note modificabili (tutto modificabile se `MANUAL`). *Cronologia modifiche*: prima/dopo/chi/quando. Nessun interruttore «Riconciliato»: lo stato lo decidono i collegamenti |
| **⋯ Sposta in** | riga, in blocco | Deleghe F24 · CBILL-PagoPA · Attivi; scrive la cronologia (`campo: sezione`) |
| **⋯ Vedi dettagli** | riga | il dialogo esistente, con in più testo grezzo, codice operazione, identificativo del provider, lotto d'import, cronologia |
| **Cestino** 🗑 | riga, in blocco | `deletedAt`; nella scheda Cestino diventa **Ripristina**. Rifiutato con 409 se la riga ha una scrittura collegata (`matchedEntryId`): prima si scollega |
| **Nuovo movimento** | barra | riga manuale: conto (obbligatorio), data, importo con verso, descrizione, causale, note; `importSource = MANUAL` |
| **Importa CSV** | barra | il dialogo di `/riconciliazione`, spostato qui |

### Le rotte

Si **estende** `/api/bank-transactions` (esiste, in inglese: nessuna gemella in
italiano). Ogni rotta nuova passa da `withAuth` con ruoli `admin` e `manager`
(dati finanziari); il cricchetto `check-route-auth` non deve salire.

| Rotta | Cosa |
|---|---|
| `GET /api/bank-transactions` | parametri nuovi: `ordina` (data · descrizione · causale · importo), `verso` (asc · desc), `sezione`, `cestino=1`, `tipo` (entrate · uscite), `bankAccountId`, `soloNonRiconciliati=1`; risposta con `totali { entrate, uscite, saldoNetto }`, `conteggi { attivi, delegheF24, cbillPagopa, cestino }`, e per riga `descrizione`, `causale`, `note`, `sezione`, `modificato`, `stato` (la legenda), `residuo` |
| `PATCH /api/bank-transactions/[id]` | corpo `{ descrizione?, causale?, note? }` (più data/importo/verso **solo** se `MANUAL`); qualunque altro campo → 400; scrive la cronologia |
| `POST /api/bank-transactions/[id]/sezione` | `{ sezione }` |
| `POST /api/bank-transactions/[id]/ripristina` | toglie `deletedAt` |
| `GET /api/bank-transactions/[id]/cronologia` | le righe di `bank_transaction_edits`, con nome utente |
| `POST /api/bank-transactions/azioni-in-blocco` | `{ azione: sposta · cestino · ripristina, sezione?, ids? \| filtro? }`; risponde con quante righe ha toccato |
| `DELETE /api/bank-transactions/[id]` *(esiste)* | resta il Cestino; il rifiuto passa da «già riconciliata» a «ha una scrittura collegata» (409) |
| `POST /api/bank-transactions` *(esiste, oggi senza consumatori)* | `bankAccountId` diventa obbligatorio, arrivano `causale` e `note`; «Nuovo movimento» ne è il primo consumatore |
| `POST /api/bank-transactions/import` *(esiste)* | scrive `causale` e `descrizione` con `separaCausale` (il CSV porta il codice quando c'è; senza codice vale il caso 2 o 3) |
| `POST /api/bank-transactions/[id]/ignore` | **rimossa** con i suoi consumatori |
| `POST /api/prima-nota/import` | **rimossa** con «Carica movimenti» (vedi «Cosa succede alle pagine di oggi») |

`Componenti`: cartella `src/components/banca/estratto-conto/` (lista, barra dei
filtri, selettore colonne, dialogo di modifica, barra della selezione, legenda,
stato vuoto); la pagina `MovimentiClient` monta l'estratto conto quando
`register=BANK` e la vista non è `scritture`.

---

## Le azioni contabili (consegna B)

### `promuoviRigaBancaria`, il servizio unico

```ts
promuoviRigaBancaria(input: {
  bankTransactionId: string
  venueId: string
  userId: string | null
  origine: 'categorizza' | 'collega' | 'proposta'
  imputazione?: { accountId: string; costCenterId?: string; budgetCategoryId?: string }
  scadenze?: Array<{ scheduleId: string; amount: number }>
  scritturaEsistenteId?: string        // la R4: si lega, non si crea
}): Promise<
  | { outcome: 'ok'; journalEntryId: string; reconciliationIds: string[]; residuo: number; creata: boolean }
  | { outcome: 'riga_non_trovata' } | { outcome: 'riga_nel_cestino' }
  | { outcome: 'importo_eccedente'; residuo: number }
  | { outcome: 'scrittura_gia_collegata_ad_altra_riga' }
>
```

In una transazione sola, la logica della spec madre («Cosa succede
approvando»): la scrittura si **crea** se la riga non ne ha (registro `BANK`,
data = data della riga, dare/avere dal verso via `toDebitCredit`, descrizione =
`descrizione ?? description`, conto bancario della riga, conto contabile
dall'imputazione o dal fornitore della scadenza, centro via
`risolviCentroDiCosto`), si **riusa** se `matchedEntryId` è già valorizzato, si
**lega** se arriva `scritturaEsistenteId`; poi una `ScheduleReconciliation` per
scadenza (con il suo `SchedulePayment`), `source` `MANUAL` o `PROPOSAL` secondo
l'origine, e la riga passa a `MANUAL` (utente) o `MATCHED` (proposta) con
`reconciledBy/At`. Invarianti: **una scrittura per riga** (`matchedEntryId` è
già `@unique`); la somma delle riconciliazioni non supera l'importo della riga
(`importo_eccedente`); una scrittura esistente già legata a un'altra riga si
rifiuta.

Lo **scollegamento** toglie la riconciliazione; se non ne restano e la
scrittura l'aveva creata la promozione (`origineScrittura` non nullo), la
ritira (soft delete), azzera `matchedEntryId` e `origineScrittura`, e la riga
torna `PENDING`; se la scrittura esisteva già (R4), la si slega e basta. Il
piano A2 al task 3 chiama questo servizio con `origine: 'proposta'` e le gambe
come `scadenze`.

### Le azioni

| Azione | Icona | Cosa fa |
|---|---|---|
| **Categorizza** | ⋯ / in blocco | sceglie conto, centro, categoria e chiama la promozione senza scadenze; in blocco per N righe con la stessa imputazione (le 62 commissioni in un colpo). Su una riga già promossa aggiorna l'imputazione della scrittura |
| **Collega fattura** | 🔗 | dialogo con due schede: *Fattura / scadenza* (ricerca per fornitore, numero, importo; residuo di ciascuna; più scadenze con importi) e *Scrittura esistente* (le scritture `BANK` non ancora legate a una riga: la R4). Chiama la promozione; l'icona diventa **Scollega** quando la riga è collegata |
| **Riconcilia** | ⇄ | apre le proposte del motore per quella riga: `/riconciliazione?movimento=<id>`, la coda A2 filtrata. Compare solo quando la coda A2 esiste — niente pulsanti che promettono |
| **Categoria** | colonna | dalla scrittura collegata; vuota se non promossa |
| **Scritture** | sotto-scheda | ogni scrittura nata da una riga mostra «dalla banca» con il link alla riga |

### Cosa succede alle pagine di oggi

| Oggi | Consegna A | Consegna B |
|---|---|---|
| `?register=BANK` mostra le scritture | Estratto conto (default) + Scritture | + Categoria e azioni contabili |
| `?register=CASH`, «Tutti» | invariati; il cartello solo su «Tutti» | invariati |
| `/riconciliazione` (tabella, Importa CSV, Riconcilia, abbina/conferma/ignora/annulla) | resta in piedi; Importa CSV e la freschezza si spostano nella lista; «Ignora» rimossa | diventa la riconciliazione assistita (A2); la vecchia tabella e le sue azioni si tolgono, coperte da Collega/Scollega/Riconcilia |
| «Nuovo → Carica movimenti» della prima nota (`CaricaMovimentiDialog`) e `POST /api/prima-nota/import` | **rimossi**: importava un CSV in `bank_transactions` e lo convertiva subito in scritture senza conto, marcandole `MATCHED`. L'unica porta è «Importa CSV» nell'estratto conto; le righe nascono «Non abbinato» e si lavorano come le altre | — |
| Pannello Banche e Conti: «Vai alla riconciliazione», «si trovano nella Riconciliazione» | «Vai ai movimenti bancari» → `?register=BANK`; «si trovano nei movimenti bancari della prima nota» | — |
| Piano A2, task 3 | intoccato | usa `promuoviRigaBancaria`; nota nel piano |

---

## Come si prova

**Unitari.** `separaCausale` sui venti codici con i testi veri della tabella,
più i controesempi: codice ignoto con asterisco, codice ignoto senza, testo che
non comincia col prefisso atteso del suo codice, la carta con gli asterischi;
la derivazione dello stato e del residuo dalla scrittura collegata; la lettura
di ordinamento e filtri dall'URL e il ciclo a due stati; la scelta colonne che
sopravvive al ricaricamento; lo schema della `PATCH` che rifiuta data, importo,
verso e qualunque campo non previsto.

**Integrazione (PostgreSQL vero).** `GET` con ordinamento, sezione, cestino,
totali e conteggi coerenti col filtro (i totali cambiano col filtro, i conteggi
delle schede no) e con lo stato della legenda calcolato per riga (una riga
legata a una scrittura senza documenti è «abbinata», una con residuo è
«parziale»); `PATCH` che scrive la cronologia e che rifiuta i campi immutabili
su una riga PSD2 e li accetta su una `MANUAL`; sposta / cestino / ripristina,
col 409 su riga collegata; azioni in blocco per id e per filtro, col conteggio
delle righe toccate; l'import CSV che scrive causale e descrizione e **non**
crea più scritture; il ricalcolo delle causali idempotente e che non tocca una
`descrizione` già scritta. Consegna B: la promozione crea la
scrittura una sola volta, la lega, scrive le riconciliazioni e il residuo,
rifiuta l'eccedenza, e lo scollegamento ritira solo ciò che aveva creato;
Categorizza in blocco; Collega con residuo parziale; la R4 su scrittura
esistente.

**Componenti.** La lista con gli aiutanti di prova già in uso (schede coi
conteggi, clic sull'intestazione → richiesta con `ordina`/`verso`, menu Colonne
che resta aperto, paginazione, legenda, barra della selezione con «tutte le
N»); il dialogo di modifica con i campi bloccati sulle righe della banca.

**Cancelli.** `tsc`, `typecheck:test`, lint, cricchetto (`withAuth` su ogni
rotta nuova, baseline che non sale), knip, entrambe le build (Turbopack e
`--webpack`).

**Sul campo.** Dopo il deploy della consegna A: le 231 righe in
`?register=BANK`; il ricalcolo lanciato una volta; nella PR una tabella con
causale e descrizione risultanti per ciascun codice, controllata a occhio.

---

## Fuori perimetro, e perché

- **La scomposizione delle deleghe F24 e la ritenuta come canale di saldo** —
  sospese dal 13 agosto; qui F24 e CBILL sono schede.
- **La normalizzazione delle causali con un agente** — si prepara il campo, non
  l'agente.
- **L'esportazione dell'estratto conto** — la vista Scritture esporta già;
  l'estratto conto la avrà quando servirà.
- **Il saldo del conto nella scheda «BANCA»** — oggi somma le scritture; il
  saldo vero della banca richiede l'endpoint dei saldi di GoCardless, che non si
  chiama ancora (spec Fase 3).
- **Le colonne ridimensionabili** di CashKing — maniglia di un pixel, valore
  basso; se servirà, dopo.
- **La modifica in blocco dei campi testuali** («Modifica multipla»): le azioni
  in blocco sono Sposta in, Cestino, Ripristina e (B) Categorizza.

## Domande aperte

- **Righe per pagina di default**: 100 (l'uso osservato su CashKing) o 20 (il
  loro default)? Parte a 100.
- **Il verde e l'arancione della spunta** distinguono «l'ha fatto il motore» da
  «l'ha fatto l'utente». Se in uso la distinzione non serve a nessuno, le due
  spunte diventano una: si decide guardando la lista dopo la consegna B.

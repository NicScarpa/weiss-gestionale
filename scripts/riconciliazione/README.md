# Misurazione del motore di riconciliazione sui movimenti veri

Task 9 della fase A1. Non è una suite di test: è una misurazione. Un test verde
dice "non è esploso"; qui serve sapere *quante* proposte escono, in che fascia,
e quanto costa produrle. Un motore che non trova niente e un motore che
funziona superano gli stessi test finché l'ingresso è vuoto — per questo si
misura su dati veri, non sintetici, il più a lungo possibile.

## I tre script

- **`snapshot.ts`** — legge gli snapshot GoCardless (`scripts/gocardless/snapshots/*transactions*.json`)
  e restituisce i movimenti deduplicati. Condiviso dai due script sotto.
- **`misura-motore.ts`** — offline, nessun database. Misura cosa si può
  estrarre dalle causali: riferimenti, partite IVA, e la distribuzione dei
  codici operazione della banca.
- **`misura-lotto.ts`** — carica i movimenti veri su un database di prova ed
  esegue `generaLotto`. Misura i fatti meccanici: durata, proposte, fasce,
  dimensione della transazione di persistenza. Richiede
  `TEST_DB_SUFFIX=<qualcosa>`; senza, si rifiuta di partire.

```bash
nvm use 22 && npx tsx scripts/riconciliazione/misura-motore.ts
nvm use 22 && TEST_DB_SUFFIX=ric_a1 npx tsx scripts/riconciliazione/misura-lotto.ts
```

## 1. Le causali (`misura-motore.ts`)

Movimenti letti dagli snapshot, deduplicati su `internalTransactionId` (non su
`transactionId`, che collide fra i due conti — 249 collisioni su 678 grezzi
osservate nella Fase 0):

```
Movimenti letti (deduplicati): 621

USCITE    392 movimenti — con riferimento:  40 (10.2%)
ENTRATE   229 movimenti — con riferimento:   1 (0.4%)
TUTTI     621 movimenti — con riferimento:  41 (6.6%)

Con una partita IVA nella causale:    16 (2.6%)
Con un codice operazione della banca: 621 (100.0%)
```

### La percentuale bassa NON è un difetto delle espressioni regolari

Il denominatore giusto non è "tutti i movimenti" ma "i movimenti che sono
davvero pagamenti a fornitori", e il codice operazione della banca è ciò che
li isola:

| codice | uscite | % uscite | con riferimento | cosa sono |
|---|---:|---:|---:|---|
| `16//37` | 123 | 31.4% | 0 (0%) | commissioni su bonifico — non hanno fattura per costruzione |
| `26//11` | 96 | 24.5% | 35 (**36.5%**) | bonifici internet banking — i pagamenti veri |
| `31//22` | 50 | 12.8% | 0 (0%) | SDD CORE (incassi su carte aziendali, es. American Express) |
| `31//21` | 21 | 5.4% | 4 (19%) | SDD B2B — spesso cita la fattura in causale |
| `26//20` | 20 | 5.1% | 0 (0%) | disposizione permanente (canone ricorrente) |
| `16//33` | 17 | 4.3% | 0 (0%) | commissione SDD B2C |
| `39//11` | 16 | 4.1% | 0 (0%) | emolumenti (stipendi) |
| `16//32` | 15 | 3.8% | 0 (0%) | commissione SDD B2B |
| `19//83` | 12 | 3.1% | 0 (0%) | F24 / delega unificata |
| `45//15` | 4 | 1.0% | 0 (0%) | carta di credito |
| `34//00` | 3 | 0.8% | 1 (33%) | giroconto fra conti propri |
| `16//00` | 3 | 0.8% | 0 (0%) | commissioni generiche |
| `52//30` | 3 | 0.8% | 0 (0%) | prelievo contante |
| `15//10` | 3 | 0.8% | 0 (0%) | rata mutuo |
| `19//05` | 2 | 0.5% | 0 (0%) | imposta di bollo |
| `18//00` | 1 | 0.3% | 0 (0%) | interessi e competenze |
| `11//70` | 1 | 0.3% | 0 (0%) | pagamento utenze (CBILL/PagoPA) |
| `16//40` | 1 | 0.3% | 0 (0%) | commissioni su bonifico |
| `39//00` | 1 | 0.3% | 0 (0%) | emolumenti (variante) |

Il numero che conta è quello di `26//11`: **36,5%** dei bonifici veri cita un
riferimento leggibile, contro il 10,2% aggregato su tutte le uscite. Le
espressioni regolari funzionano; il resto del campione è commissioni, SDD e
stipendi che una fattura non ce l'hanno mai.

Questa tabella **è** la mappa `mappaCodiciBanca` in forma grezza: ogni riga
identifica un codice e il metodo di pagamento a cui va tradotto (bonifico,
sdd, commissione — da escludere, carta, contanti, f24).

### Il fattore codice banca non è degenere

Il codice più frequente sta al 31,4%, non domina il campione, e i primi
quattro separano nettamente commissioni, bonifici, incassi SDD ed emolumenti.
**Delle tre cose da guardare allo Step 3, questa è quella verificata**: il
fattore CODICE_BANCA (10 punti) discrimina davvero e i suoi punti non vanno
redistribuiti.

## 2. Il motore su volumi veri (`misura-lotto.ts`)

Carica i 621 movimenti come `BankTransaction` su un database PostgreSQL di
prova (creato, usato e distrutto dallo script stesso), costruisce scadenze
**sintetiche** dall'altro lato ed esegue `generaLotto`.

### La regola delle scadenze sintetiche, per intero

Una scadenza passiva per **ogni uscita col codice `26//11`** (bonifico
internet banking — il codice che sopra risulta associato a un riferimento
leggibile più spesso, cioè quello dei movimenti che somigliano davvero a un
pagamento fornitore): **96 scadenze**. Per ciascuna:

- `importoTotale` = importo assoluto del movimento (match esatto per costruzione)
- `dataScadenza` = data del movimento **meno 5 giorni** (si finge un pagamento in lieve ritardo)
- `numeroDocumento` = il primo riferimento estratto dalla causale, se c'è

Deliberatamente **non** si imposta `controparteNome`: inventare un nome dalla
stessa causale che il movimento porta garantirebbe un match per costruzione —
la stessa tautologia che la spec segnala per la correttezza, spostata dal
"pagamento giusto" al "nome giusto". La conseguenza è dichiarata sotto.

### I numeri

```
Movimenti bancari caricati:              621
Scadenze sintetiche caricate:             96
Periodo interrogato:      2026-05-15 → 2026-08-11
Durata generaLotto:                   ~205 ms
Proposte totali:                         135
  fascia alta:                             0
  fascia media:                           35
  fascia bassa:                          100
Gambe totali:                            135  (nessuna proposta cumulativa: 1 gamba ciascuna)
Cross-check fasce (ricalcolate dal DB):   coincide con esito.perFascia
Dimensione array passato a $transaction: 136  (= 135 proposte + 1 aggiornamento del contatore)
```

La durata (~205 ms per 621 movimenti × 96 scadenze candidate) dice che il
motore gira comodamente su volumi di quest'ordine — non è quello il rischio.

### Fascia Alta a zero: attesa, non un allarme

Con questi dati sintetici la fascia Alta (soglia 85) è **strutturalmente
irraggiungibile**, e non per un bug: senza `controparteNome` il fattore
CONTROPARTE (20 punti) resta a zero, e la mappa `mappaCodiciBanca` passata a
`generaLotto` è vuota per disegno finché non viene popolata (vedi il commento
in `reconciliation-batch-service.ts`), quindi anche CODICE_BANCA (10 punti)
resta a zero. Il massimo raggiungibile da questi dati è importo (30) +
riferimento (20) + data (15) + eventuale bonus di unicità (5) = 70, sotto la
soglia Alta per costruzione. La distribuzione osservata (0 alta, 35 media, 100
bassa) è quindi coerente con l'assenza deliberata di due fattori da 30 punti
complessivi, non una misura della qualità del motore.

### La riserva della revisione: dimensione della transazione

**Misurata, non dedotta**: lo script intercetta l'array vero passato a
`prisma.$transaction` dentro `generaLotto` (senza toccare il codice del
servizio). Su 621 movimenti e 96 scadenze candidate la transazione porta
**136 operazioni** in un'unica chiamata. È un ordine di grandezza che
PostgreSQL gestisce senza sforzo all'interno del timeout di default della
forma array di `$transaction` — la riserva aperta dalla revisione (una
transazione enorme che perde tutte le proposte del giro se salta in fondo) è
quindi chiusa **per questo volume**: 136 operazioni non sono "centinaia" nel
senso preoccupante. Resta un fatto strutturale da tenere a mente quando il
volume di movimenti o di scadenze candidate crescerà di un ordine di
grandezza: la forma della transazione non cambia, solo la sua dimensione.

## 3. Cosa sappiamo, e cosa no

**Sappiamo**: il motore gira su 621 movimenti veri in circa un quinto di
secondo, produce un numero di proposte plausibile (135, meno dei 621 movimenti
perché le uscite senza codice `26//11` non hanno scadenza candidata), la
transazione di persistenza resta piccola (136 operazioni) a questo volume, e
il fattore codice banca discrimina bene (nessun codice satura il campione).

**Non sappiamo**: se le proposte sono **giuste**. Le scadenze usate qui sono
sintetiche, costruite dallo stesso script che poi le fa incontrare col
movimento che le ha generate — il tasso di correttezza che ne uscirebbe
sarebbe una tautologia, il motore ritroverebbe esattamente ciò che gli è stato
appena costruito sotto.

**Il criterio della spec — "la fascia Alta dev'essere corretta quasi al 100%
su un campione controllato a mano" — resta non misurato**, e non per una
mancanza di questo task: richiede i due lati veri insieme, i movimenti della
banca (che abbiamo) e le fatture che pagano (che in questo repository non ci
sono come file — le 226 vere stanno nel database di produzione). Quella misura
diventa possibile **dopo la Fase 3** dell'open banking, quando i movimenti
sincronizzati si troveranno accanto alle fatture già importate. È lì che va
fatta, prima di costruire la coda della Fase A2 sopra una soglia di 85 non
ancora verificata sul vero.

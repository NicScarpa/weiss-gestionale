# Misurazione del motore di riconciliazione sui movimenti veri

Task 9 della fase A1. Non è una suite di test: è una misurazione. Un test verde
dice "non è esploso"; qui serve sapere *quante* proposte escono, in che fascia,
e quanto costa produrle. Un motore che non trova niente e un motore che
funziona superano gli stessi test finché l'ingresso è vuoto — per questo si
misura su dati veri, non sintetici, il più a lungo possibile.

## I cinque script

- **`snapshot.ts`** — legge gli snapshot GoCardless (`scripts/gocardless/snapshots/*transactions*.json`)
  e restituisce i movimenti deduplicati. Condiviso dai due script sotto.
- **`misura-motore.ts`** — offline, nessun database. Misura cosa si può
  estrarre dalle causali: riferimenti, partite IVA, e la distribuzione dei
  codici operazione della banca.
- **`misura-lotto.ts`** — carica i movimenti veri su un database di prova ed
  esegue `generaLotto`. Misura i fatti meccanici: durata, proposte, fasce,
  dimensione della transazione di persistenza. Richiede
  `TEST_DB_SUFFIX=<qualcosa>`; senza, si rifiuta di partire.
- **`misura-fascia-alta.ts`** — la misura che chiudeva la riserva vera: mette
  i movimenti degli snapshot accanto alle **fatture di produzione** ripristinate
  da un dump, esegue `generaLotto` e stampa le proposte in fascia Alta con
  quanto serve a giudicarle a mano.
- **`verifica-fascia-alta.ts`** — controlla se ciascuna proposta alta poggia su
  un importo **univoco** o se il motore ha scelto fra candidati indistinguibili.

```bash
nvm use 22 && npx tsx scripts/riconciliazione/misura-motore.ts
nvm use 22 && TEST_DB_SUFFIX=ric_a1 npx tsx scripts/riconciliazione/misura-lotto.ts

# I due lati veri insieme (serve un dump di produzione):
DUMP=/percorso/produzione.sql DB_MISURA=misura_alta \
  nvm use 22 && npx tsx scripts/riconciliazione/misura-fascia-alta.ts
DB_MISURA=misura_alta nvm use 22 && npx tsx scripts/riconciliazione/verifica-fascia-alta.ts
```

> **Gli snapshot non sono nel repository.** `scripts/gocardless/snapshots/` è
> gitignorato perché contiene movimenti bancari veri — importi, IBAN, ragioni
> sociali. Da un checkout pulito questi script si fermano con un errore che
> spiega come riottenerli, e **i numeri qui sotto non sono riproducibili in
> locale finché non li si riscarica**. Sono dichiarati, non verificabili da
> chiunque.

> **I blocchi di output di questo documento sono trascrizioni letterali**
> dell'esecuzione del 14 agosto 2026: incollati, non riscritti. Dove un numero
> è commentato a parole il commento è marcato come tale.

## 1. Le causali (`misura-motore.ts`)

Movimenti letti dagli snapshot, deduplicati su `internalTransactionId` (non su
`transactionId`, che collide fra i due conti — 249 collisioni su 678 grezzi
osservate nella Fase 0):

```
Movimenti letti (deduplicati su internalTransactionId): 621

USCITE    392 movimenti — con riferimento:  40 (10.2%)
ENTRATE   229 movimenti — con riferimento:   1 (0.4%)
TUTTI     621 movimenti — con riferimento:  41 (6.6%)

Con una partita IVA nella causale:    16 (2.6%)
Con un codice operazione della banca:  621 (100.0%)
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

### Da questa tabella è nata la mappa dei codici

Questa tabella è la forma grezza; la forma azionabile è
`src/lib/reconciliation/codici-banca.ts`, che `generaLotto` passa come
`mappaCodiciBanca`. **Sei codici su diciannove sono mappati**, e la brevità è il
punto: si mappa solo dove la lettura è univoca, perché una riga troppo larga
regala dieci punti a una coppia che non li merita — e quei punti spingono verso
la fascia Alta, che si approva in blocco senza aprire le schede. Il paragrafo in
fondo a questa sezione spiega perché il rischio sta lì e non nella riga
mancante.

| codice | metodi accettati | perché |
|---|---|---|
| `26//11` | `bonifico` | "BONIFICO TRAMITE INTERNET BANKING" |
| `26//20` | `bonifico` | "VS DISPOSIZIONE PERMANENTE A FAVOR…": un bonifico ricorrente |
| `31//21` | `sdd` | "SDD B2B RICHIESTA INCASSO SEPA…" |
| `31//22` | `sdd`, `carta` | "SDD CORE … AMERICAN EXPR": lo strumento è un SDD, la spesa sottostante è una carta. Due letture corrette dello *stesso* fatto |
| `45//15` | `carta` | "CARTA DEL CREDITO COOPERATIVO…" |
| `19//83` | `f24` | "IMPOSTE E TASSE DELEGA UNIFICATA" |

Restano fuori di proposito: **le commissioni** (`16//37`, `16//33`, `16//32`,
`16//00`, `16//40`) e **gli interessi** (`18//00`), che non pagano una scadenza
per costruzione; **gli emolumenti** (`39//11`, `39//00`), che non passano dallo
scadenzario con un metodo dichiarato; **il giroconto** (`34//00`) e il
**prelievo di contante** (`52//30`), che non pagano nessuno — spostano denaro
fra conti propri, dalla banca alla cassa nel secondo caso, e sono materia della
R5; e **rata mutuo** (`15//10`), **imposta di bollo** (`19//05`) e **utenze
CBILL/PagoPA** (`11//70`), dove il metodo con cui la scadenza viene registrata
non è deducibile dal codice.

**Correzione a quanto scritto sopra nel primo giro**: la frase «una mappatura
sbagliata penalizza attivamente» era una sovrastima.
`punteggioCodiceBanca` restituisce **0 sia per un codice sconosciuto sia per uno
contraddittorio** — nel secondo caso aggiunge una motivazione col segno meno, ma
è una frase, non un punto. **La mappa può solo aggiungere punti, mai toglierne.**
Il rischio quindi si inverte: il pericolo non è la riga mancante, è la riga
troppo larga, che regala dieci punti verso la fascia Alta. È per questo che
`31//21` resta il solo `sdd` anche sapendo che `Schedule.metodoPagamento`, per le
fatture importate, non è la scelta di chi registra ma **il codice SDI dichiarato
dal fornitore** (MP05 → `bonifico`): un fornitore incassato via SDD B2B che
dichiara MP05 si porta dietro una frase fuorviante, e si preferisce quella a dei
punti regalati al metodo più frequente.

`riba` non compare fra i valori: nei 621 movimenti non è mai comparso un codice
riconducibile alla Ri.Ba., e mapparne uno per simmetria sarebbe l'indovinello
che questa scelta evita.

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
Movimenti bancari caricati:     621
Scadenze sintetiche caricate:    96
Periodo interrogato:              2026-05-15 → 2026-08-11
Durata generaLotto:                236 ms
Proposte totali:                   131
  fascia alta:                      0
  fascia media:                     31
  fascia bassa:                    100
Gambe totali (proposte cumulative inc.): 131
Cross-check fasce dal DB coincide con esito.perFascia: sì
Dimensione dell'array passato a $transaction: 132 (= 131 proposte + 1 aggiornamento del contatore)
```

La durata (236 ms per 621 movimenti × 96 scadenze candidate) dice che il
motore gira comodamente su volumi di quest'ordine — non è quello il rischio.
Gambe = proposte significa che nessuna proposta è cumulativa: una gamba
ciascuna.

### Cos'è cambiato dalla prima misurazione, e perché

La prima esecuzione (13 agosto) dava **135 proposte, 35 in fascia media, 100 in
fascia bassa**. Dopo l'ondata di correzione del 14 agosto sono **131, 31, 100**.
La differenza viene da una sola modifica: `contieneRiferimento` ora **ancora la
ricerca del numero documento sulle cifre** — il "432" della fattura non si
trova più dentro l'identificativo operazione, né come prefisso del "4320" di
un'altra. Il falso positivo era stato misurato all'1,63% sui numeri a tre cifre.

Il conto torna così: quattro proposte hanno perso i venti punti del riferimento
e sono scese dalla media alla bassa, e altrettante, che stavano in bassa solo
grazie a quei venti punti, sono cadute sotto la soglia minima di 40 e non
vengono più emesse. *(Questa attribuzione è una lettura dell'aritmetica dei
totali, non una misura riga per riga: il bonus di unicità dipende da quante
alternative restano sopra soglia, quindi può spostare qualcosa di ±5.)*

**La mappa dei codici banca, invece, non ha spostato nulla in questa misura**, e
va detto perché non se ne tragga la conclusione sbagliata: `punteggioCodiceBanca`
esce subito con 0 quando la scadenza non dichiara un metodo di pagamento, e le
scadenze sintetiche di questo script non ne dichiarano uno. Il fattore resta
quindi a zero come prima — ma ora per assenza del dato dall'altro lato, non
perché la mappa sia vuota.

### La correzione del 14 agosto (secondo giro): numeri identici, e non è un buon segno

L'ancoraggio del primo giro era applicato **incondizionatamente**, anche quando
il riferimento comincia o finisce per lettera. `FT/2026/432` — la forma col
prefisso alfabetico, ordinaria in Italia, che arriva tale e quale da
`invoice.invoiceNumber` — diventa `FT2026432`, e `(?<![0-9])` lo rifiutava ogni
volta che la causale aveva una cifra attaccata prima: cioè quasi sempre, perché
queste causali sono dense di cifre. Ogni lato ora si ancora **solo se il bordo
corrispondente del riferimento è una cifra**.

Rilanciando la misurazione: **131 proposte, 0 alta, 31 media, 100 bassa, 132
operazioni. Identici.** E l'assenza di differenza è essa stessa il risultato da
leggere:

> **questa misurazione è cieca a quella classe di difetti per costruzione.**
> `costruisciScadenzeSintetiche` ricava `numeroDocumento` da
> `estraiRiferimentiDocumento`, le cui espressioni regolari catturano
> `\d[\d/\-]{1,15}` — cioè **solo riferimenti che cominciano per cifra**. Un
> numero fattura con prefisso alfabetico non entra mai nel campione sintetico,
> quindi nessun falso negativo di quel tipo poteva comparire nei numeri, né
> prima né dopo.

È lo stesso limite dichiarato in fondo a questo documento, in una forma nuova: i
dati sintetici misurano ciò che li ha generati. Il difetto era reale — un test
dedicato lo riproduce in `causale.test.ts` — ma per vederlo *in una misura*
servono numeri fattura veri, cioè la Fase 3.

### Fascia Alta a zero: attesa, non un allarme

Con questi dati sintetici la fascia Alta (soglia 85) è **strutturalmente
irraggiungibile**, e non per un bug: senza `controparteNome` il fattore
CONTROPARTE (20 punti) resta a zero, e senza `metodoPagamento` sulle scadenze
sintetiche anche CODICE_BANCA (10 punti) resta a zero — `punteggioCodiceBanca`
esce prima di consultare la mappa quando la scadenza non dichiara un metodo.
Il massimo raggiungibile da questi dati è importo (30) + riferimento (20) +
data (13 — il pagamento sintetico cade 5 giorni dopo la scadenza, il ramo
`giorni > 0 && giorni <= 5` di `punteggioData`, non lo `0` che varrebbe 15) +
eventuale bonus di unicità (5) = **68**, sotto la soglia Alta per costruzione.
La distribuzione osservata (0 alta, 31 media, 100 bassa) è quindi coerente con
l'assenza deliberata di due fattori da 30 punti complessivi, non una misura
della qualità del motore.

### La riserva della revisione: dimensione della transazione

**Misurata, non dedotta**: lo script intercetta l'array vero passato a
`prisma.$transaction` dentro `generaLotto` (senza toccare il codice del
servizio). Su 621 movimenti e 96 scadenze candidate la transazione porta
**132 operazioni** in un'unica chiamata. È un ordine di grandezza che
PostgreSQL gestisce senza sforzo all'interno del timeout di default della
forma array di `$transaction` — la riserva aperta dalla revisione (una
transazione enorme che perde tutte le proposte del giro se salta in fondo) è
quindi chiusa **per questo volume**: 132 operazioni non sono "centinaia" nel
senso preoccupante. Resta un fatto strutturale da tenere a mente quando il
volume di movimenti o di scadenze candidate crescerà di un ordine di
grandezza: la forma della transazione non cambia, solo la sua dimensione.

## 3. Cosa sappiamo, e cosa no

**Sappiamo**: il motore gira su 621 movimenti veri in poco più di due decimi di
secondo, produce un numero di proposte plausibile (131, meno dei 621 movimenti
perché le uscite senza codice `26//11` non hanno scadenza candidata), la
transazione di persistenza resta piccola (132 operazioni) a questo volume, e
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

---

# 4. La misura che mancava: la fascia Alta è corretta? (16 agosto 2026)

La sezione 3 chiudeva dicendo che il criterio della spec — «la fascia Alta
dev'essere corretta quasi al 100% su un campione controllato a mano» — restava
**non misurato**, perché servivano i due lati veri insieme e «le 226 fatture
vere stanno nel database di produzione, non come file».

Quel presupposto era aggirabile: un dump di produzione **è** un file. I due lati
si sono incontrati in un database usa-e-getta, senza chiamare GoCardless e senza
scrivere una riga sulla produzione.

## Come

- **Lato fatture**: dump di produzione del 16 agosto (226 fatture vive, 230
  scadenze) ripristinato in un database locale, poi `prisma migrate deploy` per
  allineare lo schema.
- **Lato banca**: i 621 movimenti veri degli snapshot GoCardless della Fase 0,
  caricati come `BankTransaction`.
- `generaLotto` sull'intero periodo, regole R1-R3.

## I numeri

```
Dal dump: 226 fatture, 230 scadenze, sede "Weiss Cafè"
Dagli snapshot: 621 movimenti bancari veri

Lotto generato: 11 alte, 55 medie, 140 basse
```

206 proposte su 621 movimenti.

## Il giudizio sulla fascia Alta

Undici proposte, tutte controllate. Il risultato:

```
  numero di fattura citato nella causale: 11 su 11
  abbinamenti su importo NON univoco:     0

  Nessuna proposta poggia su un importo ambiguo.
```

**Tutte e undici sono corrette.** Ognuna ha importo del movimento identico
all'importo della scadenza, il fornitore della scadenza coincide con la
controparte nominata nella causale, e — il fatto che chiude la questione — **il
numero di fattura compare letteralmente nella causale in tutti e undici i casi**:

```
SDD B2B  ... FATTURA N. EE00874136/2026 ...  Segnoverde S.p.A.
SDD Core ... CINV/F2618801626 ...            Wind Tre S.p.A.
SDD Core ... DOC. 4417/U01 D.M.C. SRL ...    D.M.C. srl
```

### Perché il controllo di ambiguità era necessario

«Importo identico» non prova nulla da solo: se lo stesso importo compare su più
scadenze aperte, il motore ha scelto fra candidati indistinguibili e potrebbe
aver preso il primo. `verifica-fascia-alta.ts` conta, per ogni proposta, quante
scadenze vive condividono quell'importo.

Nove proposte su undici hanno importo **unico** in tutto lo scadenzario. Le due
che non ce l'hanno — le due Wind Tre da 38,60 e 104,28 — portano il numero di
fattura nella causale, quindi la scelta non poggiava sull'importo.

## La conclusione

**La soglia di 85 regge sul vero.** La fascia Alta si può approvare in blocco
senza aprire le schede: è il vincolo che il piano della Fase A1 poneva prima di
costruire la coda della Fase A2, ed è soddisfatto.

## Cosa questa misura NON dice

- **Le fasce Media e Bassa non sono state giudicate.** Il criterio della spec le
  riguarda: si aprono a una a una, ed è lì che va il lavoro umano.
- **Non misura il richiamo**, cioè quante riconciliazioni vere il motore ha
  *mancato*. Direbbe quanto lavoro resta a mano, e richiede di sapere quali dei
  621 movimenti pagano davvero una delle 226 fatture — un lavoro di
  spoglio manuale che questa misura non ha fatto.
- **I movimenti vengono dagli snapshot di Fase 0**, non da una sincronizzazione
  vera: al 16 agosto 2026 la sincronizzazione bancaria non è mai stata eseguita
  in produzione, e `bank_transactions` è vuota.

## Un dato di progettazione, non di correttezza

11 proposte alte su 206 significa che **l'approvazione in blocco della fascia
Alta risolve il 5% del lotto**. Il grosso del lavoro della schermata sarà la
revisione delle 55 medie, non il bottone «approva tutte»: la coda va disegnata
attorno a quel gesto.

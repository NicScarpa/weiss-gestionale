# Riconciliazione assistita, Fase A2 — il primo taglio

Questa spec **non ridisegna** la riconciliazione assistita: quel disegno esiste,
è approvato, e sta in
`docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md`. Qui si
decide **cosa entra nel primo taglio della Fase A2**, alla luce di tre fatti che
il 13 agosto non erano disponibili.

## Cosa è cambiato dal 13 agosto

**1. La sincronizzazione bancaria è stata eseguita.** Il 16 agosto 2026 sono
entrati in produzione **231 movimenti veri** (15 giugno – 14 agosto, 142 uscite e
89 entrate; 2 duplicati riconosciuti e scartati). Cade la decisione 7 della spec
madre — «questa schermata, messa in produzione oggi, non avrebbe nulla da
riconciliare».

**2. La soglia di 85 è misurata, non più stimata.** Il piano della Fase A1
vietava di costruire la coda «sopra una soglia non misurata». La misura è stata
fatta due volte, su popolazioni indipendenti:

| | Snapshot di giugno | Movimenti sincronizzati |
|---|---|---|
| Movimenti | 621 | 231 |
| Proposte | 206 | 85 |
| Fascia Alta | 11 | 7 |
| **Corrette** | **11 su 11** | **7 su 7** |
| Su importo ambiguo | 0 | 0 |

Il primo abbinamento ambiguo compare a **78**, e sono i casi che
un'approvazione in blocco sbaglierebbe in silenzio: un leasing con tre rate
mensili identiche. **85 resta**, non si alza e non si abbassa. Il rapporto
completo è in `scripts/riconciliazione/README.md`, sezioni 4 e 5.

**3. Un difetto del motore vale quasi il doppio della fascia Alta.** Sette
proposte perdono i 20 punti del fattore «riferimento» pur avendo il numero di
fattura nella causale, e **sei di esse entrerebbero in fascia Alta**: da 7 a 13.

---

## Le quattro decisioni di questo taglio

### 1. Prima si corregge il confronto dei riferimenti, poi si costruisce la coda

`contieneRiferimento` normalizza via i separatori — scelta deliberata e giusta,
serve a far combaciare `FT/2026/432` (come sta sulla fattura) con `FT 2026 432`
(come lo scrive la banca). Poi pretende che l'ago non sia delimitato da cifre,
per non riconoscere un numero corto dentro uno lungo.

Le due regole si scontrano **quando la normalizzazione incolla due campi
diversi**:

```
Ft.N.3300/00/2026 30/05/2026   →   FTN[3300002026]30052026
                                                  ↑ la data, incollata
SARATOGA SNC 177 2026          →   SARATOGASNC[177]2026
                                                 ↑ l'anno, incollato
```

*Perché prima e non dopo*: la schermata vale per quanto lavoro toglie di mano.
Correggere questo raddoppia da solo la parte approvabile senza aprire le schede
— più di qualunque cosa si possa mettere nella prima versione della coda.
Ed è piccolo, isolato e misurabile prima e dopo con gli script che già esistono.

*Costo se sbagliata*: si toccano venti punti su cento del fattore più
discriminante. Un allentamento troppo largo porta falsi positivi **dentro la
fascia che si approva in blocco**, che è il posto peggiore. Per questo la
correzione va misurata sui casi veri, non solo sui test.

### 2. Il primo taglio è la coda a scheda singola, non l'approvazione in blocco

7 proposte alte su 85 significa che «Approva tutte le sicure» risolve **l'8%**
del lotto. Il lavoro vero sono le **25 medie**, che si aprono a una a una.

Entrano quindi: la coda, la scheda con fattori e motivazioni, l'approvazione
singola, i due scarti. **Restano fuori**: selezione multipla, `shift+click`,
barra della selezione, approvazione in blocco.

*Costo se sbagliata*: chi ha un lotto grande deve approvare a una a una anche le
sicure. Con 7 proposte alte è un fastidio, non un ostacolo — e la selezione
multipla si aggiunge sopra senza rifare nulla.

### 3. Approvare promuove la riga bancaria a movimento di prima nota

È «l'anello che manca» della spec madre: oggi nessuno crea un movimento di prima
nota partendo da una riga di banca; `manualMatch` collega a un `JournalEntry` che
esiste già.

Questo è coerente con l'invariante fissata il 15 agosto
(`2026-08-15-fatture-non-generano-movimenti-design.md`): *ogni riga di prima nota
corrisponde a un movimento di denaro realmente avvenuto*. Una riga bancaria **è**
un movimento realmente avvenuto — è la fonte più autorevole che esista. Promuoverla
non viola l'invariante: la realizza.

### 4. La riconciliazione a mano e la memoria degli alias restano fuori

Sono la parte più grossa della spec madre (pannello di ricerca dentro la scheda,
punteggio dei candidati, gambe multiple, alias appresi con la casella già
spuntata, schermata degli alias). Vanno fatte, ma **dopo** aver visto la coda in
uso su un lotto vero.

*Costo se sbagliata*: quando la proposta è sbagliata l'unica via è scartarla e
riconciliare dallo scadenzario, che è la strada che esiste oggi. Si perde comodità,
non correttezza.

---

## Cosa si costruisce

### La correzione del confronto

Il difetto è di **confine**, non di normalizzazione: l'ago è presente e
delimitato correttamente nella causale *originale*, ed è solo la rimozione dei
separatori a creare l'adiacenza fra cifre. La correzione deve quindi guardare i
caratteri originali per decidere il confine, non quelli normalizzati.

I sette casi veri diventano test, con i loro dati autentici. Due controesempi
obbligatori, perché la guardia esiste per una ragione:

- un numero di tre cifre che compare **dentro** un identificativo lungo deve
  continuare a **non** contare;
- il caso `FT 319` per la fattura `FDI/0000319` — dove nella causale c'è solo il
  suffisso numerico — resta **fuori**: è un problema diverso e più rischioso, e
  qui non si affronta.

### La schermata

Segue la spec madre, sezione «La schermata», limitatamente a:

- **la pagina d'ingresso**: due date, «Quest'anno» e «Tutto», «Calcola Proposte»;
- **lo stato di attesa didattico**: l'elenco delle regole con sigla e descrizione;
- **la coda** ordinata per punteggio decrescente, con il filtro per fascia;
- **la scheda**: a sinistra il movimento con la causale intera, a destra la
  scadenza con la sua fattura; sotto, la barra segmentata dei sei fattori e le
  frasi di motivazione, che il motore già produce nella forma
  `{testo, segno}` — vanno mostrate, non ricostruite;
- **le azioni**: *Approva*, *Salta per ora*, *Non propormelo mai più*;
- **lo Storico Analisi** in fondo, con «Riprendi».

### Cosa mostra la scheda, per intero

Il motore persiste già tutto ciò che serve. Da una proposta vera:

```
punteggio 98
fattori    data 15 · importo 30 · unicita 5 · codiceBanca 10 · controparte 18 · riferimento 20
✓ Importo identico al residuo
✓ Nome della controparte presente nella causale
✓ Il codice operazione della banca concorda col metodo atteso
✓ Riferimento della fattura presente nella causale
✓ Pagato il giorno di scadenza
✓ Unico abbinamento possibile
```

Le motivazioni negative si mostrano insieme alle positive, col loro segno: è
guardando *cosa manca* che si decide se fidarsi.

---

## Come si prova

**Il banco di prova è quello vero.** `misura-fascia-alta.ts` e
`verifica-fascia-alta.ts` esistono e girano su un dump di produzione più i
movimenti sincronizzati: la correzione dei riferimenti va misurata **prima e
dopo**, e il numero atteso è dichiarato — la fascia Alta passa da 7 a 13.

Il criterio di accettazione della correzione non è «i test passano» ma **le sei
proposte previste entrano in fascia Alta e nessun'altra**, verificato con gli
script sui dati veri.

Per la schermata: test di integrazione sulle rotte di approvazione e scarto, e
prova in un browser su un lotto vero, perché il layout non lo vede nessun test.

---

## Fuori perimetro, e perché

- **Selezione multipla e approvazione in blocco** — decisione 2.
- **Riconciliazione a mano, ricerca nella scheda, alias appresi** — decisione 4.
- **R4 (banca ↔ prima nota) e R5 (giroconto)**: hanno forma diversa, non c'è una
  scadenza a destra, e la spec madre chiede un task ciascuna.
- **`raggruppaConflitti`**: serve all'approvazione in blocco per decidere cosa
  marcare superato. Senza quella, sarebbe codice esportato e mai chiamato.
- **L'AI revisore**: è la fase B, e ha senso solo su un motore già tarato.
- **Il richiamo del motore** — quante riconciliazioni vere ha mancato — resta non
  misurato: richiede uno spoglio manuale dei 231 movimenti contro le 226 fatture.
- **Il caso `FT 319` → `FDI/0000319`**: il suffisso numerico senza il prefisso del
  gestionale del fornitore. Vale altri punti, ma è un allentamento più largo e
  merita la sua misura.

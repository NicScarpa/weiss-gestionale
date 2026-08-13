# Cash King — Analisi UI/UX per pattern

Analisi granulare dell'interfaccia, organizzata per pattern trasferibili anziché
per schermata. Fonti: i sei documenti di area funzionale, l'inventario delle
rotte, le logiche di calcolo e gli screenshot in
`assets/cashking/screenshots/`.

Convenzione dei tag come negli altri documenti: `[OSSERVATO]` = visto
direttamente in interfaccia o negli screenshot · `[VERIFICATO]` = confermato da
un esperimento con input noti o da una ricerca esaustiva dichiarata ·
`[DEDOTTO]` = ricostruito con ragionamento · `[IPOTESI]` = congettura da
validare.

> **Revisione dell'11 agosto.** La prima stesura di questo documento era scritta
> in gran parte su appunti e screenshot, e uno screenshot non si può cliccare:
> mancavano perciò proprio le cose che il metodo chiede sotto le voci *Tabelle*
> e *Feedback* — toast, annullamento, salvataggio automatico, aggiornamenti
> ottimistici, editing inline, viste salvate, scorrimento infinito, scheletri di
> caricamento. Sono state misurate una per una con tre strumenti: un osservatore
> delle mutazioni del DOM per catturare i messaggi effimeri, un intercettore su
> `window.fetch` che rallenta la rete di quattro secondi per rendere visibili
> gli stati di attesa, e la lettura del bundle applicativo (7,2 MB) per le
> risposte che richiedono una **ricerca esaustiva** — «questa cosa non esiste
> da nessuna parte» è un'affermazione che si può fare solo così. Dove la nuova
> evidenza smentisce una deduzione precedente, la smentita è dichiarata invece
> che nascosta: è successo per il sistema di elevazione al passaggio del mouse
> (cap. 8.4), che non esiste, e per la profondità del drill-down (cap. 7.1), che
> si ferma un livello prima di quanto pensassi.

**Perché le traduzioni sono possibili.** `[OSSERVATO]` Il prodotto analizzato
usa il nostro stesso stack di presentazione: React con Tailwind, variabili di
tema in stile shadcn/ui (nel DOM compaiono `text-muted-foreground` e
`hover:text-foreground`) e icone lucide. Il nostro gestionale è Next.js 14 App
Router, React, Tailwind, shadcn/ui, con backend Next.js e Prisma su PostgreSQL.
Ogni accorgimento è quindi traducibile in un componente shadcn preciso, in una
rotta di `src/app/(dashboard)/` e, dove serve, in una modifica di
`prisma/schema.prisma`. Dove non riesco a immaginare una traduzione concreta lo
dico esplicitamente invece di scrivere una genericità.

**Nota di lettura.** Il copy del prodotto non è riprodotto integralmente: le
etichette sì, riportate fedelmente perché sono la parte utile.

---

## 1. Architettura informativa

### 1.1 Il menu è raggruppato per verbo, non per entità

`[OSSERVATO]` La barra laterale ha cinque voci di primo livello senza gruppo —
Dashboard, Cash Command, Scadenziario, Tesoreria, Riconciliazione Assistita —
seguite da otto gruppi richiudibili: Pianificazione, Fatture e Movimenti,
Solleciti, Modulo Retail, Importazione Dati, Anagrafica, Stampe, Impostazioni.

`[DEDOTTO]` La divisione non è fra oggetti e oggetti, ma fra **le cose che
guardi ogni mattina** e **le cose che gestisci quando serve**. Le cinque voci
piatte sono tutte viste di lettura sulla liquidità; i gruppi contengono
inserimento, configurazione e archivio. Un utente di tesoreria apre il prodotto,
guarda i primi cinque link e ha finito la sua giornata tipo.

`[OSSERVATO]` Un solo gruppo è espanso all'ingresso, «Fatture e Movimenti», e
contiene otto voci. Gli altri sette restano chiusi.

`[DEDOTTO]` Aprire di default il gruppo delle scritture — e solo quello —
dichiara qual è il secondo lavoro più frequente dopo la lettura: inserire e
correggere documenti. Non è una scelta neutra ma una raccomandazione implicita.

`[OSSERVATO]` Accanto a «Solleciti» e «Modulo Retail» compare una piccola corona
gialla. Sono i due gruppi bloccati da addon. Il modulo fiscale F24, invece, è
configurato con `hideIfNoSubscription: true` e **non compare affatto** nel menu.

`[DEDOTTO]` Due trattamenti diversi per la stessa condizione commerciale: alcuni
addon si vedono e invitano all'acquisto, uno si nasconde. `[IPOTESI]` La
differenza sta nel rapporto fra prezzo e pubblico: un addon da 2,99 € si mostra
a tutti perché quasi tutti potrebbero comprarlo, uno da 19,99 € riservato a due
piani su tre si nasconde a chi non può attivarlo comunque.

### 1.2 La fascia dei quattro indicatori, e cosa costa

`[OSSERVATO]` Sotto l'intestazione, su **ogni** rotta applicativa, resta una
fascia con quattro numeri: Saldo Attuale, Saldo Disponibile, Saldo a Fine Mese,
Previsione Cassa. Si vede identica negli screenshot 03, 04, 05, 06, 07, 08 e 09,
cioè sul gate di un addon, sul cruscotto, sullo scadenziario, su Cash Command,
sulla Tesoreria e su entrambi gli stati della riconciliazione.

Ogni indicatore ha un'icona quadrata colorata a sinistra, un'etichetta minuscola
in due righe e il valore in grassetto colorato. A destra della fascia: «Aiuto»,
«Supporto», selettore lingua «IT» e il campanello delle notifiche.

`[DEDOTTO]` È la dichiarazione di che prodotto vuole essere: qualunque cosa tu
stia facendo — perfino leggere una pagina di upsell — la posizione di cassa
resta sotto gli occhi. In un gestionale contabile l'utente si perde nelle
schermate di inserimento e dimentica il quadro; qui il quadro non si può
dimenticare.

**Il costo, misurato.** `[OSSERVATO]` Sullo screenshot 04, che è un viewport da
1280×806, prima del titolo «Dashboard» ci sono: il banner promozionale
(≈64 px), la fascia dei quattro indicatori (≈56 px) e il margine, per un totale
di circa 145 px. Aggiungendo il banner interno «Dati di esempio attivi» e
l'Acid Test, il primo dato di merito — la scheda «Saldo a Fine Mese» — comincia
a **355 px** dall'alto. Restano circa 450 px utili, cioè una fila e mezza di
schede.

`[DEDOTTO]` La fascia costa circa il 7% dell'altezza su desktop e sarebbe
insostenibile su mobile, dove quattro numeri affiancati non ci stanno.
`[VERIFICATO]` Misurato a 390 px: la fascia **sparisce del tutto**.
L'elemento `header-current-balance` resta nel DOM ma ha larghezza zero. Non si
riduce e non scorre: viene abbandonata. Dettaglio nel capitolo 13d.

`[OSSERVATO]` Sul bordo destro della fascia, in tutti gli screenshot dal 04 in
poi, si intravede una «v» tagliata a metà dal margine della finestra. È un
elemento in trabocco orizzontale, presumibilmente il selettore dell'azienda o
del profilo che non trova spazio a 1280 px.

**Come lo faremmo.** La fascia è replicabile a costo bassissimo perché il nostro
layout ha già un punto unico dove metterla: `src/app/(dashboard)/layout.tsx`. Un
server component che legge saldo e proiezioni una volta sola e le passa a una
striscia di quattro `Card` compatte. La cautela da avere è quella che loro non
hanno avuto: **un solo endpoint** per quei quattro numeri, non uno per pagina
(vedi capitolo 12.3). Sotto `md:` la striscia va sostituita da un unico valore —
il saldo disponibile — con il resto in un `Sheet` a scomparsa.

### 1.3 Tre viste diverse sullo stesso oggetto

`[OSSERVATO]` Liquidità e previsionale vivono in tre rotte separate con tre
endpoint distinti: `/dashboard` (aggregato, mese corrente più 90 giorni),
`/cash-command` (movimento per movimento, 30 giorni avanti), `/cash-control-room`
detta «Tesoreria» (giorno per giorno e conto per conto, finestra scelta).

`[DEDOTTO]` È una separazione per **grana**, non per funzione: lo stesso dato a
tre livelli di zoom. La scelta è difendibile — un direttore finanziario vuole
l'aggregato, un tesoriere vuole la griglia giornaliera — ma ha prodotto il
difetto più grave del prodotto, cioè tre risposte diverse a «quanto ho in banca»
(capitolo 12.3).

**Come lo faremmo.** Non tre rotte ma una sola, `/cash-flow`, con un selettore
di grana a tre posizioni (mese / movimento / giorno) che cambia la
visualizzazione mantenendo **una sola funzione di calcolo** in
`src/lib/`. Il nostro schema ha già `CashFlowForecast` e `CashFlowForecastLine`:
le tre viste sono tre modi di aggregare le stesse `lines`, non tre query.

---

## 2. Densità informativa: quando tabella, quando scheda, quando grafico

`[OSSERVATO]` Il prodotto sceglie la forma in modo abbastanza sistematico.

| Forma | Dove compare | Cosa contiene |
|---|---|---|
| Scheda con un numero grande | Fascia in testata, indicatori di Cash Command, indicatori dello Scadenziario | Una grandezza sola, con etichetta e variazione |
| Scheda con addendi | «Saldo a Fine Mese» e «Previsione Cassa» sul cruscotto | Un risultato e le righe che lo compongono |
| Scheda a quattro celle | DSO e DPO sullo Scadenziario | Una grandezza in quattro varianti di calcolo |
| Tabella riga per riga | Movimenti di Cash Command, lista fatture | Documenti da leggere e da filtrare |
| Griglia a matrice | Tesoreria, giorni in colonna e metriche in riga | Serie temporali corte da confrontare in verticale |
| Elenco richiudibile | Scadenze per mese | Aggregati che si aprono sul dettaglio |
| Grafico | Previsione Flusso di Cassa, Radar di Liquidità | Andamenti lunghi e confronto fra serie |

`[DEDOTTO]` La regola implicita è: **il grafico non porta mai un dato che serva
leggere con precisione**. Sotto il Radar di Liquidità, in chiaro e in testo, c'è
«Punto minimo: 170.720,95 € (20 ago 2026)». Il grafico mostra la forma della
curva; il numero che serve per decidere sta scritto. È l'accorgimento più
maturo del prodotto in materia di visualizzazione, e il più facile da ignorare.

`[OSSERVATO]` La Tesoreria usa una matrice, non una tabella: le colonne sono i
giorni (`LUN 10/08`, `MAR 11/08`…) e le righe sono le metriche. È l'inverso della
disposizione consueta.

`[DEDOTTO]` Con sette giorni e nove metriche la matrice sta in una schermata,
mentre la stessa informazione come tabella richiederebbe sette righe per nove
colonne e obbligherebbe a leggere in orizzontale. La trasposizione funziona
perché le metriche sono **poche e fisse** e i giorni sono **molti e omogenei**.
Non è generalizzabile: con trenta o novanta giorni di finestra la griglia deve
scorrere in orizzontale, e negli screenshot ho solo la finestra a sette giorni.

**Come lo faremmo.** La griglia trasposta è replicabile con `Table` di shadcn e
un contenitore `overflow-x-auto`, con la prima colonna in `sticky left-0`. Serve
per il nostro `/cash-flow` a grana giornaliera. Il costo vero non è il
componente ma la query: nove metriche × N giorni vanno calcolate lato server in
una passata sola, altrimenti la vista diventa N chiamate.

---

## 3. Tabelle

### 3.1 Colonne di default e loro ordine

`[OSSERVATO]` La tabella dei movimenti di Cash Command ha, nell'ordine: Data ·
Stato · Descrizione · Controparte · Banca · Categoria · Impatto Liquidità ·
Saldo Banca · Saldo Progressivo.

`[DEDOTTO]` L'ordine racconta una frase: *quando*, *quanto è affidabile*, *cosa
era*, *con chi*, *su quale conto*, *di che tipo*, *quanto sposta*, *dove lascia
il conto*, *dove lascia l'azienda*. Le tre colonne finali sono la parte
originale: non descrivono il movimento, descrivono **l'effetto** del movimento,
prima locale e poi consolidato. Un estratto conto ordinario si ferma alla
seconda.

`[OSSERVATO]` Nella lista fatture, emissione e scadenza stanno in **una sola
colonna** intitolata «Emissione e scadenza».

`[DEDOTTO]` È una scelta di densità precisa. Le due date si leggono quasi sempre
insieme — la distanza fra loro *è* il termine di pagamento — e separarle
costerebbe una colonna intera per un dato che nessuno ordina né filtra da solo.
Accorpandole, la colonna guadagnata va a «Emissione e scadenza» come coppia
leggibile. Il prezzo è che non si può ordinare per una delle due; `[IPOTESI]`
l'ordinamento avviene per scadenza, che è quella operativamente rilevante.

**Come lo faremmo.** Nella nostra lista fatture, una cella con due righe: la
data di emissione in `text-muted-foreground text-xs` sopra e la scadenza in
`font-medium` sotto, con l'intestazione «Emissione e scadenza». Se ci serve
l'ordinamento su entrambe, un `DropdownMenu` sull'intestazione con due voci
invece della freccia singola.

### 3.2 Selettore delle colonne, filtri, tab, azioni in blocco

`[OSSERVATO]` Sopra la tabella di Cash Command: un selettore «Colonne», un
pulsante «Excel», il contatore «90 movimenti» e la paginazione «20 di 90». I
filtri di stato sono sei pulsanti: **Consolidato · Completo · Previsto ·
Provvisorio · Non riconciliato · Tutti**.

`[DEDOTTO]` Cinque stati più «Tutti», esposti come pulsanti sempre visibili e
non come voci di una tendina. La differenza conta: una tendina nasconde
l'esistenza degli stati, i pulsanti la insegnano. Un utente che vede sei
pulsanti impara in tre secondi che «previsto» e «provvisorio» sono cose diverse.

`[OSSERVATO]` Nella riconciliazione i filtri sono quattro pillole colorate —
`Tutte (10)`, `Alta (0)`, `Media (0)`, `Bassa (1)` — ognuna con il proprio
contatore e con il colore della fascia che rappresenta: verde per Alta, ambra
per Media, rosso per Bassa.

`[DEDOTTO]` Il contatore dentro il filtro evita il clic a vuoto: si vede prima
di filtrare che «Alta» è vuota. Il colore nella pillola rende il filtro anche
una legenda. Due funzioni in un elemento solo, a costo zero.

`[OSSERVATO]` L'azione in blocco è una sola e ha un nome che dice cosa fa:
«Approva Tutte le Sicure», con icona di spunta cerchiata, posizionata a destra
sulla stessa riga dei filtri.

`[DEDOTTO]` Non è «seleziona tutto e poi agisci», che è il pattern consueto: è
un'azione già circoscritta dalla soglia di confidenza. All'utente non si chiede
di costruire la selezione, gli si offre la selezione che ha senso. È più
sicuro — non può approvare per sbaglio un abbinamento dubbio — e più veloce.

**Come lo faremmo.** Sulla nostra `/riconciliazione`, i filtri come `Badge`
cliccabili con il conteggio già nella label, calcolato nella stessa query che
carica le proposte. L'azione in blocco come `Button` che chiama una route
handler dedicata con la soglia come parametro server-side, non come lista di id
costruita dal client: così il numero di righe toccate non dipende da cosa il
client credeva di aver selezionato.

### 3.3 Paginazione ed esportazione

`[OSSERVATO]` Paginazione classica, «20 di 90», con contatore separato «90
movimenti». Esportazione in Excel presente sulla vista movimenti.

`[DEDOTTO]` Nessun caricamento progressivo allo scorrimento. Per un lavoro di
tesoreria è la scelta giusta: l'utente vuole sapere quante righe deve lavorare e
poterne dichiarare la fine, cosa che lo scorrimento infinito nega.

`[VERIFICATO]` L'ordinamento per colonna esiste ed è descritto in 3.4. Lo
scorrimento infinito invece non esiste in nessun punto del prodotto: il termine
`useInfiniteQuery` non compare mai nei 7,2 MB del bundle applicativo, e le
quattro occorrenze di `InfiniteQuery` appartengono al codice interno di
react-query, non a codice dell'applicazione. La dimensione di pagina è
scegliibile e vale 20 di default, memorizzata sia in una chiave globale
`cashking_pageSize` sia dentro la configurazione di ciascuna tabella.

### 3.4 Ordinamento: server-side, con un terzo stato che non torna al punto di partenza

`[VERIFICATO]` Cliccando l'intestazione «Importo Lordo» sulla lista fatture, la
richiesta che parte è

```
/api/invoices/paginated?type=supplier&page=1&pageSize=20&sortField=amount&sortDirection=asc
```

quindi **l'ordinamento è calcolato dal server**, non riordinando le venti righe
già scaricate. Sono ordinabili Numero Fattura, Fornitore, Emissione e scadenza,
Imponibile e Importo Lordo; non lo sono % IVA, File e Azioni.

`[OSSERVATO]` L'indicatore visivo è un'icona lucide che cambia con lo stato:
`chevrons-up-down` al 50% di opacità quando la colonna non ordina — cioè
l'affordance è **sempre visibile**, su tutte le colonne ordinabili, anche prima
di toccarle — e `chevron-up` a piena opacità sulla colonna attiva.

⚠️ `[VERIFICATO]` Il ciclo dei clic ha tre stati, e il terzo è sbagliato. Ho
registrato le tre richieste in sequenza sulla stessa colonna:

| Clic | Richiesta | Effetto |
|---|---|---|
| 1° | `sortField=amount&sortDirection=asc` | crescente per importo |
| 2° | `sortField=amount&sortDirection=desc` | decrescente per importo |
| 3° | `sortField=date&sortDirection=asc` | torna alla colonna di default… ma crescente |

Lo stato iniziale della tabella era `sortColumn: null, sortDirection: "desc"`.
Dopo il terzo clic è `sortColumn: null, sortDirection: "asc"`: il terzo clic
azzera la **colonna** ma non la **direzione**, e l'utente che clicca tre volte
per «togliere l'ordinamento» si ritrova la lista rovesciata rispetto a come
l'aveva trovata — le fatture più vecchie in cima invece delle più recenti.
Verificato leggendo la prima riga prima e dopo: da una fattura datata 08/09/26 a
una datata 17/04/26.

`[VERIFICATO]` L'ordinamento **persiste** al ricaricamento, ma in
`localStorage` e non nell'URL, con una chiave per tabella e per scheda:
`cashking_table_invoices_supplier` e `cashking_table_invoices_customer` sono
due oggetti distinti. Vale quanto detto al capitolo 13c: la vista non è
condivisibile con un collega, e sopravvive silenziosamente alla chiusura del
browser.

⚠️ `[VERIFICATO]` Le intestazioni ordinabili sono `<div>` con
`className="cursor-pointer"`, **senza** `tabindex`, senza `role` e senza
`aria-sort`. Non si raggiungono con il tasto Tab e non si annunciano come
ordinabili: l'ordinamento è un'affordance solo per chi usa il mouse e vede lo
schermo.

**Come lo faremmo.** L'ordinamento lato server è la scelta giusta e la
copiamo — ordinare venti righe su novanta darebbe un ordine falso. Le
differenze: lo stato va in `useSearchParams` invece che in `localStorage`, così
`?ordina=importo&verso=desc` si incolla in una chat; il ciclo dei clic ha due
stati e non tre, perché il terzo non serve a nessuno e qui è per giunta rotto;
e l'intestazione è un `<button>` dentro un `<th aria-sort="ascending">`, che
costa quanto il `<div>` e funziona da tastiera.

### 3.5 Colonne: nascondibili e ridimensionabili, non riordinabili

`[VERIFICATO]` Il pulsante «Colonne» apre un menu «Colonne Visibili» con dieci
voci a spunta. Sulla scheda Fornitori sono attive di default sette — Numero
Fattura, Fornitore, Emissione e scadenza, Imponibile, % IVA, Importo Lordo,
File — e ne restano tre spente: **Categoria, Descrizione e Stato**. La colonna
Azioni non compare nel menu: non è nascondibile.

`[OSSERVATO]` Che «Stato» sia nascosto di default è la scelta più discutibile
delle tre: è il dato che distingue una fattura pagata da una scaduta. Il
prodotto lo compensa altrove — la lista si filtra per stato e i totali di
testata separano crediti e debiti — ma chi guarda la tabella non vede in che
stato è ciascuna riga finché non va a cercarsi l'opzione.

`[VERIFICATO]` La scelta si salva da sola in `localStorage`, senza conferma e
senza messaggio, e sopravvive al ricaricamento. Riattivando «Stato» la colonna
compare **al posto giusto** — fra Importo Lordo e File — e non in coda, benché
nella memoria l'elenco la registri in fondo: l'ordine di visualizzazione è
fissato dal componente. Da cui: **le colonne non si possono riordinare**, solo
mostrare e nascondere.

⚠️ `[OSSERVATO]` Il menu **si chiude a ogni spunta**. Per mostrare tre colonne
bisogna aprirlo tre volte. È il comportamento predefinito di Radix, che si
disattiva con una riga (`onSelect: e => e.preventDefault()`).

`[VERIFICATO]` Le colonne si **ridimensionano** trascinando: ogni intestazione
contiene una maniglia `<div class="absolute right-0 top-0 bottom-0 w-1
cursor-col-resize hover:bg-primary/50">`. Trascinando il bordo di «Imponibile»
la colonna è passata da 110 px a 168 px e la misura è finita in
`columnWidths: { netAmount: 168 }` nella memoria locale, con una scrittura
ritardata di circa un secondo rispetto al rilascio del mouse.

⚠️ `[OSSERVATO]` La maniglia è larga **un pixel**. È il bersaglio più piccolo
di tutta l'interfaccia, e la sola indicazione che esista è il cambio di cursore
quando ci si finisce sopra per caso.

### 3.6 Editing inline: non esiste `[VERIFICATO]`

Ricerca esaustiva sul bundle applicativo: le otto occorrenze di `onDoubleClick`
appartengono tutte al sistema di eventi di React e alla libreria di grafici
Recharts, nessuna a codice dell'applicazione; `isEditing`, `editingId` e
`setEditing` non compaiono mai. L'unica occorrenza di `editingRow` è una
**prop di un dialogo** (`{open, onOpenChange, direction, …, editingRow}`).

Confermato a schermo: la modifica di una fattura passa sempre dal pulsante
matita della riga, che apre la finestra «Modifica Fattura» con tutti i campi.
Non esiste modo di correggere un importo restando nella tabella.

`[DEDOTTO]` Per un prodotto di tesoreria è una rinuncia costosa. Le correzioni
tipiche — una data di scadenza, una categoria, una descrizione — sono
monocampo, e farle passare da una finestra con venti campi significa quattro
interazioni invece di una. È anche il motivo per cui esiste la «Modifica
Multipla» descritta in 3.8: senza editing inline, la modifica in blocco diventa
l'unica via rapida.

### 3.7 Viste salvate: non esistono `[VERIFICATO]`

Nessuna occorrenza di `savedView`, `SavedView` o affini nel bundle, e nessuna
affordance nell'interfaccia di `/invoices`, `/transactions` e `/cash-command`.
Una combinazione di filtri non si può nominare né richiamare: si può solo
lasciarla attiva, che è esattamente il modo in cui produce il danno descritto
al capitolo 13c.

### 3.8 Azioni in blocco: due, di cui una molto potente

`[OSSERVATO]` Spuntando la casella in intestazione compare una barra con il
conteggio — «20 fatture selezionate» — e tre comandi: **Modifica Multipla**,
**Elimina Selezionate**, **Annulla**.

`[VERIFICATO]` «Modifica Multipla» non è una modifica di un campo solo: la
chiamata costruita dal client accetta `type`, `status`, `categoryId`,
`description`, `dueDate`, `paymentTermId` e `crossCountry`, ognuno con un valore
sentinella `no_change` che lo esclude dall'aggiornamento. Si possono quindi
riclassificare venti fatture, spostarne la scadenza e cambiarne il regime
territoriale in un colpo solo.

`[DEDOTTO]` La sentinella `no_change` è l'accorgimento che rende il modulo
leggibile: ogni campo ha tre stati — lascia com'è, svuota, imposta a — e
l'utente non deve chiedersi se un campo lasciato vuoto significhi «non toccare»
o «cancella». È lo stesso problema che abbiamo noi ogni volta che facciamo un
aggiornamento parziale.

⚠️ `[OSSERVATO]` La selezione con «seleziona tutto» prende le **venti righe
della pagina corrente**, non le quarantuno del filtro, e la barra dice «20
fatture selezionate» senza offrire «seleziona tutte le 41». Su una lista
paginata è la fonte classica dell'operazione a metà.

⚠️ `[VERIFICATO]` La cancellazione in blocco (`DELETE /api/invoices/bulk-delete`)
non emette alcun messaggio di esito: la sua funzione di successo invalida sette
query e chiude la barra, senza toast. La cancellazione singola invece il toast
ce l'ha (capitolo 6.5).

---

## 4. Selezione dei periodi: tre modi diversi nello stesso prodotto

Questo è il capitolo più istruttivo, perché il prodotto ha risolto lo stesso
problema tre volte in tre modi, e i tre modi non sono equivalenti.

### 4.1 Il cruscotto: quattro combo

`[OSSERVATO]` Il grafico «Previsione Flusso di Cassa» si governa con quattro
menu a tendina — mese di inizio, anno di inizio, mese di fine, anno di fine — più
tre scorciatoie: «Anno scorso», «Quest'anno», «Anno prossimo».

`[DEDOTTO]` Quattro interazioni per definire un intervallo, con la possibilità
di comporre un intervallo invertito o assurdo. È il modo più costoso e il meno
protetto dei tre.

### 4.2 Cash Command: scorciatoie asimmetriche

`[OSSERVATO]` Quattro preset: «Mese corrente», «Storico 30gg + Prev. 90gg»,
«Prossimi 3 mesi», «Tutto».

`[DEDOTTO]` Il secondo preset è il pezzo interessante. Nessun selettore da/a
produce naturalmente una finestra **asimmetrica intorno a oggi**: bisogna
pensarci, calcolare due date e digitarle. Eppure è esattamente la finestra della
tesoreria — poco passato per il contesto, molto futuro per la decisione. Il
preset non è una scorciatoia a un'operazione facile, è l'unico accesso pratico a
un'operazione che altrimenti nessuno farebbe.

### 4.3 Tesoreria: ancora più ampiezza

`[OSSERVATO]` Due gruppi di pulsanti mutuamente esclusivi, con etichette in
maiuscoletto:

- **PARTE DA**: Oggi · −15 giorni · −30 giorni · −60 giorni
- **DURATA FINESTRA**: 7 · 14 · 30 · 60 · 90 giorni

Negli screenshot sono attivi «Oggi» e «7 giorni», evidenziati in verde acqua
pieno su fondo chiaro.

`[DEDOTTO]` Due decisioni indipendenti e ortogonali, quattro per cinque uguale
venti combinazioni, tutte valide per costruzione: non esiste modo di comporre un
intervallo invertito. Ogni scelta è un clic solo e le due dimensioni non si
interferiscono.

### 4.4 Qual è il migliore

**Il terzo, l'ancora più ampiezza, ed è il migliore per quattro ragioni
distinte.**

1. **È relativo, quindi non scade.** Due date assolute vanno reimpostate il
   giorno dopo; «da oggi, 30 giorni» è ancora giusto la settimana prossima. Per
   una vista che si riapre ogni mattina è la differenza fra uno strumento e un
   compito.
2. **Non ammette stati invalidi.** Non c'è combinazione che produca una finestra
   negativa o vuota, quindi non serve validazione né messaggio d'errore.
3. **Costa un clic per dimensione, e le dimensioni sono le due che l'utente ha
   davvero in testa**: da dove guardo, e quanto lontano. Le quattro combo del
   cruscotto chiedono la stessa cosa in quattro mosse e in una grammatica
   (mese/anno) che non è quella del ragionamento.
4. **È serializzabile in modo leggibile.** `?da=oggi&giorni=30` sopravvive a un
   segnalibro e a un link condiviso con significato immutato, mentre
   `?from=2026-08-11&to=2026-09-10` invecchia.

Il secondo modo, i preset asimmetrici, è complementare e non alternativo: va
tenuto come **riga di scorciatoie sopra** i due gruppi, per i casi che le due
dimensioni non coprono. Il primo modo, le quattro combo, non ha ragione di
esistere se non per selezionare periodi storici lontani, e anche lì un unico
selettore di intervallo su calendario farebbe meglio.

**Come lo faremmo.** Il componente `toggle-group` **non è presente** in
`src/components/ui/` — verificato, la cartella ha 34 primitive e quella manca.
Va aggiunto con `npx shadcn@latest add toggle-group`. Poi un componente
`<PeriodoAncoraAmpiezza>` con due `ToggleGroup type="single"`, lo stato in
`useSearchParams` più `router.replace` per la persistenza nell'URL, e la
traduzione in date fatta **una volta sola lato server** nella route handler, non
nel client. Va su `/cash-flow` e su `/scadenzario/aging`. È mezza giornata di
lavoro.

---

## 5. Stati: vuoto, caricamento, errore

### 5.1 Lo stato di attesa didattico della riconciliazione

`[OSSERVATO]` Prima di lanciare l'analisi, `/assisted-reconciliation` non mostra
un vuoto ma una spiegazione (screenshot 08): un'icona grande e tenue al centro,
il titolo «Seleziona un periodo e avvia l'analisi», un paragrafo che dichiara
cosa farà il motore e che il punteggio va da 0 a 100, e sotto **le sei regole di
abbinamento** in altrettante schede ambra, ciascuna con la sigla in un badge
grigio (R1…R6), una spunta verde in alto a destra, il titolo con il simbolo «↔»
e una riga di descrizione.

`[DEDOTTO]` Questo è il pattern più sottovalutato del prodotto. Lo spazio che
quasi ovunque ospita un'illustrazione decorativa e un «nessun dato» viene qui
usato per rispondere alla sola domanda che l'utente ha in quel momento: *cosa
succede se premo quel pulsante?* Il momento in cui la pagina è vuota è
esattamente il momento in cui l'utente è disponibile a leggere, perché non ha
altro da fare. Ed è il momento in cui si costruisce la fiducia in un motore
automatico: dichiarare le regole **prima** trasforma «il software ha deciso» in
«il software ha applicato R4», che è contestabile e quindi credibile.

`[OSSERVATO]` Le sei schede sono disposte su una griglia a cinque colonne, per
cui R6 resta da sola su una seconda riga, centrata. È un difetto minore di
impaginazione: sei elementi su una griglia a tre o sei colonne starebbero
allineati.

`[OSSERVATO]` Ogni scheda regola ha una spunta verde. `[IPOTESI]` indica che la
regola è attiva e potrebbe essere disattivabile; nulla negli screenshot conferma
che sia cliccabile. Se non lo è, la spunta è decorativa e promette
un'interattività che non c'è.

### 5.2 Stati vuoti con dati precaricati

`[OSSERVATO]` Sul cruscotto, con il dataset dimostrativo attivo e 81 fatture in
archivio, compaiono comunque «Nessuna spesa in questo periodo» e «Nessun gruppo
clienti configurato».

`[DEDOTTO]` Sono due vuoti di natura diversa mostrati con la stessa forma, ed è
un errore.

- «Nessuna spesa in questo periodo» è un **vuoto di filtro**: i dati esistono, il
  periodo scelto non ne contiene. La risposta utile è allargare il periodo, e
  quel messaggio non lo suggerisce.
- «Nessun gruppo clienti configurato» è un **vuoto di configurazione**: la
  funzione non è mai stata impostata. La risposta utile è un pulsante che porta
  a configurarla.

Trattarli allo stesso modo spreca l'occasione in entrambi i casi. Il secondo, in
particolare, è la stessa situazione dell'etichetta «Manca fido» (capitolo 9.4),
che invece è risolta bene: l'invito alla configurazione nel punto in cui il dato
manca. Il prodotto conosce il pattern giusto e non lo applica dappertutto.

**Come lo faremmo.** Un solo componente `<StatoVuoto>` con una prop `motivo` a
tre valori — `filtro`, `configurazione`, `davvero-vuoto` — che seleziona il testo
e l'azione: per `filtro` un pulsante che allarga il periodo, per
`configurazione` un `Link` alla pagina di impostazioni corrispondente, per
`davvero-vuoto` il messaggio asciutto. Trenta righe, riutilizzabile su tutte le
nostre liste.

### 5.3 Caricamento: nessuno scheletro, e per un secondo mostra zero

Questi stati sono invisibili a velocità normale. Per osservarli ho rallentato la
rete dall'interno della pagina, sostituendo `window.fetch` con una versione che
attende quattro secondi prima di inoltrare ogni chiamata.

`[VERIFICATO]` Aprendo **Cash Command** per la prima volta, con il ritardo
attivo, la successione è:

| Tempo | Cosa c'è a schermo |
|---|---|
| 0 ms | la pagina precedente |
| ~250 ms | `main` è **vuoto**, con quattro rettangoli in `animate-pulse` |
| ~6.800 ms | contenuto completo |

Quindi: **niente spinner e niente scheletro vero e proprio**, ma quattro
rettangoli pulsanti su una pagina altrimenti bianca. Non riproducono la forma
del contenuto — che qui è un grafico più tre schede più una tabella — e per
quasi sette secondi la schermata non dice cosa sta arrivando. La stringa
`skeleton` non compare mai nel bundle; `animate-pulse` ricorre 17 volte,
`animate-spin` 314.

⚠️ `[VERIFICATO]` Sulla lista fatture il caricamento è peggio, perché non è
vuoto: è **falso**. Ricaricando e leggendo la riga dei totali a intervalli
regolari, a circa 2,5 secondi il riquadro è già disegnato e mostra

```
Totale Crediti: 0,00 €   Totale Debiti: 0,00 €
```

e solo verso i 3,8 secondi arrivano i valori veri. Per più di un secondo un
prodotto di tesoreria dichiara che i crediti aperti sono zero, con la stessa
grafica con cui dichiarerebbe che sono duecentomila. Uno zero non si distingue
da un dato: è l'unico caso in cui un valore di riempimento è peggiore di un
riquadro vuoto.

`[VERIFICATO]` Alla **seconda** visita della stessa schermata il contenuto
completo compare entro 300 ms, con il ritardo di quattro secondi ancora attivo:
i dati vengono dalla cache e l'aggiornamento avviene dietro le quinte. È il
comportamento giusto — dato vecchio subito, silenziosamente rinfrescato — ed è
il motivo per cui il prodotto sembra rapidissimo dopo i primi minuti d'uso.

**Come lo faremmo.** La regola che ne ricaviamo è una sola e vale per tutte le
nostre schede numeriche: **finché il dato non c'è, non disegnare una cifra**. Un
`<Skeleton>` di shadcn della stessa altezza della riga, o un trattino, mai uno
zero formattato. E dove il dato è già in cache, `staleTime` alto e ricarica in
sottofondo, che è quello che loro fanno bene.

### 5.4 Errore: la finestra buona quando il server risponde, il silenzio quando non risponde

Ci sono due strade diverse, e sono trattate in modo opposto.

`[OSSERVATO]` **Se il server risponde con un errore**, il trattamento è fra i
migliori del prodotto. Provando a creare una regola in `/settings/rules` la
chiamata fallisce sistematicamente con 400 — è il difetto descritto in
`02-aree-funzionali/02-05-regole-e-sinonimi.md`, cap. 1b, dove il client non
invia `companyId` — e compare una finestra che riporta il dettaglio tecnico
dell'errore e propone di **aprire un ticket allegando automaticamente screenshot
e log della console**. Vedi
`assets/cashking/screenshots/16-errore-con-apertura-ticket.png`.

`[DEDOTTO]` È il pattern che trasforma un utente frustrato in un segnalatore
utile: nel momento esatto in cui ha visto il problema, gli si offre di
raccontarlo senza doverlo descrivere. Il costo è basso — screenshot e log sono
già nel browser — e il ritorno è un bug report riproducibile.

⚠️ `[VERIFICATO]` **Se invece la rete cade**, non succede niente. Ho sostituito
`window.fetch` con una funzione che rifiuta sempre, poi ho cancellato una
fattura: la finestra di conferma si è chiusa esattamente come in caso di
successo, **nessun toast**, nessuna finestra d'errore, nessun invito a
riprovare — controllato di nuovo dopo altri sei secondi, per escludere un
ritardo dovuto ai tentativi automatici. L'unico indizio che l'operazione non è
avvenuta è che la riga è ancora lì — si vede in
`assets/cashking/screenshots/24-errore-di-rete-durante-una-modifica.png`, dove
la schermata dopo il fallimento è indistinguibile dalla schermata di prima.

La spiegazione sta nel codice: la mutazione di cancellazione ha una funzione
`onSuccess` (che invalida le query e mostra il toast) e **non ha alcuna
`onError`**. In caso di successo il segnale c'è, in caso di fallimento il
segnale è la sua assenza — e l'assenza di un segnale non è un segnale.

⚠️ `[VERIFICATO]` C'è di più, ed è la parte interessante: **con la rete
interrotta il prodotto continua a funzionare per parecchie schermate**. Con
`fetch` rotto e le chiamate XHR interrotte ho aperto Fornitori (22 righe),
Categorie e Movimenti Bancari (49 righe), e tutte hanno mostrato i dati; ho
scritto «bonifico» nel filtro dei movimenti e i totali si sono ricalcolati
correttamente. Il motivo è che quelle liste vengono scaricate intere una volta e
poi filtrate nel browser. Lo screenshot
`assets/cashking/screenshots/23-rete-interrotta-ma-la-pagina-mostra-i-dati.png`
è stato preso con `fetch` sostituito da una funzione che rifiuta sempre e le
chiamate XHR interrotte: la pagina mostra 49 movimenti, i tre totali e tutti i
contatori delle schede, e non c'è nulla che segnali un problema.

`[DEDOTTO]` Il risultato è che l'utente disconnesso non lavora su una schermata
rotta, lavora su una schermata **plausibile e ferma**, senza alcun indicatore
che glielo dica. Per un gestionale di tesoreria è la condizione peggiore: si
prendono decisioni su saldi che sembrano aggiornati.

**Come lo faremmo.** Due cose che loro non hanno. Primo: un `onError` su ogni
mutazione, con un toast che nomina l'operazione fallita e un pulsante
«Riprova» — è il minimo, e senza di esso il toast di successo diventa
ingannevole invece che utile. Secondo: un indicatore globale di connessione
(`onLine` più l'esito dell'ultima chiamata) che, quando il collegamento cade,
mostri una fascia «Dati fermi alle 14:32» sopra il contenuto. Non serve
bloccare l'interfaccia: serve datare quello che mostra.

### 5.5 Il pulsante «Aggiorna»

`[OSSERVATO]` Esistono pulsanti «Aggiorna» espliciti su Cash Command e sulla
Tesoreria, e un endpoint `/api/events` che resta aperto, dedotto altrove come
stream di eventi.

`[DEDOTTO]` La presenza di un «Aggiorna» manuale accanto a uno stream in tempo
reale suggerisce che l'aggiornamento automatico non copra tutte le viste, o che
non ci si fidi che lo faccia.

`[OSSERVATO]` Il pulsante «Aggiorna» è verde acqua scuro su Cash Command e
indaco sulla Tesoreria: stessa azione, stesso posto, due colori.

`[DEDOTTO]` Incoerenza cromatica su un'azione identica. Piccola, ma indicativa
di una tavolozza applicata per pagina invece che per ruolo dell'elemento.

---

## 6. Feedback e fiducia

È il tema su cui il prodotto è più forte, e il filo conduttore è uno solo:
**ogni numero prodotto dal software mostra da dove viene**.

### 6.1 Le motivazioni accanto al punteggio

`[OSSERVATO]` Ogni proposta di riconciliazione è una scheda con, in alto a
sinistra, due badge: la fascia con il punteggio fra parentesi — `Bassa (72/100)`
in rosa — e la regola scritta per esteso — `Banca ↔ Rata Ricorrente` in viola
scuro. In alto a destra, «Approva» (verde pieno, icona di spunta) e «Salta»
(solo testo, icona di avanzamento).

Il corpo affianca due riquadri con intestazioni in maiuscoletto — «MOVIMENTO
BANCA» e «RATA RICORRENTE» — collegati da una linea con un'icona a fulmine al
centro. Il riquadro del candidato ha bordo e sfondo tenui in verde acqua, cioè è
visivamente il termine proposto.

Sotto il punteggio, le frasi che lo giustificano. Quelle raccolte:
«Importo identico alla rata», «Importo simile alla rata», «Controparte
probabile», «Nome ricorrente nel testo», «Unico match possibile», «Rata #N di
"<nome>"», «3 alternative».

`[DEDOTTO]` L'utente non deve fidarsi di un 72. Legge «importo identico, unico
match possibile» e decide in un secondo. Il numero da solo richiederebbe di
aver imparato la scala; le frasi no.

### 6.2 La barra segmentata del punteggio

`[OSSERVATO]` In fondo alla scheda della proposta, sullo screenshot 09, c'è una
**barra orizzontale divisa in segmenti di colori diversi** — grigio, blu, verde
acqua, verde, viola — con il valore «72» a destra e un chevron per espandere.

`[DEDOTTO]` Questo dettaglio non è trascritto in nessuno dei documenti di area e
lo trovo il più elegante del prodotto: il punteggio non è solo motivato a
parole, è **scomposto graficamente nei suoi addendi**. Ogni segmento è un
contributo, la sua larghezza è quanto pesa. In una barra sola c'è il totale, la
composizione e le proporzioni fra i fattori. Il chevron suggerisce che
l'espansione mostri i contributi con i rispettivi valori.

**Come lo faremmo.** Il nostro modello `ScheduleReconciliation` ha **già** il
campo `confidence Decimal? @db.Decimal(3, 2)`. Manca la scomposizione. Due
strade:

- **Senza migrazione**: il matcher restituisce
  `{ confidence, contributi: {etichetta, peso}[] }` nella risposta della route
  handler, e la scomposizione vive solo a schermo. Sufficiente se non serve
  rileggerla dopo.
- **Con migrazione**: aggiungere `matchReasons Json?` a
  `ScheduleReconciliation`, così la motivazione resta allegata all'abbinamento
  approvato e si può rispondere mesi dopo a «perché questo movimento è finito
  su questa scadenza». Per un sistema contabile, che deve giustificare le
  scritture, è la strada giusta.

La barra si disegna con un `flex` di `div` a larghezza percentuale e i colori
del tema, senza librerie. I badge di fascia con `Badge variant` e i due riquadri
affiancati con due `Card` e un separatore centrale.

### 6.3 Le schede che mostrano i propri addendi

`[OSSERVATO]` Le schede «Saldo a Fine Mese» e «Previsione Cassa (90gg)» del
cruscotto elencano le righe che compongono il risultato, con i segni e una riga
finale di uguaglianza:

```
Liquidità oggi                        179.193,07 €
Saldo disponibile (liquidità + fidi)  249.193,07 €
+ Incassi mese                         82.095,74 €
− Pagamenti mese                       91.173,66 €
= Contabile (solo cassa)              170.115,15 €
= Disponibile (cassa + leve)          240.115,15 €
```

`[OSSERVATO]` Gli addendi sono colorati per direzione: gli incassi in verde, i
pagamenti in rosso, le righe di totale in blu. Le due schede hanno anche uno
sfondo tinto — verde acqua tenue e viola tenue — mentre le tre schede
Crediti/Debiti/Scaduto restano bianche.

`[DEDOTTO]` La tinta di sfondo stabilisce la gerarchia senza usare la dimensione:
due schede sono il contenuto principale, tre sono di contorno. Ed è coerente con
il comportamento: le due tinte mostrano gli addendi sempre, le tre bianche li
nascondono dietro un «Mostra dettagli» (capitolo 7).

`[DEDOTTO]` Il valore di questo pattern è che rende **falsificabile** una
previsione. Un direttore finanziario che vede solo «321.813,39 €» deve fidarsi;
uno che vede i quattro addendi può dire «gli incassi previsti sono troppo
ottimisti» e sapere quale dei quattro numeri contestare. Ed è esattamente il
motivo per cui l'analisi delle logiche di calcolo ha potuto verificare le
formule con due sonde: gli addendi erano a schermo.

**Come lo faremmo.** Una `Card` con `CardHeader` per il risultato in grande e
`CardContent` con righe `flex justify-between`, l'etichetta a sinistra e
l'importo a destra in `tabular-nums`. Il segno va **nell'etichetta** («+ Incassi
mese»), non nell'importo, altrimenti si confonde con il segno del valore. La
riga di uguaglianza separata da un `border-t`. Il nostro `/cash-flow` è il posto
naturale: già oggi calcoliamo la proiezione, mostriamo solo il risultato.

### 6.4 I giudizi in linguaggio naturale

`[OSSERVATO]` In più punti il prodotto sostituisce un numero con una frase:

| Etichetta | Valore mostrato | Dove |
|---|---|---|
| Stato Cash Flow | «Nessuna tensione prevista» | Scadenziario |
| Linea di Credito | «Non necessaria» | Scadenziario |
| Acid Test di Cassa | «Stabile» + «Nessun mese critico nei prossimi 12 mesi» | Cruscotto |
| (badge di stato) | «Liquidità Sicura» + «Nessuna tensione prevista nei prossimi 90gg» | Cash Command |
| Stato (per giorno) | «OK» in pillola verde | Tesoreria |

`[DEDOTTO]` Sono le risposte alle due domande che un imprenditore fa davvero —
*devo preoccuparmi?* e *mi serve chiedere soldi alla banca?* — al posto delle
grandezze da cui si ricavano. La traduzione costa quasi nulla: è una soglia
applicata a una serie già calcolata. Il rapporto fra valore percepito e costo di
implementazione è probabilmente il più alto di tutto il prodotto.

`[OSSERVATO]` La scheda «Liquidità Sicura» di Cash Command ha un'icona a scudo
con una spunta verde in un cerchio sovrapposto.

⚠️ `[OSSERVATO]` Il giudizio è però tarato male: con 54.281,16 € di fornitori
scaduti lo stato resta «Nessuna tensione prevista» e la linea di credito «Non
necessaria». `[DEDOTTO]` Il giudizio guarda alla proiezione del saldo e ignora
l'anzianità dei debiti. Tecnicamente non ha torto — con 179.000 € in cassa la
tensione di liquidità non c'è — ma un'etichetta rassicurante sopra 54.000 € di
scaduto passivo è un consiglio sbagliato: il rischio lì non è finanziario, è
contrattuale e reputazionale.

**Come lo faremmo, e cosa correggere.** Due `Badge` derivati da soglie sulla
curva proiettata di `CashFlowForecastLine`, con una funzione pura in
`src/lib/` — `giudizioLiquidita(serie, scadenzePassiveScadute)` — testabile con
casi limite. **Il correttivo rispetto a loro**: il giudizio deve avere due
componenti, tensione di cassa e anzianità dello scaduto, e deve degradare se
una delle due è cattiva. Una frase come «Cassa solida, ma 54.000 € di fornitori
scaduti» dice il vero due volte.

### 6.5 I toast: ci sono, ma solo per metà delle operazioni

Il prodotto usa **Sonner**. Ho installato un osservatore sulle mutazioni del DOM
per catturare ogni toast che compare, con il testo, la posizione e i tempi.

`[VERIFICATO]` Anatomia del toast di conferma, catturata alla cancellazione di
una fattura:

| Proprietà | Valore |
|---|---|
| Testo | «Eliminato con successo» |
| Tipo | `data-type="success"` |
| Posizione | in basso a destra, 24 px dai bordi |
| Larghezza | 356 px, altezza 53,5 px |
| Contenuto | un'icona di spunta cerchiata e una riga di testo |
| Pulsanti interni | **nessuno** |
| Durata | comparso a 41.303 ms, rimosso a 45.506 ms → **4,2 secondi** |

Si vede in basso a destra in
`assets/cashking/screenshots/25-toast-di-eliminazione-in-basso-a-destra.png`.
`[DEDOTTO]` La posizione è discutibile per questo prodotto: in basso a destra,
su uno schermo da tesoreria, è il punto più lontano dallo sguardo di chi ha
appena cliccato un pulsante di riga a metà pagina, e 4,2 secondi sono pochi per
accorgersene. Un messaggio ancorato **vicino all'azione** — o l'evidenziazione
temporanea della riga toccata — arriva prima.

⚠️ `[VERIFICATO]` **Creando** una fattura, invece, non compare nulla. E non è
solo il toast a mancare: ho creato due fatture con i filtri azzerati e la
tabella ha continuato a dire «20 di 41» senza mostrarle, mentre il server ne
contava 42; la riga dei totali è rimasta a 87.816,07 € di debiti mentre il
server ne dichiarava 87.999,07 €. Per due volte l'unico segnale del salvataggio
è stata la chiusura della finestra, e tutto il resto della schermata diceva il
contrario. Solo un ricaricamento completo ha allineato la vista.

`[VERIFICATO]` La causa è nel codice ed è un'asimmetria di due righe. La
mutazione di **creazione** invalida dieci query — `invoices`, `clients`,
`/api/clients`, `suppliers`, `/api/suppliers`, `available-invoices` e le quattro
dei piani di pagamento — ma **non** `invoices-paginated` (la lista che si sta
guardando) né `invoices-totals` (i numeri in testata), e non chiama alcun toast.
La mutazione di **cancellazione** ne invalida otto, fra cui entrambe le mancanti,
e si chiude con `ge.success(a("common.deleted"))`. Osservato all'atto pratico: cancellando, la
lista è passata da 42 a 41, i totali si sono aggiornati e il toast è comparso.

`[DEDOTTO]` È il difetto che costa più fiducia di tutti quelli visti, perché non
lascia dubbi ambigui: lascia una **prova visiva sbagliata**. L'utente che salva
una fattura e vede la lista invariata non pensa «forse non si è aggiornata»,
pensa «non è stata salvata», e la salva di nuovo. Il rimedio è una riga per
mutazione, ed è la ragione per cui vale la pena avere un solo posto dove si
dichiara che cosa invalida una scrittura, invece di ripetere l'elenco a mano in
ogni `onSuccess`.

**Come lo faremmo.** Un piccolo registro `src/lib/query-keys.ts` che mappa
entità → chiavi dipendenti, e un helper `mutaEInvalida(entità, …)` che le
invalida tutte: così un elenco dimenticato non è più possibile. Il toast di
esito nello stesso helper, con il **nome dell'oggetto** dentro il messaggio
(«Fattura FT-0042 eliminata», non «Eliminato con successo»): il messaggio
generico non permette di accorgersi di aver cancellato la riga sbagliata.

### 6.6 Nessun annullamento, e per le fatture nessun cestino

`[VERIFICATO]` Il toast di cancellazione non contiene pulsanti: non c'è
«Annulla» e non c'è nemmeno una «×» di chiusura. La cancellazione di una fattura
è immediata e definitiva dal punto di vista dell'interfaccia; la sola difesa è
la finestra di conferma **prima**.

⚠️ `[OSSERVATO]` E la conferma non dice quale fattura: il testo è «Conferma
Eliminazione — Sei sicuro di voler eliminare questa fattura?», senza numero,
senza controparte, senza importo. Chi ha cliccato la matita sulla riga sbagliata
non ha modo di accorgersene leggendo la conferma.

`[OSSERVATO]` Un cestino esiste, ma altrove: `/transactions` ha una scheda
«Cestino (0)» accanto ad «Attivi (49)», e il modello dati ha un campo
`trashedAt`. I **movimenti** si recuperano, le **fatture** no.

`[DEDOTTO]` La coppia giusta è una delle due: o una conferma che nomina
l'oggetto, o un annullamento di dieci secondi nel toast. Averle entrambe è
ridondante, non averne nessuna delle due — che è il caso delle fatture — lascia
l'operazione più distruttiva del prodotto senza rete di protezione. Il toast di
Sonner accetta un'azione con due righe di codice: `toast.success(messaggio, {
action: { label: 'Annulla', onClick: ripristina } })`.

### 6.7 Salvataggio esplicito ovunque, senza avviso sulle modifiche non salvate

`[VERIFICATO]` In `/settings/company` ho modificato la ragione sociale, spostato
il fuoco su un altro campo e atteso: il server continuava a rispondere «Weiss
Srl». Nessun salvataggio automatico. Poi ho lasciato la pagina senza premere
«Salva»: **nessun avviso**, nessuna richiesta di conferma. Tornando indietro il
campo era di nuovo «Weiss Srl» e la modifica era sparita senza che nulla lo
dicesse.

`[OSSERVATO]` Le uniche cose che si salvano da sole sono le **preferenze di
vista** — colonne visibili, larghezze, ordinamento, filtri — che finiscono in
`localStorage` senza conferma né messaggio.

`[DEDOTTO]` La divisione è quella giusta: i dati con un salvataggio esplicito,
le preferenze in automatico. Manca il terzo pezzo, cioè dire all'utente che ha
qualcosa in sospeso. Un modulo che si può abbandonare in silenzio dopo dieci
minuti di compilazione è un modulo che prima o poi verrà compilato due volte.

**Come lo faremmo.** `useBeforeUnload` più una guardia sulla navigazione interna
quando il modulo è `isDirty` (react-hook-form lo espone già), e un punto accanto
al titolo con la scritta «Modifiche non salvate». Costa poche righe e si mette
una volta sola nel componente di modulo.

### 6.8 Aggiornamenti ottimistici: esistono, in due punti su tutto il prodotto

`[VERIFICATO]` Ricerca esaustiva sul bundle: `onMutate` — l'aggancio con cui si
scrive nella cache prima che il server risponda — compare dodici volte. Due sono
codice interno di react-query. **Otto** stanno sotto `/api/sysadmin/…`, cioè
nell'area di manutenzione del fornitore, fuori dal perimetro di un cliente. Ne
restano **due** raggiungibili da un utente, ed entrambe appartengono alla
riconciliazione: l'abbinamento di una fattura a un movimento bancario
(`/api/transactions/:id/link-invoice`) e la rimozione di un incasso
(`/api/invoice-payments/:id`).

Tutto il resto è pessimistico, e in modo massiccio: `invalidateQueries` ricorre
**985 volte**.

`[VERIFICATO]` Misurato sul comportamento normale, con la rete rallentata a
quattro secondi e modificando una fattura:

| Tempo | Stato |
|---|---|
| 0 ms | clic su «Salva» |
| ~200 ms | il pulsante diventa **«Caricamento...»** e si disabilita |
| ~4.842 ms | la richiesta risponde, il pulsante torna «Salva» |
| ~5.044 ms | la finestra si chiude |

La riga della tabella non cambia mai prima della risposta. Lo stato di attesa
c'è ed è corretto — testo che cambia e pulsante disabilitato, quindi niente
doppio invio — ma è affidato al solo testo, senza indicatore rotante.

`[DEDOTTO]` La scelta di riservare l'ottimismo alla riconciliazione è
difendibile e vale la pena capirla: è l'unica schermata dove si compiono decine
di azioni identiche in fila, e dove mezzo secondo di attesa moltiplicato per
cinquanta abbinamenti diventa l'unica cosa che l'utente ricorda. Altrove
un'attesa breve con un pulsante che dichiara di star lavorando è preferibile,
perché un aggiornamento ottimistico che poi fallisce va disfatto a schermo, e
disfare a schermo un numero contabile è peggio che farlo aspettare.

### 6.9 Lo stesso numero, tre valori diversi nella stessa sessione

⚠️ `[VERIFICATO]` «Crediti aperti» è mostrato in tre punti con tre valori:

| Dove | Valore | Come è calcolato |
|---|---|---|
| Cruscotto, scheda Crediti | **201.901,66 €** | fattura extra-UE contata al netto |
| `/api/invoices/totals` | **202.760,35 €** | somma del lordo delle fatture non in stato «pagata» |
| Lista fatture, riga dei totali | **218.992,96 €** | somma di (lordo − incassato) su **tutte** le fatture, stato compreso |

Le tre cifre le ho riprodotte tutte: la prima leggendo il cruscotto, la seconda
chiamando l'endpoint, la terza leggendo la riga dei totali e poi ricostruendola
riga per riga dai dati grezzi, che restituisce 218.992,96 € esatti. Lo scarto
fra la seconda e la terza, **16.232,61 €**, sono fatture marcate «pagata» il cui
campo `totalPaid` non copre l'importo. Lo scarto fra la prima e la seconda,
**858,69 €**, è l'IVA della fattura extra-UE già spiegata in
`04-logiche-di-calcolo.md`, cap. 14.

`[OSSERVATO]` Sulla stessa pagina, nella stessa sessione, la riga dei totali ha
mostrato prima 202.760,35 € e poi 218.992,96 € senza che io toccassi alcun
dato: il primo valore compare al caricamento, il secondo dopo che la lista
completa delle fatture è stata riscaricata. `[DEDOTTO]` Il riquadro ha due
fonti — l'endpoint dei totali e un calcolo fatto nel browser sull'elenco intero
— e mostra quella che ha disponibile al momento.

`[DEDOTTO]` Il capitolo 12.3 attribuiva questi disallineamenti al fatto che lo
stesso concetto è calcolato in più posti. Qui se ne vede la forma più acuta: non
due schermate che discordano, ma **una schermata sola che cambia idea mentre la
si guarda**. Ed è il difetto che rende inutile tutto il buon lavoro dei capitoli
6.1-6.4: un prodotto che mostra da dove viene ogni numero, e poi mostra tre
numeri diversi per la stessa parola, ha speso il capitale di fiducia che si era
costruito.

**Come lo faremmo.** «Credito aperto» è una definizione contabile, non una
preferenza di schermata: va calcolata **una volta sola sul server** — per noi
una funzione in `src/lib/` con i suoi test, esposta da un unico endpoint — e
ogni riquadro la legge da lì. Nessun totale ricostruito nel browser sommando una
lista, mai: è il modo in cui una definizione si biforca senza che nessuno se ne
accorga.

---

## 7. Drill-down: dal numero aggregato al dettaglio

`[OSSERVATO]` I percorsi osservati, contati in passaggi:

| Da | A | Passaggi |
|---|---|---|
| Scheda Crediti (cruscotto) | Scomposizione | 1 — «Mostra dettagli» apre in loco |
| Acid Test (cruscotto) | Scadenze | 1 — pulsante «Apri Scadenziario» |
| «Da incassare» (scadenziario) | Mese | 1 — il gruppo mensile si apre in loco |
| Mese | Singola scadenza | 2 — apri il mese, poi la riga |
| «Saldate fuori sistema» | Elenco delle 15 | 1 — il riquadro si espande |
| Conto (Tesoreria) | Dettaglio del conto | 1 — chevron sulla riga |
| Punteggio di una proposta | Contributi | 1 — chevron sulla barra |

`[DEDOTTO]` La regola è **espansione in loco, non navigazione**: quasi tutti i
drill-down aprono il dettaglio dove si trova il numero, senza cambiare pagina.
Il vantaggio è che il contesto resta — vedo il dettaglio *e* l'aggregato da cui
viene — e che non serve un ritorno indietro. Il limite è che non si può mandare
un link a qualcuno: lo stato espanso non vive nell'URL.

`[OSSERVATO]` L'unica eccezione è «Apri Scadenziario» dall'Acid Test, che
naviga. `[DEDOTTO]` Correttamente: lì il dettaglio è un'intera pagina, non un
elenco.

`[OSSERVATO]` Le tre schede secondarie del cruscotto hanno «Mostra dettagli» con
chevron; le due principali mostrano gli addendi sempre aperti.

`[DEDOTTO]` Divulgazione progressiva applicata per importanza, non
uniformemente. È la scelta giusta: nascondere dietro un clic ciò che serve a
tutti è un attrito gratuito, mostrare sempre ciò che serve a pochi è rumore.

**Come lo faremmo.** `Collapsible` di shadcn — presente in
`src/components/ui/collapsible.tsx` — dentro la `Card`. Per gli aggregati
mensili dello scadenziario, `Accordion` con `type="multiple"`, anch'esso già
presente. La correzione da apportare rispetto a loro: **mettere lo stato
espanso in `useSearchParams`** (per esempio `?apri=2026-08`) così il link
resta condivisibile. Costa dieci righe e risolve il solo difetto del pattern.

### 7.1 Contato sul campo: l'espansione si ferma al primo livello

Il conteggio qui sopra misura quanti clic servono per aprire un'espansione. La
domanda vera è un'altra: **dopo quei clic, si arriva ai documenti?**

⚠️ `[VERIFICATO]` No. Ho premuto «Mostra dettagli» sulla scheda **Crediti** del
cruscotto: si apre una riga sola, «Prossimi 3 mesi — 150.156,22 €». Non un
elenco di fatture, non un raggruppamento per cliente, non un collegamento.
Ispezionando la scheda, gli unici elementi cliccabili della zona sono i tre
«Mostra dettagli»: **il numero non è un collegamento e la scheda nemmeno**. Da
201.901,66 € di crediti alla fattura che li compone non esiste alcun percorso: si
deve passare dalla barra laterale, aprire Fatture, cambiare scheda su Clienti e
filtrare a mano — e a quel punto, come mostra il capitolo 6.9, il totale che si
trova lì non è quello da cui si era partiti.

`[VERIFICATO]` Anche il passaggio che *naviga* non porta contesto: «Apri
Scadenziario» dall'Acid Test — che nell'Acid Test riguarda un mese specifico —
atterra su `/due-schedule` **senza alcuna stringa di query**, cioè sullo
scadenziario intero, con il periodo predefinito. L'informazione che aveva reso
interessante il clic si perde nel clic stesso.

`[DEDOTTO]` Questo ridimensiona il giudizio del capitolo: l'espansione in loco è
un buon pattern, ma qui è applicata a un solo livello di profondità, e sotto
quel livello non c'è niente. È la differenza fra un drill-down e uno
scomparto — il primo scende fino al documento, il secondo mostra un secondo
aggregato e finisce. Un direttore finanziario che vuole sapere *chi* gli deve
150.156,22 € non lo scopre da nessuna delle due schermate.

**Come lo faremmo.** La regola: **ogni aggregato deve sapere generare il filtro
che lo produce**. Se una scheda mostra «Crediti prossimi 3 mesi», il numero è un
`Link` a `/fatture?tipo=cliente&stato=aperta&scadenzaDa=…&scadenzaA=…`, con gli
stessi parametri che il server ha usato per calcolarlo. Non è solo comodità: è
la sola verifica pratica che l'aggregato e la lista usino la stessa definizione,
perché appena divergono lo si vede subito confrontando il totale con la somma
delle righe filtrate.

---

## 8. Semantica dei colori e del segno

### 8.1 Cosa fa il prodotto

`[OSSERVATO]` Codifiche osservate:

| Significato | Trattamento |
|---|---|
| Incassi, banche a saldo positivo, stato buono | Verde / verde acqua |
| Pagamenti, banche a saldo negativo, fascia «Bassa» | Rosso / rosa |
| Previsione, completamento | Viola |
| Saldi e totali | Blu / verde acqua |
| Fascia «Media», avvisi, addon | Ambra |
| Rischio di scoperto | Banda «Zona Negativa» rosa chiaro sul grafico |
| Consuntivo contro previsione | Linea continua contro linea tratteggiata |
| Giorno corrente | Colonna evidenziata in azzurro tenue con bordo |
| Sabato e domenica | Colonna con sfondo grigio tenue |

`[OSSERVATO]` Nella griglia della Tesoreria la riga «Totale Banche attive» è
verde su fondo verde tenue con un bordo sinistro colorato, e «Totale Banche
passive» è rossa su fondo rosa con bordo sinistro rosso: la codifica è applicata
alla **banda di righe**, non alla singola cella.

`[OSSERVATO]` I valori monetari della griglia sono in carattere a spaziatura
fissa, quindi le cifre si allineano incolonnate.

`[DEDOTTO]` Tre accorgimenti della griglia meritano di essere rubati tali e
quali: l'evidenziazione della colonna di oggi (che dà il punto di riferimento
senza doverlo cercare), lo sfondo grigio sul fine settimana (in tesoreria conta:
i bonifici non si muovono il sabato) e i numeri tabellari.

### 8.2 La banda «Zona Negativa»

`[OSSERVATO]` Il Radar di Liquidità ha, in legenda, una voce «Zona Negativa» con
un quadratino rosa chiaro: è una banda di sfondo sotto lo zero.

`[DEDOTTO]` Disegna il rischio invece di descriverlo. Non serve leggere un
numero né confrontarlo con una soglia: o la curva entra nella banda o no. È
l'uso corretto di un grafico — comunicare una forma, non un valore — e si sposa
con l'indicazione testuale del punto minimo che sta poco sotto.

### 8.3 Dove la semantica si rompe

⚠️ `[OSSERVATO]` Sul cruscotto la scheda **Debiti** mostra «↑ +9%» con freccia e
percentuale **in verde**. Un aumento dei debiti del 9% non è una buona notizia.

`[DEDOTTO]` Il colore segue la direzione della freccia, non il significato
economico della grandezza. Vale anche per «Scaduto», dove «↑ +67%» è verde ma
descrive un miglioramento della posizione netta — lì per caso il verde è giusto,
ma per la ragione sbagliata. Serve un attributo per indicatore che dica se
crescere è bene o male, altrimenti metà delle frecce mente.

⚠️ `[OSSERVATO]` Il valore «−2.535,72 €» della scheda Scaduto è in **nero**, non
in rosso: l'unico marcatore del segno è il trattino. Su un numero che rappresenta
una posizione netta — e che quindi può cambiare direzione — affidare il segno al
solo carattere «−» è fragile.

⚠️ `[OSSERVATO]` Verde acqua e verde sono usati sia per «positivo» sia per
«primario»: il pulsante «Accedi» del login, il saldo disponibile, gli incassi e
il pulsante «Aggiorna» sono tutti nella stessa famiglia cromatica. Quando il
colore del marchio coincide con il colore semantico del bene, si perde la
possibilità di dire «questo è importante» senza dire anche «questo è positivo».

### 8.4 Micro-interazioni: misurate, e più povere di quanto le classi promettano

`[VERIFICATO]` **Righe di tabella.** La classe è `hover:bg-muted/30` con
`transition-colors`: passando il mouse il fondo va da trasparente a un grigio al
30%. Niente ombra, niente spostamento. E le sei azioni della riga —
collega incassi, collega note di credito, collega gateway, modifica, elimina —
sono **sempre visibili**, non compaiono al passaggio.

`[DEDOTTO]` È la scelta giusta per un gestionale, e va contro la moda: le azioni
che appaiono solo al passaggio del mouse sono invisibili a chi non lo sa, non
esistono su tocco e non si raggiungono in una scansione della pagina. Il prezzo
è la densità — sei icone per riga su venti righe sono centoventi icone — e loro
lo pagano rimpicciolendole.

⚠️ `[VERIFICATO]` **Pulsanti.** Il pulsante primario «Nuova Fattura» porta le
classi `hover-elevate` e `active-elevate-2`, che suggeriscono un sistema di
elevazione al passaggio e alla pressione. Non esiste: ho scaricato il foglio di
stile dell'applicazione (296 KB) e la stringa `elevate` **non vi compare
nemmeno una volta**. Sono classi rimaste nel markup senza regola dietro.
L'unico effetto reale è `hover:opacity-90`, cioè un calo del 10% di opacità —
verificato anche misurando il colore di fondo prima e dopo il passaggio del
mouse, che resta identico (`rgb(10, 109, 118)`).

`[DEDOTTO]` Una deduzione che avrei fatto guardando il codice — «ci sono le
classi, quindi c'è il sistema» — sarebbe stata sbagliata. Vale la pena
registrarlo come metodo: la presenza di un nome di classe non è prova
dell'esistenza dello stile, e il controllo costa una ricerca nel CSS.

`[VERIFICATO]` **Fuoco da tastiera.** L'anello di fuoco c'è ed è visibile:
`outline` di 3 px sui collegamenti di navigazione, 1 px sui pulsanti, più le
utility `focus-visible:ring-1 focus-visible:ring-ring` sui componenti shadcn.
`Esc` chiude i modali.

⚠️ `[VERIFICATO]` Manca però il collegamento «salta al contenuto»: partendo
dall'inizio della pagina servono **33 pressioni di Tab** per raggiungere il
primo comando dell'area principale (il pulsante «Nuova Fattura»), perché la
barra laterale con le sue trenta voci viene prima. E si ripete su ogni pagina.
La stringa «skip to» compare una sola volta nel bundle, in un testo di aiuto
sull'importazione dei CSV che parla di righe da saltare.

### 8.5 Il colore è quasi sempre accompagnato

Era la domanda aperta del capitolo: il colore è mai l'**unico** portatore di
informazione? Ho ispezionato gli elementi colorati della griglia della
Tesoreria — 64 in una schermata — e il quadro è buono:

- gli stati giornalieri sono pillole con **il testo dentro** («OK»), non
  quadratini colorati;
- gli importi verdi o rossi portano comunque il segno, e il segno resta
  leggibile in scala di grigi;
- le fasce di confidenza della riconciliazione hanno la parola nel badge —
  `Bassa (72/100)` — e il colore è un rinforzo;
- gli stati «Migliore / In linea / Peggiore» del report DSO/DPO sono parole.

`[OSSERVATO]` L'eccezione resta la fascia «Zona Negativa» del Radar di
Liquidità, che è una banda di sfondo rosa con la sola voce in legenda; e
l'evidenziazione della colonna «oggi» e del fine settimana nella griglia, che
sono solo tinte di fondo — ma lì l'informazione è già scritta nell'intestazione
di colonna, quindi la tinta è un aiuto, non il messaggio.

`[DEDOTTO]` Il difetto di accessibilità del prodotto non è il colore, come
sembrava: sono le **intestazioni di colonna non raggiungibili da tastiera**
(3.4) e i **33 Tab** per arrivare al contenuto. Il colore, che è la cosa che si
guarda per prima, qui è la cosa fatta meglio.

**Come lo faremmo.** Nel nostro tema shadcn definire quattro token semantici
distinti dal colore primario — `--entrata`, `--uscita`, `--previsto`,
`--rischio` — e usarli **solo** per il significato, mai per l'enfasi. Sulle
variazioni percentuali, un componente `<Variazione valore={n}
crescereEBene={false} />` che decide il colore dal significato e non dal segno.
Regola da fissare una volta: **il colore non deve mai essere l'unico portatore
di un'informazione** — accanto ci va sempre un segno, una freccia o una parola.

---

## 9. Onboarding e affordance

### 9.1 Il banner iniziale

`[OSSERVATO]` In cima a ogni pagina, una fascia a sfumatura dal verde acqua al
viola con un'icona a razzo, il titolo «Inizia subito con CashKing!», il
sottotitolo che propone una sessione guidata o l'esplorazione con dati di prova,
due pulsanti — «Prenota Onboarding» con icona calendario e «Carica Dati di
Prova» con icona database — e una «×» di chiusura a destra.

`[DEDOTTO]` I due pulsanti sono le due strade dell'utente nuovo, offerte insieme:
farsi accompagnare, oppure guardare da solo. «Carica Dati di Prova» risolve il
problema peggiore di un gestionale finanziario a scatola vuota — un prodotto
di tesoreria senza dati non mostra niente e non convince nessuno — al costo di
un dataset dimostrativo e di un pulsante.

`[OSSERVATO]` Sul cruscotto, quando i dati di prova sono attivi, compare un
**secondo** banner ambra dentro la pagina: «Dati di esempio attivi — Rimuovi i
dati di esempio per iniziare da zero», con il pulsante «Cancella dati di
esempio» e l'icona di un cestino.

`[DEDOTTO]` La simmetria è ben fatta: chi carica i dati finti deve poterli
togliere, e il promemoria sta dove l'utente li sta guardando, non nelle
impostazioni. Il difetto è la sovrapposizione — due banner e la fascia dei KPI
occupano insieme circa 220 px prima del contenuto (capitolo 1.2).

### 9.2 Il carosello delle novità

`[OSSERVATO]` All'accesso si apre una finestra modale con il badge «Nuovo», il
titolo «Novità», il numero di versione «v0.26.5», una scheda con icona, titolo e
testo della singola novità, gli indicatori di pagina a puntini, il pulsante
«Avanti» con chevron, e sotto, in piccolo e senza risalto, il collegamento
**«Salta tutto e non mostrare più»**.

`[DEDOTTO]` La frase è precisa in modo insolito. Dice tre cose: salta *tutto*
(non solo questa scheda), *e* non mostrare *più* (la scelta è persistita).
L'utente sa esattamente cosa sta accettando. La formula abituale — un «×» in un
angolo — lascia il dubbio se ricomparirà domani.

`[OSSERVATO]` Gli indicatori a puntini sono **sei**, mentre la documentazione di
fase 1 riporta tre schede. `[DEDOTTO]` O le novità sono sei e ne sono state
trascritte tre, o i puntini non corrispondono al numero di schede. In entrambi i
casi l'utente non può fidarsi del puntino per stimare quanto manca.

**Come lo faremmo.** Un `Dialog` di shadcn con lo stato letto da una preferenza
per utente. Nel nostro schema esiste già `NotificationPreference`: la versione
del changelog vista si aggiunge lì come campo, non serve un modello nuovo. La
condizione di apertura è `ultimaVersioneVista < versioneCorrente`, e «Salta
tutto e non mostrare più» scrive direttamente la versione corrente.

### 9.2b Come il prodotto ricorda cosa hai già visto `[VERIFICATO]`

Leggendo la memoria locale del browser si vede il meccanismo dietro il carosello:

```json
cashking_last_seen_version : "0.26.5"
cashking_seen_features     : ["multi_company_switch","tour_system","credit_card_planning"]
```

Due chiavi, non una. La prima registra l'ultima versione vista, e serve a
decidere **se** aprire la finestra. La seconda registra le singole novità già
viste, per nome, e serve a decidere **quali** evidenziare.

`[DEDOTTO]` La distinzione è più fine di quanto sembri, ed è la ragione per cui
funziona bene: con la sola versione, un utente che salta una release si ritrova
la finestra ma senza sapere cosa è nuovo *per lui*; con l'elenco per nome si
può marcare una voce come già vista anche quando compare in due release
diverse, o mostrarla a chi non l'ha ancora aperta pur avendo aggiornato. Le tre
voci registrate qui corrispondono esattamente alle novità della 0.26.5.

⚠️ `[OSSERVATO]` Vive però in `localStorage` e non sul profilo utente: cambiando
browser il carosello ricompare, e la scelta «non mostrare più» non segue la
persona.

**Come lo faremmo.** Le due chiavi le copiamo, ma lato server: sul nostro
`NotificationPreference` un campo `ultimaVersioneVista` e un `novitaViste
String[]`. È la differenza fra ricordare un utente e ricordare un browser.

### 9.3 I tour interattivi

`[OSSERVATO]` Esiste `/help/tours` e il changelog annuncia tour guidati passo
passo su Dashboard, Fatture, Movimenti e Import. Non li ho osservati in
funzione.

`[DEDOTTO]` La scelta di quali quattro schermate coprire è essa stessa
un'informazione: sono le due di lettura principali e le due di immissione. Il
prodotto ritiene che l'attrito stia lì.

### 9.4 «Manca fido»: l'invito nel punto in cui il dato manca

`[OSSERVATO]` Nel dettaglio per conto della Tesoreria, ogni scheda mostra banca
e fido (`Intesa Sanpaolo • Fido: €50.000,00`). Sul conto deposito FinecoBank,
che non ha fido configurato, al posto della cifra compare l'etichetta **«Manca
fido»**.

`[DEDOTTO]` È l'accorgimento più economico dell'intero prodotto e uno dei più
efficaci. Non c'è una schermata «completa la configurazione», non c'è una
percentuale di completamento del profilo: c'è una parola nel punto esatto in cui
il dato assente sta producendo un calcolo incompleto. L'utente scopre che manca
qualcosa mentre gli serve, che è l'unico momento in cui è disposto a inserirlo.

**Come lo faremmo, e ci serve davvero.** `[OSSERVATO]` Il nostro modello
`BankAccount` in `prisma/schema.prisma` ha `initialBalance`, `currency`,
`accountType`, ma **non ha alcun campo per l'affidamento**. Senza quello non
possiamo calcolare un «saldo disponibile». Servono due campi —
`fidoTotale Decimal? @db.Decimal(12,2)` e `fidoUtilizzato Decimal? @default(0)` —
e a quel punto il badge «Manca fido» diventa un `Badge variant="outline"`
condizionato a `fidoTotale === null` sulla scheda del conto in
`/impostazioni`. Il pattern generale: ogni volta che un calcolo degrada per un
dato mancante, dirlo dove il dato manca e non in un pannello di stato.

### 9.5 Il blocco di upsell degli addon

`[OSSERVATO]` Aprendo una sezione di un addon non attivo, la pagina mostra un
riquadro ambra centrato con bordo giallo: icona a corona, titolo «Attiva
Promemoria automatici», una frase che dice quale addon serve e dove attivarlo, e
il pulsante «Vai all'abbonamento» arancione con freccia. Il resto della pagina è
vuoto.

`[DEDOTTO]` Il blocco è onesto — dice il nome dell'addon e dove si compra — ma
spreca l'occasione: non mostra **cosa** si otterrebbe. Un'anteprima sfocata
della funzione, o anche solo tre righe di elenco, converte meglio di un rimando.
E il prezzo, che è 2,99 €/mese, non è scritto: l'utente deve navigare per
scoprire che l'ostacolo costa quanto un caffè.

⚠️ `[OSSERVATO]` Il blocco è puramente di interfaccia: gli endpoint
`/api/retail/*` e `/api/reminders/*` rispondono 200 a un account senza addon,
mentre `/api/fiscal/*` risponde 403. `[DEDOTTO]` Per due moduli su tre il
paywall non è applicato dal servizio. È un difetto di sicurezza prima ancora che
di prodotto, ed è il primo elemento della lista «da non copiare».

---

## 10. Strumentazione e power user

### 10.1 Gli attributi `data-testid` parlanti

`[OSSERVATO]` Il prodotto è strumentato in modo sistematico, con nomi che
descrivono il ruolo e non la posizione: `input-email`, `button-login`,
`btn-whats-new-next`, `button-notifications`,
`due-schedule-paid-without-movement-toggle`, e per i gruppi mensili dello
scadenziario uno schema regolare — `month-overdue-collect-2026-04`,
`month-collect-2026-08`, `month-overdue-pay-2026-08`, `month-pay-2026-09` —
cioè quattro famiglie (scaduto/normale × incasso/pagamento) indicizzate per mese.

`[DEDOTTO]` Lo schema è così regolare da essere **generato**, non scritto a
mano: `month-{overdue-}?{collect|pay}-{YYYY-MM}`. Il beneficio va oltre i test.
Un identificatore stabile e parlante rende possibile automatizzare, misurare
l'uso e — come dimostra questa stessa analisi — descrivere l'interfaccia
dall'esterno senza ambiguità.

`[OSSERVATO]` Ho contato i file del nostro
gestionale che usano `data-testid`: **zero su 317 file `.tsx`**. I nostri test
selezionano quindi per testo o per ruolo, il che li rende fragili a ogni
riformulazione di copy.

**Come lo faremmo.** Non serve un intervento massivo. La regola sostenibile è:
`data-testid` obbligatorio su tre categorie di elementi — controlli di
un'azione irreversibile, righe di lista con identità (`schedule-row-{id}`), e
contatori aggregati — con lo schema derivato dal dominio come fanno loro. Da
introdurre nei file che tocchiamo, non in una passata unica.

### 10.2 Ricerca, azioni in blocco, esportazione

`[OSSERVATO]` L'esportazione Excel è presente sulla vista movimenti di Cash
Command, accanto al selettore delle colonne. Gli endpoint indicano azioni in
blocco su più fronti: `/api/bulk-reconciliation/*`,
`/api/credit-card-bulk-reconciliation/*`, `/api/clients/{merge,bulk-edit,bulk-delete}`.

`[DEDOTTO]` L'unione di anagrafiche (`merge`) e il dizionario dei sinonimi delle
controparti sono strumenti da utente esperto che risolvono un problema molto
concreto: la stessa azienda scritta in cinque modi diversi nei bonifici. Chi ha
costruito quelle funzioni ha visto il problema da vicino.

`[VERIFICATO]` Non esistono né una ricerca globale né una palette di comandi né
alcuna scorciatoia da tastiera. Prima l'avevo solo dedotto dal non averle viste;
ora è una ricerca esaustiva sul bundle: tutte le occorrenze di `metaKey` e
`ctrlKey` appartengono al codice interno di React, Radix, cmdk e ProseMirror, e
nessuna a codice dell'applicazione; i sette `addEventListener("keydown")`
gestiscono solo `Escape`, le frecce e `Invio`, cioè la navigazione dentro menu e
finestre. La libreria `cmdk` **è nel bundle** ma serve i menu a tendina con
ricerca dei componenti shadcn, non una palette globale: il pezzo c'è, non è
stato montato.

`[VERIFICATO]` Il costo si misura: dall'inizio della pagina servono **33
pressioni di Tab** per arrivare al primo comando del contenuto (capitolo 8.4).
Con 93 rotte applicative e nessun altro modo di spostarsi che la barra laterale
coi suoi gruppi da aprire, chi lavora da tastiera non ha una via praticabile.

**Come lo faremmo.** Il componente `command` di shadcn è **già presente** in
`src/components/ui/command.tsx`. Una palette con `Cmd+K` che indicizza le nostre
rotte e le scadenze aperte costa poche ore, e sarebbe una cosa che loro non
hanno. L'esportazione Excel va invece fatta lato server, non con una libreria
nel bundle: una route handler che genera il file dalla stessa query della
tabella, così l'esportato coincide con il filtrato per costruzione.

---

## 11. Lessico italiano di dominio

Questa è la tabella più direttamente riutilizzabile del documento: sono le
etichette esatte incontrate, con ciò che designano. Il valore non è
terminologico ma di prodotto — è il vocabolario con cui un imprenditore italiano
si aspetta che gli si parli di cassa.

### 11.1 Grandezze di liquidità

| Etichetta | Cosa designa |
|---|---|
| **Saldo Attuale** | Saldo contabile dei conti. Nel loro caso include per errore i movimenti con data futura |
| **Saldo Disponibile** | Saldo contabile più fido di cassa residuo (e, secondo il sottotitolo di Cash Command, più SBF) |
| **Saldo a Fine Mese** | Proiezione a fine mese corrente: liquidità più incassi meno pagamenti meno IVA in liquidazione nel mese |
| **Previsione Cassa** | Stessa proiezione su 90 giorni |
| **Previsione fra 30 giorni** | Saldo proiettato a 30 giorni, con variazione percentuale rispetto a oggi |
| **Saldo Minimo Previsto** | Punto più basso della curva proiettata, accompagnato da «In N gg» |
| **Liquidità Corrente** | Sinonimo di Saldo Attuale, usato nello Scadenziario |
| **Liquidità oggi** | Riga di addendo: il saldo di partenza della proiezione |
| **Margine Disponibile** | Nella Tesoreria: saldo del giorno più fido, cioè il disponibile giornaliero |
| **Saldo Progressivo** | Saldo aziendale cumulato riga per riga nella lista movimenti |
| **Saldo Banca** | Saldo cumulato del singolo conto sulla stessa riga |
| **Saldo stimato** | Nello Scadenziario: saldo proiettato dopo aver onorato le uscite di quel mese |
| **Impatto Liquidità** | Effetto in euro del singolo movimento sulla cassa |
| **Totale Banche attive / passive** | Somma dei conti a saldo positivo e a saldo negativo, separate |
| **Tasso medio creditore / debitore** | Tasso medio sui conti attivi e su quelli passivi; nei dati osservati è una media aritmetica semplice, non ponderata per il saldo (vedi `04-logiche-di-calcolo.md`, cap. 11b) |
| **Interessi Stimati** | Interessi maturati stimati, giorno per giorno |

### 11.2 Indicatori e giudizi

| Etichetta | Cosa designa |
|---|---|
| **Acid Test di Cassa** | Per quanti mesi la cassa regge; valore «12+ mesi», stato «Stabile» |
| **Radar di Liquidità** | Il grafico annuale con saldo reale, previsto, i singoli conti e la Zona Negativa |
| **Cash Command Center** | La vista movimento per movimento; sottotitolo «Sala di Controllo della Liquidità» |
| **Zona Negativa** | Banda di sfondo sotto lo zero sul grafico |
| **Stato Cash Flow** | Giudizio discorsivo; valore osservato «Nessuna tensione prevista» |
| **Linea di Credito** | Giudizio sul bisogno di affidamento; valore osservato «Non necessaria» |
| **Liquidità Sicura** | Badge di stato di Cash Command |
| **Ciclo Cassa** | DSO meno DPO, in giorni; negativo significa che si incassa prima di pagare |
| **DSO** | Giorni medi per incassare; sottotitolo «Giorni per incassare» |
| **DPO** | Giorni medi prima di pagare; sottotitolo «Giorni prima di pagare» |
| **Pesato** | Media ponderata per importo: quanto tardano i **soldi** |
| **Puro** | Media aritmetica semplice: quanto tardano i **clienti** |
| **Pesato 6m / Puro 6m** | Le stesse due misure sul semestre precedente, per il confronto |
| **Utilizzo Fido** | Quanti giorni al mese il conto sta sotto zero, espresso in «gg/mese» |

### 11.3 Stati e qualità del dato

| Etichetta | Cosa designa |
|---|---|
| **Consolidato** | Movimento bancario reale, non ancora abbinato a un documento |
| **Completo** | Movimento abbinato al proprio documento |
| **Previsto** | Proiezione da una fattura non ancora movimentata |
| **Provvisorio** | Movimento con grado di certezza inferiore al consolidato |
| **Non riconciliato** | Movimento senza abbinamento; compare anche come testo al posto del nome della controparte |
| **Saldate fuori sistema** | Fatture marcate pagate con tutti e sette i canali di saldo a zero |
| **Da Pagare** | Stato di una scadenza non ancora saldata |
| **Scaduto** | Sul cruscotto è la posizione **netta** dello scaduto, crediti meno debiti, non un totale |
| **Da Saldare** | Nello Scadenziario: la parte del mese corrente non ancora scaduta |
| **Da incassare / Da pagare** | Le due colonne dello Scadenziario |
| **di cui scaduto** | Quota già in ritardo dentro il totale della colonna |
| **Manca fido** | Etichetta al posto dell'importo quando l'affidamento non è configurato |

### 11.4 Documenti e strumenti finanziari

| Etichetta | Cosa designa |
|---|---|
| **Scadenziario** | La vista delle scadenze attive e passive |
| **Tesoreria** | La griglia giornaliera per conto (rotta `/cash-control-room`) |
| **Riconciliazione Assistita** | Il motore di abbinamento a punteggio |
| **Anticipi SBF** | Anticipo salvo buon fine: finanziamento su fatture presentate in banca |
| **Ritenute d'Acconto** | Trattenuta fiscale sul compenso, con base, aliquota e importo |
| **Prospetto IVA (Base)** | Riepilogo IVA; «Base» segnala l'esistenza di una versione avanzata a pagamento |
| **Split payment** | Scissione dei pagamenti verso la pubblica amministrazione |
| **Aliquote IVA diverse** | Casella per le fatture con più aliquote |
| **Nota Credito** | Documento di storno, uno dei sette canali di saldo |
| **Compensazione** | Chiusura di una partita con una partita opposta |
| **Differenza cambio** | Scarto da valuta estera, canale di saldo a sé |
| **Rata Ricorrente / Uscita ricorrente** | Rata generata da una ricorrenza; identificata come «Rata #N» |
| **Entrate/Uscite Ricorrenti** | La sezione delle ricorrenze |
| **Altre Uscite/Entrate** | Movimenti non originati da fattura |
| **Estratto Conto** | Riepilogo mensile della carta di credito, abbinabile all'addebito bancario |
| **Solleciti / Promemoria automatici** | Invii automatici ai clienti in ritardo (addon) |
| **Chiusura Z** (`z-reports`) | Chiusura fiscale giornaliera del registratore di cassa |
| **Versamenti** (`deposits`) | Il contante portato in banca |
| **Quadratura** (`reconciliation`) | Verifica che il versato corrisponda al venduto |

### 11.5 Regole di abbinamento

| Sigla | Etichetta |
|---|---|
| **R1** | Nota Credito ↔ Fattura |
| **R2** | Banca ↔ Fattura |
| **R3** | Prevista ↔ Fattura |
| **R4** | Banca ↔ Rata Ricorrente |
| **R5** | Carta ↔ Fattura |
| **R6** | Estratto Conto ↔ Banca |

### 11.6 Motivazioni del punteggio

«Importo identico alla rata» · «Importo simile alla rata» · «Controparte
probabile» · «Nome ricorrente nel testo» · «Unico match possibile» · «Rata #N di
"<nome>"» · «N alternative» · «SELEZIONA ABBINAMENTO» · «Approva Tutte le
Sicure» · «Approva selezionata» · «Salta tutte» · «Nuova Analisi» · «Calcola
Proposte» · «Storico Analisi» · «In Attesa» · «Completamento» · fasce **Alta /
Media / Bassa**.

---

## 12. Debolezze di interfaccia

### 12.1 Già documentate

**Contatori della riconciliazione incoerenti.** `[OSSERVATO]` L'intestazione
dichiara 10 proposte totali, ma i filtri per fascia ne sommano 1
(`Alta 0 + Media 0 + Bassa 1`); «In Attesa» vale 1 mentre le proposte non
lavorate sono 10; una proposta etichettata «Media» non è contata dal filtro
«Media». `[DEDOTTO]` La classificazione della singola proposta è corretta, sono
gli aggregati a essere calcolati su un sottoinsieme.

**Campanello inerte, ma con il pallino.** `[OSSERVATO]` L'icona a campanello ha
`data-testid="button-notifications"`, non apre alcun pannello, non espone
`aria-expanded` e non è disabilitata. **Negli screenshot 03, 04, 05, 06, 07, 08
e 09 il campanello mostra però un puntino rosso in alto a destra.**
`[DEDOTTO]` È peggio di un segnaposto: l'indicatore dichiara che c'è qualcosa
da leggere e il clic non lo mostra. Un elemento morto che non promette nulla è
un'assenza; uno che promette e non mantiene è un difetto.

**Tre valori diversi per lo stesso saldo.** `[OSSERVATO]` Il conto principale
vale 119.693,07 € secondo l'API del cruscotto, 118.711,93 € nella griglia della
Tesoreria e 92.688,61 € nella scheda di dettaglio della **stessa pagina**. Il
saldo aziendale vale 179.193,07 € sul cruscotto, 172.546,33 € su Cash Command,
178.211,93 € in Tesoreria. `[VERIFICATO]` La differenza fra i primi due —
6.646,74 € — è esattamente un bonifico datato 20/08/2026, cioè nel futuro: il
«Saldo Attuale» del cruscotto somma i movimenti con data futura, Cash Command
no.

**Tasso al 113%.** `[OSSERVATO]` La griglia mostra «113.333%» come tasso medio
creditore, costante su tutti i giorni. `[VERIFICATO]` I tassi reali dei tre
conti sono 0,10%, 3,25% e 0,05%; la loro media semplice è 1,1333%, che
moltiplicata di nuovo per cento dà esattamente il 113,333% mostrato. Doppia
conversione in percentuale. Trascina con sé la riga «Interessi Stimati»
(479,03 € al giorno), che diventa inattendibile. In più la media è aritmetica
anziché ponderata per il saldo: quella corretta sarebbe circa 0,98%.
Vedi `04-logiche-di-calcolo.md`, cap. 11b.

**Percentuali di variazione che non tornano.** `[OSSERVATO]` Crediti: 201.901,66
contro «Mese scorso 58.039,47» con variazione mostrata «+43%», mentre il calcolo
dà +248%. Debiti: «+9%» mostrato contro +430% calcolato. Solo «Scaduto» è
corretto. `[DEDOTTO]` Il difetto non è nel calcolo di per sé ma
nell'accostamento: due numeri uno sotto l'altro che non si spiegano a vicenda.

**Scadenziario e cruscotto in disaccordo.** `[OSSERVATO]` «Da incassare» vale
202.760,35 € nello Scadenziario e «Crediti» 201.901,66 € sul cruscotto: 858,69 €
di scarto, identico sulla riga dello scaduto netto.

**Etichetta «Scaduto» ambigua.** `[OSSERVATO]` La scheda mostra un valore
negativo che è la posizione netta (crediti scaduti meno debiti scaduti); un
utente legge ragionevolmente «quanto ho di scaduto» e interpreta il meno come
un ammontare.

**Paywall non applicato lato server.** `[OSSERVATO]` `/api/retail/*` e
`/api/reminders/*` rispondono 200 a un account senza addon; solo `/api/fiscal/*`
risponde 403.

### 12.2 Aggiunte dall'osservazione degli screenshot

**Numeri che escono dalle proprie schede.** `[OSSERVATO]` Su Cash Command
(screenshot 06) i valori delle quattro schede indicatore **tracimano oltre il
bordo del contenitore**: «172.546,33» è tagliato dal margine della card,
«249.193,07», «195.031,76» e «170.720,95» sporgono visibilmente. `[DEDOTTO]`
Larghezze fisse dimensionate su importi più corti; con sei cifre e i separatori
il testo non ci sta. È il difetto visivo più evidente del prodotto, e sta sulla
pagina che i documenti definiscono «la vista più curata».

**Pluralizzazione sbagliata.** `[OSSERVATO]` Il riquadro «Saldate fuori sistema»
mostra il badge **«15 fattura»** (screenshot 05). `[DEDOTTO]` Concatenazione di
un numero e di una parola al singolare senza regola di plurale. Su un prodotto
interamente in italiano stona, e si ripete ovunque ci sia un contatore.

**Separatore decimale all'inglese.** `[OSSERVATO]` La variazione di Cash Command
è scritta «+13.0%» con il punto, e il tasso della Tesoreria «113.333%».
`[DEDOTTO]` Gli importi in euro sono formattati correttamente all'italiana
(«€179.193,07») ma le percentuali no. Nel caso del tasso l'ambiguità è
sostanziale: in italiano il punto separa le migliaia, quindi «113.333%» si può
leggere sia come centotredicimila per cento sia come 113,333 per cento. Due
formattatori diversi nella stessa applicazione.

**Descrizione troncata su un avviso importante.** `[OSSERVATO]` Il testo del
riquadro «Saldate fuori sistema» è tagliato con i puntini di sospensione
(«…ritenuta, nota …») quando il riquadro è chiuso. `[DEDOTTO]` La spiegazione
delle cause legittime — che è la parte che evita di far leggere quelle 15
fatture come errori — è proprio quella che si perde.

**Il carosello promette una lunghezza che non ha.** `[OSSERVATO]` Sei puntini
per un numero di schede documentato come tre (capitolo 9.2).

**Sei elementi su una griglia da cinque.** `[OSSERVATO]` Le regole R1…R6 dello
stato didattico sono disposte cinque più uno, con R6 orfana e centrata.

**Colore diverso per la stessa azione.** `[OSSERVATO]` «Aggiorna» è verde acqua
scuro su Cash Command e indaco sulla Tesoreria.

**Un elemento in trabocco nella testata.** `[OSSERVATO]` A 1280 px di larghezza,
sul bordo destro della fascia degli indicatori, si vede una «v» tagliata:
qualcosa non trova spazio e viene tagliato invece di adattarsi.

**Verde sull'aumento dei debiti.** Descritto al capitolo 8.3.

### 12.2b Aggiunte dagli esperimenti dell'11 agosto

Sono difetti che non si vedono guardando: si vedono solo interagendo, e sono
elencati qui perché è dove la sintesi li cercherà. Ognuno rimanda al capitolo
dove è documentato con la prova.

| Difetto | Gravità | Dove |
|---|---|---|
| Creando una fattura, né la lista né i totali si aggiornano, e nessun messaggio compare: la schermata mostra attivamente il contrario di quel che è successo | **alta** | 6.5 |
| Se la rete cade, l'operazione fallisce in perfetto silenzio: la conferma si chiude come in caso di successo, e nessuna mutazione ha una `onError` | **alta** | 5.4 |
| «Crediti aperti» vale tre cifre diverse in tre punti, e una di esse cambia da sola durante la sessione | **alta** | 6.9 |
| Con la rete interrotta molte schermate continuano a mostrare dati e a ricalcolare filtri, senza dire che sono fermi | **alta** | 5.4 |
| Durante il caricamento la lista fatture mostra «0,00 €» invece di un segnaposto | media | 5.3 |
| La cancellazione di una fattura non ha né conferma che nomini l'oggetto né annullamento; il cestino esiste solo per i movimenti | media | 6.6 |
| Il terzo clic sull'intestazione di colonna lascia la direzione invertita rispetto allo stato iniziale | media | 3.4 |
| Le intestazioni ordinabili sono `<div>` senza `tabindex` né `aria-sort`: da tastiera non si ordina | media | 3.4 |
| Servono 33 Tab per raggiungere il contenuto, su ogni pagina, perché manca il collegamento «salta al contenuto» | media | 8.4 |
| Un modulo di impostazioni si può abbandonare senza alcun avviso, perdendo le modifiche | media | 6.7 |
| Le classi `hover-elevate` e `active-elevate-2` non hanno alcuna regola CSS dietro | bassa | 8.4 |
| Il menu delle colonne si chiude a ogni spunta; la maniglia di ridimensionamento è larga 1 px | bassa | 3.5 |
| La descrizione accessibile della finestra di modifica è la chiave di traduzione grezza `invoices.editInvoiceDesc`, mai tradotta né in italiano né in inglese; il pulsante di chiusura si chiama «Close» | bassa | — |
| «Seleziona tutto» prende le 20 righe della pagina e non le 41 del filtro, senza offrire l'estensione | bassa | 3.8 |

`[VERIFICATO]` Sull'ultima riga della tabella, il dettaglio: la chiave
`invoices.editInvoiceDesc` compare una sola volta in tutto il bundle, nel punto
in cui viene usata — `a("invoices.editInvoiceDesc") || "Edit invoice details"` —
e mai nei dizionari. Poiché i18next restituisce la chiave stessa quando non
trova la traduzione, e una stringa non vuota è vera in JavaScript, il ripiego
dopo `||` non entra mai in funzione. L'elemento è `sr-only`, quindi il difetto
**non è visibile a schermo**: lo sente solo chi usa un lettore di schermo, al
quale la finestra si presenta dicendo «invoices.editInvoiceDesc».

### 12.3 La debolezza di fondo

`[DEDOTTO]` Sette degli undici difetti elencati sono la stessa cosa vista da
sette angoli: **lo stesso concetto è calcolato in più posti**. Tre saldi
aziendali, tre saldi di conto, due nozioni di «scaduto» (una calcolata al volo
dal cruscotto e una scritta in un campo `status` da un processo periodico), due
totali dei crediti, due formattatori numerici, due colori per lo stesso
pulsante.

Non è disattenzione, è una conseguenza dell'architettura: tre viste con tre
endpoint indipendenti, ognuno con la propria implementazione della stessa
domanda. Ogni volta che una regola sta scritta in due posti, prima o poi le due
copie divergono.

**La lezione per noi**, ed è la più importante del documento: qualunque cosa
decidiamo sul trattamento dei movimenti con data futura, sull'IVA in
liquidazione o sulla soglia di uno stato, **deve stare in una funzione sola**
in `src/lib/`, chiamata da tutte le viste. Il nostro schema aiuta — `Schedule`
ha già `dataAttesa` con `dataAttesaSource` proprio per non duplicare la logica
di «quando arriva davvero il denaro» — ma è una disciplina, non una garanzia.

---

## 13. Catalogo degli accorgimenti replicabili

> **Nota di metodo.** Questo capitolo era stato scritto come backlog ordinato
> per rapporto fra valore e costo, con stime di sforzo. Il metodo però riserva
> esplicitamente alla sessione di sintesi comparata la produzione di «matrici di
> confronto, backlog o ticket», perché la prioritizzazione ha senso solo
> confrontando ciò che emerge da **tutti** i prodotti esaminati.
>
> L'elenco che segue va quindi letto come **catalogo**, non come ordine di
> lavoro: le stime di tempo e la sequenza sono indicative e non impegnano
> nessuno. La prioritizzazione vera è materia della sintesi.

Ordinati per rapporto fra valore e costo. I primi sette sono realizzabili in
poche ore ciascuno, senza migrazioni di schema.

| Accorgimento | Perché funziona | Come lo realizziamo sul nostro stack |
|---|---|---|
| **«Saldate fuori sistema»** | Intercetta l'errore che falsa il previsionale in silenzio, e spiega le cause legittime invece di accusare | Query Prisma `Schedule.findMany({ where: { stato: 'pagata', reconciliations: { none: {} }, payments: { none: {} } } })`; `Collapsible` con `Badge` contatore in cima a `/scadenzario`. Nostro schema, nessuna migrazione |
| **Giudizi in linguaggio naturale** | Rispondono a «devo preoccuparmi?» invece che alla domanda tecnica; costano una soglia su una serie già calcolata | Funzione pura `giudizioLiquidita()` in `src/lib/`, due `Badge` sul cruscotto. **Correggiamo la loro taratura**: il giudizio deve peggiorare anche per anzianità dello scaduto, non solo per tensione di cassa |
| **Motivazioni accanto al punteggio** | Rende contestabile una decisione automatica, quindi credibile | `ScheduleReconciliation` ha già `confidence`: il matcher restituisce anche `contributi: {etichetta, peso}[]`; in UI una fila di `Badge variant="secondary"` più la barra segmentata (flex di div a larghezza percentuale) |
| **Punto minimo previsto con «In N gg»** | È la domanda vera della tesoreria: non quanto avrò alla fine, ma qual è il punto più basso e quando | `Math.min` sulla serie di `CashFlowForecastLine` già in tabella, più la data corrispondente; una `Card` su `/cash-flow`. Poche righe |
| **Schede che mostrano i propri addendi** | Rende una previsione falsificabile: si può contestare l'addendo sbagliato, non solo diffidare del totale | `Card` con righe `flex justify-between`, segno nell'etichetta e non nel valore, importi in `tabular-nums`, riga di totale separata da `border-t` |
| **«Manca fido» dove il dato è assente** | L'utente scopre la configurazione mancante quando gli serve, non in un pannello che non aprirà mai | Serve prima aggiungere `fidoTotale` e `fidoUtilizzato` a `BankAccount` (oggi assenti); poi `Badge variant="outline"` condizionato a `fidoTotale === null` |
| **Stati vuoti distinti per motivo** | Un vuoto di filtro e un vuoto di configurazione chiedono due azioni diverse | Un componente `<StatoVuoto motivo="filtro"\|"configurazione"\|"davvero-vuoto">` con l'azione giusta per ciascun caso |
| **Contatore dentro l'etichetta del filtro** | Evita il clic a vuoto e fa da legenda dei colori | `Badge` cliccabili con conteggio calcolato nella stessa query che carica le righe |
| **Selettore ancora + ampiezza** | Relativo quindi non scade, non ammette intervalli invalidi, un clic per dimensione, serializzabile in URL leggibile | Aggiungere `toggle-group` (**oggi assente** in `src/components/ui/`), due `ToggleGroup type="single"`, stato in `useSearchParams`, conversione in date solo lato server |
| **Mese corrente spezzato in scaduto / da saldare** | Sono due urgenze diverse e leggerle insieme le confonde | Chiave di raggruppamento `{annoMese, scaduta}` invece del solo mese in `/scadenzario/aging`; i mesi passati restano distinti, niente aggregato «scaduto» unico |
| **Colonna di oggi evidenziata e fine settimana grigio** | Il punto di riferimento non va cercato, e in tesoreria il sabato conta perché i bonifici non si muovono | Due classi condizionali sull'intestazione di colonna della griglia giornaliera |
| **Regole nominate mostrate prima di eseguire** | L'utente sa cosa sta per succedere e può attribuire un errore a una regola precisa | Le nostre regole vivono già in `ScheduleRule` e `CategorizationRule`: una griglia di `Card` sopra il pulsante di avvio, con la sigla ripetuta poi su ogni proposta |
| **Stato di attesa didattico** | Occupa con la spiegazione lo spazio e il momento in cui l'utente ha una domanda e nulla da fare | Lo stesso `<StatoVuoto>` con una prop che accetta l'elenco delle regole |
| **Alternative esplicite, ciascuna col suo punteggio** | Non forza una scelta quando i dati non la determinano | `RadioGroup` (già presente) dentro la scheda della proposta, punteggio a destra di ogni opzione |
| **Azione in blocco già circoscritta** | «Approva tutte le sicure» è più sicuro e più rapido di «seleziona tutto e agisci» | Route handler che applica la soglia lato server, non una lista di id costruita dal client |
| **Cinque stati del movimento invece di due** | Distingue il consuntivo dal previsto dal non abbinato, e i pulsanti insegnano l'esistenza degli stati meglio di una tendina | Il nostro `Schedule.stato` ha già cinque valori e c'è `verificata` come asse ortogonale: manca solo esporli come filtri a pulsanti sopra la lista |
| **Doppio saldo progressivo, conto e azienda** | Effetto locale e consolidato leggibili sulla stessa riga | Due colonne calcolate nella query con funzione finestra, non sommate lato client |
| **DSO e DPO in versione pesata e pura** | Distingue «tardano i soldi» da «tardano i clienti»; le celle del periodo precedente restano visibili come trattino | Quattro celle in una `Card`, due misure sulla stessa popolazione |
| **Utilizzo fido in giorni al mese** | È l'unità con cui la banca giudica un affidamento, quindi è azionabile | Conteggio dei giorni con saldo proiettato negativo nella finestra |
| **Saldo stimato progressivo sui mesi futuri** | Mostra l'effetto cumulato delle uscite pianificate, e non compare sul passato dove non avrebbe senso | Colonna a somma corrente calcolata solo per i gruppi con data futura |
| **Fascia dei quattro indicatori sempre visibile** | La posizione di cassa non si può dimenticare, qualunque schermata si stia usando | Quattro `Card` compatte in `src/app/(dashboard)/layout.tsx`, alimentate da **un solo** endpoint; sotto `md:` un valore solo e il resto in uno `Sheet` |
| **Carosello delle novità con «Salta tutto e non mostrare più»** | La formula dice esattamente cosa si sta accettando, cosa che una «×» non fa | `Dialog` con la versione vista salvata su `NotificationPreference`, che esiste già; apertura se `ultimaVersioneVista < versioneCorrente` |
| **Dati dimostrativi caricabili e cancellabili** | Un gestionale finanziario vuoto non convince nessuno; e chi carica i dati finti deve poterli togliere da dove li guarda | Seed idempotente marcato con un flag sulla `Venue`; il banner di rimozione sulla pagina dove i dati si vedono, non nelle impostazioni |
| **`data-testid` parlanti e generati** | Identificatori stabili rendono i test robusti al copy e l'interfaccia descrivibile dall'esterno | **Oggi ne abbiamo zero su 317 file `.tsx`**. Regola sostenibile: obbligatori su azioni irreversibili, righe con identità (`schedule-row-{id}`) e contatori aggregati, introdotti nei file che tocchiamo |
| **Palette di comandi** | Con molte rotte la sola barra laterale non basta; CashKing non offre né palette né ricerca globale | `command` è **già presente** in `src/components/ui/`: una `CommandDialog` su `Cmd+K` che indicizza rotte e scadenze aperte |
| **Griglia trasposta, giorni in colonna** | Con poche metriche fisse e molti giorni omogenei sta in una schermata; come tabella non ci starebbe | `Table` in `overflow-x-auto` con la prima colonna `sticky left-0`; le nove metriche calcolate in **una** query, non una per riga |
| **Esportazione Excel lato server** | L'esportato coincide con il filtrato per costruzione, e non pesa sul bundle | Route handler che riusa la stessa query della tabella |
| **Preset asimmetrico «Storico 30gg + Prev. 90gg»** | Nessun selettore da/a produce spontaneamente la finestra che serve davvero in tesoreria | Una riga di scorciatoie sopra il selettore ancora + ampiezza |
| **Colori semantici separati dal primario** | Se il colore del marchio coincide con «positivo», non si può più dire «importante» senza dire «buono» | Token `--entrata`, `--uscita`, `--previsto`, `--rischio` nel tema, usati solo per il significato; `<Variazione crescereEBene={false}>` che decide il colore dal senso e non dal segno |
| **Espansione in loco con stato nell'URL** | Il contesto resta visibile, e a differenza loro il link resta condivisibile | `Collapsible` e `Accordion` (entrambi presenti) con lo stato in `useSearchParams`, es. `?apri=2026-08` |
| **Sentinella `no_change` nella modifica in blocco** | Ogni campo ha tre stati dichiarati — lascia com'è, svuota, imposta a — e sparisce l'ambiguità del campo lasciato vuoto | Nel corpo della richiesta di aggiornamento multiplo, valore `no_change` escluso lato server prima della `updateMany`; nel modulo, un `Select` con la voce «Non modificare» come prima opzione |
| **Affordance di ordinamento sempre visibile** | La doppia freccia al 50% di opacità su ogni colonna ordinabile insegna che si può ordinare prima che l'utente ci provi | Icona `ChevronsUpDown` con `opacity-50` sulle intestazioni ordinabili, `ChevronUp`/`ChevronDown` piena su quella attiva. Da noi però dentro un `<button>` in un `<th aria-sort>`, che loro non hanno |
| **Azioni di riga sempre visibili, non al passaggio del mouse** | Ciò che appare solo in `hover` non esiste per chi usa il tocco, la tastiera o legge in scansione | Icone di azione in una colonna fissa a destra, dimensione ridotta e `aria-label` esplicito; niente `opacity-0 group-hover:opacity-100` |
| **Configurazione di tabella memorizzata per vista** | Colonne visibili, larghezze e ordinamento sopravvivono alla sessione, e ogni scheda ha la sua | Un solo hook `useConfigurazioneTabella(chiave)`. La correzione rispetto a loro: i **filtri** vanno nell'URL, non in memoria locale, e la larghezza si trascina con una maniglia da 6-8 px, non da 1 |
| **Due chiavi per «cosa hai già visto»** | La versione decide *se* mostrare le novità, l'elenco per nome decide *quali*: chi salta una release non perde nulla | `ultimaVersioneVista String` e `novitaViste String[]` su `NotificationPreference`, che esiste già. Sul profilo utente, non nel browser |
| **Dato in cache subito, aggiornamento in sottofondo** | Alla seconda visita la schermata è piena entro 300 ms anche con la rete lenta, e il valore vecchio è quasi sempre giusto | `staleTime` generoso sulle query di lettura, `refetchOnWindowFocus`; da accompagnare però con la marcatura dell'orario del dato, che a loro manca |

### Da non copiare

1. **Il paywall applicato solo nel client.** Due moduli su tre rispondono 200 a
   chi non ha pagato. Ogni nostro controllo di autorizzazione va nel route
   handler, e l'interfaccia si limita a riflettere una decisione già presa dal
   server.
2. **Lo stesso concetto calcolato in più posti.** È l'origine di sette dei loro
   difetti (capitolo 12.3).
3. **Un giudizio rassicurante che ignora una dimensione del rischio.**
4. **Una taratura del punteggio così conservativa da svuotare la fascia alta**,
   che rende inutile proprio l'azione in blocco costruita per sfruttarla.
5. **Contatori aggregati calcolati su una popolazione diversa da quella
   filtrata.** Se il totale e la somma dei filtri non coincidono, il difetto non
   è nei numeri, è nel fatto che l'utente smette di credere a entrambi.
6. **Un indicatore di notifica su un pannello che non si apre.** Meglio nessun
   campanello che un campanello acceso e muto.
7. **L'elenco delle query da invalidare scritto a mano in ogni mutazione.** È il
   modo in cui la creazione di una fattura ha finito per non aggiornare né la
   lista né i totali mentre la cancellazione lo fa (capitolo 6.5): dieci chiavi
   copiate a mano in un punto, otto in un altro, e le due che contavano sono
   proprio nell'elenco più lungo che non le contiene. Serve un registro unico
   entità → chiavi dipendenti.
8. **Uno zero formattato al posto di un indicatore di caricamento.** «Totale
   Crediti: 0,00 €» per un secondo e mezzo è un'informazione falsa presentata
   come vera (capitolo 5.3).
9. **Un totale ricostruito nel browser accanto a uno calcolato dal server.**
   Prima o poi divergono, e quando divergono nessuno se ne accorge finché non li
   si guarda insieme: 202.760,35 € contro 218.992,96 € per la stessa parola
   (capitolo 6.9).
10. **Una mutazione senza `onError`.** Il toast di successo senza il gemello di
    errore è peggio di nessun toast: insegna all'utente che il silenzio
    significa «non è successo niente», quando invece significa «non lo so»
    (capitolo 5.4).
11. **Un'operazione distruttiva senza né conferma che nomini l'oggetto né
    annullamento.** La cancellazione di una fattura ha una conferma generica
    («questa fattura») e un toast senza «Annulla»: le due difese possibili sono
    entrambe presenti in forma inefficace (capitolo 6.6).

---

## 13b. Stati vuoti cercati attivamente `[OSSERVATO]`

Con un dataset dimostrativo precaricato gli stati vuoti non si incontrano da
soli: vanno provocati. Sono stati cercati in tre modi — visitando aree che il
dataset non popola, e filtrando una lista fino a zero risultati.

### I quattro stati vuoti trovati

| Dove | Testo mostrato | Giudizio |
|---|---|---|
| `/settings/rules` | «Nessuna regola configurata» + «Crea la tua prima regola per automatizzare le operazioni» + pulsante **Aggiungi Regola** | Completo: dice cosa manca, perché serve, e offre l'azione |
| `/import/models` | «Nessun modello salvato» + «Salva un modello durante l'importazione per vederlo qui» | Ottimo: spiega che il modello si crea **altrove**, cioè risolve il dubbio vero |
| Cruscotto, Top Categorie di Spesa | «Nessuna spesa in questo periodo» | Sufficiente: lega il vuoto al filtro temporale attivo |
| Cruscotto, Gruppi Clienti | «Nessun gruppo clienti configurato» | Nudo: nessun invito ad agire, benché la funzione esista |

`[DEDOTTO]` La qualità è disomogenea. Dove il prodotto vuole spingere una
funzione (regole, modelli) lo stato vuoto è didattico e porta un pulsante; dove
la funzione è secondaria (gruppi clienti) è una constatazione.

Il migliore dei quattro è quello dei modelli di importazione, perché risponde
alla domanda che l'utente si sta davvero facendo — «dove si crea?» — invece che
a quella che si è già risposto da solo, cioè «non ce n'è».

### Lo stato «nessun risultato dopo filtro» `[OSSERVATO]`

Provocato inserendo una stringa senza corrispondenze nel campo di ricerca delle
fatture. Vedi `assets/cashking/screenshots/13-stato-nessun-risultato-dopo-filtro.png`.

Cosa succede:

- il corpo della tabella mostra **«Nessuna fattura trovata»**, e nient'altro:
  nessuna spiegazione, nessun invito a togliere il filtro;
- nella barra dei filtri **compare** un pulsante «Cancella Filtri» che prima non
  c'era;
- il contatore passa a «0 di 0» e la paginazione resta visibile su «Pagina 1 di 1»;
- l'intera fascia dei totali si azzera: Totale Entrate, Uscite, Crediti, Debiti
  e **Posizione Netta** vanno tutti a `0,00 €`.

`[DEDOTTO]` Due difetti distinti. Il primo è che la via d'uscita sta lontano dal
problema: il messaggio è al centro della tabella, il pulsante che lo risolve è
in cima alla pagina. Il secondo è più insidioso: «Posizione Netta: 0,00 €» è
scritto come un fatto sull'azienda, mentre è un artefatto del filtro. Un totale
che riflette il filtro è corretto in una tabella, ma diventa ambiguo quando ha
il nome di un indicatore aziendale.

**Come lo faremmo:** il messaggio di lista vuota deve contenere lui stesso il
pulsante che annulla i filtri, e i totali filtrati vanno etichettati come tali
(«Posizione netta dei risultati filtrati») o nascosti quando il filtro azzera
l'insieme.

---

## 13c. Persistenza dei filtri: sì, ma nel posto sbagliato `[OSSERVATO]`

Il metodo chiede se i filtri finiscano nell'URL. La risposta è **no**, e la
verifica ha prodotto qualcosa di più interessante.

Applicato il filtro di ricerca, l'indirizzo resta `https://cashking.biz/invoices`
senza alcuna stringa di query. Eppure, dopo aver navigato altrove ed essere
tornati con un **caricamento completo di pagina**, il filtro era ancora attivo e
la lista ancora vuota.

La causa è in `localStorage`:

```
cashking_invoice_filters = {"activeTab":"clients","filterStatus":"all",
  "filterSearch":"zzzqqqxxx-nessun-risultato","filterDateFrom":"","filterDateTo":…}
```

`[DEDOTTO]` Lo stato completo della vista — tab attivo, stato, ricerca,
intervallo di date — è salvato lato browser con una chiave per pagina. Ne
derivano tre conseguenze pratiche, due buone e una cattiva:

1. **Buona:** l'utente ritrova la vista come l'aveva lasciata anche il giorno
   dopo, cosa che in tesoreria conta, perché si lavora per sessioni ripetute
   sullo stesso sottoinsieme.
2. **Cattiva:** la vista **non è condivisibile**. Non si può mandare a un
   collega o al commercialista il collegamento a «le fatture scadute di questo
   cliente»; bisogna spiegargli i filtri a voce.
3. **Rischiosa:** un filtro dimenticato sopravvive per sempre e in silenzio.
   Chi torna dopo due settimane vede una lista incompleta, e l'unico indizio è
   la presenza del pulsante «Cancella Filtri».

**Come lo faremmo:** i filtri nella query string, che dà condivisibilità e
cronologia del browser gratis, e in più un ripristino dell'ultima vista al
rientro. Le due cose non sono alternative: l'URL è la verità, `localStorage`
serve solo a decidere dove mandare l'utente quando arriva senza parametri.

### 13c-bis. Il rischio si è verificato su di me `[VERIFICATO]`

La terza conseguenza qui sopra era scritta al condizionale. Non lo è più.

Riaprendo `/invoices` a distanza di un giorno, dopo la chiusura e il riavvio del
browser, la pagina mostrava «Nessuna fattura trovata» e il contatore «0 di 0» su
un archivio di 83 fatture. Il motivo stava in
`cashking_invoice_filters.filterSearch = "TEST_CK_TENSIONE"`, un termine di
ricerca digitato in una sessione di prova del giorno prima e mai cancellato. Lo
screenshot è
`assets/cashking/screenshots/21-filtro-persistente-nessun-risultato.png`: si
vede la lista vuota e, sopra, i totali di testata che continuano a dichiarare
202.760,35 € di crediti e 87.816,07 € di debiti.

`[VERIFICATO]` La riga dei totali si comporta in modo opposto nei due casi, e la
differenza è precisamente ciò che rende la trappola efficace:

- con un filtro che **produce risultati**, i totali seguono il filtro. Con la
  ricerca `TEST_CK_UX` e una sola fattura in elenco mostrano «Totale Debiti:
  122,00 €», cioè l'importo di quella riga
  (`assets/cashking/screenshots/24-errore-di-rete-durante-una-modifica.png`);
- con un filtro che **non produce nulla**, i totali tornano a mostrare i valori
  **non filtrati**. Riprodotto apposta con la ricerca `zzz-nessun-risultato`:
  contatore «0 di 0», elenco «Nessuna fattura trovata», e sopra
  «Totale Crediti: 202.760,35 € · Totale Debiti: 87.816,07 €».

`[DEDOTTO]` È la combinazione a fare il danno, e va guardata bene perché è
riproducibile su qualunque prodotto che salvi i filtri:

- il filtro sopravvive alla chiusura del browser, quindi non c'è un «riavvio»
  che lo azzeri;
- l'URL non lo mostra, quindi l'indirizzo non tradisce nulla;
- e proprio nel solo caso in cui il disallineamento inganna — zero risultati —
  i totali smettono di seguire il filtro e mostrano numeri grandi, che è
  esattamente il segnale che dice all'utente «i dati ci sono».

Il risultato è una schermata che afferma due cose incompatibili nello stesso
riquadro — non ci sono fatture, e ci sono 202.760,35 € di crediti — senza che
nessuna delle due sia evidenziata come conseguenza di un filtro. L'unico
indizio è il testo dentro il campo di ricerca, in alto a sinistra, dove nessuno
guarda quando la lista è vuota.

**Il correttivo** è più piccolo del problema: quando un filtro è attivo, dirlo
dove si vede il vuoto («Nessuna fattura corrisponde a *TEST_CK_TENSIONE*» con
accanto «Rimuovi il filtro»), e far riferire ai contatori la stessa popolazione
della lista. Vale anche il criterio di scadenza: un filtro di ricerca testuale
ripristinato all'apertura dopo giorni ha più probabilità di essere un residuo
che un'intenzione.

---

## 13d. Comportamento su mobile `[OSSERVATO]`

Misurato a **390 × 844 px**, la larghezza tipica di un telefono. Il criterio
usato non è la sola larghezza della pagina: è stato confrontato `scrollWidth`
con `clientWidth` **dell'elemento `main`**, ed elencati gli elementi il cui
bordo destro supera la finestra.

### Cosa cambia
`[OSSERVATO]` La barra laterale sparisce del tutto — nessun elemento di
navigazione resta visibile — e compare un pulsante `button-mobile-menu`.

`[OSSERVATO]` **La fascia dei quattro saldi in testata non c'è più**:
`header-current-balance` esiste nel DOM ma ha larghezza zero.

`[DEDOTTO]` È il sacrificio più significativo. Su desktop quei quattro numeri
sono la firma del prodotto, presenti su ogni rotta; su telefono vengono
lasciati cadere, e la posizione di cassa torna a essere qualcosa che si va a
cercare invece che qualcosa che si ha sotto gli occhi. Discutibile proprio sul
dispositivo che si usa mentre si è fuori.

### Le tabelle diventano schede
`[OSSERVATO]` Sulla lista fatture, con 42 documenti e 20 righe rese, il
contenuto appare in schede verticali, una per fattura, ciascuna con numero,
badge dell'origine, controparte, le due date, imponibile, aliquota e importo
lordo, senza alcuno scorrimento orizzontale.
Vedi `assets/cashking/screenshots/15-mobile-390-fatture-a-schede.png`.

⚠️ **Precisazione a una misura iniziale imprecisa.** La prima verifica aveva
rilevato l'assenza di un elemento `<table>` nel DOM su mobile, e ne avevo
concluso che la tabella venisse sostituita da schede. Controllando poi la stessa
pagina a 1440 px si scopre che **il `<table>` non c'è nemmeno su desktop**: la
lista fatture è costruita con `div` a entrambe le larghezze.

`[DEDOTTO]` Non è quindi una tabella che si trasforma, ma una griglia di `div`
che dispone gli stessi dati in colonne su schermo largo e in blocchi impilati su
schermo stretto. Il risultato per l'utente è lo stesso ed è buono — niente
scorrimento orizzontale, niente colonne tagliate — ma la descrizione tecnica
corretta è un'altra, e la presenza o assenza del tag `<table>` non è la prova di
nulla.

`[OSSERVATO]` Un `<table>` con `tbody` esiste invece nelle stampe, per esempio
in `/prints/invoice-inconsistencies`. Le due aree usano impianti diversi.

`[OSSERVATO]` La fascia dei totali della lista (Totale Entrate, Uscite, Crediti,
Debiti, Posizione Netta) **sopravvive** su mobile, mentre quella del cruscotto
no.

### Un difetto misurabile sul cruscotto
`[OSSERVATO]` Sulla dashboard a 390 px:

```
body.scrollWidth  = 390   ← sembra tutto a posto
main.scrollWidth  = 395
main.clientWidth  = 390   ← main sfonda di 5 px
```

Gli elementi responsabili sono tre, tutti annidati nella scheda «Previsione
Flusso di Cassa»: la scheda stessa e la riga dei controlli di periodo, cioè le
quattro tendine mese/anno più i tre pulsanti «Anno scorso / Quest'anno / Anno
prossimo», che a quella larghezza non stanno in riga.

`[DEDOTTO]` Cinque pixel non rovinano la pagina, ma il caso è istruttivo: chi
avesse misurato il `body` avrebbe concluso che va tutto bene. Il contenitore che
sfonda è interno e ha un proprio contesto di scorrimento, quindi il difetto
resta invisibile finché non si misura l'elemento giusto.

### Sintesi
| Aspetto | Su mobile |
|---|---|
| Navigazione | collassata dietro un pulsante menu |
| Fascia dei quattro saldi | **eliminata** |
| Tabelle | sostituite da schede verticali, nessuno scorrimento orizzontale |
| Totali di lista | mantenuti |
| Filtri e ricerca | mantenuti |
| Sfondamento orizzontale | assente sulle liste, 5 px sul cruscotto |

---

## 14. Cosa resta da osservare

Chiuse l'11 agosto, con gli esperimenti descritti nei capitoli 3.4-3.8, 5.3-5.4,
6.5-6.9, 7.1, 8.4-8.5, 9.2b e 10.2:

- ~~Il comportamento della fascia dei quattro indicatori sotto i 768 px.~~
  **Misurato:** a 390 px la fascia sparisce del tutto. Vedi cap. 13d.
- ~~Lo stato di **caricamento**, mai catturato.~~ **Misurato** rallentando la
  rete a quattro secondi: nessuno scheletro, quattro rettangoli pulsanti su
  pagina vuota, e sulla lista fatture uno zero formattato per oltre un secondo.
  Cap. 5.3. Quello di **errore** è in `02-aree-funzionali/02-05`, cap. 1b, con
  `assets/cashking/screenshots/16-errore-con-apertura-ticket.png`; il caso della
  rete che cade, che è diverso e molto peggiore, è nel cap. 5.4.
- ~~Se la tabella dei movimenti abbia ordinamento per colonna e ricerca
  testuale.~~ **Verificato:** ordinamento lato server su cinque colonne, con un
  terzo stato che non riporta al punto di partenza. Cap. 3.4.
- ~~Il selettore delle colonne aperto.~~ **Aperto e trascritto:** dieci colonne,
  sette attive, e le tre nascoste di default sono Categoria, Descrizione e
  **Stato**. Cap. 3.5.
- ~~Toast, annullamento, salvataggio automatico, editing inline, viste salvate,
  scorrimento infinito, aggiornamenti ottimistici.~~ Tutti misurati o esclusi per
  ricerca esaustiva: capitoli 3.6, 3.7, 6.5, 6.6, 6.7, 6.8.

Restano aperte:

- Se le spunte verdi sulle sei schede delle regole di riconciliazione siano
  interattive.
- Il comportamento dei due punti con aggiornamento ottimistico (l'abbinamento di
  una fattura a un movimento e la rimozione di un incasso): sono documentati dal
  codice, non osservati a schermo, perché entrambi modificano lo stato di
  riconciliazione del dataset dimostrativo, che serve alle riletture del 17 e
  del 21-24 agosto.
- Il trattamento di un importo **negativo** nella griglia della Tesoreria: in
  questo dataset nessun giorno va sotto zero, quindi la codifica cromatica del
  rosso su fondo scuro non è osservabile.
- Come si comporta la modifica in blocco all'atto pratico: la sua forma è nota
  dal codice (sette campi con sentinella `no_change`), ma eseguirla avrebbe
  toccato venti documenti dimostrativi.

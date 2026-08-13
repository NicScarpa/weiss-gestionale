# Area funzionale — Scadenziario

Rotta `/due-schedule` · voce di menu «Scadenziario»
Sottotitolo: «Panoramica scadenze incassi e pagamenti»
Rilevazione: 11 agosto 2026, dataset dimostrativo.
Vedi `assets/cashking/screenshots/05-scadenziario-completo.png`.

---

## 1. Struttura della pagina `[OSSERVATO]`

Tre fasce sovrapposte:

1. **Sette indicatori di sintesi** in cima
2. Il riquadro **«Saldate fuori sistema»**
3. Due colonne di scadenze raggruppate per mese: **Da incassare** e **Da pagare**

---

## 2. Gli indicatori di sintesi `[OSSERVATO]`

| Indicatore | Valore | Sottotitolo |
|---|---|---|
| Liquidità Corrente | 179.193,07 € | |
| Stato Cash Flow | «Nessuna tensione prevista» | |
| Linea di Credito | «Non necessaria» | |
| DSO | vedi sotto | «Giorni per incassare» |
| DPO | vedi sotto | «Giorni prima di pagare» |
| Ciclo Cassa | −11 | «Ultimi 6 mesi» / «6 mesi prec. —» |
| Utilizzo Fido | 0 gg/mese | |

`[DEDOTTO]` «Stato Cash Flow» e «Linea di Credito» sono giudizi in linguaggio
naturale, non numeri: rispondono a «devo preoccuparmi?» e «mi serve chiedere
soldi alla banca?». Sono le due domande che un imprenditore fa davvero, e
tradurre i numeri in quelle due risposte è un accorgimento a costo quasi nullo.

`[DEDOTTO]` **Utilizzo Fido misurato in giorni al mese**, non in euro né in
percentuale: quanti giorni al mese il conto sta sotto zero. È l'unità con cui
la banca giudica un affidamento, e dice all'imprenditore qualcosa di
azionabile.

### DSO e DPO in quattro varianti `[OSSERVATO]`

Ogni indicatore mostra quattro celle:

| | Pesato | Puro | Pesato 6m | Puro 6m |
|---|---|---|---|---|
| DSO | 42 | 43 | — | — |
| DPO | 53 | 51 | — | — |

Questo **scioglie l'ipotesi** lasciata aperta in `../04-logiche-di-calcolo.md`:
la coppia `dso`/`dsoPure` dell'API non distingue due popolazioni di fatture ma
due **metodi di media**.

`[DEDOTTO]` «Pesato» media i giorni ponderandoli per l'importo della fattura;
«Puro» fa la media aritmetica semplice. Sono le due misure classiche: la prima
dice quanto tardano i soldi, la seconda quanto tardano i clienti. Un DSO pesato
più basso di quello puro (42 contro 43) significa che le fatture grandi si
incassano leggermente prima delle piccole.

Le colonne «6m» sono il periodo precedente, oggi vuote perché il dataset non ha
storia sufficiente — coerente con `previousPeriod: null` nell'API.

### Ipotesi chiusa dal report DSO/DPO `[VERIFICATO]`

La conferma non è arrivata iniettando fatture ma leggendo la stampa
`/prints/dso-dpo`, che affianca le due colonne **cliente per cliente** e le
totalizza. Vedi `assets/cashking/screenshots/18-report-dso-dpo-pesato-e-puro.png`.

`[OSSERVATO]` Su ogni singolo cliente le due misure **coincidono**: 4 e 4, 31 e
31, 32 e 32, 63 e 63, 60 e 60. Sulla riga dei totali invece divergono:
**26 giorni pesato contro 32 puro**.

`[DEDOTTO]` La coincidenza a livello di cliente è attesa: se le fatture di quel
cliente hanno tutte lo stesso ritardo, media semplice e media ponderata danno lo
stesso numero. La divergenza compare solo aggregando clienti diversi.

**Verifica aritmetica del «puro».** I nove clienti con un valore hanno DSO
4, 31, 31, 1, 32, 63, 32, 60, 32. La loro media aritmetica semplice è
`286 / 9 = 31,8`, cioè **32**: esattamente il totale mostrato. ✔

**Verifica del «pesato».** Ponderando gli stessi nove valori per il fatturato di
ciascun cliente si ottiene circa 28, mentre il report mostra 26. `[IPOTESI]` Lo scarto si spiega probabilmente col fatto che i DSO per cliente
sono già arrotondati all'unità e che l'aggregato è calcolato sulle singole
fatture anziché sui valori di cliente arrotondati. Non dimostrato.

`[DEDOTTO]` La semantica è quindi confermata: **«pesato» pondera per importo,
«puro» è la media aritmetica dei soggetti**. Rispondono a due domande diverse,
«quanto tardano i soldi» e «quanto tardano i clienti», e la distanza fra le due
— qui sei giorni — dice che i clienti grandi pagano prima dei piccoli.

### Ma i numeri non sono gli stessi del cruscotto `[OSSERVATO]`

| Fonte | DSO pesato | DSO puro |
|---|---|---|
| `/api/dashboard/cash-cycle` e Scadenziario | 42 | 43 |
| Stampa `/prints/dso-dpo` | **26** | **32** |

`[DEDOTTO]` Le due viste usano perimetri diversi — la prima dichiara una
finestra mobile di sei mesi su 42 fatture cliente, la stampa lavora per soggetto
su 18 clienti e 313.190,38 € di fatturato, quindi presumibilmente su tutto lo
storico. Nulla di sbagliato in sé, ma è il terzo caso in cui **la stessa
grandezza con lo stesso nome vale due cose diverse in due schermate**, senza che
nessuna delle due dichiari il proprio perimetro.

---

## 3b. Il resto del report DSO/DPO `[OSSERVATO]`

Colonne: Cliente · Fatturato totale · **Termini di pagamento** · **Giorni
termini** · DSO (pesato) · DSO (puro) · **Differenza** · **Stato**.

Il valore aggiunto non è il DSO ma il **confronto con i termini pattuiti**: per
ogni cliente il report mostra i termini concordati, i giorni effettivi, e la
differenza fra i due, con un giudizio.

Legenda dichiarata: **Migliore** se paga prima dei termini, **Peggiore** se dopo,
**In linea** entro ±2 giorni.

Caso più istruttivo del dataset: *Innovation Labs Inc*, termini «Bonifico
Anticipato −7 gg», DSO effettivo 4 giorni, differenza **+11**, stato
**Peggiore**. Un cliente che paga in quattro giorni sembrerebbe ottimo in
assoluto; misurato contro l'impegno di pagare sette giorni **prima** della
fattura, è in ritardo di undici. È esattamente il ribaltamento di giudizio che
un DSO nudo non produce mai.

`[OSSERVATO]` In testa: Totale soggetti 18 · Fatturato totale 313.190,38 € ·
DSO medio pesato 26 gg · **Performance 0/2**. Esportazioni CSV, Excel e Stampa.

`[VERIFICATO]` L'export CSV archiviato lo dichiara: la riga dei totali riporta
letteralmente **«0 migliori / 2 peggiori»**, e fra le diciotto righe ci sono
esattamente due «Peggiore» e zero «Migliore». Il contatore mette dunque a
rapporto i clienti migliori e quelli peggiori, ignorando gli «In linea».

### I termini di pagamento vengono dedotti dalle date `[OSSERVATO]`
Fra i clienti compare `TEST_CK_Cliente Prova` con termini **«3 giorni data
fattura»**. Non li ho mai impostati: la fattura di prova aveva emissione 11/08 e
scadenza 14/08, e il sistema ne ha ricavato il termine.

`[DEDOTTO]` Quando il termine non è indicato esplicitamente, viene inferito
dalla distanza fra data documento e scadenza. Il che rende il confronto
«effettivo contro pattuito» disponibile anche su anagrafiche mai configurate —
ma anche circolare, perché il pattuito viene dedotto dallo stesso documento che
si sta misurando.

---

## 3. «Saldate fuori sistema» — il guardiano della qualità del dato `[OSSERVATO]`

Riquadro con contatore **«15 fattura»** e questo testo:

> Fatture marcate come pagate ma senza alcun movimento collegato (banca, carta,
> gateway, compensazione, ritenuta, nota di credito o differenza cambio). Non
> incidono sul cashflow: probabilmente saldate in cassa, con nota spese o con
> compensazione manuale.

`[DEDOTTO]` È la funzione più intelligente dello scadenzario, e non è una
funzione di tesoreria: è un **controllo di integrità dei dati** promosso a
elemento di interfaccia.

Il problema che risolve è reale e universale: qualcuno marca una fattura come
pagata senza collegarla a un movimento, e da quel momento il previsionale è
sbagliato in silenzio, perché quella fattura non genera più né un incasso atteso
né un movimento reale. Il prodotto le conta, le isola, e — dettaglio che fa la
differenza — **spiega perché può essere legittimo** («probabilmente saldate in
cassa, con nota spese o con compensazione manuale»), invece di presentarle come
errori.

`[OSSERVATO]` L'elenco dei sette canali citati nel testo coincide esattamente
con le sette voci dell'oggetto `reconciliationAmounts` dell'API delle fatture
(`bank`, `creditCard`, `gateway`, `offset`, `compensation`, `withholding`,
`fxGain`). Il riquadro è quindi il complemento a zero di quel modello: sono le
fatture in cui tutti e sette i canali valgono zero ma lo stato è «pagata».

`[OSSERVATO]` Il riquadro ha `data-testid="due-schedule-paid-without-movement-toggle"`.
`[DEDOTTO]` È espandibile per vedere l'elenco delle 15 fatture.

**Per noi è replicabile subito** e vale più di molte funzionalità grandi: una
query che cerca i documenti con stato «pagato» e nessun collegamento, esposta
come contatore cliccabile in cima allo scadenzario.

---

## 4. Le due colonne di scadenze `[OSSERVATO]`

### Da incassare — 202.760,35 €, di cui scaduto 52.604,13 €

| Gruppo | N. | Importo |
|---|---|---|
| Aprile 2026 | 1 | 5.643,70 € |
| Maggio 2026 | 1 | 5.344,33 € |
| Luglio 2026 | 3 | 31.560,50 € |
| **Agosto 2026 — Scaduto** | 2 | 10.055,60 € |
| **Agosto 2026 — Da Saldare** | 5 | 30.350,30 € |
| Settembre 2026 | 6 | 55.893,72 € |
| Ottobre 2026 | 7 | 63.912,20 € |

### Da pagare — 87.816,07 €, di cui scaduto 54.281,16 €

| Gruppo | N. | Importo | Saldo stimato |
|---|---|---|---|
| Maggio 2026 | 3 | 13.194,56 € | |
| Giugno 2026 | 5 | 14.170,20 € | |
| Luglio 2026 | 6 | 22.962,24 € | |
| Agosto 2026 — Scaduto | 1 | 3.954,16 € | |
| Agosto 2026 — Da Saldare | 4 | 15.378,38 € | 139.883,83 € |
| Settembre 2026 | 5 | 11.361,23 € | 184.416,32 € |
| Ottobre 2026 | 2 | 6.795,30 € | 241.533,22 € |

### Tre accorgimenti nel raggruppamento

`[DEDOTTO]` **Il mese corrente è spezzato in due.** «Agosto 2026 — Scaduto» e
«Agosto 2026 — Da Saldare» sono righe separate. È la distinzione che conta
davvero all'inizio del mese: ciò che è già in ritardo non è la stessa cosa di
ciò che scade fra due settimane, e metterli nello stesso secchio «agosto» li
confonderebbe.

`[DEDOTTO]` **I mesi passati non sono aggregati in un unico "scaduto".**
Aprile, maggio e luglio restano righe distinte: l'anzianità dello scaduto resta
leggibile senza aprire un aging report separato.

`[DEDOTTO]` **Il «Saldo stimato» compare solo dai mesi futuri in poi**, e solo
sulla colonna dei pagamenti. È la proiezione progressiva del saldo dopo aver
onorato quelle uscite. Sul passato non avrebbe senso, e infatti non c'è.

`[OSSERVATO]` I `data-testid` confermano lo schema:
`month-overdue-collect-2026-04`, `month-collect-2026-08`,
`month-overdue-pay-2026-08`, `month-pay-2026-09` — cioè quattro famiglie
(scaduto/normale × incasso/pagamento) indicizzate per mese.

---

## 5. Difetti rilevati

### 5.1 Disallineamento col cruscotto `[OSSERVATO]`
«Da incassare» vale qui 202.760,35 € mentre il cruscotto dichiara «Crediti»
201.901,66 €: **858,69 € di scarto**. Lo stesso scarto si ritrova sul netto
dello scaduto. Dettaglio in `02-02-liquidita-e-previsionale.md`, cap. 5.4.

### 5.2 «Liquidità Corrente» eredita il saldo gonfiato `[OSSERVATO]`
L'indicatore mostra 179.193,07 €, cioè lo stesso valore del cruscotto, che
include un movimento datato 20/08/2026. Su una pagina intitolata «scadenziario»,
dove tutto il resto è ordinato per data, la liquidità «corrente» comprende il
futuro.

### 5.3 Lo scaduto passivo supera quello attivo ma lo stato resta sereno `[OSSERVATO]`
Scaduto da pagare 54.281,16 € contro scaduto da incassare 52.604,13 €, eppure
«Stato Cash Flow: Nessuna tensione prevista» e «Linea di Credito: Non
necessaria».

`[DEDOTTO]` Il giudizio di stato guarda alla proiezione del saldo, non
all'anzianità dei debiti. Con 179.000 € in cassa la tensione effettivamente non
c'è. Resta che oltre 54.000 € di fornitori scaduti siano compatibili con
l'etichetta «nessuna tensione»: il giudizio ignora la dimensione reputazionale
e contrattuale del ritardo.

---

## 6. Cosa ne ricaviamo per il nostro gestionale

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| «Saldate fuori sistema» | Intercetta l'errore che falsa il previsionale in silenzio, e ne spiega le cause legittime | Query sui documenti con stato pagato e zero collegamenti; contatore espandibile in cima allo scadenzario |
| Mese corrente spezzato in scaduto / da saldare | Sono due urgenze diverse e vanno lette separate | Chiave di raggruppamento `{anno-mese, scaduto booleano}` invece del solo mese |
| Mesi passati non collassati | L'anzianità dello scaduto resta visibile senza un report a parte | Nessuna aggregazione sotto la data odierna |
| Saldo stimato progressivo sui mesi futuri | Mostra l'effetto cumulato delle uscite pianificate | Colonna calcolata a somma corrente, solo per i gruppi futuri |
| DSO e DPO in versione pesata e pura affiancate | Distingue «tardano i soldi» da «tardano i clienti» | Due misure nella stessa scheda, con periodo precedente a fianco |
| Utilizzo fido in giorni al mese | Unità con cui ragiona la banca, azionabile | Conteggio dei giorni con saldo negativo nella finestra |
| Giudizi in linguaggio naturale | Rispondono alla domanda vera, non a quella tecnica | Due badge derivati da soglie sulla curva proiettata |

**Da non copiare:** un giudizio di stato rassicurante che ignora 54.000 € di
scaduto passivo, e la «liquidità corrente» che include movimenti futuri.

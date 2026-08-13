# Area funzionale — Liquidità e previsionale

Tre viste distinte sullo stesso oggetto: `/dashboard`, `/cash-command`
(Cash Command Center) e `/cash-control-room` (Tesoreria).
Rilevazione: 11 agosto 2026, dataset dimostrativo.
Le formule verificate stanno in `../04-logiche-di-calcolo.md`; qui il disegno
delle schermate e ciò che le distingue.

---

## 1. Tre viste, tre orizzonti

`[DEDOTTO]` Il prodotto non ha una sola pagina di cassa ma tre, separate per
orizzonte temporale e per grana:

| Vista | Sottotitolo dichiarato | Orizzonte | Grana |
|---|---|---|---|
| Dashboard | «Gestione finanziaria intelligente» | mese corrente + 90 giorni | aggregata |
| Cash Command Center | «Sala di Controllo della Liquidità» | 30 giorni avanti, storico dietro | movimento per movimento |
| Tesoreria | «Previsione liquidità giorno per giorno» | finestra scelta, fino a 90 giorni | giorno per giorno, conto per conto |

Ciascuna endpoint proprio: `/api/dashboard/*`, `/api/cash-command`,
`/api/cash-control-room`.

---

## 2. Dashboard `[OSSERVATO]`

Fascia fissa in testata con quattro indicatori sempre visibili in ogni pagina
dell'applicazione, non solo sul cruscotto: Saldo Attuale, Saldo disponibile,
Saldo a Fine Mese, Previsione Cassa.

`[DEDOTTO]` Tenere i quattro numeri in testata su **tutte** le rotte è una
scelta forte: qualunque cosa l'utente stia facendo, la posizione di cassa resta
sotto gli occhi. Costa spazio verticale su ogni schermata.

Sotto: **Acid Test di Cassa** (valore in mesi, etichetta di stato, messaggio
discorsivo, pulsante «Apri Scadenziario»), le due schede con la scomposizione
di fine mese e dei 90 giorni, tre schede Crediti/Debiti/Scaduto, il grafico
«Previsione Flusso di Cassa», e infine Movimenti Recenti, Top Categorie di
Spesa, Top Clienti, Top Fornitori, Gruppi Clienti.

### Le schede mostrano la propria aritmetica `[OSSERVATO]`
Le schede «Saldo a Fine Mese» e «Previsione Cassa (90gg)» non danno solo il
risultato: elencano gli addendi con i segni, fino alla riga `=`.

```
Liquidità oggi                        179.193,07 €
Saldo disponibile (liquidità + fidi)  249.193,07 €
+ Incassi mese                         82.095,74 €
− Pagamenti mese                       91.173,66 €
= Contabile (solo cassa)              170.115,15 €
= Disponibile (cassa + leve)          240.115,15 €
```

`[DEDOTTO]` È lo stesso principio delle motivazioni nella riconciliazione: il
numero è verificabile a occhio. Per un direttore finanziario che deve fidarsi
di una previsione, vedere gli addendi vale più di un grafico.

### Il grafico di flusso `[OSSERVATO]`
Nove serie distinte, con legenda: Entrate (da Banca) · Entrate (incassi
fatture) · Previsioni di Entrata · Entrate Ricorrenti · Uscite (da Banca) ·
Uscite (pagamenti fatture) · Previsioni di Uscita · Pianificazione Uscite · IVA.

`[DEDOTTO]` La separazione fra «da Banca» e «da fatture» distingue il
consuntivo dal previsionale sulla stessa barra; la serie **IVA** isolata
conferma il trattamento dell'imposta come flusso a sé (vedi
`../04-logiche-di-calcolo.md`, cap. 3 e 4).

Selettore di periodo a quattro combo (mese e anno di inizio, mese e anno di
fine) più tre scorciatoie: «Anno scorso», «Quest'anno», «Anno prossimo».
Due interruttori di base: «Liquidità oggi» / «Saldo disponibile».

---

## 3. Cash Command Center `[OSSERVATO]`

La vista più curata del prodotto.
Vedi `assets/cashking/screenshots/06-cash-command-radar-liquidita.png`.

### Quattro indicatori in cima
| Indicatore | Valore osservato | Nota |
|---|---|---|
| Saldo Attuale | 172.546,33 € | |
| Saldo Disponibile | 249.193,07 € | sottotitolo: «Saldo + fido residuo + SBF» |
| Previsione fra 30 giorni | 195.031,76 € | con variazione «+13.0% rispetto ad oggi» |
| Saldo Minimo Previsto | 170.720,95 € | con «In 8 gg» |

`[DEDOTTO]` Il **saldo minimo previsto** con il numero di giorni che mancano è
la domanda vera della tesoreria: non «quanto avrò fra tre mesi» ma «qual è il
punto più basso della curva e quando arriva». È l'indicatore che manca quasi
sempre altrove.

### Badge di stato
`[OSSERVATO]` «✓ Liquidità Sicura — Nessuna tensione prevista nei prossimi 90gg».
`[DEDOTTO]` Un giudizio sintetico in linguaggio naturale sopra i numeri, con
una soglia implicita: se la curva prevista non tocca lo zero entro 90 giorni,
lo stato è sicuro.

### Radar di Liquidità
`[OSSERVATO]` Grafico «Visione annuale della liquidità» con serie: Saldo Reale,
Saldo Previsto, una linea per ciascuno dei tre conti, e una banda **«Zona
Negativa»**. Sotto il grafico, in chiaro: **«Punto minimo: 170.720,95 €
(20 ago 2026)»**.

Scorciatoie di periodo: «Mese corrente», **«Storico 30gg + Prev. 90gg»**,
«Prossimi 3 mesi», «Tutto».

`[DEDOTTO]` Il preset «Storico 30gg + Prev. 90gg» è asimmetrico di proposito:
poco passato per il contesto, molto futuro per la decisione. È esattamente la
finestra che serve, e non è ottenibile con un normale selettore da/a senza
farci pensare l'utente.

La banda «Zona Negativa» disegna il rischio invece di descriverlo: si vede a
colpo d'occhio se la curva ci entra.

### Tabella dei movimenti
`[OSSERVATO]` Colonne: Data · Stato · Descrizione · Controparte · Banca ·
Categoria · **Impatto Liquidità** · **Saldo Banca** · **Saldo Progressivo**.
Selettore «Colonne», esportazione «Excel», contatore «90 movimenti», paginazione
«20 di 90».

`[DEDOTTO]` Due saldi progressivi affiancati — quello del singolo conto e quello
aziendale complessivo — permettono di leggere sulla stessa riga l'effetto locale
e quello consolidato.

### Tassonomia degli stati del movimento `[OSSERVATO]`
Filtri: **Consolidato · Completo · Previsto · Provvisorio · Non riconciliato · Tutti**.

`[DEDOTTO]` Cinque stati, non due. «Consolidato» è il movimento bancario reale
ma non ancora abbinato a un documento; «Completo» è movimento più fattura;
«Previsto» è la proiezione da una fattura non ancora movimentata. Nella colonna
Controparte i movimenti non abbinati riportano letteralmente «Non riconciliato»
al posto del nome.

---

## 4. Tesoreria (Cash Control Room) `[OSSERVATO]`

Vedi `assets/cashking/screenshots/07-tesoreria-griglia-giornaliera.png`.

### Selettore di periodo ad ancora più ampiezza
Due gruppi di pulsanti invece delle solite due date:

- **PARTE DA**: Oggi · −15 giorni · −30 giorni · −60 giorni
- **DURATA FINESTRA**: 7 · 14 · 30 · 60 · 90 giorni

`[DEDOTTO]` Scegliere «da dove parto» e «quanto guardo» invece di due date
assolute è più vicino al modo in cui si ragiona in tesoreria, e rende la vista
riutilizzabile senza reimpostare nulla il giorno dopo. Da rubare.

### La griglia
Colonne = giorni (con il nome del giorno della settimana sopra la data:
`LUN 10/08`, `MAR 11/08`…). Righe = metriche:

| Riga | Valore osservato (10/08) |
|---|---|
| Saldo Totale | 178.211,93 € |
| Margine Disponibile | 248.211,93 € |
| Interessi Stimati | 479,03 € |
| Stato | OK |
| Totale Banche attive | 178.211,93 € |
| Tasso medio creditore | 113.333 % |
| Totale Banche passive | 0 |
| Tasso medio debitore | *(vuoto)* |
| Totale Banche | 178.211,93 € |

Poi una riga per conto, con nome e banca.

`[DEDOTTO]` La distinzione fra banche «attive» e «passive» (a saldo positivo o
negativo) con i rispettivi tassi medi è tipica della tesoreria d'impresa
italiana, e serve a capire quanto costa lo sbilanciamento fra conti. La riga
**Interessi Stimati** giorno per giorno è una funzione che va oltre la semplice
previsione di saldo.

### Dettaglio per conto
`[OSSERVATO]` Sotto la griglia, una scheda per conto: nome, banca, e il fido
(`Intesa Sanpaolo • Fido: €50.000,00`). Sul conto deposito FinecoBank, che non
ha fido, compare l'etichetta **«Manca fido»**.

`[DEDOTTO]` È un invito alla configurazione posizionato dove il dato manca,
invece di un pannello di impostazioni separato. Accorgimento economico e
replicabile.

---

## 5. Difetti rilevati

### 5.1 Tre valori diversi per lo stesso saldo `[OSSERVATO]`

Il saldo del **Conto Corrente Principale**, letto lo stesso giorno:

| Fonte | Valore |
|---|---|
| `/api/dashboard/total-balance` | 119.693,07 € |
| Tesoreria, riga della griglia al 10/08 e 11/08 | 118.711,93 € |
| Tesoreria, scheda «Dettaglio per Conto» | 92.688,61 € |

Le ultime due convivono **sulla stessa pagina**.

E il saldo **aziendale complessivo**:

| Fonte | Valore |
|---|---|
| Dashboard, «Saldo Attuale» | 179.193,07 € |
| Cash Command, «Saldo Attuale» | 172.546,33 € |
| Tesoreria, «Saldo Totale» | 178.211,93 € |

### 5.2 La causa di uno degli scarti è identificata `[VERIFICATO]`

```
179.193,07 − 172.546,33 = 6.646,74
```

6.646,74 € è esattamente l'importo del movimento «Bonifico da Green Energy Coop
— Saldo fatt. FV-2025/0024» che il cruscotto elenca fra i Movimenti Recenti con
data **20/08/2026**, cioè **nove giorni nel futuro**.

`[DEDOTTO]` Il «Saldo Attuale» del cruscotto somma anche i movimenti bancari con
data futura, mentre Cash Command li esclude correttamente. Il primo non è quindi
un saldo attuale ma un saldo a fine registrazioni.

`[OSSERVATO]` Sulla stessa pagina di Cash Command, «Saldo Attuale» vale
172.546,33 € e «Saldo Disponibile» 249.193,07 €: la differenza è 76.646,74 €,
mentre i fidi totali sono 70.000 €. I due indicatori affiancati poggiano quindi
su basi diverse.

`[IPOTESI]` Il saldo disponibile è calcolato dall'endpoint del cruscotto
(che include il futuro) mentre il saldo attuale da quello di Cash Command.
Test necessario: eliminare o ridatare il movimento del 20/08 e verificare che
i due valori si riallineino.

### 5.3 Tasso medio creditore al 113 % `[OSSERVATO]`
La griglia della Tesoreria riporta un «Tasso medio creditore» di **113,333 %**
costante su tutti i giorni. Nessun conto corrente remunera al 113 % annuo.

`[VERIFICATO]` Il confronto è stato fatto: i tassi reali sono 0,10%, 3,25% e
0,05%, la loro media semplice è 1,1333% e moltiplicata di nuovo per cento dà
esattamente il 113,333% mostrato. Doppia conversione in percentuale, più una
media aritmetica anziché ponderata. Vedi `../04-logiche-di-calcolo.md`, cap. 11b.

Di conseguenza anche la riga «Interessi Stimati» (479,03 €/giorno) è sospetta.

### 5.4 Il cruscotto e lo scadenzario non concordano `[OSSERVATO]`

| Grandezza | Dashboard | Scadenziario | Scarto |
|---|---|---|---|
| Crediti / Da incassare | 201.901,66 € | 202.760,35 € | 858,69 € |
| Scaduto netto | −2.535,72 € | −1.677,03 € (52.604,13 − 54.281,16) | 858,69 € |

Lo scarto è **identico** nelle due righe.

`[VERIFICATO]` La posta è stata individuata, e non è né una nota di credito né
una delle «saldate fuori sistema»: è l'**IVA della fattura extra-UE**
FV-2025/0033, 858,69 € su un imponibile di 8.586,91 al 10%. La scheda Crediti la
conta al netto — correttamente, perché una cessione extra-UE non è imponibile —
mentre le altre viste la contano al lordo. Vedi `../04-logiche-di-calcolo.md`,
cap. 14.

---

## 6. Cosa ne ricaviamo per il nostro gestionale

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| Saldo minimo previsto con i giorni che mancano | È la domanda vera: quando è il punto più basso, non quanto avrò alla fine | Calcolo del minimo sulla serie proiettata; scheda KPI con valore e data |
| Banda «Zona Negativa» sul grafico | Disegna il rischio invece di descriverlo | Area di riferimento sotto lo zero nel grafico, colore di pericolo attenuato |
| Preset «Storico 30gg + Prev. 90gg» | Finestra asimmetrica che corrisponde alla decisione reale | Voce fra le scorciatoie del selettore periodo |
| Ancora + ampiezza al posto di due date | Resta valido il giorno dopo senza reimpostarlo | Due gruppi `ToggleGroup` shadcn: punto di partenza e durata |
| Schede che mostrano i propri addendi | Rende verificabile a occhio una previsione | Righe etichettate con segno dentro la scheda, riga `=` in evidenza |
| «Manca fido» dove il dato è assente | Invito alla configurazione nel punto in cui serve | Badge condizionale sulla scheda del conto |
| Cinque stati del movimento | Distingue il consuntivo dal previsto dal non abbinato | Enum di stato con filtro a pulsanti sopra la tabella |
| Doppio saldo progressivo, conto e azienda | Effetto locale e consolidato sulla stessa riga | Due colonne calcolate nella query, non lato client |

**Da non copiare:** avere tre endpoint diversi che rispondono alla stessa
domanda «quanto ho in banca oggi». Qualunque cosa scegliamo sul trattamento dei
movimenti con data futura, deve essere una regola sola, applicata in un punto
solo del codice.

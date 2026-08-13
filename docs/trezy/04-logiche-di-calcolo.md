# Trezy — Logiche di calcolo, formule e test svolti

Documento delle regole di calcolo del prodotto: quelle **dichiarate** dal
produttore, quelle **osservate** nei payload API, e quelle **verificate**
confrontando input noti con l'output mostrato.

---

## Limiti di verificabilità

Sezione obbligatoria, da leggere prima di tutto il resto.

| Cosa non è stato valutabile | Causa | Cosa sarebbe servito |
|---|---|---|
| Comportamento del motore di previsione con previsioni inserite | `[NON POPOLATO]` — l'account non ha alcuna previsione manuale e i due scenari alternativi non esistono | Creare previsioni di prova: **vietato**, ambiente di produzione con dati reali |
| Riconciliazione previsione↔transazione nel merito (aggiornamento del residuo, stato «pagato») | `[NON POPOLATO]` + vincolo di sola lettura | Collegare una transazione a una previsione, operazione con effetti reali |
| Qualità del matching automatico dei «candidati» fattura↔transazione | `[NON VERIFICABILE]` | Confermare o rifiutare un candidato e osservare la reazione |
| Confronti anno su anno, DSO/DPO/DIO, variazioni di periodo | `[NON POPOLATO]` — un solo esercizio disponibile, nessuna fattura riconciliata a un pagamento | Almeno due esercizi di storico e un ciclo fattura-incasso completo |
| ~~Formula del «punto morto»~~ | **risolta** in corso d'analisi: sono ricavi annualizzati con fattore 365/101, §5.3 | — |
| Regole di priorità fra le tre fonti di previsione (`picked` / `pickedSource`) | `[NON POPOLATO]` — su questo account tutte le fonti valgono zero | Un account con previsioni manuali **e** fatture con data di pagamento attesa |
| Effetto reale dell'aliquota IVA sulle righe «IVA a debito / a credito / Saldo IVA» | `[NON VERIFICABILE]` — le righe IVA risultano prive di valori nel periodo osservato | Un periodo con previsioni IVA valorizzate |
| Qualità delle risposte dell'assistente «Chiedi a Trezy» | verificata su **una** domanda (§10): sufficiente a trovare un errore, non a misurare l'affidabilità complessiva | Una batteria di domande su calcoli di verifica indipendente |

**Avvertenza sulla profondità dello storico.** I movimenti coprono circa dieci
mesi e un solo esercizio. Le previsioni e gli indicatori osservati sono quindi il
comportamento del prodotto *in condizioni di dati insufficienti*. Dove questo
cambia l'interpretazione, è segnalato nel punto specifico.

---

## 1. Saldo futuro del flusso di cassa

### Formula dichiarata `[OSSERVATO]`

Dalla FAQ interna «Come viene calcolato il saldo futuro del cashflow?»:

```
saldo finale = saldo bancario attuale
             + Σ previsioni di entrata residue
             − Σ previsioni di uscita residue
```

Il produttore insiste su una parola: **residue**. Se una previsione di 10.000 ha
già 6.000 di transazioni collegate, nella proiezione entrano solo i 4.000 rimasti.
La FAQ dichiara inoltre che il calcolo è **invariante rispetto alla risoluzione**
scelta (giornaliera, settimanale, mensile, trimestrale).

### Test svolto ✔ superato

L'endpoint `GET /api/v2/forecast-breakdown` restituisce, per il periodo corrente:

```
totalForecastInflow: 0      totalForecastOutflow: 0
totalInflow: 43.507,85      totalOutflow: −61.170,56
```

Con previsioni residue nulle da entrambi i lati, la formula prevede una proiezione
piatta pari al saldo attuale. È esattamente ciò che mostra la tabella: la riga
«Contanti alla fine» riporta **31.140 €** su tutti i mesi futuri, identico al
«Saldo attuale» di testata (31.140,40 €).

Il test conferma la formula solo nel suo caso degenere — è comunque il caso che
smentirebbe una previsione «inventata» dal sistema, e non la smentisce.

### Test collaterale sull'aggregazione dei saldi ✔ superato

I tre conti collegati riportano singolarmente 9.278,43 + 14.080,66 + 7.781,31 €.
Somma: **31.140,40 €**, identica al totale di testata. Aggregazione corretta al
centesimo.

### Perché la proiezione è piatta `[NON POPOLATO]`, non un limite del prodotto

Tre condizioni concorrono, tutte di dato e non di software:

1. nessuna previsione manuale inserita (`totalForecast* = 0`);
2. quasi tutte le fatture hanno la colonna «Pagamento previsto» vuota, quindi non
   producono previsione datata;
3. l'endpoint `GET /api/invoices/future-cumulative` restituisce una curva che parte
   da −657,16 € l'11 agosto e **resta costante** per tutti i giorni successivi:
   due sole fatture con scadenza nota alimentano il futuro.

Un giudizio del tipo «Trezy non proietta le fatture nel cash flow» sarebbe
sbagliato: il meccanismo esiste (§3), non è alimentato.

---

## 2. Modalità di previsione: Dettagliato contro Globale

Impostazioni › Funzionalità espone la scelta con le formule scritte **in chiaro
nell'interfaccia** `[OSSERVATO]`:

| Modalità | Formula dichiarata | Quando conviene |
|---|---|---|
| **Dettagliato** (predefinita, `forecastMode: "default"`) | residuo per sottocategoria: `(previsione − reale)` calcolato indipendentemente su ciascuna | previsioni e transazioni allo stesso livello di dettaglio |
| **Globale** | residuo sulla categoria madre: `(previsione totale − reale totale)` | previsioni sulle categorie principali, transazioni sparse nelle sottocategorie |

La distinzione risolve un problema reale: se prevedo 10.000 € di «Acquisti» e le
transazioni arrivano su tre sottocategorie diverse, la modalità Dettagliato
lascerebbe la previsione madre intatta e sommerebbe il reale, gonfiando il totale.
Esporre la scelta all'utente, con la formula accanto, è una scelta di trasparenza
notevole.

`[NON POPOLATO]`: senza previsioni inserite le due modalità producono lo stesso
risultato, quindi la differenza non è stata verificata sui dati.

---

## 3. Le tre fonti della previsione e il campo `picked`

Il payload di `forecast-breakdown` porta, **per ogni categoria**, questa struttura
`[OSSERVATO]`:

```json
{
  "categoryName": "…",
  "totalAmount": 34356.95,
  "forecast": 0,
  "invoiceForecast": 0,
  "futureInvoiceForecast": 0,
  "lateInvoiceForecast": 0,
  "picked": 0,
  "pickedSource": "none",
  "calculation": "future remaining (aggregated) = 0"
}
```

Tre osservazioni.

**Primo**: la previsione ha **tre fonti distinte** — la previsione manuale
(`forecast`), le fatture con scadenza futura (`futureInvoiceForecast`) e le
fatture già scadute e non pagate (`lateInvoiceForecast`). Trattare separatamente
lo scaduto è corretto e tutt'altro che scontato: una fattura scaduta da 117 giorni
non ha lo stesso profilo di incasso di una in scadenza fra una settimana.

**Secondo**: i campi `picked` e `pickedSource` dicono che il motore **sceglie una
fonte** invece di sommarle. È il modo giusto per evitare il doppio conteggio
(prevedo 5.000 € di fornitori *e* ho la fattura da 5.000 €: sono lo stesso
esborso). La regola di precedenza non è però osservabile qui: su questo account
tutte le fonti valgono zero e `pickedSource` è `"none"`. `[NON POPOLATO]`

**Terzo, ed è il dettaglio più singolare**: il campo `calculation` contiene una
**stringa che descrive il calcolo applicato**. L'API si auto-documenta. Per chi
integra o fa debug è un regalo; è anche un'esposizione di logica interna verso il
client che molti prodotti eviterebbero.

---

## 4. Riconciliazione, stati di pagamento e residuo

### Regole dichiarate `[OSSERVATO]`

Dalle FAQ interne:

- **Aggancio**: una transazione può essere collegata a una previsione quando
  condividono **categoria e periodo**. Il collegamento è **manuale**, non automatico.
- **Residuo**: «se la previsione è di 5.000 e colleghi una transazione di 3.000, il
  residuo scende a 2.000».
- **Stati**: non pagata · parzialmente pagata · totalmente pagata. Quest'ultima
  compare «in grigio e barrata» nella tabella.
- **Solo il residuo entra nel saldo**: «il saldo del cashflow tiene conto solo
  dell'importo residuo (non pagato) delle previsioni future».
- **La riconciliazione è per scenario**: la stessa transazione può essere collegata
  a previsioni diverse in scenari diversi.

Quest'ultimo punto è il più interessante dal punto di vista del modello: il
collegamento non è un attributo della transazione ma una relazione ternaria
transazione × previsione × scenario.

### Coda di lavoro imposta `[OSSERVATO]`

La «casella di posta delle previsioni» si apre da sola entrando nel cashflow e
raggruppa tre code, che la FAQ dichiara vadano smaltite **in quest'ordine**:

1. verifica delle transazioni (dopo il collegamento di un conto);
2. riconciliazione delle previsioni;
3. monitoraggio delle fatture scadute o in arrivo.

L'ordine non è arbitrario: senza categorie validate la riconciliazione per
categoria non funziona.

### Test `[NON VERIFICABILE]`

Nessun collegamento è stato confermato: in produzione l'operazione modifica dati
reali. Le regole restano dichiarate ma non verificate sul campo.

---

## 5. Modulo Prestazioni

### 5.1 Generazione delle scritture in partita doppia

Il modulo produce **3.368 scritture** derivate dai soli movimenti bancari, con
giornale, numero di registrazione, conto, dare/avere e un identificativo
esadecimale che correla le due righe della stessa scrittura `[OSSERVATO]`.

Ogni schermata dell'area porta il banner **«Stima da transazioni bancarie, non
contabilità ufficiale»**. È una dichiarazione di limite fatta bene: il prodotto
promette una lettura gestionale, non un bilancio.

**Anomalia rilevata.** L'account è configurato su piano dei conti «Italia —
Personalizzato» (`accountingStandardCode: "IT_CUSTOM"`), ma le scritture usano
conti del **Plan Comptable Général francese**: `512100 Banque`, `468870 Produits à
recevoir - Divers`, con giornale `BQ`. `[OSSERVATO]`
Il dettaglio è documentato in `02-aree-funzionali/02-04-performance-precontabilita.md`.

### 5.2 Punto di pareggio — test svolto ✔ superato

Dati mostrati nella schermata Pareggio:

| Grandezza | Valore mostrato |
|---|---|
| Ricavi effettivi | 213.619,09 € |
| Costi variabili effettivi | 118.058,44 € |
| Costi totali effettivi | 284.411,59 € |
| Risultato operativo effettivo | −70.792,50 € |
| **Punto di pareggio** | **371.870,72 €** |
| Margine di sicurezza | −158.251,63 € (−74,1 %) |

Ricostruzione della formula classica:

```
costi fissi           = costi totali − costi variabili = 284.411,59 − 118.058,44 = 166.353,15
margine di contribuzione % = (ricavi − costi variabili) / ricavi = 95.560,65 / 213.619,09 = 44,735 %
punto di pareggio     = costi fissi / margine di contribuzione % = 166.353,15 / 0,44735 = 371.870,73
```

Contro i **371.870,72 €** mostrati: **scarto di un centesimo**, imputabile
all'arrotondamento. Verificate anche le grandezze derivate, tutte esatte:

| Verifica | Calcolo | Atteso | Mostrato |
|---|---|---|---|
| Margine di sicurezza | 213.619,09 − 371.870,72 | −158.251,63 € | −158.251,63 € ✔ |
| In percentuale sui ricavi | −158.251,63 / 213.619,09 | −74,08 % | −74,1 % ✔ |
| «Sotto il pareggio» | 158.251,63 / 371.870,72 | 42,56 % | 42,6 % ✔ |
| Risultato operativo | 213.619,09 − 284.411,59 | −70.792,50 € | −70.792,50 € ✔ |
| Margine lordo % (KPI) | 96.160 / 213.619,09 | 45,01 % | 45,0 % ✔ |
| Valore del patrimonio | 772.000 − 51.284 | 720.716 € | 720,7 K€ ✔ |

Il motore di break-even è corretto e coerente al suo interno.

### 5.3 «Punto morto: 176 giorni» — formula corretta, orizzonte incoerente `[OSSERVATO]`

Il «punto morto» (il momento dell'anno in cui si raggiunge il pareggio) è
dichiarato in **176 giorni**. Nessuna formula costruita sui ricavi della stessa
schermata lo restituisce:

| Ipotesi provata | Risultato | Contro 176 |
|---|---|---|
| `365 × BEP / ricavi` | 635,4 giorni | no |
| `365 × ricavi / BEP` | 209,7 giorni | no |
| `365 × (1 − 42,6 %)` | 209,5 giorni | no |
| `365 × margine di contribuzione %` | 163,3 giorni | no |

Invertendo la formula canonica si ricava la base che produrrebbe 176 giorni:
`365 × 371.870,72 / X = 176` ⇒ `X ≈ 771.273 €`. Una ricerca sui payload catturati
ha poi trovato quel valore, con precisione al centesimo `[OSSERVATO]`:

```
GET /api/v2/fec/valuation/calculate
  result.methods[0].parameters.revenue = 771.989,78
```

Verifica: `365 × 371.870,72 / 771.989,78 = 175,82` → **176 giorni**. ✔ La formula
è quella canonica; è la base che è un'altra.

Il quadro completo delle basi ricavi usate dai vari endpoint:

| Endpoint | Campo | Valore | Chi lo usa |
|---|---|---|---|
| `estimated-accounting/pl` | `revenue.sales.amount` | 213.619,09 € | conto economico (Fatturato) |
| `estimated-accounting/pl` | `revenue.totalRevenue.amount` | 218.234,11 € | Dashboard, KPI |
| `estimated-accounting/breakeven` | `revenue` | 213.619,09 € | punto di pareggio |
| **`fec/valuation/calculate`** | `parameters.revenue` | **771.989,78 €** | **valutazione d'impresa e punto morto** |

**Cos'è quella grandezza.** Non è una base estranea: sono i ricavi **annualizzati**.
Il payload di `estimated-accounting/kpis` contiene il fattore in chiaro
`[OSSERVATO]`:

```
annualizationFactor = 3,613861386138614     e   365 / 3,613861386 = 101,0 giorni esatti
213.619,09 × 3,613861386 = 771.989,78
```

Centouno giorni è l'ampiezza della finestra di dati con movimenti. Il sistema
rapporta il periodo osservato a 365 giorni, e il punto morto segue la definizione
classica:

```
ricavi giornalieri = 771.989,78 / 365       = 2.115,04 €/giorno
punto morto        = 371.870,72 / 2.115,04  = 175,82 → 176 giorni
```

**La formula è corretta.** «Quanti giorni di attività, al ritmo osservato, servono a
cumulare il fatturato di pareggio»: è il *point mort* nell'accezione francese,
applicato bene.

**Il difetto è un altro, e più sottile.** Nella stessa schermata, il margine di
sicurezza e l'insight testuale confrontano il pareggio **annuo** con i ricavi
**non annualizzati** di centouno giorni; il punto morto lo confronta con i ricavi
annualizzati. Nessuna delle due grandezze è sbagliata isolatamente — affiancate
sono incompatibili, e dicono cose opposte:

| Riquadro | Base ricavi | Messaggio |
|---|---|---|
| Punto morto: **176 giorni** | annualizzata (771.989,78 €) | il pareggio arriva prima di metà anno |
| Margine di sicurezza: **−74,1 %** | grezza (213.619,09 €) | mancano 158 mila euro al pareggio |
| «Sei 42,6 % al di sotto del pareggio» | grezza | idem |

Il colore completa il disastro: i 176 giorni sono in **verde**, i tre riquadri
accanto in **rosso**. `[OSSERVATO]` L'utente legge una rassicurazione e tre allarmi
sulla stessa riga, sugli stessi dati.

Va aggiunto che l'annualizzazione su centouno giorni di storico è di per sé fragile
per un'attività **stagionale** come la ristorazione: proiettare i mesi da maggio ad
agosto su dodici mesi assume che l'estate rappresenti l'anno. `[DEDOTTO]`

Il campo `date`, che dovrebbe tradurre i 176 giorni in una data di calendario, vale
`null`, e a video compare un trattino. `[OSSERVATO]`

Analisi completa in `02-aree-funzionali/02-04-performance-precontabilita.md` §6.2.

### 5.4 Le altre due discordanze, ridimensionate e confermate `[OSSERVATO]`

**I due valori di ricavi non sono un errore.** L'esame del payload di
`estimated-accounting/pl` mostra che sono due campi distinti:

```
revenue.sales.amount        = 213.619,09   (vendite)
revenue.totalRevenue.amount = 218.234,11   (ricavi totali)
```

La differenza — 4.615,02 € — sono gli altri ricavi. Il conto economico e il
break-even usano le vendite, la Dashboard e i KPI i ricavi totali: scelte entrambe
difendibili. Il difetto è solo di etichetta: **all'utente entrambi arrivano come
«Ricavi»**, senza che nulla distingua le due grandezze. Rilievo declassato da
incoerenza di calcolo a ambiguità di denominazione.

**Il margine lordo a zero resta invece un difetto vero.** Il dato esiste, e in due
varianti:

```
estimated-accounting/kpis      → profitability.grossMargin = 96.160,42  (45,01 %)
estimated-accounting/breakeven → grossProfit               = 95.560,65
```

Le due differiscono di 599,77 €, verosimilmente per una diversa definizione di
costo variabile — tollerabile. Ma la Dashboard mostra **«Gross Profit 0 €»** mentre
due endpoint restituiscono un valore non nullo. Qui non c'è una grandezza diversa
che spieghi lo scarto: c'è un valore che non arriva a schermo.

---

## 6. Scadenzario e aging — test svolto ✔ superato

La pagina Documenti espone tre card di stato. Verifiche di coerenza:

| Verifica | Calcolo | Esito |
|---|---|---|
| Le quattro fasce di aging sommano allo scaduto | 8.258 + 13.953 + 9.354 + 39.392 = 70.957 | = 70.957 € dichiarati ✔ |
| Quota del pagato sul totale | 28.962 / (28.962 + 70.957 + 7.330) = 27,00 % | «27 % del totale» ✔ |
| Quota dell'in arrivo sul totale | 7.330 / 107.249 = 6,83 % | «7 % del totale» ✔ |

Le fasce sono 0-30, 30-60, 60-90 e 90+ giorni. L'aging compare anche **dentro la
cella di stato** della singola fattura, nella forma «Scaduto +117g».

Nota sul dato: il 55 % dello scaduto (39.392 € su 70.957) sta nella fascia oltre i
90 giorni, e una fattura risulta scaduta da 1.247 giorni. Sono caratteristiche del
dataset caricato, non del prodotto.

---

## 7. Categorizzazione automatica

Regole dichiarate `[OSSERVATO]`, modalità `categorizationMode: "trezy_ai"`:

1. **Apprendimento**: categorizzando una transazione, le simili future ereditano la
   categoria. «La categorizzazione diventa sempre più precisa per il tuo conto nel
   tempo».
2. **Similarità**: le transazioni sono raggruppate per **descrizione anonimizzata**
   — testi identici, dopo la rimozione delle parti variabili, sono considerati
   simili. Nell'elenco ogni gruppo porta un contatore (osservati gruppi da 173, 149
   e 57 movimenti).
3. **Regole esplicite**: parole chiave sulla descrizione, ambito entrata/uscita/
   entrambe, limitabili a conti specifici, **ordinate per priorità** per
   trascinamento — vince la regola più in alto.
4. **Non retroattive per default**: esiste un comando «Applica tutte le regole» per
   ricategorizzare lo storico.
5. **Le regole spezzano i gruppi**: una regola che assegna categoria diversa a
   parte di un gruppo di simili lo divide in gruppi distinti.

Il punto 4 è una scelta di prudenza corretta — una regola retroattiva silenziosa
riscriverebbe la storia contabile — ma va comunicata bene, ed è comunicata: sta
scritta nella FAQ e il comando è esplicito.

`[NON POPOLATO]`: zero regole configurate sull'account, quindi né la priorità né la
divisione dei gruppi sono state verificate sul campo.

---

## 8. IVA e termini di pagamento: la separazione cassa/competenza

Ogni categoria porta tre attributi che non servono al flusso di cassa ma alla
pre-contabilità `[OSSERVATO]`:

| Attributo | Uso dichiarato |
|---|---|
| **Categoria contabile** | mappa la categoria di cassa su un conto, e la classifica come C/E o Stato patrimoniale |
| **Aliquota IVA** | «calcolare automaticamente l'IVA nel cashflow, che puoi includere nelle tue previsioni» |
| **Termini di pagamento** (giorni) | «ritardo medio fra la registrazione di una transazione e il movimento effettivo di denaro». Usati **esclusivamente** nelle sezioni contabilità e performance: **non influiscono sul cashflow** |

La FAQ è esplicita su quest'ultimo punto, ed è la cosa giusta: il cash flow ragiona
per cassa, il conto economico per competenza, e il ponte fra i due è un ritardo
medio dichiarato per categoria. Semplice, dichiarato, e sufficiente a un impianto
gestionale.

**Anomalia**: l'aliquota IVA predefinita osservata sulle categorie è **20,0 %**,
mentre l'ordinaria italiana è **22 %**. Poiché l'aliquota alimenta le righe «IVA a
debito / IVA a credito / Saldo IVA» del cashflow, ogni previsione IVA lasciata al
valore predefinito nasce sottostimata di due punti. `[OSSERVATO]` sul valore,
`[DEDOTTO]` sull'effetto, che non è stato misurato perché le righe IVA risultano
prive di valori nel periodo osservato.

---

## 9. Assistente «Chiedi a Trezy» — test svolto ✘ non superato

Domanda posta: *«Quali sono le mie tre categorie di spesa più alte negli ultimi tre
mesi?»*. Risposta in circa trenta secondi `[OSSERVATO]`, articolata in un titolo,
una tabella ordinata di **quindici** categorie con importi, una sintesi in prosa,
due domande di approfondimento suggerite e i pulsanti di feedback 👍/👎.

L'aggregazione nella tabella è corretta e coerente con le categorie dell'account:
l'assistente legge davvero i dati. Il problema è la frase che li riassume:

> «Le tue spese maggiori sono concentrate in stipendi e salari (€76.119), acquisti
> di materie prime (€68.398) e oneri operativi vari (€26.672). **Insieme
> rappresentano il 70% della tua spesa totale nel periodo.**»

Verifica sui quindici valori mostrati dall'assistente stesso, nella stessa risposta:

```
somma delle quindici categorie   = 348.525 €
somma delle prime tre            = 171.189 €
quota reale                      = 171.189 / 348.525 = 49,1 %
```

**Dichiarato 70 %, reale 49,1 %.** Lo scarto non si spiega con una diversa base di
calcolo: per ottenere il 70 % il denominatore dovrebbe essere 244.556 €, cioè oltre
centomila euro in meno del totale che l'assistente ha appena elencato. Anche
escludendo dal denominatore le voci che spese non sono — trasferimenti fra conti,
prestiti, estratto conto carta — si arriva al 58 %, non al 70 %.

Due difetti minori nella stessa risposta: il titolo annuncia «Le 3 categorie di
spesa più alte» e poi ne elenca quindici; il suggerimento generato contiene un
errore di grammatica italiana («l'andamento **dei** stipendi»).

Il rilievo va pesato per quello che è. Non è una risposta approssimativa in un
assistente generico: è un numero errato, affermato senza incertezza, dentro un
prodotto la cui promessa è far quadrare i conti. Un utente che legga «il 70 % della
spesa» e ne tragga una decisione di taglio costi agisce su un dato falso, e la
tabella corretta sta due centimetri più in alto — il che rende l'errore più
insidioso, non meno: la presenza del dato giusto accanto a quello sbagliato induce
fiducia.

`[NON VERIFICABILE]` resta invece l'affidabilità *complessiva* dell'assistente: una
sola domanda basta a dimostrare che può sbagliare, non a stabilire quanto spesso.

---

## 10. Quadro di sintesi dei test

| # | Test | Esito |
|---|---|---|
| 1 | Somma dei saldi dei conti = totale di testata | ✔ esatto al centesimo |
| 2 | Saldo futuro piatto con previsioni residue nulle | ✔ coerente con la formula |
| 3 | Punto di pareggio ricostruito da costi fissi e margine di contribuzione | ✔ scarto 0,01 € |
| 4 | Margine di sicurezza, quota sotto il pareggio, risultato operativo | ✔ tutti esatti |
| 5 | Margine lordo % dai KPI | ✔ esatto |
| 6 | Valore del patrimonio = valore d'impresa − indebitamento netto | ✔ esatto |
| 7 | Somma delle fasce di aging = totale scaduto | ✔ esatto |
| 8 | Quote percentuali delle card dello scadenzario | ✔ esatte |
| 9 | «Punto morto» in giorni | ✔ formula riprodotta esattamente (176 giorni), ma su ricavi **annualizzati** mentre i riquadri accanto usano quelli grezzi: i due messaggi si contraddicono — §5.3 |
| 10 | Coerenza dei ricavi fra moduli | ○ non è un errore: `sales` (213.619) e `totalRevenue` (218.234) sono campi distinti, ma l'interfaccia li chiama entrambi «Ricavi» |
| 11 | Coerenza del margine lordo fra moduli | ✘ 0 € a schermo mentre due endpoint restituiscono 96.160 € e 95.561 € |
| 12 | Percentuale dichiarata dall'assistente AI | ✘ 70 % dichiarato contro 49,1 % reale |
| 13 | Quadratura dello stato patrimoniale stimato | ✘ non quadra: l'API dichiara `isReconciled: false` con uno scarto di 48.431,57 €, mai mostrato all'utente — vedi `02-04` |

Il motore di calcolo, dove è verificabile, **è corretto**: le formule tornano al
centesimo. Break-even, aggregazioni, aging e quote percentuali dello scadenzario
non sbagliano di un euro.

I problemi stanno tutti a un livello più alto: nella **coerenza fra i moduli** —
due valori di ricavi, due valori di margine lordo, un indicatore che lavora su una
base di ricavi quasi quadrupla — e nello **strato che racconta i numeri**, dove
l'assistente afferma una percentuale che i suoi stessi dati smentiscono.

È una distinzione che conta per chi legge questa analisi: non siamo davanti a un
motore di calcolo debole, ma a un prodotto in cui i pezzi corretti non sono stati
riconciliati fra loro.

# Cash King — Logiche di calcolo

Formule e algoritmi ricostruiti, con i test svolti e il livello di confidenza.
Prima stesura: 10-11 agosto 2026, ambiente sandbox con dataset dimostrativo.

Convenzione dei tag come in `01-inventario-rotte.md`. Qui una precisazione in
più: `[VERIFICATO]` indica una formula confermata da un esperimento con input
noti, non semplicemente letta a schermo.

---

## 1. Metodo dei test

Il dataset dimostrativo da solo mostra i risultati ma non le formule. Per
ricavarle ho inserito **due fatture di prova con importi tondi** e ho misurato
di quanto si sono spostati i totali. La differenza fra prima e dopo isola il
contributo di ciascun documento.

| Sonda | Emissione | Scadenza | Imponibile | IVA 22% | Lordo |
|---|---|---|---|---|---|
| `TEST_CK_SCAD_3GG` | 11/08/2026 | 14/08/2026 | 1.000,00 | 220,00 | 1.220,00 |
| `TEST_CK_SCADUTA_IERI` | 10/07/2026 | 09/08/2026 | 500,00 | 110,00 | 610,00 |

Entrambe sono fatture **attive** (crediti verso cliente), in stato «Da Pagare»,
non riconciliate. La data di riferimento del sistema è l'11 agosto 2026.

La scelta delle due date non è casuale: una fattura è di **luglio** e una di
**agosto**, così le rispettive liquidazioni IVA cadono in mesi diversi. È
questo che ha permesso di isolare il trattamento dell'IVA.

---

## 2. Saldo disponibile `[VERIFICATO]`

```
saldo disponibile = saldo contabile + fidi di cassa residui
```

Con tre conti dimostrativi: 179.193,07 € di saldo e 70.000 € di fido totale
(50.000 su Intesa Sanpaolo + 20.000 su UniCredit, zero sul conto deposito
FinecoBank) danno 249.193,07 €.

La regola è applicata in modo coerente a **tutte** le proiezioni, non solo al
saldo di oggi:

| Proiezione | Contabile | + fidi | Disponibile mostrato |
|---|---|---|---|
| Oggi | 179.193,07 | 70.000 | 249.193,07 ✔ |
| Fine mese | 170.115,15 | 70.000 | 240.115,15 ✔ |
| 90 giorni | 321.813,39 | 70.000 | 391.813,39 ✔ |

`[OSSERVATO]` Il modello del conto distingue `fidoCassaTotal`, `fidoCassaUsed`,
`fidoCassaResidual` e, separatamente, `sbfLimit`, `sbfUsed`, `sbfResidual` con
un campo `sbfMode`. Nel dataset l'anticipo salvo buon fine è a zero e
`sbfMode: "none"`.
`[DEDOTTO]` Il fido di cassa e l'anticipo SBF sono due leve distinte, e solo il
primo confluisce nel «saldo disponibile». Da verificare quando l'SBF è attivo.

---

## 3. Saldo a fine mese `[VERIFICATO]`

```
saldo fine mese = liquidità oggi
                + incassi attesi entro fine mese (importo LORDO)
                − pagamenti attesi entro fine mese
                − IVA a debito la cui liquidazione cade entro fine mese
```

### L'esperimento

| Voce | Prima delle sonde | Dopo le sonde | Differenza |
|---|---|---|---|
| Liquidità oggi | 179.193,07 | 179.193,07 | 0 |
| + Incassi mese | 80.265,74 | 82.095,74 | **+1.830,00** |
| − Pagamenti mese | 91.063,66 | 91.173,66 | **+110,00** |
| = Contabile | 168.395,15 | 170.115,15 | +1.720,00 |

**Lettura del risultato.** Gli incassi sono cresciuti di 1.830,00 €, cioè la
somma dei due **importi lordi** (1.220 + 610): le fatture entrano in previsione
al lordo dell'IVA, che è corretto, perché è quello che il cliente bonifica.

Il dato interessante è l'altro: i pagamenti sono cresciuti di **110,00 €**, che
è esattamente **l'IVA della sola fattura di luglio**.

`[DEDOTTO]` Il prodotto sa che incassare una fattura emessa a luglio comporta
versare 110 € di IVA all'erario, e colloca quell'uscita alla data della
liquidazione periodica — il 16 del mese successivo, quindi il 16 agosto, dentro
il mese corrente. L'IVA della fattura di agosto (220 €) non compare perché la
sua liquidazione cade il 16 settembre, fuori dal mese.

Questa non è una congettura sul comportamento: è l'unica spiegazione che rende
conto di entrambi i numeri con la stessa regola, e viene confermata dalla
verifica indipendente sui 90 giorni del capitolo seguente.

---

## 4. Previsione di cassa a 90 giorni `[VERIFICATO]`

```
previsione 90gg = liquidità oggi
                + incassi previsti nei 90 giorni (LORDO)
                − pagamenti previsti nei 90 giorni
                − IVA a debito con liquidazione entro i 90 giorni
```

### L'esperimento, secondo test indipendente

| Voce | Prima | Dopo | Differenza |
|---|---|---|---|
| Liquidità oggi | 179.193,07 | 179.193,07 | 0 |
| + Incassi previsti | 309.261,66 | 311.091,66 | **+1.830,00** |
| − Pagamenti previsti | 168.141,34 | 168.471,34 | **+330,00** |
| = Previsione | 320.313,39 | 321.813,39 | +1.500,00 |

**Lettura.** Gli incassi crescono ancora dei 1.830 € lordi. I pagamenti crescono
però di **330,00 €**, cioè `110 + 220`: **l'IVA di entrambe le fatture**.

Il motivo è che la finestra di 90 giorni dall'11 agosto arriva al 9 novembre e
contiene sia la liquidazione del 16 agosto (IVA di luglio) sia quella del 16
settembre (IVA di agosto).

Le due misure, calcolate su orizzonti diversi, danno lo stesso modello. La
confidenza è alta.

`[OSSERVATO]` Il grafico «Previsione Flusso di Cassa» ha una serie dedicata
etichettata **IVA**, distinta dalle serie di entrate e uscite. Coerente con
quanto sopra.

### Perché è un accorgimento di sostanza

Un previsionale che sommasse gli imponibili sbaglierebbe per difetto gli
incassi; uno che sommasse i lordi ignorando l'IVA sbaglierebbe per eccesso la
cassa disponibile, perché una parte di quel denaro è dovuta all'erario. Questo
modello tratta l'IVA come un debito con una **sua** data di pagamento.

### La data del 16 è confermata dal produttore `[OSSERVATO]`

L'articolo pubblico «IVA e incassi: perché il 16 del mese fa male» enuncia
esattamente il modello che le due misurazioni avevano fatto emergere:

> Emetti fatture oggi · I clienti pagano a 60/90/120 giorni · Ma l'IVA matura
> subito · **E la paghi il 16 del mese successivo**

con un esempio numerico coerente: fatture emesse a gennaio, incassi ad aprile a
90 giorni, **IVA pagata il 16 febbraio**.

Lo stesso articolo dichiara il principio di progettazione: «L'IVA non è un
costo. È un debito in maturazione. Quando emetti fattura con IVA, quell'IVA non
è tua, non è margine, non è cassa disponibile.» E lo slogan di chiusura:
«Smetti di usare l'IVA come finta liquidità.»

`[DEDOTTO]` L'ipotesi passa da congettura a spiegazione corroborata da tre
fonti indipendenti: le due misurazioni sperimentali su orizzonti diversi, la
serie IVA isolata nel grafico di flusso, e la dichiarazione esplicita del
produttore. Resta vero che il 16 è semplicemente la scadenza ordinaria della
liquidazione IVA italiana, quindi il prodotto sta applicando la norma, non una
regola propria.

### Il modello è consapevole del regime: test mensile contro trimestrale `[VERIFICATO]`

In `/settings/company` esiste il campo **«Periodicità IVA»** con due opzioni,
Mensile e Trimestrale (`vatPeriod` nell'API, valore iniziale `monthly`).

Il regime è stato commutato a trimestrale, misurate le due previsioni, e subito
**riportato a mensile**. Risultato:

| Voce | Mensile | Trimestrale | Differenza |
|---|---|---|---|
| + Incassi mese | 82.095,74 € | 82.095,74 € | **0** |
| − Pagamenti mese | 91.173,66 € | 91.966,05 € | **+792,39** |
| = Saldo a fine mese | 170.115,15 € | 169.322,76 € | −792,39 |
| + Incassi previsti 90gg | 311.091,66 € | 311.091,66 € | **0** |
| − Pagamenti previsti 90gg | 168.471,34 € | 175.002,60 € | **+6.531,26** |
| = Previsione 90gg | 321.813,39 € | 315.282,13 € | −6.531,26 |

**Due cose vanno lette insieme.** Gli incassi non si muovono di un centesimo,
in entrambi gli orizzonti: corretto, perché quando il cliente paga non dipende
dal regime IVA di chi emette. Si muovono solo i pagamenti, ed è lì che l'IVA
entra nel modello.

`[DEDOTTO]` Questo chiude il ragionamento del capitolo precedente in modo
indipendente. Se l'IVA fosse trattata come parte indistinta dell'incasso, o
ignorata, cambiare la periodicità non avrebbe potuto spostare nulla. Il fatto
che sposti **solo** il lato uscite, e di importi diversi sui due orizzonti,
dimostra che esiste un calendario di scadenze IVA generato dal regime e
proiettato sulla linea di cassa.

`[DEDOTTO]` Che i pagamenti a 90 giorni **aumentino** passando al trimestrale
può sembrare controintuitivo, visto che le scadenze diventano meno frequenti.
La spiegazione sta nelle date: dall'11 agosto al 9 novembre, in regime mensile
cadono le liquidazioni di luglio, agosto e settembre; in regime trimestrale cade
il 16 agosto l'unica liquidazione del secondo trimestre, che copre aprile,
maggio e giugno — mesi in cui il dataset dimostrativo ha più fatturato. Un lotto
solo ma più pesante dei tre mensili messi insieme.

`[IPOTESI]` Non è stato verificato se applichino la maggiorazione dell'1% che la
norma italiana prevede sui versamenti IVA trimestrali. Test: confrontare
l'importo dell'uscita IVA del 16 agosto nei due regimi con l'IVA a debito del
trimestre calcolata a mano.

Endpoint correlati mai interrogati: `/api/vat/month`, `/api/vat/prospectus`,
`/api/vat/cashflow-entries` e, nel modulo fiscale a pagamento,
`/api/fiscal/special-schemes`.

---

## 5. Le tre serie del cruscotto: Crediti, Debiti, Scaduto

### Crediti `[VERIFICATO]`
Somma degli importi **lordi** delle fatture attive non incassate.
Le due sonde da 1.220 e 610 lo hanno fatto salire da 200.071,66 a
201.901,66 €, cioè esattamente +1.830,00 €.

### Scaduto — è un valore NETTO, non un totale `[VERIFICATO]`
Il valore di partenza era **−3.145,72 €**. Dopo aver aggiunto una fattura
attiva scaduta da 610 €, è diventato **−2.535,72 €**: è *migliorato* di
esattamente 610.

`[DEDOTTO]` «Scaduto» non è il totale dello scaduto ma la **posizione netta
dello scaduto**: crediti scaduti meno debiti scaduti. Il segno negativo del
dataset dimostrativo significa che ci sono più fornitori scaduti da pagare che
clienti scaduti da incassare. Aggiungere un credito scaduto riduce l'esposizione.

⚠️ L'etichetta «Scaduto» da sola non lo lascia intuire: un utente può
ragionevolmente leggerla come «quanto ho di scaduto» e interpretare il segno
meno come un ammontare, non come una direzione.

### Incoerenza fra due definizioni di «scaduto» `[OSSERVATO]`
La sonda `TEST_CK_SCADUTA_IERI` ha scadenza 09/08/2026, cioè nel passato, ed è
stata **conteggiata immediatamente** nella scheda Scaduto. Ma il suo campo
`status` nell'API vale ancora `due`, non `overdue`.

`[DEDOTTO]` Convivono due nozioni di scaduto:
- una **calcolata al volo** confrontando `dueDate` con oggi, usata dal cruscotto;
- una **memorizzata** nel campo `status`, aggiornata da un processo periodico
  (esiste `/api/invoices/update-overdue`).

Finché il processo non gira, il filtro «Solo Scaduti» della lista fatture e il
totale del cruscotto possono raccontare due storie diverse.
Test in corso: vedi la sonda B in `04b-comportamenti-nel-tempo.md`.

---

## 6. Le percentuali di variazione non tornano `[OSSERVATO]`

| Scheda | Valore | «Mese scorso» | Variazione mostrata | Variazione ricalcolata |
|---|---|---|---|---|
| Crediti | 201.901,66 € | 58.039,47 € | +43% | **+248%** |
| Debiti | 87.816,07 € | 16.556,62 € | +9% | **+430%** |
| Scaduto | −2.535,72 € | −7.778,47 € | +67% | +67% ✔ |

Su «Scaduto» la percentuale è corretta, e lo si è potuto verificare due volte:
prima delle sonde mostrava +60% con 3.145,72 contro 7.778,47 (che dà 59,6%),
dopo mostra +67% con 2.535,72 contro 7.778,47 (che dà 67,4%). Si muove nel modo
giusto.

Su «Crediti» e «Debiti» invece no. Prova ulteriore: aggiungendo le sonde, il
valore «Mese scorso» dei Crediti è passato da 57.429,47 a 58.039,47 — è
aumentato di 610, cioè ha assorbito la fattura di luglio — eppure la percentuale
è rimasta ferma a +43%.

### Ipotesi chiusa: la scheda mescola due popolazioni diverse `[VERIFICATO]`

Il test è stato eseguito ricostruendo da `/api/invoices` tutte le basi di
calcolo plausibili e confrontandole con i valori mostrati. Due combaciano al
centesimo:

| Grandezza calcolata | Valore | «Mese scorso» mostrato |
|---|---|---|
| Fatture **cliente emesse a luglio e ancora aperte** | 58.039,47 € | 58.039,47 € ✔ |
| Fatture **fornitore emesse a luglio e ancora aperte** | 16.556,62 € | 16.556,62 € ✔ |

Non è quindi il saldo dei crediti a fine luglio, né il fatturato di luglio: è
**quanto è stato emesso il mese scorso e non è ancora stato saldato**.

La conferma indipendente era già arrivata durante l'esperimento delle sonde: la
fattura di prova datata 10 luglio aveva fatto salire il valore «Mese scorso» dei
Crediti da 57.429,47 a 58.039,47, cioè esattamente dei suoi 610 €.

E la percentuale? Applicando la stessa definizione al mese corrente:

| | Agosto aperte | Luglio aperte | Variazione calcolata | Mostrata |
|---|---|---|---|---|
| Crediti | 83.975,37 € | 58.039,47 € | +44,7% | +43% |
| Debiti | 18.014,81 € | 16.556,62 € | +8,8% | +9% |

Sui Debiti la corrispondenza è piena. Sui Crediti resta uno scarto di 1,7 punti
percentuali, che si assottiglia a 1,1 punti scorporando la fattura di prova
datata 11 agosto: `(82.755,37 − 57.429,47) / 57.429,47 = 44,1%`.

**La diagnosi.** Non è un errore di calcolo: la percentuale confronta due mesi
in modo corretto. Il difetto è di **presentazione**. La scheda impila tre numeri
che vengono da due popolazioni diverse:

- il numero grande è il **totale dei crediti aperti di tutti i mesi**;
- «Mese scorso» e la percentuale riguardano solo le **fatture emesse in un
  singolo mese**.

Un lettore che vede 201.901,66 € sopra e «Mese scorso: 58.039,47 €» sotto fa
l'unica operazione che quell'accostamento suggerisce, cioè il rapporto fra i
due, e ottiene +248% invece del +43% scritto accanto. I numeri sono giusti
presi uno per uno e ingannevoli messi insieme.

`[IPOTESI]` Lo scarto residuo di 1,1 punti sui Crediti dipende probabilmente
dal trattamento del mese in corso, forse conteggiato fino a oggi anziché per
intero. Non vale ulteriore indagine.

**Come lo eviteremmo:** o si confronta il totale col totale del mese scorso, o
si etichetta esplicitamente la seconda riga come «emesso il mese scorso e
ancora aperto». La correzione costa una parola.

---

## 7. Ciclo di cassa, DSO e DPO `[OSSERVATO]` + `[VERIFICATO]` in parte

Da `/api/dashboard/cash-cycle`:

| Campo | Valore |
|---|---|
| dso | 42 |
| dpo | 53 |
| cashCycle | −11 |
| dsoPure | 43 |
| dpoPure | 51 |
| cashCyclePure | −8 |
| utilizzoFido | 0 |

```
cashCycle = dso − dpo          42 − 53 = −11  ✔ [VERIFICATO]
cashCyclePure = dsoPure − dpoPure    43 − 51 = −8   ✔ [VERIFICATO]
```

Il ciclo di cassa negativo significa che l'azienda incassa dai clienti prima di
pagare i fornitori: nel dataset dimostrativo, con 11 giorni di margine.

### Finestre temporali `[OSSERVATO]`
I metadati dichiarano `currentPeriodMonths: 6`, `previousPeriodMonths: 6` e
`utilizzoFidoPeriodMonths: 3`, con 42 fatture cliente e 37 fornitore analizzate.

`[DEDOTTO]` DSO e DPO sono calcolati su una finestra mobile di **6 mesi**,
mentre l'utilizzo del fido si misura su **3 mesi**. Il prodotto è predisposto
per confrontare il periodo corrente col precedente, ma nel dataset dimostrativo
`previousPeriod` è interamente `null`: non c'è ancora storia sufficiente.

### Le due varianti: pesata e pura — ipotesi sciolta `[OSSERVATO]`
Esistono in parallelo `dso`/`dsoPure` e `dpo`/`dpoPure`, con valori vicini ma
diversi (42 contro 43, 53 contro 51).

L'interfaccia dello Scadenziario scioglie il dubbio: mostra i due valori
etichettati **«Pesato»** e **«Puro»**, affiancati da due colonne «Pesato 6m» e
«Puro 6m» per il periodo precedente. Non si tratta quindi di due popolazioni di
fatture diverse ma di **due metodi di media**.

`[DEDOTTO]` «Pesato» pondera i giorni di ritardo per l'importo della fattura,
«Puro» fa la media aritmetica semplice. Rispondono a due domande distinte:
quanto tardano i *soldi* e quanto tardano i *clienti*. Che il DSO pesato sia
più basso di quello puro (42 contro 43) significa che le fatture di importo
maggiore rientrano leggermente prima delle piccole.

**Test residuo per chiudere del tutto:** emettere due fatture, una da 100 €
incassata a 10 giorni e una da 10.000 € incassata a 60, e verificare che la
media pesata si avvicini a 60 mentre quella pura resti intorno a 35.

### Utilizzo del fido, misurato in giorni `[OSSERVATO]`
Il campo `utilizzoFido` vale 0 e nello Scadenziario è presentato come
«0 gg/mese», su una finestra di 3 mesi (`utilizzoFidoPeriodMonths: 3`).
`[DEDOTTO]` Non è un importo né una percentuale ma il **numero di giorni al mese
in cui il conto resta sotto zero**, cioè l'unità con cui una banca giudica come
viene usato un affidamento.

---

## 8. Calcolo dell'IVA nel modulo di inserimento `[VERIFICATO]`

Inserendo imponibile `1000` e aliquota `22`, il campo «Importo Lordo» si
compila automaticamente con `1220,00`, già formattato all'italiana con la
virgola decimale.

`[OSSERVATO]` L'API memorizza le tre grandezze separatamente:
`netAmount: "1000.00"`, `vatPercentage: "22.00"`, `vatAmount: "220.00"`,
`amount: "1220.00"`. Non ricalcola a ogni lettura.

`[OSSERVATO]` Il modulo prevede una casella «Aliquote IVA diverse» per le
fatture con più aliquote, e una casella «Soggetta a Ritenuta» con campi
dedicati (`withholdingRate`, `withholdingBaseAmount`, `withholdingAmount`).
Esiste anche il flag `splitPayment`, cioè la scissione dei pagamenti verso la
pubblica amministrazione.

Aliquote osservate nel dataset dimostrativo: 22%, 10%, 4% — le tre aliquote
italiane ordinarie e ridotte.

---

## 9. Riepilogo della lista fatture `[VERIFICATO]`

La fascia di totali sopra la tabella mostra cinque valori:

```
Posizione Netta = Totale Crediti − Totale Debiti
217.162,96 − 121.004,16 = 96.158,80  ✔
```

`[OSSERVATO]` «Totale Entrate» (309.381,88 €) è diverso da «Totale Crediti»
(217.162,96 €).
`[DEDOTTO]` Le Entrate sono il totale fatturato attivo del periodo, i Crediti
solo la parte non ancora incassata.

---

## 10. Sette canali di saldo per una fattura `[OSSERVATO]`

La risposta di `/api/invoices` espone per ogni documento un oggetto
`reconciliationAmounts` con sette voci separate:

```json
{ "bank": 0, "creditCard": 0, "gateway": 0, "offset": 0,
  "compensation": 0, "withholding": 0, "fxGain": 0 }
```

affiancate dai flag `hasLinkedBankTransactions`, `hasLinkedCreditCardPayments`,
`hasLinkedGatewayPayments`, `hasOffsets`, `hasWithholdings`,
`hasUnsettledWithholdings`, `hasFxGains`, più `totalPaid` e
`creditNoteOffsetAmount`.

`[DEDOTTO]` Una fattura può essere chiusa da più fonti contemporaneamente:
bonifico bancario, carta di credito, gateway di pagamento, compensazione con
una nota di credito, compensazione con una partita opposta, ritenuta d'acconto
trattenuta, e differenza di cambio. Il saldo non è un semplice «pagato sì/no»
ma la somma di sette contributi tracciati separatamente.

### Il caso è stato costruito, e il modello regge `[VERIFICATO]`

Esperimento dell'11 agosto. Fattura cliente `TEST_CK_PARZIALE_MULTICANALE` da
1.000 € più IVA, lordo **1.220,00 €**, saldata attraverso **due canali diversi**.

**Primo canale, banca.** Dal dialogo «Collega Pagamenti» si sceglie un movimento
bancario fra quelli non ancora riconciliati e si indica **quanto** di esso
allocare. Scelto un bonifico da 937,11 €, ne sono stati allocati **800,00**.

| Dopo il primo collegamento | Valore |
|---|---|
| `status` della fattura | **`partially_paid`** |
| `totalPaid` | 800 |
| `reconciliationAmounts.bank` | 800 |
| Residuo mostrato nel dialogo | 420,00 € |
| Del bonifico: `reconciledAmount` | 800 |
| Del bonifico: disponibile residuo | **137,11 €** |
| Del bonifico: `isPartiallyReconciled` / `isMatched` | true / **false** |

`[DEDOTTO]` L'allocazione è **molti-a-molti e parziale in entrambe le
direzioni**: un bonifico può coprire più fatture e una fattura può essere
coperta da più bonifici. Il flag `isMatched` resta falso finché il movimento non
è consumato del tutto, quindi «abbinato» significa «esaurito», non «toccato».

**Secondo canale, nota di credito.** Creata `TEST_CK_NC_420` da −420,00 € per
lo stesso cliente e collegata dal dialogo «Riconcilia Fattura».

| Dopo il secondo collegamento | Valore |
|---|---|
| `status` | **`paid`** |
| `totalPaid` | 1220 |
| `creditNoteOffsetAmount` | 420 |
| `reconciliationAmounts` | `bank: 800`, `offset: 420`, tutti gli altri 0 |
| `remaining` | 0 |
| `hasOffsets` | true |

`[OSSERVATO]` Anche la nota di credito passa a `paid` con `offset: 420`: la
relazione è scritta simmetricamente sui due documenti.

`[OSSERVATO]` Esiste un endpoint dedicato `/api/invoices/{id}/payment-summary`
che restituisce la scomposizione completa con un totale **e un contatore** per
ciascun canale:

```json
{"invoiceAmount":1220,"totalPaid":1220,"remaining":0,
 "totalBankPaid":800,"totalOffsetPaid":420,"totalCreditCardPaid":0,
 "totalGatewayPaid":0,"totalWithholdingPaid":0,"totalCompensationPaid":0,
 "totalFxGainPaid":0,"paymentCount":1,"offsetCount":1,
 "isCreditNote":false,"status":"paid"}
```

**Il modello a sette canali non è più una deduzione: è verificato.** Una singola
fattura è stata portata a saldo combinando due fonti diverse, con gli importi
tracciati separatamente e il residuo calcolato correttamente a ogni passo.

### Offset e compensazione sono due cose diverse `[OSSERVATO]`
Il dialogo che collega le note di credito ha **due schede**: «Note di Credito» e
«Compensazione», quest'ultima descritta come «compensa con fatture del tipo
opposto». Si scioglie così l'ambiguità fra i due canali omonimi del modello:
`offset` è la detrazione di una nota di credito, `compensation` è la partita di
giro fra una fattura attiva e una passiva verso lo stesso soggetto.

### Il suggerimento di sinonimo scatta anche sul collegamento manuale `[OSSERVATO]`
Collegando il bonifico, il cui testo cita «Bio Pharma Labs», a una fattura
intestata a «TEST_CK_Cliente Prova», è comparsa una finestra «Suggerimento
Sinonimo — È stato rilevato un possibile sinonimo per questa entità nella
descrizione del movimento», con tre scelte: «Non chiedere più»
(`button-trash-synonym`), «Salta» e «Aggiungi Sinonimo».

`[DEDOTTO]` L'apprendimento del dizionario non è legato alla sola riconciliazione
assistita: scatta a ogni abbinamento, anche manuale. È il momento giusto, perché
è l'unico in cui il sistema sa con certezza che i due nomi indicano lo stesso
soggetto.

⚠️ `[OSSERVATO]` **Il campo «Nome Rilevato» era vuoto.** La finestra proponeva di
salvare un sinonimo senza mostrare quale, pur avendo a disposizione una
descrizione che contiene chiaramente «Bio Pharma Labs». Confermando si sarebbe
salvato un sinonimo vuoto. Vedi
`assets/cashking/screenshots/17-suggerimento-sinonimo-nome-vuoto.png`.

### Cancellare un documento collegato: pulito sui dati, sbagliato nel messaggio `[OSSERVATO]`
Eliminata la fattura, il bonifico è tornato **interamente disponibile**
(`reconciledAmount: 0`), quindi non restano collegamenti orfani. L'interfaccia
ha però mostrato la finestra d'errore con «Dettagli: Failed to delete invoice»,
**benché la cancellazione fosse riuscita**.

`[OSSERVATO]` La nota di credito, rimasta sola, ha conservato lo stato `paid` pur
avendo azzerato ogni canale: cioè è diventata essa stessa un'incongruenza del
tipo che il report «Pagate senza pagamenti» rileva. Non vi compare però, perché
le note di credito sono escluse dal controllo.

`[OSSERVATO]` L'endpoint `/api/reports/invoice-inconsistencies` espone **tre**
categorie — `paidWithoutPayments`, `markedPaidManually`, `dueButPaid` — mentre
l'interfaccia ne mostra una sola.
`[IPOTESI]` Le altre due compaiono solo quando non sono vuote; sul dataset
dimostrativo lo sono.

---

## 11. Riepilogo del livello di confidenza

| Formula | Stato |
|---|---|
| Saldo disponibile = contabile + fidi | `[VERIFICATO]` su tre proiezioni |
| Saldo fine mese, con IVA a liquidazione | `[VERIFICATO]` con input noti |
| Previsione 90gg, con IVA a liquidazione | `[VERIFICATO]` con input noti |
| Crediti = somma lordi non incassati | `[VERIFICATO]` |
| Scaduto = posizione netta, non totale | `[VERIFICATO]` |
| cashCycle = DSO − DPO | `[VERIFICATO]` |
| Autocalcolo IVA nel modulo | `[VERIFICATO]` |
| Posizione netta = crediti − debiti | `[VERIFICATO]` |
| Il cruscotto include i movimenti futuri nel saldo attuale | `[VERIFICATO]` (cap. 13) |
| Liquidazione IVA al 16 del mese successivo | `[OSSERVATO]`: due test più dichiarazione del produttore |
| Acid Test = mesi di autonomia + primo mese critico | `[OSSERVATO]` (cap. 12) |
| Il modello IVA è consapevole del regime (mensile/trimestrale) | `[VERIFICATO]` commutando `vatPeriod` (cap. 4) |
| Maggiorazione dell'1% sui versamenti IVA trimestrali | `[IPOTESI]`, mai isolata |
| L'Acid Test ignora le scadenze fiscali senza addon | `[IPOTESI]` |
| DSO/DPO: «puro» = media aritmetica dei soggetti | `[VERIFICATO]`: 286/9 = 32, esatto |
| DSO/DPO: «pesato» = ponderato per importo | `[VERIFICATO]` dal report per cliente |
| Il modello a sette canali di saldo | `[VERIFICATO]`: fattura chiusa con 800 banca + 420 nota di credito |
| Allocazione parziale molti-a-molti fra movimenti e fatture | `[VERIFICATO]` |
| «Mese scorso» = emesso il mese scorso e ancora aperto | `[VERIFICATO]`, corrispondenza esatta su crediti e debiti |
| La scheda Crediti/Debiti mescola due popolazioni | `[VERIFICATO]` (cap. 6) |
| Tasso al 113% = media semplice moltiplicata due volte per cento | `[VERIFICATO]` (cap. 11b) |
| Il cruscotto contraddice `/api/invoices/totals` di 858,69 € | `[VERIFICATO]` (cap. 14) |
| Composizione dei sette canali di saldo | `[DEDOTTO]` dal modello dati |

---

## 11b. Il tasso al 113% è una doppia conversione in percentuale `[VERIFICATO]`

La griglia della Tesoreria mostrava «Tasso medio creditore 113,333%». I tassi
reali dei tre conti, letti da `/api/bank-accounts`, sono:

| Conto | `creditRate` | `debitRate` |
|---|---|---|
| Conto Corrente Principale | 0,10 % | 8,50 % |
| Conto Deposito | 3,25 % | — |
| Conto Operativo | 0,05 % | 9,00 % |

```
(0,10 + 3,25 + 0,05) / 3 = 3,40 / 3 = 1,13333
1,13333 × 100 = 113,333   ← il valore mostrato
```

`[DEDOTTO]` La media dei tre tassi vale 1,1333%, ma viene moltiplicata di nuovo
per cento prima di essere formattata come percentuale. È l'errore classico di
chi tratta come frazione un valore già espresso in percentuale.

Conseguenza a catena: la riga «Interessi Stimati» della stessa griglia, che
mostra 479,03 € al giorno, è calcolata su un tasso cento volte troppo alto e va
considerata priva di significato.

### Un secondo difetto, più piccolo, nascosto dentro il primo `[DEDOTTO]`
La media è **aritmetica semplice** fra i tre conti, non ponderata per il saldo.
Ponderando correttamente:

```
(119.693,07 × 0,10 + 50.000 × 3,25 + 9.500 × 0,05) / 179.193,07 = 0,98 %
```

Il tasso medio creditore corretto è dunque circa **0,98%**, non 1,13% e tanto
meno 113%. Il conto deposito al 3,25% pesa un terzo nella media semplice pur
contenendo poco più di un quarto della liquidità.

---

## 12. Acid Test di Cassa `[OSSERVATO]`

L'indicatore in cima al cruscotto mostrava «12+ / mesi», l'etichetta di stato
«Stabile» e il messaggio «Nessun mese critico nei prossimi 12 mesi». La
definizione è pubblicata dal produttore in un articolo dedicato, e combacia con
ciò che si vede.

**La domanda a cui risponde:** «Se oggi smettessi di intervenire, tra quanti
mesi la mia cassa diventerebbe un problema?»

**Ingressi dichiarati:** saldo di cassa attuale, incassi previsti, pagamenti
previsti, scadenze fiscali.

**Simulazione:** «incassi come previsto, pagamenti come previsto, nessuna
manovra straordinaria». Mese dopo mese, verifica quando la cassa smette di
reggere.

**Due uscite, non una:**
1. il numero di **mesi di autonomia** (gli esempi dell'articolo: 6, 3, 1, 0);
2. **quale sia il primo mese critico**, in forma di frase: «Se non cambi nulla,
   la cassa va in tensione a marzo».

**Tre fasce di lettura**, con l'azione associata: autonomia alta → monitori ·
autonomia bassa → agisci · autonomia zero → intervieni subito.

`[DEDOTTO]` Il valore «12+» osservato è un orizzonte massimo: la simulazione
guarda dodici mesi avanti e, se non trova mai il punto di rottura, riporta
«12+» invece di un numero. Il messaggio «Nessun mese critico nei prossimi 12
mesi» è la seconda uscita quando la prima non si verifica mai.

`[IPOTESI]` L'orizzonte di 12 mesi è fisso e non configurabile. Da verificare
se le scadenze fiscali entrino nella simulazione anche senza l'addon fiscale
attivo — sul nostro account `/api/fiscal/installments/pending-for-cashflow`
risponde 403, quindi con ogni probabilità **no**, e l'Acid Test di un account
senza addon è più ottimista di quanto dovrebbe.

### L'indicatore messo sotto tensione `[VERIFICATO]`

Esperimento dell'11 agosto. Con il dataset dimostrativo l'Acid Test è sempre
rimasto su «12+ mesi», quindi non si era mai visto cosa succede quando la cassa
va davvero in difficoltà. È stata inserita una fattura fornitore di prova da
600.000 € più IVA, **732.000,00 € lordi**, con scadenza 15 ottobre 2026, e poi
rimossa.

| | Prima | Dopo |
|---|---|---|
| Valore | 12+ mesi | **2 mesi** |
| Etichetta di stato | Stabile | **Rischio** |
| Messaggio | «Nessun mese critico nei prossimi 12 mesi» | **«→ Ottobre 2026»** |
| Azione offerta | «Apri Scadenziario» | **«Vai al mese»** + «Apri Scadenziario» |
| Previsione 90gg | 321.813,39 € | **−380.066,77 €** |
| Saldo disponibile (90gg) | 391.813,39 € | **−310.066,77 €** |

Verifica aritmetica: `179.193,07 + 311.950,35 − 871.210,19 = −380.066,77` ✔

`[OSSERVATO]` L'indicatore fa esattamente le tre cose promesse dall'articolo del
produttore: dà i mesi di autonomia, **nomina il mese critico**, e cambia
etichetta di stato. In più compare un pulsante **«Vai al mese»** che non esiste
nello stato tranquillo.

`[DEDOTTO]` Il passaggio da un avvertimento a un luogo dove agire è la parte più
riuscita: l'indicatore non si limita a dire «hai un problema fra due mesi», ci
porta dentro. È un accorgimento a costo quasi nullo e ad alto valore percepito.

`[OSSERVATO]` Il saldo disponibile diventa negativo anche **dopo** aver
considerato i 70.000 € di fidi: il prodotto non nasconde la tensione dietro le
linee di credito.

`[OSSERVATO]` L'incremento dei pagamenti previsti a 90 giorni è stato di
702.738,85 €, non dei 732.000 € lordi della fattura. La differenza di
29.261,15 € `[IPOTESI]` è l'effetto dell'IVA a credito di 132.000 €, che riduce
il versamento IVA del periodo ma solo fino a capienza. Non verificabile senza
il prospetto IVA di dettaglio.

Questo è l'aspetto più interessante dell'indicatore: non è la solita metrica
finanziaria astratta ma una **misura di tempo residuo**, che è la grandezza su
cui un imprenditore può effettivamente decidere.

---

## 13. Il saldo attuale del cruscotto include il futuro `[VERIFICATO]`

Lo stesso giorno, tre schermate dichiarano tre saldi aziendali diversi:

| Schermata | «Saldo attuale» |
|---|---|
| Dashboard | 179.193,07 € |
| Cash Command Center | 172.546,33 € |
| Tesoreria | 178.211,93 € |

Lo scarto fra le prime due si spiega esattamente:

```
179.193,07 − 172.546,33 = 6.646,74
```

6.646,74 € è l'importo del movimento «Bonifico da Green Energy Coop — Saldo
fatt. FV-2025/0024» che il cruscotto stesso elenca fra i Movimenti Recenti con
data **20/08/2026**, cioè nove giorni nel futuro rispetto alla rilevazione.

`[DEDOTTO]` Il saldo del cruscotto somma tutti i movimenti registrati
indipendentemente dalla data, futuri compresi; Cash Command applica invece il
filtro sulla data odierna. Il primo non è quindi un saldo attuale ma un saldo a
fine registrazioni.

La conseguenza si propaga: il «Saldo disponibile» mostrato su Cash Command
(249.193,07 €) è calcolato sulla base gonfiata, tanto che affiancato al saldo
attuale della stessa pagina dà una differenza di 76.646,74 € invece dei 70.000 €
di fidi effettivi.

Analisi completa e terzo scarto (quello della Tesoreria, che mostra a sua volta
due valori diversi per lo stesso conto sulla stessa pagina) in
`02-aree-funzionali/02-02-liquidita-e-previsionale.md`, capitolo 5.

---

## 14. Lo scarto di 858,69 € sui crediti: il cruscotto contraddice il server `[VERIFICATO]`

Misurando **nello stesso istante** la scheda del cruscotto e le fonti di dati:

| Fonte | Crediti | Debiti |
|---|---|---|
| Scheda del cruscotto | 201.901,66 € | 87.816,07 € |
| Somma delle fatture aperte da `/api/invoices` | 202.760,35 € | 87.816,07 € |
| `/api/invoices/totals` (calcolo del **loro** server) | 202.760,35 € | 87.816,07 € |
| Scadenziario, «Da incassare» / «Da pagare» | 202.760,35 € | 87.816,07 € |

`[OSSERVATO]` Sul lato fornitori le quattro fonti coincidono al centesimo. Sul
lato clienti tre fonti su quattro coincidono, e **solo la scheda del cruscotto
dissente**, di 858,69 € in difetto.

`[OSSERVATO]` L'endpoint `/api/invoices/totals` restituisce esplicitamente
`customerOutstandingAmount: 202760.35` e `supplierOutstandingAmount: 87816.07`.
Il server sa qual è la risposta giusta; la scheda mostra un'altra cifra.

`[OSSERVATO]` Osservando il traffico di rete al caricamento del cruscotto non
compare alcuna chiamata a `/api/dashboard/receivables`: la scheda è calcolata
lato client a partire da `/api/invoices`.

`[DEDOTTO]` Il difetto sta nella logica di aggregazione del client, non nei
dati. E riguarda solo i crediti, visto che i debiti tornano.

### Cosa lo scarto NON è
Sono state escluse per verifica diretta le spiegazioni più plausibili:
nessuna fattura ha importo o residuo pari a 858,69 €; nessuna coppia né terna
di fatture aperte somma a quella cifra; le ritenute d'acconto sulle fatture
aperte valgono 1.670,41 € e non 858,69 €; non esistono compensazioni,
differenze di cambio o pagamenti parziali registrati; le tre note di credito
sono tutte in stato «pagata» e valgono complessivamente −4.796,99 €.

`[OSSERVATO]` Lo scarto è **costante**: valeva 858,69 € anche prima
dell'inserimento delle due fatture di prova, che hanno spostato di 1.830 €
entrambe le grandezze lasciando invariata la differenza.

### Risolto: è l'IVA di una fattura extra-UE `[VERIFICATO]`

La pista è venuta dalla revisione del corpus, che ha notato come lo stesso
858,69 € comparisse anche come **differenza fra due letture successive degli
incassi previsti a 90 giorni** (311.091,66 la mattina, 311.950,35 il
pomeriggio). Cercando quel valore fra tutti i campi numerici di fatture,
movimenti, costi e ricorrenze, la corrispondenza è **una sola**:

```
FV-2025/0033 · Innovation Labs Inc · «Audit sicurezza IT»
netto 8.586,91 + IVA 10% = 858,69 → lordo 9.445,60
crossCountry: "non_eu"      ← la chiave
```

`[OSSERVATO]` La fattura è marcata **extra-UE**, ed è l'unico documento del
dataset la cui IVA valga esattamente lo scarto.

`[DEDOTTO]` La scheda Crediti del cruscotto conta quella fattura al **netto**,
mentre `/api/invoices/totals`, lo Scadenziario e la lista fatture la contano al
**lordo**. Lo scarto di 858,69 € è precisamente la sua IVA.

**E questo ribalta il giudizio.** Una cessione extra-UE è non imponibile: quella
fattura **non dovrebbe avere IVA affatto**. La scheda Crediti, escludendola, sta
applicando la regola fiscale giusta; sono le altre tre viste a sommare
un'imposta che su un'operazione extra-UE non esiste. Il difetto non è nel
cruscotto, come avevo scritto, ma **nell'incoerenza fra viste**, aggravata da un
dato dimostrativo che applica il 10% a un'operazione non imponibile.

`[OSSERVATO]` Che l'extra-UE sia un concetto modellato è confermato altrove: il
modulo di inserimento fattura offre «Fattura Verso: Italia / UE / Extra UE», il
campo si chiama `crossCountry`, e la guida interna dedica una schermata alle
«Fatture Extra-UE».

`[IPOTESI]` Resta da spiegare perché gli **incassi previsti** abbiano cambiato
base durante la giornata, passando dal valore netto a quello lordo dopo il ciclo
di prove sulla riconciliazione. La spiegazione più semplice è che le due
grandezze siano calcolate da due punti diversi del codice e che una delle due
venga ricalcolata solo a seguito di certe operazioni. Non determinabile
dall'esterno.

**Quello che conta per noi** non è il numero ma la classe di difetto: la stessa
grandezza calcolata due volte, una sul server e una nel browser, con due
risultati diversi. Quando il server espone già un endpoint di totali, la scheda
dovrebbe consumarlo invece di ricalcolare.

# Cash King — Comportamenti nel tempo

Documento dell'osservazione longitudinale (giorni 11-14 del piano). Questa prima
stesura è la **predisposizione**: fotogramma di riferimento e sonde piazzate il
giorno 1. Le rilevazioni successive si aggiungono in fondo.

Convenzione dei tag come in `01-inventario-rotte.md`.

---

## 1. Perché serve un fotogramma di riferimento

La domanda «il cruscotto ricalcola da solo al passare dei giorni, o è uno scatto
congelato?» non è rispondibile senza sapere esattamente cosa mostrava prima.
Quello che segue è lo stato registrato all'apertura dell'analisi.

**Rilevato:** 10 agosto 2026, ~23:55 (ora italiana) — a cavallo della mezzanotte,
quindi alcune viste possono già essere calcolate sull'11 agosto.

---

## 2. Fotogramma di riferimento — cruscotto `[OSSERVATO]`

### Fascia dei quattro indicatori in testata

| Indicatore | Valore |
|---|---|
| Saldo Attuale | 179.193,07 € |
| Saldo disponibile | 249.193,07 € |
| Saldo a Fine Mese | 168.395,15 € |
| Previsione Cassa | 320.313,39 € |

### Acid Test di Cassa
Valore «12+ mesi», etichetta di stato «Stabile», messaggio «Nessun mese critico
nei prossimi 12 mesi». Pulsante «Apri Scadenziario».

### Scheda «Saldo a Fine Mese» — scomposizione mostrata

| Voce | Valore |
|---|---|
| Liquidità oggi | 179.193,07 € |
| Saldo disponibile (liquidità + fidi) | 249.193,07 € |
| + Incassi mese | 80.265,74 € |
| − Pagamenti mese | 91.063,66 € |
| = Contabile (solo cassa) | 168.395,15 € |
| = Disponibile (cassa + leve) | 238.395,15 € |

### Scheda «Previsione Cassa (90gg)» — scomposizione mostrata

| Voce | Valore |
|---|---|
| Liquidità oggi | 179.193,07 € |
| Saldo disponibile (liquidità oggi) | 249.193,07 € |
| Saldo disponibile (90gg) | 390.313,39 € |
| + Incassi previsti | 309.261,66 € |
| − Pagamenti previsti | 168.141,34 € |
| = | 320.313,39 € |

### Schede Crediti / Debiti / Scaduto

| Scheda | Valore | Variazione mostrata | Mese scorso |
|---|---|---|---|
| Crediti | 200.071,66 € | ↑ +43% | 57.429,47 € |
| Debiti | 87.816,07 € | ↑ +9% | 16.556,62 € |
| Scaduto | −3.145,72 € | ↑ +60% | −7.778,47 € |

### Ciclo di cassa — da `/api/dashboard/cash-cycle`

| Campo | Valore |
|---|---|
| dso | 42 |
| dpo | 53 |
| cashCycle | −11 |
| dsoPure | 43 |
| dpoPure | 51 |
| cashCyclePure | −8 |
| utilizzoFido | 0 |
| previousPeriod (tutti i campi) | `null` |
| customerInvoicesAnalyzed | 42 |
| supplierInvoicesAnalyzed | 37 |
| currentPeriodMonths | 6 |
| previousPeriodMonths | 6 |
| utilizzoFidoPeriodMonths | 3 |

### Conti correnti — da `/api/dashboard/total-balance`

| Conto | Banca | Saldo | Fido cassa | Tipo |
|---|---|---|---|---|
| Conto Corrente Principale | Intesa Sanpaolo | 119.693,07 € | 50.000 € | checking |
| Conto Deposito | FinecoBank | 50.000,00 € | 0 € | deposit |
| Conto Operativo | UniCredit | 9.500,00 € | 20.000 € | checking |
| **Totale** | | **179.193,07 €** | **70.000 €** | |

Campi presenti per ogni conto: `fidoCassaTotal`, `fidoCassaUsed`,
`fidoCassaResidual`, `sbfLimit`, `sbfUsed`, `sbfResidual`, `creditLimit`,
`sbfMode` (valore osservato `none`), `accountType`.

### Fatture e volumi al momento zero
81 fatture totali via `/api/invoices` (42 clienti e 37 fornitori secondo i
metadati del ciclo di cassa, più le 2 di prova create oggi).
Contatore d'uso del piano: `movementsUsed: 46`, `movementsAvg: 42`.

---

## 3. Verifiche aritmetiche già chiuse `[OSSERVATO]`

Non sono ipotesi: i conti tornano esattamente sui valori mostrati.

1. **Saldo a fine mese** = liquidità oggi + incassi del mese − pagamenti del mese
   `179.193,07 + 80.265,74 − 91.063,66 = 168.395,15` ✔
2. **Previsione a 90 giorni** = liquidità oggi + incassi previsti − pagamenti previsti
   `179.193,07 + 309.261,66 − 168.141,34 = 320.313,39` ✔
3. **Saldo disponibile** = saldo contabile + fidi di cassa totali
   `179.193,07 + 70.000 = 249.193,07` ✔ e `168.395,15 + 70.000 = 238.395,15` ✔
   e `320.313,39 + 70.000 = 390.313,39` ✔
4. **Ciclo di cassa** = DSO − DPO
   `42 − 53 = −11` ✔ e nella variante «pure» `43 − 51 = −8` ✔
5. **Somma dei conti** `119.693,07 + 50.000 + 9.500 = 179.193,07` ✔
6. **Calcolo IVA nel modulo fattura**: inserendo imponibile 1000 e aliquota 22
   il campo Importo Lordo si compila da solo con `1220,00`. ✔

`[DEDOTTO]` Il «saldo disponibile» è ovunque definito come saldo più fido di
cassa residuo, applicato in modo coerente a tutte e tre le proiezioni.

~~`[IPOTESI]` Le varianti `dsoPure`/`dpoPure` escludono qualcosa dal calcolo
ordinario.~~ **Chiusa l'11 agosto:** lo Scadenziario mostra le due misure
etichettate «Pesato» e «Puro», quindi sono due metodi di media, non due
popolazioni di fatture. Vedi `04-logiche-di-calcolo.md`, cap. 7. Resta aperto
solo il dettaglio della ponderazione, in `02-aree-funzionali/02-03-scadenzario.md`.

---

## 4. Anomalia da verificare: le percentuali di variazione `[OSSERVATO]` + `[IPOTESI]`

I numeri mostrati non sono coerenti fra loro:

| Scheda | Valore attuale | Mese scorso | Variazione mostrata | Variazione ricalcolata |
|---|---|---|---|---|
| Crediti | 200.071,66 € | 57.429,47 € | +43% | **+248%** |
| Debiti | 87.816,07 € | 16.556,62 € | +9% | **+430%** |
| Scaduto | −3.145,72 € | −7.778,47 € | +60% | +60% ✔ |

`[OSSERVATO]` Su «Scaduto» la percentuale corrisponde alla variazione rispetto
al mese precedente. Su «Crediti» e «Debiti» non corrisponde per niente.

~~`[IPOTESI]` Difetto di calcolo oppure base diversa da quella indicata
dall'etichetta.~~ **Chiusa l'11 agosto, ed è la seconda:** «Mese scorso»
significa *emesso il mese scorso e ancora aperto*, con corrispondenza esatta al
centesimo sia sui crediti (58.039,47 €) sia sui debiti (16.556,62 €). Il numero
grande sopra è invece il totale aperto di tutti i mesi. Non è un errore di
calcolo ma un difetto di presentazione: due popolazioni diverse impilate nella
stessa scheda. Analisi completa in `04-logiche-di-calcolo.md`, cap. 6.

---

## 5. Sonde piazzate il giorno 1

### Sonda A — fattura in scadenza ravvicinata
| Campo | Valore |
|---|---|
| Numero | `TEST_CK_SCAD_3GG` |
| Cliente | `TEST_CK_Cliente Prova` (creato automaticamente, id 1211) |
| Emissione | 11/08/2026 |
| Scadenza | 14/08/2026 |
| Importo | 1.000 € + 22% = 1.220,00 € |
| Stato alla creazione | `due` |

**Cosa deve rivelare:** il prodotto avvisa *prima* che una scadenza arrivi? Con
quanto anticipo? Su quale canale? Dal 12 al 15 agosto va controllato ogni giorno
se compare un segnale in interfaccia.

### Sonda B — fattura già scaduta alla creazione
| Campo | Valore |
|---|---|
| Numero | `TEST_CK_SCADUTA_IERI` |
| Cliente | `TEST_CK_Cliente Prova` |
| Emissione | 10/07/2026 |
| Scadenza | 09/08/2026 (due giorni prima della creazione) |
| Importo | 500 € + 22% = 610,00 € |
| Stato alla creazione | **`due`, non `overdue`** |

`[OSSERVATO]` Questo è già un risultato: una fattura con scadenza nel passato
viene salvata in stato «Da Pagare» e **non** viene marcata scaduta al momento
della scrittura.

`[DEDOTTO]` Lo stato di scaduto non è calcolato al momento della lettura ma
scritto da un processo periodico. Nel bundle esiste infatti l'endpoint
`/api/invoices/update-overdue`.

**Cosa deve rivelare:** quando gira quel processo (notturno? all'accesso?), e se
nel frattempo il cruscotto conteggia o ignora la fattura nella scheda «Scaduto».
⚠️ **Correzione alla previsione originaria.** Questa sonda prevedeva che lo
Scaduto passasse da −3.145,72 € a −3.755,72 €, assumendo che «Scaduto» fosse un
totale. L'esperimento ha dimostrato il contrario: è una **posizione netta**, e
un credito scaduto in più la *riduce*. Il valore misurato dopo l'inserimento è
**−2.535,72 €**, cioè migliorato di esattamente 610 €.
**Il riferimento corretto per le riletture è −2.535,72 €**, non −3.755,72 €.
Dettaglio in `04-logiche-di-calcolo.md`, cap. 5.

### Sonda C — il fotogramma stesso
I valori del capitolo 2 vanno riletti agli stessi endpoint nei giorni
successivi. Domande a cui rispondere:

- la finestra dei 90 giorni scorre davvero giorno per giorno, o è ancorata a un
  inizio mese?
- `previousPeriod` del ciclo di cassa è oggi tutto `null`: si popola col passare
  del tempo? È la prova che confrontano periodo su periodo.
- l'Acid Test resta «12+ mesi» o cambia?
- esiste uno storico delle previsioni, cioè il previsto di ieri confrontato col
  consuntivo di oggi? Vedi il capitolo 5b: **nella tesoreria no, nel Retail sì.**

---

## 5b. Lo storico delle previsioni: assente dove serve, presente dove non lo vedi

`[VERIFICATO]` Ricerca esaustiva per esclusione su tutte le fonti disponibili:

| Dove ho cercato | Esito |
|---|---|
| 173 rotte del router | nessuna rotta di storico o snapshot delle previsioni |
| 279 endpoint `/api/*` | solo `/api/recurring-entity-forecasts` e i due del Retail |
| Bundle: stringa `forecastSnapshot` | 0 occorrenze |
| Bundle: `scostamento` | 5 occorrenze, tutte in DSO/DPO e Retail |
| Bundle: `varianza` | 3 occorrenze, tutte nel Retail |

`[DEDOTTO]` **Il modulo di tesoreria non conserva le proprie previsioni.** Non
esiste modo di sapere cosa il prodotto prevedeva un mese fa, né quindi di
misurare se ci avesse azzeccato. Ogni ricalcolo sovrascrive il precedente.

Per un prodotto che vende previsione di cassa questa è la lacuna più seria
trovata finora: l'utente deve fidarsi di una previsione senza poter verificare
lo storico di affidabilità di chi gliela fornisce.

### Ma nel Retail il confronto esiste, ed è fatto bene `[OSSERVATO]`

La guida in-app documenta un indicatore del cruscotto Retail chiamato **«Varianza
Previsione»**, descritto così: «Lo scostamento percentuale tra le previsioni di
vendita e gli incassi effettivi: **verde (≤5%), giallo (≤15%), rosso (>15%)**».

E il suggerimento che l'accompagna arriva a dire cosa fare del risultato: «Il
KPI *Varianza previsione* ti mostra quanto le previsioni si sono avvicinate alla
realtà: verde (≤5%) = ottime, giallo (≤15%) = da migliorare, **rosso (>15%) =
modello da rivedere**».

`[DEDOTTO]` Il ciclo di autovalutazione — prevedo, confronto col consuntivo,
correggo il modello — è stato progettato e implementato, ma **solo per le
vendite del punto vendita**, cioè dentro il modulo a pagamento che non è
nemmeno pubblicizzato. Il previsionale di cassa, che è la promessa principale
del prodotto, ne è privo.

`[IPOTESI]` La differenza si spiega col fatto che nel Retail la previsione nasce
da un modello esplicito e versionato (`/api/retail/forecast/models`), mentre in
tesoreria è ricalcolata al volo dalle scadenze e non è mai un oggetto
persistente. Senza un oggetto «previsione» salvato non c'è nulla da confrontare.

---

## 6. Cosa NON è stato possibile predisporre

### Solleciti e promemoria automatici — bloccati dal piano `[NON ESPLORABILE]`
`[OSSERVATO]` `/settings/reminders` mostra un blocco a tutta pagina: la sezione
richiede l'addon «Promemoria automatici» (2,99 €/mese). L'account trial non lo
ha attivo (`addons: []`).

Di conseguenza **l'intero capitolo «alert e notifiche via email» del metodo non
è osservabile** con questo accesso. Restano documentabili solo per endpoint:
`/api/reminders/settings`, `/templates`, `/queue`, `/logs`,
`/api/reminders/scheduler/status` e `/trigger`.

`[DEDOTTO]` Esistono modelli di messaggio, una coda di invio, un registro degli
inviati e uno scheduler con attivazione manuale.

⚠️ Nota deliberata: anche se l'addon fosse attivo, **non avvierei invii reali**.
I solleciti spediscono email a terzi e il dataset dimostrativo contiene
indirizzi di controparti; un invio sarebbe un effetto verso l'esterno, fuori dal
perimetro di una semplice analisi.

### Centro notifiche in-app — presente ma inerte `[OSSERVATO]`
Nell'intestazione c'è un'icona a campanello (`data-testid="button-notifications"`).
Cliccandola non si apre alcun pannello, non compare alcun elemento, l'attributo
`aria-expanded` è assente e il pulsante non è disabilitato.

`[IPOTESI]` È un segnaposto non ancora collegato, oppure si popola solo con
l'addon dei promemoria attivo. Da riprovare nei giorni successivi: se una
scadenza imminente non accende nemmeno un pallino sul campanello, la risposta è
che il prodotto **non ha notifiche in-app**.

### Report schedulati
Nessuna traccia di report periodici inviati per email fra le rotte `/prints/*`,
che sembrano stampe generate su richiesta. `[IPOTESI]` non esistono riepiloghi
schedulati; da confermare esplorando la sezione Stampe in Fase 2.

---

## 7. Calendario delle rilevazioni

| Quando | Cosa rileggere |
|---|---|
| 12 ago | Stato della sonda B: è diventata `overdue`? Campanello acceso? |
| 13-15 ago | Sonda A in avvicinamento e superamento della scadenza del 14 |
| 17 ago | Fotogramma completo: i quattro indicatori si sono mossi? |
| 21-24 ago | `previousPeriod` del ciclo di cassa si è popolato? Acid test cambiato? |
| 28-29 ago | Ultima rilettura prima della scadenza dell'accesso |

---

## 8. Interventi che alterano il fotogramma di riferimento

⚠️ Da leggere **prima** di confrontare le rilevazioni successive col capitolo 2:
alcune misurazioni della sessione dell'11 agosto hanno modificato i dati. Le
variazioni osservate domani non sono tutte spontanee.

| Quando | Intervento | Effetto sul fotogramma |
|---|---|---|
| 11 ago, ~00:06 | Create le due fatture `TEST_CK_` | Crediti +1.830,00 · Incassi mese +1.830,00 · Pagamenti mese +110,00 · Pagamenti 90gg +330,00 · Scaduto +610,00 |
| 11 ago, ~06:30 | Periodicità IVA commutata a trimestrale e **riportata a mensile** | Nessuno: verificato che `vatPeriod` è tornato a `monthly` e le previsioni ai valori di partenza |
| 11 ago, ~06:32 | **Approvata una proposta di riconciliazione** (Telecom 180,00 € del 31/07 ↔ rata #3 di «Telefonia e Internet») | Un movimento bancario è passato a riconciliato e una rata ricorrente è uscita dai pendenti: le uscite ricorrenti previste calano di 180,00 € |

`[OSSERVATO]` Le rate ricorrenti ancora pendenti sono passate a **11**.

**Conseguenza pratica.** Il valore di riferimento aggiornato per la sonda B
resta valido — se il processo notturno marca `TEST_CK_SCADUTA_IERI` come
`overdue`, lo Scaduto del cruscotto non cambia importo ma cambia composizione.
Invece il confronto sulle **uscite previste** va fatto contro i valori
post-approvazione, non contro quelli del capitolo 2.

### Un risultato già acquisito sulla sonda B `[OSSERVATO]`

Alla rilettura dell'11 agosto mattina, con la scadenza del 09/08 ormai passata
da due giorni:

- `TEST_CK_SCADUTA_IERI` ha ancora `status: "due"`;
- la fattura dimostrativa `FV-2025/0033`, scaduta il **10/08**, cioè un giorno
  *dopo* la nostra, risulta `status: "overdue"`.

### Ipotesi sciolta in giornata: lo scaduto lo scrive il browser `[VERIFICATO]`

Alle 05:25 dello stesso giorno la sonda B **è passata a `overdue`**. Nel
frattempo non era trascorsa alcuna notte: erano passate poco più di quattro ore,
durante le quali però avevo aperto la pagina `/invoices`.

Guardando il traffico di rete di quella pagina compare la risposta:

```
POST /api/invoices/update-overdue  →  200
```

`[OSSERVATO]` La chiamata parte **dal client, al caricamento della lista
fatture**. Non è un processo schedulato sul server.

`[DEDOTTO]` Cadono entrambe le ipotesi precedenti: il processo non salta le
fatture manuali, e non gira di notte. Lo stato `overdue` viene scritto quando
**un essere umano apre la pagina delle fatture**. Alle 04:21 la sonda era ancora
`due` semplicemente perché fino a quel momento avevo interrogato l'API dal
cruscotto senza mai aprire quella schermata.

**La conseguenza è seria e vale la pena enunciarla per intero.** In un'azienda
che per due settimane non apre la lista fatture, nessuna fattura diventa
scaduta: il campo `status` resta indietro rispetto alla realtà, e con esso
tutto ciò che vi si appoggia — il filtro «Solo Scaduti», i conteggi per stato,
e qualunque automatismo che legga lo stato memorizzato. Nel frattempo lo
Scadenziario continua a mostrare il dato giusto, perché confronta le date al
momento della lettura.

È l'origine tecnica delle **due definizioni di scaduto** descritte in
`04-logiche-di-calcolo.md`: non sono due scelte di progetto diverse, sono la
stessa nozione con due momenti di aggiornamento, uno immediato e uno che
dipende da una visita.

`[IPOTESI]` Un aggiornamento affidato al caricamento di una pagina è anche
soggetto a corse: due utenti che aprono la lista contemporaneamente lanciano due
volte la stessa scrittura. Non verificabile con un solo account.

Nel frattempo la conseguenza è già misurabile, ed è la conferma numerica delle
**due definizioni di scaduto** descritte in `04-logiche-di-calcolo.md`:

```
scaduto clienti per stato memorizzato   51.994,13 €
scaduto clienti per data di scadenza    52.604,13 €
differenza                                 610,00 €  ← la sonda B
```

Lo Scadenziario mostra 52.604,13 €, cioè calcola lo scaduto **confrontando le
date**; il campo `status` delle fatture racconta l'altra storia.

---

## 9. Rilevazioni successive

*(da compilare a partire dal 12 agosto 2026)*

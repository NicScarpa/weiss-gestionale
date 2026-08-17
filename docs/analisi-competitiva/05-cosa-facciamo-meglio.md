# Dove siamo superiori a tutti e quattro

Questa sezione non è un contentino: è la parte dell'analisi che dice **cosa non
va toccato** mentre si lavora sul backlog, e cosa è già un vantaggio difendibile.

Sedici voci, divise in tre gruppi: ciò che nessuno dei quattro ha (§1), ciò che
hanno tutti ma noi facciamo meglio (§2), e ciò in cui evitiamo un difetto che
loro hanno (§3).

Ogni voce cita il file del repo, così che l'affermazione sia verificabile.

---

## 1. Unicum — nessuno dei quattro lo ha

### 1.1 · Disaggregare le sedi dentro un'unica società

`CLS-04` `PLT-04` — **nessuno dei quattro**

Agicap vende il **consolidamento** multi-entità. Trezy ha tre dimensioni
analitiche (centri di costo, nature, codici analitici) tutte a zero, e non è
osservabile dove si imputerebbero. Cash King ha il multi-azienda annunciato e non
verificabile. Sibill niente.

Nessuno dei tre risolve il nostro problema, e l'analisi di Agicap lo dichiara
letteralmente: *«le nostre tre sedi sono una società sola: ci servirebbe
l'opposto, disaggregare per sede dentro un'unica entità»*.

Da noi `CostCenter` (STR / VVB / CAS) attraversa l'intera catena:

- sta su `JournalEntry`, `DailyClosure`, `DailyExpense` e `ScheduleRule`;
- ogni conto del piano porta la propria `CostCenterRule` (`DEFAULT_STR`), cioè
  la regola con cui il centro si applica quando ci si registra sopra;
- porta la **provenienza** (`costCenterSource`: scelto / piano / supposto), così
  che un WEISS indovinato all'import non sia indistinguibile da uno scelto a
  mano — dettaglio che il commento nello schema motiva per esteso;
- il conto economico è un **pivot voce × centro**, con colonna `UNASSIGNED`
  esplicita perché niente sparisca.

> `src/lib/cost-centers.ts` · `src/lib/services/cost-center-service.ts` ·
> `prisma/schema.prisma:459-473, 2134` · `src/lib/report/conto-economico.ts`

### 1.2 · Un piano dei conti italiano vero

`FIS-07` — **4/4: nessuno dei quattro ce l'ha**

È il risultato più netto dell'intero confronto, e vale la pena enunciarlo per
esteso perché contraddice l'intuizione:

- **Agicap** vende la costruzione del piano come *servizio professionale a
  preventivo separato*: il pezzo che rende lo strumento davvero tuo non è nel
  prezzo del software. E l'account WEISS ha `AREA FISCALE` **vuota**.
- **Trezy** offre quindici standard nazionali, e per l'Italia la voce si chiama
  «Italia — Personalizzato», che è la dichiarazione onesta di un'assenza: dove
  esiste uno schema codificato lo nominano (PCG, PCMN, PGC, SKR03/04, BAS), dove
  no lo chiamano personalizzato. Le scritture generate usano infatti il **Plan
  Comptable Général francese** — `512100 Banque`, `706000 Prestations de
  services` — su un account dichiarato italiano.
- **Cash King** ha un piano piatto di venti voci orientato alla cassa.
- **Sibill** non ha un piano dei conti, e lo dichiara.

Noi abbiamo il **piano v4 WEISS**, con mastri e gruppi denormalizzati sul conto
imputabile, `systemKey` per i conti di sistema, e la regola di centro di costo
per conto. Non è un vantaggio di funzionalità: è un vantaggio di *dominio*, e i
concorrenti non lo colmeranno perché per loro l'Italia è un mercato fra quindici.

> `src/lib/accounts/piano-conti-weiss-v4.ts` · `prisma/schema.prisma:382-422`

### 1.3 · La data attesa stimata dal comportamento del fornitore

`SCD-06` — **nessuno dei quattro**

Sibill ha `expectedPaymentDate` e la **riallinea** alla data del movimento a
riconciliazione avvenuta; nessuno però la **prevede** prima.

Il caso di Trezy è quello che rende il nostro vantaggio misurabile. Trezy
conosce le condizioni di pagamento (le estrae e le conserva), conosce la data del
documento, e dispone perfino di termini di pagamento per categoria — usati però
solo in contabilità e mai nel cash flow. Con questi tre ingredienti una data
attesa sarebbe stimabile, e **non la stima**: il risultato è una curva
previsionale che su 91 giorni è piatta per 84. Cash King fa qualcosa di più
debole e circolare: deduce il termine pattuito dalla distanza fra data documento
e scadenza, cioè dallo stesso documento che poi misura.

Noi proiettiamo `dataAttesa` dalla **mediana dei ritardi di pagamento del
fornitore negli ultimi 12 mesi**, con soglie di applicabilità che impediscono la
stima rumorosa (campione minimo 3 osservazioni, mediana di almeno 2 giorni in
valore assoluto), una gerarchia di provenienza esplicita
(`riconciliazione > manuale > stima`) e il ricalcolo su cinque eventi distinti,
incluso l'annullamento di una riconciliazione — che toglie un'osservazione dalla
storia e quindi ristima invece di azzerare.

Il perché conta è scritto nella spec: *rende onesto il previsionale. Se un
fornitore paga sempre con dieci giorni di ritardo, il grafico lo riflette invece
di continuare a promettere la data contrattuale.*

> `src/lib/scadenzario/stima-data-attesa.ts` ·
> `docs/superpowers/specs/2026-08-05-stima-data-attesa-design.md`

### 1.4 · L'imputazione contabile che si eredita alla riconciliazione

`RIC-12` `DOC-08` — **nessuno dei quattro**

Nessuno degli altri lega l'imputazione per riga di documento al movimento che lo
salda. Da noi, quando una riconciliazione salda una scadenza nata da una fattura
elettronica, le fette di imputazione si generano **pro-quota dalle righe della
fattura**, dentro la stessa transazione.

I dettagli che rendono la cosa corretta e non solo suggestiva:

- i pesi sono gli importi di riga per conto normalizzati sulla **somma righe
  effettiva**, non su `netAmount`: sconti e abbuoni globali non distorcono lo
  split e l'IVA si ripartisce pro-quota;
- `ripartisciProQuota` è pura, arrotonda al centesimo e quadra la differenza
  sull'ultima fetta;
- pagamento parziale e saldo pieno sono **lo stesso codice**, e il multi-rata
  accumula una fetta per riconciliazione;
- le fette manuali **vincono sempre**: l'ereditarietà scatta solo se il movimento
  non ne ha;
- l'undo rimuove solo le fette della propria riconciliazione e ricalcola il conto
  dominante sulle residue.

> `src/lib/services/allocation-service.ts` ·
> `docs/superpowers/specs/2026-08-05-allocation-design.md`

### 1.5 · La memoria per prodotto del fornitore, con precedenza sull'AI

`CLS-14` — la versione più forte fra i cinque

Cash King impara i **sinonimi delle controparti** all'approvazione di un
abbinamento: buona idea, ma opera sul *nome*. Noi impariamo su
`SupplierProductAccount` (fornitore + prodotto normalizzato → conto), che opera
sul *contenuto* della fattura, con un contatore di conferme.

Il dettaglio che fa la differenza rispetto a qualunque approccio AI-first: la
memoria ha **precedenza assoluta** sul modello, e l'AI può solo dichiarare
`dubbioSuMemoria` — riportando la riga a stato «proposta» invece di imporsi.
Un'AI che non può sovrascrivere ciò che un umano ha confermato è la sola forma di
AI che un contabile accetta.

> `prisma/schema.prisma:1674-1693` · `src/lib/line-categorization/`

### 1.6 · Il ciclo di chiusura cassa

`RET-01` `RET-02` `RET-03` `RET-12` — **nessuno dei quattro**

Cash King è l'unico che ci prova, con il modulo Retail — che però è **bloccato
dietro un addon venduto su trattativa**, il suo «Registratore di Cassa» è
annunciato e non consegnato, e gli incassi si inseriscono comunque a mano ogni
sera.

Il nostro ciclo è più profondo del loro anche solo sulla parte descritta nella
guida:

| Cosa | Loro | Noi |
|---|---|---|
| Incasso per metodo di pagamento | 3 campi lordi | `CashStation`: corrispettivi, fatture, sospesi, contanti, POS, non scontrinato, fondo cassa — **per postazione** |
| Conta fisica del contante | assente | `CashCount`: 15 tagli, `totalCounted` vs `expectedTotal` vs `difference` |
| Andamento infragiornaliero | assente | `HourlyPartial`: progressivi scontrini e POS per fascia, **contatore caffè** con delta, meteo per fascia |
| Blocco del dato verificato | `finalizedAt` + riapertura | `ClosureStatus` DRAFT → SUBMITTED → VALIDATED, con note di rifiuto |
| Contabilità | assente | **la validazione genera la prima nota** con centro di costo risolto |

L'ultima riga è quella che nessuno ha: da loro la chiusura resta un registro
parallelo, da noi diventa scrittura contabile.

> `prisma/schema.prisma:232-362` · `src/lib/closure-journal-entries.ts` ·
> `src/lib/closure-cost-center.ts`

### 1.7 · Priorità e allegati sulla scadenza

`SCD-11` `SCD-12` — nessuno dei quattro

Piccoli, ma nessuno li ha: `Schedule.priorita` (bassa / normale / alta / urgente)
con badge, e `ScheduleAttachment` con upload attraverso `src/lib/storage.ts`.
Per Trezy il documento *è* l'oggetto e quindi il problema non si pone; per gli
altri semplicemente mancano.

### 1.8 · Il tracciamento sistematico della provenienza del dato

`MOV-07` — la versione più completa fra i cinque

Cash King distingue `isManuallyMatched` e filtra i sinonimi per origine: è la
buona pratica, e la loro analisi la elogia («il prodotto distingue
sistematicamente ciò che ha deciso la macchina da ciò che ha deciso una
persona»).

Da noi la stessa idea è applicata **cinque volte**, in cinque punti diversi:
`categorizationSource`, `costCenterSource`, `dataAttesaSource`,
`JournalEntryAllocation.origine`, `InvoiceLineAccount.fonte`. Ciascuno con una
gerarchia dichiarata su chi vince.

> `prisma/schema.prisma:453, 466-473, 618-620, 525-527, 1652`

### 1.9 · PWA con funzionamento offline

`PLT-09` `ALR-06` — nessuno dei quattro

Trezy da telefono è una **vista di consultazione**: sparisce l'intera area di
configurazione, inclusi gli avvisi di saldo che servirebbero proprio a chi è
fuori ufficio. Cash King non è stato misurato sul mobile. Nessuno dei quattro ha
push su dispositivo funzionanti (Trezy le ha nel bundle senza interfaccia).

Noi abbiamo Serwist con funzionamento offline, push VAPID attive dal 7 agosto
2026 e un criterio di misura del responsive documentato e usato. La ragione è di
dominio e vale la pena ricordarla: da noi il mobile non è il titolare che
consulta, è **lo staff che compila la chiusura di cassa a fine turno**.

> `serwist.config.mjs` · `src/app/sw.ts` · `prisma/schema.prisma:1571`

---

## 2. Presente in tutti, ma noi lo facciamo meglio

### 2.1 · Una sola definizione di «quanti soldi ho»

`BNK-04` — contro il difetto più grave di Cash King

Cash King ha **tre endpoint che rispondono alla stessa domanda con tre numeri
diversi** (179.193,07 / 172.546,33 / 178.211,93 €), e la loro stessa analisi
chiude con: *«Da non copiare: avere tre endpoint diversi che rispondono alla
stessa domanda. Qualunque cosa scegliamo, deve essere una regola sola, applicata
in un punto solo del codice.»*

Da noi `src/lib/saldi.ts` è quella regola sola, e il commento in testa racconta
che ci siamo arrivati **dopo** aver avuto lo stesso problema: quattro formule
diverse che differivano non per arrotondamenti ma per definizione — chi partiva
dal saldo iniziale dell'anno e chi da zero, chi sommava i movimenti futuri, chi
leggeva una tabella che nessun codice ha mai popolato.

La definizione è ora unica e scritta: *saldo a una data = saldo iniziale
dell'anno + movimenti dal 1° gennaio fino a quella data compresa*, con le tre
parti motivate una per una.

> `src/lib/saldi.ts:6-42` · cashking/02-02 §5

### 2.2 · Le fatture attese e lo scaduto entrano davvero nel previsionale

`PRV-05` `PRV-06` — contro il limite dichiarato di Trezy

Trezy mostra le fatture attese nella riga «Documenti» e **non le usa**:
`includeInvoices: false` in ogni chiamata della griglia. Settembre 2026 mostra
4.770,20 € di fatture da pagare e, due righe più sotto, un saldo previsto
invariato. Peggio: `lateInvoiceForecast` è a zero ovunque, quindi **70.957 € di
debito scaduto non figurano fra le uscite attese** — denaro che uscirà e che il
grafico ignora.

Da noi entrambi entrano: le rate fattura generano scadenze
(`invoice-schedule-service.ts`), le scadenze alimentano il saldo scalare, e lo
scaduto è esposto sia a parte sia incluso (`scaduto.saldoFinaleIncluso`).

> `src/lib/services/invoice-schedule-service.ts` ·
> `src/app/api/scadenzario/saldo-scalare/route.ts:184-188` · trezy/02-01 §11

### 2.3 · L'aging non ha un contenitore senza fondo

`SCD-03` — contro il limite di Trezy

Le quattro fasce di Trezy sono **cablate e non configurabili**, e l'ultima è
aperta verso il passato: la 90+ vale il 55% dello scaduto e mescola il ritardo di
quattro mesi — un problema di tesoreria da gestire oggi — con quello di **1.247
giorni**, che è rumore d'archivio. Il KPI «Scaduto −70.957 €» non è azionabile
senza ispezione manuale.

Le nostre sei fasce (0-15, 15-30, 30-60, 60-90, 90-120, >120) separano attive e
passive e non collassano l'anzianità in un unico secchio.

> `src/app/api/scadenzario/aging/route.ts:14-21` · trezy/02-02 §5

### 2.4 · Lo stato di pagamento non si può dichiarare, si deriva

`DOC-09` — contro il difetto di Cash King e le 15 fatture «pagate senza pagamento»

Cash King permette di salvare una fattura in stato «Pagato» senza alcun
movimento collegato: 15 documenti per 57.545 € nel dataset dimostrativo. Il
prodotto lo intercetta a valle, con «Saldate fuori sistema» e un report — che è
un'ottima mitigazione di un problema che non avrebbe dovuto crearsi.

Da noi `PATCH /api/scadenzario/[id]/stato` **rifiuta** lo stato incompatibile
con i pagamenti registrati, con messaggi che dicono cosa fare invece:
*«La scadenza ha ancora 340,00 € da pagare: registra il pagamento invece di
dichiararla pagata.»* Il commento in testa alla funzione lo motiva: *lo stato di
pagamento si deriva dai pagamenti; qui si può solo dichiarare ciò che i pagamenti
confermano.*

⚠️ Il vantaggio è **parziale** e va detto: preveniamo lo stato incoerente con i
*pagamenti*, non con i *movimenti*. Un pagamento manuale senza movimento di
prima nota resta possibile ed è il gap `SCD-08`, primo del backlog.

> `src/app/api/scadenzario/[id]/stato/route.ts:22-63` · cashking/02-06 §1.1

### 2.5 · Lo scaduto si calcola, non si scrive

`ALR-07` — contro il difetto più sottile di Cash King

In Cash King lo stato `overdue` **lo scrive il browser** all'apertura della lista
fatture, via `POST /api/invoices/update-overdue`. In un'azienda che per due
settimane non apre quella pagina, nessuna fattura diventa scaduta: il campo
`status` resta indietro rispetto alla realtà e con esso tutto ciò che vi si
appoggia. Da qui due definizioni di scaduto che differiscono di 610 €.

Da noi non esiste uno stato scritto: l'aging e il saldo scalare confrontano le
date al momento della lettura (`dataAttesa ?? dataScadenza`). La classe di bug
non è mitigata, è **strutturalmente assente**.

> `src/app/api/scadenzario/aging/route.ts:44-52` · cashking/04b §8

### 2.6 · Il tracking dei prezzi funziona davvero

`DOC-14` — contro una funzione che Trezy annuncia e non può eseguire

Trezy ha tre interruttori — Prodotti, Analisi fornitori, Analisi prezzi — e tre
beta di food cost. Tutti e sei poggiano sulle righe di dettaglio delle fatture,
che **non vengono estratte**: il campo è vuoto su 100 documenti su 100.
Attivarli produrrebbe schede senza dati.

Da noi `Product` + `PriceHistory` + `PriceAlert` funzionano, con normalizzazione
del nome prodotto, storico per fornitore, variazione percentuale e alert con
stato di revisione. La differenza è che noi le righe le abbiamo, perché il ciclo
passivo italiano è XML strutturato e non un PDF da leggere.

> `src/lib/price-tracking/index.ts` · `prisma/schema.prisma:1714-1783` ·
> trezy/02-02 §8.4

### 2.7 · La verifica come asse ortogonale, su entrambi i lati

`MOV-03` — la copia più fedele di Sibill, e più completa

Sibill ha `verificationStatus` sia sul movimento sia sulla scadenza, e nei match
automatici la transazione passa a VERIFIED mentre la scadenza resta TO_VERIFY:
i due assi sono trattati separatamente. Trezy ha **due nozioni di «confermato»
che il lessico non distingue** (verifica della categoria e conferma del
collegamento a documento), e la sua analisi lo registra come difetto.

Da noi `JournalEntry.verified` e `Schedule.verificata` sono speculari, con route
gemelle, filtro e audit su entrambi.

> `src/app/api/scadenzario/[id]/verifica/route.ts` ·
> `src/app/api/prima-nota/[id]/verify/route.ts` · trezy/02-03 §5.3

### 2.8 · Sicurezza: RLS su tutte le tabelle, audit, soft delete

`PLT-01` `PLT-11` — più severi di tutti e quattro

Cash King ha due ruoli soli e **il blocco degli addon non è applicato lato
server**: `/api/retail/*` risponde 200 a un account che non ha l'addon. Trezy ha
una politica di password a **sei caratteri senza secondo fattore** su un prodotto
che espone saldi, IBAN e l'intero storico bancario, e nessuna matrice dei
permessi in nessun punto dell'interfaccia. Agicap è l'unico serio (ReBAC su
OpenFGA, 362 relazioni), ed è un mid-market con un'organizzazione di sicurezza.

Da noi: RLS su 80 tabelle su 80, `Role`/`Permission`/`RolePermission`, `AuditLog`
su tutte le operazioni sensibili, soft delete su tutti i modelli contabili, campi
sensibili cifrati con colonna hash affiancata per la ricerca.

> `prisma/schema.prisma:107-138, 2110` · `scripts/enable-rls.mjs` ·
> cashking/02-04 §10 · trezy/02-05 §2

---

## 3. Difetti loro che noi non abbiamo

Riepilogo compatto: sono i modi di sbagliare osservati nei quattro e verificati
assenti da noi. Non producono backlog — producono **cose da non fare** quando si
lavora sul backlog.

| Difetto osservato | Dove | Perché da noi non c'è |
|---|---|---|
| Tre valori diversi per lo stesso saldo | Cash King | `saldi.ts` è fonte unica, per scelta documentata |
| Il «Saldo Attuale» include movimenti datati nel futuro | Cash King | `saldiAlGiorno` conta fino alla data richiesta compresa |
| Tasso medio creditore al 113,333% (doppia conversione in percentuale + media aritmetica anziché ponderata), propagato nel report che si porta in banca | Cash King | Nessun calcolo di tassi |
| Contatori aggregati incoerenti fra loro (due unità di misura mescolate) | Cash King | — |
| Il separatore decimale dell'export ignora l'impostazione del prodotto stesso | Cash King | ⚠️ **da noi c'è lo stesso difetto**: `RPT-04` in quick win |
| 102 documenti su 249 senza rappresentazione in nessuna card, per un campo mancante | Trezy | Le scadenze nascono con `dataScadenza` obbligatoria |
| Il giudizio di affidabilità dell'estrazione calcolato e mai mostrato | Trezy | `InvoiceLineAccount.confidence` è mostrato |
| Anagrafiche frammentate benché la P.IVA sia presente su 93 documenti su 100 | Trezy | ⚠️ **parziale**: abbiamo la P.IVA, non il merge assistito (`DOC-12`) |
| Aliquota IVA di default al 20% (francese) su account italiano | Trezy | Aliquote lette dall'XML SDI |
| «Royal» per «Royalties»: voce di dizionario troncata che rende una categoria irriconoscibile e quindi inutilizzata | Trezy | Piano dei conti scritto in italiano da noi |
| Stato patrimoniale che non quadra del 112% senza dirlo | Trezy | Non produciamo stato patrimoniale |
| Punto morto calcolato su una base di ricavo 3,6 volte più grande dei riquadri accanto | Trezy | Non produciamo break-even |
| L'assistente AI dichiara 70% dove il dato è 49,1% | Trezy | L'AI propone conti, non genera affermazioni sui numeri |
| Una rotta annunciata in interfaccia che non fa nulla («Registratore di Cassa») | Cash King | Regola di progetto: *niente UI che promette automazioni inesistenti* (`src/CLAUDE.md`) |
| La creazione delle regole rotta da settimane: 400 su un campo che il client non allega | Cash King | Test di integrazione sulle route |
| Nessuna vista salvata e URL nudi su tutte le rotte | Trezy | ⚠️ **da noi è quasi lo stesso**: `PLT-06` nel backlog |

---

## 4. Le tre cose su cui il vantaggio è strategico, non incrementale

Se si dovesse difendere il gestionale in una riga, sarebbero queste tre — e sono
le tre che i concorrenti non colmeranno, perché per loro il nostro caso d'uso è
un segmento marginale.

1. **Il piano dei conti italiano vero e la disaggregazione per sede.** Agicap
   vende il piano come consulenza, Trezy chiama «Personalizzato» ciò che non ha
   implementato, Cash King ha venti voci piatte, Sibill nessun piano. E nessuno
   dei tre offre di separare tre punti vendita dentro una società: offrono
   l'opposto.

2. **Il ciclo di cassa del punto vendita che diventa contabilità.** Conta fisica
   per tagli, parziali orari, contatore caffè, workflow di validazione, e la
   validazione che **genera la prima nota**. Cash King ci prova, dietro un addon
   su trattativa, e si ferma al libro cassa.

3. **L'onestà del previsionale.** Le fatture attese entrano, lo scaduto entra,
   la data attesa si stima dal comportamento reale del fornitore, il residuo non
   si conta due volte. Trezy mostra le fatture e non le usa; Cash King somma il
   futuro nel saldo di oggi; Agicap chiede un Excel. Noi abbiamo il difetto
   opposto — **due modelli disgiunti della stessa uscita ricorrente e tre motori
   che non si parlano** (`PRV-03`) — che è un problema di raccordo, non di
   correttezza dei singoli calcoli, e si chiude in un intervento.

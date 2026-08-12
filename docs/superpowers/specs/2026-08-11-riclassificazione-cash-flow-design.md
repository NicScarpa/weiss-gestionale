# Riclassificazione delle voci di conto per il cash flow

**Data:** 11 agosto 2026
**Stato:** design approvato, da implementare
**Ambito:** struttura di riclassificazione del piano dei conti v4 verso il prospetto di cash flow del gestionale

---

## Il problema

Il piano dei conti v4 elenca 155 voci di dettaglio organizzate in mastri e gruppi. È una tassonomia contabile: dice *che natura ha* un costo. Non dice come si legge un flusso di cassa.

Il prospetto che l'utente usa oggi (foglio `BUDGET` del file di contabilità) raggruppa in sette famiglie — Costo Personale, Costi Diretti, Costi Indiretti, Costi Amministrativi, Rimborso Capitale Finanziamenti, Investimenti, Saldo IVA — ed è nato prima del v4. Tre attriti lo rendono non trasportabile così com'è:

1. **"Costi Amministrativi" non è una natura di costo, è un luogo.** Contiene *Affitti e utenze – UFFICIO*, *Retribuzione personale – UFFICIO*, *Cancelleria – UFFICIO*. Il v4 ha estratto quella dimensione nel centro di costo STR. Tenerla come famiglia di voci duplicherebbe l'asse.
2. **Il prospetto mescola economico e finanziario.** Rimborso capitale, investimenti e saldo IVA non sono costi, ma stanno nell'elenco delle famiglie di costo.
3. **Le coperture sono asimmetriche.** Il v4 ha voci che il budget non vede perché non sono cassa (ammortamenti, accantonamento TFR, rimanenze, imposte di competenza); il budget ha righe che il v4 non ha perché non sono conto economico (rata mutuo, cespiti, F24, versamenti contanti).

## Le decisioni prese

| # | Decisione | Motivo |
|---|---|---|
| 1 | **Cash flow puro**, non competenza | Il modulo replica la logica Sibill: conta quando il denaro si muove. Le voci non monetarie restano nel piano marcate `cassa = NO`, pronte per una futura vista di competenza. |
| 2 | **Raggruppamento ibrido gestionale** | Cinque famiglie operative che tengono il personale separato (la % sui ricavi è il KPI di riferimento), isolano il costo del venduto per far emergere il margine di contribuzione, e staccano gli eventi che nel v4 hanno un mastro dedicato. |
| 3 | **Manodopera eventi nei costi evento**, con riga memo | Il margine dell'evento si legge solo se il suo costo è pieno. La % manodopera resta completa grazie a una riga memo fuori dai totali. |
| 4 | **Tre livelli** famiglia → sottogruppo → voce | Il prospetto si legge a colpo d'occhio, il dettaglio si apre quando un numero sorprende. Nessun numero è orfano. |
| 5 | **Nuovo mastro 40**, sezione PATRIMONIALE | Rata mutuo, cespiti, F24 e giroconti devono avere un conto su cui registrarsi, altrimenti la riconciliazione bancaria li lascia scoperti. |
| 6 | **Commissioni su incassi negli oneri finanziari** | Decisione del committente. Le commissioni per circuito (`32.3`) restano sotto il margine di contribuzione, insieme agli interessi e alle spese bancarie. |
| 7 | **IVA come righe calcolate**, non come conti | Nel gestionale il movimento porta l'importo lordo e l'IVA come attributo (`vatAmount`). Le righe IVA del prospetto si derivano sommando quel campo: non servono conti dedicati. |

### Cosa implica la decisione 1

Restano **fuori** dal prospetto, marcate `cassa = NO`:

| Codici | Voci | Perché |
|---|---|---|
| `31.01` → `31.07` | Ammortamenti e svalutazioni | Non toccano mai il conto |
| `33.01` → `33.03` | IRES, IRAP, imposte esercizi precedenti | Competenza; il versamento passa da `40.3.02` |
| `28.3.01` | Accantonamento TFR | Competenza; l'esborso è `28.3.02` |
| `20.6.02`, `20.6.03` | Rimanenze iniziali e finali | Variazioni di magazzino |
| `20.6.04`, `20.6.05` | Ammanchi, omaggi e autoconsumo | Riclassifiche di valore |
| `12.07`, `30.12` | Plus e minusvalenze | L'incasso della cessione è `40.1.04` |
| `30.11` | Perdite su crediti | È una mancata entrata, non un'uscita |

Diciotto voci escluse: **151 delle 169 entrano nel cash flow**, e di queste 149 nel prospetto (le due di `40.4` stanno nel memo tesoreria).

### Cosa implica la decisione 5

L'F24 si registra sul gruppo `40.3`, distinto per tributo. Ne discendono due conseguenze non ovvie:

**Il lordo del personale si ricompone in due pezzi.** Su `28.1` cade il netto bonificato, su `40.3.03` le ritenute e i contributi versati il mese dopo. Non c'è doppio conteggio, ma la famiglia *Costo del personale* da sola non è il costo del lavoro. La riga memo **Totale manodopera** lo ricompone.

**Il mastro 33 non entra nel cash flow.** Se l'IRES pagata cade su `40.3.02`, allora `33.01`/`33.02`/`33.03` sono la competenza e restano `cassa = NO`.

---

## La scaletta

```
  A  INCASSI OPERATIVI
− B  COSTO DEL VENDUTO
  ═  MARGINE DI CONTRIBUZIONE

− C  COSTO DEL PERSONALE
− D  COSTI DIRETTI EVENTI
− E  COSTI DI STRUTTURA
− F  ONERI FINANZIARI
  ═  CASH FLOW OPERATIVO

± G  FISCO E IVA
− H  INVESTIMENTI
± I  FINANZIAMENTI
  ═  VARIAZIONE DI CASSA
  +  cassa iniziale
  ═  CASSA FINALE
```

**Convenzione di segno:** ogni importo porta il segno naturale di cassa — entrate positive, uscite negative. I totali sono somme semplici e la variazione di cassa è la somma di tutte le famiglie. Le percentuali si calcolano in valore assoluto.

### Righe memo, fuori da ogni totale

| Riga | Composizione | A cosa serve |
|---|---|---|
| Totale manodopera | `28` · `29` · `26.03` · `26.05` · `26.06` · `40.3.03` | La % manodopera sui ricavi, completa di personale eventi e di ritenute e contributi |
| Margine eventi | `A2` − `D` | Se gli eventi guadagnano |
| Tesoreria interna | `40.4.01` · `40.4.02` | Versamenti e giroconti: si elidono nel consolidato, vanno sorvegliati perché non pareggiano quasi mai |

---

## I 39 sottogruppi

```
A · INCASSI OPERATIVI
   A1  Corrispettivi                10.01 · 10.09−
   A2  Eventi                       11.01 · 11.02
   A3  Altri proventi               12.01 · 12.02 · 12.03 · 12.04 · 12.06 · 13.01 · 13.02

B · COSTO DEL VENDUTO
   B1  Beverage alcolico            20.1.01 → 20.1.05
   B2  Beverage analcolico          20.2.01 → 20.2.04
   B3  Caffetteria                  20.3.01 → 20.3.04
   B4  Food                         20.4.01 → 20.4.05
   B5  Consumabili di servizio      20.5.01 → 20.5.05
   B6  Rettifiche su acquisti       20.6.01−

C · COSTO DEL PERSONALE
   C1  Retribuzioni                 28.1.01 → 28.1.09
   C2  Oneri sociali                28.2.01 → 28.2.03
   C3  TFR corrisposto              28.3.02
   C4  Altri costi del personale    28.4.01 → 28.4.05
   C5  Organi sociali e collab.     29.01 · 29.02 · 29.04 · 29.05

D · COSTI DIRETTI EVENTI
   D1  Artisti e service            26.01 · 26.02
   D2  Manodopera evento            26.03 · 26.05 · 26.06
   D3  Promozione evento            26.04 · 26.07 · 26.08
   D4  Oneri e allestimenti         26.09 · 26.10 · 26.11

E · COSTI DI STRUTTURA
   E1  Immobili e spazi             27.01 · 27.02 · 27.03
   E2  Utenze                       22.01 · 22.02 · 22.03 · 22.04 · 22.05 · 22.07
   E3  Noleggi, leasing e licenze   27.04 → 27.08
   E4  Manutenzioni e servizi op.   23.01 · 23.02 · 23.03 · 23.05 · 23.07
   E5  Attrezzatura e allestimenti  21.01 → 21.07
   E6  Servizi professionali        24.01 → 24.09
   E7  Marketing e comunicazione    25.01 → 25.08
   E8  Tributi, assicur. e oneri    30.01 → 30.10 · 30.13 · 30.14 · 30.15

F · ONERI FINANZIARI
   F1  Interessi passivi            32.1.01 → 32.1.04
   F2  Spese e servizi bancari      32.2.01 → 32.2.04
   F3  Commissioni su incassi       32.3.01 → 32.3.05

G · FISCO E IVA
   G1  IVA incassata sui corrisp.   [calcolata: Σ vatAmount delle entrate]
   G2  IVA pagata sugli acquisti    [calcolata: Σ vatAmount delle uscite]
   G3  F24 IVA                      40.3.01− · 40.3.04+
   G4  Imposte sul reddito          40.3.02−
   G5  Ritenute e contributi        40.3.03−

H · INVESTIMENTI
   H1  Acquisto immobilizzazioni    40.1.01 · 40.1.02 · 40.1.03
   H2  Cessione cespiti             40.1.04+

I · FINANZIAMENTI
   I1  Rimborso capitale            40.2.01−
   I2  Nuova finanza                40.2.02+
   I3  Soci                         40.2.03− · 40.2.04+
```

### Le collocazioni non ovvie, e perché

**Il personale amministrativo non è una famiglia.** `28.1.09` sta in C1 con tutti gli altri; a distinguerlo è il centro STR. Le vecchie voci `– UFFICIO` si dissolvono nella voce per natura: affitto ufficio → E1, energia ufficio → E2, cancelleria ufficio → E6. La colonna *Costi Amministrativi* non sparisce, si legge nel foglio per centro alla riga STR.

**SIAE e allestimenti sono sdoppiati per natura, non per locale.** `30.14` è l'abbonamento di filodiffusione (E8), `26.09` la SIAE dell'evento (D4). `21.07` sono i fiori sui tavoli (E5), `26.11` l'allestimento della serata (D4). Regola pratica: *se sparisce l'evento e il costo resta, è struttura*.

**Le licenze software stanno con i noleggi.** `27.07` (POS, gestionale, SaaS) in E3 e non fra i servizi professionali: è un canone per usare una cosa, come un leasing.

**Gli oneri diversi restano un solo sottogruppo.** E8 tiene insieme bolli, diritti camerali, IMU/ILIA, COSAP, quote associative, assicurazioni, sanzioni e differenze di cassa: tredici voci eterogenee ma tutte di importo modesto. Il dettaglio c'è al terzo livello.

**`30.15` differenze e ammanchi di cassa è dentro il flusso.** È l'unica voce del gruppo che sposta davvero il saldo: se il fondo contato è meno di quello teorico, quei soldi non ci sono. Escluderla romperebbe la quadratura.

---

## Il mastro 40 — sezione PATRIMONIALE

Quattordici voci nuove, stessa logica di codifica del v4 (tre livelli, numerazione a salti).

| Codice | Voce | Segno | Centro |
|---|---|---|---|
| `40.1.01` | Acquisto immobilizzazioni materiali | uscita | Obbligatorio |
| `40.1.02` | Acquisto immobilizzazioni immateriali | uscita | Obbligatorio |
| `40.1.03` | Migliorie su beni di terzi | uscita | Obbligatorio |
| `40.1.04` | Cessione cespiti | entrata | Obbligatorio |
| `40.2.01` | Rimborso capitale mutui | uscita | Default STR |
| `40.2.02` | Erogazione nuovi finanziamenti | entrata | Default STR |
| `40.2.03` | Rimborso finanziamento soci | uscita | Default STR |
| `40.2.04` | Versamento finanziamento soci | entrata | Default STR |
| `40.3.01` | F24 IVA versata | uscita | Default STR |
| `40.3.02` | F24 imposte sul reddito | uscita | Default STR |
| `40.3.03` | F24 ritenute e contributi | uscita | Default STR |
| `40.3.04` | Rimborsi e crediti compensati | entrata | Default STR |
| `40.4.01` | Versamento contanti in banca | neutro | Default STR |
| `40.4.02` | Giroconti tra conti | neutro | Default STR |

Il centro è obbligatorio su `40.1` perché un cespite sta fisicamente in un locale; è Default STR sul resto perché finanziamenti e fisco appartengono alla società, non a un'attività. Coerente con la legenda del v4: *il centro di costo segue l'attività, non il conto corrente*.

**`40.4` è neutro per costruzione**: un versamento di contanti in banca è la stessa somma che esce dalla cassa. Le due gambe si elidono nel consolidato. Restano registrate perché servono alla riconciliazione dei singoli conti.

---

## I due assi restano separati

È il guadagno strutturale rispetto al file attuale.

- La **natura** la dà la voce di conto: cosa ho comprato.
- Il **luogo** lo dà il centro di costo: per quale attività.

Nessun sottogruppo di cash flow contiene un riferimento a un locale. La lettura per locale è una dimensione ortogonale, esposta nel foglio per centro e nei filtri del gestionale. Quando Villa Varda diventerà una società separata, si aggiunge il campo `azienda` e si filtra: struttura di riclassificazione e piano dei conti restano gli stessi.

---

## Requisiti per il gestionale

### Modello dati

Lo schema esistente copre già l'ossatura: `Account` porta `mastroCode`/`gruppoCode` denormalizzati e `costCenterRule`; `BudgetCategory` è gerarchica; `AccountBudgetMapping` lega un conto a una categoria con vincolo di unicità.

Serve:

1. **Popolare `BudgetCategory`** con le 9 famiglie (livello 1) e i 39 sottogruppi (livello 2, `parentId` alla famiglia). Le categorie attualmente seedate (`FOOD_COST`, `BEVERAGE_COST`, `COSTI_FISSI`, `RICAVI_BAR`…) sono un template generico non allineato né al v4 né a questo design: vanno sostituite.
2. **Aggiungere `PATRIMONIALE` ad `AccountType`** per il mastro 40. Il piano ha tre sezioni — RICAVI, COSTI, PATRIMONIALE — e il valore nuovo le rispecchia. L'alternativa, distribuire il mastro 40 su `ATTIVO`/`PASSIVO`, costringerebbe a stabilire arbitrariamente da che parte sta un F24 IVA. `ATTIVO` e `PASSIVO` restano per i conti di sistema (banca, cassa).
3. **Nessun flag `isCashFlow` sul conto.** L'informazione è nella struttura statica `src/lib/cashflow/riclassificazione.ts`: una voce o sta in un sottogruppo, o sta in `VOCI_FUORI_CASSA`. Una colonna che ripete un dato già presente è una seconda fonte destinata a divergere. Il rischio — un conto nuovo che sparisce in silenzio dal prospetto — lo copre il controllo C4.
4. **Mapping completo**: ogni conto imputabile o è mappato a un sottogruppo tramite `AccountBudgetMapping`, o è dichiarato fuori cassa in `VOCI_FUORI_CASSA`. Nessun conto orfano: chi sfugge a entrambe le vie non sparisce in silenzio dal prospetto, lo segnala il controllo C4.

### Vincoli di integrità

- Un movimento si registra **sempre** sulla voce di dettaglio. Famiglia e sottogruppo sono derivati, mai selezionabili a mano.
- Un conto appartiene a **un solo** sottogruppo (vincolo già presente: `accountId` è `@unique` su `AccountBudgetMapping`).
- Le righe memo non sono categorie: sono query che attraversano famiglie diverse. Non vanno modellate come `BudgetCategory`, altrimenti il totale conta due volte.
- Le righe IVA `G1`/`G2` sono aggregazioni di `vatAmount`, non conti. Nessun `Account` corrispondente.

### I quattro controlli

Il modulo li esegue e li espone; non sono facoltativi. Tre su quattro intercettano una classe di errore già presente nel file di contabilità attuale.

| # | Controllo | Errore che intercetta |
|---|---|---|
| 1 | Somma del prospetto = variazione reale dei saldi di cassa e banca nel periodo | Voci non mappate, movimenti persi |
| 2 | `40.4.01` in banca = `40.4.01` in cassa, di segno opposto | Versamenti registrati su una gamba sola |
| 3 | Zero movimenti senza voce di conto | Righe non categorizzate che spariscono dal prospetto |
| 4 | Zero movimenti su conti fuori piano, inattivi, o non riconosciuti dalla riclassificazione | Etichette duplicate, conti legacy, conti nuovi mai mappati |

---

## Deliverable

Entrambi i file sono **generati** da `scripts/build-cashflow-spec.py`, che legge il piano v4, ci innesta il mastro 40 e applica la mappatura. Non vanno modificati a mano: si cambia lo script e si rigenera, così JSON ed Excel non possono divergere.

```bash
python3 scripts/build-cashflow-spec.py
```

### `docs/cash-flow-riclassificazione.json`

La struttura in forma leggibile da un programma, ed è **la fonte di verità per l'implementazione**: famiglie, sottogruppi, le 169 voci con tutti gli attributi, i totali con le loro formule, righe memo, controlli, centri di costo e le regole invarianti. Da qui si genera il seed delle `BudgetCategory` e delle `AccountBudgetMapping` senza trascrivere nulla a mano.

Invarianti verificate alla generazione: 149 voci mappate senza duplicati fra sottogruppi, nessuna voce `cassa = SI` priva di famiglia tranne le due di `40.4` che stanno nel memo, nessuna voce `cassa = NO` mappata in una famiglia.

### `docs/Cash_flow_riclassificazione_WEISS_v1.xlsx`

Sei fogli, struttura senza dati: la stessa specifica in forma leggibile da una persona, non un rendiconto.

| Foglio | Contenuto |
|---|---|
| `MAPPATURA` | 169 righe. Codice · sezione · mastro · gruppo · voce · famiglia · sottogruppo · segno · `cassa S/N` · regola centro · note. Le voci fuori cash flow sono in grigio. |
| `CASH FLOW` | Righe gerarchiche a tre livelli con outline Excel × 12 mesi + totale. In fondo memo e controlli. |
| `BUDGET` | Struttura identica, valori target. |
| `SCOSTAMENTO` | € e % rispetto al budget. |
| `PER CENTRO` | Righe × STR · WEISS · VV · CAS + totale, e sotto il ribaltamento con le chiavi 60/30/10 modificabili. |
| `SINTESI` | KPI: incassi e media giornaliera · margine di contribuzione € e % · incidenza costo del venduto · incidenza manodopera completa · cash flow operativo € e % · incidenza commissioni sui corrispettivi · peso e margine eventi · cassa iniziale, variazione, finale · mesi di struttura coperti dalla cassa. |

---

## Fuori ambito

- **Riclassifica dello storico 2026.** Deciso di non migrare i dati del file esistente. Resta annotato che la voce `Acquisto beni per produzione di servizi` (126.884 € nel 2026, 106 movimenti) non ha corrispondenza nel v4 e richiederebbe una mappatura per fornitore.
- **Vista di competenza.** Le voci non monetarie restano nel piano con `cassa = NO`; il prospetto di competenza è un'estensione futura che riusa lo stesso albero.
- **Dimensione evento/commessa.** Già dichiarata estensione futura nel v4: gli eventi si leggono in aggregato per centro.
- **Ribaltamento automatico dei costi STR.** Resta un calcolo di analisi manuale, come stabilito nel v4.

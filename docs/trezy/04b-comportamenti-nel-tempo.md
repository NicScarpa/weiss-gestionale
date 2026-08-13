# Trezy — Comportamenti nel tempo: alert, notifiche, ricalcoli

Esito della fase di osservazione longitudinale — la fase che il metodo indica come
**non recuperabile**, perché riguarda comportamenti invisibili in una sessione
singola. Questo documento va letto sapendo prima quanto tempo è stato disponibile.

---

## 1. La finestra disponibile: circa venticinque ore

Il parametro `{SCADENZA_TRIAL}` non era stato fornito nel mandato. È stato
**ricavato dall'applicazione stessa** invece che chiesto, dall'endpoint
`GET auth.trezy.io/api/v2/subscriptions/accounts/{id}/status` `[OSSERVATO]`:

```json
"status": "trialing",
"trial_start": "2026-08-05T11:33:22.000Z",
"trial_end":   "2026-08-12T11:33:22.000Z",
"trialInfo": { "isInTrial": true, "daysLeftInTrial": 2 }
```

La prova del piano Premium dura **sette giorni** e termina il **12 agosto 2026
alle 13:33** ora italiana. L'analisi è cominciata l'11 agosto verso mezzogiorno:
la finestra residua era di circa **venticinque ore**.

Il metodo prescrive di non comprimere l'osservazione longitudinale sotto i sette
giorni. **Non è stato possibile rispettarlo**, e nessuna riorganizzazione del
lavoro avrebbe potuto: al momento in cui l'analisi è iniziata mancavano già meno
di due giorni alla scadenza. Le conseguenze sono elencate al §5 senza attenuazioni.

Va detto anche il rovescio: il piano è in prova, non scaduto, e il periodo di prova
è cominciato il 5 agosto. Se l'analisi fosse partita allora, la finestra sarebbe
stata di sette giorni — ancora sotto la soglia, perché **è la durata della prova
stessa a essere più corta di quanto l'osservazione longitudinale richieda**. Con
prodotti che offrono sette giorni di prova, l'unico modo per osservare i
comportamenti differiti è sottoscrivere almeno un mese.

---

## 2. Cosa era predisponibile senza scrivere dati

Il censimento dei meccanismi differiti configurabili ha prodotto **un solo
risultato**: gli avvisi di saldo.

### 2.1 Avvisi di saldo — l'unico meccanismo di notifica trovato `[OSSERVATO]`

Impostazioni › tab «Notifications» (etichetta non tradotta). Per **ciascun conto
bancario** collegato:

| Elemento | Contenuto |
|---|---|
| Descrizione | «Get an email when a bank account drops below the threshold you set. The threshold is in the bank account's own currency.» |
| Interruttore | «Alert enabled» |
| Soglia | campo numerico, **non impostato** su nessuno dei tre conti |
| Destinatari aggiuntivi | «Also notify these emails (CC)», con pulsante «Add» |
| Personalizzazione | «✎ Customise email subject & body» — oggetto e corpo del messaggio modificabili |
| Salvataggio | pulsante «Save» esplicito, per conto |

Due osservazioni di merito. La soglia **nella valuta del conto** è un dettaglio da
prodotto multi-valuta fatto con attenzione. La personalizzazione di oggetto e corpo
è insolita: presuppone che l'avviso venga inoltrato a qualcuno che non è l'utente —
un socio, il commercialista — e che serva contestualizzarlo.

L'intera schermata è in inglese, dentro un'applicazione impostata in italiano.

### 2.2 Perché non è stato configurato nulla

Impostare una soglia è una scrittura di configurazione, non di dati di business;
ma il suo effetto **non resta nella schermata**. Con il saldo di uno dei conti già
noto, una soglia superiore a quel valore farebbe partire un'email vera verso la
casella aziendale — e, se venissero inseriti indirizzi in copia, verso terzi.

Ricade quindi nella regola di stop-and-ask del mandato: «se va a buon fine, cambia
qualcosa nella realtà o solo nella schermata?». Cambia qualcosa nella realtà.
**Nessun alert è stato configurato**; la proposta è al §6.

### 2.3 Cosa non è stato trovato

Ricerca condotta su tutte le otto rotte e sugli otto tab delle impostazioni.
Non sono stati osservati: notifiche in-app o centro notifiche, digest periodici,
report inviati per email a cadenza fissa, avvisi su scadenze in avvicinamento,
promemoria di pagamento, notifiche push.

**Nessuna di queste è classificata `[ASSENTE]`.** La verifica positiva richiesta
dal metodo non è stata raggiunta, e un indizio suggerisce il contrario: il payload
di `account-settings` contiene

```
"validationNotificationFrequency": "none"
```

Un campo che ammette il valore «nessuna» implica che esistano altri valori, cioè
che un meccanismo di notifica periodica sulla validazione delle categorie esista e
sia disattivato su questo account. `[DEDOTTO]` Dove sia configurabile
dall'interfaccia non è stato individuato: il tab «Notifications» offre soltanto gli
avvisi di saldo. `[NON VERIFICABILE]`

Classificazione corretta di tutte le voci sopra: `[NON OSSERVATO]`, con
`validationNotificationFrequency` come indizio attivo di esistenza per almeno una
di esse.

---

## 3. Ricalcolo: cosa è stato possibile stabilire in una sessione

### 3.1 Il periodo è mobile, non congelato `[OSSERVATO]`

Il payload di `forecast-breakdown` dichiara il proprio periodo e la propria
posizione rispetto al presente:

```json
"isCurrentPeriod": true,
"isFuturePeriod": false,
"period": { "startDate": "2026-07-31T22:00:00.000Z",
            "endDate":   "2026-10-31T23:00:00.000Z" }
```

Il motore sa dire se il periodo che sta calcolando è passato, corrente o futuro, e
il calcolo dipende da questa collocazione — il campo `calculation` per le categorie
riporta «future remaining (aggregated)». Una finestra mobile ancorata alla data
corrente, non uno snapshot salvato. `[DEDOTTO]`

### 3.2 L'orizzonte si adatta alla risoluzione `[OSSERVATO]`

Cambiando risoluzione cambia l'ampiezza della finestra mostrata:

| Risoluzione | Intervallo osservato |
|---|---|
| Giornaliera | 2026 – 2027 |
| Settimanale | giugno – ottobre 2026, con i giorni 1, 8, 15, 22, 29 |
| Mensile | ottobre 2025 – giugno 2027 |
| Trimestrale | 2024 – 2029, per trimestri |

Non una finestra fissa riscalata, ma un orizzonte scelto in funzione del passo.

### 3.3 Curva delle fatture future `[OSSERVATO]`

`GET /api/invoices/future-cumulative` restituisce una serie giornaliera:

```json
{"date":"2026-08-11","cumulative_amount":-657.16,"daily_invoice_count":2,"daily_amount":-657.16},
{"date":"2026-08-12","cumulative_amount":-657.16,"daily_invoice_count":0,"daily_amount":0}, …
```

È il meccanismo con cui lo scadenzario alimenta la proiezione di cassa. La curva
parte dalla data corrente: un altro indizio di ricalcolo ancorato a «oggi».
Che resti piatta dopo l'11 agosto dipende dal dato — quasi nessuna fattura ha data
di pagamento prevista — non dal meccanismo.

### 3.4 Date relative

L'interfaccia usa forme relative: «7g fa», «8 giorni fa», «circa 10 ore fa»,
«Scaduto +117g». Sono rendering calcolati alla lettura. Un caso limite osservato
nell'anagrafica clienti: **«ultima attività: tra 5 mesi»** — una data futura
formattata dalla stessa funzione che gestisce il passato, senza controllo di segno.
`[OSSERVATO]`

### 3.5 Storico delle previsioni: non trovato

Nessuna funzione che confronti il previsto di ieri con il consuntivo di oggi, né
uno storico delle versioni di previsione. Il confronto previsto/consuntivo esiste
in due punti — il selettore «Confronta con la previsione» nel conto economico e la
riconciliazione previsione↔transazione — ma entrambi confrontano il previsto
**corrente** con il consuntivo, non una previsione passata con il suo esito.
`[NON OSSERVATO]`, non `[ASSENTE]`.

---

## 4. Snapshot per il riconfronto

Poiché l'osservazione a sette giorni era impossibile, è stata predisposta la sola
misura ancora praticabile: **congelare lo stato di oggi** per riconfrontarlo entro
la scadenza, ottenendo una finestra di circa ventiquattro ore.

| Elemento | Percorso |
|---|---|
| Snapshot dell'11 agosto | `assets/trezy/api-traces/SNAPSHOT-2026-08-11.json` (117 payload API + testo integrale di cashflow, documenti, prestazioni) |
| Script di riconfronto | `scratchpad/tz/09-riconfronto.mjs` |

Lo script riesegue la cattura, salva `SNAPSHOT-2026-08-12.json` e produce il
confronto per differenza, sia sul testo delle schermate sia — più preciso — sui
payload delle API di calcolo.

**Cosa può accertare una finestra di ventiquattro ore:** se saldi, aging e curva
delle fatture future avanzano di un giorno; se l'aging incrementa i contatori
(«Scaduto +117g» → «+118g»); se il periodo mobile scorre; se compaiono transazioni
nuove e come vengono categorizzate senza intervento.

**Cosa non può accertare:** l'innesco degli avvisi, il wording effettivo delle
email, l'esistenza di digest o report schedulati, la stabilità delle previsioni su
più settimane, l'esistenza di uno storico delle previsioni.

> **Stato: da eseguire.** Il riconfronto va lanciato il 12 agosto prima delle
> 13:33. Al termine, questa sezione va sostituita con l'esito.

---

## 5. Conseguenze sulla qualità di questa analisi

Da dichiarare senza attenuazioni, perché la sintesi comparata non ne tragga
conclusioni sbagliate:

1. **Il comportamento degli alert di Trezy non è stato osservato.** Non sappiamo
   quando scattano, con quale wording, né se l'email arriva davvero. Sappiamo solo
   che il meccanismo esiste e come si configura.
2. **Non sappiamo se Trezy invii digest o riepiloghi periodici.** L'assenza di
   interfaccia dedicata non è prova di assenza della funzione.
3. **Non sappiamo come si comporti la previsione al passare dei giorni** su un
   account alimentato: gli indizi di §3 dicono che il periodo è mobile, ma è una
   deduzione da un payload, non un'osservazione ripetuta.
4. **Il confronto previsto/consuntivo nel tempo non è stato valutato**, che è
   proprio il comportamento che distingue un prodotto di tesoreria maturo.

Su questi quattro punti, in sede di sintesi comparata, Trezy va trattato come
**non valutato**, non come carente.

---

## 6. Proposta all'utente (richiede conferma)

Una sola predisposizione avrebbe ancora senso nella finestra residua, e non può
essere eseguita di iniziativa perché produce effetti reali.

**Attivare un avviso di saldo su un solo conto**, con soglia impostata
**deliberatamente sopra il saldo attuale**, per far scattare l'avviso e osservare:
con quale ritardo arriva l'email, quale oggetto e quale corpo hanno per impostazione
predefinita, se il messaggio contiene il saldo e il nome del conto, se arriva una
sola volta o si ripete.

| Aspetto | Valutazione |
|---|---|
| Cosa cambia nella realtà | parte **una email vera** verso la casella aziendale |
| Chi la riceve | solo l'indirizzo dell'account, se non si aggiungono destinatari in copia — **da non aggiungere** |
| Dati modificati | nessun dato di business: solo la configurazione di un avviso |
| Reversibilità | alta: si disattiva l'interruttore e si azzera la soglia |
| Valore per l'analisi | alto: è l'unico comportamento differito osservabile prima della scadenza |

**Serve una conferma esplicita.** In assenza di risposta entro le 13:33 del 12
agosto non verrà eseguita, e il §5.1 resterà come dichiarato.

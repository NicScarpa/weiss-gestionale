# Cash King — Piano del lavoro residuo

Stato aggiornato all'11 agosto 2026, sera. Scadenza dell'accesso: **30 agosto**.

> ## Stato di avanzamento
> | Voce | Stato |
> |---|---|
> | §1.1 HAR sanificato | ❌ **impossibile**: gli strumenti browser non espongono la registrazione HAR. Sostituito da tracce di rete testuali, fra cui `03-cruscotto-caricamento-completo.txt` |
> | §1.2 Export reale | ✅ fatto: CSV e xlsx del report DSO/DPO scaricati e analizzati |
> | §2.1 PSD2 | ✅ fatto — costruito ma non consegnato ai clienti |
> | §2.2 Multi-azienda e team | ✅ fatto — due soli ruoli; il selettore azienda non è osservabile con un account solo |
> | §2.3 Viste movimenti | ✅ `/transactions` fatto; carte, estratti e gateway solo da modello dati |
> | §2.4 Tour interattivi | ✅ fatto |
> | §2.5 Report | ✅ tre su undici generati (incongruenze, DSO/DPO, controllo tesoreria) |
> | §2.6 Anagrafiche e sinonimi | ✅ `/synonyms` fatto; le altre solo da modello dati |
> | §2.7 Pianificazione | ◐ calendario fatture fatto; ordini e pianificazione pagamenti no |
> | §2.8 Power user | ✅ fatto — non esistono scorciatoie né ricerca globale |
> | §3.1 Guida interna | ✅ `06-guida-interna-estratta.md` |
> | §3.2 Pagine pubbliche | ✅ capitolo 10 di `00` |
> | §3.3 Revisione | ✅ `REVISIONE.md`, con i rilievi gravi corretti |
> | §4.1 Riletture longitudinali | ⏳ a calendario: 17 e 21-24 agosto |
> | §4.2 Report finale | ✅ consegnato in chat |
> | §4.3 Pulizia finale | ⏳ alla scadenza |
> | **Approfondimento UI/UX** | ✅ **fatto l'11 agosto sera**: vedi `PIANO-UX.md`. Toast, annullamento, salvataggio automatico, aggiornamenti ottimistici, editing inline, viste salvate, scorrimento infinito, scheletri di caricamento e stato di errore erano le lacune del corpus, ora misurate |

Corpus: 17 documenti, 25 screenshot, 5 export, 3 tracce API.

---

## 0. Il vincolo che detta l'organizzazione

**Il browser Playwright è un'istanza unica condivisa fra la sessione principale
e tutti i subagenti.** Verificato sul campo l'11 agosto: tre agenti lanciati in
parallelo con accesso agli strumenti del browser hanno spostato la scheda nel
mezzo di una misurazione e chiuso la sessione autenticata.

Ne discende la regola che governa tutto questo piano:

> Il lavoro che richiede il browser è **serializzato** e svolto dalla sessione
> principale. Ai subagenti va **esclusivamente** il lavoro che non tocca il
> browser: lettura del bundle già scaricato, pagine pubbliche via WebFetch o
> curl, analisi e scrittura sui documenti già prodotti.

Ogni prompt di subagente deve contenere il divieto esplicito di usare
`browser_*`, altrimenti il divieto non viene rispettato.

Secondo vincolo, dai vincoli etici del metodo: **niente uso dei moduli a
pagamento** (fiscale e retail), nemmeno dove l'API risponde 200. Niente invii
verso terzi. Nessuna azione irreversibile sul dataset dimostrativo senza averne
prima creato una copia di prova con prefisso `TEST_CK_`.

---

## 1. Lacune formali rispetto al metodo — priorità massima

Sono due, ed è l'unico punto in cui il corpus non soddisfa quanto il metodo
chiede esplicitamente.

### 1.1 Nessun HAR sanificato `[BLOCCANTE]`
`assets/cashking/har/` è vuota. Il metodo chiede «Cattura HAR sanificati in
`assets/{SLUG}/har/`». Le tracce testuali in `api-traces/` coprono lo scopo
analitico ma non sono HAR.

**Da fare:** catturare almeno due sessioni complete — il caricamento del
cruscotto e un ciclo di riconciliazione — rimuovendo header `Authorization` e
`Cookie` prima di salvare. Verificare a mano che nessun token compaia nel file.

### 1.2 Nessun export reale del prodotto `[BLOCCANTE]`
`assets/cashking/export/` contiene solo materiale estratto da me. Il metodo
chiede di valutare «formati supportati, struttura dei file, qualità degli
export», e finora ho visto i pulsanti CSV, Excel e Stampa senza scaricare nulla.

**Da fare:** scaricare almeno tre export da fonti diverse — il report DSO/DPO
(CSV e Excel), la tabella movimenti di Cash Command (Excel), una lista fatture —
e valutarne struttura, intestazioni, formato dei numeri e delle date,
completezza rispetto a ciò che si vede a schermo.

**Perché conta più di quanto sembri:** un export povero è il motivo per cui
un'azienda resta legata al foglio di calcolo, ed è esattamente il concorrente
che questo prodotto dichiara di voler sostituire.

---

## 2. Aree sostanziali mai aperte — al browser, in quest'ordine

Quarantanove rotte applicative non sono mai state visitate, contro quattordici
visitate. Non tutte contano; queste sì.

### 2.1 Connessione bancaria PSD2 — ✅ **FATTO l'11 agosto**

> **Esito:** la connessione è configurata lato piattaforma con 337 istituti a
> catalogo, ma non esiste alcun modo per un cliente di usarla: `/psd2-movements`
> è riservata agli amministratori di sistema. Funzione costruita, non consegnata.
> Dettaglio in `01-inventario-rotte.md`, cap. 4.11. Le domande sotto sono
> superate e restano solo come traccia di ciò che si cercava.
Rotte `/settings/bank-accounts`, `/psd2-movements`. Endpoint
`/api/enable-banking/{aspsps,connect,connections,status}`.

È l'integrazione principale di un prodotto di tesoreria, finora solo dedotta dai
nomi degli endpoint, e **non è menzionata da nessuna parte sul sito pubblico**.

Da capire: se il collegamento sia attivabile, l'elenco delle banche supportate
(`aspsps`), come si presenta un conto collegato rispetto a uno manuale, la
frequenza di aggiornamento, e cosa mostrano quando una connessione scade — che
in PSD2 succede ogni 90 giorni ed è il punto dove questi prodotti soffrono.

⚠️ Non completare un collegamento reale verso una banca vera. Fermarsi
all'elenco degli istituti e alla schermata di avvio.

### 2.2 Multi-azienda e gestione team `[ALTA]`
Rotte `/settings/profile` scheda «Gestione Team», `/accetta-invito`,
`/invitation/:token`. Endpoint `/api/company/{members,invite,invitations,transfer-ownership}`,
`/api/auth/switch-company`.

È la novità di punta della 0.26.5 e il perno del canale commercialisti.

Da capire: quali ruoli esistano e con quali permessi, come si presenti il
selettore di azienda, se il limite utenti del piano sia applicato, e cosa
mostri la schermata di trasferimento proprietà.

⚠️ **Non inviare inviti a indirizzi reali.** Se il flusso richiede un'email,
fermarsi prima dell'invio e documentare il modulo.

### 2.3 Le viste dei movimenti `[ALTA]`
`/transactions`, `/credit-card-movements`, `/credit-card-statements`,
`/gateway-movements`, `/online-payments`.

Sono le schermate su cui un utente di tesoreria passa più tempo, e finora le
conosco solo di riflesso dalla tabella di Cash Command. Da guardare con
attenzione a colonne di default, filtri, azioni in blocco, editing inline e
cestino (`/api/transactions/trash`).

### 2.4 Tour interattivi `[MEDIA]`
`/help/tours` e `/help/faq`. L'altra novità annunciata nella 0.26.5. Interessa
soprattutto come pattern di onboarding replicabile.

### 2.5 I dieci report mai generati `[MEDIA]`
`/prints/treasury-control` e `/prints/expected-collections` per primi, che dai
nomi sembrano i più densi. Poi `expected-invoices`, `open-invoices`,
`open-bank-movements`, `open-creditcard-movements`, `payment-reconciliation`,
`vat-overview`, `withholding-f24`.

Ognuno va anche usato come occasione per l'export del punto 1.2.

### 2.6 Anagrafiche e sinonimi `[MEDIA]`
`/clients`, `/suppliers`, `/client-groups`, `/categories`, `/synonyms`.
Interessa l'interfaccia dei sinonimi, l'unione di anagrafiche duplicate
(`mergedIntoClientId` è già nel modello) e le azioni in blocco.

### 2.7 Pianificazione e partite accessorie `[BASSA]`
`/revenue/orders`, `/revenue/payment-planning`, `/orders-planning`,
`/payment-terms`, `/manual`, `/other-costs`, `/withholdings`, `/sbf-advances`,
`/vat-prospectus`.

### 2.8 Verifica da power user `[BASSA]`
Il metodo chiede scorciatoie da tastiera e ricerca globale. Finora ho concluso
che non esistano solo perché non le ho viste: va provato `Cmd+K`, `/`, `?`.

---

## 3. Lavoro parallelizzabile — ai subagenti, senza browser

### 3.1 Estrazione delle 78 sezioni non lette della guida interna
Il bundle contiene una «Guida Completa» con **88 sezioni**, una per schermata,
con descrizione, funzionamento, campi, colonne, azioni e suggerimenti. Ne ho
lette circa dieci. Le altre descrivono schermate che non aprirò mai, moduli a
pagamento compresi.

È la fonte con il miglior rapporto fra valore e costo rimasta, e non richiede
né browser né rete: il file è già su disco.

### 3.2 Pagine pubbliche non lette
`/termini`, `/privacy`, `/dpa`, `/nda`, `/onboarding`, `/prenota-onboarding`, e
le tre pagine `/funzionalita/*` mancanti. Con lo user agent da crawler.
Interessano soprattutto SLA, conservazione dei dati, subresponsabili nel DPA, ed
eventuali menzioni di un'API.

### 3.3 Revisione di completezza del corpus
Rilettura dei 12 deliverable contro i sei criteri di qualità del metodo, con
elenco delle lacune e correzione delle incoerenze minori.

---

## 4. Da fare alla fine

### 4.1 Riletture longitudinali — a calendario, non anticipabili
| Quando | Cosa |
|---|---|
| 17 ago | Confronto completo del fotogramma di riferimento |
| 21-24 ago | `previousPeriod` del ciclo di cassa si popola? È la prova se confrontino davvero periodo su periodo |
| 28-29 ago | Ultima rilettura prima della scadenza |

Vedi `04b-comportamenti-nel-tempo.md`, capitoli 7 e 8, e ricordare che gli
interventi dell'11 agosto hanno spostato alcuni valori di riferimento.

### 4.2 Riscrittura del report finale
Il report consegnato in chat il giorno 1 è superato: diceva che il paywall era
coerente, che le percentuali erano un mistero e che il Retail era la priorità
inesplorabile. Va riscritto quando il resto è chiuso, nel formato che il metodo
chiede: cinque funzionalità notevoli, cinque accorgimenti UI/UX, tre debolezze,
due sorprese, e le ipotesi rimaste.

### 4.3 Pulizia finale dell'ambiente
Alla scadenza restano da rimuovere le due sonde `TEST_CK_SCAD_3GG` e
`TEST_CK_SCADUTA_IERI` e il cliente `TEST_CK_Cliente Prova`, e da verificare che
la periodicità IVA sia mensile.

---

## 5. Ordine consigliato

1. Lacune formali (§1.1, §1.2) — poco costose, chiudono un debito col metodo
2. In parallelo, i tre compiti da subagente (§3)
3. PSD2 (§2.1) e multi-azienda (§2.2) — le due aree sostanziali rimaste
4. Viste movimenti (§2.3) e report (§2.5), sfruttandoli per gli export
5. Il resto, per valore decrescente
6. Riletture longitudinali a calendario, poi report finale

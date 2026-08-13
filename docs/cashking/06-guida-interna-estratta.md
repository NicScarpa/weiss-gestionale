# CashKing — la «Guida Completa» interna, estratta dal bundle

Documento di riferimento ricavato dalla documentazione in-app di CashKing, senza aprire il
prodotto. Serve a conoscere le schermate che non verranno mai visitate — in particolare quelle
dei due moduli a pagamento — usando le parole con cui il produttore stesso le descrive.

---

## 1. Nota di metodo

### Da dove viene il materiale

Il prodotto include un «Centro Assistenza» con dentro una wiki (`Guida Completa`,
sottotitolo *«Documentazione dettagliata per ogni pagina dell'applicazione»*). Tutto il testo
di quella wiki viaggia nel bundle JavaScript del client come un unico oggetto di traduzione,
quindi è leggibile per intero senza autenticarsi e senza navigare l'applicazione.

Sono state usate due sorgenti, entrambe già presenti su disco:

- `ck-guida-grezza.txt` (223.328 caratteri) — il template literal con l'albero JSON della guida;
- `ck-bundle.js` (7,2 MB) — il bundle completo, per il dizionario delle etichette di menu, per il
  registro delle pagine e per il catalogo dei messaggi di errore.

Il file grezzo non è JSON valido: proviene da un template literal, e le sequenze di escape sono
raddoppiate (68 occorrenze di `\\n` e 12 di `\\"`). Normalizzando la doppia barra a barra singola
il documento si parsa integralmente con un tokenizzatore scritto a mano — 223.248 caratteri su
223.248, nessun residuo. [OSSERVATO]

### Quante sezioni sono davvero

Il pattern `"chiave":{"title":"...` trova **88** corrispondenze, ma non sono 88 schermate.
Scomposte: **68** sono sezioni della wiki che documentano una pagina vera (hanno `overview` e
`howItWorks`), le altre 20 sono i contenitori e i passi dei quattro *tour guidati* interattivi
(Dashboard, Fatture, Movimenti Banca, Importazione), più i nodi radice `tours`, `quickTips`,
`faq` e `wiki`. Il numero da tenere è dunque **68 schermate documentate**. [OSSERVATO]

La conferma viene da una seconda struttura nel bundle, indipendente dai testi: un registro di
pagine in cui ogni voce porta `id`, `route`, `icon`, `category` e `relatedPages`. Quel registro
contiene esattamente 68 elementi, e associa a ciascuna sezione la rotta reale
dell'applicazione. È il motivo per cui in questo documento ogni schermata è citata con il suo
percorso: quei percorsi sono dichiarati dal prodotto, non dedotti. [OSSERVATO]

I campi dei moduli portano anche un tipo (`text`, `currency`, `date`, `select`, `number`) e un
flag di obbligatorietà. La guida a schermo mostra il flag come etichetta «Obbligatorio»; qui i
campi obbligatori sono segnalati con un asterisco. [OSSERVATO]

### La guida è indietro di due versioni minori

L'ultima riga della guida è l'etichetta `wikiVersion`: *«Guida aggiornata alla versione»*. Il
numero non è nel testo, è una costante accanto alle categorie della wiki: `$qt="0.24.78"`.
L'applicazione osservata è invece la **0.26.5** (`qT="0.26.5"` nel bundle). Fra le due c'è
almeno un rilascio intermedio documentato, la 0.26.0, che introduce il cambio azienda multiplo,
i KPI finanziari nello Scadenziario e i tour interattivi. La guida è quindi ferma a due
versioni minori prima del prodotto che descrive. [OSSERVATO]

**La discrepanza è verificabile in un punto preciso.** Nella sezione «Riconciliazione
Assistita» la guida scrive testualmente *«Il sistema usa 5 regole di matching»* e poi le elenca
come **R1, R2, R3, R5, R6** — cinque voci, ma numerate fino a sei, con **R4 mancante**. Lo
stesso salto si ripete nel filtro per regola, dove i pulsanti proposti sono «R1, R2, R3, R5,
R6». Non è un refuso isolato: compare due volte, in `howItWorks` e in un suggerimento.
[OSSERVATO]

Che cosa significa: l'ipotesi più economica è che il motore avesse sei regole numerate e che la
R4 sia stata rimossa o non ancora documentata quando la guida è stata scritta, e che il
prodotto attuale ne esponga sei. [IPOTESI] Quel che è certo è che la guida si contraddice da
sola: dichiara un totale di cinque e usa una numerazione che ne presuppone sei. [OSSERVATO]

### Come leggere le marcature

- **[OSSERVATO]** — scritto letteralmente nella guida o nel bundle.
- **[DEDOTTO]** — ricostruzione a partire da più elementi osservati.
- **[IPOTESI]** — congettura, da verificare.

Le descrizioni discorsive sono riassunte con parole diverse dall'originale. Le **etichette** di
campi, colonne e azioni sono invece riportate fedelmente: sono il lessico di dominio del
prodotto ed è la parte che conviene conservare intatta.

### Struttura di ogni sezione della guida

Ogni schermata è documentata con lo stesso schema fisso, i cui titoli a video sono: *Panoramica*
(`overview`), *Come Funziona* (`howItWorks`), *Campi del Modulo* (`fields`), *Colonne della
Tabella* (`columns`), *Azioni Disponibili* (`actions`), *Suggerimenti Utili* (`tips`) e *Pagine
Correlate* (`relatedPages`). Le sezioni sono raggruppate in quattro categorie: *Pagine
Principali*, *Importazione Dati*, *Dati Aziendali*, *Impostazioni*. [OSSERVATO]

---

## 2. Le 68 schermate, per area funzionale

Il raggruppamento che segue è mio: la guida usa solo quattro categorie molto larghe, che
mettono insieme il cruscotto di tesoreria e i report di stampa. [DEDOTTO]

### 2.1 Cruscotti e tesoreria (4 schermate)

#### Dashboard — `/`

La pagina d'ingresso: saldo complessivo dei conti, crediti da incassare, debiti da pagare e
proiezione del flusso di cassa. La guida insiste sul fatto che tutti i numeri sono calcolati,
non inseriti: derivano da fatture, movimenti e uscite ricorrenti.

*Azioni:* Visualizza Saldo · Crediti da Incassare · Debiti da Pagare · Previsione Cash Flow ·
Saldo Fine Mese · Previsione 90 Giorni · Indicatore Acid Test · Top Categorie e Classifiche ·
Vedi Posizione Scaduta · Transazioni Recenti · Riepilogo Gruppi Clienti · Carica Dati di Prova ·
Elimina Dati di Esempio.

Cose non ovvie: l'**Acid Test** qui non è l'indice di bilancio classico ma è descritto come
«quanti mesi la tua azienda può resistere con la liquidità attuale, senza nuovi incassi» — cioè
un *runway*, non un rapporto fra attivo corrente e passivo corrente. [OSSERVATO] La card
«Scaduti» mostra una *posizione netta* (crediti scaduti meno debiti scaduti), espandibile nel
dettaglio separato. I saldi dei gateway di pagamento e le previsioni di spesa delle carte di
credito rientrano nel saldo totale e nelle proiezioni. Esiste un set di **dati di esempio**
caricabile e poi cancellabile, che il sistema tiene distinto dai dati reali.

#### Scadenzario — `/due-schedule`

Vista prospettica: fatture non pagate raggruppate per mese di scadenza, con bilancio cumulativo
e segnalazione dei mesi di tensione (uscite previste sopra le entrate).

*Azioni:* Consulta KPI · Espandi Mese · Vai alla Fattura · Monitor Tensione · Visualizza
Liquidità · Bilancio Cumulativo.

I KPI dichiarati sono **DSO**, **DPO**, **ciclo di cassa** e **utilizzo del fido**. La guida
spiega il ciclo di cassa come DSO meno DPO e lo interpreta in termini di chi finanzia chi.
[OSSERVATO]

#### Cash Command — `/cash-command`

La pagina che il prodotto presenta come sala di controllo, con una metafora esplicita del
cruscotto dell'auto. Tre zone: *Zona Hero* (saldo attuale, previsione a 30 giorni, saldo minimo
previsto, indicatore di tensione), *Radar di Liquidità* (grafico con storico pieno e previsione
tratteggiata, area rossa sotto lo zero), *Timeline Movimenti*.

*Colonne:* Data · Stato · Descrizione · Controparte · Banca · Categoria · Impatto Liquidità ·
Saldo Banca · Saldo Progressivo.

*Azioni:* Zona Hero · Radar di Liquidità · Filtra la Timeline · Attiva/Disattiva Stati ·
Dettaglio Movimento · Aggiorna Controparti · Esporta in Excel · Seleziona Periodo Rapido ·
Filtri Avanzati.

L'elemento concettuale più interessante è la **scala a quattro stati di certezza** applicata a
ogni movimento futuro: *Consolidato* (già in banca, verde), *Completo* (certo, fatture, blu),
*Previsto* (pianificato da ordini, arancione), *Provvisorio* (stimato da costi ricorrenti,
grigio). Gli stati sono attivabili e disattivabili come filtri, e la guida suggerisce la
combinazione «Solo Consolidato + Certo» come vista prudenziale. [OSSERVATO] È una gerarchia di
affidabilità del dato esposta all'utente come strumento operativo, non nascosta nel motore.
[DEDOTTO]

Altri dettagli: i movimenti privi di controparte mostrano «Non riconciliato» in ambra ed esiste
un'azione di *backfill* che le ricostruisce in blocco; i dati si aggiornano da soli ogni due
minuti; le colonne sono personalizzabili e ridimensionabili con preferenze persistenti.

#### Tesoreria (Camera di Controllo) — `/cash-control-room`

Previsione giornaliera per singolo conto. Due viste, *Consolidata* (tutti i conti sommati) e
*Per Conto*. Per ogni conto mostra il saldo giorno per giorno, il margine rispetto al fido e una
stima degli interessi passivi quando il saldo va sotto zero, usando i tassi debitore e creditore
configurati sul conto.

*Azioni:* Vista Consolidata · Vista Per Conto · Monitora il Fido · Calcolo Interessi · Seleziona
Orizzonte Temporale (7, 14, 30 o 60 giorni) · Mostra/Nascondi Dettagli · Aggiorna Dati · Espandi
Dettaglio Conto.

La vista dettagliata espone gli interessi cumulativi a 7, 14, 30 e 60 giorni. I dati si
aggiornano ogni 60 secondi; le colonne di sabato e domenica hanno sfondo grigio. La fonte dei
movimenti previsti è dichiarata: movimenti bancari registrati, fatture in scadenza, ordini
pianificati, costi ricorrenti previsti. [OSSERVATO]

### 2.2 Fatture, movimenti e costi (7 schermate)

#### Fatture — `/invoices`

Il documento centrale del prodotto: fatture attive e passive nella stessa tabella, con lo stato
di pagamento aggiornato automaticamente dai pagamenti collegati.

*Campi:* Tipo\* · Numero\* · Data\* · Scadenza\* · Cliente · Fornitore · Importo Lordo\* ·
Importo Netto · Aliquota IVA · Categoria · Termini Pagamento · Stato · Note · Cross Country ·
Tipo Documento · Ritenuta d'Acconto · Conto Bancario.

*Colonne:* ID · Tipo · Numero · Data · Scadenza · Cliente/Fornitore · Categoria · Stato ·
Importo · Pagato · Residuo.

*Azioni:* Aggiungi Fattura · Modifica · Elimina · Collega Movimento · Storno · Compensazione ·
Filtra · Modifica in Blocco · Scarica File Allegato · Collega Pagamento Gateway/Carta ·
Eliminazione in blocco · Visualizza Totali · Filtra per Cross Country · Gestisci Ritenuta
d'Acconto.

Dettagli che valgono: il campo **Cross Country** distingue operazioni locali, intra-UE ed
extra-UE, e per le extra-UE «l'IVA non viene conteggiata nei calcoli di cassa». Il **Tipo
Documento** è il codice SDI (TD01, TD04, TD06) compilato in automatico dall'import XML. Le
fatture con ritenuta d'acconto **vengono escluse dai dialog di riconciliazione**, perché il
pagamento avviene al netto — una scelta di prodotto piuttosto netta. [OSSERVATO] La ricerca
accetta la sintassi `id:12345`. Dopo una modifica il sistema propone di trasformarla in regola
automatica. Le aliquote di ritenuta citate come esempio sono 20%, 23% e 4%.

#### Movimenti Bancari — `/transactions`

*Campi:* Conto Bancario\* · Data\* · Data Valuta · Descrizione\* · Importo\* · Categoria · Note ·
Causale.

*Colonne:* Saldo Disponibile · ID · Data · Data Valuta · Conto · Descrizione · Categoria ·
Importo · Causale · Stato.

*Azioni:* Aggiungi Movimento · Modifica · Elimina · Collega Fattura · Categorizza · Riconcilia ·
Ripristina dal Cestino · Elimina Definitivamente · Contrassegna come F24 · Contrassegna come
CBILL/PagoPA · Operazioni Massive · Filtri Avanzati · Riconciliazione Massiva · Riepilogo
Totali · Reimposta Filtri.

La pagina è organizzata in quattro tab — *Attivi*, *Deleghe F24*, *CBILL/PagoPA*, *Cestino* — e
un movimento si sposta fra i tab dal menu azioni. Il **Cestino è visibile solo agli
amministratori dell'azienda**. [OSSERVATO] Lo stato di riconciliazione è a tre livelli: verde
riconciliato, ambra parziale, grigio non riconciliato. I badge «Manuale» (blu) e «Modificato»
(giallo) distinguono l'inserimento a mano da un importato poi corretto. I filtri sono
persistenti fra le sessioni e la ricerca copre insieme descrizione, causale e note.

#### Movimenti Carte di Credito — `/credit-card-movements`

*Campi:* Carta di Credito\* · Data\* · Descrizione\* · Importo\* · Categoria · Esercente ·
Valuta Originale · Importo Originale · Tipo · Note.

*Colonne:* Residuo · ID · Data · Carta · Descrizione · Categoria · Importo EUR · Esercente ·
Tipo · Estratto Conto · Importo Originale · Stato Riconciliazione.

*Azioni:* Aggiungi Movimento · Modifica Movimento · Elimina Movimento · Collega Fattura ·
Collega Altro Costo · Modifica Massiva · Elimina Selezionati · Assegna Estratto Conto ·
Riconciliazione Massiva · Filtri Avanzati · Pannello Estratti Conto.

Gestisce esplicitamente gli acquisti in valuta estera tenendo separati importo originale e
importo in euro.

#### Estratti Conto Carte — `/credit-card-statements`

Raggruppa i movimenti carta per periodo di fatturazione mensile e permette di riconciliare
l'intero estratto con il singolo addebito bancario.

*Colonne:* ID · Carta di Credito · Inizio Periodo · Fine Periodo · Importo · Stato · N.
Movimenti · Periodo.

*Azioni:* Genera Estratto Conto · Collega Transazione · Scollega Transazione · Elimina Estratto
Conto · Elimina Selezionati · Filtra per Stato · Filtra per Carta · Cerca.

Eliminando un estratto i movimenti tornano «non assegnati» invece di essere cancellati.

#### Pagamenti Online — `/online-payments`

La guida dichiara apertamente che questa pagina e *Movimenti Gateway* mostrano gli stessi dati
con vocazioni diverse: questa è «la vista operativa per l'operatività quotidiana», con
statistiche aggregate per gateway ed evidenza delle commissioni; l'altra sta nelle impostazioni.
[OSSERVATO] È una duplicazione dichiarata, non un caso. [DEDOTTO]

*Campi:* Gateway\* · Data\* · Importo\* · Tipo\* · Commissione · Controparte · Stato · ID
Riferimento · Descrizione · Note · Categoria.

*Colonne:* ID · Data · Gateway · Descrizione · Controparte · Categoria · Stato · Importo ·
Commissione.

*Azioni:* Aggiungi Pagamento · Collega Fattura · Sincronizza · Modifica · Cestina · Ripristina ·
Riconcilia · Modifica Massiva · Elimina Selezionati · Filtri · Ripristina Selezionati · Elimina
Definitivamente.

#### Movimenti Gateway — `/gateway-movements`

Stessa materia, taglio amministrativo. *Colonne:* ID · Data · Gateway · Tipo · Descrizione ·
Importo · Commissione · Controparte · Categoria · Stato. *Azioni:* Aggiungi Movimento ·
Modifica · Elimina · Collega Fattura · Riconcilia · Sincronizza · Ripristina · Modifica Massiva ·
Elimina Selezionati · Ripristina Selezionati · Elimina Definitivamente · Filtri.

I tipi di operazione censiti sono pagamento, rimborso, prelievo su conto e commissione. La
sincronizzazione PayPal ha una finestra predefinita di 30 giorni.

#### Altri Costi — `/other-costs`

Voci una tantum, costi o ricavi, fuori dallo schema fattura e fuori dai ricorrenti.

*Campi:* Descrizione\* · Importo\* · Data\* · Categoria · Fornitore · Tipo · Note · Stato ·
Controparte. *Colonne:* ID · Data · Descrizione · Fornitore · Categoria · Importo · Pagato ·
Tipo · Stato. *Azioni:* Aggiungi Voce · Modifica · Elimina · Collega Pagamento · Chiudi con
Allineamento · Modifica Massiva · Elimina Selezionati · Collega Transazione · Differenze Cambio.

Due regole esplicite: le **differenze cambio** si generano da sole quando il pagato differisce
dal registrato, e l'importo di una voce **non può scendere sotto il totale dei pagamenti già
collegati**. [OSSERVATO]

### 2.3 Entrate e uscite ricorrenti (2 schermate)

#### Uscite Ricorrenti — `/manual`

Affitti, utenze, rate, leasing, canoni, stipendi. Si definisce importo, frequenza e durata, e il
sistema genera un piano rate che si confronta con i pagamenti reali.

*Campi:* Nome\* · Importo\* · Frequenza\* · Data Inizio\* · Data Fine · Categoria · Tipo\* ·
Fornitore · Controparte · Note · Stato.

*Colonne:* Nome · Importo · Frequenza · Prossima Scadenza · Categoria · Stato · Pagato · Totale
Piano · Media Mensile Effettiva · Residuo.

*Azioni:* Aggiungi Uscita · Modifica Uscita · Elimina Uscita · Visualizza Piano Rate · Collega
Movimento · Segna come Pagato · Chiudi Uscita · Aggiustamento Massivo · Aggiungi Rata · Rigenera
Piano · **Allinea all'Effettivo** · Crea Fornitore Rapido · Modifica Rata.

La distinzione *fisso* / *variabile* è resa visivamente col colore del bordo della card (blu e
arancione). «Allinea all'Effettivo» riscrive il piano sugli importi realmente pagati, e la
colonna «Media Mensile Effettiva» esiste apposta per misurare lo scarto fra pianificato e reale.
[OSSERVATO]

#### Entrate Ricorrenti — `/manual`

Speculare: abbonamenti, canoni, affitti attivi, royalty. Stessa rotta della precedente, quindi
sono due viste della stessa pagina. [DEDOTTO]

*Campi:* Tipo Entrata\* · Nome\* · Importo\* · Frequenza\* · Data Inizio · Categoria · Cliente ·
Controparte · Note. *Azioni:* Aggiungi Entrata · Modifica Entrata · Elimina Entrata · Visualizza
Piano Incassi · Collega Movimento · Scollega Movimento · Segna come Incassato · Chiudi Entrata ·
Crea Cliente Rapido.

### 2.4 Riconciliazione e compensazioni (3 schermate)

#### Riconciliazione Assistita — `/assisted-reconciliation`

La schermata più documentata dell'intera guida, e quella che rivela di più sul motore.

Il flusso: si sceglie un periodo, si preme «Calcola Proposte», il motore confronta ogni
movimento con ogni fattura e produce abbinamenti con un **punteggio da 0 a 100**, ripartito in
tre bande: **80-100 alta**, **50-79 media**, **0-49 bassa**. Ogni proposta mostra i due elementi,
il punteggio con barra colorata e la spiegazione del perché.

*Azioni:* Seleziona le Date · Calcola Proposte · Filtra per Confidenza · Approva Proposta ·
Approva Tutte · Salta Proposta · Storico Analisi · Filtra per Regola · Salva Sinonimo · Riprendi
Analisi · Elimina Analisi · Visualizza Statistiche · Periodi Rapidi.

Le regole dichiarate — con il salto della R4 discusso sopra — sono:

| Regola | Abbinamento |
|---|---|
| R1 | Note di credito ↔ fatture (storno) |
| R2 | Movimenti bancari ↔ fatture (pagamento) |
| R3 | Fatture previste ↔ fatture emesse |
| R5 | Movimenti carta di credito ↔ fatture |
| R6 | Estratti conto carta ↔ addebiti bancari |

I **sei fattori del punteggio** sono nominati esplicitamente in un suggerimento: importo,
controparte, data, testo, segno e **unicità**. La barra sotto il punteggio è segmentata per
fattore, e un segmento largo indica un fattore molto favorevole. [OSSERVATO] L'inclusione
dell'unicità come fattore è notevole: significa che un abbinamento vale di più se è l'unico
candidato plausibile, cioè che il motore pesa anche l'assenza di alternative. [DEDOTTO]

Altri meccanismi: lo **skip permanente** (una proposta rifiutata per sempre non torna più) è
distinto dallo skip temporaneo, e si può motivare; i **conflitti** — stesso movimento o stessa
fattura in più proposte — sono segnalati con un triangolo giallo, raggruppati in card con
alternative ed esclusi dall'approvazione in blocco; approvando un abbinamento con nome
controparte diverso il sistema **propone di salvare un sinonimo**, con il testo modificabile e,
se non riesce a estrarre un nome dalla descrizione, i primi 50 caratteri come punto di partenza;
per le **autofatture TD17, TD18, TD19** e per le fatture extra-UE il confronto usa l'imponibile
netto invece del lordo. Il periodo predefinito è gli ultimi tre mesi. Le analisi sono
persistenti, riprendibili e con barra di completamento.

#### Storno Note di Credito — `/invoices`

Non è una pagina a sé ma un'azione sulle fatture, documentata separatamente. Collega una nota di
credito a una fattura per abbattere il dovuto; lo storno può essere parziale, e il residuo resta
da incassare o pagare. Le note di credito sono riconosciute dal tipo documento TD04.

#### Compensazione Fatture — `/invoices`

Compensa una fattura attiva con una passiva **dello stesso soggetto**, quando la controparte è
insieme cliente e fornitore. Riduce credito e debito senza alcun movimento bancario, e l'importo
da compensare è libero. *Azione:* Compensa.

### 2.5 Importazione dei dati (7 schermate)

È l'area con più superficie funzionale dell'intero prodotto, ed è coerente con un posizionamento
su aziende che ricevono dati da fonti eterogenee. [DEDOTTO]

#### Importa Fatture — `/import/invoices`

Quattro passi (carica, mappa, anteprima, conferma) più una serie di varianti.

*Azioni:* Carica File · Mappa Colonne · Anteprima · Importa · **Importa XML (Fattura
Elettronica)** · **Importa Scadenzario** · Salva Modello di Mappatura · Gestisci Duplicati ·
Carica File ZIP · Sovrascrivi Dati Anagrafici · Seleziona Formato Data · **Risolvi Conflitti
Anagrafici**.

Notevoli: si importano XML di fattura elettronica anche **firmati P7M**, e anche ZIP contenenti
più XML; l'import dello scadenzario aggiorna date di scadenza e importi rateali di fatture già
presenti, senza reimportarle; caricando più file Excel insieme il primo fornisce l'intestazione
e le righe degli altri vengono concatenate; il duplicato è determinato da stesso numero e stessa
data, con scelta fra saltare, sovrascrivere o importare come nuovo. Il **dialog di conflitto
anagrafico** è il dettaglio più maturo: se l'IVA o il termine di pagamento nel file divergono
dal predefinito dell'anagrafica, il sistema chiede quale valore usare, entità per entità.
[OSSERVATO]

#### Importa Movimenti — `/import/transactions`

Wizard esplicito a **sei passi**: Upload → Header → Salta Righe → Mapping → Duplicati →
Anteprima.

*Azioni:* Applica Modello Salvato · Carica File · Seleziona Conto · Configura Intestazioni ·
Salta Righe · Mappa Colonne · Gestione Duplicati · Anteprima · Importa · Salva come Modello ·
**Visualizza Righe Saltate** · Seleziona Delimitatore.

Obbligatori il campo Data e almeno un campo Importo. Sono gestite le banche che separano entrata
e uscita su due colonne («Importo Entrata» / «Importo Uscita»), la notazione decimale italiana,
gli importi negativi sia col meno sia fra parentesi, e i formati data multipli comprese le date
seriali Excel. Il duplicato si rileva su data e importo. Dopo l'importazione c'è un **audit** che
segnala se il totale del file non corrisponde al totale importato, e l'elenco delle righe
saltate riporta il motivo di ciascuna esclusione. Nello step intestazioni si può cliccare una
riga dell'anteprima per eleggerla a header.

#### Importa Movimenti Carte — `/import/credit-card-movements`

Come sopra, con in più il **mapping visivo per i PDF**: si selezionano graficamente le aree del
documento che contengono i dati. Supporta Excel multi-foglio con scelta del foglio.

*Azioni:* Carica File · Seleziona Carta · Configura Colonne · Anteprima · Importa · Salva
Modello · Applica Modello · Mapping Visivo PDF · Configura Intestazione · Salta Righe ·
Seleziona Foglio.

#### Import Fatture PDF (Cassetto Fiscale) — `/import/invoices-pdf`

Importa dal PDF ministeriale dell'Agenzia delle Entrate in cinque passi. La guida arriva a dare
il percorso dentro il portale AdE: *Fatture e Corrispettivi → Consultazione → Fatture ricevute /
Fatture emesse*.

*Azioni:* Seleziona Tipo · Carica PDF · Anteprima · Gestisci Duplicati · Importa · Seleziona
Termine di Pagamento · Seleziona/Deseleziona Fatture.

Le regole sui tipi documento sono dichiarate con precisione: **supportati** TD01 (fattura), TD04
(nota di credito), TD24 (fattura differita), TD06 (parcella); **esclusi automaticamente** TD17,
TD18 e TD19, cioè integrazioni e autofatture per acquisti intra-UE ed extra-UE. Le note di
credito TD04 e TD08 entrano con **importo negativo**. [OSSERVATO]

#### Cronologia Importazioni — `/import/history`

*Colonne:* Data · Tipo · Nome File · Record · Stato. *Azioni:* Scarica File Originale ·
**Annulla Importazione** · Reimporta · Elimina · Elimina Selezionati · Visualizza Righe Saltate ·
Elimina con File Associati.

Il rollback di un'importazione rimuove i dati che aveva creato — è la rete di sicurezza del file
sbagliato. Reimportando, se nel frattempo il conto o la carta di destinazione è stato eliminato,
il sistema chiede di sceglierne un altro. [OSSERVATO]

#### Modelli di Importazione — `/import/models`

*Campi:* Nome Modello\* · Tipo\* · Mappatura. *Azioni:* Crea Modello · Modifica · Elimina ·
Modifica con Procedura Guidata (4 passi) · Gestisci Colonne Disponibili · Imposta Valori
Predefiniti · Configura Opzioni di Lettura.

Un modello non salva solo la mappatura: salva anche riga di intestazione, righe da saltare,
politica duplicati e valori predefiniti per i campi assenti dal file (categoria, termine di
pagamento, aliquota, formato data).

#### File Caricati — `/settings/uploaded-files`

Archivio centralizzato di tutti i file originali. *Colonne:* File · Categoria · Collegato a ·
Dimensione · Data. *Azioni:* Cerca File · Scarica · Elimina File · Elimina Selezionati.

La colonna «Collegato a» segnala anche i file **orfani**. Eliminando un file collegato si perde
il riferimento all'originale ma i dati importati restano.

### 2.6 Anagrafiche (4 schermate)

#### Clienti — `/clients`

*Campi:* Ragione Sociale\* · Partita IVA · Email · Telefono · Indirizzo · Categoria Predefinita ·
Termini Pagamento · Aliquota IVA · **Conto Appoggio** · Gruppo · Nome Breve · Tipo Cliente ·
Contatto · **Email Solleciti** · Descrizione.

*Colonne:* Nome · P.IVA · Email · Categoria · Pagamento · Crediti · Città · **GG Medi
Pagamento**.

*Azioni:* Nuovo Cliente · Modifica · **Unisci** · Propaga Categoria · Propaga IVA · Propaga
Termini · Propaga Conto Bancario · Elimina · Modifica Massiva · Eliminazione Massiva · Aggiorna
Tipi · Vai alle Fatture · Cerca · Filtra per Tipo · Solo con Debito · Gestisci Sinonimi · Filtri
Avanzati.

Il meccanismo di **propagazione** merita attenzione: cambiare un valore predefinito
sull'anagrafica non tocca lo storico, ma il sistema chiede se applicarlo anche alle fatture già
esistenti, e per i termini di pagamento **ricalcola le scadenze**. [OSSERVATO] La classificazione
«strategici» (più di due fatture) contro «occasionali» è automatica e derivata dal conteggio,
non impostata a mano. Unendo due clienti i nomi rimossi **diventano sinonimi** del sopravvissuto.
Il campo «Email Solleciti» accetta più indirizzi separati da virgola.

#### Gruppi Clienti — `/client-groups`

*Campi:* Nome Gruppo\* · Descrizione · Colore (otto colori disponibili). *Colonne:* Nome Gruppo ·
Membri · Ricavi Totali · Spese Totali. *Azioni:* Nuovo Gruppo · Modifica · Elimina · Gestisci
Membri · Vedi Membri · Cerca. Eliminando il gruppo i clienti restano, scollegati.

#### Fornitori — `/suppliers`

Simmetrico a Clienti, con «Debiti» al posto di «Crediti» e «Solo con Credito» al posto di «Solo
con Debito». Stesse quattro propagazioni e stesso comportamento dell'unione.

#### Sinonimi — `/synonyms`

Nomi alternativi per il riconoscimento automatico in importazione, con corrispondenza anche
parziale.

*Campi:* Sinonimo\* · Destinazione\* · Tipo · **Sorgente**. *Colonne:* Sinonimo · Entità · Tipo ·
Sorgente · Data Creazione. *Azioni:* Aggiungi Sinonimo · Elimina · Ripristina · Filtra per Tipo ·
Filtra per Sorgente · Cerca · Ordina · Cambia Tab · Pulisci Filtri.

Il campo **Sorgente** traccia la provenienza — *Manuale*, *Riconciliazione* o *Unione* — cioè il
prodotto sa distinguere i sinonimi scritti da una persona da quelli generati da sé durante la
riconciliazione o la fusione di anagrafiche. Esiste un tab dei sinonimi cestinati, che raccoglie
quelli rifiutati in riconciliazione e da cui si può ripristinare. [OSSERVATO]

### 2.7 Configurazione (7 schermate)

#### Impostazioni Azienda — `/settings/company`

*Campi:* Ragione Sociale\* · Partita IVA · Indirizzo · Inizio Anno Fiscale · **Notazione
Decimale** · **Formato Data**. La notazione decimale (virgola italiana o punto anglosassone) e il
formato data (cinque formati) si applicano a tutta l'applicazione, tabelle ed esportazioni
comprese.

#### Conti Bancari — `/settings/bank-accounts`

*Campi:* Nome Conto\* · Nome Banca · IBAN · **Tipo Conto** · **Fido** · **Tasso Debitore** ·
**Tasso Creditore** · Saldo Iniziale · Data Saldo Iniziale · Conto Predefinito · Valuta.

*Azioni:* Nuovo Conto · Modifica · Elimina · Imposta come Predefinito.

I tipi di conto sono *Ordinario*, *Affidamento* (con fido) e ***Cassa* (cassa contanti)**: il
prodotto modella quindi anche il contante come un conto. [OSSERVATO] Fido e tassi non sono
decorativi: alimentano il calcolo degli interessi nella Camera di Controllo e nel report di
tesoreria. Un conto si elimina solo se non ha movimenti; il predefinito è unico e cambiarlo
libera automaticamente il precedente.

#### Carte di Credito — `/settings/credit-cards`

*Campi:* Nome Carta\* · Ultime 4 Cifre · Limite di Credito · **Giorno di Chiusura** · **Giorno di
Addebito** · Circuito · Canone Mensile · Costo Rinnovo Annuale · **Impegno Medio** · Mese di
Rinnovo · **Canone Incluso in Estratto Conto** · **Rinnovo Incluso in Estratto Conto**.

*Azioni:* Aggiungi Carta · Modifica Carta · Elimina Carta · Ricalcola Impegno · Attiva/Disattiva ·
Vai ai Movimenti.

I due flag «incluso in estratto conto» servono a evitare la doppia registrazione del canone: un
problema concreto di chi tiene i costi carta anche fra i ricorrenti. [DEDOTTO] L'impegno medio è
calcolato dai movimenti, non digitato.

#### Gateway di Pagamento — `/settings/payment-gateways`

*Campi:* Nome\* · Provider\* · Valuta · Credenziali API · ID Account · **Ambiente**. I provider
nominati sono **PayPal, Stripe, Nexi e Link**. L'ambiente è Produzione o Test. *Azioni:* Aggiungi
Gateway · Configura · Sincronizza · Modifica · Elimina · Attiva/Disattiva · Test Connessione. Le
credenziali non sono più visibili dopo il salvataggio.

#### Categorie — `/categories`

*Campi:* Nome Categoria\* · Tipo\* (entrata, uscita o entrambi) · Sezione · Colore. *Azioni:*
Nuova Categoria · Modifica · Riordina · Nuova Sezione · Elimina Categoria · Modifica Sezione ·
Elimina Sezione · Riordina Sezioni · Espandi/Comprimi Sezione.

La struttura è a due soli livelli, sezione e categoria, con le sezioni ordinabili dentro una
colonna costi e una ricavi. Eliminando una sezione le categorie diventano «non categorizzate»
invece di sparire. Non esiste alcuna nozione di piano dei conti o di gerarchia più profonda.
[OSSERVATO]

#### Termini di Pagamento — `/payment-terms`

*Campi:* Nome\* · Giorni\* · Tipo Calcolo\* · Descrizione · Ordine. Il tipo di calcolo ha due
sole varianti: «Dalla data fattura» e «Dalla fine mese». [OSSERVATO]

#### Regole Automatiche — `/settings/rules`

*Campi:* Nome Regola\* · Condizione\* · Azione\* · Categoria · **Tipo Regola**\* · **Ambito** ·
**Priorità** (0-100) · Attiva · **Logica Condizioni** (AND/OR) · Descrizione.

*Azioni:* Nuova Regola · Modifica · **Testa** · Riordina · Elimina · Attiva/Disattiva · **Esegui
Regola** (retroattiva su tutti i documenti esistenti) · Filtra per Tipo.

Numeri dichiarati: **10 tipi di regola** — categorizzazione fatture, categorizzazione movimenti,
riconciliazione bancaria, riconciliazione carte, assegnazione automatica cliente/fornitore,
rilevamento duplicati, termini di pagamento automatici, alert scadenze e altri — e **13
operatori** fra cui *contiene*, *inizia con*, *maggiore di* e **regex**. L'ambito seleziona su
cosa agisce la regola: solo fatture, solo transazioni bancarie, solo movimenti carta o tutti.
Ogni regola espone le proprie statistiche di esecuzione: data dell'ultima esecuzione, numero di
esecuzioni, documenti trovati. [OSSERVATO]

C'è una contraddizione interna minore: la priorità è descritta come «le regole con priorità più
alta vengono applicate prima», mentre un suggerimento dice «l'ordine delle regole conta: la
prima regola che corrisponde viene applicata». Le due frasi insieme implicano una semantica
*first-match-wins* ordinata per priorità, ma nessuna delle due lo dice esplicitamente. [DEDOTTO]

### 2.8 Adempimenti fiscali inclusi nel prodotto base (5 schermate)

Da tenere distinti dal modulo a pagamento *F24 Facile*, trattato al capitolo 3.

#### Prospetto IVA (Base) — `/prints/vat-overview`

Il suffisso «(Base)» nel titolo è già una dichiarazione di listino: esiste una versione non
base. [DEDOTTO]

*Colonne:* Mese · IVA Pagata · IVA Dovuta · **IVA Autofatture** · Saldo IVA · N. Fatture · Stato.

*Azioni:* Visualizza Mese · **Correggi Data IVA** · Esporta · **Inserisci Valori Definitivi** ·
Includi Previsioni · Cambia Anno · Visualizza Fattura · Ripristina Data IVA · Stampa.

Due meccanismi interessanti. Il primo è il `vatDateOverride`, citato col nome tecnico dentro il
testo per l'utente: sposta la competenza IVA di una fattura in un altro mese senza toccarne la
data. Il secondo è la coppia **provvisorio/definitivo**: i valori calcolati dal sistema
convivono a video con i valori definitivi comunicati dal commercialista, mostrati affiancati.
[OSSERVATO] È il riconoscimento esplicito che il commercialista resta l'autorità sul dato
fiscale e che il prodotto stima. [DEDOTTO]

#### Ritenute d'Acconto — `/withholdings`

*Campi:* Fattura\* · Importo Ritenuta\* · Data\* · Tipo\* · **Direzione**\* · Aliquota\* · Data
Scadenza · Importo Base. *Colonne:* ID · Data · Fattura · Fornitore · Tipo · Importo · Direzione ·
Aliquota · Scadenza · Stato. *Azioni:* Aggiungi Ritenuta · Segna come Saldata · Segna come
Pendente · Filtra per Direzione · Cerca.

La **direzione** distingue le ritenute «da pagare» (operate da te su fatture passive) da quelle
«da ricevere» (operate dai clienti sulle tue attive).

#### Report Ritenute F24 — `/prints/withholding-f24`

*Colonne:* Numero Fattura · Data Fattura · Fornitore · Partita IVA · Imponibile · Aliquota ·
Importo Ritenuta · Scadenza · Stato. *Azioni:* Filtra · Esporta · Genera Anteprima · Stampa ·
Filtra per Stato.

Il **codice tributo 1040** è cablato nella descrizione, e la scadenza è calcolata al 16 del mese
successivo al pagamento della fattura. [OSSERVATO]

#### Deleghe F24 — `/transactions`

Non una pagina ma un tab dei movimenti bancari. *Azioni:* Sposta in Deleghe F24 · Riporta ai
Movimenti · Riconcilia. La delega si riconcilia con ritenute, altre uscite o uscite ricorrenti.

#### Fatture Extra-UE — `/invoices`

Sezione descrittiva senza campi né azioni proprie: spiega che il flag Cross Country «Extra-UE»
produce il trattamento ad autofattura in reverse charge e fa riconciliare **sull'imponibile
netto invece che sul lordo**. Nel popup di riconciliazione compaiono entrambi gli importi.

### 2.9 Stampe e report (9 schermate)

Tutti sotto `/prints/*`, tutti con lo stesso impianto: filtri, «Genera Anteprima», export Excel o
PDF, spesso export CSV separato, e stampa. Le card KPI in testata sono ricorrenti.

#### Report Riconciliazione Pagamenti — `/prints/payment-reconciliation`

*Colonne:* Data · Tipo · Descrizione · **Dare** · **Avere**. È l'unico punto dell'intera guida in
cui compare la terminologia della partita doppia, e riguarda solo l'impaginazione del report.
[OSSERVATO] Filtra per **data di pagamento**, non per data fattura, e ogni documento mostra sotto
di sé i pagamenti collegati con il metodo usato (Banca, Carta, Gateway, Ritenuta, Compensazione).

#### Report Movimenti Bancari Aperti — `/prints/open-bank-movements`

*Colonne:* Data · Descrizione · Conto Bancario · Tipo · Importo · **Riconciliato** · **Residuo** ·
**Fatture Collegate**. *Azioni:* Filtra · Esporta · Genera Anteprima · Filtra per Tipo · Solo
Aperti · Stampa · Esporta CSV. Le date predefinite coprono il mese precedente.

#### Report Movimenti Carta Aperti — `/prints/open-creditcard-movements`

Stesse colonne con Carta di Credito al posto del conto; per la valuta estera mostra l'importo in
euro come principale e l'originale sotto.

#### Report Fatture Aperte — `/prints/open-invoices`

*Colonne:* Numero Fattura · Data · Data Scadenza · Cliente/Fornitore · Tipo · Stato · Importo ·
Riconciliato · Residuo. Gli stati enumerati sono sei: **Pagata, Parzialmente pagata, In scadenza,
Non pagata, Scaduta, In attesa**. *Azioni:* Filtra · Esporta · Genera Anteprima · Filtra per Tipo ·
Solo Aperte · Solo Scadute · Stampa.

#### Report Incongruenze Fatture — `/prints/invoice-inconsistencies`

Il report più insolito del gruppo: cerca fatture il cui **stato dichiarato non corrisponde ai
pagamenti registrati** — segnate pagate senza pagamenti collegati, oppure ancora aperte ma di
fatto saldate — e permette di correggerle dal report stesso.

*Colonne:* Numero Fattura · Data · Cliente/Fornitore · Tipo · **Stato Attuale** · Importo ·
Importo Pagato. *Azioni:* Filtra · Esporta · **Correggi** · **Correggi Tutti** · Aggiorna ·
Stampa.

Le fatture marcate pagate a mano finiscono in una sezione informativa separata e **non sono
correggibili automaticamente**: il prodotto riconosce l'intervento umano come autorevole e non
lo sovrascrive. [OSSERVATO] L'esistenza stessa di questo report ammette che gli stati possono
divergere dai fatti. [DEDOTTO]

#### Report DSO/DPO Clienti e Fornitori — `/prints/dso-dpo`

*Colonne:* Cliente/Fornitore · Totale Fatturato · Termini di Pagamento · Giorni Termine ·
**DSO/DPO Ponderato** · **DSO/DPO Puro** · Differenza · Stato Performance.

La distinzione fra media **ponderata per importo** e media **aritmetica semplice** è esposta
all'utente come due colonne affiancate. Lo stato performance ha quattro valori — Migliore,
Peggiore, In linea, Sconosciuto — con una semantica invertita fra le due entità, dichiarata:
«per i clienti *Migliore* significa che pagano prima del termine; per i fornitori *Migliore*
significa che paghi dopo il termine». I soggetti senza fatturato sono esclusi per non falsare le
medie. [OSSERVATO]

#### Report Controllo Tesoreria — `/prints/treasury-control`

Proiezione giornaliera dei saldi con margine di fido e stima degli interessi passivi. Orizzonti
7, 14, 30, 60 o 90 giorni, data di inizio personalizzabile, vista con o senza dettaglio per
conto. La stampa si impagina automaticamente a **10 colonne per pagina** e l'export Excel è
multi-foglio (consolidata, dettaglio conti, riepilogo).

#### Report Incassi Previsti — `/prints/expected-collections`

*Colonne:* Data Scadenza · Controparte · Descrizione · Codice Ordine · **Fonte** · Stato ·
Importo · Direzione. La fonte distingue *Fattura* da *Ordine*: il report unisce crediti già
fatturati e incassi solo pianificati. Esiste una modalità «Entrambi» in cui compare la colonna
Direzione.

#### Report Fatture Previste — `/prints/expected-invoices`

Fatture pianificate dagli ordini e non ancora emesse. *Colonne:* Data Fattura · Controparte ·
Descrizione · Imponibile · Aliquota IVA · Totale Lordo · Stato (Da Emettere, Emessa, Annullata).
Un suggerimento propone di usarlo per **stimare l'IVA attesa** confrontando vendite e acquisti
previsti. Le righe senza data prevista finiscono sotto «Data non impostata».

### 2.10 Ordini e pianificazione dei ricavi (3 schermate)

#### Pianificazione Ordini — `/revenue/orders`

Commesse in entrata e in uscita con piano di fatturazione a righe.

*Campi:* Titolo\* · Tipo\* · Stato\* · Controparte · Importo Totale · Aliquota IVA · Codice
Ordine · Data Inizio · Data Fine · Categoria · Note · Data Conferma · Descrizione.

*Azioni:* Crea Ordine · Aggiungi Piano · Collega Fattura · Modifica Ordine · Elimina Ordine ·
Cambia Direzione · Filtri Avanzati · Crea Controparte Rapida · Modifica Riga · Duplica Riga ·
Scollega Fattura · Aggiungi Riga · Elimina Riga.

Gli stati sono cinque: bozza, confermato, parzialmente fatturato, completato, annullato, e
transitano da soli in base alle fatture collegate. Il piano non è editabile finché l'ordine è in
bozza. Le righe alimentano a valle la Pianificazione Pagamenti e il Calendario Fatturazione.
[OSSERVATO]

#### Pianificazione Pagamenti — `/revenue/payment-planning`

*Colonne:* Data Prevista · Ordine · Controparte · Descrizione · Importo · Stato (atteso,
fatturato, incassato/pagato). *Azioni:* Visualizza Timeline · Filtra per Controparte · Modifica
Voce · **Aggiungi Voce Manuale** · **Sposta Data** · Aggiorna · Cambia Direzione · Elimina Voce
Manuale · Naviga per Mese.

«Sposta Data» esiste per registrare il ritardo comunicato da un cliente senza alterare l'ordine:
la previsione è un oggetto modificabile a mano. [DEDOTTO]

#### Calendario Fatturazione — `/revenue/invoice-calendar`

Calendario visuale delle fatture da emettere, generato dagli scadenzari degli ordini, con codice
colore a tre stati: **grigio** da emettere, **verde** emessa e collegata, **rosso** in ritardo.

*Colonne:* Data · Origine · Codice Ordine · Controparte · Descrizione · Imponibile · Importo
Lordo · Stato. *Azioni:* Vedi Calendario · Monitora lo Stato · Cambia Vista Incassi/Pagamenti ·
Aggiungi Fattura Manuale · Collega Fattura · Scollega Fattura · Naviga tra i Mesi · Vedi
Dettaglio · Modifica Fattura Manuale · Elimina Fattura Manuale.

Le righe generate dagli ordini non sono eliminabili dal calendario, solo quelle manuali.
Collegando una fattura, quelle di importo corrispondente sono evidenziate in verde e mostrate
per prime.

### 2.11 Solleciti di pagamento (3 schermate)

Il sistema è a **tre livelli** con nomi propri: *1° Gentile* (badge blu), *2° Follow-up* (badge
giallo), *3° Urgente* (badge rosso). La guida lo descrive come «il tuo segretario automatico».

#### Dashboard Solleciti — `/reminders`

*Colonne:* Cliente · Email Destinatario · Step · Importo · N. Fatture · Data Programmata · Stato.

Gli stati sono otto: **In attesa, Da approvare, In invio, Inviato, Fallito, Annullato, Saldato,
Scaduto**. Il ciclo di vita passa per tre fasi dichiarate — generazione, approvazione, invio.

*Azioni:* Genera Solleciti · Approva Sollecito · Invia Subito · Annulla Sollecito · Reinvia
Sollecito · **Inoltra Sollecito** · Visualizza Log · Elimina Sollecito · Visualizza Dettagli ·
**Modifica Email prima dell'Invio**.

Il log registra anche **se il sollecito è stato aperto**, quindi c'è tracciamento della lettura.
[OSSERVATO] Esiste un tab «Saldati» per i solleciti le cui fatture sono state poi pagate.
Modificando l'indirizzo prima dell'invio lo si può salvare nel profilo cliente.

#### Impostazioni Solleciti — `/settings/reminders`

*Campi:* Sistema Abilitato · Lingua Predefinita · Fuso Orario · **Giorni di Grazia Standard** ·
**Giorni di Grazia Strategici** · Ritardo 1° Sollecito · Ritardo 2° Sollecito · Ritardo 3°
Sollecito · Giorni di Invio · Ora Inizio Invio · Ora Fine Invio · **Max Email Giornaliere** ·
Nome Mittente · Email di Risposta · e sei campi di piè di pagina: Nome Azienda, P.IVA,
Indirizzo, Telefono, Email, **IBAN**.

I clienti «strategici» hanno un periodo di grazia più lungo: la classificazione automatica per
volume di fatture ha quindi una conseguenza operativa concreta. [DEDOTTO] La finestra oraria, i
giorni della settimana e il tetto giornaliero di email sono tutti configurabili; la guida
raccomanda 5-7 giorni di grazia e l'IBAN nel piè di pagina. Se lo scheduler è sospeso compare un
avviso giallo in testa alla pagina.

#### Template Solleciti — `/settings/reminder-templates`

*Campi:* Oggetto\* · Corpo Email\* (editor WYSIWYG) · Livello Sollecito\* · Lingua\*. Ogni
combinazione livello + lingua ha un template indipendente, creato al primo salvataggio se
mancante.

Le variabili citate sono in due notazioni diverse nello stesso testo — `{{clientName}}`,
`{{invoiceNumber}}`, `{{amount}}`, `{{dueDate}}` in camelCase e `{{customer_name}}`,
`{{total_due}}`, `{{company_name}}`, `{{invoices_table}}` in snake_case. Almeno una delle due
liste è sbagliata. [OSSERVATO] La più probabile corretta è la snake_case, perché è quella
attribuita alla barra laterale che le inserisce col clic. [IPOTESI]

### 2.12 Account, abbonamento e supporto (6 schermate)

#### Profilo Utente — `/settings/profile`

*Campi:* Nome\* · Cognome\* · Lingua (Italiano o English) · Comunicazioni Marketing. *Azioni:*
Modifica Profilo · Cambia Password · Invita Membro · Cambia Ruolo · Rimuovi Membro · Annulla
Invito · **Visualizza Attività** · Visualizza Utilizzo · Copia Link Invito · Comunicazioni
Marketing.

I ruoli sono **due soli**: *Amministratore* e *Membro*. La guida suggerisce di usare «Membro»
per chi deve solo consultare, ma non dichiara alcun permesso di sola lettura: l'unica differenza
documentata è la gestione del team, più il Cestino dei movimenti visibile ai soli
amministratori. [OSSERVATO] Esiste un registro attività cronologico di tutte le azioni del team.
L'invito si può recapitare via email o via link copiato.

#### Statistiche Utilizzo — `/profile`

Sezione della pagina Profilo: totale registrazioni, registrazioni del mese e media mensile per
fatture, movimenti bancari, movimenti carta, pagamenti online, altre uscite e uscite ricorrenti.

#### Abbonamento — `/settings/subscription`

Piano corrente, confronto, **addon** e metriche d'uso. *Azioni:* Gestisci Piano ·
**Attiva/Disattiva Addon** · Visualizza Utilizzo · Riattiva Abbonamento. Gli addon nominati sono
il **modulo Retail** e il sistema **Solleciti**; quelli inclusi nel piano appaiono a €0 e non
sono disattivabili. È citato un prezzo **early-bird** scontato. Le metriche misurate sono utenti,
fatture, movimenti e spazio.

#### Gestione Piano — `/settings/manage-plan`

*Azioni:* Confronta Piani · Cambia Ciclo di Fatturazione · Seleziona Piano · Cancella
Abbonamento · Riattiva Abbonamento. L'annuale sconta «fino al 20%». L'upgrade è immediato, il
downgrade decorre a fine periodo; prima del cambio il sistema verifica che utenti, conti e
movimenti stiano nei limiti del nuovo piano.

#### Dati di Fatturazione — `/settings/billing`

*Campi:* Ragione Sociale\* · Partita IVA\* · Codice Fiscale · Email di Contatto · Indirizzo\* ·
Città\* · CAP\* · Provincia · **Codice SDI**\* · **PEC**\* · Paese. Il codice SDI è forzato in
maiuscolo, massimo 7 caratteri; la provincia due caratteri. Serve almeno uno fra SDI e PEC.

#### Ticket di Supporto — `/support`

*Azioni:* Crea Ticket · Rispondi · Chiudi Ticket. Rispondere a un ticket chiuso lo riapre
automaticamente.

### 2.13 Modulo Retail (8 schermate)

Trattato nel dettaglio al capitolo 3, essendo uno dei due moduli non esplorabili.

---

## 3. I due moduli non esplorabili

Qui la guida vale più di tutto il resto, perché descrive schermate che non si possono aprire. Il
menu di navigazione le dichiara entrambe come sezioni ad addon: `retailSection` → «Modulo
Retail» e `fiscalSection` → «F24 Facile». Il gate è lo stesso per tutte le voci: `requiresAddon`,
con il messaggio *«Questa funzionalità richiede l'attivazione di un componente aggiuntivo nel
tuo abbonamento. Puoi attivarlo dalla pagina abbonamento oppure contattare il tuo riferimento
commerciale»*, badge breve **«Richiede addon»** e pulsante **«Vai all'Abbonamento»**. [OSSERVATO]

### 3.1 Modulo fiscale (F24 Facile): confermato, NON è documentato nella guida

**La verifica richiesta dà esito positivo: nella guida non esiste una sola sezione dedicata al
modulo fiscale.** Nessuna delle 68 chiavi inizia per `fiscal`, e la stringa «fiscal» non compare
mai come chiave nel testo della wiki. Il sospetto era fondato. [OSSERVATO]

Il silenzio è tanto più notevole perché il modulo esiste eccome. Il menu ne elenca **sei voci**
sotto «F24 Facile»:

| Voce di menu | Rotta | Addon |
|---|---|---|
| F24 | `/fiscal/f24` | `f24_facile` |
| Debiti fiscali | `/fiscal/debts` | `f24_facile` |
| Rateizzazioni | `/fiscal/installment-plans` | `f24_facile` |
| Prospetto IVA (Base) | `/vat-prospectus` | **nessuno** |
| Ravvedimento | `/fiscal/ravvedimento` | `f24_facile` |
| Codici tributo | `/fiscal/tax-codes` | `f24_facile` |
| Strategia fiscale | `/fiscal/strategy` | `f24_facile` |

Il dettaglio che il **Prospetto IVA (Base)** sia collocato dentro la sezione a pagamento ma senza
`requiresAddon` è una scelta commerciale leggibile a occhio nudo: la voce gratuita fa da esca
dentro il menu del modulo che si vuole vendere, e il suffisso «(Base)» lascia intendere la
versione superiore. [DEDOTTO]

Poiché la guida tace, l'unica ricostruzione possibile viene dal codice. Il bundle contiene **107
riferimenti a endpoint `/api/fiscal/`**, quindi il modulo è pienamente implementato e spedito a
tutti i client, non solo a chi lo ha acquistato. [OSSERVATO] Da rotte ed etichette si ricava:

- **F24** (`/fiscal/f24`, `/fiscal/f24/new`, `/fiscal/f24/parse-pdf`, `/fiscal/f24-forms`) —
  compilazione di deleghe F24 con righe raggruppate per sezione, e **importazione da PDF** con
  parsing e fallback OCR. Messaggi presenti: «F24 creato da PDF — controlla i campi prima di
  salvare», «Impossibile leggere il PDF F24», «Impossibile creare l'F24: dati incompleti»,
  «F24 collegato al periodo IVA», «Collegamento automatico (modifica le righe IVA dell'F24 per
  cambiarlo)». [OSSERVATO]
- **Debiti fiscali** (`/fiscal/debts`, `/fiscal/debts/summary`) — registro delle posizioni verso
  l'erario. I tipi nominati sono **«Cartella di pagamento (AdER)»**, «Cartella di pagamento
  (importata da PDF)» e **«Avviso di accertamento»**, con campi «Codice atto / numero cartella»,
  «Data notifica», «Debito originario», «Debito residuo aperto», «Debito residuo rateizzato».
  Esiste un percorso di import da PDF: «Hai già il PDF di una cartella o di un avviso?».
  [OSSERVATO]
- **Rateizzazioni** (`/fiscal/installment-plans`, `/fiscal/installment-plans/risk-summary`,
  `/fiscal/installments/pending-for-cashflow`) — piani di dilazione con generazione delle rate
  («Genera subito le rate (consigliato)»), import del piano da PDF, e soprattutto un
  **risk-summary**. Compare l'avvertenza sulle **«Rottamazioni attive»**: *«Piani di definizione
  agevolata in corso. Una sola rata saltata fa decadere il beneficio»*. L'endpoint
  `pending-for-cashflow` dice che le rate fiscali future entrano nella previsione di cassa.
  [OSSERVATO]
- **Ravvedimento** (`/fiscal/ravvedimento/calculate`, `/eligible`, `/generate-f24`) —
  ravvedimento operoso: calcolo di sanzioni e interessi sui giorni di ritardo e **generazione
  automatica dell'F24 correttivo**, con navigazione diretta al nuovo documento. Etichette:
  «Giorni di ritardo per ravvedimento», «Genera F24 di ravvedimento», «F24 scaduti da
  regolarizzare», «IVA segnata come da ravvedere». [OSSERVATO]
- **Codici tributo** (`/fiscal/tax-codes`) — anagrafica ricercabile «per codice o descrizione».
  Accanto vive `/fiscal/legal-interest-rates` con un meccanismo di aggiornamento
  (`/refresh`, `/refresh-status`): i **tassi di interesse legale** sono mantenuti centralmente e
  aggiornati, non digitati dall'utente. Nel pannello di amministrazione esiste infatti la voce
  «Tassi legali». [OSSERVATO]
- **Strategia fiscale** (`/fiscal/strategy`, `/fiscal/leverage/summary`,
  `/leverage/simulate-non-payment`, `/leverage/simulate-installment-plan`) — **la schermata più
  interessante dell'intero prodotto**, e non è documentata da nessuna parte. Il titolo interno è
  *«F24 Facile / Fisco & Leva Finanziaria»* e il sottotitolo delle simulazioni è *«non pago /
  ravvedo / pago»* e *«rateizzazione alternativa»*. Le metriche esposte sono: Capitale residuo ·
  Sanzioni residue · Interessi residui · **Costo evitabile se estingui oggi** · **TAEG fisco
  medio** · Banca breve termine · Banca medio termine · **Premio rischio fisco** · **Strategia
  consigliata**, con due esiti nominati: **«Tieni il fisco»** e **«Rifinanzia con banca»**. C'è un
  confronto intitolato **«Fisco vs Banca»**, un **«Costo finanziario per posizione»** e persino
  **«Tempi reazione AE/AR»** (`/fiscal/response-times/stats`), con un'affidabilità della stima a
  tre livelli (alta, media, bassa). [OSSERVATO]

Che cosa significa: il modulo tratta il debito fiscale come una **fonte di finanziamento da
confrontare con il credito bancario**, ne calcola il tasso effettivo comprensivo di sanzioni e
interessi, vi somma un premio per il rischio di riscossione stimato sui tempi di reazione
dell'Agenzia, e consiglia se convenga tenere il debito o estinguerlo con denaro preso in banca.
[DEDOTTO] È un posizionamento molto aggressivo, e spiegherebbe da solo perché la funzione non
compare nella guida rivolta all'utente. [IPOTESI]

### 3.2 Modulo Retail: documentato, sette schermate più una in arrivo

Al contrario del fiscale, il Retail è documentato per intero: sette sezioni operative più la
schermata «Registratore di Cassa» ancora da costruire. Il menu lo chiama «Modulo Retail» e
comprende anche una voce «Registro di Cassa».

Il modello di dominio è coerente e vale la pena enunciarlo per intero, perché è il vero
contenuto informativo del modulo: **incasso giornaliero → suddivisione per metodo di pagamento →
dettaglio per operatore POS → accredito atteso al netto delle commissioni → riscontro
sull'estratto conto**, con un ramo parallelo per il contante: **incasso in contanti → versamento
in banca → riscontro sull'estratto conto**. [DEDOTTO]

#### Dashboard Retail — `/retail/dashboard`

*Colonne (KPI):* Media Giornaliera · **% Contanti** · **% Elettronico** · Commissioni Mensili ·
**Contanti da Versare** · **Accrediti in Attesa** · Riconciliati · **Varianza Previsione**.

*Azioni:* Seleziona Mese · Visualizza KPI.

La varianza fra previsione e incassi effettivi ha soglie dichiarate: verde ≤5%, giallo ≤15%,
rosso >15%. [OSSERVATO]

#### Incassi Giornalieri — `/retail/daily-sales`

Il libro cassa digitale, presentato come equivalente del rapporto Z del registratore.

*Campi:* Data Lavorativa\* · **Incasso Contanti Lordo** · **Incasso Carte Lordo** · **Altri
Incassi Lordo** · Note. *Colonne:* Data · Contanti · Elettronico · Altro · Totale · Stato.

*Azioni:* Aggiungi Giornata · Modifica Giornata · **Finalizza Giornata** · **Riapri Giornata** ·
Elimina Giornata · **Gestisci Dettaglio POS**.

Due elementi rilevanti. Il primo è il ciclo **Aperto → Finalizzato**, con la giornata finalizzata
bloccata da modifiche e non eliminabile, ma **riapribile**: c'è una chiusura contabile ma è
reversibile. [OSSERVATO] Il secondo è il **tender split**, la ripartizione dell'incasso carte fra
più operatori POS, che è ciò che rende calcolabili gli accrediti attesi. Gli «Altri Incassi»
includono esplicitamente i buoni pasto. La rotta API sottostante è `/retail/z-reports`, quindi il
nome interno del concetto è proprio lo Z-report. [OSSERVATO]

#### Versamenti Contanti — `/retail/deposits`

*Campi:* Data Versamento\* · Importo Totale\* · Conto Bancario · **Riferimento** (numero della
distinta) · Note. *Colonne:* Data · Importo · Conto Bancario · Riferimento · Stato.

*Azioni:* Crea Versamento · Modifica Versamento · **Segna come Depositato** · Elimina Versamento ·
Filtra per Stato.

Gli stati sono cinque: **Pianificato, Versato, Riconciliato, Eccezione, Annullato**. Modifica,
conferma ed eliminazione sono possibili **solo in stato Pianificato**: una volta confermato, il
versamento è immutabile. [OSSERVATO]

#### Operatori POS — `/retail/operators`

*Campi:* Nome Operatore\* · **Politica di Accredito**\* · **Commissione Percentuale** (in punti
base: 150 = 1,50%) · **Commissione Fissa per Transazione** (in centesimi) · **Canone Mensile** ·
Conto di Accredito · Attivo. *Colonne:* Nome · Accredito · Commissioni · Conto di Accredito ·
Stato.

Gli operatori nominati come esempio sono **Nexi, SumUp e Axerve**. Le politiche di accredito sono
tre: **T+N** (dopo N giorni, con opzione «giorni lavorativi»), **Settimanale** (in un giorno
fisso della settimana) e **Mensile** (in un giorno fisso del mese). [OSSERVATO] L'uso dei punti
base e dei centesimi per le commissioni segnala che gli importi sono tenuti in interi, non in
decimali. [DEDOTTO] Cambiando operatore la guida raccomanda di disattivare il vecchio invece di
cancellarlo, per non perdere lo storico.

#### Accrediti Attesi — `/retail/settlements`

*Colonne:* Data Prevista · Operatore · **Periodo Coperto** · **Lordo** · **Commissioni** · **Netto
Atteso** · Stato.

*Azioni:* **Genera Accrediti** · Segna come Contabilizzato · **Segna Eccezione** · Visualizza
Dettaglio · Filtra per Stato.

Cinque stati con colore: **Atteso** (blu), **Registrato** (giallo), **Riconciliato** (verde),
**Eccezione** (rosso), **Annullato** (grigio). I motivi di eccezione sono enumerati e sono sei:
**Mancante, Importo diverso, Data diversa, Duplicato, Commissione cambiata, Parziale**.
[OSSERVATO] La tassonomia delle eccezioni è la parte più matura del modulo: sono le cose che
davvero vanno storte con un acquirer, e «Commissione cambiata» in particolare presuppone che il
prodotto si aspetti che gli operatori modifichino le condizioni senza preavviso. La guida
suggerisce infatti di usare le eccezioni «per negoziare le commissioni con l'operatore».
[DEDOTTO]

#### Riconciliazione Retail — `/retail/reconciliation`

*Azioni:* Seleziona Mese · Abbina Movimento · Visualizza Pendenti · **Visualizza Suggerimenti**.

Ha un motore di suggerimento proprio, separato da quello della Riconciliazione Assistita, con
punteggio di confidenza 0-100% e due scarti espliciti: **Δ importo** e **Δ giorni**. La sezione
pendenti è divisa in due tab, «Accrediti POS» e «Versamenti Contanti». [OSSERVATO] Che esistano
due motori di matching distinti nello stesso prodotto è un fatto architetturale non banale.
[DEDOTTO]

#### Previsioni di Vendita — `/retail/forecast`

*Campi:* Nome Modello\* · **Metodo di Calcolo**\* · **Pesi Giorni Settimana** · **Periodo di
Calcolo** (30, 60 o 90 giorni, solo per i metodi «Media mobile» e «Ibrido»).

*Azioni:* Crea Modello · Modifica Modello · Elimina Modello · **Aggiungi Aggiustamento** ·
Elimina Aggiustamento.

I metodi citati sono media mobile, media ponderata, regressione e un metodo «Ibrido». I pesi per
giorno della settimana sono espliciti (l'esempio è Sabato 1.5, Martedì 0.8) e gli aggiustamenti
manuali servono per eventi (l'esempio è +30% per il Black Friday, −100% per un giorno di
chiusura). Si possono tenere più modelli attivi e confrontarli. [OSSERVATO]

#### Registratore di Cassa — `/retail/cash-register`

Sezione di una riga: funzionalità **dichiaratamente non ancora sviluppata**, con rimando alle
«Vendite Giornaliere» come ripiego. È l'unico posto in cui la guida documenta qualcosa che non
esiste. Da notare che la chiama «Vendite Giornaliere» mentre la pagina reale si chiama «Incassi
Giornalieri»: un residuo di una denominazione precedente. [OSSERVATO]

---

## 4. Catalogo dei messaggi di errore

Nel bundle ci sono **598 stringhe distinte** che iniziano con un marcatore di guasto o di blocco
(«Errore», «Impossibile», «Non è possibile», «Non puoi», «Hai raggiunto», «Formato», «Nessun…»).
Non ha senso elencarle tutte; conta la struttura. [OSSERVATO]

### 4.1 Il dizionario centrale: nove classi di guasto

Esiste un unico oggetto che mappa le categorie di errore HTTP su messaggi in italiano, con un
registro deliberatamente non tecnico:

| Chiave | Messaggio |
|---|---|
| `generic` | Si è verificato un errore. Riprova più tardi. |
| `unauthorized` | Sessione scaduta. Effettua nuovamente l'accesso. |
| `forbidden` | Non hai i permessi per eseguire questa operazione. |
| `notFound` | L'elemento richiesto non è stato trovato. |
| `validation` | I dati inseriti non sono validi. Controlla e riprova. |
| `conflict` | L'operazione non può essere completata perché esiste un conflitto. |
| `serverError` | Si è verificato un problema con il server. Riprova più tardi. |
| `networkError` | Impossibile connettersi al server. Verifica la tua connessione. |
| `timeout` | La richiesta ha impiegato troppo tempo. Riprova. |

Nessuno espone codici di stato, stack o identificativi di correlazione all'utente. [OSSERVATO]

### 4.2 Il dialogo d'errore raccoglie prove e apre un ticket

La parte più notevole è ciò che sta attorno al messaggio. Il dialogo di errore ha titolo *«Si è
verificato un errore»*, una descrizione che invita ad aprire un ticket, una sezione **«Dettagli:»**
e un pulsante **«Apri Ticket»**. Due frasi accompagnano il pulsante:

> «Aprendo un ticket, le informazioni sull'errore verranno incluse automaticamente per facilitare
> la risoluzione.»
>
> «Screenshot e log della console verranno allegati automaticamente al ticket.»

Il prodotto cattura quindi **uno screenshot della pagina e i log della console** e li invia al
supporto insieme alla segnalazione. [OSSERVATO] È una scelta ottima per il tempo di risoluzione e
delicata per la riservatezza, visto che lo screenshot di una schermata di tesoreria contiene
saldi, IBAN e nomi di controparti. Il testo avvisa, ma non risulta che offra di disattivarlo.
[DEDOTTO]

### 4.3 Errori che sono in realtà regole di business

Alcuni messaggi dicono più della documentazione, perché enunciano vincoli che nessuna sezione
della guida menziona:

- «Non è possibile aggiungere un pagamento bancario a una fattura già pagata con carta di
  credito» — i metodi di pagamento sulla stessa fattura si escludono a vicenda.
- «Non puoi eliminare una giornata finalizzata» — conferma il blocco del ciclo di cassa retail.
- «Il residuo non può superare il totale» — vincolo sui debiti fiscali.
- «Non puoi cambiare azienda perché la tua azienda attuale ha altri membri. Rimuovili prima o
  chiedi al proprietario di eliminare l'azienda.»
- «Debito già presente», «F24 duplicato», «Gruppo marcato come valido: non riapparirà più».

### 4.4 Limiti di piano, comunicati come errori

I limiti commerciali sono veicolati dallo stesso canale degli errori tecnici, con un invito
all'upgrade incorporato e il valore del limite interpolato:

- «Hai raggiunto il limite di conti bancari ({{limit}}). Passa a un piano superiore per
  aggiungerne altri.»
- «Hai raggiunto il limite di utenti ({{limit}}). Passa a un piano superiore per invitare altri
  membri.»
- «Hai raggiunto il limite mensile di movimenti ({{limit}}/mese). Passa a un piano superiore per
  continuare.»

Le tre grandezze contingentate sono dunque **conti bancari, utenti e movimenti al mese**, e i
movimenti sono l'unica misurata su base mensile. [OSSERVATO]

### 4.5 Errori di importazione: diagnostici, non generici

L'area import ha il vocabolario d'errore più curato di tutto il prodotto, con messaggi che
suggeriscono la contromossa invece di limitarsi a constatare:

- «Il file potrebbe essere un'immagine scannerizzata o protetto. Prova con un PDF testuale o
  esporta i movimenti in formato CSV/Excel.»
- «Formato PDF complesso rilevato. Usa la mappatura visuale per selezionare i campi.»
- «Formato file riconosciuto con parser generico. Verifica la mappatura delle colonne.»
- «Formato non standard rilevato. Sarà necessario mappare manualmente i campi.»
- «Formato non riconosciuto, provo lettura multi-carta…» — degradazione annunciata anziché
  fallimento.
- «Il file contiene più fogli. Seleziona il foglio con i movimenti della carta di credito.»
- «Errore durante il riconoscimento OCR del PDF», «Impossibile leggere lo ZIP {{filename}}».

I limiti di dimensione sono due e incoerenti fra loro: «Il file è troppo grande (max 10 MB)» in
un punto e «Dimensione massima: 5MB» in un altro. [OSSERVATO]

### 4.6 Granularità per operazione

Il grosso delle 598 stringhe è costituito da messaggi cuciti sulla singola azione — «Errore
nella creazione del sinonimo», «Errore nell'esecuzione della regola», «Errore calcolo
ravvedimento», «Errore nel collegamento all'altra uscita», «Errore durante l'unione dei
fornitori» — quasi sempre su toast, con fallback al messaggio dell'eccezione quando disponibile.
Il prodotto preferisce cento messaggi specifici a uno generico. [DEDOTTO]

---

## 5. Le cose più notevoli imparate dalla guida

Quattro osservazioni che dall'uso del prodotto non emergerebbero, o emergerebbero tardi e male.

### 5.1 L'incertezza del dato è un concetto di primo livello, esposto all'utente

Il prodotto non tratta i numeri futuri come un blocco unico. Cash Command classifica ogni
movimento su una scala a quattro gradi — **Consolidato** (già in banca), **Completo** (certo,
dalle fatture), **Previsto** (pianificato dagli ordini), **Provvisorio** (stimato dai ricorrenti)
— e quella scala non è documentazione interna: è un gruppo di pulsanti con cui l'utente decide
quanto rischio accettare nella propria previsione, fino alla vista prudenziale «Solo Consolidato
+ Certo». Lo stesso principio ricompare altrove con nomi diversi: il Prospetto IVA affianca
valori *provvisori* calcolati e valori *definitivi* del commercialista; la Riconciliazione
Assistita gradua le proposte in alta, media e bassa confidenza; la Riconciliazione Retail mostra
Δ importo e Δ giorni. È una posizione di progetto coerente e piuttosto rara: **dire quanto ci si
può fidare di ogni numero è parte della funzionalità**, non una nota a piè di pagina. [DEDOTTO]

### 5.2 Il modulo più ambizioso è quello che nessuno documenta

La guida copre 68 schermate, comprese quelle banali come «Ticket di Supporto», e copre per
intero il modulo Retail a pagamento. Ma del modulo fiscale «F24 Facile» — sei voci di menu, 107
endpoint nel bundle — **non dice una parola**. E la schermata taciuta più interessante è
«Strategia fiscale», che calcola un **TAEG del debito fiscale** comprensivo di sanzioni e
interessi, lo confronta con il costo del credito bancario a breve e a medio termine, aggiunge un
**premio per il rischio** stimato sui **tempi di reazione di Agenzia delle Entrate e Agenzia
Riscossione**, e conclude consigliando **«Tieni il fisco»** oppure **«Rifinanzia con banca»**.
Trattare l'erario come una linea di credito da ottimizzare è una tesi commerciale forte; che sia
implementata e insieme assente da ogni documentazione rivolta all'utente è il singolo fatto più
significativo emerso da questa lettura. [OSSERVATO per l'esistenza, IPOTESI sul perché del
silenzio]

### 5.3 Il prodotto sa di essere incoerente e ci ha costruito sopra una funzione

Esiste un intero report, «Incongruenze Fatture», il cui unico scopo è **trovare le fatture il cui
stato dichiarato non corrisponde ai pagamenti registrati** e correggerle in blocco con «Correggi
Tutti». Non è un caso isolato: le uscite ricorrenti hanno «Allinea all'Effettivo» per riscrivere
il piano sui pagamenti reali; gli altri costi hanno «Chiudi con Allineamento»; Cash Command ha
«Aggiorna Controparti» per ripopolare i campi rimasti vuoti. Il prodotto mette in conto che i
propri dati derivati divergano dai fatti e fornisce strumenti di riallineamento a posteriori
invece di prevenire la divergenza. Il dettaglio che chiude il ragionamento è che le fatture
**marcate pagate a mano sono escluse dalla correzione automatica**: l'intervento umano è trattato
come più autorevole del calcolo. [DEDOTTO]

### 5.4 Il grosso della complessità sta nell'ingerire dati, non nell'elaborarli

Sette schermate su 68 sono dedicate all'importazione, e sono le più dettagliate della guida: un
wizard a sei passi per gli estratti conto, mappatura visiva delle aree su PDF, OCR di fallback,
lettura di XML di fattura elettronica anche firmati P7M e dentro archivi ZIP, concatenazione
automatica di più Excel sotto un'unica intestazione, riconoscimento della notazione decimale
italiana e dei negativi fra parentesi, dialogo di risoluzione dei conflitti fra i valori del file
e i predefiniti dell'anagrafica, audit post-import che confronta il totale del file col totale
importato, elenco delle righe scartate con il motivo di ciascuna, e rollback completo
dell'importazione sbagliata. Attorno a tutto questo c'è un secondo apparato: i **sinonimi**, che
tracciano perfino la propria provenienza (Manuale, Riconciliazione, Unione) e si generano da soli
quando si fondono due anagrafiche o si approva un abbinamento con nome diverso. Il messaggio
implicito è che in questo mercato la difficoltà non è calcolare il cash flow, ma **far entrare
dati puliti da fonti che non collaborano**: banche con tracciati diversi, PDF ministeriali,
acquirer POS, e clienti il cui nome è scritto in quattro modi. [DEDOTTO]

---

*Fonti su disco: `ck-guida-grezza.txt` (testo della wiki, 68 sezioni), `ck-bundle.js` (registro
delle 68 pagine con rotte, dizionario di navigazione con 111 etichette, catalogo errori, rotte
API dei moduli a pagamento). Nessuna richiesta di rete effettuata verso cashking.biz.*

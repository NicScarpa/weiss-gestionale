# Trezy — Documenti: fatture, scadenzario, aging, riconciliazione, anagrafiche

> Osservazione dell'11 agosto 2026 su ambiente **di produzione**, account reale, piano
> **Premium in prova**, in **sola lettura**: nessun documento è stato caricato, verificato,
> modificato o collegato a una transazione. Le denominazioni di fornitori e clienti, i numeri
> di documento e le coordinate bancarie non sono riportati: dove servono, sono sostituiti da
> perifrasi. Gli importi aggregati sono riportati integralmente perché servono a rendere
> verificabili i calcoli.
>
> Rotta osservata: `/document`. Fonti: dump delle schermate, tracce API con corpi di risposta
> completi, screenshot, più la base di conoscenza del produttore raccolta in fase 0.

---

## 1. In sintesi

L'area Documenti è, sul piano dell'ingegneria, la più solida del prodotto: acquisizione
multicanale con estrazione asincrona, aging a quattro fasce aritmeticamente corretto,
scoring del cliente, riconciliazione documento↔transazione e un aggancio esplicito al
previsionale di cassa. È anche, sul piano dell'esperienza, quella in cui la distanza fra
**ciò che il backend sa** e **ciò che l'interfaccia mostra** è più larga.

Tre esempi misurati su questo account, tutti sviluppati più avanti:

- delle 249 fatture presenti, **147 rientrano nelle tre card di testata e 102 no** — sono
  quelle a cui l'estrazione non ha attribuito una data di scadenza, che finiscono in uno stato
  privo di rappresentazione grafica;
- **4 fatture ancora esposte come «Scaduto»** hanno in archivio una transazione bancaria di
  importo identico al centesimo, già associata ma non confermata: 6.431,03 € di scaduto
  apparente che il sistema ha già riconosciuto e che nessuno ha chiuso;
- il motore di estrazione emette per ogni documento un giudizio di affidabilità
  (`TRUST` / `REVIEW`): **13 documenti su 98 sono marcati `REVIEW`**, e nell'elenco appaiono
  identici a tutti gli altri.

---

## 2. Impianto dell'area

`[OSSERVATO]` La rotta `/document` ospita tre schede: **Fatture** · **Fornitori** · **Clienti**,
più un pulsante `+` che apre l'aggiunta delle schede opzionali (§ 10). In alto a destra due
comandi: un'icona busta con badge numerico e un pulsante **Carica** a discesa.

`[DEDOTTO]` Il badge sulla busta è il contatore dei documenti arrivati tramite l'indirizzo
email dedicato: sta accanto al comando di caricamento e l'unica altra sorgente di documenti è
appunto l'inoltro per posta.

---

## 3. Le tre card di testata

`[OSSERVATO]` La testata è occupata da tre riquadri, ciascuno con conteggio, importo e un
pulsante **FILTRA**.

| Card | Conteggio | Importo | Sottotesto |
|---|---|---|---|
| **Pagato** | 26 fatture | 28.962 € | «Incassato» · 27 % del totale |
| **Scaduto** | 109 fatture | −70.957 € | aging a quattro fasce |
| **In arrivo** | 12 fatture | 7.330 € | «Scadenza 29 Aug» · 7 % del totale |

Le quattro fasce di aging: **0-30g** 8.258 € · **30-60g** 13.953 € · **60-90g** 9.354 € ·
**90+g** 39.392 €.

`[OSSERVATO]` Il pulsante **FILTRA** su ciascuna card applica il filtro corrispondente alla
lista sottostante. È il tratto di design migliore della schermata: **il KPI non è un numero
da guardare, è un punto d'ingresso alla lista**. Un utente che vede «109 fatture scadute» è a
un clic dall'elenco delle 109, senza passare da un pannello di filtri.

### 3.1 Verifica aritmetica delle fasce di aging

**Test 1 — le quattro fasce sommano al totale scaduto?**

```
8.258 + 13.953 + 9.354 + 39.392 = 70.957 €    contro «−70.957 €» mostrato
```

✔ **superata**, alla cifra intera. La verifica regge anche al centesimo sui valori grezzi
restituiti dal servizio fatture:

```
8.258,01 + 13.953,16 + 9.353,76 + 39.391,65 = 70.956,58 €    = totale scaduto restituito
```

**Test 2 — i conteggi delle fasce sommano al conteggio totale?**

```
16 + 13 + 12 + 68 = 109    = fatture scadute
```

✔ **superata**.

`[OSSERVATO]` Un dettaglio che la verifica fa emergere: il servizio distingue, dentro ogni
fascia, una componente in entrata e una in uscita. Nelle due fasce più vecchie la componente
in entrata non è nulla (202,92 € nella 60-90g, 93,65 € nella 90+g) e **l'interfaccia le somma
alle uscite invece di compensarle**: 9.150,84 + 202,92 = 9.353,76 → «9.354 €».
`[DEDOTTO]` Quelle componenti sono note di credito da fornitore: l'archivio contiene 249
documenti tutti di acquisto e almeno uno è tipizzato come nota di credito con totale negativo.
Sommate invece che sottratte, **gonfiano leggermente lo scaduto**. Sono 296 € su 70.957 €,
irrilevanti in valore; il difetto è di metodo, non di importo.

### 3.2 Verifica della base delle percentuali

**Test 3 — su che cosa è calcolato il «% del totale»?**

Non sui 249 documenti, come la dicitura lascerebbe intendere, ma sulla somma delle tre card:

```
28.961,71 / (28.961,71 + 70.956,58 + 7.329,68) = 28.961,71 / 107.247,97 = 27,00 %   → «27 %»  ✔
 7.329,68 / 107.247,97                                                  =  6,83 %   → «7 %»   ✔
```

✔ **superata**. `[DEDOTTO]` «% del totale» significa «quota sui documenti classificati», non
«quota sul portafoglio». Con 102 documenti fuori dalla classificazione (§ 3.3), la percentuale
è calcolata su una base più piccola di quella che l'utente ha in mente e sovrastima ogni quota.

### 3.3 Il buco nella copertura: 102 documenti su 249 non compaiono in nessuna card

**Test 4 — le card coprono l'archivio?**

```
26 (pagate) + 109 (scadute) + 12 (in arrivo) + 0 (parzialmente pagate) = 147
totale documenti = 249  ⇒  102 documenti (41 %) non sono in nessuna card
```

✘ **non superata**, e la risposta del servizio fatture spiega perché. Gli stati restituiti sono
quattro — `paid`, `late`, `incoming` e un quarto, **`unpaid`**, che non ha né card né colore né
filtro dedicato. `[OSSERVATO]` Nel primo blocco di 100 documenti restituito dall'API, `unpaid`
raccoglie **42 documenti per 63.958,75 € di esposizione**, e la corrispondenza con l'assenza
della data di scadenza è **perfetta: 42 documenti su 42 privi di `due_date`**, contro 32 su 32
scaduti e 12 su 12 in arrivo che la data ce l'hanno.

`[DEDOTTO]` La regola implementata è quindi: **se l'estrazione non trova la data di scadenza,
la fattura esce dal radar**. Non è segnalata come incompleta, non è nell'aging, non alimenta il
previsionale, e non ha un pulsante che la porti a galla. È il difetto più serio dell'area,
perché non si manifesta come errore ma come **silenzio**: la testata resta credibile e completa
mentre due quinti dell'archivio non sono rappresentati.

---

## 4. La tabella delle fatture

`[OSSERVATO]` Colonne: **TIPO · FORNITORE · CLIENTE · STATO · DATA · PAGAMENTO PREVISTO ·
IMPORTO · AZIONI**. Ordinamento predefinito su DATA discendente (freccia ↓ esplicita); tutte le
altre colonne portano l'indicatore ↕ e sono quindi ordinabili. Un comando **Colonne** consente
di configurare quali mostrare, e un'icona `?` a destra apre — `[DEDOTTO]` dalla posizione e
dall'iconografia a tastiera — l'elenco delle scorciatoie.

`[OSSERVATO]` Sopra la tabella, tre tab con contatore: **Tutto 249 · Acquisto 249 · Vendita 0**,
una casella «Cerca documenti…», tre filtri a discesa — **Tipo di documento**, **Importo**,
**Data** — un menu **Analisi**, e un contatore evidenziato **«249 da verificare»**.

`[OSSERVATO]` Il contatore dei non verificati coincide con il totale dei documenti: sull'account
osservato **nessuna fattura è mai stata verificata**, il che si riflette nella risposta dell'API
(campo di verifica falso su tutti i documenti del blocco esaminato). La verifica è un'azione
umana, per documento, e resta il collo di bottiglia dichiarato dell'intero impianto: le schede
Fornitori e Clienti ripetono l'avviso «non verificato» su ogni riga.

`[OSSERVATO]` La colonna TIPO mostra due righe sovrapposte: la natura del documento («Invoice»)
e il verso («Acquisto»). `[OSSERVATO]` Il verso non è letto da un campo strutturato ma **dedotto
da un modello linguistico**: i metadati di ogni documento riportano la sorgente della direzione
come `llm`, la direzione rilevata, quella risolta, e un indicatore di conflitto fra le due.
Sull'account osservato il conflitto non si è mai presentato e la direzione risolta è sempre
«acquisto».

---

## 5. Lo stato con aging inline

`[OSSERVATO]` La cella STATO non contiene solo l'etichetta: contiene **l'età del ritardo**.
Le righe mostrano «Scaduto +117g», «Scaduto +123g», «Scaduto +6g», «Scaduto +11g»,
«Scaduto +1247g».

È una scelta di interfaccia notevole e va riconosciuta come tale. In uno scadenzario
tradizionale l'anzianità di un credito si legge o in una colonna dedicata o cambiando vista;
qui **il badge di stato porta con sé la gravità**, e la lista diventa scorribile per urgenza
senza ordinarla. Il costo cognitivo è nullo: l'utente legge «Scaduto» e, nello stesso colpo
d'occhio, quanto.

`[OSSERVATO]` Il caso limite è il **«+1247g»**: una fattura di utenze la cui data di pagamento
prevista risale a marzo 2023, ancora aperta. **Va marcato come dato storico anomalo, non come
scaduto operativo.** Sono oltre tre anni e quattro mesi; una posizione del genere è quasi
certamente già chiusa nella realtà e sopravvive qui come residuo di un caricamento massivo di
storico. `[IPOTESI]` L'account è stato popolato importando in blocco l'archivio elettronico
pregresso, e con esso sono entrate posizioni antiche che nessuno ha riconciliato.

Il punto per il prodotto è che **Trezy non fa questa distinzione**. La fascia «90+g» vale
39.392 €, il 55 % dello scaduto totale, ed è un contenitore senza fondo: dentro ci sono
insieme la fattura in ritardo di quattro mesi — che è un problema di tesoreria da gestire oggi —
e quella di tre anni fa, che è rumore d'archivio. Un'unica fascia aperta verso il passato rende
il KPI «Scaduto −70.957 €» **non azionabile senza un'ispezione manuale**: chi lo legge non sa
quanta parte sia recuperabile e quanta sia da archiviare. Le fasce, come confermato dalla fase 0,
sono cablate nel prodotto e non configurabili.

---

## 6. Il doppio importo per riga

`[OSSERVATO]` La colonna IMPORTO mostra due valori sovrapposti: il totale del documento in
grande e l'imponibile in piccolo, con il suffisso `excl.` — per esempio «€2.135,00 /
€1.750 excl.».

È l'informazione giusta nel posto giusto: chi ragiona di **cassa** guarda il lordo, chi ragiona
di **costo** guarda l'imponibile, e la riga serve entrambi senza aprire il documento. La
scomposizione dell'imposta è effettivamente presente nel dato (aliquota, imponibile e imposta
per ciascuna aliquota) su 97 documenti su 100 del blocco esaminato.

`[OSSERVATO]` Due difetti. Il primo è di localizzazione: `excl.` è un residuo inglese in
un'interfaccia italiana, coerente con la localizzazione incompleta osservata in tutto il
prodotto. Il secondo è più sostanziale: i metadati registrano su quale base l'estrazione ha
lavorato, e **su 14 documenti su 98 la base è il totale IVA compresa anziché l'imponibile**.
`[IPOTESI]` Su quei documenti l'imponibile mostrato è ricostruito per differenza anziché letto,
e quindi esposto all'errore di aliquota — l'aliquota predefinita delle categorie è del resto
il 20 %, non il 22 % italiano. Non verificabile senza aprire i singoli documenti, cosa che
l'osservazione in sola lettura non ha fatto.

---

## 7. Acquisizione dei documenti

### 7.1 I due canali

`[OSSERVATO]` **Pulsante «Carica»**, con campo di tipo file nella pagina. La fase 0 documenta i
formati accettati: PDF, PNG, JPG e XML fino a 10 MB.

`[OSSERVATO]` **Indirizzo email dedicato**, esposto in Impostazioni › Il mio profilo sotto
l'intestazione «Email caricamento fattura», nella forma
`factures-<primi 8 caratteri dell'identificativo di account>@reply.trezy.io`, accompagnato dal
testo: «Inoltra le fatture a questo indirizzo email per caricarle automaticamente. Questo
indirizzo email è univoco per il tuo account. Eventuali allegati PDF o immagini inviati a questo
indirizzo verranno elaborati automaticamente.»

Due osservazioni.

La prima è funzionale, ed è il pregio maggiore dell'area: **l'inoltro per posta elimina il
passaggio più fastidioso della gestione documentale**, cioè scaricare l'allegato e ricaricarlo
altrove. La fattura arriva nella casella aziendale, si inoltra, entra. È il canale che meglio
si adatta a un'impresa piccola senza un flusso strutturato.

La seconda è di forma: il prefisso è **`factures-`**, in francese, dentro un'interfaccia
italiana e su un indirizzo generato dal prodotto. `[DEDOTTO]` L'indirizzo è costruito da una
costante non localizzata, coerente con le altre tracce francesi trovate nel prodotto (il blocco
«Produits» delle impostazioni, le scritture su piano dei conti francese). È un dettaglio, ma è
un dettaglio che l'utente **deve digitare o inoltrare a mano**, quindi lo vede ogni volta.

`[NON VERIFICABILE]` Il comportamento del canale email non è stato provato: nessun messaggio è
stato inoltrato. Non sappiamo se accetti più allegati per messaggio, cosa risponda in caso di
formato rifiutato, se notifichi l'esito, né come si comporti in caso di duplicato.

### 7.2 L'elaborazione asincrona

`[OSSERVATO]` Nell'elenco compaiono righe in stato **«In elaborazione»** con il testo
«Estrazione dati dal documento…» al posto di fornitore e cliente, e segnaposto grigi al posto
di stato, date e importo. Al momento dell'osservazione erano due su 249.

È gestito bene. La riga **esiste già in lista** — non c'è una coda separata da consultare — e
mostra esattamente quali celle non sono ancora note. L'utente vede che il documento è arrivato,
che il sistema ci sta lavorando, e dove comparirà quando avrà finito.

`[OSSERVATO]` I tempi effettivi si leggono nei metadati di lavorazione: per i documenti
completati nella giornata, gli intervalli fra presa in carico e completamento vanno da circa
3 minuti a circa 15. `[DEDOTTO]` Non è un'estrazione istantanea: è una coda con latenza di
minuti, il che rende la scelta di mostrare la riga incompleta non un vezzo ma una necessità.

`[OSSERVATO]` La pipeline è visibile nei metadati: sorgente del documento, metodo di
elaborazione (`ocrv2_primary` su 98 documenti su 100; uno con metodo `ocr` semplice), e un
campo di errore. Un documento del blocco esaminato porta un errore esplicito che vale la pena
citare perché descrive il funzionamento interno meglio di qualsiasi documentazione:

> `ocr_v2 primary extraction: after 2 attempt(s): ocrv2 degenerate extraction:`
> `total_ttc=0.00 subtotal_ht=0.00 lines=1 verdict=REVIEW — retrying for a fresh draw`

`[DEDOTTO]` L'estrazione è **generativa e non deterministica**: il sistema riconosce
un'estrazione «degenerata» (totali a zero), la boccia, e **ritenta con un nuovo campionamento**
— «a fresh draw» è il vocabolario del campionamento da un modello, non dell'OCR classico.
Esiste quindi un controllo di sanità automatico con ripetizione. È un'ingegneria seria; è anche
la conferma che l'estrazione ha una variabilità intrinseca.

---

## 8. Qualità dell'estrazione: quello che il backend sa e non dice

### 8.1 Il giudizio di affidabilità esiste ed è nascosto

`[OSSERVATO]` Ogni documento porta nei metadati un **verdetto di affidabilità**: sui 100
documenti del blocco esaminato, **85 sono `TRUST`, 13 sono `REVIEW`**, 2 non hanno ancora un
verdetto perché in lavorazione. Accanto, un punteggio di confidenza sul tipo di documento e
l'indicazione dell'evidenza usata (il modello di estrazione).

**Nell'interfaccia non se ne vede traccia.** Le 13 fatture da rivedere appaiono in elenco
identiche alle 85 affidabili; il solo indicatore di qualità visibile è il contatore «249 da
verificare», che vale per tutte indistintamente e quindi non ordina nulla.

È lo spreco più evidente dell'area. La fase 0 documenta che il prodotto **sa** fare meglio: le
stringhe interne prevedono una verifica guidata campo per campo, innescata dai campi sotto
soglia di affidabilità («{{n}} campi estratti con bassa affidabilità. Avvia la verifica
guidata»). Il segnale c'è, il flusso è progettato, ma su questa schermata non arriva: l'utente
che volesse verificare i documenti giusti per primi non ha modo di sapere quali siano, e si
trova davanti una coda indifferenziata di 249.

### 8.2 Le ragioni sociali non sono normalizzate

`[OSSERVATO]` Sull'account osservato le anagrafiche presentano lo stesso soggetto giuridico in
più schede distinte. La misura, fatta raggruppando i documenti per partita IVA senza guardare
le denominazioni:

- **fornitori**: su 42 partite IVA distinte, **2 generano due schede anagrafiche ciascuna**,
  con identificativi diversi e denominazioni diverse — variazioni di punteggiatura e spaziatura
  nella stessa ragione sociale;
- **destinatari**: **una sola partita IVA genera quattro schede cliente distinte**, con quattro
  denominazioni diverse della stessa società.

`[OSSERVATO]` Il dato per deduplicare **c'è**: la partita IVA è presente su 93 documenti su 100.
`[DEDOTTO]` Non viene usata come chiave dell'anagrafica; la chiave è la denominazione estratta,
e ogni variante testuale crea un soggetto nuovo.

La conseguenza è diretta e visibile nella scheda Fornitori: **«da pagare» e «totale anno» di uno
stesso fornitore risultano spezzati su due righe**, e nessuna delle due rappresenta la posizione
reale. Su un'anagrafica di poche decine di fornitori l'utente se ne accorge; su qualche centinaio
diventa un errore silenzioso.

`[OSSERVATO]` Nella stessa scheda compare inoltre almeno una denominazione con **caratteri
palesemente mal letti** rispetto alla società titolare dell'account — una lettera sostituita in
una sigla di tre caratteri — a riprova che le schede anagrafiche vengono create da testo
estratto senza alcun controllo di plausibilità contro l'anagrafica esistente.

### 8.3 Una fattura intestata a un soggetto terzo

`[OSSERVATO]` Nell'elenco figura almeno **una fattura il cui destinatario non è la società
titolare dell'account né una sua variante**, ma una società terza di forma giuridica diversa —
`[IPOTESI]` un documento appartenente a un altro soggetto, finito nell'archivio per errore di
inoltro o per un allegato che accompagnava un'altra fattura. Il documento è regolarmente
conteggiato: concorre ai totali e compare come cliente a sé nell'anagrafica con tre fatture e
123,96 € dovuti.

`[OSSERVATO]` **Il sistema non solleva alcun avviso.** Non esiste un controllo che confronti il
destinatario estratto con l'identità dell'organizzazione titolare — controllo che sarebbe banale
avendo la partita IVA — né un'etichetta «destinatario non riconosciuto». Su un'area il cui KPI
principale è un'esposizione debitoria, ammettere silenziosamente documenti altrui è un difetto
di igiene del dato, non un dettaglio.

### 8.4 Le righe di dettaglio non vengono estratte

`[OSSERVATO]` Il campo che dovrebbe contenere le righe del documento (articoli, quantità,
prezzi unitari) è **vuoto su tutti e 100 i documenti** del blocco esaminato, benché la
scomposizione dell'imposta sia presente su 97.

`[DEDOTTO]` L'estrazione si ferma alla testata: soggetti, date, totali, imposte. È il motivo per
cui le funzioni di analisi prodotti e prezzi (§ 10) non avrebbero materia su cui lavorare
neppure se fossero attivate — un dato che la sola lettura degli interruttori non avrebbe fatto
emergere.

---

## 9. Le anagrafiche

### 9.1 Fornitori

`[OSSERVATO]` Colonne: **FORNITORE · DA PAGARE · TEMPO MEDIO DI PAGAMENTO · TOTALE ANNO ·
CATEGORIA**. Sotto ogni nome, il conteggio delle fatture e la ripetizione dell'avviso «non
verificato». La lista è impaginata (pagina 1 di 2), ordinata per numero di fatture discendente,
con selezione multipla e comando **Elimina**.

`[OSSERVATO]` La colonna **CATEGORIA** è un menu a discesa per riga, e su ogni riga vale
«Categoria predefinita del flusso di cassa». È la leva giusta: assegnare la categoria al
fornitore, una volta, invece che alla fattura, ogni volta. Sull'account osservato non è mai
stata usata, il che ha una conseguenza precisa sul previsionale (§ 11.2).

`[OSSERVATO]` **«DA PAGARE» ha una definizione più ampia dello scaduto**: il primo fornitore
per volume mostra 98.486,26 € da pagare, importo superiore all'intero scaduto di testata
(70.957 €). `[DEDOTTO]` La colonna somma tutto il non pagato indipendentemente dalla scadenza,
comprese quindi le fatture nello stato senza data che le card ignorano. Le due letture
convivono nella stessa area senza che nulla lo segnali: **la testata e l'anagrafica non parlano
della stessa grandezza**.

`[OSSERVATO]` La colonna **TEMPO MEDIO DI PAGAMENTO** è vuota (`--`) su ogni riga.

La classificazione corretta è `[NON POPOLATO]`, e la causa è determinabile: il tempo medio di
pagamento è la distanza fra la scadenza di una fattura e il movimento bancario che la salda, e
richiede quindi **documenti riconciliati**. Su questo account i collegamenti confermati sono 14
in tutto, distribuiti su fornitori diversi, e nessun fornitore ne ha abbastanza per una media
significativa. Non è quindi una funzione assente né rotta: **è una funzione che non ha ancora
dati**, e il trattino la rappresenta onestamente. Vale però la pena notare che la colonna non
distingue «non calcolabile» da «zero», e che un'interfaccia più esplicita direbbe perché.

### 9.2 Clienti

`[OSSERVATO]` Colonne: **CLIENTE · VALUTAZIONE · IMPORTO DOVUTO · RITARDO MEDIO ·
ULTIMA ATTIVITÀ · CATEGORIA**. Sei righe, con la stessa struttura secondaria (conteggio fatture
e «non verificato») della scheda Fornitori.

**Test 5 — le righe coprono l'archivio?**

```
168 + 27 + 26 + 22 + 3 + 1 = 247 fatture   + 2 in elaborazione = 249   ✔
```

✔ **superata**: l'anagrafica clienti copre l'intero archivio meno i documenti la cui estrazione
non è ancora finita.

`[OSSERVATO]` Poiché tutte le 249 fatture sono di acquisto (il tab «Vendita» segna 0), il
«cliente» è sempre il destinatario del documento, cioè la società titolare dell'account. La
scheda Clienti di questo account è quindi, di fatto, **l'elenco delle varianti con cui i
fornitori scrivono il nome del destinatario** — quattro varianti della stessa partita IVA, più
una sigla mal letta, più il soggetto terzo di § 8.3.

#### La valutazione del cliente

`[OSSERVATO]` La colonna **VALUTAZIONE** mostra su ogni riga un badge **«B — Normale»**: una
**lettera** accompagnata da un **giudizio testuale**.

È la funzione più ambiziosa dell'area e merita di essere descritta per quello che promette: un
**merito creditizio interno per cliente**, calcolato sul comportamento di pagamento osservato e
presentato nel vocabolario del rating (lettere, non punteggi). In un software di tesoreria è la
premessa naturale a decisioni concrete — fido concesso, condizioni di pagamento, priorità di
sollecito — e nessuna delle funzioni viste altrove nel prodotto arriva così vicino a un
giudizio prescrittivo.

`[NON VERIFICABILE]` **La scala e il metodo non sono determinabili con questi dati.** Non
sappiamo quanti gradi abbia la scala (se «B» sia il secondo di cinque, di sette o di dieci), su
quali variabili sia costruito il punteggio, con che pesi, su quale finestra temporale, né quale
sia il valore predefinito in assenza di storico. L'osservazione mostra **sei righe su sei con
lo stesso identico valore**, il che ammette due letture entrambe compatibili con i dati:
`[IPOTESI]` «B / Normale» è il valore neutro assegnato a chi non ha storico di pagamento
sufficiente — coerente con il fatto che il ritardo medio è vuoto su tutte le righe; oppure
`[IPOTESI]` il punteggio è calcolato ma converge su questo campione perché tutti i soggetti si
comportano allo stesso modo. Distinguere le due richiederebbe un account con clienti reali dal
comportamento eterogeneo, che questo non è. **Nessuna documentazione pubblica o interna del
produttore menziona questa valutazione.**

`[OSSERVATO]` La colonna **RITARDO MEDIO** è vuota (`--`) su ogni riga, per la stessa ragione
del tempo medio di pagamento fornitori: `[NON POPOLATO]`, mancano riconciliazioni.

#### La formattazione relativa e il futuro mal gestito

`[OSSERVATO]` La colonna **ULTIMA ATTIVITÀ** usa date relative: «circa 10 ore fa», «8 giorni
fa» e — su una riga — **«tra 5 mesi»**.

«Tra 5 mesi» come *ultima* attività è una contraddizione nei termini, e nasce da un difetto
preciso: la funzione di formattazione relativa riceve una data futura e la rende con la
preposizione al futuro, senza che nessuno controlli che una data di *ultima* attività debba
essere passata. La data futura c'è davvero — l'elenco delle fatture contiene un documento
datato **28 dicembre 2026**, oltre quattro mesi avanti — `[IPOTESI]` per un errore di
estrazione dell'anno o per una fattura effettivamente emessa con data posticipata.

Due difetti distinti, che conviene tenere separati perché hanno rimedi diversi:

1. **A monte**, l'estrazione accetta senza obiezioni una data di documento nel futuro. Un
   controllo di plausibilità sulle date è il più economico dei controlli e qui non c'è.
2. **A valle**, la formattazione relativa non ha un ramo per il caso impossibile. Basterebbe
   ricadere sulla data assoluta quando il valore è futuro.

Il costo per l'utente non è cosmetico: la colonna «ultima attività» serve a capire quali
rapporti sono vivi e quali dormienti, e una riga che dice «tra 5 mesi» non è leggibile in alcun
modo.

---

## 10. La riconciliazione documento ↔ transazione

### 10.1 Che cosa si vede

`[OSSERVATO]` Sulle righe delle fatture in stato «Pagato» compare, **dentro la riga stessa**,
la transazione bancaria associata, resa come pulsante che riporta i tre dati identificanti:
**data, importo e descrizione** del movimento — nella forma `Date:… Amount:… Description:…`,
con la causale bancaria completa. Sull'account osservato se ne vedono due, entrambe bonifici
disposti da internet banking a inizio agosto, di importo pari al totale della fattura.

`[OSSERVATO]` Esiste inoltre un pulsante **«Candidati»**, presente sulla schermata ma collocato
in fondo alla pagina.

### 10.2 Che cosa dice il dato

Il servizio interrogato dalla schermata restituisce, per ciascun documento, i collegamenti
esistenti con le transazioni: conteggio, totale pagato, e per ogni transazione l'identificativo,
l'importo, la data, la causale, la banca e **un indicatore di conferma**. Sui 99 documenti
interrogati:

| | |
|---|---|
| documenti con almeno un collegamento | **18** su 99 |
| transazioni collegate | 18 |
| di cui **confermate** | **14** |
| di cui **non confermate** | **4** |
| totale collegato | 20.137,66 € |

**Test 6 — con quale criterio avviene il collegamento?**

Tutti e 14 i collegamenti confermati hanno **importo della transazione identico al totale della
fattura, al centesimo** (14 su 14). `[DEDOTTO]` Il criterio dominante è l'importo esatto. La
fase 0 documenta un motore di matching a sei livelli — corrispondenza perfetta (importo + data),
quasi perfetta, importo esatto, importo simile, scadenza vicina, ipotesi di ripiego — con un
indicatore di affidabilità mostrato all'utente; su questo account **si vede solo il livello più
forte**, e le tolleranze dei livelli intermedi restano `[NON VERIFICABILE]`, come già rilevato
in fase 0.

### 10.3 Il costo della conferma manuale, misurato

`[OSSERVATO]` I 4 collegamenti **non confermati** insistono su documenti che l'interfaccia
espone ancora come **«Scaduto»**, e in tutti e quattro i casi la transazione associata ha
importo **identico al centesimo** al totale della fattura:

```
1.935,62 + 3.326,28 + 117,12 + 1.052,01 = 6.431,03 €
```

Sono 6.431,03 € che il sistema **ha già riconosciuto come pagati** — la corrispondenza è
perfetta, il movimento bancario esiste, la data è precedente di settimane o mesi — e che
continuano a pesare sull'aging e sul KPI «Scaduto −70.957 €» perché **nessuno ha premuto
conferma**. E sono solo i primi 100 documenti su 249: sull'intero archivio la cifra è
plausibilmente maggiore.

`[IPOTESI]` L'indicatore di conferma è sull'oggetto transazione, non sul legame, e potrebbe
quindi riferirsi alla verifica della transazione bancaria (Trezy ha una coda «verifica
transazioni» distinta) anziché all'accettazione della proposta di collegamento. La pagina
Transazioni mostra del resto un contatore «Documenti da confermare (5)», dello stesso ordine di
grandezza ma non uguale a 4. Le due letture non sono distinguibili in sola lettura; **il fatto
osservato — quattro documenti esposti come scaduti a fronte di un movimento bancario di importo
identico già associato — resta valido in entrambe.**

Il principio, comunque, è quello dichiarato dal produttore e va riconosciuto come scelta
deliberata e corretta: **il collegamento è sempre proposto, mai imposto** («Collega ora» /
«Non ora»). In contabilità è la scelta giusta. Ma se la proposta perfetta resta in sospeso
per mesi, la conseguenza è che **il KPI più visibile della schermata sovrastima l'esposizione**,
e nulla nell'interfaccia lo segnala: non c'è un badge sulla riga scaduta che dica «esiste una
corrispondenza in attesa», né un contatore in testata delle conferme pendenti.

### 10.4 Che cosa non è stato osservato

`[NON ACCESSIBILE]` **Il pannello «Candidati» non è stato aperto.** Il tentativo è fallito con
errore di posizionamento («Element is outside of the viewport»), registrato nel log di
navigazione. Non sappiamo quindi come Trezy presenti le proposte non ancora accettate: se in
elenco, con quale ordinamento, se mostri il livello e l'affidabilità del match, se consenta la
conferma in blocco.

`[NON ACCESSIBILE]` Il menu **«Analisi»** in barra filtri non si è aperto (timeout sul
selettore). Contenuto sconosciuto.

**Nessun collegamento è stato confermato, rifiutato o creato durante l'osservazione**, essendo
l'ambiente di produzione e l'accesso in sola lettura. Restano quindi ignoti: il comportamento
in caso di pagamento parziale o in eccesso, la creazione di piani di rateazione e il match di
una transazione su più scadenze — tutte funzioni che la fase 0 documenta dalle stringhe interne
del prodotto ma che non hanno trovato riscontro visivo su questa schermata.

---

## 11. Il legame con il previsionale di cassa

### 11.1 Gli interruttori

`[OSSERVATO]` La configurazione dell'account riporta `useDocumentTotals: true`; la chiamata che
alimenta il flusso di cassa passa `documentForecastMode=true` e `includeInvoices=true`, e la
risposta espone per ogni categoria tre campi dedicati: **`invoiceForecast`**,
**`futureInvoiceForecast`** e **`lateInvoiceForecast`**, oltre a `documentInflowTotal` /
`documentOutflowTotal` e a un elenco `invoiceEntries` di singole fatture.

L'architettura è quindi esplicita e ben separata: le fatture non sono previsioni, sono una
**sorgente parallela** che affianca le previsioni per categoria, con una distinzione strutturale
fra la componente futura e quella scaduta.

### 11.2 Che cosa contengono davvero, su questo account

`[OSSERVATO]` Sul periodo agosto-ottobre 2026:

| Campo | Valore |
|---|---|
| `documentOutflowTotal` | **11.515,43 €** |
| `documentInflowTotal` | 0 € |
| `invoiceEntries` | **19 fatture**, tutte in uscita |
| di cui con categoria assegnata | **0 su 19** |
| di cui marcate come scadute | **0 su 19** |
| `invoiceForecast` / `futureInvoiceForecast` / `lateInvoiceForecast`, per categoria | **0 su tutte le categorie**, in entrata e in uscita |

Tre letture, da tenere distinte perché una sola è un limite di prodotto:

1. **Le fatture entrano davvero nel previsionale**: 19 documenti per 11.515,43 € sul trimestre.
   La funzione esiste e opera. Questo è un merito.
2. **Ma entrano scollegate dalle categorie.** Nessuna delle 19 ha una categoria: arrivano nel
   calcolo come voci sciolte, ed è la ragione per cui i tre campi per categoria sono tutti a
   zero pur essendoci 11.515,43 € di documenti. `[DEDOTTO]` La catena si spezza a monte, nella
   scheda Fornitori: la colonna CATEGORIA è su «Categoria predefinita» per ogni fornitore, e
   senza quell'assegnazione le fatture non trovano una riga del cashflow su cui posarsi.
   Questo è `[NON POPOLATO]` — configurazione mancante, non difetto.
3. **Lo scaduto non entra mai.** Nessuna delle 19 voci è marcata come scaduta e
   `lateInvoiceForecast` è a zero ovunque: le 109 fatture scadute per 70.957 € **non compaiono
   in alcun punto della proiezione di cassa**. Il campo esiste, previsto e nominato, e non è
   alimentato. Questo è un limite di prodotto, ed è pesante: un debito scaduto è denaro che
   uscirà, e non figura fra le uscite attese.

### 11.3 La curva `invoices/future-cumulative`

`[OSSERVATO]` Il servizio fatture espone una curva cumulata delle fatture future: **91 punti
giornalieri**, dall'11 agosto al 9 novembre 2026, che arriva a **−7.986,84 €**. Su 91 giorni,
**7 hanno movimento** e 84 sono piatti; le fatture coinvolte sono **14 su 249**.

**Test 7 — la curva e la card «In arrivo» dicono la stessa cosa?**

Le fatture non pagate con scadenza da oggi in avanti, nel blocco esaminato, sono 12 e sommano
**7.329,68 €**, esattamente l'importo della card «In arrivo» (7.330 €); le sei date di scadenza
coincidono una a una con i punti di movimento della curva dal 29 agosto in poi. La curva vale
7.986,84 €, cioè 657,16 € in più, e quei 657,16 € sono due documenti datati **oggi stesso**:

```
7.986,84 − 657,16 = 7.329,68 €   ✔
```

✔ **superata**, con una differenza di perimetro degna di nota: **la curva include il giorno
corrente, la card lo esclude**. Su questo account fa 657 € di scarto fra due numeri della stessa
schermata.

`[OSSERVATO]` Anche il sottotesto della card è verificato: «Scadenza 29 Aug» corrisponde al
primo giorno con movimento successivo a oggi.

### 11.4 Perché la curva è quasi piatta

Il briefing dell'osservazione attribuiva la piattezza alla colonna «PAGAMENTO PREVISTO» vuota.
La verifica precisa il meccanismo, e la distinzione conta:

`[OSSERVATO]` Il campo *data di pagamento prevista* è **nullo su tutti e 100** i documenti del
blocco esaminato. La colonna «PAGAMENTO PREVISTO» che si vede in tabella non mostra quel campo:
mostra la **data di scadenza**, presente su 58 documenti su 100 e assente sugli altri 42, dove
compare il trattino.

`[DEDOTTO]` La previsione da fatture si regge quindi interamente sulla **data di scadenza
estratta dal documento**. Dove l'estrazione la trova, la fattura entra in curva; dove non la
trova, la fattura è invisibile ovunque — card, aging e previsionale insieme (§ 3.3).

La classificazione corretta è **duplice, e le due parti vanno tenute separate**:

- `[NON POPOLATO]` — che quasi nessuna fattura abbia una data di pagamento *prevista* dipende
  da questo account: nessuno ha compilato quel campo, e il campo è compilabile.
- **limite di prodotto** — che la previsione dipenda da un solo campo, senza alcuna stima di
  ripiego, è una scelta di Trezy. Il prodotto **conosce** le condizioni di pagamento (le estrae
  e le conserva nei metadati: «Pagamento completo», «Bonifico», «Contante» e simili su 23
  documenti su 100), **conosce** la data del documento, e in Impostazioni dispone perfino di
  termini di pagamento per categoria — usati però, come documentato in fase 0, solo nella
  contabilità e mai nel cashflow. Con questi tre ingredienti una data attesa sarebbe stimabile;
  Trezy non la stima. Il risultato è una curva che su 91 giorni è piatta per 84.

---

## 12. Analisi prodotti, fornitori e prezzi; le funzioni beta per la ristorazione

`[OSSERVATO]` Impostazioni › Funzionalità contiene due blocchi di interruttori che aggiungono
schede alla sezione Documenti. **Nessuno è attivo su questo account** → `[NON POPOLATO]`.
L'intestazione del primo blocco è in francese («Produits — Activez ces fonctionnalités pour
accéder aux analyses produits et fournisseurs dans la section Documents») e le descrizioni
sotto sono in italiano: la localizzazione incompleta arriva fin qui.

**Blocco «Produits»** — descrizioni riportate dall'interfaccia:

- **Prodotti** — «Visualizza e analizza tutti i prodotti dalle tue fatture in una scheda
  dedicata. Traccia prezzi, quantità e informazioni sui fornitori.»
- **Analisi fornitori** — «Ottieni informazioni dettagliate sulle prestazioni dei tuoi
  fornitori, modelli di spesa e cronologia dei pagamenti.»
- **Analisi prezzi prodotti** — «Monitora le variazioni di prezzo nel tempo, confronta i prezzi
  dei fornitori e identifica opportunità di ottimizzazione dei costi.»

**Blocco «Funzionalità Beta»**, premesso da un avviso esplicito («sperimentali e potrebbero
cambiare o essere rimosse»):

- **Analisi costi ricette** — «Calcola e traccia il costo delle tue ricette in base ai prezzi
  degli ingredienti delle tue fatture.»
- **Ricette** — «Crea e gestisci ricette, collega ingredienti ai prodotti e calcola
  automaticamente i costi alimentari.»
- **Inventario** — «Traccia i livelli di stock in tutte le posizioni di stoccaggio, gestisci le
  sessioni di inventario e monitora i movimenti di magazzino in tempo reale.»

Chiude la nota: «Queste funzionalità appariranno come schede nella sezione Documenti quando
abilitate» — coerente con il pulsante `+` accanto alle tre schede esistenti.

`[DEDOTTO]` **Tutte e sei poggiano sulle righe di dettaglio delle fatture**: prezzi unitari,
quantità, articoli. E il § 8.4 mostra che quelle righe **non vengono estratte**: il campo è
vuoto su tutti i documenti esaminati. Attivare gli interruttori su questo archivio produrrebbe
quindi schede senza dati — non per un difetto delle funzioni, ma perché l'estrazione a monte si
ferma alla testata del documento. È una conclusione che l'ispezione dei soli interruttori non
avrebbe permesso: qui la verifica sui dati grezzi cambia il giudizio.

`[NON VERIFICABILE]` Attivandole, resterebbe da capire se l'estrazione delle righe si accenda a
sua volta (rielaborando l'archivio o solo i documenti nuovi) oppure no. Non determinabile senza
attivarle, cosa che l'osservazione in sola lettura su un ambiente di produzione non ha fatto.

`[IPOTESI]` L'insieme — food cost, ricette, inventario — descrive un posizionamento verso la
ristorazione che il produttore non comunica pubblicamente, coerente con il settore «food»
impostato sull'account e con l'elenco dei settori disponibili (Ristorazione, Commercio
alimentare) nella stessa pagina.

---

## 13. Debolezze e limiti osservati

**1. Due quinti dell'archivio non hanno rappresentazione.**
102 documenti su 249 non compaiono in nessuna delle tre card. Sono quelli senza data di
scadenza estratta: nel primo blocco di 100, 42 documenti per 63.958,75 € di esposizione,
con corrispondenza perfetta fra stato «non pagato» e assenza della data (42 su 42). Non sono
segnalati come incompleti né raggiungibili con un filtro. Il difetto non si vede: la testata
resta credibile mentre tace su una parte enorme del portafoglio.

**2. Lo scaduto non entra nel previsionale.**
`lateInvoiceForecast` è a zero su ogni categoria; nessuna delle 19 voci fattura del trimestre è
marcata come scaduta. 70.957 € di debito scaduto — denaro che uscirà — non figurano fra le
uscite attese. Il campo esiste ed è nominato: la struttura c'è, l'alimentazione no.

**3. La conferma manuale lascia scaduto ciò che è pagato.**
Quattro documenti esposti come «Scaduto» hanno una transazione di importo identico al centesimo
già associata e non confermata: **6.431,03 € di scaduto apparente** sul solo primo blocco di
100. Nessun indicatore avvisa che per quella riga esiste una corrispondenza in attesa.

**4. Il giudizio di affidabilità dell'estrazione è calcolato e non mostrato.**
13 documenti su 98 sono marcati `REVIEW` dal motore e in elenco sono indistinguibili dagli 85
`TRUST`. Il contatore «249 da verificare» tratta tutto allo stesso modo e quindi non aiuta a
scegliere da dove cominciare. Il prodotto prevede una verifica guidata sui campi a bassa
affidabilità (fase 0): su questa schermata non arriva.

**5. Le anagrafiche si frammentano nonostante il dato per unificarle sia presente.**
Due fornitori su 42 hanno due schede ciascuno; un solo destinatario ne ha quattro. La partita
IVA è presente su 93 documenti su 100 e non viene usata come chiave. Conseguenza diretta: «da
pagare» e «totale anno» di uno stesso fornitore spezzati su righe diverse, nessuna delle quali
è la posizione vera.

**6. Nessun controllo di plausibilità sui documenti in ingresso.**
Una fattura intestata a un soggetto terzo è accettata e conteggiata senza avvisi, benché il
confronto fra destinatario estratto e organizzazione titolare sia banale avendo la partita IVA.
Una data di documento a quattro mesi nel futuro è accettata senza obiezioni. Almeno una scheda
anagrafica nasce da caratteri mal letti.

**7. La fascia «90+g» mescola urgenza e archeologia.**
39.392 €, il 55 % dello scaduto, in un contenitore aperto verso il passato dove convivono il
ritardo di quattro mesi e quello di **1.247 giorni**. Le fasce sono cablate e non configurabili
(fase 0). Il KPI non è azionabile senza ispezione manuale.

**8. Numeri della stessa schermata con perimetri diversi.**
«% del totale» è calcolato sulle sole tre card e non sull'archivio, quindi sovrastima ogni
quota; «DA PAGARE» dell'anagrafica include il non scaduto e supera lo scaduto di testata; la
curva previsionale include il giorno corrente e la card «In arrivo» lo esclude (657,16 € di
scarto). Nessuna delle tre differenze è dichiarata.

**9. L'aging somma anziché compensare le note di credito.**
Le componenti in entrata delle fasce più vecchie (202,92 € e 93,65 €) sono sommate alle uscite.
Errore di 296 € su 70.957 €: trascurabile in valore, sbagliato nel metodo, e destinato a
crescere in un archivio con più note di credito.

**10. Localizzazione incompleta fin dentro i dati generati.**
Il suffisso `excl.` nella colonna importi, il prefisso `factures-` nell'indirizzo email — che
l'utente deve usare a ogni inoltro — e l'intestazione «Produits» nel pannello funzionalità.

**11. La formattazione relativa non gestisce il futuro.**
«tra 5 mesi» come *ultima* attività. Due difetti sovrapposti: nessun controllo di plausibilità
sulla data in ingresso, nessun ramo per il caso impossibile in uscita.

**12. Le righe di dettaglio non vengono estratte,** e con esse cade il presupposto di sei
funzioni annunciate (prodotti, analisi fornitori, analisi prezzi, food cost, ricette,
inventario).

**13. Colonne calcolate che restano vuote senza spiegazione.**
«Tempo medio di pagamento» e «Ritardo medio» mostrano `--` su ogni riga. La causa è legittima —
mancano riconciliazioni sufficienti — ma l'interfaccia non distingue «non calcolabile» da
«zero» e non dice all'utente che cosa dovrebbe fare per popolarle.

---

## 14. Cosa non è stato valutabile

**`[NON ACCESSIBILE]`**

- **Il pannello «Candidati»**: apertura fallita con errore di posizionamento nel viewport,
  registrato nel log. Non sappiamo come siano presentate le proposte di collegamento non ancora
  accettate, se sia mostrato il livello di match e la relativa affidabilità, né se esista una
  conferma in blocco.
- **Il menu «Analisi»** in barra filtri: timeout sul selettore, contenuto ignoto.
- **La scheda di dettaglio di un singolo documento**: nessuna fattura è stata aperta. Restano
  ignoti il visualizzatore del PDF, i campi editabili, la verifica guidata campo per campo e
  l'anteprima dell'estrazione.
- **La seconda pagina dell'anagrafica fornitori** e le pagine successive delle 249 fatture:
  l'osservazione copre la prima pagina di ciascuna e il primo blocco di 100 documenti restituito
  dall'API. Tutte le statistiche su 100 documenti riportate in questo capitolo vanno lette come
  campione dell'archivio, non come censimento — il campione è però quello dei documenti più
  recenti, essendo l'ordinamento per data discendente.

**`[NON VERIFICABILE]`**

- **La scala e il metodo della valutazione cliente**: sei righe su sei mostrano «B / Normale».
  Non sono determinabili il numero di gradi, le variabili, i pesi, la finestra temporale né il
  valore predefinito in assenza di storico. Nessuna fonte del produttore la documenta.
- **Le tolleranze del motore di matching**: su questo account si osserva solo la corrispondenza
  per importo esatto (14 su 14). I livelli intermedi — «importo simile», «data di scadenza
  vicina» — non si sono manifestati, e le soglie restano ignote, come già rilevato in fase 0.
- **Il canale email**: nessun documento è stato inoltrato. Ignoti il comportamento con più
  allegati, con formati non supportati, con duplicati, e l'eventuale notifica di esito.
- **Il ciclo di vita completo di una riconciliazione**: pagamento parziale, pagamento in
  eccesso, piani di rateazione, una transazione a copertura di più scadenze. Documentati in
  fase 0 dalle stringhe interne, mai osservati qui.
- **L'esito dell'attivazione delle funzioni prodotti/beta**: se accendere gli interruttori
  inneschi anche l'estrazione delle righe di dettaglio, e se questa venga applicata
  retroattivamente all'archivio o solo ai documenti successivi.

**`[NON POPOLATO]`** — presente nel prodotto, vuoto su questo account e non per difetto:

- data di pagamento prevista (nulla su 100 documenti su 100);
- tempo medio di pagamento fornitori e ritardo medio clienti (nessuna riconciliazione
  sufficiente);
- categoria di cashflow per fornitore (tutte su «Categoria predefinita», ed è la ragione per
  cui i totali fattura per categoria del previsionale sono a zero);
- schede Prodotti, Analisi fornitori, Analisi prezzi, Analisi costi ricette, Ricette,
  Inventario (interruttori tutti spenti);
- documenti di vendita: il tab segna 0, l'intero archivio è di acquisto. **Tutta la parte
  attiva del ciclo — crediti verso clienti, solleciti, incasso — non è quindi osservabile su
  questo account**, e con essa il senso pieno della valutazione cliente e del ritardo medio.

**Vincoli dell'osservazione.** Ambiente di produzione, accesso in sola lettura: nessun documento
caricato, verificato, modificato o eliminato; nessun collegamento confermato o rifiutato;
nessun interruttore attivato. Ogni affermazione su una funzione mai eseguita è marcata come
ipotesi o come non verificabile.

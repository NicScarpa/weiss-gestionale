# Analisi UI/UX

Osservazioni raccolte nel prodotto l'**11 agosto 2026**, account WEISS.
Ogni accorgimento è annotato con **cosa fa**, **perché funziona** e **come si
tradurrebbe nel nostro stack** (Next.js App Router, React, Tailwind, shadcn/ui).

---

## Limiti di verificabilità

| Ambito | Stato | Motivo |
|---|---|---|
| UX della riconciliazione | `[NON ACCESSIBILE]` | modulo non incluso nel piano |
| UX di prima nota, gestione crediti, finanziamenti | `[NON ACCESSIBILE]` | moduli non inclusi |
| Onboarding iniziale | `[NON OSSERVABILE]` | l'account era già configurato da altri |
| Stati di caricamento | `[NON VERIFICATO]` | non ho isolato skeleton vs spinner su rete lenta |
| Undo dopo un'azione distruttiva | `[NON VERIFICATO]` | non ho eseguito cancellazioni |
| App mobile nativa | `[NON ACCESSIBILE]` | fuori dal perimetro (solo web) |

---

## 1. Architettura informativa

**La home è il previsionale.** Al login si atterra su `/cashflow/forecast`, non su
un cruscotto di sintesi. La prima cosa che il prodotto mostra è **una tabella di
piano di tesoreria con i mesi in colonna**, non un riepilogo di KPI.

`[DEDOTTO]` È una dichiarazione di priorità: lo strumento serve a *pianificare*,
non a *contemplare lo stato*. Un cruscotto risponde a «come stiamo?», un piano
risponde a «cosa succederà?».

**Menu orizzontale a sette voci**, con raggruppamento per *oggetto di lavoro* e
non per funzione: Tesoreria · Banca · In attesa · Prima nota · Area Finanziaria ·
Dashboards. Le sottovoci stanno in un menu a tendina con **titolo + riga di
descrizione**:

> **Piano di tesoreria** — Analizzare la tesoreria e le transazioni passate e rettificare il previsionale.
> **Situazione di cassa** — Ottimizzare la situazione di cassa dei conti in base ai flussi in attesa.
> **Previsioni a 13 settimane** — Monitorare il cash flow settimana per settimana, in base ai flussi in attesa.
> **Reale e previsionale** — Confrontare il realizzato con il previsionale del piano di tesoreria.

**Perché funziona:** quattro voci con nomi simili sarebbero indistinguibili. La
descrizione dice **quale domanda** risponde ciascuna vista, non cosa contiene.

**Da noi:** `DropdownMenu` di shadcn/ui con `DropdownMenuItem` a due righe (label
in `font-medium`, descrizione in `text-sm text-muted-foreground`). Costo: nullo.
Il beneficio è tutto nella scrittura delle descrizioni — vanno formulate come
*job-to-be-done*, non come sommario.

**Barra laterale verticale** riservata ai moduli *acquistabili* (pagamenti,
spese, cash collect, assistente AI), separata dal menu orizzontale che contiene i
moduli *in uso*. La separazione fra «cosa uso» e «cosa potrei comprare» è
esplicita nella disposizione.

---

## 2. Tabelle — il cuore del prodotto

### 2.1 La colonna spaccata del periodo in corso — **l'accorgimento migliore visto**

Nella vista settimanale, la colonna della settimana corrente è divisa in due
sotto-colonne:

```
            S33 - 10/08
      Ad oggi | Fine della settimana
        6.260,30 |        8.739,70
```

**Cosa fa:** separa il consuntivo già maturato dal previsto residuo, **dentro lo
stesso periodo**.

**Perché funziona:** il periodo in corso è l'unico che è insieme passato e futuro.
Ogni prodotto che mostra un solo numero per la settimana corrente mente: o
sottostima (solo consuntivo) o sovrastima (solo previsione). Spaccare la colonna
rende l'ambiguità visibile invece di risolverla arbitrariamente.

**Da noi:** header di tabella a due livelli — `<TableHead colSpan={2}>` per il
periodo, due `<TableHead>` figli. Nel modello serve che ogni periodo esponga
`maturato` e `residuo` separatamente, non un totale.

### 2.2 Filtri: nove dimensioni, con applicazione esplicita

Filtri disponibili: conti bancari · titolo · categorie · **data di pagamento** ·
**data di fatturazione** · importo · tipo di transazione · stato · in attesa/pagate.

Il pannello di ciascun filtro ha: **ricerca interna** (indispensabile su alberi di
categorie lunghi), «Selezionare tutto / Deselezionare tutto», e due pulsanti
**Eliminare / Confermare**.

**Perché l'applicazione esplicita conta:** su un albero con decine di categorie,
applicare a ogni click significa una richiesta di rete per spunta. Il pulsante
«Confermare» trasforma dieci richieste in una.

**Il filtro attivo diventa un chip separato** nella barra, accanto a «Filtrare», e
compare il link **«Reimpostare i filtri»** — che *non c'è* quando non ci sono
filtri attivi.

**Da noi:** `Popover` + `Command` (per la ricerca interna) + `Checkbox`, con stato
locale e conferma esplicita. I chip come `Badge` con `X` di rimozione.

### 2.3 Persistenza nell'URL — **presente**

`[OSSERVATO]` Cercare «WORLDLINE» produce:

```
/it/app/search?containingText=WORLDLINE&includeNoteInSearch=false
```

Lo stato della vista è nell'URL, quindi **condivisibile e salvabile nei
preferiti** — e anche lo *scope* della ricerca, non solo il termine.
Le viste temporali fanno lo stesso: `?frequency=Weekly&from=-4&to=13`.

**Da noi:** `useSearchParams` + `router.replace` con `scroll: false` in App
Router. È il pattern che rende un link a una vista filtrata una risposta valida a
«fammi vedere cosa intendi».

### 2.4 Ricerca con costo dichiarato

Lo scope della ricerca è un menu a due voci:

> **Titolo e importo** — *Più veloce*
> Titolo, importo e promemoria

**Perché funziona:** dichiarano il compromesso invece di nasconderlo. L'utente
sceglie sapendo cosa paga. È raro e onesto.

**Da noi:** una riga di `text-xs text-muted-foreground` nell'opzione. Costo
nullo, e comunica che il prodotto rispetta l'intelligenza di chi lo usa.

### 2.5 Personalizzazione colonne — limitata

Quattro toggle (Titolo, Categoria, Data di pagamento, Importo), **solo per
nascondere**. Non si aggiungono colonne opzionali, benché esistano come *filtri*
dimensioni che non sono disponibili come colonne (conto, stato, promemoria).

**Asimmetria da evitare da noi:** ciò per cui si può filtrare dovrebbe essere
mostrabile come colonna. Qui non lo è.

---

## 3. Drill-down: da un numero al dettaglio in **un click**

Un click su una cella aggregata del piano di tesoreria apre un **pannello
laterale** che:

- dichiara in testa **le due coordinate**: «Luglio 2026» e «AREA OPERATIVA»
- espone **tab Realizzato / Previsionale** — la separazione consuntivo/previsto
  sopravvive anche nel dettaglio
- mostra in evidenza **conteggio e totale**: «42 transazioni — 51.317,67 €»
- elenca i movimenti **raggruppati per giorno**
- offre un'uscita verso la **pagina intera** (icona ↗)
- **evidenzia la cella di origine** e tratteggia riga e colonna correlate

**Perché funziona:** il drawer non fa perdere il contesto — la tabella resta
visibile. Il conteggio prima della lista risponde a «quanto è grande questo
numero» prima che l'utente scorra. Il collegamento alla pagina intera è la via
d'uscita per chi voleva davvero navigare.

**Da noi:** `Sheet` di shadcn/ui (lato destro), con `SheetHeader` a due righe per
le coordinate e `Tabs` interni. Il cross-highlight si ottiene con classi
condizionali su riga e colonna dell'elemento selezionato.

---

## 4. Stati

### 4.1 Empty state «nessun risultato dopo filtro»

Illustrazione + titolo **«Nessuna transazione trovata»** + sottotitolo che
**distingue il vuoto-da-filtro dal vuoto-assoluto**:

> «La ricerca o i filtri non hanno restituito risultati. Provare con un altro
> insieme di filtri o termini di ricerca diversi.»

**Difetto:** il suggerimento è **testuale ma non azionabile** — nessun pulsante
«azzera i filtri» dentro lo stato vuoto. L'utente deve risalire alla barra.

**Da noi:** stessa struttura, ma con il pulsante di reset *dentro* l'empty state.
Il costo è una riga, il beneficio è chiudere il ciclo dove l'attenzione già si
trova.

### 4.2 Empty state didattico

Nel «Calendario delle transazioni», vuoto perché non ci sono flussi attesi, un
tooltip spiega **cosa mostrerebbe** la vista: «La cronologia giornaliera di tutte
le transazioni future e del loro impatto sul saldo di tesoreria».

**Perché funziona:** uno stato vuoto che insegna a cosa serve la schermata
converte la delusione in comprensione.

---

## 5. Feedback e salvataggio

**Salvataggio implicito, senza conferma.** Cambiare il tipo di un conto o
scrivere una soglia salva immediatamente: nessun pulsante «Salva», nessun toast.
La conferma è il **cambiamento di stato visibile** — dopo aver impostato il tipo
conto compaiono le colonne delle soglie.

`[DEDOTTO]` Coerente con impostazioni a basso rischio. Ma **nessun undo osservato**,
e su un menu contestuale ho trovato *Rimuovere* accanto a *Rinominare* senza
alcuna conferma visibile prima del click.

**Da noi:** salvataggio implicito va bene per preferenze e configurazioni
reversibili; per le azioni distruttive serve `AlertDialog` o un toast con undo
(`sonner`). La regola: implicito quando l'errore costa un secondo, esplicito
quando costa un dato.

---

## 6. Semantica dei colori e delle forme

| Segnale | Resa |
|---|---|
| Entrate / uscite | verde / rosso, sia nel grafico a barre sia negli importi |
| Consuntivo vs previsione (grafico) | **grigio** il passato, **blu con area riempita** il futuro, linea verticale tratteggiata «Oggi» |
| Previsione (tabella) | valori futuri in **grigio chiaro**, consuntivo in nero |
| Sotto soglia di liquidità | **pallino + importo arancioni**, per singola cella di periodo |
| Da fare (categoria mancante) | **badge arancione bordato** |
| Fatto (categoria assegnata) | **testo neutro**, nessun badge |
| Modulo non incluso nel piano | **icona a diamante** accanto alla voce |

**Il principio più riusabile:** *l'enfasi visiva solo su ciò che richiede
azione*. Le categorie assegnate sono testo semplice, quelle mancanti sono badge
colorati. Una lista completamente categorizzata diventa visivamente silenziosa —
ed è esattamente il segnale che «non c'è niente da fare qui».

**Da noi:** `Badge variant="outline"` con colore d'accento solo per gli stati che
richiedono intervento; stati completi senza badge. Evitare il badge «OK» verde:
è rumore.

---

## 7. Il tasso di categorizzazione come KPI in cima alla lista

Sopra la lista dei movimenti, una barra di progresso:

> **0%** — Transazioni bancarie categorizzate negli ultimi 15 giorni. Raggiungere
> fino al **95%** con il creatore di regole di categorizzazione.
> [Rivedere le regole di categorizzazione suggerite •]

**Perché funziona:** trasforma una manutenzione noiosa e rimandabile in un
**progresso misurabile con un traguardo dichiarato**, e mette l'azione risolutiva
a fianco del numero. Il pallino di notifica sul pulsante fa il resto.

**Da noi:** `Progress` + una riga di testo + `Button` con l'azione. Applicabile
identico alla nostra riconciliazione e alla categorizzazione dei movimenti.

---

## 8. Import: due accorgimenti da copiare

**Il modello è generato dai dati dell'utente.** Il file Excel scaricato non è un
template astratto: contiene **il piano dei conti dell'utente** come percorsi
completi (`Uscite > AREA OPERATIVA > Uscite Variabili > Fornitori Italia > SDD`)
e le **14 settimane già intestate** con numero ISO e data.

**Perché funziona:** l'utente non deve capire un formato, deve solo riempire
celle. E il percorso completo come chiave è leggibile da un umano, a differenza
di un ID.

**L'interruttore «Compilare solo le settimane vuote», attivo per default.**
Un'importazione di massa che **non sovrascrive** il lavoro già fatto a mano,
salvo richiesta esplicita.

**Da noi:** generare i modelli di import a partire dall'anagrafica corrente, e
rendere il default dell'import *non distruttivo*.

---

## 9. Difetti UX osservati

1. **Percorso di attivazione rotto.** Il pulsante «Attivare l'analisi degli
   scostamenti» — call-to-action principale della funzione, con badge *New* —
   apre una scheda che rimbalza sulla home senza attivare nulla. L'attivazione
   reale è in Impostazioni, tre livelli sotto.
2. **Primo errore di import cieco.** Un file non conforme produce «Impossibile
   importare il file. Verificare che rispetti il formato del modello», senza
   dire cosa non va. (La diagnostica *semantica* successiva è invece ottima:
   riga, categoria, e conteggio «47 su 49 importate».)
3. **Export e import non concordano.** Due righe del modello generato da Agicap
   vengono rifiutate dal parser di Agicap.
4. **Stringhe non tradotte.** Nell'interfaccia italiana compare **«Ajouter Mémo»**
   sulla colonna promemoria.
5. **Fuso orario predefinito Europe/Paris** su un account italiano.
6. **Nessuna scorciatoia da tastiera**: né `Ctrl/Cmd+K`, né `/`. La «ricerca
   globale» è in realtà solo una ricerca sui movimenti bancari.
7. **Empty state non azionabile** (§ 4.1).
8. **Asimmetria filtri/colonne** (§ 2.5) e **filtri/regole**: si filtra per
   categoria, conto e stato, ma le regole di categorizzazione accettano solo
   titolo e importo.

---

## 10. Responsive: assente per scelta

`[OSSERVATO]` A **390 px** il layout non si adatta: la barra laterale resta al suo
posto, il menu orizzontale si tronca, la tabella finisce in uno scroll
orizzontale interno che la rende illeggibile. Nessun passaggio a schede, nessuna
navigazione alternativa.

Da notare il **falso verde**: `document.body.scrollWidth` resta 390 px, quindi un
controllo automatico sulla larghezza direbbe «non sfonda». È lo scroll *interno*
della tabella a salvare la misura mentre la pagina resta inutilizzabile.

`[DEDOTTO]` Non è una dimenticanza: esiste un'**app mobile nativa** dedicata. La
scelta è «web da scrivania, mobile da app». Per noi, che non avremo un'app
nativa, non è una scelta imitabile — ma il criterio di misura sì: **la larghezza
del body da sola non basta a dire che una pagina regge il mobile.**

---

## 11. Lessico italiano di dominio

Termini esatti usati dal prodotto, utili come vocabolario di riferimento:

| Termine Agicap | Dove |
|---|---|
| **Piano di tesoreria** | vista principale del previsionale |
| **Situazione di cassa** | area del breve termine |
| **Previsioni a 13 settimane** | vista settimanale |
| **Reale e previsionale** | confronto consuntivo/previsto |
| **Saldo di tesoreria all'inizio del mese** | riga di apertura |
| **Saldo di apertura** / **Saldo di chiusura totale** | righe della vista settimanale |
| **Ad oggi** / **Fine della settimana** | le due metà del periodo corrente |
| **Da categorizzare** | pseudo-categoria di sistema |
| **Stime settimanali** | i valori previsti immessi dall'utente |
| **Giorno di stima** | giorno della settimana in cui collocare la stima |
| **Scoperto autorizzato** · **Liquidità bassa** · **Eccedenza di liquidità** | le tre soglie |
| **Realizzato** / **Previsionale** | le due nature di un flusso |
| **In attesa** | flussi previsti da documenti |
| **Prima nota** | scritture contabili di banca |
| **Area operativa / finanziaria / fiscale / investimenti / equity** | le cinque aree del piano |
| **Rendiconto finanziario** · **Gest. corrente** · **Gest. caratteristica** | gruppi di KPI |
| **Indicatori chiave** | KPI |
| **Riequilibrio automatico** | funzione di giroconto suggerito |

**Perché conta:** usare i termini che il mercato già riconosce elimina un attrito
di apprendimento a costo zero. «Ad oggi / Fine della settimana» è più chiaro di
qualunque perifrasi che potremmo inventare.

---

## 12. Sintesi: i sette accorgimenti a più alto rendimento per noi

Ordinati per rapporto fra valore e costo di implementazione.

1. **Colonna spaccata «ad oggi / fine periodo»** sul periodo in corso (§ 2.1)
2. **Enfasi visiva solo su ciò che richiede azione** — badge per il da-fare,
   testo neutro per il fatto (§ 6)
3. **Tasso di completamento come KPI in cima alla lista**, con l'azione
   risolutiva a fianco (§ 7)
4. **Drill-down in un click su pannello laterale**, con le coordinate dichiarate
   in testa e conteggio+totale prima della lista (§ 3)
5. **Modello di import generato dai dati dell'utente**, con default non
   distruttivo (§ 8)
6. **Descrizioni job-to-be-done nelle voci di menu** simili fra loro (§ 1)
7. **Stato della vista nell'URL**, compreso lo scope della ricerca (§ 2.3)

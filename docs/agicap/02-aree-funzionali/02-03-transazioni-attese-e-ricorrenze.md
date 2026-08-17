# Area funzionale — Transazioni attese e ricorrenze

Osservato l'**11 agosto 2026**. L'area «In attesa» (`/it/app/expected`) è il
serbatoio dei **flussi futuri attesi**: è ciò che alimenta la Situazione di cassa
e le viste a 13 settimane.

Nel nostro account è **`[NON POPOLATO]`**: zero transazioni attese, zero
ricorrenze attive. Restano però osservabili la struttura, il costruttore e i
suggerimenti automatici.

---

## 1. Struttura dell'area

Cinque schede: **Tutte le transazioni · Categorizzazione · In ritardo ·
Frequenze · Frequenze suggerite** `[Beta]`.

`[OSSERVATO]` **Difetto di localizzazione grave:** la scheda principale è
**interamente in inglese** dentro un'interfaccia italiana — «No expected
transaction», «Transactions pending payment can help you better anticipate your
future cash inflows and outflows», colonne «Name», «Category», «Payment
expected», «Amount (incl. …)», controlli «Search», «Name & amount», «Filter».
Le schede *Frequenze* e *Frequenze suggerite* sono invece tradotte correttamente.

La localizzazione è quindi a macchie **dentro la stessa area**, non solo fra aree.

---

## 2. Frequenze suggerite — il rilevamento automatico delle ricorrenze

`[OSSERVATO]` Il sistema analizza i movimenti bancari e **propone ricorrenze già
riconosciute**. Nel nostro account ne ha individuate due, con questa struttura:

| Titolo | Conto | Frequenza rilevata | Importo |
|---|---|---|---|
| (fornitore) | conto operativo | **Ogni mese, 5° giorno del mese** | ~2 k€ |
| (contratto) | conto operativo | **Ogni mese, ultimo giorno lavorativo del mese** | ~1,4 k€ |

**Due osservazioni che contano.**

Primo: **una generazione automatica di previsioni esiste**, e non passa
dall'Excel. Corregge la conclusione parziale che si trarrebbe guardando solo il
Piano di tesoreria.

Secondo, ed è il dettaglio pregiato: la ricorrenza rilevata è espressa come
**«ultimo giorno lavorativo del mese»**, non come «giorno 30». Il sistema
riconosce pattern ancorati al **calendario lavorativo**, non solo al numero del
giorno. Per noi è esattamente il caso di stipendi e F24.

---

## 3. Il costruttore di ricorrenze — modello completo

Dialogo **«Pianificare transazione ricorrente»**.

### Campi

| Sezione | Campo | Valori |
|---|---|---|
| Generale | Titolo | testo (placeholder «ad es. Pagamenti fornitore») |
| Generale | Conto bancario | selezione |
| Generale | Categoria | selezione |
| Importo | **Metodo di inserimento** | `Importo fisso` · **`Importo basato sullo storico`** |
| Importo | Importo *(se fisso)* | numerico |
| Importo | **Periodo di riferimento** *(se storico)* | **`Media degli ultimi 3 periodi`** — unica opzione |
| Data | Data di pagamento | data |
| Frequenza | **Frequenza** | vedi sotto |
| Frequenza | Data di fine | facoltativa |
| Frequenza | **Spostamento in caso di giorno non lavorativo** | `Non modificare la data` · `Il giorno lavorativo precedente` · `Il giorno lavorativo successivo` |

### Le frequenze sono generate dalla data scelta

`[OSSERVATO]` Con la data odierna (martedì 11 agosto 2026, secondo martedì del
mese) il menu propone:

- Ogni settimana, **di martedì**
- Ogni mese, **11° giorno del mese**
- Ogni mese, **2° martedì del mese**
- **Ultimo giorno lavorativo del mese**, ogni mese
- **Frequenza personalizzata**

**Perché funziona:** invece di un costruttore astratto di ricorrenze — dove
l'utente deve tradurre la propria intenzione in una griglia di parametri — offre
**le letture plausibili della data**, in linguaggio naturale. Chi vuole «ogni
secondo martedì» lo trova già scritto. La voce «personalizzata» resta come via
d'uscita per i casi veri.

È il pattern di Google Calendar, e vale la pena copiarlo così com'è.

### Le due righe che rivelano il modello

**«Le prossime 60 transazioni in attesa verranno create automaticamente»**

`[DEDOTTO]` Le occorrenze sono **materializzate** (60 record creati), non
calcolate al volo da una regola. La scelta è dichiarata all'utente, il che evita
la domanda «fin dove arriva la mia previsione».

**«Disattivare le transazioni ricorrenti in attesa per un periodo mobile a breve
termine»** — con la spiegazione: *«Corrisponde al periodo mobile in cui le
previsioni sono coperte da altre fonti (ad es. pagamenti programmati)»*.

**Questo è il concetto più raffinato dell'intera area.** Nel breve termine la
previsione ha una fonte migliore — i pagamenti realmente programmati — e quindi
la ricorrenza **si spegne da sola** per non duplicare il flusso. È la risposta al
problema del doppio conteggio *fra fonti previsionali diverse*, che si affianca
alla soluzione già vista per il doppio conteggio *fra previsto e realizzato*
(la stima assorbita dal consuntivo, cfr. `04-logiche-di-calcolo.md` § 1).

Messi insieme, i due meccanismi dicono che Agicap ha una gerarchia di
affidabilità delle fonti: **movimento reale > pagamento programmato > ricorrenza
stimata**, e in ogni periodo vince la fonte più affidabile disponibile.

---

## 4. Il limite della previsione da storico

`[OSSERVATO]` Scegliendo «Importo basato sullo storico», l'unico periodo di
riferimento disponibile è **«Media degli ultimi 3 periodi»**. Nessuna alternativa:
non 6 o 12 mesi, non la mediana, nessuna esclusione dei valori anomali, nessuna
correzione di stagionalità.

**Perché per noi è un limite serio.** WEISS è stagionale: una media dei tre mesi
precedenti calcolata a settembre include luglio e agosto e sovrastima
sistematicamente l'autunno; calcolata a marzo sottostima la primavera. Per un
horeca con uno stand stagionale il metodo è strutturalmente distorto.

Se replichiamo il concetto, la finestra va resa configurabile e va prevista
almeno l'alternativa «stesso periodo dell'anno precedente».

---

## 5. Cosa resta da verificare

- Cosa contiene «Frequenza personalizzata» (griglia completa di ricorrenza)
- La scheda **«In ritardo»**: come definiscono il ritardo e cosa mostrano
- La scheda **«Categorizzazione»** delle attese (icona AI)
- Se accettando un suggerimento di *Frequenze suggerite* si crea una ricorrenza
  modificabile o un oggetto di sola lettura

# NoBadge: analisi funzionale

**Data:** 5 agosto 2026 · **Prova attiva fino al:** 20 agosto 2026 · **Prodotto:** portal.nobadge.it

Analisi di un SaaS italiano di rilevazione presenze, condotta durante la prova gratuita con
le credenziali aziendali Weiss, per capire quali funzioni valga la pena avere anche nel
nostro gestionale.

**Metodo e limiti.** Osservazione del comportamento del prodotto da utente autorizzato:
schermate, flussi, endpoint chiamati dal frontend e forma dei dati restituiti. Non è stato
scaricato né decompilato il codice del prodotto. Studiare le funzionalità di un software è
lecito; copiarne l'implementazione no — tutto ciò che segue va reimplementato con codice
nostro.

Il tenant di prova era vuoto (creato lo stesso giorno, due utenti, nessuna timbratura),
quindi report e calcoli non sono stati osservati su dati reali: la ricostruzione delle
regole di calcolo viene dai testi di aiuto dei form, che sono espliciti e circostanziati.

---

## 1. Impianto tecnico

Blazor WebAssembly (.NET) con libreria di componenti MudBlazor, API REST sotto `/api/*`,
applicazione multi-tenant. Autenticazione con JWT — nei claim ci sono ruolo, `tenant_id` e
lingua — più refresh token, entrambi conservati in `localStorage`. PWA installabile con
notifiche push, e una pagina di istruzioni per l'installazione su Android e iOS. Google Maps
per la scelta della sede. Stripe per l'abbonamento: 5,04 € per utente al mese.

Le funzionalità sono governate da interruttori a livello di tenant, interrogati all'avvio
(`/api/timebank/enabled`, `/api/department/enabled`, `/api/shift/enabled`,
`/api/expense-reimbursements/is-enabled`): l'applicazione si accende a moduli.

Nomenclatura personalizzabile: il tenant Weiss mostra "Locali" e "Locale" dove il prodotto
di base dice "Progetti" e "Progetto" (`/api/tenant/custom-labels`). È un dettaglio piccolo
con un effetto grande sull'adozione — il software parla la lingua del settore del cliente.

L'onboarding è guidato, con una checklist persistente in home: configura la sede di lavoro,
invita i dipendenti, attiva le notifiche. In base al settore dichiarato, il sistema semina
ruoli coerenti: per la ristorazione ha creato *Manager Ristorante*, *Cameriere*, *Cuoco*.
Nota: quei ruoli sono mansioni, non insiemi di permessi — l'elenco dei permessi è vuoto.

---

## 2. La politica di rilevazione presenze

È il pezzo di maggior valore, e quello che a noi manca. Non è una configurazione unica
aziendale ma una **regola riusabile e assegnabile**, con un nome ("Full time", "Part time 4
ore"). Parametri, con le spiegazioni originali del prodotto:

### Finestra della giornata

| Parametro | Descrizione |
|---|---|
| Orario di inizio giornata lavorativa | Riferimento per il calcolo dell'inizio effettivo delle ore lavorate |
| Orario di fine giornata lavorativa | Limite massimo fino al quale le ore vengono conteggiate |

### Pause

| Parametro | Descrizione |
|---|---|
| Inizio e fine pausa pranzo | Le ore di lavoro in questo intervallo non vengono conteggiate |
| Finestra pausa pranzo (min) | Minuti prima dell'inizio pausa entro cui compare al dipendente il pulsante "Inizia pausa pranzo". Con valore 30 e pausa alle 13:00, il pulsante appare dalle 12:30 |
| Pause aggiuntive | Elenco di {nome, inizio, fine} |

### Flessibilità e arrotondamenti

| Parametro | Descrizione |
|---|---|
| Tempo flessibile (minuti) | Margine prima dell'inizio e dopo la fine giornata entro cui l'arrivo anticipato o la partenza posticipata contano come lavoro effettivo |
| Intervallo di arrotondamento (minuti) | Multiplo a cui i minuti effettivi vengono arrotondati per difetto |
| Tolleranza arrotondamento (min) | Se il dipendente entra entro questi minuti dall'inizio dell'intervallo, l'orario resta esatto. *Esempio del prodotto: con intervallo 30 e tolleranza 5, entrata alle 9:03 resta 9:03; alle 9:06 diventa 9:30* |
| Intervallo arrotondamento uscita (min) | Opzionale, solo per l'uscita, arrotondata in giù. Vuoto = si usa l'intervallo condiviso |
| Tolleranza uscita (min) | Opzionale: se esce entro questi minuti oltre il confine dell'intervallo, l'orario resta esatto |

### Limiti e classificazione

| Parametro | Descrizione |
|---|---|
| Ore giornaliere massime | Anche lavorando oltre, le ore extra non entrano nel totale |
| Ore settimanali da contratto | Per il confronto fra lavorate e dovute. Vuoto = nessun confronto |
| Sabato come straordinario | Tutte le ore del sabato diventano straordinario |
| Blocca timbrature la domenica | Impedisce di timbrare |
| Timbratura singola (senza uscita) | Si timbra una sola volta e la giornata è registrata con le ore riconosciute. Pensata per presenze in ufficio o su cantiere |
| Politica predefinita | Flag di default del tenant |

### Due scelte di progettazione da imitare

**La gerarchia.** La politica assegnata al locale sovrascrive quella del dipendente, che a
sua volta sovrascrive la predefinita aziendale. Il testo nel form di modifica del locale è
esplicito: *"Se impostata, questa policy sovrascrive quella del dipendente per tutte le
timbrature su questo progetto"*.

**Il calcolatore di prova.** Il form contiene un simulatore: si inseriscono orario di
entrata e di uscita e si vede il risultato del calcolo *prima* di salvare. Con cinque
parametri di arrotondamento interagenti, è l'unico modo perché chi configura capisca cosa
sta facendo. È la parte che conviene copiare per prima.

---

## 3. Modalità di tracciamento

Configurabili **per singola coppia dipendente↔locale**, non per azienda:

1. **Tracciamento basato sulla posizione** — geofence, con raggio in metri sulla sede
2. **Tracciamento con QR Code** — kiosk in sede
3. **Inserimento manuale ore** — chi non timbra dichiara le ore
4. **Tracciamento senza restrizioni** — si timbra ovunque, con registrazione GPS opzionale
5. **Solo in visualizzazione** — accesso senza timbratura

La sede porta indirizzo, coordinate e raggio di geofence (il tenant di prova aveva 20 metri
su piazza del Popolo a Sacile).

---

## 4. Impostazioni aziendali

Dal pannello di amministrazione e da `/api/tenant/settings`:

- **Note alla timbratura in uscita**: facoltative, obbligatorie o assenti
- **Divisione ore in uscita**: il dipendente può ripartire le ore su più locali
- **Progetto delle ore lavorate**: se entrata e uscita sono su locali diversi, quale dei due
  viene addebitato
- **Trasferte multiple**: come trattare le ore di viaggio quando si lavora su più cantieri
  nello stesso giorno (somma di tutti i cantieri, o altre politiche)
- **Tracciamento posizione in modalità libera**: registra il GPS anche senza geofence
- **Timbratura fuori raggio**: consentita ed evidenziata per revisione, oppure bloccata
- **Notifiche timbratura agli amministratori** a ogni entrata e uscita
- **Chiusura automatica delle uscite dimenticate**, con offset configurabile (180 minuti nel
  default osservato), momento di attivazione e criterio per l'orario di uscita da attribuire
- **Calendario presenze** visibile o nascosto nella home del dipendente
- **Fuso orario** esplicito a livello di tenant (Europe/Rome)
- Interruttori per richieste ferie, mancate timbrature, rimborsi spese, reparti e turni

---

## 5. I giri di approvazione

Lo schema si ripete identico per cinque domini — richiesta → coda → approva/rifiuta con nota
del revisore — ed è la struttura portante del prodotto.

**Timbrature mancanti.** Il dipendente compila {locale, data, orario di entrata, orario di
uscita, note} e la richiesta va a un amministratore. La coda admin ha colonne richiedente,
progetto, data, entrata, uscita, durata, stato, note, azioni. Il dipendente vede le proprie
richieste con stato, approvatore e note dell'approvatore. **È il flusso che a noi manca del
tutto**: da noi la correzione può partire solo dall'amministratore.

**Ferie e permessi.** Giornata intera o permesso orario; tipi disponibili: Ferie, Malattia,
Permesso, ROL, Ex Festività, Altro. L'amministratore può inserire assenze per un gruppo di
dipendenti o per un intero reparto in un colpo solo, e dispone di tre viste: elenco,
riepilogo e calendario mensile.

**Ore speciali.** Categorie definite dall'azienda (gli esempi del prodotto: ore di pioggia,
reperibilità, formazione) con una coda di approvazione dedicata.

**Variazioni di turno** e **rimborsi spese**, con lo stesso impianto.

---

## 6. Il contorno

- **Reparti** con nome, descrizione e colore; i turni si pianificano per reparto e il
  prodotto lo impone come primo passo ("La gestione turni parte dai reparti").
- **Comunicazioni aziendali**: titolo, messaggio, priorità, data evento, scadenza, e
  destinatari scelti fra tutti i dipendenti, un reparto, un ruolo o un locale. Compaiono nel
  calendario del dipendente.
- **Promemoria di timbratura push**: nome, tipo (entrata o uscita), orario, giorni della
  settimana attivi, "salta se già timbrato", titolo e corpo della notifica, destinatari
  selezionati uno a uno. La lista dei destinatari segnala chi non ha abilitato le push.
- **Banca ore**: maturato, usato, liquidato, saldo corrente, con movimenti per periodo.
- **Documenti personali** con cartelle, più il caricamento massivo dei cedolini.
- **Trasferte**: policy per locale che riconosce ore di viaggio al superamento di una soglia
  di ore lavorate ("soglia di 3 ore con 2 ore viaggio: ogni giornata con almeno 3 ore
  lavorate aggiunge 2 ore di trasferta").
- **Report orario mensile** esportabile in Excel, più un calendario mensile per dipendente
  con il totale ore, visibile sia all'amministratore (sulla scheda del dipendente e sul
  locale, dove diventa "Ore del Team") sia al dipendente in home.

---

## 7. Confronto con il nostro gestionale

### Dove siamo già pari o avanti

Timbratura GPS con verifica del geofence lato server, coda offline su IndexedDB con
sincronizzazione differita, rilevazione automatica delle anomalie, chiusura automatica delle
sessioni aperte, ferie con tipi e saldi, export per le paghe, portale dipendente, PWA con
push. In più abbiamo cose che NoBadge non ha e non può avere, perché fa solo presenze: la
generazione automatica dei turni con vincoli personali e relazionali, il legame con la
contabilità e il costo del lavoro, la chiusura di cassa.

### Il divario reale

1. **Nessuna regola di calcolo configurabile.** Sommiamo il tempo fra entrata e uscita.
   Niente arrotondamenti, tolleranze, flessibilità, tetto giornaliero, deduzione delle
   pause per regola, confronto con le ore da contratto. È il divario principale.
2. **Nessuna richiesta di correzione dal dipendente**: solo l'amministratore può inserire
   una timbratura mancante.
3. **Nessun cartellino mensile**: abbiamo l'export aggregato, ma nessuna schermata dove una
   persona veda il proprio mese.
4. **Nessun promemoria di timbratura**, benché l'infrastruttura push esista già.
5. **Una sola sede** per decisione architetturale, mentre Weiss ne ha tre.
6. **Nessuna gestione esplicita del fuso orario** — vedi sotto.

### Un problema che l'analisi ha fatto emergere

NoBadge configura il fuso orario a livello di tenant e lo dichiara nell'interfaccia. Nel
nostro codice `Europe/Rome` non compare mai: le ore notturne si classificano con `getHours()`
e le giornate si delimitano con `startOfDay()`, entrambi sul fuso del server. In produzione
il server è in UTC, quindi la fascia notturna slitta di una o due ore secondo l'ora legale, e
l'uscita dopo mezzanotte di un turno 06:00→03:00 viene attribuita al giorno sbagliato. È un
errore che arriva in busta paga, ed è stato messo in cima al piano di lavoro.

---

## 8. Cosa portiamo a casa

In ordine di valore, come da piano concordato:

1. Il fuso orario e il concetto di giornata lavorativa che scavalca la mezzanotte
2. Il motore delle regole orario, con la gerarchia di applicazione e il calcolatore di prova
3. I luoghi di lavoro con geofence proprio, per distinguere i tre locali
4. Il cartellino mensile, per amministratore e dipendente
5. Le richieste di correzione che partono dal dipendente
6. Promemoria push, note obbligatorie all'uscita, comunicazioni aziendali

Restano fuori per scelta: il kiosk QR, i rimborsi spese, la banca ore, le trasferte.

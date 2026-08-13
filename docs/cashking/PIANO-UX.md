# Piano — Portare l'analisi UI/UX di Cash King al livello del resto del corpus

> ## ✅ ESEGUITO l'11 agosto 2026
>
> Tutti i gruppi da A a E sono stati eseguiti e i risultati sono in
> `05-analisi-ux.md`, capitoli 3.4-3.8, 5.3-5.4, 6.5-6.9, 7.1, 8.4-8.5, 9.2b,
> 10.2, 12.2b, 13c-bis, più sei nuove voci nel catalogo del capitolo 13 e cinque
> nell'elenco «Da non copiare». Il capitolo 14 è stato aggiornato.
>
> **Ambiente ripristinato e verificato:** crediti 202.760,35 €, debiti
> 87.816,07 €, ragione sociale `Weiss Srl`, `vatPeriod: monthly`. Le due sonde
> longitudinali e il cliente di prova sono al loro posto. Nessun record
> `TEST_CK_UX_*` residuo.
>
> **Restano aperti** i quattro punti elencati in fondo al capitolo 14 di
> `05-analisi-ux.md`, tutti per la stessa ragione: eseguirli avrebbe alterato lo
> stato di riconciliazione o venti documenti del dataset dimostrativo, che
> servono alle riletture del 17 e del 21-24 agosto.
>
> Il documento che segue resta come traccia del metodo usato.

Documento di consegna, scritto l'11 agosto 2026 per essere eseguito da una
sessione che **non ha memoria** dell'analisi precedente. Contiene tutto il
contesto necessario.

---

## 1. Perché questo piano esiste

L'analisi competitiva di **Cash King** (cashking.biz), SaaS italiano di
tesoreria, è stata svolta seguendo `docs/analisi-competitiva/METODO.md`. Il
corpus è in `docs/cashking/` e conta sedici documenti.

Il documento `05-analisi-ux.md` copre la Fase 3 del metodo ed è il più lungo del
corpus (1.293 righe), ma è anche **il più debole per qualità delle prove**:

| Documento | `[OSSERVATO]` | `[VERIFICATO]` | `[DEDOTTO]` |
|---|---|---|---|
| `04-logiche-di-calcolo.md` | molte | **decine** | poche |
| `05-analisi-ux.md` | 84 | **3** | 59 |

La ragione è strutturale: quel capitolo è stato scritto da un subagente leggendo
appunti e screenshot, e uno screenshot non si può cliccare. Le parti davvero
misurate sono solo i capitoli 13b (stati vuoti), 13c (persistenza filtri) e 13d
(mobile).

### La lacuna, misurata
Cercando nel documento, queste parole compaiono **zero volte**:

`toast` · `undo` · `aggiornamenti ottimistici` · `salvataggio automatico` ·
`editing inline` · `viste salvate` · `scroll infinito` · `skeleton`

Il metodo però le chiede esplicitamente, in due punti:

> **Tabelle** — colonne di default e loro ordine, ordinamenti, filtri, viste
> salvate, azioni bulk, editing inline, paginazione vs scroll infinito,
> persistenza dei filtri nell'URL
>
> **Feedback** — toast, conferme, undo, salvataggio automatico vs esplicito,
> aggiornamenti ottimistici

Di tutto questo è documentato solo: la paginazione, i filtri, la persistenza in
`localStorage`, e le **conferme** (incontrate per forza). Manca il resto, perché
sono cose che si osservano solo **interagendo**, non guardando.

**Obiettivo di questo piano:** portare i capitoli 3, 5, 6, 7 e 8 di
`05-analisi-ux.md` allo stesso livello di evidenza del resto, sostituendo
deduzioni con osservazioni dirette.

---

## 2. Ambiente e vincoli — leggere prima di toccare qualsiasi cosa

### 2.1 Accesso
Credenziali in `credenziali-cashking.env` alla radice del progetto (già in
`.gitignore`, non committarlo mai). Login su `https://cashking.biz/login`.
**L'accesso scade il 30 agosto 2026** e non è riproducibile.

### 2.2 Il browser è un'istanza sola
Gli strumenti Playwright puntano a **un'unica istanza condivisa** fra la
sessione principale e ogni subagente. Il 10 agosto tre subagenti lanciati in
parallelo hanno spostato la scheda nel mezzo di una misurazione e chiuso la
sessione autenticata.

> **Regola:** il lavoro al browser lo fa **solo la sessione principale**. Se
> deleghi qualcosa a un subagente, il prompt deve vietargli esplicitamente ogni
> strumento `browser_*`.

### 2.3 Ambiente sandbox, ma con tre divieti
I dati sono dimostrativi e si possono creare, modificare e cancellare. Però:

1. **Prefissa ogni record di prova con `TEST_CK_`.**
2. **Non attivare gli addon a pagamento** (F24 Facile, Promemoria automatici,
   Retail) e non usare i loro endpoint anche dove rispondono 200: sarebbe
   aggirare un paywall, cosa che il metodo vieta.
3. **Non inviare nulla verso terzi**: niente inviti a membri del team, niente
   solleciti. Se un flusso arriva al punto di spedire un'email, fermarsi e
   documentare il modulo.

### 2.4 Cose che devono restare come sono
- **Le due sonde longitudinali `TEST_CK_SCAD_3GG` e `TEST_CK_SCADUTA_IERI` non
  vanno cancellate.** Servono alle riletture del 17 e del 21-24 agosto
  documentate in `04b-comportamenti-nel-tempo.md`. Esiste anche il cliente
  `TEST_CK_Cliente Prova`, che va lasciato.
- **La periodicità IVA in `/settings/company` deve restare «Mensile».**
- Valori di riferimento attuali, da non alterare in modo permanente:
  crediti aperti **202.760,35 €**, debiti aperti **87.816,07 €**. Se un
  esperimento li sposta, ripristinarli cancellando i record creati e
  verificando con `/api/invoices/totals`.

### 2.5 Convenzione dei tag
`[OSSERVATO]` visto direttamente · `[VERIFICATO]` confermato da un esperimento
con input noti o da una ricerca esaustiva dichiarata · `[DEDOTTO]` ricostruito ·
`[IPOTESI]` congettura. Mai presentare un'ipotesi come un fatto.

### 2.6 Isolamento
L'analisi riguarda **solo Cash King**. Non leggere la documentazione di altri
concorrenti (`assets/trezy/`, `assets/agicap/` e simili), non fare confronti di
merito con il nostro gestionale. È lecito e richiesto indicare **come si
tradurrebbe** un accorgimento sul nostro stack (Next.js 14 App Router, React,
Tailwind, shadcn/ui, Prisma su PostgreSQL); non è lecito dire chi fa meglio.

### 2.7 Lingua
Tutto in italiano corretto, con accenti. Frasi complete, non elenchi telegrafici
dove serve una spiegazione.

---

## 3. La tecnica che serve per metà degli esperimenti

Tre delle lacune — stati di caricamento, aggiornamenti ottimistici, e il
comportamento durante una richiesta lenta — sono invisibili perché il prodotto è
veloce. Si rendono osservabili **rallentando la rete dall'interno della pagina**,
con un intercettore su `fetch` installato via `browser_evaluate`:

```js
() => {
  const originale = window.fetch;
  window.__ritardoAttivo = true;
  window.fetch = async (...args) => {
    if (window.__ritardoAttivo) await new Promise(r => setTimeout(r, 4000));
    return originale(...args);
  };
  return 'intercettore installato: ogni fetch ritarda di 4 secondi';
}
```

Per disattivarlo: `() => { window.__ritardoAttivo = false; return 'ok'; }`
(oppure basta ricaricare la pagina).

Con il ritardo attivo si può: navigare e fotografare lo **stato di caricamento**;
premere Salva e vedere se la riga cambia **prima** che il server risponda
(aggiornamento ottimistico); osservare se i pulsanti si disabilitano durante
l'attesa.

Un secondo intercettore utile, per catturare il **contenuto degli export** senza
dipendere dai download:

```js
() => {
  window.__export = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = function (blob) {
    const fr = new FileReader();
    fr.onload = () => window.__export.push({ tipo: blob.type, contenuto: String(fr.result).slice(0, 4000) });
    fr.readAsText(blob);
    return orig.call(URL, blob);
  };
  return 'ok';
}
```

**Nota utile:** l'interfaccia è strumentata con attributi `data-testid` parlanti
(`button-add-invoice`, `input-filter-search`, `button-delete-<id>`), quindi
conviene sempre elencarli con
`Array.from(document.querySelectorAll('main [data-testid]')).map(e => e.getAttribute('data-testid'))`
prima di cercare selettori fragili. I menu a tendina sono **Radix**, non
`<select>` nativi: vanno aperti con un clic e poi si sceglie con
`[role="option"]`.

---

## 4. Gli esperimenti, in ordine di esecuzione

Ordine pensato per costo crescente e per riuso: i record creati nel gruppo A
servono anche a B e C.

### Gruppo A — Feedback di interazione → capitolo 6 di `05-analisi-ux.md`

**A1. Toast e notifiche di esito.**
Creare una fattura `TEST_CK_UX_TOAST` da `/invoices` (pulsante
`button-add-invoice`; servono numero, cliente, data, scadenza, imponibile,
aliquota). Subito dopo il salvataggio, catturare con
`document.querySelectorAll('[role="status"], [data-sonner-toast], .toast, [aria-live]')`
il testo, e con uno screenshot la posizione. Misurare **quanto resta a schermo**
(ricontrollare dopo 3 e dopo 8 secondi). Verificare se il toast porta
un'**azione** (annulla, vai al record) o è solo informativo.
*Da annotare:* esiste o no; posizione; durata; se è cliccabile; se compare anche
in caso di errore (l'errore si provoca facilmente: vedi A5).

**A2. Undo dopo cancellazione.**
Cancellare `TEST_CK_UX_TOAST` (pulsante `button-delete-<id>` nella riga, poi
conferma). Osservare **immediatamente** se compare un «Annulla» o «Ripristina».
Verificare anche se il record finisce in un cestino recuperabile: la pagina
`/transactions` ha una scheda «Cestino» con contatore, e il modello ha un campo
`trashedAt`; controllare se esiste l'equivalente per le fatture.
*Da annotare:* undo immediato sì/no; cestino sì/no; per quali entità.

**A3. Salvataggio automatico contro esplicito.**
In `/settings/company` modificare la sola «Ragione Sociale» aggiungendo
` TEST_CK` in fondo, poi **spostare il fuoco senza premere Salva** e ricaricare
la pagina: il valore è stato salvato o perso? Ripetere in un modulo di
dettaglio (modifica di una fattura).
⚠️ Al termine **rimettere la ragione sociale originale**, che è `Weiss Srl`.
*Da annotare:* quali schermate salvano da sole, quali richiedono conferma
esplicita, se esiste un indicatore di «modifiche non salvate».

**A4. Aggiornamenti ottimistici.**
Installare l'intercettore di ritardo del capitolo 3. Con il ritardo attivo,
approvare o modificare qualcosa e osservare se la riga cambia **prima** che la
risposta arrivi. Fotografare lo stato intermedio.
*Da annotare:* ottimistico o pessimistico; se i pulsanti si disabilitano durante
l'attesa; se compare uno spinner locale o globale.

**A5. Stato di errore, già parzialmente noto.**
È già documentato in `02-aree-funzionali/02-05-regole-e-sinonimi.md`, cap. 1b:
la creazione di una regola in `/settings/rules` **fallisce sempre** con 400
perché il client non invia `companyId`, e compare una finestra d'errore che
riporta il dettaglio tecnico e offre di aprire un ticket allegando
automaticamente screenshot e log. Va **spostata dentro il capitolo 5 o 6 di
`05-analisi-ux.md`**, che è dove la sessione di sintesi la cercherà, con il
rimando a `assets/cashking/screenshots/16-errore-con-apertura-ticket.png`.

### Gruppo B — Tabelle → capitolo 3

**B1. Ordinamento.**
Su `/invoices` e su `/transactions`, cliccare le intestazioni di colonna.
Verificare: se ordinano; se il clic ripetuto inverte e se esiste un terzo stato
(nessun ordinamento); se compare un indicatore visivo; se l'ordinamento
sopravvive a un ricaricamento e **dove** viene memorizzato (controllare
`localStorage`, dove i filtri stanno già sotto la chiave
`cashking_invoice_filters`). Osservare anche la richiesta di rete: la lista
fatture usa `/api/invoices/paginated` con parametri `sortField` e
`sortDirection`, quindi l'ordinamento è probabilmente lato server — da
confermare.

**B2. Editing inline.**
Doppio clic su una cella di una riga `TEST_CK_`, poi clic singolo prolungato,
poi verificare se esiste un pulsante di modifica per riga distinto da quello che
apre il modale. *Da annotare:* esiste o no; su quali colonne; come si conferma.

**B3. Selettore delle colonne.**
Tutte le liste principali hanno un pulsante «Colonne». Aprirlo e documentare:
quali colonne si possono nascondere, se si possono **riordinare**, se la scelta
persiste al ricaricamento e dove.

**B4. Viste salvate.**
Cercare un'affordance per salvare una combinazione di filtri con un nome.
Se non esiste, dichiararlo come **ricerca esaustiva**: cercata in `/invoices`,
`/transactions` e `/cash-command`, assente.

**B5. Azioni in blocco.**
Selezionare due o tre righe con le caselle (`checkbox-row-<id>`,
`checkbox-select-all`) e documentare quali azioni compaiono, se appare una barra
contestuale, e se l'azione chiede conferma. **Non eseguirle** su record che non
siano `TEST_CK_`.

**B6. Paginazione contro scroll infinito.**
Già osservata la paginazione classica con scelta della dimensione di pagina.
Confermare che non esista scroll infinito da nessuna parte, e annotare le
dimensioni di pagina offerte.

### Gruppo C — Stati di caricamento → capitolo 5

**C1. Skeleton o spinner.**
Con l'intercettore di ritardo attivo, navigare su `/dashboard`, `/invoices`,
`/cash-command` e `/due-schedule` e fotografare i primi secondi. Distinguere:
scheletri che riproducono la forma del contenuto, spinner generici, oppure nulla
(pagina bianca). *Da annotare:* quale strategia, se è coerente fra le schermate,
e se i quattro indicatori in testata mostrano un valore vecchio mentre caricano.

**C2. Stato di errore di rete.**
Sostituire l'intercettore con uno che fa fallire le chiamate
(`() => { window.fetch = () => Promise.reject(new Error('rete')); return 'ok'; }`),
poi navigare e osservare. Ricaricare la pagina per ripristinare.
*Da annotare:* cosa mostra quando il server non risponde, se offre di riprovare.

### Gruppo D — Drill-down misurato → capitolo 7

**D1. Contare i clic** per tre percorsi, partendo dal cruscotto:
1. dal numero «Crediti» alla singola fattura che lo compone;
2. dal punto minimo del «Radar di Liquidità» in Cash Command al movimento che lo causa;
3. dal totale «Da incassare» dello Scadenziario all'elenco delle fatture di un mese.

*Da annotare:* numero di clic, se il contesto (filtro, periodo) viene trasferito
alla schermata di destinazione, e se si torna indietro senza perdere lo stato.

### Gruppo E — Micro-interazioni → capitoli 8 e 9

**E1. Stati al passaggio del mouse.** Su righe di tabella, schede e pulsanti:
cambia il fondo, compare un bordo, appaiono azioni nascoste? Nel prodotto sono
presenti classi `hover-elevate` e `active-elevate-2`, quindi esiste un sistema
di elevazione: documentarne il comportamento.

**E2. Tastiera e fuoco.** Percorrere un modulo con Tab: l'anello di fuoco è
visibile? L'ordine è sensato? `Invio` invia il modulo? `Esc` chiude i modali
(verificato di sì almeno una volta)?

**E3. Semantica del colore, verificata e non deducita.** Il capitolo 8 attuale è
in buona parte dedotto dagli screenshot. Rileggere a schermo: colore di entrate
e uscite, dello scaduto, della banda «Zona Negativa», delle tre fasce di
confidenza della riconciliazione (alta, media, bassa), e degli stati «Migliore /
In linea / Peggiore» del report DSO/DPO. Verificare se il colore è **l'unico**
portatore di informazione o se è sempre accompagnato da testo o icona — è la
domanda che conta per l'accessibilità.

---

## 5. Come scrivere i risultati

**Non creare un nuovo documento.** Integrare `docs/cashking/05-analisi-ux.md`
nei capitoli esistenti: 3 (tabelle), 5 (stati), 6 (feedback), 7 (drill-down),
8 (colori), 9 (onboarding e affordance).

Regole:
- Sostituire le frasi dedotte con quelle osservate, non affiancarle. Se una
  deduzione precedente si rivela **sbagliata**, dirlo esplicitamente: il corpus
  contiene già diverse correzioni dichiarate ed è un pregio, non un difetto.
- Ogni nuovo accorgimento va aggiunto anche al **catalogo del capitolo 13**, con
  le tre colonne: cosa fa, perché funziona, come lo realizziamo sul nostro stack
  (componente shadcn, rotta App Router, modifica Prisma se serve).
  ⚠️ Il capitolo 13 è un **catalogo, non un backlog**: non ordinarlo per costo e
  non aggiungere stime di sforzo. La prioritizzazione spetta alla sessione di
  sintesi comparata, e il metodo lo vieta esplicitamente qui.
- Screenshot in `assets/cashking/screenshots/`, proseguendo la numerazione
  (l'ultimo è `20-acid-test-in-stato-di-rischio.png`), con nomi del tipo
  `21-area-cosa-mostra.png`.
- Aggiornare il capitolo 14 «Cosa resta da osservare» togliendo ciò che è stato
  chiuso.

---

## 6. Pulizia finale, obbligatoria

Al termine, verificare con una chiamata a `/api/invoices/totals` che i crediti
aperti siano tornati a **202.760,35 €** e i debiti a **87.816,07 €**, e con
`/api/company-settings` che `vatPeriod` sia `monthly` e la ragione sociale sia
`Weiss Srl`.

Elencare in chiusura ogni record `TEST_CK_UX_*` creato e confermare di averlo
rimosso. **Le due sonde `TEST_CK_SCAD_3GG` e `TEST_CK_SCADUTA_IERI` e il cliente
`TEST_CK_Cliente Prova` restano.**

---

## 7. Cosa NON fare

- Non toccare `REVISIONE.md`: è il verbale di una revisione indipendente.
- Non premere «Correggi Tutte» nel report `/prints/invoice-inconsistencies`:
  modificherebbe quindici documenti dimostrativi e cancellerebbe l'anomalia più
  istruttiva del dataset.
- Non attivare addon, non inviare inviti né solleciti.
- Non accedere alle rotte `/sysadmin/*`: sono l'area di amministrazione del
  fornitore, fuori dal perimetro del nostro account.
- Non aggiungere al capitolo 13 stime di sforzo o ordinamenti per priorità.

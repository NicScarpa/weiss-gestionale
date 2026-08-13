# Fase 1 — piano operativo

Redatto l'11 agosto 2026, a Fase 0 quasi conclusa. Serve a entrare nel prodotto
con una lista di domande già scritte, invece di navigare a caso.

Ambiente: **produzione**, dati reali WEISS. Accesso: **parziale**.
Scadenza dell'accesso: **18 agosto 2026** — restano 7 giorni.

---

## 0. Regole che valgono per ogni minuto di questa fase

Non sono formalità: in produzione un clic sbagliato ha effetti nel mondo reale.

- **Sola lettura per default.** Nessun record creato, modificato o cancellato.
- Prima di ogni clic su un pulsante che non sia navigazione, la domanda è:
  «se va a buon fine, cambia qualcosa nella realtà o solo nella schermata?»
  Se è la prima: **fermarsi e chiedere all'utente**.
- Niente invio di solleciti, disposizioni, inviti a utenti, esportazioni verso
  terzi, connessione di nuovi conti, import di storico.
- **Niente API key.** La documentazione spiega come crearne una dalle
  impostazioni: crearla sarebbe una scrittura in produzione, e usarla sarebbe un
  canale fuori dalla UI. Fuori perimetro, e non si negozia in corsa.
- **Niente forzature del gating**: nessuna manipolazione di URL o parametri per
  raggiungere moduli non inclusi nel piano. Le aree bloccate si documentano
  dall'esterno.
- **HAR sanificati**: rimuovere `Authorization` e `Cookie`, verificare che i
  payload non contengano IBAN, anagrafiche o importi reali prima di salvarli.
- **Screenshot**: evitare di inquadrare dati identificativi reali; se inevitabile,
  oscurarli. Il repo è pubblico, `assets/agicap/` è già in `.gitignore`.

---

## 1. Sequenza di apertura

1. Login su `https://app.agicap.com/` con le credenziali in
   `credenziali-agicap.env`
2. **Prima di toccare qualsiasi cosa**: screenshot della schermata di atterraggio.
   È l'unica volta in cui la si vede senza sapere cosa aspettarsi — la prima
   impressione è un dato che si può raccogliere una volta sola.
3. Annotare: dove atterra l'utente, cosa c'è in primo piano, quale periodo è
   selezionato di default, quali conti sono collegati, quanto storico è presente.
4. Verificare se compaiono modali di novità, tour, o hint di onboarding:
   catturarli prima di chiuderli.

---

## 2. Inventario delle rotte

Obiettivo del deliverable `01-inventario-rotte.md`: due elenchi **separati**.

**Accessibili** — per ciascuna: URL, titolo, scopo, entità mostrate, se popolata.

**Bloccate** — per ciascuna: come si manifesta il blocco (voce assente, voce
visibile ma disabilitata, messaggio di upgrade), e **quale piano la
sbloccherebbe** secondo quanto ricostruito in `pricing.md`.

Fonte di controllo: `rotte-da-bundle-js.md`, che elenca le rotte esistenti nel
codice dell'applicazione. Serve a distinguere i tre casi che è facile confondere:

| Caso | Come si riconosce | Tag |
|---|---|---|
| La funzionalità non esiste | assente dal bundle, dalla knowledge base e dal listino | `[ASSENTE]` |
| Esiste ma non è nel nostro piano | presente nel bundle o nel listino, non raggiungibile | `[NON ACCESSIBILE]` |
| Esiste, è nostra, ma è vuota | raggiungibile, nessun dato dentro | `[NON POPOLATO]` |

Confondere questi tre casi è l'errore che falsa l'intera sintesi comparativa.
Una schermata vuota non è una funzionalità mancante.

---

## 3. Le domande a cui questa fase deve rispondere

Scritte prima di entrare, così la navigazione ha un bersaglio.

### 3.1 La contraddizione sulla granularità — priorità massima

Le pagine prodotto dichiarano granularità «giornaliero, settimanale, 13
settimane, annuale». Il listino vende le 13 settimane a maglia giornaliera nel
modulo base. Ma tre recensori indipendenti, due dei quali del settore Food &
Beverages, dicono che il minimo reale è **mensile**
(cfr. `recensioni-terze.md` § 2.12).

Non si risolve leggendo: si guarda il selettore di periodo del previsionale e si
verifica quali granularità offre davvero, e se il passo giornaliero è pieno o è
una vista mensile suddivisa. **È il primo test da fare.**

### 3.2 I corrispettivi

Utenti italiani del retail riferiscono che Agicap importa le fatture dal cassetto
fiscale ma **non i corrispettivi** (cfr. `recensioni-terze.md` § 2.13). Per un
horeca che incassa al banco è la differenza fra uno strumento utile e uno cieco
sulla maggior parte del fatturato.

Da verificare: esiste una voce di import corrispettivi? Come si registrano gli
incassi non fatturati? Esiste un concetto di «vendita al banco» o di incasso
aggregato giornaliero?

### 3.3 Il previsionale: da dove nascono le previsioni

Quali fonti alimentano la previsione — fatture aperte, ricorrenze, contratti,
medie storiche, immissione manuale? Quale peso hanno? Si distingue visivamente
il previsto dal consuntivo? Come?

### 3.4 La riconciliazione

Le fonti pubbliche elencano i criteri (importo, data, riferimenti, con
«tolleranza») ma **nessuna soglia, nessun punteggio di confidenza, nessuna
finestra temporale**. Da osservare nel prodotto: le proposte di abbinamento
espongono un punteggio? Una motivazione? Cosa succede con un pagamento
cumulativo o con uno sconto cassa — il caso che secondo le recensioni la manda
in crisi?

### 3.5 Categorizzazione e regole

La grammatica delle regole non è documentata: quali campi sono confrontabili,
quali operatori esistono, chi vince fra regola utente e classificazione
automatica, se le regole sono retroattive e se valgono per conto o per tutti.

### 3.6 Il piano delle categorie

Il listino dice che la struttura delle categorie e i KPI sono **servizi
professionali a preventivo separato**. Da vedere: cosa trova l'utente
preconfigurato, quanto è modificabile in autonomia, se esiste una gerarchia.

---

## 4. Coda del materiale pubblico da recuperare col browser

Bloccata in Fase 0 per motivi di accesso, non di esistenza. Da fare durante o
subito dopo la navigazione del prodotto:

- `help-center-da-leggere-con-browser.md` — articoli della knowledge base, in
  cima quelli sulle logiche di calcolo e sulla configurazione
- `video-da-recuperare-con-browser.md` — in cima i due video dimostrativi da 3
  minuti e i webinar con demo dal vivo; **niente form di registrazione compilati
  per sbloccare materiale gated**

Priorità relativa: **il prodotto viene prima**. L'accesso scade il 18 agosto, la
documentazione pubblica no.

---

## 5. Cattura

- Screenshot in `assets/agicap/screenshots/`, naming `NN-area-schermata.png`
- HAR sanificati in `assets/agicap/har/`
- Tracce API in `assets/agicap/api-traces/`
- Export eventuali in `assets/agicap/export/`

L'applicazione è una SPA: il traffico di rete è la via più rapida al modello
dati. Osservare le risposte delle chiamate che la UI genera da sé — **senza
comporne di proprie**.

---

## 6. Checkpoint

Al termine dell'inventario: presentare all'utente le rotte accessibili e
bloccate, più il piano di esplorazione delle fasi successive, e **attendere
conferma esplicita** prima di procedere. L'utente deve poter dire «salta questo,
approfondisci quello».

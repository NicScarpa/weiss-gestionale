# Agicap — recensioni di terze parti e debolezze del prodotto

**Raccolto il:** 11 agosto 2026 · **Autore:** subagente Fase 0 — recensioni terze · **Per:** WEISS S.r.l.

Tutto ciò che segue è marcato `[FONTE TERZA]`: sono **opinioni di utenti**, non fatti osservati. Non ho
provato il prodotto e non ho fatto confronti di mia iniziativa con altri strumenti.

---

## Fonti consultate

| Fonte | Esito | Cosa ne ho tratto |
|---|---|---|
| **Capterra** — `capterra.com/p/196637/Agicap/reviews/` (pagg. 1-7) | ✅ letta | ~135 recensioni trascritte alla lettera, comprese **tutte e 8** le recensioni da 1 stella e l'unica da 2 |
| **Capterra** — scheda prodotto | ✅ letta | aggregati, distribuzione stelle, sotto-voti |
| **GetApp** — `getapp.com/.../agicap/reviews/` | ✅ letta | stesso corpus Capterra + 1 citazione aggiuntiva |
| **SoftwareAdvice (US)** | ✅ letta | stesso corpus, conferma sotto-voti |
| **G2** — `g2.com/products/agicap/reviews` | ❌ **HTTP 403** | solo aggregati via snippet di ricerca e comunicati TipRanks |
| **Trustpilot** (`.com`, `fr.`, `de.`) | ❌ **HTTP 403** | solo aggregati e temi via snippet: nessun testo verbatim |
| **Gartner Peer Insights** | ❌ HTTP 403 | nulla |
| **TrustRadius** | ❌ HTTP 403 | nulla |
| **SoftwareAdvice FR** | ❌ HTTP 410 Gone | pagina rimossa |
| **Appvizer FR / IT** | ✅ lette | FR: 2 sole recensioni proprie, del 2018. IT: **zero recensioni** |
| Comparatori FR (tool-advisor, guidefacturation, impli, comparateur-efacturation, panoraia) | ✅ lette | prezzi, durata onboarding, condizioni contrattuali |
| Fonti IT (aziendabanca, economymagazine, accuratereviews) | ⚠️ parziali | nessun corpus di recensioni italiano autonomo |
| Reddit / forum FR e IT | ✅ cercati | **nessuna discussione trovata** |
| Glassdoor / GoWork (lato dipendenti) | ⚠️ snippet | contesto sulla pressione commerciale, non sul prodotto |

Materiale grezzo in `assets/agicap/materiali-pubblici/`: `recensioni-capterra.md`,
`recensioni-g2-getapp-softwareadvice.md`, `recensioni-trustpilot.md`, `recensioni-siti-terzi-fr-it.md`,
`recensioni-glassdoor-lato-dipendenti.md`.

**Vincolo rispettato:** nessun tool Playwright/browser. Solo WebFetch e WebSearch, a ritmo umano.

---

## Avvertenza metodologica: il corpus non è omogeneo

Questa è la cosa più importante da sapere prima di leggere i numeri.

Nelle ~135 recensioni Capterra trascritte, le date si addensano in **tre finestre strettissime**:

- **23-24 giugno 2021** — ~20 recensioni, quasi tutte francesi
- **5-7 febbraio 2024** — ~75 recensioni, italiane e tedesche
- il resto, sparso fra 2018 e 2025

Le prime due sono campagne di raccolta. E qui sta il punto: **tutte e otto le recensioni da 1 stella e
l'unica da 2 stelle cadono fuori dalle finestre** (nov 2022 ×3, dic 2022 ×2, feb 2023, nov 2023, apr
2025 ×2, lug 2025), con la sola eccezione parziale di Jeremy U. (22 feb 2024, comunque due settimane
dopo la campagna).

Lo stesso divario si vede fra piattaforme: dove le recensioni sono sollecitate dal fornitore
(Capterra 4,3 · G2 4,4) il voto è alto; su **Trustpilot, dove si scrive spontaneamente, è 3,7** —
etichetta "Average". Quasi un punto pieno di differenza.

Non significa che le recensioni positive siano false. Significa che **il 4,3 medio misura la
soddisfazione dei clienti che il fornitore ha scelto di interpellare**, mentre il malcontento va
cercato nelle date sparse e su Trustpilot. È esattamente lì che l'ho cercato.

---

## 1. Punteggi per piattaforma

| Piattaforma | Voto | N. recensioni | Distribuzione | Note |
|---|---|---|---|---|
| **Capterra** | **4,3 / 5** | **161** | 5★ 84 · 4★ 58 · 3★ 10 · 2★ 1 · 1★ 8 | sentiment dichiarato: 88% positivo, 6% neutro, 6% negativo |
| GetApp | 4,3 / 5 | 161 | idem | stesso corpus (Gartner Digital Markets) — **non contare tre volte** |
| SoftwareAdvice (US) | 4,3 / 5 | 161 | idem | stesso corpus |
| **G2** | **4,4 / 5** | **367** | 97% dà 4-5 stelle | 88% consiglierebbe; 95% "va nella direzione giusta". N. 1 in *Cash Flow Management* e *Treasury Management Systems*, G2 Spring 2026 |
| **Trustpilot** | **3,7 / 5** | **75** | non determinata | etichetta "Average". Un aggregatore FR riportava 3,5/5 |
| Appvizer FR | 4,3 / 5 (aggregato altrui) | 2 proprie (2018) | — | non è un corpus utile |
| Appvizer IT | — | **0** | — | nessuna recensione italiana |
| Gartner Peer Insights | n.d. | n.d. | — | pagina non accessibile |

### Sotto-voti Capterra — il dato più informativo di tutta la raccolta

| Criterio | Voto | Base |
|---|---|---|
| Servizio clienti | **4,5 / 5** | 153 |
| Facilità d'uso | 4,3 / 5 | 161 |
| Funzionalità | 4,2 / 5 | 161 |
| **Rapporto qualità-prezzo** | **3,7 / 5** | 148 |

Il prezzo è la voce più bassa di quasi un punto, e **13 utenti su 148 non hanno nemmeno votato quella
voce** — scarto insolito che suggerisce reticenza. Il supporto è la più alta.

---

## 2. Lamentele ricorrenti, per tema

Frequenze contate sulle ~135 recensioni Capterra trascritte. Ho segnato l'arco temporale di ogni tema:
serve a distinguere un problema chiuso da uno strutturale.

### 2.1 · Connessioni bancarie che si rompono, sincronizzazione non in tempo reale — **~37 menzioni** 🔴 2021→2025

Il tema n. 1 senza confronto, presente in **ogni singola annata**, incluse le recensioni più recenti
del 2025. Non è stato risolto.

> « **Bankverbindungen fliegen regelmäßig raus** » — Roman W., Finance Manager, Financial Services, 5 feb 2024, ★4
> « Our bank connexion sometimes breaks, which is annoying. Also sometimes the data is wrong and I discover that some operations appear twice » — Juliette P., CEO, 28 mag 2022, ★5
> « Expensive to operate. **Bank connectors not relaible.** » — Christophe L., CEO, 24 lug 2024, ★4
> « No se puede utilizar como una herramienta de gestión de cash flow cuando las actualizaciones/integraciones bancarias **tardan hasta 3 días**, aún que el vendedor me prometió que se actualizaría hasta 5 veces al día » — Mirela D., 21 dic 2022, **★1**
> « **Spesso non aggiorna in tempo reale i saldi dei conti** » — Tommaso M., Amministratore, 5 feb 2024, ★5

Casi specifici ricorrenti: **Revolut** (ritardo 24-48 h), **American Express** (non sincronizzata),
**BNP** (problemi regolari), conti esteri. Alcuni recensori attribuiscono la colpa alla sicurezza
bancaria e non ad Agicap (Sandra P., Alexis P.) — ma il risultato operativo per l'utente è lo stesso.

### 2.2 · Prezzo alto e rapporto qualità-prezzo — **~19 menzioni** 🔴 2021→2025

Confermato dal sotto-voto 3,7/5. Il tema attraversa tutte le annate e tutte le lingue.

> « **Prix déraisonnable pour une entreprise de notre taille** » — Christophe G., Président, Food Production, 23 giu 2021, ★5
> « **C'est vraiment trop cher** surtout si l'on veut des options supplémentaires » — Sébastien L., Gérant, 3 ott 2022, ★4
> « Die erheblichen Kosten, verbunden mit **automatischen Preiserhöhungen jedes Jahr**... Diese Praxis empfinde ich als wenig kundenfreundlich und nicht mehr zeitgemäß » — Gyula T., Inhaber, 6 feb 2024, ★5
> « Für unsere Zwecke ist Agicap ein wenig **mit Kanonen auf Spatzen geschossen**... ein kleineres Paket würde uns auch reichen » — Maximilian G., CEO Retail, 6 feb 2024, ★5
> « Valuto davvero elevato il costo del servizio! » — Marco M., Titolare, 5 feb 2024, ★3

Sottotema: **modularità che frammenta il prezzo.** Le dashboard sono a pagamento extra (Giuseppe M.);
Anna P. lamenta « troppa frammentazione nei pacchetti ». Solo un recensore lo dice economico (Felice
D., gen 2023: « Canone mensile ragionevole »).

### 2.3 · Integrazioni assenti o solo dichiarate — **~16 menzioni** 🔴 2021→2025

> « **Costo ed integrazioni inesistenti, ti dicono che sono integrati ma in realtà ti fanno una api e ti devi arrangiare tu con il tuo fornitore software** » — Basilio M., CEO Food & Beverages, 28 apr 2025, **★1**
> « **Manque de liens avec notre progiciel, nous obligeant à une double/triple saisie** » — Frederic L., Responsable Admin, 23 giu 2021, ★3
> « Il manque l'exportation des écritures comptables pour pouvoir les récupérer simplement dans notre ERP » — Jean-Philippe M., DG Adjoint, 23 giu 2021, ★5
> « **Schnittstelle zu MEWS fehlt** » — Christian R., General Manager, Hospitality, 5 feb 2024, ★4
> « Vorrei che il mio commercialista potesse integrare questo programma nel loro gestionale per avere una prima nota e un bilancio sempre aggiornato » — Valerio S., ristoratore, 5 feb 2024, ★5

Sistemi citati come non integrati o integrati male: Datev, Moss, Sage X3 (con lavoro custom pesante),
MEWS (PMS alberghiero), software di agenzia via CSV, gestionali di fatturazione. Raphaël A. nel 2021
scriveva « Pas d'API »; nel 2025 Basilio M. si lamenta del contrario — che gli diano *solo* un'API.

### 2.4 · Onboarding e configurazione più pesanti del previsto — **~14 menzioni** 🟠 2021→2025

> « J'ai été **surpris par la charge de travail non planifiée** nécessaire au paramétrage des connexions banques et certificats » — Cyril L., Responsable SI, 16 lug 2025, ★4
> « **Onboarding ist sehr zeitintensiv, es Bedarf täglicher Pflege** » — Nils T., Head of Finance/HR, 5 feb 2024, ★5
> « La mise en place est longue » — Jessica C., Dirigeante, 23 giu 2021, ★4
> « Setup took longer than anticipated (technical issues) » — Daniel C., FD Construction, 5 feb 2024, ★5
> « **Intégration des comptes bancaires laborieux** » — Jeremy U., DG Construction, 22 feb 2024, **★1**

Le fonti terze quantificano: **2-4 settimane** (impli.fr) o **3-6 settimane** (guidefacturation.com)
per un dispiegamento operativo. Nessuna registrazione self-service: si passa obbligatoriamente da una
demo commerciale.

### 2.5 · Categorizzazione automatica e "IA" imprecise, manutenzione manuale quotidiana — **~13 menzioni** 🟠 2021→2024

> « **Die Kategorisierung durch die "KI" lässt eher zu wünschen übrig** » — Paul A., Operations Manager, 6 feb 2024, ★4
> « **Necessita di molta gestione manuale giornaliera** » — Christian M., Controller Food & Beverages, 6 feb 2024, ★4
> « Bisogna investire un po' di tempo per controllare che **le categorizzazioni siano sempre corrette** » — Giorgio P., CEO Food & Beverages, 5 feb 2024, ★4
> « **Previsione voci e/o centri di costo spesso errata** » — Nemanja M., 6 feb 2024, ★5
> « Der Algorithmus/ die KI um Zahlung zuzuordnen könnte besser sein » — Bela H., CFO Co-Founder, 5 feb 2024, ★4
> « The forecasting feature is **a bit mechanical** » — Edoardo D., CEO, 5 feb 2024, ★5

Notare: quasi tutte queste critiche vengono da recensori che danno **4 o 5 stelle**. Non è
insoddisfazione, è una limitazione riconosciuta anche da chi è contento. Curioso e concreto il caso di
Morena B.: i cognomi dei clienti arrivano spezzati nella descrizione (`M, ONTALBANO`), quindi la
ricerca non li trova.

### 2.6 · Curva di apprendimento e complessità dell'interfaccia — **~12 menzioni** 🟠 2021→2024

> « **L'interface est très compliquée** » — Yann K., Co-fondateur & CEO, 23 giu 2021, ★4 (che pure sceglie Agicap per il numero di funzioni)
> « La multitud de formas que temen para hacer lo mismo y lo complicado que es... **teniendo que entrar a 3-4 ventanas** para poder hacer ciertas cosas super simples como poner como pagado una factura » — Rafael Angel G., Gerente, 25 nov 2022, **★1**
> « We often feel that **our understanding of Agicap's full functionality is lacking** and that we're therefore not utilising the system to it's full potential » — Ross F., Group Finance Manager, 26 gen 2024, ★5
> « Demasiados indicadores que resultan complicados de utilizar » — Laura G., 6 mag 2022, ★3

Le KPI e le dashboard personalizzate sono il punto in cui la complessità si concentra: Giacomo D.
(« troppo macchinosa, nonostante l'assistenza »), Ariane B., Stéphane D., Tobias S.

### 2.7 · Bug e funzioni rilasciate acerbe — **~10 menzioni** 🟠 2024

> « Ci sono **molte funzioni che, nonostante siano state rilasciate, sono ancora non performanti e creano numerosi bug** » — Angelo R., CFO, 5 feb 2024, ★4
> « Leider relativ viele Bugs gehabt in der letzten Zeit » — Lucy N., 5 feb 2024, ★4
> « die Dashboards sind ein nettes Ad On, welches jedoch **nicht ganz ausgereift wirkt** und daher selten genutzt wird » — Roman W., 5 feb 2024, ★4

### 2.8 · Export ed elaborazione dati rigidi — **~10 menzioni** 🟡 2021→2024

> « **L'extraction excel qui n'est qu'un screenshot d'agicap** mais que l'on ne peut pas modifier car pas de formules intégrées. Embêtant lorsque l'on travaille sur des business plan sur Excel » — Mikael L., Cofondateur, 23 giu 2021, ★5
> « J'ai parfois envie de rebasculer sur excel pour faire certaines analyses à ma main » — Marc T., Dirigeant, 23 giu 2021, ★5
> « La possibilité de créer des tableaux de statistiques reste assez limité » — Cyril P., 24 giu 2021, ★4

### 2.9 · Frizioni commerciali: promesse di vendita non mantenute — **8 menzioni, ma qualitativamente il tema più grave** 🔴 2022→2025

Questo merita attenzione perché **tre delle otto recensioni da 1 stella imputano esplicitamente una
promessa fatta in fase di vendita e poi non onorata**. È un pattern, non un incidente.

> « aún que **el vendedor me prometió** que se actualizaría hasta 5 veces al día » — Mirela D., 21 dic 2022, **★1**
> « **ti dicono che sono integrati ma in realtà** ti fanno una api e ti devi arrangiare tu » — Basilio M., 28 apr 2025, **★1**
> « **In der Beratungsphase habe ich explizit darauf hingewiesen**, dass wir einen Großteil der Mahnungen per Post schicken. Mir wurde gesagt, die Automatik dafür sei noch nicht fertig, **komme aber bald. Nix da.** Inzwischen wurde mir erklärt, dass Mahnungen per Post keine Priorität haben » — Thomas R., Inhaber, 18 apr 2025, **★1**
> « Hice una prueba de 2 meses, la formación fue decepcionante... **Fueron pasando las semanas y no devolvían el dinero** » — Amit S., 24 dic 2022, **★1**
> « peut la **lisibilité des offres commerciales** » (unico difetto trovato) — Georges F., 31 gen 2024, ★5

Da Trustpilot, `[FONTE TERZA, non verbatim]`: un cliente riferisce **~70 chiamate al giorno da oltre 30
numeri diversi** per spingerlo a firmare. **Recensione singola** — non è un tema ricorrente e va
riportata come episodio isolato, non come pratica documentata.

### 2.10 · Supporto: eccellente in media, ma solo chat e a volte saturo — **4 menzioni dirette + fonti terze** 🟡 2022→2024

Il supporto è il punto **più forte** del prodotto (4,5/5). Le critiche sono minoritarie ma specifiche:

> « **le service client**, la mise en place des modules » (unici difetti citati) — Christelle W., Responsable, 2 nov 2023, **★1**
> « The customer support team is good, but **sometimes a bit overwhelmed** » — Juliette P., 28 mag 2022, ★5
> « spezifische Anpassungen z.b. Importfunktionen - **sehr träge bei Anfragen** » — Christoph R., 5 feb 2024, ★5
> « Auch der Support ist gut, aber **bisschen zu sehr nach Schema abgearbeitet** die Anliegen » — Verified Reviewer, Treasury, 5 feb 2024, ★4

`[FONTE TERZA]` guidefacturation.com e GetApp segnalano entrambi che **il supporto è solo via chat** e
che diversi utenti rimpiangono l'assenza di un numero di telefono. Su Trustpilot (2025), un recensore
descrive un **peggioramento del supporto durante l'espansione internazionale, seguito da un recupero
recente**.

### 2.11 · App mobile incompleta — **5 menzioni** 🟢 2021→2024, **probabilmente risolto**

> « **Die App muss besser werden. Alle Funktionen sollten auch per App funktionieren.** » — Jan F., Inhaber, 5 feb 2024, ★4
> « The app is not efficient » — Monica L., CFO, 5 feb 2024, ★4
> « App-Lösung ist noch nicht vollends ausgereift » — Martin M., 7 feb 2024, ★3
> « Pas de version mobile » — Raphaël A., 23 giu 2021, ★4

**Tema in via di chiusura:** nel 2021 l'app non esisteva, nel 2024 era incompleta, e un comparatore
aggiornato al 2026 (comparateur-efacturation.fr) elenca ora « App mobile performante » fra i punti di
forza. Da verificare, ma il segnale è di miglioramento.

### 2.12 · Granularità solo mensile — **3 menzioni** 🔴 **il tema più rilevante per WEISS**

Poche menzioni in assoluto, ma tutte da chi lavora con ritmo giornaliero. Tre recensori indipendenti,
stessa lamentela:

> « **Does not provide a weekly cash flow monitoring option** » — Samir S., Finance Director, **Food & Beverages**, 51-200 dip., 5 feb 2024, ★3
> « **Can't work on a day to day or weekly - minimum is monthly with reporting** » — Ruby W., Director, **Food & Beverages**, 6 feb 2024, ★5
> « **IL FATTO CHE NON HAI UNA SITAZIONE GIORNALIERA** » — Maria Domenica F., Logistica Integrata, 5 feb 2024, ★3

Va letto insieme a « Necessita di molta gestione manuale giornaliera » (Christian M., controller F&B) e
a « Aggiornamento con i cc non immediato » (Antonio C.). Emerge un pattern coerente: **il prodotto è
tarato su un passo mensile, e chi ha bisogno di un passo giornaliero lo trova stretto.**

### 2.13 · Localizzazione italiana incompleta — **4 menzioni** 🔴 **secondo tema più rilevante per WEISS**

> « Ci piacerebbe che venisse studiato meglio per le operazioni italiane come ad esempio **l'iva**, a volte riscontriamo che mancano delle implementazioni molto basilari » — Arianna B., impiegata amministrativa, 5 feb 2024, ★4
> « il non poter **importare in automatico i corrispettivi**, così come avviene per le fatture da cassetto fiscale » — Martina L., impiegata, Retail, 5 feb 2024, ★5
> « **Es ist an die französischen Rechnungslegungssysteme gekoppelt und wurde noch nicht zu 100 % an Italien angepasst** » — Luca B., Owner, 5 feb 2024, ★5

I **corrispettivi** sono esattamente il caso horeca: chi vende al banco non emette fattura. Agicap
importa le fatture dal cassetto fiscale ma non i corrispettivi. Il rovescio della medaglia lo dice
Carolina M.: « Integrazione davvero complessa con **conti non italiani** ».

### 2.14 · Gestione fatture, solleciti, note di credito, sconti cassa — **~6 menzioni** 🟠 2021→2025

Il caso più circostanziato e recente è Thomas R. (18 apr 2025, ★1), che riassume una serie di limiti
del modulo fatture/solleciti: sconto cassa e modalità di pagamento non riconosciuti, termine di
pagamento riconosciuto in modo inaffidabile, fatture multipagina difficili, note di credito
problematiche, riconciliazione che regge solo se il cliente paga *una* fattura per l'importo esatto —
« Kommen Skonto oder Gutschriften ins Spiel, vielleicht noch mehrere Rechnungen in einer Überweisung,
wird es kompliziert ». Conclusione: « Das Preis-/Leistungsverhältnis stimmt hier überhaupt nicht! ».

Concordi: Lisa K. (« Verknüpfung mit dem Zahlungsmanagement (Datev) und die Verwaltung von
Gutschriften konnte bislang nicht unsere Anforderungen erfüllen »), Nicola S. (« ci vorrebbe un maggior
automatismo nella chiusura automatica delle fatture con i relativi flussi bancari »), Jean-Philippe M.
(« L'importation des engagées est source d'erreur de **doublons** car pas de filtre à l'importation »).

---

## 3. Elogi ricorrenti

### 3.1 · Vista consolidata multi-banca in tempo reale — il motivo d'acquisto n. 1

Citato in decine di recensioni, è **la ragione per cui la gente compra**.

> « riesco a tenere sotto controllo i saldi di **12 banche contemporaneamente** » — Carmela R., 5 feb 2024, ★5
> « Nous pouvons voir **en un clin d'œil** le solde de l'ensemble de nos banques » — Segolene R., 23 giu 2021, ★5
> « Vedere i movimenti in tempo reale, **non dover far sempre accesso al conto** » — Tommaso M., 5 feb 2024, ★5
> « I am **no longer reliant on the accounting team** to be reconciled » — James P., Owner, 6 feb 2024, ★5

### 3.2 · Facilità d'uso, anche per chi non è del mestiere

> « **Outil adapté aux non financiers** qui ont le besoin de gérer leur prévisionnel et leur trésorerie à court terme » — Clotilde M., Office Manager, 23 giu 2021, ★5
> « La sua interfaccia utente intuitiva rende la navigazione piacevole e senza sforzi, **anche per chi, come me, non è un esperto in finanza** » — Verified Reviewer, Data Analyst, 5 feb 2024, ★5
> « Rapide, clair et opérationnel pour tous les dirigeants. **Expert ou novice** en gestion de trésorerie » — Laurent P., Directeur, 23 giu 2021, ★5

Non è unanime: Yann K. trova l'interfaccia « très compliquée » e Rafael Angel G. la trova tortuosa. Ma
la maggioranza schiacciante loda la semplicità — ed è il sotto-voto 4,3/5.

### 3.3 · Supporto e onboarding accompagnato — il sotto-voto più alto (4,5/5)

> « **il servizio assistenza è assolutamente TOP** » — Giuseppe M., CEO Construction, 5 feb 2024, ★5
> « Le service client est **exceptionnel** » — Marc T., 23 giu 2021, ★5
> « avec un service client au top ! **Ils ont vraiment mis la barre très, très haut !** » — Stéphane D., DG, 23 giu 2021, ★5
> « Bei Fragen oder Problemen steht uns der Support-Chat zur Verfügung - hier erhalten wir **innerhalb kürzester Zeit** eine persönliche Antwort » — Lisa K., 5 feb 2024, ★5
> « E' facile e il servizio clienti è sempre disponibile, **si lavora insieme** per l'ottenimento del risultato più in linea con le proprie necessità » — Marzia M., 5 feb 2024, ★5

Martin M. dichiara di aver **scelto** Agicap per « Die enge Servicebetreuung und das anvisierte
Onboarding »: il supporto è arrivato a essere un criterio d'acquisto.

### 3.4 · Scenari e simulazioni

> « Il poter gestire **scenari multipli** per valutare con cognizione di causa le scelte amministrative » — Andrea V., Titolare, 5 feb 2024, ★5
> « Historische Daten + Planung in der gleichen Oberfläche, einfache Anpassung von verschiedenen Szenarien » — Jakob G., 6 feb 2024, ★5

### 3.5 · Categorizzazione automatica e regole — quando funziona, è il risparmio di tempo principale

> « Agicap has proven to be a **huge time-saving tool by automating the analysis and categorisation of bank transactions** » — Ross F., 26 gen 2024, ★5
> « La catégorisation des opérations remontées automatiquement depuis la banque se fait de façon très simple et **même automatisée si l'on crée des règles** » — Sébastien L., 3 ott 2022, ★4

Da notare la tensione con §2.5: la stessa funzione è il pregio più citato **e** il difetto più citato
fra chi dà 4-5 stelle. Fa risparmiare tempo rispetto al lavoro manuale, ma non abbastanza da poter
essere lasciata sola.

### 3.6 · L'effetto psicologico — un elogio che ricorre e che non è un requisito funzionale

> « Posso programmare la mia liquidità aziendale e **non farmi prendere dall'ansia** della gestione della mia attività » — Valerio S., **ristoratore**, 5 feb 2024, ★5
> « **Damit schläft man einfach wesentlich besser** :) » — Maximilian G., CEO Retail, 6 feb 2024, ★5
> « une grande **sérénité** pour le suivi de la trésorerie » — Nadine L., dirigeante, 23 giu 2021, ★5

---

## 4. Funzionalità richieste e mancanti, secondo gli utenti

| Richiesta | Chi | Data |
|---|---|---|
| **Monitoraggio settimanale / giornaliero** (oggi minimo mensile) | Samir S., Ruby W., Maria Domenica F. | feb 2024 |
| **Import automatico dei corrispettivi** (oggi solo fatture da cassetto fiscale) | Martina L. | feb 2024 |
| **Conto economico e redditività**, non solo cassa | Frank S., Simone A., Marco R. | feb 2024 |
| **Export scritture contabili verso ERP / commercialista** | Jean-Philippe M., Valerio S., Marzia M. | 2021, 2024 |
| **Excel andata-e-ritorno**: esportare, modificare, ricaricare | Mikael L., Didier B. | giu 2021 |
| **Undo** delle azioni | Verified Reviewer, Hospitality | feb 2024 |
| **Permessi per categoria** (es. nascondere le retribuzioni) | Tobias S., CFO | feb 2024 |
| **Regola di split automatico di un pagamento** | Natasha S. | feb 2024 |
| **Libreria di KPI standard** preconfezionati | Stéphane D. | giu 2021 |
| Pianificazione su **driver** (es. quantità), non solo su transazioni | Jakob G. | feb 2024 |
| **Solleciti postali** automatici | Thomas R. | apr 2025 |
| Import di **giustificativi / ricevute** | Laurent P., Martina L. | 2021, 2024 |
| Creare **categorie direttamente dal piano di tesoreria** | Carmela R. | feb 2024 |
| **Scenari filtrati per progetto** | Michele L. | feb 2024 |
| Ricarica automatica del conto carta di debito Agicap sopra soglia | Marcus G. | feb 2024 |
| Cambiare categorizzazione per anno **conservando lo storico** | Aurore C. | giu 2021 |
| Anticipo automatico dell'imposta sulle società | Christophe G. | giu 2021 |
| App mobile completa | Jan F., Martin M., Mehdi S. | 2021-2024 |
| `[FUORI SCALA]` Consolidamento di gruppo integrato | Marco R. | feb 2024 |
| `[FUORI SCALA]` Multi-valuta / conti esteri | Domenico D., Carolina M., Gauthier C. | feb 2024 |
| `[FUORI SCALA]` Connessioni EBICS / certificati bancari meno onerose | Cyril L. | lug 2025 |

---

## 5. Confronti con la concorrenza fatti dagli utenti

Riportati come li scrivono i recensori. Non sono confronti miei.

**Il concorrente vero è Excel.** È di gran lunga il "prodotto precedente" più citato:
Alessandro G., Maria Domenica F., Basilio M., Mirela D., Giacomo D., Carolina M., Georges F.,
Stéphane D. Tutti provenienti da fogli di calcolo.

> « Pour la **promesse d'un suivi simple, clair, lisible en temps réel** de notre tréso ! » — Stéphane D., motivo del passaggio da Excel, 23 giu 2021
> « Facilità di output e **supporto al decision making** » — Carolina M., motivo del passaggio da Excel, 6 feb 2024
> « La conexión con los bancos ahorra mucho tiempo, **un gran cambio frente al excel** » — Andrea F., 2 feb 2023, ★2 (che comunque critica prezzo e impegno annuale)

**Migrazioni da altri prodotti:**

| Da | A Agicap | Chi | Nota |
|---|---|---|---|
| **Tidely** | Agicap | Vivian M., CEO Textiles, DE | ★5; Gyula T. aveva valutato Tidely e scelto Agicap |
| **COMMITLY** | Agicap | Christian A., Head of Finance, DE | ★4, ma « Am wenigsten gefällt mir der hohe Preis » |
| **sevdesk** | Agicap | Maike J., CFO, DE | ★5, ma « das ich so hohe Kosten habe!! » |
| **Sage X3** | Agicap | Domenico D., CFO Oil & Energy, IT | alternativa valutata: **Piteco Evo 5** |
| **Zenkit + Excel** | Agicap | Georges F., FR | ★5 |

**Alternative valutate e scartate:** Sibill (valutata da Basilio M., IT — che poi ha dato **1 stella**
ad Agicap), Spendesk (Pablo T.), Piteco Evo 5, Agenda (Thomas R., **1 stella**), Microsoft Excel.

**Motivi dichiarati della scelta di Agicap:**

> « **Nombre de fonctionnalités plus important**, export Excel » — Yann K., 23 giu 2021 (che però trova l'interfaccia « très compliquée »)
> « Gesamtpackage der angebotenen Funktionen, sowie **Reifegrad der Software** » — Christoph R., 5 feb 2024
> « **Preis - Leistung und Verkaufsgespräch** » (rapporto qualità-prezzo *e la trattativa di vendita*) — Marco R., 7 feb 2024
> « **Better selection of feeds** and ease of use » — James P., 6 feb 2024
> « à l'époque **erano quasi soli su questo nuovo mercato** » — Alexis P., 23 giu 2021

**Chi è uscito:** `[FONTE TERZA]` tour-dhorizon.com riporta il caso di un utente che aveva Agicap su
raccomandazione di un consulente, lo apprezzava, ed è uscito **per il prezzo**.

---

## 6. Profilo tipico del recensore

**Dimensione:** PMI. Nel corpus Capterra le fasce dichiarate si concentrano su **11-50** e **51-200
dipendenti**, con una coda di 2-10. Nessuna grande impresa. G2 posiziona il prodotto « best for
**mid-market** teams ».

**Ruolo — e qui c'è un dato notevole:** la categoria più numerosa non è quella dei finanzieri, ma
**CEO, titolari, imprenditori, dirigenti, amministratori**. Contati nel corpus: oltre 40 recensori si
qualificano come CEO/Titolare/Imprenditore/Dirigeant/Geschäftsführer/Inhaber/Amministratore. Solo dopo
vengono CFO, Head of Finance e responsabili amministrativi (~35), e infine impiegati
amministrativi/controller (~25).

Per un software di tesoreria è insolito, e dice una cosa precisa: **il compratore e l'utilizzatore sono
spesso la stessa persona, e quella persona è il titolare.** Il che spiega sia l'insistenza sulla
"facilità d'uso per non finanzieri" sia l'insistenza sul prezzo (esce dalla tasca di chi decide).

**Geografia:** Italia, Francia e Germania/Austria dominano nettamente. Marginali Spagna, Regno Unito,
Ungheria. Le recensioni italiane sono ~60, quasi tutte concentrate nel 5-7 febbraio 2024.

**Settori:** molto vari — costruzioni, marketing/comunicazione, retail, consulenza, IT, immobiliare,
logistica, manifattura, rinnovabili.

### Focus: il segmento horeca è ben rappresentato — ed è il più critico

Recensori identificabili come ristorazione, food & beverage o ospitalità: **Valerio S.** (ristorante,
★5), **Nicola S.** (imprenditore ristorazione, ★4), **Giacomo B.** (finance, restaurants, ★4),
**Sebastian S.** (hospitality, ★5), **Christian R.** (general manager hospitality, ★4), **Andrea C.** e
un *Verified Reviewer* (hospitality, ★5), **Basilio M.** (CEO F&B, **★1**), **Samir S.** (finance
director F&B, ★3), **Ruby W.** (director F&B, ★5), **Christian M.** (controller F&B, ★4), **Giorgio P.**
(CEO F&B, ★4), **Domenico S.** (CEO F&B, ★4), **Alessandro B.** (imprenditore F&B, ★4), **Matteo A.**
(ragioniere F&B, ★5), **Felice D.** (controller F&B, ★4), **Jakob G.** e **Christophe G.** (food
production).

Sono ~18 recensori su ~135: circa il **13% del corpus**. Media dei voti visibilmente **più bassa** del
resto: contiene l'unica 1 stella su F&B, due 3 stelle, e molte 4.

Le loro critiche convergono su tre punti, tutti già visti sopra:
1. passo mensile invece che giornaliero/settimanale (Samir S., Ruby W.)
2. gestione manuale quotidiana pesante (Christian M.)
3. integrazioni assenti con gli strumenti del settore — PMS alberghiero MEWS (Christian R.), il proprio
   gestionale (Basilio M., ★1)

---

## 7. Supporto, onboarding, disdetta e frizioni commerciali

### Supporto

- **4,5 / 5** su Capterra (153 voti): il criterio più forte del prodotto.
- **Canale: solo chat.** `[FONTE TERZA]` guidefacturation.com e GetApp segnalano entrambi l'assenza di
  un contatto telefonico come rimpianto ricorrente. tool-advisor.fr sostiene invece che ci siano chat,
  email **e telefono**: le fonti si contraddicono.
- **CSM dedicato** durante l'onboarding, molto lodato per nome dai recensori (i nomi sono oscurati da
  Capterra).
- Punti deboli minoritari: saturazione nei picchi (Juliette P.), lentezza sulle richieste di
  personalizzazione (Christoph R.), risposte "a schema" (Verified Reviewer). Su Trustpilot un
  recensore descrive un peggioramento durante l'espansione internazionale, poi rientrato.

### Onboarding

- Fonti terze: **2-4 settimane** (impli.fr) o **3-6 settimane** (guidefacturation.com).
- **Non esiste registrazione self-service**: si passa obbligatoriamente da una richiesta di demo, dopo
  la quale un commerciale inquadra il progetto. È una scelta di go-to-market, non un dettaglio.
- Le recensioni confermano che dura più del previsto, soprattutto per certificati e connessioni
  bancarie (Cyril L., lug 2025 — `[FUORI SCALA]` nel suo caso perché parla di EBICS e Sage X3).
- « initial configuration requires accounting skills » (impli.fr): non è uno strumento che si
  auto-configura.

### Prezzo e contratto

Nessun prezzo pubblicato da Agicap. Le cifre circolanti, tutte `[FONTE TERZA]` e **discordanti fra
loro**:

| Fonte | Cifra |
|---|---|
| comparateur-efacturation.fr (2026) | **99 € HT/mese** di base, prova 14 giorni |
| tool-advisor.fr (2026) | **150-799 € HT/mese** secondo l'offerta |
| guidefacturation.com (2026) | 150-799 € HT/mese; piani « autour de **200 €/mois** » per PMI mono-entità |
| impli.fr (2026) | « around **€200/month** » per PMI mono-entità; su preventivo, in base a numero di entità e volume di transazioni |
| getkorus.fr (concorrente, quindi interessato) | « Agicap débute **autour de 200€/mois** » |

Lo scarto 99 € ↔ 799 € misura quanto sia opaco il listino. Il prezzo dipende da entità giuridiche,
volume di transazioni e **moduli attivati** (le dashboard sono un extra a pagamento).

**Impegno e disdetta:**
- `[FONTE TERZA]` tool-advisor.fr: « **Vous devrez obligatoirement souscrire pour une période d'un
  an** », e la disdetta va inviata per **lettera raccomandata**.
- `[FONTE TERZA]` guidefacturation.com: « Un engagement annuel minimum est requis ».
- Riscontro lato utente: Andrea F. (★2, feb 2023) cita esplicitamente « **el compromiso de permanencia
  anual** » fra i motivi del voto basso.
- **Aumenti di prezzo automatici annuali**, secondo Gyula T. (feb 2024, ★5): « Diese Praxis empfinde
  ich als wenig kundenfreundlich ».
- Un caso di rimborso non restituito per settimane dopo una prova (Amit S., ★1, dic 2022).

### Contesto sulla forza vendita `[lato dipendenti, non clienti]`

Glassdoor (~40 recensioni, 83% raccomanderebbe, equilibrio vita-lavoro 3,2/5) descrive un modello
outbound intenso: pressione « intollerabile », burnout a 6-8 mesi, « turnover degno di un fast food »
con 15 SDR in un anno. **Non dice nulla sulla qualità del prodotto** e non va mescolato con le altre
fonti. Lo riporto solo perché rende leggibili il listino non pubblico, l'impegno annuale e l'episodio
di demarchage riportato su Trustpilot. Resta un'inferenza.

---

## 8. Sintesi: cosa è ricorrente e cosa no

**Segnali forti** (molte recensioni indipendenti, più annate, più lingue, presenti anche nel 2025):
1. Connessioni bancarie che si rompono e sincronizzazione non in tempo reale — ~37 menzioni, 2021→2025
2. Prezzo alto — ~19 menzioni + sotto-voto 3,7/5, 2021→2025
3. Integrazioni assenti o solo dichiarate — ~16 menzioni, 2021→2025
4. Onboarding più pesante del previsto — ~14 menzioni, 2021→2025
5. Categorizzazione automatica da sorvegliare a mano — ~13 menzioni, 2021→2024

**Segnali medi** (ricorrenti ma circoscritti): curva di apprendimento su KPI e dashboard, bug su
funzioni nuove, export Excel rigido, gestione fatture/note di credito/sconti cassa.

**Segnali deboli ma decisivi per WEISS** (poche menzioni, ma tutte da profili simili al nostro): passo
mensile invece che giornaliero (3 menzioni, due delle quali da food & beverage), localizzazione
italiana incompleta su IVA e corrispettivi (4 menzioni).

**Episodi isolati, da non generalizzare:** il caso di phishing su Trustpilot, le ~70 chiamate al giorno,
il rimborso non restituito. Una sola voce ciascuno.

**Probabilmente superato:** app mobile incompleta (lamentela 2021-2024, un comparatore 2026 la dà come
punto di forza).

---

## Cosa non sono riuscito a determinare e perché

1. **Il contenuto delle recensioni G2** — 367 recensioni, il corpus più grande in assoluto, e non ne ho
   letta nemmeno una. `g2.com` risponde HTTP 403. Ho solo gli aggregati via snippet di ricerca. È la
   lacuna più grave di questa raccolta: G2 raccoglie profili più strutturati (mid-market, CFO) e i suoi
   contro potrebbero pesare diversamente da quelli di Capterra.

2. **Il contenuto delle recensioni Trustpilot** — 75 recensioni, e proprio la piattaforma dove il voto
   crolla a 3,7. Anche qui HTTP 403 su tutti i domini provati. I quattro temi che riporto vengono da
   parafrasi del motore di ricerca, **non da testo verbatim**, e non ho la distribuzione per stelle.
   Non ho usato il browser per il vincolo di sessione condivisa. **Se serve, questa è la fonte da
   recuperare per prima**, ed è recuperabile in due minuti aprendo la pagina a mano.

3. **La distribuzione per stelle su G2 e Trustpilot** — non determinata. Su G2 so solo che il 97% dà
   4-5 stelle; su Trustpilot niente.

4. **Gartner Peer Insights e TrustRadius** — entrambi HTTP 403. Sono le due fonti che avrebbero potuto
   dare il punto di vista delle aziende più strutturate.

5. **Un corpus di recensioni italiano autonomo** — non esiste. Appvizer.it ha **zero** recensioni,
   accuratereviews.it è inaccessibile (403), softwareadvice.fr è stato rimosso (410). Le ~60 recensioni
   italiane vivono tutte dentro Capterra e sono quasi tutte del 5-7 febbraio 2024, cioè di **una sola
   campagna di raccolta**. Il giudizio italiano su Agicap che ho ricostruito è, di fatto, la fotografia
   di una settimana di due anni e mezzo fa.

6. **Conversazione organica su Reddit, forum, LinkedIn** — cercata e **non trovata**. Zero discussioni.
   Non è un fallimento della ricerca: è un dato. Agicap non ha una comunità di utenti che ne parla
   spontaneamente fuori dalle piattaforme di recensione, il che è tipico dei prodotti venduti in
   outbound più che adottati dal basso.

7. **Il prezzo reale** — le fonti terze danno 99 €, 150-799 €, ~200 € come punto di partenza. Nessuna
   viene da Agicap e nessuna concorda con le altre. Non è determinabile pubblicamente: il listino è
   deliberatamente non pubblicato.

8. **Se le lamentele del 2024 siano state risolte nel 2025-2026** — il corpus post-campagna è
   sottilissimo: nel 2025 ho trovato **tre** recensioni Capterra in tutto (Victor S. ★5 ago, Cyril L.
   ★4 lug, Thomas R. ★1 apr, Basilio M. ★1 apr). Su una base così piccola non si può dire se un tema
   sia chiuso. L'unica cosa che si può dire è che **le connessioni bancarie e il prezzo compaiono anche
   lì**, e quindi non sono chiusi.

9. **Il tasso di abbandono e i motivi di uscita** — le piattaforme di recensione raccolgono quasi solo
   utenti attivi. Ho trovato **un solo** caso documentato di uscita (per prezzo, via fonte terza). Chi
   se n'è andato non è rappresentato in nessuno dei corpus letti. È la distorsione strutturale di tutte
   queste fonti e va tenuta a mente su ogni numero riportato sopra.

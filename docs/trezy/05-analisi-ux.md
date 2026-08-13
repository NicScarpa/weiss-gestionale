# Trezy — Analisi UI/UX granulare

Osservazione dell'11 agosto 2026 su ambiente di **produzione**, account reale, piano **Premium in prova**.
Risoluzione di cattura principale **1512 × 950 px**, più una campagna dedicata a **390 × 844 px** su
cinque rotte. 47 screenshot, 8 sessioni di navigazione strumentata, dump strutturati di tutte le rotte
raggiungibili, e una conversazione completa con l'assistente integrato.

Questo documento riguarda **solo Trezy**: non contiene confronti con altri prodotti.
Le traduzioni tecniche sono indicate per lo stack Next.js App Router + React + Tailwind + shadcn/ui
e sono **proposte implementative**, non giudizi comparativi.

**Legenda dei tag**
`[OSSERVATO]` visto in UI o in risposta API · `[DEDOTTO]` inferito da evidenza indiretta ·
`[IPOTESI]` congettura non verificata · `[ASSENTE]` verificata l'assenza (nessuna UI **e** nessuna
menzione in KB/pricing) · `[NON POPOLATO]` funzione presente ma senza dati · `[NON ACCESSIBILE]`
funzione esistente ma non raggiungibile · `[NON VERIFICABILE]` non misurabile con gli strumenti usati.

---

## 1. Limiti di verificabilità

Questa sezione precede l'analisi perché condiziona la lettura di tutto il resto.
Sei aree non sono state valutabili, per cause diverse.

| # | Area | Stato | Causa | Cosa sarebbe servito |
|---|---|---|---|---|
| 1 | **Risoluzione «Giornaliero» del flusso di cassa** | `[NON VERIFICABILE]` | Il file `34-cashflow-giornaliero.png` mostra in realtà la vista **Mensile** attiva: il click non ha attecchito. Nel log `05.log` i quattro pulsanti di risoluzione risultano intercettati dal modale della casella di posta (`intercepts pointer events`, quattro fallimenti su quattro) | Una cattura con il pulsante «Giornaliero» effettivamente attivo, dopo la chiusura del modale |
| 2 | **Regole di classificazione popolate** | `[NON POPOLATO]` | L'account non ha nessuna regola creata: si è visto solo l'empty state. Il form di creazione, l'editor di priorità per trascinamento e il comando «Applica tutte le regole» non sono stati aperti | Creare due regole in conflitto e osservare l'editor di ordinamento |
| 3 | **Reporting con widget** | `[NON POPOLATO]` | Zero widget configurati: si è visto l'empty state e il catalogo dei nove tipi di widget, non un widget renderizzato né la sua configurazione | Aggiungere un widget di ogni tipo e osservare form, resa e stato di caricamento |
| 4 | **Previsioni e riconciliazione nella griglia** | `[NON POPOLATO]` sull'account, `[DA DOCUMENTAZIONE]` altrove | L'account ha `totalForecastInflow = 0` e `totalForecastOutflow = 0`: nessuna previsione residua, quindi la colonna di previsione è piatta e le celle non mostrano il formato «reale / previsto». I pattern di editing delle previsioni sono ricostruiti dagli screenshot **pubblici** della demo interattiva (materiali di marketing, interfaccia in francese) | Un account con previsioni popolate, oppure la creazione di una previsione di prova |
| 5 | **Contenuto del pannello «⌨ ?» nella pagina Documenti** | `[NON VERIFICABILE]` | L'affordance esiste ed è visibile nella barra filtri `[OSSERVATO]`, ma non è stata aperta. Nessuna occorrenza delle stringhe «scorciatoia», «shortcut», «tastiera», «keyboard» nei dump testuali di tutte le rotte | Un click sul pulsante e la cattura del pannello |
| 6 | **Accesso mobile alle quattro sezioni fuori dalla barra inferiore** | `[NON VERIFICABILE]` | A 390 px la navigazione inferiore espone cinque voci; Reporting, Categorie, Impostazioni e Academy non vi compaiono e **non è stato individuato un menu secondario** che le raggiunga. Le rotte `/reporting`, `/categories` e `/academy` non sono state misurate a 390 px | Ispezione dell'icona profilo in testata e delle tre rotte non coperte |

Due lacune indicate nel briefing iniziale sono state **chiuse sul campo** e sono ora trattate come
osservazioni: il comportamento a 390 px (§19) e la qualità delle risposte dell'assistente (§13.2).

Due aree ulteriori sono **irraggiungibili per costruzione** `[NON ACCESSIBILE]`: gli entitlement
`cashBooster` e `factoringMarketplace` risultano attivi nella risposta di
`GET /accounts/{id}/entitlements` `[OSSERVATO]` ma **non hanno alcuna UI** nell'applicazione —
nessuna voce di menu, nessun pulsante, nessuna rotta che vi conduca.

Infine, una cautela sul metodo di cattura: la **casella di posta delle previsioni si apre da sola**
all'ingresso in `/cashflow` ed è un modale bloccante. Sette screenshot desktop mostrano lo stesso
modale sovrapposto a schermate diverse (`01-post-login`, `02-cashflow`, `30-cashflow-mensile`,
`33-cashflow-casella-previsioni`, `80-chiedi-a-trezy` fra gli altri): la schermata sottostante è
sfocata e illeggibile. È un limite del materiale, ma è anche esso stesso un dato di UX — ci torniamo
al §11.

---

## 2. Architettura informativa

### 2.1 Il menu a otto voci

`[OSSERVATO]` Barra laterale unica a sinistra, sempre visibile, larga circa 280 px, con pulsante di
collasso in basso (`|←`). Otto voci, in questo ordine:

| # | Voce | Rotta | Badge |
|---|---|---|---|
| 1 | Flusso di cassa | `/cashflow` | — |
| 2 | Prestazioni | `/performance` | — |
| 3 | Reporting | `/reporting` | `BETA` |
| 4 | Transazioni | `/transaction` | — |
| 5 | Documenti | `/document` | — |
| 6 | Categorie | `/categories` | — |
| 7 | Impostazioni | `/settings` | — |
| 8 | Academy | `/academy` | `NUOVO` |

Sopra il menu: selettore organizzazione con avatar circolare, nome e badge `BETA`.
Sotto il menu, staccato e in nero pieno: **«Prenota una demo»**, che porta fuori dall'applicazione
(`meet.trezy.io/demo-30mn`).

**Cosa fa.** L'ordine non è alfabetico né per frequenza d'uso: è **narrativo**. Prima il futuro
(flusso di cassa), poi la lettura del passato (prestazioni, reporting), poi la materia prima
(transazioni, documenti), poi la configurazione (categorie, impostazioni), infine l'apprendimento
(academy). Nessun raggruppamento con separatori, nessuna sezione comprimibile: otto voci piatte.

**Perché funziona.** Otto voci sono sotto la soglia in cui serve un raggruppamento; introdurre
gruppi avrebbe aggiunto un livello di gerarchia senza guadagno. L'assenza di sottomenu significa che
**ogni pagina è raggiungibile in un click** da qualunque altra. La profondità viene gestita dentro
la pagina, con tab orizzontali (Prestazioni ne ha 7, Impostazioni 8, Documenti 3, Categorie 2), non
nel menu.

**Come si tradurrebbe.** Barra laterale come Server Component in `src/app/(dashboard)/layout.tsx`,
voci come array dichiarativo `{ href, label, icon, badge }`. Lo stato attivo si calcola con
`usePathname()` in un piccolo Client Component wrapper, non rendendo client l'intera barra. I badge
sono `<Badge variant="secondary">` con varianti dedicate (`novita`, `beta`). Il secondo livello va in
`<Tabs>` dentro la pagina, e — punto importante — **i tab devono essere indirizzabili**: `?tab=kpi`
letto da `searchParams`, non stato locale (vedi §7.3 sul limite che Trezy ha esattamente qui).

### 2.2 L'atterraggio su `/cashflow` invece che su una dashboard

`[OSSERVATO]` Dopo il login si atterra su `/cashflow`, non su una pagina di sintesi. La dashboard
esiste ma è **dentro** Prestazioni, come primo tab («Dashboard ✨»).

**Cosa fa.** La prima schermata dopo il login è la tabella pivot del flusso di cassa con il grafico
in testa e il saldo attuale in alto a sinistra. Non c'è una pagina di benvenuto, non ci sono card di
riepilogo, non c'è una selezione di «cosa vuoi fare oggi».

**Perché funziona.** Il prodotto ha una tesi: la domanda che un imprenditore si fa ogni mattina è
«quanti soldi ho e quanti ne avrò». Atterrare direttamente sulla risposta elimina un passaggio
quotidiano ripetuto centinaia di volte. Una dashboard generica avrebbe costretto a un click in più
ogni giorno per arrivare alla stessa informazione, e avrebbe dovuto decidere cosa mostrare — decisione
che qui è già presa.

Il costo è reale e va detto: chi entra per fare altro (caricare una fattura, categorizzare) paga il
caricamento della schermata più pesante dell'applicazione, e — nella configurazione osservata —
l'apertura automatica di un modale.

**Come si tradurrebbe.** `src/app/(dashboard)/page.tsx` che fa `redirect('/cash-flow')`, oppure la
pagina di flusso di cassa promossa a index del gruppo di rotte. La variante più difendibile è un
redirect **configurabile per utente** (campo `landingRoute` sul profilo): l'atterraggio giusto per un
titolare non è quello giusto per chi fa data entry. Modifica di modello dati: una colonna
`landing_route text` sulla tabella utente, con default.

### 2.3 Densità del secondo livello

`[OSSERVATO]` La distribuzione dei tab interni rivela dove il prodotto ha investito:

- **Prestazioni** — 7 tab: Dashboard ✨ · C/E · Stato Patrimoniale · Pareggio · Valutazione · KPI · Registrazioni
- **Impostazioni** — 8 tab: Il mio profilo · Analitico · Gestisci organizzazioni · Fatturazione e abbonamenti · Integrazioni · 🎁 Referral `NEW` · Notifications · Funzionalità
- **Documenti** — 3 tab + pulsante `+`: Fatture · Fornitori · Clienti · `+`
- **Categorie** — 2 tab: Categorie · Regole di classificazione `NUOVO`

Il pulsante `+` accanto ai tab di Documenti `[OSSERVATO]` è un affordance di estensione: da
Impostazioni › Funzionalità si abilitano Prodotti, Analisi fornitori, Analisi prezzi prodotti e tre
funzioni `BETA` (Analisi costi ricette, Ricette, Inventario), e il testo dice esplicitamente
«Queste funzionalità appariranno come schede nella sezione Documenti quando abilitate».

**Perché funziona.** È un modello di **estensione dichiarata**: l'utente sa in anticipo dove
comparirà ciò che sta attivando. La maggior parte dei prodotti attiva funzioni senza dire dove
finiranno, e l'utente le cerca.

**Come si tradurrebbe.** Registro di tab dichiarativo, filtrato dai flag dell'organizzazione:
`const tabs = TAB_REGISTRY.filter(t => !t.flag || features[t.flag])`. Il testo «apparirà come scheda
in …» va scritto nella descrizione dello switch di attivazione — costa una riga di copy e risparmia
una domanda al supporto. Modifica di modello dati: tabella `feature_flag` per organizzazione
(`organization_id`, `key`, `enabled`, `enabled_at`), non un booleano per colonna.

---

## 3. Densità informativa

### 3.1 La griglia del flusso di cassa

`[OSSERVATO]` La schermata principale è una **tabella pivot categorie × periodi**. Conteggio esatto
delle righe nella configurazione osservata:

| Blocco | Righe |
|---|---|
| Contanti all'inizio | 1 |
| Entrata di cassa (totale) | 1 |
| Categorie di entrata | 6 |
| Documenti (dentro le entrate) | 1 |
| Uscita di cassa (totale) | 1 |
| Categorie di uscita | 31 |
| Documenti (dentro le uscite) | 1 |
| Contanti alla fine | 1 |
| IVA a debito / IVA a credito / Saldo IVA | 3 |
| **Totale** | **46** |

Le colonne sono 21-22 visibili in vista mensile, quindi la schermata iniziale contiene **circa mille
celle numeriche**. Non c'è paginazione: si scorre in verticale e in orizzontale.

**Perché funziona.** La tesoreria è un problema bidimensionale: *quanto* per *quando*. Qualunque
rappresentazione che comprima una delle due dimensioni (un grafico per categoria, una lista per mese)
costringe a più passaggi per rispondere a domande banali come «a giugno cosa è successo agli acquisti».
La griglia risponde a tutte queste domande **senza interazione**: basta lo sguardo.

La densità è resa sostenibile da quattro accorgimenti, tutti visibili negli screenshot:

1. **Trattino invece di zero.** Le celle vuote mostrano `-`, non `0,00 €`. Su mille celle in cui la
   maggioranza è vuota, questo è ciò che rende leggibile la minoranza piena.
2. **Nessun simbolo di valuta nelle celle.** L'euro compare nelle testate e nelle card, mai nella
   griglia. Le cifre restano allineate e la colonna resta stretta.
3. **Abbreviazione sopra soglia.** `155K`, `117.8K`, `149.7K` per i valori grandi, cifre intere sotto
   soglia. Larghezza di colonna costante.
4. **Nessun decimale.** Gli importi in griglia sono arrotondati all'unità (`50 755`, `31 140`); i
   decimali compaiono solo nel saldo di testata (`31 140.40 €`) e nel drill-down (`-1 143.41€`).

**Come si tradurrebbe.** Non usare `<Table>` di shadcn per questa griglia: serve virtualizzazione su
entrambi gli assi. La struttura corretta è un contenitore `overflow: auto` con
`position: sticky; left: 0` sulla colonna delle etichette e `position: sticky; top: 0` sulla testata,
con `@tanstack/react-virtual` per le righe. Il formattatore va centralizzato in un unico modulo:

```ts
// una sola funzione, usata da ogni cella della griglia
export function formatoCella(v: number | null): string {
  if (v === null || v === 0) return '-'
  const a = Math.abs(v)
  if (a >= 100_000) return `${(v / 1000).toFixed(1).replace('.0', '')}K`
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(v)
}
```

Il punto non è la funzione, è la **regola**: un solo posto decide come si scrive un numero in griglia.

### 3.2 Quando usano card, quando tabelle, quando grafici

`[OSSERVATO]` Il criterio è coerente in tutto il prodotto:

| Forma | Dove | Che cosa contiene |
|---|---|---|
| **Card grande con numero** | Documenti (Pagato/Scaduto/In arrivo), Pareggio (4 KPI) | Un singolo aggregato **su cui si deve agire** |
| **Tabella** | Cashflow, Transazioni, Documenti, Categorie, KPI, Registrazioni | Dati elementari o pivot, sempre |
| **Grafico** | Testa del cashflow, Pareggio, Cascata P&L, Valutazione | Andamento nel tempo o relazione fra due grandezze |
| **Grafico + tabella insieme** | Cashflow (grafico sopra, griglia sotto, stesse colonne) | La forma e il dettaglio della stessa cosa |

L'accoppiata grafico-sopra/tabella-sotto **con le colonne allineate** è l'accorgimento più
sottovalutato della schermata: l'occhio individua l'anomalia nel grafico e scende in verticale per
leggerne la composizione, senza cercare. `[OSSERVATO]` nello screenshot `34-cashflow-settimanale`, dove
la colonna evidenziata in grigio nel grafico e quella evidenziata nella tabella sono la stessa.

**Come si tradurrebbe.** Grafico e tabella devono condividere **lo stesso array di periodi** e la
stessa larghezza di colonna. Con Recharts significa passare la stessa `data` e fissare
`barCategoryGap`; più robusto è renderizzare il grafico in SVG con le stesse coordinate x calcolate
dal layout della tabella. L'evidenziazione della colonna corrente è una singola `<rect>` di sfondo
condivisa fra i due, guidata da un `periodoAttivo` in stato risalito al contenitore comune.

---

## 4. Tabelle: colonne, ordinamento, filtri, azioni di massa

### 4.1 Documenti — la tabella più curata del prodotto

`[OSSERVATO]` Colonne di default, in ordine: `TIPO ↕` · `FORNITORE ↕` · `CLIENTE ↕` · `STATO ↕` ·
`DATA ↓` · `PAGAMENTO PREVISTO ↕` · `IMPORTO ↕` · `AZIONI`.

Dettagli da notare:

- **L'ordinamento di default è per data decrescente** (`DATA ↓`), non per importo né per stato. È la
  scelta giusta: la domanda implicita è «cosa è arrivato di recente».
- **Ogni colonna significativa è ordinabile**, e lo dichiara con `↕`. La colonna attiva mostra la
  direzione (`↓`). Nessuna icona sulle colonne non ordinabili (`AZIONI`).
- **Due valori in una cella.** La colonna `IMPORTO` mostra `€2,135.00` in nero grande e
  `€1,750 excl.` in grigio piccolo sotto: lordo e imponibile nello stesso spazio. Stessa tecnica in
  `TIPO` (`Invoice` / `Acquisto`) e `FORNITORE` (ragione sociale / numero documento).
- **Pallino colorato accanto al fornitore** `[OSSERVATO]`: verde, blu, ambra. Il significato non è
  dichiarato in UI — `[IPOTESI]` categoria assegnata o stato di verifica dell'anagrafica.
- **Selettore di colonne** (`Colonne`) `[OSSERVATO]`: la configurazione delle colonne visibili è
  esposta all'utente. Non è stato aperto, quindi non sappiamo se la scelta si persiste
  `[NON VERIFICABILE]`.

**Come si tradurrebbe.** `<Table>` di shadcn per la resa, TanStack Table per la logica (ordinamento,
visibilità colonne, selezione). L'ordinamento va in URL: `?sort=data&dir=desc` letto da
`searchParams` nel Server Component, così l'ordinamento è condivisibile e sopravvive al refresh. La
cella a due valori è un frammento riusabile:

```tsx
<div className="flex flex-col leading-tight">
  <span className="font-medium tabular-nums">{formatoEuro(lordo)}</span>
  <span className="text-xs text-muted-foreground tabular-nums">{formatoEuro(imponibile)} escl.</span>
</div>
```

`tabular-nums` non è un dettaglio estetico: senza, le cifre ballano fra le righe e la colonna diventa
illeggibile.

### 4.2 Contatori sui tab

`[OSSERVATO]` I tab di Documenti portano il conteggio dentro l'etichetta: **`Tutto 249` ·
`Acquisto 249` · `Vendita 0`**. Il numero è un badge, non testo. Il tab `Vendita 0` **resta visibile
e cliccabile** anche con zero elementi.

**Perché funziona.** Il conteggio prima del click risponde alla domanda «vale la pena guardare?».
E lo zero visibile è informazione: dice che la vendita è **prevista dal modello ma non usata da
questa azienda** — informazione che scomparirebbe nascondendo il tab. Nascondere i tab vuoti è una
tentazione da evitare: rende il menu instabile fra un utente e l'altro e fra un giorno e l'altro.

**Come si tradurrebbe.**

```tsx
<TabsTrigger value="vendita" className="gap-2">
  Vendita
  <Badge variant={n === 0 ? 'outline' : 'secondary'} className="tabular-nums">{n}</Badge>
</TabsTrigger>
```

I conteggi vanno da una singola query aggregata (`GROUP BY tipo`) risolta nel Server Component
insieme alla prima pagina di risultati, non da tre chiamate separate. Se i conteggi sono costosi,
`Suspense` con `<Skeleton className="h-5 w-8" />` al posto del badge — mai un tab senza numero che poi
salta di larghezza quando il numero arriva.

### 4.3 Filtri

`[OSSERVATO]` Due implementazioni diverse nello stesso prodotto.

**Transazioni** — un pulsante `Filtri` apre un popover con sei gruppi:

| Gruppo | Controllo |
|---|---|
| Categoria | select multiplo «Categorie» |
| Periodo | due `<input type="date">`, «Da» e «A» |
| Importo | due `<input type="number">`, «**Minuro**» e «Massimo» |
| Tipo | due bottoni a due stati: Entrata / Uscita |
| Stato | Incluse / Escluse |
| Documento | Con documento / Senza documento |
| Nota | Con nota / Senza nota |

I tre filtri booleani finali (Documento, Nota, Stato) sono il dettaglio più interessante: sono
**filtri sull'assenza**. «Senza documento» e «Senza nota» servono a trovare il lavoro non ancora
fatto, non i dati. È una funzione di *coda di lavoro* travestita da filtro.

**Documenti** — filtri inline nella barra, non in popover: `Tipo di documento ⌄` · `Importo ⌄` ·
`Data ⌄` · `Analisi ⌄`, più il campo `Cerca documenti…` e un badge `249 da verificare` in ambra che
funziona anch'esso da filtro.

**Come si tradurrebbe.** Il popover di Transazioni è `<Popover>` + `<PopoverContent>` con dentro
gruppi `<Label>` + controlli; i booleani a due stati sono `<ToggleGroup type="single">` (non presente
nel nostro set: va aggiunto, oppure due `<Button variant={attivo ? 'default' : 'outline'}>`). La
regola che conta: **ogni filtro applicato scrive in `searchParams`**, con `router.replace` per non
inquinare la cronologia, e i dati si ricaricano lato server. È esattamente ciò che Trezy non fa
(§18.1) e che si paga ogni giorno.

### 4.4 Azioni di massa

`[OSSERVATO]` In Transazioni, sopra la lista: `☐ Seleziona tutto (749)` · `✓ 0 selezionato/i` · `✕`,
e a destra tre pulsanti che si attivano con la selezione: `Esporta`, `Categorizza`,
`Documenti da confermare (5)`.

Tre dettagli:

1. **Il totale è nel testo del comando** — «Seleziona tutto (749)», non «Seleziona tutto». Chi clicca
   sa cosa sta per selezionare.
2. **Il contatore di selezione è sempre presente**, anche a zero (`0 selezionato/i`), non appare al
   primo click. La barra non cambia altezza quando si seleziona: niente salto del layout.
3. **I pulsanti restano visibili ma disabilitati** a selezione vuota (`Esporta` è grigio nello
   screenshot). Chi guarda la schermata a riposo sa già quali azioni di massa esistono.

**Come si tradurrebbe.** Barra di selezione persistente sopra la lista, sempre montata:

```tsx
<div className="flex items-center gap-3 border-b py-2">
  <Checkbox checked={tutteSelezionate} onCheckedChange={selezionaTutte} />
  <span className="text-sm">Seleziona tutto ({totale})</span>
  <span className="text-sm text-muted-foreground">{n} selezionat{n === 1 ? 'a' : 'e'}</span>
  <div className="ml-auto flex gap-2">
    <Button variant="outline" disabled={n === 0}>Esporta</Button>
    <Button variant="outline" disabled={n === 0}>Categorizza</Button>
  </div>
</div>
```

Da evitare: la barra che compare solo a selezione non vuota e sposta tutta la lista in basso.

### 4.5 Il raggruppamento per data nelle transazioni

`[OSSERVATO]` La lista delle transazioni non è una tabella: è una **lista raggruppata per giorno**,
con intestazioni `<h3>` in italiano esteso — «Lunedì 10 Agosto 2026», «Venerdì 7 Agosto 2026». Le
transazioni dello stesso giorno stanno in card separate senza ripetere la data.

**Perché funziona.** Su un estratto conto la data è la chiave di lettura primaria, e ripeterla su
ogni riga sprecherebbe una colonna intera. Il giorno della settimana scritto per esteso aiuta il
riconoscimento («era lunedì, il giorno dell'incasso POS del weekend») in un modo che `10/08/2026` non
fa.

**Come si tradurrebbe.** Raggruppamento lato server, non client: la query restituisce già le
transazioni ordinate e il componente accumula i gruppi. L'intestazione va resa `sticky top-0` con
sfondo opaco, così scorrendo si sa sempre in che giorno si è. Formattazione con
`Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })`,
mai concatenando stringhe.

---

## 5. KPI cliccabili: dal numero aggregato al dato elementare

`[OSSERVATO]` È il pattern meglio realizzato del prodotto. Nella pagina Documenti, tre card affiancate
a piena larghezza:

| Card | Contenuto | Colore |
|---|---|---|
| **Pagato** | icona ✓ · «26 fatture» · **28 962 €** · barra di avanzamento · «Incassato» · «27 % del totale» · pulsante **FILTRA** | verde |
| **Scaduto** | icona ⏱ · «109 fatture» · **−70 957 €** · barra segmentata in 4 · fasce `0-30g 8 258 €` `30-60g 13 953 €` `60-90g 9 354 €` `90+g 39 392 €` · **FILTRA** | rosso |
| **In arrivo** | icona 📅 · «12 fatture» · **7 330 €** · barra · «Scadenza 29 Aug» · «7 % del totale» · **FILTRA** | ambra |

Ogni card contiene **cinque livelli di informazione** in circa 190 px di altezza: uno stato (il
titolo), una numerosità (26 fatture), un valore (28 962 €), una proporzione (barra + 27 % del totale),
e un'azione (FILTRA).

**Misura del percorso dal numero aggregato al dato elementare** `[OSSERVATO]`:

| Da | A | Click |
|---|---|---|
| Card «Scaduto» (aggregato) | Tabella filtrata sulle 109 fatture scadute | **1** (FILTRA) |
| Card «Scaduto» | Singola fattura scaduta | **2** (FILTRA + riga) |
| Cella della griglia cashflow | Elenco delle 19 transazioni che la compongono | **1** (click sulla cella) |
| Cella della griglia cashflow | Singola transazione | **1** (l'elenco è già nel pannello) |

Due click dal totale dello scaduto alla fattura che lo causa. È il numero da battere.

**Perché funziona.** Il pulsante FILTRA risolve il problema che affligge quasi tutte le dashboard: un
numero grande e nessun modo di sapere *da cosa* è composto. Renderlo un pulsante **esplicito ed
etichettato** — invece di rendere cliccabile l'intera card in modo implicito — ha due vantaggi: è
scopribile (si vede che si può fare) e non intrappola il click accidentale su una card grande.

**Come si tradurrebbe.** In `src/app/(dashboard)/scadenzario/` (o `/fatture/`), una `<Card>` per
stato, con il pulsante che è un `<Link>` a una query string:

```tsx
<Card className="border-l-4 border-l-destructive">
  <CardHeader className="flex-row items-center gap-2 pb-2">
    <Clock className="size-4 text-destructive" />
    <CardTitle className="text-base">Scaduto</CardTitle>
    <span className="text-sm text-muted-foreground">{n} fatture</span>
    <Button asChild size="sm" variant="ghost" className="ml-auto">
      <Link href="/fatture?stato=scaduto">Filtra</Link>
    </Button>
  </CardHeader>
  <CardContent>
    <p className="text-3xl font-semibold tabular-nums text-destructive">{formatoEuro(totale)}</p>
    <BarraAging fasce={fasce} className="mt-3" />
  </CardContent>
</Card>
```

Il punto tecnico decisivo: **il filtro deve essere un `<Link>` verso una URL**, non un `onClick` che
setta stato. Così la card e la tabella filtrata sono la stessa cosa vista da due lati, il risultato è
condivisibile via link, e il tasto Indietro funziona. Modifica di modello dati: nessuna, purché lo
stato del documento sia calcolabile in SQL (vedi §6).

---

## 6. Aging come stato: «Scaduto +117g»

`[OSSERVATO]` Nella colonna `STATO` della tabella Documenti, lo scaduto non è una data né un numero di
giorni in una colonna a parte: è **dentro il badge di stato**, come suffisso.

Valori osservati: `Scaduto +6g` · `Scaduto +7g` · `Scaduto +10g` · `Scaduto +11g` · `Scaduto +117g` ·
`Scaduto +123g` · `Scaduto +1247g`. Accanto: `In arrivo` (badge neutro con icona calendario) e
`Pagato` (badge verde).

**Perché funziona.** Comprime due informazioni — *è scaduto* e *da quanto* — in un elemento della
larghezza di una parola, senza consumare una colonna. E la scala è auto-esplicativa: `+6g` e `+1247g`
sono immediatamente distinguibili senza fare aritmetica sulle date. `+1247g` è di per sé un
segnalatore di anomalia (una fattura del 2023 ancora aperta) che nessuna data assoluta comunicherebbe
con la stessa immediatezza.

Il complemento è nella card: le **fasce 0-30 / 30-60 / 60-90 / 90+** con la barra segmentata a quattro
colori. Guardando la card si vede la *forma* dello scaduto — nel caso osservato, 39 392 € su 70 957 €
(il 55 %) è nella fascia 90+, cioè il problema non è un ritardo diffuso ma un blocco antico. Nessuna
tabella ordinata per data comunica questo in un colpo d'occhio.

**Come si tradurrebbe.** Il calcolo dell'aging va fatto **una sola volta, in SQL**, non in tre punti
diversi dell'interfaccia:

```sql
CASE
  WHEN stato = 'pagato' THEN 'pagato'
  WHEN data_scadenza IS NULL THEN 'in_arrivo'
  WHEN data_scadenza < CURRENT_DATE THEN 'scaduto'
  ELSE 'in_arrivo'
END AS stato_calcolato,
GREATEST(0, CURRENT_DATE - data_scadenza) AS giorni_ritardo
```

Con Prisma, una vista o un campo calcolato nella query di lista. **Da evitare assolutamente** una
colonna `stato` materializzata che va aggiornata da un cron: il giorno in cui il cron salta, l'intero
scadenzario mente. La fascia si deriva da `giorni_ritardo` con un `width_bucket` o un `CASE`, e va
nella stessa query che alimenta la card, come `GROUP BY fascia`.

Componente del badge:

```tsx
<Badge variant={stato === 'scaduto' ? 'destructive' : stato === 'pagato' ? 'success' : 'outline'}>
  {stato === 'scaduto' ? `Scaduto +${giorni}g` : etichetta[stato]}
</Badge>
```

---

## 7. Selezione dei periodi

### 7.1 Quattro risoluzioni con orizzonte adattivo

`[OSSERVATO]` In alto a destra nel flusso di cassa, quattro pulsanti in un gruppo segmentato:
**Giornaliero · Settimanale · Mensile · Trimestrale**. Il pulsante attivo ha sfondo grigio.

Il comportamento notevole: **l'orizzonte temporale cambia con la risoluzione**, non solo il passo.

| Risoluzione | Colonne osservate | Orizzonte coperto |
|---|---|---|
| Giornaliero | `[NON VERIFICABILE]` — vedi §1, punto 2 | — |
| Settimanale | 13 / 20 / 27 giu → 3 / 10 / 17 / 24 / 31 ago, con etichette di mese fluttuanti `giu 26`, `ago 26` | circa 3-5 mesi |
| Mensile | ott → giu su due anni | circa 22 mesi |
| Trimestrale | Q3 2024 → Q1 2027 e oltre | **2024 → 2029** |

**Perché funziona.** È l'accorgimento più intelligente della gestione del tempo in questo prodotto.
Se l'orizzonte fosse fisso, il trimestrale mostrerebbe quattro colonne (inutile) e il giornaliero
seicento (illeggibile). Adattandolo, **il numero di colonne resta più o meno costante** — una ventina
— e ogni risoluzione occupa la stessa schermata dicendo una cosa diversa: il settimanale è per la
tesoreria operativa delle prossime settimane, il trimestrale è per la pianificazione pluriennale.
L'utente non deve scegliere due parametri (passo *e* intervallo): ne sceglie uno e l'altro segue.

Il dettaglio di finitura: **le etichette di anno e mese sono ancorate sopra i gruppi di colonne**
(`2024`, `2026`, `2027` in pillole grigie; `giu 26`, `ago 26` nel settimanale) e restano fisse
mentre le colonne scorrono. Non si perde mai il riferimento temporale.

**Come si tradurrebbe.** Un unico stato `risoluzione` in `searchParams` (`?res=mese`), e una tabella
di configurazione che deriva l'intervallo:

```ts
const ORIZZONTE = {
  giorno:     { passato: { giorni: 30 },  futuro: { giorni: 30 } },
  settimana:  { passato: { mesi: 2 },     futuro: { mesi: 3 } },
  mese:       { passato: { mesi: 10 },    futuro: { mesi: 12 } },
  trimestre:  { passato: { anni: 2 },     futuro: { anni: 3 } },
} as const
```

Il gruppo segmentato è `<Tabs>` reso con `<TabsList>` compatta, oppure `<ToggleGroup type="single">`.
Le etichette di gruppo sopra le colonne si ottengono con una riga di testata aggiuntiva a
`colSpan` variabile, calcolata raggruppando i periodi per anno (o per mese nel settimanale).

### 7.2 Confronti fra periodi in Prestazioni

`[OSSERVATO]` La pagina Prestazioni espone una batteria di controlli di confronto che il flusso di
cassa non ha:

- **Granularità del C/E**: `Mese · Trimestre · Semestre · Anno`
- **Modo di lettura**: `Periodo · Cumulativo`
- **Confronto**: `Nessun confronto · % dei ricavi · Variazione A-1 · Confronta con la previsione`
- **Selettore «ULTIMO PERIODO EFFETTIVO»**: `Auto (mese corrente) · Jun 2026 (M-2) · May 2026 (M-3) · Apr 2026 (M-4)`
- **KPI**: `CONFRONTA CON → Periodo precedente | Storia`, più «Seleziona date di confronto»
- **Stato Patrimoniale**: `Storico · Bilancio generale · Composizione`, con `Nessun confronto · Variazione A-1`

**Perché funziona.** Sono quattro assi ortogonali (granularità, cumulo, base di confronto, taglio dei
dati) esposti come quattro controlli indipendenti invece che come un elenco di viste preconfezionate.
Il numero di viste ottenibili è il prodotto delle opzioni, non la loro somma.

`% dei ricavi` merita una nota: trasforma ogni riga del conto economico in un'incidenza percentuale.
È la lettura che un consulente farebbe a mano, resa un click.

**Il selettore «ULTIMO PERIODO EFFETTIVO»** è il più originale del gruppo. Dichiara *fino a dove i
dati sono attendibili*: le etichette `M-2`, `M-3`, `M-4` dicono quanti mesi indietro si sta portando
il confine. Serve quando il mese corrente è incompleto e includerlo falserebbe ogni confronto. È un
problema che quasi tutti i cruscotti hanno e quasi nessuno espone.

**Come si tradurrebbe.** Ogni asse un `<Select>` o `<ToggleGroup>`, tutti in `searchParams`
(`?gran=mese&modo=cumulativo&confronto=a-1&fino=2026-06`). Il calcolo del confronto va nella query,
non nel componente. Modifica di modello dati: nessuna, ma serve una nozione di **periodo chiuso** —
una tabella `periodo_contabile (anno, mese, chiuso_il)` che permetta di calcolare l'«ultimo periodo
effettivo» in automatico invece di chiederlo all'utente ogni volta.

### 7.3 Il limite: nessuna vista salvata, nessun filtro in URL

`[OSSERVATO]` Verifica diretta sui dump di tutte le rotte: **nessuna URL applicativa contiene una
query string**. Le rotte censite sono esattamente `/cashflow`, `/performance`, `/reporting`,
`/transaction`, `/document`, `/categories`, `/settings`, `/academy`, `/login` — mai con parametri.
Gli otto tab di Impostazioni condividono tutti la stessa URL `https://appv2.trezy.io/settings`.

Conseguenze, tutte verificabili:

1. Un filtro impostato **non sopravvive** a un refresh o a un ritorno dalla pagina.
2. Nessuna configurazione è **condivisibile via link** («guarda le fatture scadute sopra 5 000 €»
   non è comunicabile: va spiegata a voce).
3. Il tasto **Indietro** non annulla un filtro: esce dalla pagina.
4. Non esiste alcun modo di **salvare una vista** ricorrente `[ASSENTE]` — nessuna UI di salvataggio
   in nessuna delle tabelle, nessuna menzione in Academy né nel materiale pubblico.
5. Anche il pulsante FILTRA delle card (§5), per quanto ben concepito, produce uno stato **effimero**.

`[DEDOTTO]` Il costo si paga sul lavoro ricorrente: chi ogni lunedì guarda «acquisti materie prime
non ancora documentati» ricostruisce il filtro da capo ogni lunedì.

**Come si tradurrebbe.** Due livelli, il primo quasi gratuito:

- **Livello 1 — filtri in URL.** Ogni controllo scrive in `searchParams`; la pagina è un Server
  Component che legge `searchParams` e interroga il database. Costo: poche ore per tabella. Rende
  automaticamente veri i punti 1, 2 e 3.
- **Livello 2 — viste salvate.** Tabella `vista_salvata (id, utente_id, organizzazione_id, rotta,
  nome, query_string, condivisa, creata_il)`. Salvare una vista = salvare la query string corrente.
  Applicarla = un `<Link>`. È l'unica funzione qui che richiede una modifica di modello dati, ed è
  minima proprio perché il livello 1 ha già fatto il lavoro.

---

## 8. Il confine fra effettivo e previsione

`[OSSERVATO]` Il passaggio fra ciò che è successo e ciò che si prevede è segnalato in **cinque modi
simultanei**, tutti visibili nello stesso screenshot:

1. **Etichetta esplicita sull'asse**: due parole in corsivo grigio piccolo, `Effettivo` a sinistra e
   `Previsione` a destra, poste sotto la riga delle intestazioni di colonna esattamente sul confine.
2. **Linea del saldo**: continua a sinistra, **tratteggiata** a destra.
3. **Barre del grafico**: piene a sinistra, **a strisce diagonali** a destra (visibile con evidenza
   negli screenshot pubblici della demo, `step-08` e `step-39`).
4. **Corsivo nelle celle**: i valori futuri della riga «Contanti all'inizio / alla fine» sono in
   **corsivo grigio** (`25 219`, `31 140`), quelli passati in tondo nero.
5. **Colonna corrente evidenziata**: fondo grigio chiaro sulla colonna del periodo in corso, che è
   anche l'ultima colonna con dati effettivi parziali.

**Perché funziona.** È ridondanza deliberata. Ognuno dei cinque segnali è debole da solo — il
tratteggio si perde su schermo piccolo, il corsivo sfugge, l'etichetta si dimentica — ma insieme
rendono impossibile scambiare una previsione per un dato certo. In uno strumento di tesoreria questo
errore ha conseguenze reali, e vale la ridondanza.

Il quinto segnale merita attenzione perché risolve un caso limite: il periodo corrente è **mezzo
effettivo e mezzo previsto**, e non appartiene pienamente a nessuna delle due zone. Evidenziarlo con
uno sfondo, invece di assegnarlo a una delle due, è una soluzione onesta.

**Come si tradurrebbe.** Nel modello dati, ogni cella deve portare la sua natura, non farla dedurre
dalla data:

```ts
type Cella = { valore: number | null; natura: 'effettivo' | 'previsto' | 'misto' }
```

Farla dedurre dal confronto con `new Date()` sembra equivalente e non lo è: sbaglia sui fusi orari,
sui periodi chiusi in ritardo e sui dati caricati a posteriori.

In resa: `className={cn(natura === 'previsto' && 'italic text-muted-foreground')}` sulle celle,
`strokeDasharray="4 4"` sul segmento futuro della linea (due `<Line>` Recharts distinte con `data`
spezzata sul confine, non una sola), e per le barre a strisce un `<pattern>` SVG in `<defs>` usato
come `fill`. La colonna corrente è una `<rect>` di sfondo condivisa fra grafico e tabella (§3.2).
L'etichetta di confine è un elemento assoluto posizionato all'indice della prima colonna prevista.

---

## 9. Stati: vuoto, caricamento, elaborazione, nessun risultato

### 9.1 L'empty state delle regole di classificazione — il migliore del prodotto

`[OSSERVATO]` La schermata mostra, dall'alto:

> ℹ **Trascina le regole per cambiare la priorità. Le regole in alto vengono applicate per prime.**
> *Esempio: Per transazioni "Stipendio Matthieu" e "Stipendio Jean", se la regola "Matthieu" è sopra
> la regola "Stipendio", "Stipendio Matthieu" corrisponderà prima a "Matthieu".*

E sotto, in una card centrata: icona imbuto in cerchio grigio, titolo **Regole di classificazione**,
descrizione «Crea regole per classificare automaticamente le tue transazioni in base a parole chiave.
Le regole vengono applicate in ordine di priorità.», e un pulsante nero a piena larghezza
**«+ Crea la tua prima regola»**.

**Perché funziona.** Insegna la regola più difficile del sistema — la **risoluzione dei conflitti fra
regole** — nel momento in cui l'utente non ha ancora nulla da perdere, e la insegna con un **esempio
concreto di conflitto**, non con una definizione. La frase «se la regola "Matthieu" è sopra la regola
"Stipendio", "Stipendio Matthieu" corrisponderà prima a "Matthieu"» contiene tutto il modello mentale:
che l'ordine conta, che la prima corrispondenza vince, e che due regole possono competere sulla stessa
transazione.

Il momento è scelto bene: spiegare la priorità *dopo* che l'utente ha creato dieci regole significa
spiegarla mentre sta già sbagliando. Spiegarla nell'empty state costa una riga di testo e previene la
classe di errori più comune. Nota che l'istruzione **resta visibile anche quando le regole esistono**
(è sopra la card, non dentro): non è un cartello che scompare al primo utilizzo.

`[NON POPOLATO]` L'editor con regole reali non è stato osservato.

**Come si tradurrebbe.** Un componente `<StatoVuoto>` riusabile con quattro proprietà — icona,
titolo, descrizione, azione — e una quinta opzionale, `spiegazione`, che è il testo istruttivo
mostrato **fuori** dalla card e che sopravvive al popolamento:

```tsx
<>
  <Alert className="mb-4">
    <Info className="size-4" />
    <AlertDescription>
      Trascina le regole per cambiare la priorità: quelle in alto vengono applicate per prime.
      <span className="mt-1 block italic text-muted-foreground">
        Esempio: con le transazioni «Stipendio Rossi» e «Stipendio Bianchi», se la regola «Rossi» sta
        sopra la regola «Stipendio», «Stipendio Rossi» corrisponderà prima a «Rossi».
      </span>
    </AlertDescription>
  </Alert>
  {regole.length === 0 ? <StatoVuoto … /> : <ElencoRegole regole={regole} />}
</>
```

La regola generale da portare via: **ogni empty state di una funzione con un modello mentale non
ovvio deve contenere un esempio, non una definizione**.

### 9.2 L'empty state del reporting

`[OSSERVATO]` Icona a torta grigia, titolo «Ancora nessun widget», descrizione «Aggiungi il tuo primo
widget per iniziare a creare il tuo rapporto personalizzato.», e un solo pulsante — **«+ Aggiungi il
tuo primo widget»** — reso con **bordo tratteggiato**, che lo fa leggere come un segnaposto da
riempire più che come un comando.

Notare che il pulsante `Aggiungi widget` esiste **anche** in alto a destra, in nero pieno. Lo stesso
comando è quindi presente due volte, con due pesi visivi diversi: quello centrale sparirà con il primo
widget, quello in alto resterà. Nessun invito secondario, nessun «oppure importa un modello», nessun
link alla documentazione: **una sola azione**.

**Perché funziona.** Un empty state con tre inviti costringe a una scelta prima di aver capito il
sistema. Con uno solo, il percorso è obbligato e l'utente arriva al primo risultato nel modo più
breve. Il bordo tratteggiato è il dettaglio che trasforma il vuoto da «non c'è niente» a «qui va
messo qualcosa».

**Come si tradurrebbe.** Stesso `<StatoVuoto>` del punto precedente, con
`<Button variant="outline" className="border-dashed">`. La disciplina è nel contenuto, non nel codice:
**una sola azione primaria**, e la stessa azione ripetuta nella barra in alto perché resti disponibile
dopo.

### 9.3 Elaborazione asincrona: «Estrazione dati dal documento…»

`[OSSERVATO]` Nella tabella Documenti convivono righe complete e righe in lavorazione. Una riga in
lavorazione mostra: un badge `⟳ In elaborazione`, il testo in corsivo «Estrazione dati dal documento…»
nelle colonne Fornitore e Cliente, e **rettangoli grigi arrotondati** (skeleton) nelle colonne Stato,
Data, Pagamento previsto e Importo.

**Perché funziona.** È lo skeleton applicato non al caricamento della pagina ma a un **processo di
business asincrono** che dura molto più a lungo (l'OCR di una fattura). Tre proprietà:

1. La riga occupa **già la sua posizione definitiva**: quando i dati arrivano, nulla si sposta.
2. Lo skeleton è **selettivo** — solo le colonne che l'estrazione riempirà. Il badge di stato è
   reale, non uno scheletro.
3. Il testo dice **cosa sta succedendo**, non «caricamento». «Estrazione dati dal documento» spiega
   perché ci vuole tempo, e implicitamente che il sistema sta lavorando per l'utente.

**Come si tradurrebbe.** Lo stato di elaborazione va nel modello dati, non nell'interfaccia: campo
`stato_elaborazione` (`in_coda` | `in_corso` | `completato` | `errore`) sulla riga del documento,
scritto dal worker. In resa, `<Skeleton>` di shadcn nelle sole celle interessate. Per l'aggiornamento
senza refresh: revalidazione del path a intervalli, oppure Server-Sent Events se il volume lo
giustifica. Da prevedere fin da subito il quarto stato — **`errore`** — che negli screenshot non
compare `[NON VERIFICABILE]` ma che esiste in ogni pipeline OCR reale: una riga bloccata per sempre su
«Estrazione dati…» è peggio di un errore dichiarato.

### 9.4 Altri stati

`[OSSERVATO]` Nella tabella «Analitico» delle Impostazioni, con zero centri di costo, la tabella
**mantiene le proprie intestazioni** (`CODICE · NOME · DESCRIZIONE · AZIONI`) e mostra una riga unica:
«Nessun elemento. Clicca su "Aggiungi" per crearne uno.» La struttura resta visibile: si capisce cosa
andrà lì e con quali campi.

`[OSSERVATO]` In «Cronologia abbonamenti», vuota: icona 📊 e «Nessuna cronologia abbonamenti trovata.
Quando ti abboni a un piano, i dettagli del tuo abbonamento appariranno qui.» — l'empty state spiega
**la condizione che lo farà sparire**.

`[NON VERIFICABILE]` Lo stato «nessun risultato» dopo l'applicazione di un filtro non è stato
osservato: nessun filtro è stato applicato fino a produrre un insieme vuoto. Va distinto dall'empty
state di prima configurazione, perché richiede un'azione diversa (rimuovere il filtro, non creare un
elemento).

---

## 10. Il gesto come punto d'ingresso

`[OSSERVATO]` In cima alla lista delle transazioni, una striscia azzurra permanente:

> ℹ **Suggerimento: Evidenzia il testo in una transazione per creare una regola di classificazione**

**Cosa fa.** La regola di classificazione non nasce da un form vuoto in cui digitare una parola
chiave: nasce **selezionando con il mouse un pezzo della descrizione di una transazione reale**. Il
testo selezionato diventa la parola chiave della regola.

**Perché è l'accorgimento più interessante del prodotto.** Rovescia il rapporto fra dato ed
astrazione. Il percorso normale sarebbe: capire che esistono le regole → andare in Categorie → aprire
il tab Regole → creare una regola → *ricordarsi* come è scritta la causale in banca → digitarla senza
errori → sperare che corrisponda. Il percorso di Trezy è: sto guardando la transazione, vedo la parte
di testo che la identifica, la seleziono.

I guadagni sono quattro, tutti sostanziali:

1. **Zero errori di trascrizione.** La parola chiave è *letteralmente* un sottoinsieme della causale
   reale: non può non corrispondere.
2. **Il contesto è già a schermo.** L'utente vede accanto le altre transazioni simili e capisce se la
   selezione è troppo specifica (un ID di bonifico che non si ripeterà) o troppo generica.
3. **Nessun cambio di pagina.** La regola nasce dove nasce il bisogno.
4. **Scoperta della funzione.** Molti utenti non sanno che esistono le regole. Il suggerimento è
   scritto sopra le transazioni, cioè esattamente dove si trova chi sta categorizzando a mano per la
   decima volta ed è nel momento di massima ricettività.

Il punto debole è che la **scopribilità del gesto dipende interamente da quella riga di testo**:
selezionare del testo non ha un affordance visivo proprio. Se la riga viene chiusa o l'utente non la
legge, la funzione resta invisibile. `[NON VERIFICABILE]` — non sappiamo se la striscia sia
chiudibile.

**Come si tradurrebbe.** Ascoltare la selezione sull'elemento della descrizione e mostrare una
mini-azione fluttuante presso la selezione:

```tsx
function useSelezioneTesto(ref: RefObject<HTMLElement>) {
  const [sel, setSel] = useState<{ testo: string; rect: DOMRect } | null>(null)
  useEffect(() => {
    function onUp() {
      const s = window.getSelection()
      const testo = s?.toString().trim() ?? ''
      if (!testo || testo.length < 3 || !ref.current?.contains(s!.anchorNode)) return setSel(null)
      setSel({ testo, rect: s!.getRangeAt(0).getBoundingClientRect() })
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [ref])
  return sel
}
```

Il bottone fluttuante è un `<Popover>` ancorato al `rect`, che apre un `<Sheet>` con il form della
regola **precompilato** con il testo selezionato e con l'anteprima delle transazioni che quella regola
catturerebbe. L'anteprima è la parte che vale davvero: «questa regola classificherebbe 47 transazioni,
eccone 5» prima di confermare.

Modifica di modello dati: `regola_categorizzazione (id, organizzazione_id, parola_chiave, ambito
'entrata'|'uscita'|'entrambe', categoria_id, conti_bancari uuid[], priorita int, creata_il)`, con
`priorita` che ordina la valutazione e **vincolo di unicità su (organizzazione_id, priorita)** per non
ritrovarsi con ordinamenti ambigui.

Da prevedere fin dall'inizio, perché l'assenza si sente subito: un comando **«Applica tutte le
regole»** che le riesegue retroattivamente. Trezy lo ha `[DA DOCUMENTAZIONE]`, dichiarato nella FAQ
dell'Academy, perché le regole per impostazione predefinita **non sono retroattive**.

---

## 11. Coda di lavoro guidata: la casella di posta delle previsioni

`[OSSERVATO]` All'ingresso in `/cashflow` si apre **automaticamente** un modale centrato, largo circa
980 px:

- Titolo con icona orologio ambra: **«2 elemento/i richiedono la tua attenzione»**
- Un paragrafo esplicativo in riquadro azzurro: «Collega le transazioni alle tue previsioni per tenere
  traccia di ciò che è stato pagato e di ciò che è ancora atteso. Solo l'importo residuo di ogni
  previsione viene utilizzato per calcolare la liquidità prevista a fine periodo. Le previsioni passate
  non vengono più mostrate qui. Se una previsione è completamente pagata, contrassegnala semplicemente
  come pagata — non è necessario collegare transazioni.»
- Due tab con conteggi: **`Tutto (2)`** (attivo, in ambra) e **`Documenti (2)`**
- Due righe cliccabili con icona documento, nome della controparte, badge `Uscita` in rosso, data
  relativa **«mar 4 ago (7g fa)»**, importo `-180.00€` in rosso
- Un solo pulsante in basso a sinistra: **`Ignora`**

`[DA DOCUMENTAZIONE]` L'Academy dichiara tre code in ordine fisso: verifica transazioni →
riconciliazione previsioni → monitoraggio fatture.

**Perché funziona.** Tre cose fatte bene:

1. **Trasforma un'astrazione in una coda.** «Riconciliare le previsioni» è un compito che nessuno
   sente il bisogno di fare. «Due elementi richiedono la tua attenzione» è un compito con un numero e
   una fine.
2. **Spiega la conseguenza, non l'operazione.** Il paragrafo non dice «collega le transazioni», dice
   *perché*: «solo l'importo residuo viene utilizzato per calcolare la liquidità prevista». L'utente
   capisce che saltare il compito significa avere una previsione sbagliata.
3. **Offre la scorciatoia.** «Se una previsione è completamente pagata, contrassegnala semplicemente
   come pagata — non è necessario collegare transazioni.» Dichiarare la via breve dentro l'invito a
   fare la via lunga è raro e generoso.
4. **La data è relativa e assoluta insieme** — «mar 4 ago (7g fa)» — così si sa *quando* e *da
   quanto* senza calcolare.

**Il costo dell'apertura automatica, misurato.** Il modale è bloccante e intercetta i click sulla
schermata sottostante. Nel log `05.log` **quattro tentativi su quattro** di cambiare risoluzione
(Giornaliero, Settimanale, Mensile, Trimestrale) e uno sul selettore di scenario sono falliti con
`<div> intercepts pointer events`, dopo ripetuti tentativi automatici su 5 secondi. E come detto al
§1, sette screenshot su 41 mostrano il modale sopra la schermata che si voleva osservare — incluso
`80-chiedi-a-trezy`, dove il pannello dell'assistente si apre **dietro** il modale ed è inutilizzabile.

Questo non è un artefatto della strumentazione: è esattamente ciò che vive un utente che entra nel
flusso di cassa per fare altro. Il pulsante `Ignora` c'è, ma `[NON VERIFICABILE]` non sappiamo se
«ignora» valga per la sessione, per sempre, o solo per quei due elementi.

**Bilancio.** L'idea della coda è ottima; l'apertura automatica modale è la realizzazione sbagliata
della stessa idea. Il numero è già visibile nella barra in alto come **badge ambra con `2` sull'icona
orologio** `[OSSERVATO]`: il modale è ridondante rispetto a un segnale che c'è già.

**Come si tradurrebbe.** Tenere la coda, cambiare il contenitore:

- Il segnale permanente è un **badge sul pulsante** in barra: `<Button variant="ghost"><Clock/><Badge>2</Badge></Button>`.
- Il contenitore è uno **`<Sheet side="right">`**, non un `<Dialog>`: si apre di lato, lascia visibile
  e **utilizzabile** la schermata sotto, e si chiude con Esc o cliccando fuori.
- L'apertura automatica, se la si vuole, va **al primo accesso della giornata** e mai due volte:
  `ultima_apertura_coda` sul profilo utente, confronto con la data odierna. Non a ogni navigazione.
- Il paragrafo esplicativo va tenuto **integralmente**: è la parte che fa funzionare la cosa.

Modifica di modello dati: una vista o funzione che restituisce gli elementi da smaltire con il loro
tipo (`verifica_transazione` | `riconciliazione` | `fattura`), così l'ordine delle code è dato e non
va ricalcolato in interfaccia.

---

## 12. Drill-down: dalla cella al dettaglio, restando nel tempo

`[OSSERVATO]` Cliccando una cella della griglia (esempio catturato: «Acquisti studi e servizi», aprile
2026, valore 17 583) si apre un **pannello laterale destro** largo circa 420 px, che contiene
dall'alto:

1. Occhiello **`USCITA DI CASSA`** e titolo **`Acquisti studi e servizi`** — categoria e verso
2. Riga di navigazione: **`‹`  `apr 2026`  `›`** — periodo precedente / periodo successivo
3. **Mini-grafico** della categoria nel tempo, con la sua legenda `— Effettivo` / `--- Previsionato`,
   che ripete a scala ridotta la semantica della schermata principale
4. Blocco **`EFFETTIVO`**: `-17 583€` e sotto `📅 19 Transazioni`, con un'icona di esportazione
5. Sezione **`Previsioni 0`** con pulsante `+ Aggiungi previsione` e, se vuota, la riga «Nessuna
   previsione in questo periodo.»
6. Sezione **`Transactions & Documents 19`**: le 19 transazioni elementari, raggruppate per data,
   con causale e importo, e in fondo «Tutte le transazioni caricate (19 totali)»

**Perché funziona.** Il punto 2 è ciò che distingue questo drill-down da un normale pannello di
dettaglio: **`‹` e `›` navigano nel tempo senza uscire dal dettaglio**. Il percorso «chiudi il
pannello, trova la cella del mese prima, riaprila» — tre azioni e una ricerca visiva — diventa un
click. Chi sta indagando su un'anomalia di aprile vuole quasi sempre vedere marzo subito dopo, e
questa è la risposta a quel bisogno.

Il punto 3 è la seconda finezza: il mini-grafico dà il **contesto longitudinale** di una singola
categoria, che nella griglia si legge solo scorrendo una riga lunga. In quattro centimetri quadrati
si vede se 17 583 € è un valore normale o un picco.

Il punto 6 chiude il cerchio: dall'aggregato pivot si arriva alla causale bancaria singola **in un
click**, senza cambiare pagina e senza perdere il contesto.

**Come si tradurrebbe.** `<Sheet side="right">` di shadcn. La cella è un `<button>` (non un `<div>`
con `onClick`: deve essere raggiungibile da tastiera) che apre il pannello con
`{ categoriaId, periodoInizio, periodoFine }`. La navigazione fra periodi ricalcola solo quei tre
valori e rifà la fetch — **non chiude e riapre il pannello**, altrimenti si perde la posizione di
scorrimento. Il mini-grafico riusa lo stesso componente della testata con `variant="compatto"`, non
un componente nuovo, così la semantica dei colori resta identica per costruzione.

Endpoint necessario: `GET /api/cash-flow/cella?categoria=…&da=…&a=…` che restituisce
`{ effettivo, previsto, transazioni[], previsioni[], serieStorica[] }` — una sola chiamata, non
quattro.

---

## 13. Insight in linguaggio naturale

### 13.1 L'insight statico del Pareggio

`[OSSERVATO]` Nella pagina Prestazioni › Pareggio, a destra del grafico, tre blocchi impilati:

> 📉 **Sei 42.6% al di sotto del pareggio**
>
> ⚠ **Insight aziendale**
> Hai bisogno di €158 251.63 in più di ricavi (aumento del 74.1%) per raggiungere il punto di
> pareggio. Concentrati sull'aumento delle vendite o sulla riduzione dei costi.

Sotto, due righe di riepilogo con barra colorata a sinistra: `● RICAVI €213 619.09` e
`● PUNTO DI PAREGGIO €371 870.72`.

**Perché funziona.** I quattro numeri in cima alla pagina (`PUNTO DI PAREGGIO €371 870.72`,
`MARGINE DI SICUREZZA €-158 251.63 / -74.1%`, `RISULTATO OPERATIVO €-70 792.50`, `PUNTO MORTO 176
giorni`) sono corretti ma **muti**: dicono dove si è, non cosa fare. La frase in linguaggio naturale
compie tre operazioni che i numeri da soli non compiono:

1. **Dà un verso allo scostamento** — «al di sotto», non «-158 251,63 €». Il segno meno richiede
   un'interpretazione che dipende dalla grandezza; la parola no.
2. **Traduce lo scostamento in azione** — «hai bisogno di 158 251,63 € in più di ricavi (aumento del
   74,1 %)». Lo stesso numero, ma espresso come obiettivo invece che come diagnosi.
3. **Suggerisce le leve** — «aumento delle vendite o riduzione dei costi». Generico, certo, ma dà due
   direzioni invece di zero.

I numeri della frase sono **coerenti con i KPI** e verificabili: −158 251,63 = 213 619,09 − 371 870,72;
74,1 % = 158 251,63 / 213 619,09; 42,6 % = 158 251,63 / 371 870,72. La frase non è decorativa: è
generata dagli stessi valori.

**Il limite.** L'insight esiste **solo qui**. Le altre pagine con scostamenti evidenti — i KPI con
`Margine EBITDA -32.4%`, gli indici di liquidità negativi, il saldo in calo dell'8,7 % — restano mute.
`[ASSENTE]` Nessuna frase equivalente altrove, in nessuna delle sette schede di Prestazioni.

Nota di merito, e di attenzione: il quarto KPI, **`PUNTO MORTO 176 giorni`**, è mostrato **in verde**
accanto a tre numeri rossi, senza spiegazione. Verifiche indipendenti non hanno trovato una formula
che restituisca 176 con i dati esposti — al ritmo di ricavi corrente il pareggio cadrebbe oltre i 600
giorni. `[IPOTESI]` non risolta. Il colore verde su un numero che non si riesce a riprodurre è
esattamente il caso in cui un insight testuale avrebbe rivelato l'incoerenza invece di nasconderla.

**Come si tradurrebbe.** Un modulo puro, testabile, che dallo scostamento produce la frase — **non una
chiamata a un modello linguistico**:

```ts
export function insightScostamento(p: {
  attuale: number; obiettivo: number; unita: 'euro'; leve: string[]
}): { titolo: string; corpo: string; tono: 'positivo' | 'negativo' } {
  const scarto = p.obiettivo - p.attuale
  const perc = Math.abs(scarto / p.obiettivo) * 100
  if (scarto <= 0) return {
    titolo: `Sei ${perc.toFixed(1)} % sopra l'obiettivo`,
    corpo: `Hai superato l'obiettivo di ${formatoEuro(-scarto)}.`,
    tono: 'positivo',
  }
  return {
    titolo: `Sei ${perc.toFixed(1)} % al di sotto dell'obiettivo`,
    corpo: `Ti mancano ${formatoEuro(scarto)} (${(scarto / p.attuale * 100).toFixed(1)} % in più) ` +
           `per raggiungerlo. ${p.leve.join(' oppure ')}.`,
    tono: 'negativo',
  }
}
```

Deterministico, unitestabile, traducibile, e riusabile ovunque ci sia una coppia (valore, obiettivo):
budget contro consuntivo, previsione contro realizzato, margine contro soglia. Reso con
`<Alert variant={tono === 'negativo' ? 'destructive' : 'default'}>`. Il costo è di poche ore e il
guadagno si moltiplica per il numero di posti in cui lo si applica.

Il §13.2 mostra che cosa succede quando la stessa frase viene invece generata da un modello.

### 13.2 L'assistente conversazionale: ottima forma, contenuto da verificare

`[OSSERVATO]` Una domanda posta e una risposta completa osservata. Domanda: «Quali sono le mie tre
categorie di spesa più alte negli ultimi tre mesi?». Tempo di risposta circa **30 secondi**.

La risposta è composta di cinque parti, in questo ordine:

1. **Titolo**: «Le 3 categorie di spesa più alte negli ultimi 3 mesi»
2. **Tabella ordinata** con barra orizzontale proporzionale accanto a ogni voce e importo allineato a
   destra — **15 righe**, dalla maggiore alla minore
3. **Sintesi in linguaggio naturale** che riprende le prime tre voci
4. **Due domande di approfondimento suggerite**, come pulsanti cliccabili
5. **Pulsanti di feedback 👍 / 👎**

**Ciò che funziona, e merita di essere copiato.**

*I follow-up suggeriti* sono il pattern più valido del pannello: dopo la risposta l'assistente propone
il passo successivo («Mostrami l'andamento dei stipendi negli ultimi 12 mesi», «Quali sono le mie
spese di materie prime per mese?»), così l'utente non deve inventare la domanda. In uno strumento
conversazionale il problema più grande non è rispondere: è che l'utente non sa cosa può chiedere. I
suggerimenti derivati **dalla risposta appena data** risolvono esattamente questo, e sono molto più
utili dei suggerimenti generici del pannello vuoto.

*La risposta è mista*: dato strutturato (tabella con barre proporzionali) più prosa. La tabella
consente la verifica, la prosa dà la sintesi. Una risposta di solo testo non sarebbe verificabile;
una di sola tabella non sarebbe una risposta.

*Il feedback 👍/👎* è al posto giusto — sotto la singola risposta, non sulla conversazione.

**Il difetto grave: una percentuale falsa presentata come fatto.**

La sintesi afferma che le prime tre categorie «Insieme rappresentano il **70 %** della tua spesa
totale nel periodo». Verifica sui numeri che l'assistente stesso mostra nella tabella immediatamente
sopra:

| Voce | Importo |
|---|---|
| prime tre categorie (76.119 + 68.398 + 26.672) | **171.189 €** |
| somma di tutte e 15 le righe elencate | **348.525 €** |
| quota reale | **49,1 %** |

L'affermazione sbaglia di **21 punti percentuali**, e sbaglia contro dati che si trovano nella stessa
schermata, a due centimetri di distanza.

`[DEDOTTO]` Non esiste una base di calcolo ragionevole che restituisca 70 %. Anche depurando il
denominatore dalle tre voci che nella tassonomia di Trezy **non sono costi** — «Trasferimento
interbancario», «Prestiti» ed «Estratto conto carta di credito» hanno categoria contabile *Stato
patrimoniale*, non *Conto economico* (§17) — il totale scenderebbe a 295.149 € e la quota salirebbe
al **58,0 %**: ancora lontana. La cifra sembra prodotta dalla generazione del testo, non da un
calcolo.

Che quelle tre voci patrimoniali compaiano fra le «spese» è, di per sé, un secondo errore di dominio:
un giroconto fra conti propri non è una spesa, e il prodotto ha già l'informazione per saperlo.

**Perché è un difetto sostanziale e non una sfumatura.** In uno strumento di tesoreria la frase di
sintesi è la parte che viene letta, ricordata e ripetuta — al commercialista, al socio, in una
riunione. La tabella sopra è la parte che nessuno ricontrolla, proprio perché la frase la riassume.
Una sintesi sbagliata del 21 % su una concentrazione di spesa può motivare una decisione reale
(rinegoziare un contratto, tagliare una voce) sulla base di una proporzione inventata. E il danno è
aggravato dalla forma: la tabella accanto conferisce alla frase un'autorevolezza che la frase non ha
guadagnato.

**Altri due difetti minori nella stessa risposta.**

- **Il titolo promette tre voci, la tabella ne elenca quindici.** «Le 3 categorie di spesa più alte»
  sopra un elenco completo. O il titolo è sbagliato, o la tabella andava troncata a tre con un
  «mostra tutte».
- **Refuso grammaticale nel testo generato**: «l'andamento **dei** stipendi» (per «degli stipendi»),
  in uno dei due follow-up suggeriti.

**Incoerenza linguistica.** I follow-up generati sono **in italiano**; i tre suggerimenti iniziali del
pannello vuoto sono **in inglese** (`3-month evolution`, `My biggest expenses this month`,
`Next month forecasts`, §18.6). Chi apre il pannello per la prima volta vede l'inglese; chi ha già
fatto una domanda vede l'italiano. `[DEDOTTO]` I primi sono stringhe fisse non tradotte, i secondi
sono generati dal modello nella lingua della conversazione.

**Come si tradurrebbe.** La regola generale, valida al di là di questo caso: **nessun numero
presentato all'utente deve essere generato da un modello linguistico**. La divisione del lavoro
corretta è:

- il modello traduce la domanda in una **query** (categoria, periodo, aggregazione) e sceglie come
  presentare il risultato;
- il **calcolo** avviene in SQL o in una funzione pura;
- la **frase di sintesi** viene da un template deterministico riempito con i valori calcolati, come
  la `insightScostamento` del §13.1.

```ts
// il modello produce solo questo
type Intento = { metrica: 'spesa'; raggruppa: 'categoria'; da: string; a: string; limite: number }

// il numero e la frase vengono da qui, mai dal modello
const righe = await query(intento)
const primeN = righe.slice(0, intento.limite)
const quota  = somma(primeN) / somma(righe)
const sintesi = `Le prime ${intento.limite} categorie (${elenca(primeN)}) rappresentano ` +
                `il ${(quota * 100).toFixed(1)} % della spesa del periodo.`
```

Così la percentuale è vera per costruzione, la frase è unitestabile, e il titolo non può contraddire
la tabella perché entrambi derivano da `intento.limite`.

Due accorgimenti di contorno che questa risposta rende evidenti:

- **Escludere le categorie patrimoniali** dagli aggregati di spesa a monte della query, non nel testo.
- **Mostrare la base di calcolo**: «49,1 % su 348.525 € di spese del periodo» invece di «49,1 %». Il
  denominatore esplicito rende l'errore impossibile da nascondere e la verifica immediata.

**Nota di portata.** Una sola domanda è stata posta. È bastata a trovare un errore sostanziale, ma
**non basta a misurare l'affidabilità complessiva** dell'assistente: una batteria di domande a
risposta verificabile sarebbe necessaria per quello.

---

## 14. Semantica dei colori e dei segni

Dedotta dagli screenshot; nessuna legenda di sistema è esposta in prodotto.

| Significato | Segnale | Dove |
|---|---|---|
| **Entrata / ricavo** | verde acqua (teal) | barre del grafico, riga «Entrata di cassa», linea RICAVI del pareggio |
| **Uscita / costo** | rosa-salmone | barre del grafico, riga «Uscita di cassa», linea COSTI TOTALI |
| **Effettivo** | riempimento pieno, linea continua, testo tondo nero | grafico e griglia a sinistra del confine |
| **Previsto** | strisce diagonali, linea tratteggiata, testo corsivo grigio | grafico e griglia a destra del confine |
| **Periodo corrente** | fascia grigio chiaro dietro la colonna | grafico + tabella, allineati; presente sia a 1512 px sia a 390 px |
| **Scaduto / negativo** | rosso | badge `Scaduto +Ng`, importi negativi, KPI negativi, card Scaduto |
| **Pagato / positivo** | verde | badge `Pagato`, card Pagato, variazione `+20.6%` |
| **In arrivo / da fare** | ambra | card In arrivo, badge `249 da verificare`, badge `2` sull'icona orologio, titolo del modale |
| **Novità** | badge rosso `NUOVO` / `NEW` | Academy, Regole di classificazione, Referral |
| **Sperimentale** | badge blu `BETA` | Reporting, selettore organizzazione, funzioni beta |
| **Azione primaria** | nero pieno | Accedi, Importa transazioni, Aggiungi widget, Crea la tua prima regola, Prenota una demo |
| **Azione secondaria** | contorno grigio | Esporta, Categorizza, Ignora, Colonne |
| **Segno del valore** | `+` e `−` espliciti | `+2 042.60 €` / `-864.74 €` nelle transazioni; `−70 957 €` nella card |
| **Assenza di valore** | `-` | tutte le celle vuote della griglia |
| **Direzione della variazione** | freccia ↗ verde / ↘ rossa accanto alla percentuale | card del saldo |

Tre osservazioni.

**La semantica sopravvive al mobile.** A 390 px il grafico del flusso di cassa conserva tutti i
segnali: barre verdi per le entrate, rosa per le uscite, linea scura per il saldo, fascia grigia
dietro il periodo corrente, ed etichette `Effettivo | Previsione` separate da un filetto `[OSSERVATO]`.
Anche la barra segmentata a quattro colori dell'aging sopravvive nelle card dei documenti (§19.2). La
riduzione di larghezza non ha eroso il codice visivo — è la prova che i segnali erano ridondanti
abbastanza da reggere. `[NON VERIFICABILE]` l'estensione esatta della fascia grigia a 390 px: è
visibile fino al bordo del viewport e il taglio non permette di dire se copra solo la colonna corrente
o l'intera zona futura.

**Il segno esplicito.** Le entrate portano il `+` scritto, non solo il colore. È la scelta corretta:
verde e rosso non sono distinguibili per circa l'8 % dei maschi, e un estratto conto letto male è un
danno concreto. La ridondanza colore + segno + posizione rende la lettura indipendente dalla
percezione cromatica.

**La coppia teal/rosa** invece del canonico verde/rosso è una scelta di temperatura visiva: su una
griglia di mille celle il rosso saturo sarebbe aggressivo. Il rosso pieno resta riservato agli stati
di allerta veri (scaduto, KPI negativi), dove serve che spicchi.

**Come si tradurrebbe.** Token semantici in `globals.css`, mai colori letterali nei componenti:

```css
--entrata: 172 66% 50%;      /* teal */
--uscita: 349 79% 78%;       /* rosa */
--scaduto: var(--destructive);
--in-arrivo: 38 92% 50%;     /* ambra */
--pagato: 142 71% 45%;       /* verde */
```

E una regola di revisione: **nessun colore può essere l'unico portatore di un'informazione**. Ogni
stato deve avere anche una parola (il badge), un segno (`+`/`−`) o una forma (pieno/tratteggiato).

---

## 15. Onboarding e affordance

### 15.1 Academy dentro il prodotto

`[OSSERVATO]` Ottava voce di menu, badge `NUOVO`. La pagina contiene:

- Titolo «Trezy Academy» e sottotitolo «Scopri come sfruttare al meglio ogni funzionalità di Trezy»
- Una **fascia gialla**: «Per qualsiasi domanda posta tramite la chat, non utilizziamo risposte
  automatiche — una persona reale ti risponderà con una risposta dedicata.»
- Un campo `Cerca video…` e un filtro `Filtra per etichetta ▾` con otto etichette: `FLUSSO DI CASSA`
  `PREVISIONE` `FORMULA` `CATEGORIA` `TRANSAZIONI` `ONBOARDING` `CONTABILITÀ` `PRESTAZIONI`
- **4 video** con anteprima, titolo ed etichette colorate
- **13 FAQ** a fisarmonica, ciascuna con le proprie etichette
- In fondo: «Altri video e informazioni in arrivo!»

**Perché funziona.** Tre scelte non ovvie:

1. **Le FAQ sono etichettate con lo stesso vocabolario dei video e delle funzioni.** «FLUSSO DI CASSA»
   è insieme il nome di una voce di menu, un'etichetta di filtro e un tag di FAQ. Chi ha un problema
   in una schermata sa già quale etichetta filtrare.
2. **Il contenuto è di sistema, non di interfaccia.** Le domande sono «Come viene calcolato il saldo
   futuro del cashflow?», «Come funzionano le regole di classificazione e la priorità delle regole?»,
   «A cosa servono i termini di pagamento sulle categorie?» — spiegano **il modello**, non dove
   cliccare. È la documentazione che serve davvero, perché il «dove cliccare» si scopre da soli e il
   «come viene calcolato» no. È anche l'unica fonte esistente per le formule del prodotto.
3. **La promessa di risposta umana** è messa in cima, in giallo, prima di tutto il resto. In un
   momento in cui l'assistenza automatica è l'aspettativa di default, dichiarare l'opposto è un
   posizionamento — e riduce la frustrazione di chi scriverebbe in chat aspettandosi un bot.

L'onestà di «Altri video e informazioni in arrivo!» è coerente: dichiara che la sezione è parziale
invece di lasciarlo scoprire.

**Come si tradurrebbe.** Rotta `/guida` (o `/academy`), contenuti in file MDX versionati con il
codice — non in un CMS: così una modifica al calcolo e la modifica alla sua spiegazione stanno nello
stesso commit e nella stessa revisione. Le FAQ sono `<Accordion type="multiple">`, le etichette
`<Badge>` cliccabili che scrivono `?tag=previsione`. La stessa lista di tag deve essere usata come
enum per i tag delle pagine, così l'incoerenza diventa un errore di compilazione. Il collegamento
contestuale è la parte che rende utile il resto: un'icona `?` in ogni schermata che porta a
`/guida?tag=<area corrente>`.

### 15.2 Badge di novità e stato

`[OSSERVATO]` Tre livelli distinti, con codice colore coerente: `NUOVO` / `NEW` in rosso (Academy,
Regole di classificazione, 🎁 Referral), `BETA` in blu (Reporting, selettore organizzazione, gruppo
«Funzionalità Beta»), e — dove serve — una **frase di cautela** invece di un badge: in Impostazioni ›
Funzionalità, «Le funzionalità beta sono sperimentali e potrebbero cambiare o essere rimosse».

Sopra ogni schermata di Prestazioni, una fascia azzurra permanente:
**ℹ «Stima da transazioni bancarie, non contabilità ufficiale»**. È presente su tutte e sette le
schede `[OSSERVATO]`. È una dichiarazione di **limite epistemico**: questi numeri sono derivati, non
certificati. In un prodotto che mostra un conto economico e uno stato patrimoniale, ripeterlo su ogni
scheda invece che una volta sola è la scelta prudente e corretta.

**Come si tradurrebbe.** Un componente `<AvvisoDominio>` da mettere in testa a `layout.tsx` della
sezione, non nelle singole pagine — così è impossibile dimenticarlo su una scheda:

```tsx
<Alert className="mb-4">
  <Info className="size-4" />
  <AlertDescription>Stima da movimenti bancari, non contabilità ufficiale.</AlertDescription>
</Alert>
```

I badge sono varianti dichiarate una volta (`novita`, `beta`) e attribuite ai record del registro di
navigazione, con una **data di scadenza**: `novitaFino: '2026-10-01'`. Un badge `NUOVO` che resta per
un anno smette di significare qualcosa.

### 15.3 Flag di onboarding per area

`[OSSERVATO]` L'API espone `GET /api/v2/users/{id}/onboarding`, chiamata 8 volte nella sessione.
`[DEDOTTO]` Esiste uno stato di onboarding per utente, verosimilmente per area. Il suo contenuto non è
stato ispezionato `[NON VERIFICABILE]`, e nessun tour guidato o tooltip di primo utilizzo è comparso
durante la navigazione — coerente con un account già inizializzato.

**Come si tradurrebbe.** Tabella `onboarding_stato (utente_id, chiave, completato_il)` con una chiave
per area (`cashflow`, `transazioni`, `regole`). Il suggerimento contestuale si mostra finché la chiave
non è completata, e si completa alla **prima esecuzione riuscita** dell'azione, non alla chiusura del
suggerimento: chiudere un cartello non significa aver capito.

---

## 16. Power user: cosa non c'è

Questa sezione riporta soprattutto assenze, classificate con precisione.

| Funzione | Stato | Evidenza |
|---|---|---|
| **Ricerca globale** | `[ASSENTE]` | Esistono **quattro ricerche locali distinte** e nessuna trasversale: `Cerca transazioni…` (Transazioni), `Cerca documenti…` (Documenti), `Cerca organizzazione…` (Fornitori/Clienti), `Cerca video…` (Academy). Nessun campo di ricerca nell'intestazione globale, nessuna scorciatoia di apertura osservata. A 390 px la ricerca di pagina è **promossa in testata** a piena larghezza `[OSSERVATO]`, ma resta locale alla rotta |
| **Palette di comandi (Cmd+K)** | `[ASSENTE]` | Nessun elemento in nessuno dei dump di tutte le rotte; nessuna menzione in Academy né nei materiali pubblici |
| **Scorciatoie da tastiera** | `[NON VERIFICABILE]` — con un indizio positivo | Un pulsante **`⌨ ?`** è presente nella barra filtri della sola pagina Documenti `[OSSERVATO]`, accanto a `Colonne`. Non è stato aperto. Nessuna occorrenza testuale di «scorciatoia/shortcut/tastiera/keyboard» nei dump. `[IPOTESI]` un pannello di scorciatoie limitato a quella tabella |
| **Viste salvate** | `[ASSENTE]` | Nessuna UI di salvataggio in nessuna tabella; nessuna menzione in KB o pricing (vedi §7.3) |
| **Filtri in URL** | `[ASSENTE]` | Nessuna rotta applicativa con query string in nessuna sessione (§7.3) |
| **Deep link ai tab** | `[ASSENTE]` | Gli 8 tab di Impostazioni condividono la stessa URL `/settings`; idem per i 7 tab di Prestazioni su `/performance` |
| **Esportazione** | `[OSSERVATO]`, non provata | Pulsanti `Esporta` in Transazioni e Prestazioni, icona di esportazione nel cashflow e nel drill-down. Formati dichiarati nel materiale pubblico: CSV ed Excel. Nessuna esportazione eseguita `[NON VERIFICABILE]` |
| **Annotazione dei report** | `[OSSERVATO]` | Barra di strumenti flottante in fondo alla pagina Reporting: testo `A`, freccia, freccia curva, rettangolo, cerchio, linea. È un livello di annotazione sopra il report — funzione non documentata altrove. `[NON VERIFICABILE]` il comportamento |
| **Condivisione del report** | `[OSSERVATO]` | Icona di condivisione nella barra di Reporting, con pulsanti annulla/ripeti (`↺` `↻`) accanto. `[NON VERIFICABILE]` se produca un link pubblico |

**Lettura d'insieme.** Il prodotto è costruito per un utente che entra, guarda e agisce con il mouse —
non per un operatore che ci passa la giornata. Le assenze (ricerca globale, palette comandi, viste
salvate, deep link) sono tutte dello stesso tipo: **strumenti di ripetizione**. Coerente con il
posizionamento (un titolare di PMI che apre lo strumento la mattina), meno adatto a chi deve fare data
entry o riconciliazione per ore.

**Come si tradurrebbe.** Nel nostro stack `command.tsx` (cmdk) è **già presente**: la palette è
poche ore di lavoro, non un progetto. Il valore sta nel registro dei comandi, non nel widget:

```tsx
const COMANDI = [
  { gruppo: 'Vai a', label: 'Flusso di cassa', azione: () => router.push('/cash-flow') },
  { gruppo: 'Vai a', label: 'Scadenzario',     azione: () => router.push('/scadenzario') },
  { gruppo: 'Filtri', label: 'Fatture scadute', azione: () => router.push('/fatture?stato=scaduto') },
  { gruppo: 'Azioni', label: 'Nuova regola di classificazione', azione: apriRegola },
]
```

Con i filtri già in URL (§7.3, livello 1), le voci «Filtri» della palette sono semplici `push` — e la
palette diventa il surrogato immediato delle viste salvate, prima ancora di implementarle.

---

## 17. Lessico italiano di dominio

Le etichette **esatte** osservate in interfaccia. Ha valore diretto come vocabolario di riferimento
per l'italiano di tesoreria.

### Flusso di cassa

| Etichetta Trezy | Che cosa indica |
|---|---|
| **Flusso di cassa** | la sezione (rotta `/cashflow`) |
| **Contanti all'inizio** | saldo di apertura del periodo |
| **Contanti alla fine** | saldo di chiusura del periodo |
| **Entrata di cassa** | totale degli incassi del periodo |
| **Uscita di cassa** | totale dei pagamenti del periodo |
| **Saldo totale di N account** | intestazione del saldo aggregato |
| **Saldo attuale** | saldo bancario corrente |
| **vs mese scorso** | base del confronto percentuale (ma vedi §18.5) |
| **Effettivo** / **Previsione** | le due zone della griglia |
| **Previsionato** | variante usata nella legenda del mini-grafico di drill-down |
| **Scenario Principale** | scenario predefinito |
| **Crea nuovo scenario** | comando di duplicazione dello scenario |
| **Giornaliero · Settimanale · Mensile · Trimestrale** | le quattro risoluzioni |
| **Dettagliato** / **Globale** | le due modalità di previsione |
| **IVA a debito · IVA a credito · Saldo IVA** | le tre righe fiscali della griglia |
| **Aggiungi previsione** | comando nel pannello di drill-down |
| **Periodo precedente · Periodo successivo** | navigazione temporale nel drill-down |
| **Chiedi a Trezy** | assistente conversazionale |

### Documenti e crediti

| Etichetta Trezy | Che cosa indica |
|---|---|
| **Pagato** · **Scaduto** · **In arrivo** | i tre stati di una fattura |
| **Scaduto +117g** | stato con giorni di ritardo incorporati |
| **0-30g · 30-60g · 60-90g · 90+g** | fasce di anzianità del credito/debito |
| **Incassato** | qualificatore dell'importo pagato |
| **Scadenza 29 Aug** | data della prossima scadenza (in inglese, vedi §18.3) |
| **Pagamento previsto** | colonna della data di pagamento attesa |
| **da verificare** | badge del contatore di documenti non confermati |
| **Da pagare** · **Tempo medio di pagamento** · **Totale anno** | colonne della scheda Fornitori |
| **Importo dovuto** · **Ritardo medio** · **Ultima attività** · **Valutazione** | colonne della scheda Clienti |
| **Acquisto** / **Vendita** | verso del documento |
| **Candidati** | transazioni candidate all'abbinamento con un documento |
| **Verifica** | comando di conferma dei dati estratti |
| **In elaborazione** · **Estrazione dati dal documento…** | stato di lavorazione OCR |

### Transazioni e categorie

| Etichetta Trezy | Che cosa indica |
|---|---|
| **Categorizza** | assegnare una categoria a una o più transazioni |
| **Regole di classificazione** | regole automatiche per parola chiave |
| **Categoria contabile** | conto del piano dei conti associato alla categoria |
| **Categoria padre** | gerarchia delle categorie |
| **Aliquota IVA** | aliquota per categoria |
| **Termini di pagamento** | ritardo medio (in giorni) fra registrazione e cassa |
| **C/E** / **Stato patrimoniale** | destinazione contabile della categoria |
| **Incluse / Escluse** | transazioni incluse o escluse dai calcoli |
| **Con documento / Senza documento** · **Con nota / Senza nota** | filtri sull'assenza |
| **Mostra solo quelle utilizzate** | filtro sulle categorie in uso |
| **Riconciliazione** | collegamento fra previsione e transazione |
| **Centri di costo · Nature · Codici analitici** | le tre dimensioni analitiche |

### Prestazioni

| Etichetta Trezy | Che cosa indica |
|---|---|
| **Punto di pareggio** | break-even point |
| **Margine di sicurezza** | scarto fra ricavi e pareggio |
| **Punto morto** | pareggio espresso in giorni |
| **Risultato operativo** | EBIT |
| **Margine lordo** · **Margine EBITDA %** · **Margine netto** | indici di redditività |
| **Indice di Liquidità Corrente / Immediata / Secca** | indici di liquidità |
| **Capitale circolante** · **Fabbisogno di capitale circolante** · **Liquidità netta** | indici di struttura |
| **Giorni Medi di Incasso (DSO)** · **di Pagamento (DPO)** · **di Magazzino (DIO)** | indici di attività |
| **Ciclo di Conversione del Contante** | cash conversion cycle |
| **Rapporto Debito/Patrimonio** · **di Indebitamento** · **di Capitalizzazione** | indici di solvibilità |
| **Valore d'impresa** · **Indebitamento netto** · **Valore del patrimonio** | valutazione |
| **Analisi di sensibilità** · **Matrice di sensibilità 2D** · **Ranking di impatto** | analisi di scenario |
| **Registrazioni** · **Giornale** · **Dare** / **Avere** | partita doppia |
| **Variazione A-1** · **% dei ricavi** · **Confronta con la previsione** | basi di confronto |
| **Periodo** / **Cumulativo** | modo di lettura del conto economico |
| **Ultimo periodo effettivo** | confine di attendibilità dei dati |
| **Stima da transazioni bancarie, non contabilità ufficiale** | dichiarazione di limite |

Da **non** riusare: `Flux di cassa` (nella pagina Fatturazione), `Minuro` (nei filtri),
`Intégrations`, `Produits`, `données estimées (transactions bancaires)`, `Stock Variation`,
`Owner Compensation`, `Product invoices`, `excl.`. Sono errori, non terminologia (§18).

---

## 18. Debolezze di UX

### 18.1 Nessuna persistenza dei filtri e dello stato

Trattata al §7.3. È il difetto strutturale con l'impatto quotidiano più alto: nessuna URL applicativa
porta stato, quindi nessun filtro, ordinamento, tab o risoluzione è recuperabile, condivisibile o
annullabile con il tasto Indietro. `[OSSERVATO]` su tutte le rotte.

### 18.2 L'assistente afferma una percentuale falsa

Trattata per esteso al §13.2. In sintesi: la frase di sintesi dichiara che le prime tre categorie di
spesa «rappresentano il 70 % della tua spesa totale», mentre sui numeri mostrati dall'assistente stesso
nella tabella sovrastante la quota è **49,1 %** (171.189 € su 348.525 €). Nessuna base di calcolo
plausibile restituisce 70 %: neppure depurando il denominatore dalle voci patrimoniali si va oltre il
58,0 %.

È il difetto più grave rilevato, per tre ragioni: il numero è **presentato come fatto**, si trova nella
parte della risposta che viene letta e ripetuta, e la tabella accanto gli conferisce un'autorevolezza
che non ha. In un prodotto di tesoreria una proporzione inventata può motivare una decisione reale.

Nella stessa risposta, due difetti minori: il titolo annuncia tre categorie e la tabella ne elenca
quindici; e un follow-up generato contiene un errore grammaticale («l'andamento **dei** stipendi»).

### 18.3 Localizzazione mista: italiano, inglese e francese nella stessa schermata

`[OSSERVATO]` L'inventario completo di ciò che è stato incontrato:

| Testo | Lingua | Dove |
|---|---|---|
| `Intégrations` | francese | titolo della scheda Impostazioni › Integrazioni (mentre il tab si chiama «Integrazioni») |
| `Produits` · `Activez ces fonctionnalités pour accéder aux analyses produits et fournisseurs…` | francese | Impostazioni › Funzionalità, intera sezione |
| `données estimées (transactions bancaires)` | francese | Prestazioni › KPI, riquadro «BASATO SU» |
| `Flux di cassa` | ibrido FR/IT | elenco delle funzioni dei tre piani, in Fatturazione — **tre volte** |
| `Notifications` | inglese | nome del tab in Impostazioni (gli altri sette sono in italiano) |
| `Balance alerts` · `Get an email when a bank account drops below the threshold you set…` · `Alert enabled` · `Notify me when balance drops below` · `Also notify these emails (CC)` · `Add` · `Customise email subject & body` · `Save` | inglese | **intera** scheda Notifications |
| `Synthesis Dashboard` | inglese | titolo H1 di Prestazioni › Dashboard |
| `Revenue` · `Gross Profit` · `Net Result` | inglese | tabella «Indicatori chiave» (mentre `EBITDA` è comune) |
| `Stock Variation` · `Studies & Services` · `Equipment & Materials` · `Purchase Accessories` · `Purchase Discounts (RRR)` · `Value Added` · `Research & Studies` · `External Services Discounts (RRR)` · `External Staff` · `Transport of Goods` · `Other External Discounts (RRR)` · `Owner Compensation` · `Bonuses & Gratifications` · `Benefits in Kind` · `Other Operating Income` · `Other Operating Expenses` | inglese | voci del conto economico, mescolate a voci italiane nella **stessa colonna** |
| `CA` · `Achats` · `Personnel` · `Charges ext.` · `Impôts & taxes` · `EBE` · `Amort.` · `Rés. Expl.` · `Financier` · `Exceptionnel` · `IS` · `Résultat Net` | francese | etichette della Cascata P&L, tutte |
| `Créances fiscal…` · `Immobilisations…` | francese | grafico Struttura patrimoniale |
| `Product invoices` | inglese | intestazione H2 nella pagina Documenti |
| `excl.` | inglese | sotto ogni importo della tabella Documenti (per «IVA esclusa») |
| `28 Dec 2026` · `11 Aug 2026` · `05 Sept 2026` · `13 Mar 2023` | formato inglese | **tutta** la colonna Data della tabella Documenti |
| `Scadenza 29 Aug` | ibrido | card «In arrivo» |
| `Jun 2026 (M-2)` · `May 2026 (M-3)` · `Apr 2026 (M-4)` | inglese | selettore «Ultimo periodo effettivo» |
| `Transactions & Documents` | inglese | intestazione di sezione nel pannello di drill-down |
| `3-month evolution` · `My biggest expenses this month` · `Next month forecasts` | inglese | i tre suggerimenti dell'assistente «Chiedi a Trezy» |
| `🇫🇷 French` | inglese | una delle otto voci del selettore di lingua — le altre sette sono in italiano (`Inglese`, `Tedesco`, `Spagnolo`, `Italiano`, `Olandese`, `Polacco`, `Croato`) |

**Perché è grave.** Non è una questione estetica. Le date in formato inglese (`11 Aug 2026`) in una
colonna di scadenze, in un prodotto usato da imprenditori italiani, sono un rischio di lettura reale:
`05 Sept 2026` e `09 May 2026` richiedono un attimo di traduzione mentale ogni volta. E il francese
nella Cascata P&L rende **illeggibile** un grafico intero a chi non conosce il piano dei conti
francese: `EBE`, `Rés. Expl.`, `IS` non hanno alcun significato per un lettore italiano.

`[DEDOTTO]` Il pattern suggerisce un prodotto nato in francese, tradotto in inglese come lingua ponte
e poi in italiano, con la traduzione applicata **a livello di schermata** invece che di stringa: le
schermate più recenti (Notifications, Reporting) e le più profonde (voci di C/E, Cascata) sono rimaste
indietro.

**Come si tradurrebbe.** Nessuna stringa letterale nei componenti; catalogo unico con chiavi
tipizzate; e un **controllo automatico in CI** che fallisce se il catalogo italiano ha chiavi mancanti
rispetto a quello di riferimento — è il solo modo perché il debito non si riaccumuli. Per le date,
`Intl.DateTimeFormat('it-IT')` in un unico formattatore condiviso, mai `toLocaleDateString()` senza
locale esplicito (che eredita quella del browser e produce esattamente questo tipo di incoerenza).

### 18.4 Il refuso «Minuro»

`[OSSERVATO]` Nel popover Filtri della pagina Transazioni, il campo dell'importo minimo è etichettato
**`Minuro`** invece di «Minimo». Accanto, «Massimo» è corretto.

Piccolo, ma istruttivo: è un'etichetta in un percorso ad alta frequenza (filtrare le transazioni per
importo) sopravvissuta fino alla produzione. `[DEDOTTO]` Nessuna revisione linguistica sulle stringhe
tradotte.

**Come si tradurrebbe.** Le stringhe dell'interfaccia vanno riviste da una persona che legge il
catalogo per intero, non schermata per schermata. Un catalogo di poche centinaia di chiavi si rilegge
in un'ora e i refusi saltano fuori tutti insieme.

### 18.5 Il delta «vs mese scorso» cambia con la risoluzione

`[OSSERVATO]` La card del saldo mostra sempre lo stesso valore (`31 140.40 €`) ma un delta diverso a
seconda della risoluzione selezionata, **con la stessa etichetta**:

| Risoluzione attiva | Delta mostrato | Etichetta |
|---|---|---|
| Mensile | **−8.7 %** | «vs mese scorso» |
| Settimanale | **+23.5 %** | «vs mese scorso» |
| Trimestrale | **+20.6 %** | «vs mese scorso» |

`[DEDOTTO]` Il confronto è in realtà «vs periodo precedente» — cioè settimana precedente nella vista
settimanale, trimestre precedente nella trimestrale — ma l'etichetta è cablata su «mese scorso». Il
segno stesso si inverte fra le viste (−8,7 % contro +23,5 %), quindi la stessa azienda risulta in calo
o in crescita a seconda di quale pulsante è premuto, senza che nulla lo segnali.

È il difetto più insidioso trovato, perché **non sembra un errore**: nessuna schermata è rotta,
nessun numero è visibilmente assurdo. Un utente che passa da mensile a settimanale e vede il segno
cambiare non ha modo di capire che l'etichetta sta mentendo.

**Come si tradurrebbe.** L'etichetta del confronto deve essere **derivata dalla stessa costante** che
determina il periodo di confronto, mai scritta a mano:

```ts
const ETICHETTA_CONFRONTO = {
  giorno: 'vs ieri', settimana: 'vs settimana scorsa',
  mese: 'vs mese scorso', trimestre: 'vs trimestre scorso',
} as const satisfies Record<Risoluzione, string>
```

Regola generale: **ogni numero comparativo deve portare la sua base di confronto, e la base deve
venire dalla stessa fonte del calcolo**. Se l'etichetta è una stringa e il calcolo è altrove, prima o
poi divergono.

### 18.6 Suggerimenti dell'assistente in inglese

`[OSSERVATO]` Il pannello «Chiedi a Trezy» ha titolo, sottotitolo e segnaposto in italiano
(«Chiedimi qualsiasi cosa sul tuo flusso di cassa», «Posso cercare transazioni, analizzare le spese,
confrontare periodi e verificare le previsioni.», «Chiedi informazioni sul tuo flusso di cassa…») ma i
**tre suggerimenti precaricati sono in inglese**: `3-month evolution`, `My biggest expenses this
month`, `Next month forecasts`.

I suggerimenti sono ciò che l'utente clicca al primo utilizzo: sono la parte più visibile del pannello
e l'unica che insegna cosa si può chiedere. `[IPOTESI]` Un utente italiano che li legge può ragionevolmente
dedurre che debba scrivere in inglese, e non provare affatto.

### 18.7 Incoerenze fra numeri della stessa grandezza

`[OSSERVATO]` Nella sola pagina Prestazioni, tre casi di gravità decrescente — vale la pena
distinguerli, perché richiedono rimedi diversi.

**Un problema di sola etichetta.** I **ricavi 2026** valgono `218 234,1 €` nella Dashboard e nei KPI
ma `213 619,09 €` in Pareggio. L'esame dei payload mostra che non è un errore di calcolo: sono due
campi distinti dello stesso endpoint — `revenue.totalRevenue.amount` e `revenue.sales.amount` — e i
4 615 € di scarto sono gli altri ricavi. Difetto reale ma minore: **l'interfaccia chiama entrambi
«Ricavi»** e non dà all'utente modo di sapere che sta guardando due grandezze diverse.

**Un valore che non arriva a schermo.** La Dashboard mostra `Gross Profit 0 €` mentre due endpoint
restituiscono un margine lordo non nullo (`96 160,42 €` nei KPI, `95 560,65 €` nel break-even; i due
differiscono di 600 € per diversa definizione di costo variabile, il che è tollerabile). Zero contro
novantaseimila non è un arrotondamento né una definizione diversa: è un dato che si perde.

**Due orizzonti temporali affiancati, ed è il caso peggiore.** Nella scheda Pareggio, «punto morto
176 giorni» è calcolato su ricavi **annualizzati** (fattore 365/101), mentre margine di sicurezza e
insight testuale usano i ricavi **grezzi** di 101 giorni contro un pareggio annuo. Entrambe le
grandezze sono difendibili da sole; affiancate dicono cose opposte — e **il punto morto è verde
mentre i tre riquadri accanto sono rossi**. Il colore, che dovrebbe orientare, qui disorienta:
l'utente riceve una rassicurazione e tre allarmi sulla stessa riga, sugli stessi dati.

**Come si tradurrebbe.** Gli aggregati devono venire da **una sola funzione di calcolo** condivisa
(un modulo puro, unitestato), non da endpoint diversi che reimplementano la stessa definizione. Dove
due definizioni sono legittimamente diverse (ricavi di competenza contro ricavi di cassa), la
differenza va **dichiarata nell'etichetta**, non lasciata dedurre.

### 18.8 Altre incoerenze del modello

`[OSSERVATO]`, in ordine di gravità decrescente:

- **Piano dei conti francese su un account italiano.** L'account è configurato «Italia —
  Personalizzato» (`IT_CUSTOM`), ma le scritture di Prestazioni › Registrazioni usano conti del *Plan
  Comptable Général* francese (`512100 Banque`, `468870 Produits à recevoir - Divers`) con giornale
  `BQ`. Un commercialista italiano non riconoscerebbe nulla di quel partitario.
- **Aliquota IVA di default al 20,0 %** su tutte le categorie, mentre l'ordinaria italiana è 22 %.
  Non è un dettaglio cosmetico: le righe «IVA a debito / a credito / Saldo IVA» della griglia sono
  calcolate su questa aliquota.
- **`"categoryName": "Category not found"`** restituito da `forecast-breakdown` per una categoria di
  entrata con importo non nullo: un valore reale, con un'etichetta rotta.
- **`Vendita 0` con `Acquisto 249`**: nessun documento di vendita è mai stato caricato. Coerente con
  i dati, ma significa che metà della funzione «Documenti» è `[NON POPOLATO]`.
- **Colonne «Tempo medio di pagamento» e «Ritardo medio» tutte a `--`** nelle schede Fornitori e
  Clienti, per ogni riga, su 249 documenti. `[DEDOTTO]` Il calcolo richiede la riconciliazione fra
  documento e transazione, che non è mai stata fatta su questo account.
- **`Categoria predefinita del flusso di cassa`** ripetuta identica in ogni riga della colonna
  Categoria di Fornitori e Clienti: una colonna che occupa spazio senza portare informazione finché
  non viene configurata.

### 18.9 Difetti visibili solo da mobile

Trattati per esteso ai §19.3, §19.4 e §19.5. Riepilogo, perché appartengono a questo elenco quanto
agli altri:

- **Un collegamento morto in produzione**: la voce «Contabilità» della barra di navigazione inferiore
  punta a `/accounting`, rotta inesistente che reindirizza a `/cashflow`. La voce **non esiste nel menu
  desktop**, quindi il difetto è invisibile a chiunque non provi il prodotto sul telefono.
- **Il pulsante «FILTRA» sparisce dalle card di stato**: il pattern meglio riuscito del prodotto (§5)
  non sopravvive a 390 px, proprio dove scorrere 249 righe è più faticoso.
- **Intestazioni sovrapposte** nella tabella Registrazioni (`N° REGISTRAZIONECONTO`), righe altissime
  e date troncate: l'unica schermata in cui l'adattamento mobile non è stato fatto.
- **I pulsanti flottanti coprono il contenuto** in fondo alla lista dei documenti.
- **Il suggerimento del gesto di selezione è mostrato dove il gesto non è praticabile**, su una
  descrizione per giunta troncata.

`[DEDOTTO]` Il quadro complessivo è quello di un layout mobile progettato con cura sulle schermate
principali e non rifinito su quelle secondarie, con una navigazione costruita da un elenco separato e
mai riconciliato con il desktop.

---

## 19. Responsive e mobile

Misurazione a **390 × 844 px**, a pagina carica, su cinque rotte: `/cashflow`, `/transaction`,
`/document`, `/performance`, `/settings`.

### 19.1 Nessun overflow orizzontale, su nessuna delle cinque rotte

`[OSSERVATO]` Il criterio applicato è quello corretto e severo: `main.scrollWidth == main.clientWidth
== 390` **e** nessun elemento sporgente oltre il viewport. Superato su tutte e cinque le rotte.

Il risultato non è scontato proprio dove conta di più: la **tabella pivot da circa mille celle scorre
dentro il proprio contenitore**, non trascina la pagina. Nello screenshot del flusso di cassa si vede
la griglia tagliata a metà colonna sul bordo destro — il taglio è dentro il riquadro scorrevole, e il
resto della pagina (grafico, barra inferiore) resta ancorato.

**Perché conta.** È la differenza fra una pagina usabile e una rotta. Quando una tabella larga
trascina il documento, ogni scorrimento verticale fatto col pollice fa slittare anche in orizzontale,
la barra di navigazione esce dallo schermo e la pagina non torna mai in registro. Confinare lo
scorrimento nel contenitore costa una riga di CSS e salva l'intera schermata.

**Come si tradurrebbe.** Il contenitore della griglia porta `overflow-x: auto` e — decisivo — un
antenato con `min-width: 0`. In un layout flex o grid la causa numero uno dell'overflow è che il
figlio ha `min-width: auto` implicito e si rifiuta di restringersi:

```tsx
<div className="flex min-w-0 flex-col">           {/* min-w-0: senza, il figlio sfonda */}
  <div className="overflow-x-auto overscroll-x-contain">
    <table className="w-max">…</table>
  </div>
</div>
```

`overscroll-x-contain` impedisce che lo scorrimento, arrivato a fine tabella, si propaghi al
documento. La verifica va automatizzata, perché è una regressione che rientra facilmente:

```ts
const m = document.querySelector('main')!
expect(m.scrollWidth).toBe(m.clientWidth)
```

### 19.2 Il layout mobile non è il desktop ristretto

`[OSSERVATO]` La barra laterale sparisce e compare una **barra di navigazione inferiore fissa a
cinque voci**, con icona sopra ed etichetta sotto, la voce attiva in nero e le altre in grigio:

**Flusso di cassa · Prestazioni · Contabilità · Transazioni · Documenti**

Restano fuori quattro sezioni presenti su desktop — Reporting, Categorie, Impostazioni, Academy — e
non è stato individuato un menu secondario che le raggiunga `[NON VERIFICABILE]`.

Gli adattamenti osservati, rotta per rotta:

| Rotta | Che cosa cambia a 390 px |
|---|---|
| `/transaction` | La **ricerca è promossa in testata**, a piena larghezza (su desktop è a destra, accanto ai filtri). Ogni transazione diventa una card verticale a tre livelli: descrizione + badge dei simili, importo, poi conto e categoria. **Due azioni per riga sono esposte come icone** (occhio barrato e frecce incrociate) — su desktop non sono visibili in riga. I filtri diventano un **pulsante flottante** in basso a destra |
| `/document` | Le tre card di stato si **impilano a piena larghezza** conservando tutto: numerosità, importo, barra di avanzamento, e la **barra segmentata dell'aging con le quattro fasce**. I tab `Tutto 249 · Acquisto 249 · Vendita 0` scorrono in orizzontale. **Due pulsanti flottanti** sovrapposti: un `+` nero e il filtro |
| `/performance` | I sette tab diventano una **striscia scorrevole orizzontale**. La fascia «Stima da transazioni bancarie, non contabilità ufficiale» sopravvive e va a capo su due righe |
| `/settings` | Gli otto tab scorrono in orizzontale; il tab attivo è reso con un **gradiente blu-verde** invece del nero desktop. I controlli vanno a piena larghezza, il `<select>` è quello nativo. Le sezioni acquistano un'**icona in riquadro colorato** che su desktop non c'è |
| `/cashflow` | Il grafico resta in testa a piena larghezza; la griglia scorre nel proprio contenitore; le etichette `Effettivo | Previsione` e il filetto di separazione sopravvivono |

**Perché funziona.** È un layout progettato, non un `@media` che nasconde colonne. Tre scelte in
particolare reggono bene:

1. **La ricerca sale, i filtri scendono.** Su schermo piccolo la ricerca testuale è l'azione più
   frequente e va nel pollice-alto; il filtraggio strutturato è occasionale e sta bene in un pulsante
   flottante. Su desktop la gerarchia è invertita, e va bene così: sono contesti d'uso diversi.
2. **La card di stato non perde informazione.** La barra segmentata dell'aging con quattro fasce
   sopravvive a piena larghezza — è la parte che vale, e non è stata sacrificata.
3. **La riga diventa card con le azioni esposte.** Su desktop l'azione si scopre al passaggio del
   mouse; su touch il passaggio non esiste, quindi le azioni vanno rese visibili. È il ragionamento
   giusto.

**Come si tradurrebbe.** La barra inferiore è un componente proprio, montato sotto il breakpoint, con
`position: fixed; bottom: 0` e — obbligatorio — `padding-bottom: env(safe-area-inset-bottom)` per non
finire sotto la barra gestuale di iOS. Il contenuto della pagina va compensato con un
`padding-bottom` pari all'altezza della barra, altrimenti l'ultimo elemento resta coperto (è esattamente
ciò che accade nello screenshot di `/document`, §19.4).

Il punto architetturale: **una sola sorgente di verità per la navigazione**, filtrata per contesto.

```ts
export const NAVIGAZIONE = [
  { href: '/cash-flow',      label: 'Flusso di cassa', icon: BarChart3, mobile: true },
  { href: '/scadenzario',    label: 'Scadenzario',     icon: CalendarClock, mobile: true },
  …
] as const
```

La barra desktop rende tutte le voci, quella mobile `NAVIGAZIONE.filter(v => v.mobile)`. Due elenchi
scritti a mano divergono — ed è precisamente ciò che è successo a Trezy (§19.3).

### 19.3 Il collegamento morto «Contabilità»

`[OSSERVATO]` La terza voce della barra inferiore, **«Contabilità»**, punta a `/accounting`: una rotta
che **non esiste** e che reindirizza a `/cashflow`. Il tocco porta l'utente sulla schermata da cui è
partito, senza messaggio.

Due aggravanti:

1. **La voce non esiste nel menu desktop.** Le otto voci desktop non includono «Contabilità»: è una
   voce esclusiva del mobile. `[DEDOTTO]` La barra inferiore è stata costruita da un elenco separato,
   mai riconciliato con la navigazione principale — la conseguenza prevedibile di due elenchi scritti
   a mano.
2. **È invisibile da desktop.** Un difetto che si manifesta solo sotto il breakpoint sfugge a
   chiunque non provi il prodotto sul telefono, e resta in produzione a tempo indefinito.

L'effetto sull'utente è peggiore di un errore dichiarato: un `404` si capisce, un redirect silenzioso
alla schermata di partenza fa pensare che sia stato il proprio tocco a sbagliare.

**Come si tradurrebbe.** L'elenco unico del §19.2 rende il caso impossibile per costruzione, se gli
`href` sono tipizzati sulle rotte esistenti — con `typedRoutes` di Next, `href: '/accounting'` non
compila se la rotta non c'è. In aggiunta, un test di fumo che percorre ogni voce di navigazione e
verifica che la risposta non sia un redirect: dieci righe, e copre l'intera classe di difetti.

### 19.4 Difetti di layout a 390 px

`[OSSERVATO]` Quattro problemi concreti, in ordine di gravità.

1. **Il pulsante «FILTRA» sparisce dalle card di stato.** Su desktop ogni card (Pagato / Scaduto /
   In arrivo) porta il pulsante che filtra la tabella sottostante — il pattern meglio riuscito del
   prodotto (§5). A 390 px il pulsante **non c'è più**: le card conservano tutti i dati e perdono
   l'unica azione. Proprio sul dispositivo in cui scorrere una tabella di 249 righe è più faticoso,
   viene a mancare la scorciatoia che la rende superflua.
2. **Le intestazioni della tabella Registrazioni si sovrappongono.** In Prestazioni › Registrazioni
   si legge `N° REGISTRAZIONECONTO`: due intestazioni collassate l'una sull'altra. Le righe hanno
   inoltre un'altezza enorme e in gran parte vuota, e la data è troncata (`10/08/2...`). È l'unica
   schermata in cui l'adattamento mobile non è stato fatto: la tabella desktop è stata lasciata
   restringere.
3. **I pulsanti flottanti coprono il contenuto.** In `/document` i due pulsanti sovrapposti nascondono
   una porzione della terza card. Manca il `padding-bottom` di compensazione in fondo alla lista.
4. **L'etichetta della prima voce di navigazione è troncata**: «Flusso di c...». Con cinque voci in
   390 px lo spazio per etichetta è di circa 78 px — insufficiente per un'etichetta di tre parole.
   La via d'uscita è un'etichetta mobile più corta («Cassa»), non i puntini di sospensione.

### 19.5 Un gesto che su mobile non si può fare

`[OSSERVATO]` La striscia «Suggerimento: Evidenzia il testo in una transazione per creare una regola di
classificazione» è presente **anche a 390 px**, in cima alla lista delle transazioni.

Ma il gesto che promuove — selezionare una porzione di testo — su touch richiede pressione prolungata
e poi il trascinamento di due maniglie, dentro una descrizione che nella card mobile è **troncata**
(«Bonifico a ...»). La funzione più originale del prodotto (§10) è quindi pubblicizzata proprio dove è
meno praticabile.

`[IPOTESI]`, non verificata: che il gesto funzioni comunque via `selectionchange`. Anche se
funzionasse, resterebbe un percorso ostile.

**Come si tradurrebbe.** Il suggerimento va mostrato solo dove il gesto è realizzabile — condizione su
puntatore fine, non su larghezza:

```tsx
const puntatoreFine = useMediaQuery('(pointer: fine)')
{puntatoreFine && <SuggerimentoSelezione />}
```

E su touch va offerto il percorso equivalente: nel menu contestuale della riga, una voce **«Crea regola
da questa transazione»** che apre lo stesso `<Sheet>` con la descrizione completa e le parole
selezionabili come chip, invece della selezione libera. Stessa funzione, gesto adatto al dispositivo.

---

## 20. Accorgimenti ad alto rapporto valore/costo

I dieci più replicabili, ordinati per rapporto fra impatto e ore di lavoro. La stima è per il nostro
stack, con i componenti già presenti in `src/components/ui/`.

---
**1 — Confinare lo scorrimento orizzontale nel contenitore della tabella** · *impatto alto, ~1-2 h*

`overflow-x: auto` sul riquadro della tabella, `min-w-0` sull'antenato flex, `overscroll-x-contain`
per non propagare lo scorrimento al documento. Una griglia da mille celle diventa consultabile a
390 px senza che la pagina slitti sotto il pollice. Con la verifica automatica —
`expect(main.scrollWidth).toBe(main.clientWidth)` su ogni rotta — la regressione non rientra più.
È il miglior rapporto della lista: due righe di CSS e un test contro l'errore che rende una schermata
inutilizzabile su telefono (§19.1).
*Modello dati*: nessuna modifica.

---

**2 — Filtri, ordinamento e tab in `searchParams`** · *impatto altissimo, ~4-6 h per schermata*

Ogni controllo scrive in URL; la pagina è un Server Component che legge `searchParams` e interroga il
database. Rende automaticamente vere quattro cose insieme: persistenza al refresh, condivisibilità via
link, tasto Indietro funzionante, e deep link ai tab. È anche il **prerequisito** degli accorgimenti
2, 3 e 10. È l'unico punto in cui replichiamo l'opposto di ciò che fa Trezy (§7.3): il suo limite più
costoso è la nostra occasione più economica.
*Rotte*: tutte quelle con tabelle — `/fatture`, `/scadenzario`, `/prima-nota`, `/riconciliazione`.
*Modello dati*: nessuna modifica.

---

**3 — Card di stato con pulsante «Filtra»** · *impatto altissimo, ~4 h*

Tre `<Card>` (Pagato / Scaduto / In arrivo) con numerosità, importo, percentuale sul totale e un
`<Button asChild><Link href="/fatture?stato=scaduto">Filtra</Link></Button>`. Due click dal totale
alla fattura che lo causa. Il pulsante **esplicito** batte la card cliccabile: è scopribile e non
intrappola il click.

**Da mantenere anche sotto il breakpoint**: a 390 px Trezy conserva i dati della card e perde il
pulsante (§19.4), cioè toglie la scorciatoia proprio dove scorrere centinaia di righe costa di più.
Essendo un `<Link>` e non un menu, occupa una riga e non ha ragione di sparire.
*Rotta*: `/scadenzario` o `/fatture`. *Modello dati*: nessuna modifica se lo stato è calcolabile in SQL.

---

**4 — Aging dentro il badge di stato** · *impatto alto, ~3 h*

`Scaduto +117g` invece di una colonna «giorni di ritardo». Due informazioni in una parola, zero
colonne consumate. Con la barra segmentata sulle fasce `0-30 / 30-60 / 60-90 / 90+` nella card, si
vede in un colpo d'occhio se lo scaduto è un ritardo diffuso o un blocco antico.
*Modello dati*: **nessuna colonna `stato` materializzata** — `GREATEST(0, CURRENT_DATE - data_scadenza)`
calcolato in query, altrimenti il giorno che il cron salta lo scadenzario mente (§6).

---

**5 — Insight in linguaggio naturale, da template e non da un modello** · *impatto alto, ~3 h*

Una funzione pura `insightScostamento({ attuale, obiettivo, leve })` che produce titolo e corpo, resa
con `<Alert>`. Deterministica, unitestabile, tradotta, **senza modello linguistico**. Si applica
ovunque ci sia una coppia valore/obiettivo: budget contro consuntivo, previsione contro realizzato,
margine contro soglia. Il costo si paga una volta e il guadagno si moltiplica per i punti d'uso (§13.1).

La regola che porta con sé vale oltre l'accorgimento: **nessun numero mostrato all'utente deve essere
generato da un modello linguistico**. Il §13.2 documenta il caso reale in cui una percentuale generata
sbaglia di 21 punti contro i dati esposti nella stessa schermata. Il modello, se c'è, sceglie la query
e la forma della risposta; il numero e la frase vengono da un template riempito con valori calcolati.
Utile anche mostrare sempre il **denominatore**: «49,1 % su 348.525 € di spese del periodo».
*Modello dati*: nessuna modifica.

---

**6 — Follow-up suggeriti dopo un'analisi** · *impatto alto, ~2-3 h*

Sotto un risultato (una risposta, un report, una scheda di analisi), due o tre pulsanti che propongono
la domanda successiva: «Mostrami l'andamento di questa categoria negli ultimi 12 mesi», «Confronta con
lo stesso periodo dell'anno scorso». In uno strumento di analisi il problema più grande non è
rispondere, è che l'utente non sa cosa può chiedere; i suggerimenti derivati **dal risultato appena
mostrato** lo risolvono, e valgono molto più dei suggerimenti generici mostrati a schermata vuota
(§13.2). Nessun modello linguistico richiesto: bastano due o tre percorsi predefiniti parametrizzati
sulla categoria e sul periodo correnti, resi come `<Button variant="outline" asChild><Link …>`.
*Modello dati*: nessuna modifica.

---

**7 — Empty state che insegna con un esempio** · *impatto alto, ~2 h per schermata*

Un componente `<StatoVuoto>` con icona, titolo, descrizione e **una sola** azione primaria — più un
`<Alert>` istruttivo che resta visibile **anche a schermata popolata** e contiene un **esempio
concreto**, non una definizione. La regola: ogni funzione con un modello mentale non ovvio (priorità
delle regole, ereditarietà delle categorie, ordine di applicazione) va spiegata con un caso, nel
momento in cui l'utente non ha ancora nulla da perdere (§9.1).
*Modello dati*: nessuna modifica.

---

**8 — Il gesto come punto d'ingresso: regola da selezione di testo** · *impatto alto, ~6-8 h*

Selezionare del testo in una causale apre un popover «Crea regola da "…"», con anteprima delle
transazioni che la regola catturerebbe. Zero errori di trascrizione, contesto già a schermo, nessun
cambio di pagina, e la funzione si scopre da sola. Serve la riga di suggerimento permanente sopra la
lista, perché il gesto non ha affordance proprio.

**Con una variante per il touch**, che è la parte che Trezy non ha fatto: il suggerimento va
condizionato a `(pointer: fine)` e su telefono va sostituito da una voce di menu «Crea regola da questa
transazione», che apre lo stesso pannello con le parole della causale come chip selezionabili (§19.5).
Stessa funzione, gesto adatto al dispositivo.
*Rotta*: `/prima-nota` o la lista movimenti. *Modello dati*: tabella `regola_categorizzazione` con
`priorita` e vincolo di unicità su `(organizzazione_id, priorita)`; più un comando «Applica tutte le
regole» retroattivo, da prevedere subito (§10).

---

**9 — Segnalare il confine effettivo/previsione in modo ridondante** · *impatto alto, ~4 h*

Cinque segnali simultanei: etichetta sull'asse, linea tratteggiata, riempimento a strisce, corsivo
nelle celle, colonna corrente evidenziata. Nessuno basta da solo; insieme rendono impossibile
scambiare una previsione per un dato certo — errore che in tesoreria ha conseguenze concrete.
*Modello dati*: ogni cella porta `natura: 'effettivo' | 'previsto' | 'misto'`, **non** dedotta dal
confronto con `new Date()` (§8).

---

**10 — Drill-down laterale con navigazione fra periodi** · *impatto alto, ~6 h*

`<Sheet side="right">` aperto dalla cella, contenente: categoria e verso, `‹ periodo ›`,
mini-grafico storico, totale con numero di movimenti, e l'elenco dei movimenti elementari raggruppati
per data. Le frecce ricalcolano i parametri **senza chiudere e riaprire** il pannello, altrimenti si
perde la posizione di scorrimento. Un endpoint solo, non quattro (§12).

---

### Menzioni a parte

Cinque accorgimenti che non entrano nei dieci — tre perché il rapporto valore/costo è appena sotto,
due perché il valore è organizzativo più che di interfaccia — ma che costano tutti poco:

- **Contatori sui tab, zero compreso** (~2 h): `Tutto 249 · Acquisto 249 · Vendita 0`, con il
  conteggio come `<Badge>` dentro `<TabsTrigger>`, da **una sola** query aggregata. Il numero prima
  del click risponde a «vale la pena guardare?», e lo zero visibile è informazione. Mai nascondere un
  tab vuoto: rende il menu instabile fra utenti e fra giorni (§4.2).
- **La coda di lavoro in un pannello laterale** (~5 h): badge numerico permanente sul pulsante in
  barra e `<Sheet>` che lascia la schermata sotto **utilizzabile**, invece del `<Dialog>` bloccante
  che intercetta i click (effetto misurato: quattro fallimenti su quattro nei nostri log). Apertura
  automatica al massimo una volta al giorno. Da tenere integralmente il paragrafo che spiega **la
  conseguenza** di non smaltire la coda e **la scorciatoia** per chiuderla in fretta (§11).
- **Un elenco unico di navigazione** filtrato per contesto (~2 h), invece di due scritti a mano per
  desktop e mobile: con `href` tipizzati sulle rotte esistenti, il collegamento morto trovato in
  produzione (§19.3) non compilerebbe. Più un test di fumo che percorre ogni voce e verifica che non
  risponda con un redirect.
- **La fascia «Stima da movimenti bancari, non contabilità ufficiale»** ripetuta su ogni scheda di una
  sezione derivata, messa nel `layout.tsx` della sezione così è impossibile dimenticarla (§15.2).
- **Il selettore «Ultimo periodo effettivo»**, che dichiara fino a dove i dati sono attendibili ed
  evita che un mese incompleto falsifichi ogni confronto (§7.2). Meglio ancora se derivato in
  automatico da una tabella `periodo_contabile (anno, mese, chiuso_il)`.

---

## Indice delle fonti

- **Screenshot dell'applicazione** (41 file a 1512 × 950, più 5 file a 390 × 844 con prefisso `M-` e
  la conversazione `82-chiedi-a-trezy-conversazione.png`): `assets/trezy/screenshots/`
- **Screenshot pubblici della demo interattiva** (47 file, 3016 × 1448, interfaccia in francese, dati
  dimostrativi popolati): `assets/trezy/materiali-pubblici/screenshot-demo-interattiva/`
- **Dump strutturati delle schermate** (`headings`, `links`, `buttons`, `tables`, `inputs`, `text`) e
  **log integrali** delle otto sessioni di navigazione: cartella di lavoro della sessione
- **Materiali pubblici** (sito, prezzi, knowledge base, changelog): `assets/trezy/materiali-pubblici/`
- **Tracce API** con corpi di risposta: `assets/trezy/api-traces/`

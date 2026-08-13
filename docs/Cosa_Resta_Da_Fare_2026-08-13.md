# Cosa resta da fare — 13 agosto 2026

Fotografia di ciò che manca, presa il giorno in cui l'open banking è andato in produzione.

**Da dove si parte.** Le Fasi 0, 1, 2a e 2b dell'integrazione GoCardless sono in produzione
(`origin/main` = `a5d24e8`, deploy Railway riuscito). Dal gestionale si collega la banca dal
browser, si vedono i conti che il consenso copre, si sceglie quali importare e da quale data, si
mettono da parte quelli che non riguardano l'attività, e arriva l'avviso prima che il consenso
scada, col pulsante che lo rinnova senza perdere la configurazione.

**Nessun movimento viene ancora scaricato.** È la Fase 3.

**Come leggere questo documento.** Dove scrivo «verificato» ho guardato il codice o il database
il 13 agosto. Dove scrivo «da appunti» la fonte è la memoria di progetto, che è una fotografia
del momento in cui è stata scritta: prima di agire, ricontrollare.

---

## Parte 1 — Open banking: le tre fasi che restano

### Fase 3 — La sincronizzazione

È quella che dà senso a tutto il resto: oggi il collegamento c'è e non arriva niente.

**Cosa costruire**

- Il cron che sincronizza **solo i conti accesi**, leggendo davvero `syncCutoffDate` per decidere
  da quando scaricare. Quel campo esiste, è documentato, ed è l'unica cosa che impedisce a un
  movimento già entrato via CSV di entrare una seconda volta — ma **oggi nessuno lo legge**.
- **Il contatore delle chiamate HTTP reali**, non delle sincronizzazioni. Il contingente della
  banca è di **4 chiamate al giorno per conto e per endpoint**, e nel caso peggiore una sola
  sincronizzazione ne consuma sei. Un contatore che conta le sincronizzazioni conta la cosa
  sbagliata e non protegge da niente.
- La scrittura dei movimenti in `BankTransaction`, e da lì la **scrittura di prima nota non
  verificata**, passata dalle regole di categorizzazione. È la decisione dell'8 agosto: il
  modello già adottato nel resto del gestionale.
- Mostrare all'amministratore **quante letture gli restano oggi**. Il dato arriva già dalla banca
  negli header di ogni risposta e il client lo legge (`src/lib/gocardless/client.ts`), ma ogni
  rotta lo butta via. È il pezzo che trasforma un tetto subìto in un tetto governato, e va deciso
  ora perché la Fase 3 spende sullo stesso conto.

**Una buona notizia che non era nel piano** (verificato il 13 agosto). `BankTransaction` è il lato
banca, `JournalEntry` è il lato contabile, e `src/lib/reconciliation/matcher.ts` è già il ponte
fra i due: prende un movimento bancario, cerca le scritture candidate in una finestra di date,
calcola un punteggio e scrive l'abbinamento sul movimento. **La sincronizzazione scriverà proprio
nella tabella che il matcher già consuma**: i movimenti scaricati entrano nella riconciliazione
esistente senza costruire alcun ponte.

**Il controllo da fare presto, appena i primi movimenti veri entrano.** Guardare **quanti**
abbinamenti il matcher trova e con che confidenza. Un matcher che non ha mai visto dati veri e
uno che funziona si assomigliano moltissimo finché l'ingresso è vuoto — e al 13 agosto
`bank_transactions` in produzione è **vuota** (verificato). È la stessa forma del backfill della
Fase 1, che ha girato su zero righe dentro un deploy riuscito: un registro verde non distingue
«non ha trovato niente» da «ha sbagliato tutto».

**Da fare prima di scrivere la Fase 3, e costa poco.** La deduplicazione poggia sull'ipotesi che
gli identificativi dei movimenti forniti dalla banca siano **stabili nel tempo**, e quell'ipotesi
non è mai stata verificata. Serve solo rilanciare `scripts/gocardless-probe.ts --step=fetch` a
distanza di giorni dal 12 agosto e confrontare, poi `--step=report`. Se non fossero stabili, la
Fase 3 va costruita diversamente: meglio saperlo prima di scriverla.

**Dentro la Fase 3 entrano anche le otto voci lasciate dalla Fase 2b**, elencate nella Parte 2.

### Fase 4 — La categorizzazione

**La premessa è cambiata dopo lo spike, ed è il punto più importante di questa fase.** La spec
originale la immaginava come «riusa le regole che ci sono». Ma `categorization_rules` è **vuota**:
non c'è un patrimonio da riusare, serve un innesco. Un motore di regole senza regole non
categorizza niente.

**L'innesco l'ha trovato la sonda sul campo.** Il codice proprietario che la banca mette su ogni
movimento è presente sul **100%** dei 678 movimenti letti, con 28 codici distinti e semanticamente
puliti: commissioni su bonifico, emolumenti, F24, rata mutuo, versamento contante, operazione POS,
giroconti. Una tabella **«codice → conto»**, compilata una volta, categorizza **con certezza** e
non per somiglianza. È il contrario di una regola a parole chiave, che indovina.

**Il principio che regge tutto** (deciso l'8 agosto): *nessuna decisione automatica sovrascrive
una decisione dell'operatore.* Vale per i codici della banca come per le regole. Il codice della
banca non compete con le regole: **le precede in mancanza d'altro, e le alimenta**. E siccome
`JournalEntry.categorizationSource` registra chi ha deciso (`manual`, `rule`, `import`, `split`),
la precedenza è verificabile a posteriori su ogni singolo movimento, invece di essere una
convenzione che vive solo nella testa di chi ha scritto il codice.

**La decisione ancora aperta.** Estrarre il nome della controparte dal testo della causale in modo
**deterministico** (tagli e normalizzazioni sul separatore) oppure con l'**AI**. Il deterministico
è gratis, riproducibile e provabile sulle fixture; l'AI prende i casi storti ma costa e non è
riproducibile in un test. La risposta ragionevole, già scritta nella spec: **prima il
deterministico, e l'AI solo sul residuo** che quello non risolve — circa il 18%, non su tutto.

**Un limite già noto e non aggirabile:** la controparte non arriva. Banca della Marca non manda
`creditorName`/`debtorName` in nessun campo, quindi ogni progetto che assuma di avere il nome di
chi paga o incassa è già smentito.

### Fase 5 — Il CSV cambia ruolo, non si dismette

> **Decisione del proprietario, 13 agosto 2026.** L'import da CSV e XLSX **non va dismesso**.
> Resta come riserva e per i conti correnti che GoCardless non copre.

Questo riscrive la fase: non è più «spegnere il CSV», è **far convivere due fonti** e rendere
esplicito quale serve a cosa.

**I tre ruoli che il CSV conserva**

1. **Il recupero dello storico.** Da GoCardless lo storico anteriore ai 90 giorni **non si
   recupererà mai** — è ciò che concede la banca, non un limite del nostro codice. Per il passato
   il CSV è insostituibile.
2. **I conti che l'open banking non copre.** Un conto presso un istituto non supportato, o che si
   sceglie di non collegare, continua a vivere di import manuale. Il gestionale deve gestire i due
   casi insieme, non uno alla volta.
3. **La riserva.** Se il consenso scade, se la banca smette di rispondere o se il contingente
   giornaliero è esaurito, l'import resta la strada per non fermarsi.

**Cosa questo richiede, e la buona notizia: quasi tutto c'è già** (verificato il 13 agosto).

- `ImportSource` prevede **già** `PSD2_GOCARDLESS` accanto a `CSV` e `XLSX`: il campo per
  distinguere la provenienza di ogni movimento esiste, va solo scritto.
- L'indice di deduplicazione `ux_bank_transactions_conto_provider` è **parziale** e le righe senza
  identificativo del fornitore — cioè quelle importate da file — **non collidono fra loro**,
  perché PostgreSQL considera distinti i valori nulli in un indice unico. Le due fonti convivono
  senza inciampare l'una nell'altra.
- La data di taglio obbligatoria per accendere un conto è **già** il presidio contro il doppio
  ingresso dello stesso movimento dalle due strade.

**Cosa resta da costruire, quindi**

- Scrivere davvero `importSource` sui movimenti che arrivano dalla sincronizzazione.
- Mostrare la provenienza nell'elenco dei movimenti: chi guarda deve poter distinguere a colpo
  d'occhio ciò che è arrivato da solo da ciò che è stato caricato a mano.
- Dire con chiarezza nel pannello che l'import resta disponibile, invece di lasciar credere che
  collegare la banca lo escluda.
- Decidere cosa succede se lo **stesso** movimento arriva da entrambe le strade nonostante la data
  di taglio: oggi la deduplicazione non può accorgersene, perché le due chiavi sono disgiunte e
  nessuna vede le righe dell'altra. Con la data di taglio impostata bene non capita — ma «impostata
  bene» è una cosa che fa una persona, e le persone sbagliano.

---

## Parte 2 — Le otto voci lasciate dalla Fase 2b

Sono scritte per esteso in `docs/superpowers/plans/2026-08-13-open-banking-fase-2b.md`, sezione
*Dopo il piano: cosa resta*. Qui solo l'elenco, per non avere due versioni che divergono.

1. **La Fase 3** (vedi sopra).
2. **Riassegnare un conto della banca a un altro conto del gestionale produce un 500**:
   `providerAccountId` è unico globale e la violazione non è tradotta.
3. **La stabilità degli identificativi dei movimenti** non è verificata (la sonda, vedi sopra).
4. **Il rilascio**: fatto il 13 agosto, questa voce è chiusa.
5. **Il ritorno dal wizard col tasto Indietro lascia il pannello inerte** finché non si ricarica.
6. **«Mostra archiviati» perde le scelte non salvate** la prima volta che lo si accende. Rimedio
   noto e non applicato: `placeholderData: keepPreviousData`.
7. **La data di scadenza del consenso è una stima per eccesso**, non il valore concesso
   dall'agreement, quindi l'avviso a quattordici giorni può arrivare tardi. La fonte autorevole è a
   una chiamata di distanza e fuori dal contingente; manca il metodo nel client.
8. **Il cricchetto delle autorizzazioni è a 258** contro una baseline di 255. Due erano lì prima di
   questo lavoro, uno è nostro: la rotta di ritorno dalla banca, che non può avere la guardia
   standard. Il modo giusto di chiuderla è **toglierla da sotto `/api`** — non è un'API, è una
   redirezione per il browser.

---

## Parte 3 — Le cose piccole tracciate solo negli appunti

Da appunti: verificare prima di agire.

- **`SET NOT NULL` su `cost_center_id`.** Oggi costa zero perché la tabella è vuota; più si aspetta,
  più costa.
- **Il seed delle categorie della riclassificazione cash flow**, e guardare quella pagina con gli
  occhi: è implementata e in produzione dal 12 agosto, ma nessuno l'ha ancora vista funzionare su
  dati veri.
- **Il ciclo tesoreria**: restano le regole multi-azione e la fase dei report.
- **L'imputazione dei ricavi**, decisa il 10 agosto e allora bloccata dal piano dei conti v4.
  **Quel blocco non c'è più**: il v4 è in produzione dal 12 agosto, quindi la spec è eseguibile.
- **La rotazione delle credenziali** dopo la riscrittura della storia del repository del 5 agosto è
  ancora manuale e non risulta fatta.

---

## Parte 4 — Fuori dall'open banking

**Il pezzo grosso: `analisi/onda-1`.** Verificato il 13 agosto: **57 commit** mai integrati, fermi
al 12 agosto, e nel frattempo a quel ramo mancano **87 commit** di `main`. Da appunti risulta
pronto — quindici task, e le tre proiezioni che coincidono. È il lavoro che si deteriora da solo:
ogni giorno che passa il riallineamento costa di più, e misurare qualcosa su un ramo vecchio fa
«trovare» problemi chiusi da settimane. **Se vale la pena tenerlo, va riallineato adesso; se non
vale, va chiuso e detto.** La via di mezzo è la sola che costa senza rendere.

**La CI non verifica la build di nessuno.** Il controllo del lint è rosso da prima dell'open
banking e delle fatture, per due rotte che non appartengono a nessuno dei due lavori; e **quando
quel controllo fallisce, il controllo della build viene saltato**. È proprio la verifica capace di
vedere un import che rompe il pacchetto finale, invisibile ai tipi, ai test e a qualunque
rilettura del codice. Tre rotte da convertire in tutto (le due preesistenti più la nostra):
lavoro piccolo, effetto sproporzionato.

**Rami da sistemare.** Quattro rami da un commit ciascuno — una modifica alle linee guida, la
sintesi dell'analisi competitiva, una regola sulle presenze, una correzione di commento — più due
rami di lavoro temporaneo di agenti, e **63 rami già dentro `main`** che sono soltanto residui da
potare.

---

## Un ordine che ha senso

1. **La sonda, secondo passaggio.** Costa un comando e può cambiare il progetto della Fase 3.
2. **Il riallineamento o la chiusura di `onda-1`.** È l'unica voce che peggiora da sola.
3. **Le tre rotte del cricchetto**, che riaccendono la verifica della build per tutti.
4. **La Fase 3**, con dentro le voci 2, 5, 6, 7 e 8 della Parte 2.
5. **La Fase 4**, partendo dalla tabella «codice della banca → conto», che è l'innesco senza il
   quale il motore di regole non ha niente da masticare.
6. **La Fase 5**, che con la decisione di oggi è più piccola di come era stata immaginata: non
   spegnere il CSV, ma dichiarare chi fa cosa e mostrare la provenienza di ogni movimento.

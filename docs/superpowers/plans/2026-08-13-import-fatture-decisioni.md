# Import fatture: le decisioni prese durante l'esecuzione

Ventitré decisioni prese dal coordinatore mentre il piano
`2026-08-13-import-fatture-wizard.md` veniva eseguito da agenti in parallelo,
fra il 13 e il 14 agosto 2026. Sono qui perché il registro di avanzamento in
cui erano annotate vive nella cartella di lavoro del piano, che si cancella a
fine esecuzione: queste invece riguardano il prodotto e vanno lette da chi
tocchi l'importatore dopo.

Ognuna dice **cosa è stato deciso**, **perché**, e **cosa costa se è
sbagliata**. Diverse correggono difetti del piano stesso.

La revisione finale del ramo le ha verificate contro il codice, diciotto su
ventitré: nessuna è risultata sbagliata. Restano due postille e un
avvertimento, in coda.

---

**Ruling 1 — Il segno delle note di credito resta di presentazione.** Il piano faceva negare gli importi dentro `calcolaImporti`. Su `main` `schedule-reconciliation-service.ts` (`righeDaSottrarreNote`) sottrae già le righe delle note assumendole positive, e il file avverte per iscritto che invertirle due volte è «un errore di importo doppio, sul conto sbagliato». Il T2 ora produce `segnoDiPresentazione`, usata solo dall'anteprima. — *Se sbagliato:* l'anteprima mostrerebbe i negativi mentre l'elenco fatture li mostra positivi, incoerenza visibile ma senza danno ai dati; si corregge cambiando un punto solo.

**Ruling 2 — Base `origin/main`, non il branch corrente.** `conti/cash-flow-prospetto` è 139 commit indietro. Il referto e la prima stesura del piano erano stati scritti leggendo quel codice. — *Se sbagliato:* nulla; il lavoro di cash flow non è correlato.

**Ruling 3 — Le route nuove usano `auth()` diretto**, come quelle vicine in `src/app/api/invoices/`, non il wrapper `AuthedRoute`. `contestoRotta` non esiste ancora su `d7355ca` (arriva con la PR #19). — *Se sbagliato:* un adeguamento meccanico dopo il merge della #19, uguale a quello che toccherà a tutte le altre route.

**Ruling 4 — Nessun conflitto IVA nel dialog dei conflitti.** Non esiste un'aliquota predefinita per fornitore da confrontare; l'aliquota viaggia come contesto da mostrare. Anche CashKing fa così. — *Se sbagliato:* il dialog mostra un dato in meno; nessun effetto sui dati.

**Ruling 5 — Il difetto delle statistiche resta fuori.** `src/app/api/invoices/stats/route.ts` somma le TD04 ai costi invece di sottrarle: difetto reale, indipendente da questo lavoro, annotato nel Task 2. — *Se sbagliato:* il grafico di `/fatture` resta impreciso quanto è oggi, non peggio.

**Ruling 6 — Ogni agente consegna il proprio esito su file, non nel messaggio finale.** Il primo revisore del Task 1 ha completato senza che il suo report arrivasse: dal canale è tornata solo una notifica di inattività, due volte. Gli implementer scrivono già su file e quel canale funziona (`task-1-report.md` è arrivato intero). Da qui in avanti anche i revisori scrivono in `task-N-review.md` e rispondono con una riga sola. — *Se sbagliato:* un file in più per task, nessun altro costo.

**Ruling 7 — La grafia `_metaDato.xml` si accetta come la scrive il concorrente.** Viene dalla schermata di CashKing, che tratta zipponi AdE veri, e la regex è case-insensitive. — *Se sbagliato:* i metadati non verrebbero filtrati e darebbero errori di parsing visibili nel riepilogo, non un guasto silenzioso; si aggiunge una variante al regex.

**Ruling 8 — La migrazione del Task 3 si scrive a mano; `prisma migrate dev` è vietato.** Il `.env` del worktree è un collegamento a quello principale e la sua `DATABASE_URL` punta al Supabase di **produzione**: `migrate dev` avrebbe applicato la colonna ai dati veri e creato uno shadow database sullo stesso server. Scrivere il file SQL a mano è già lo stile del progetto. I test non ne risentono: il loro database modello nasce da `prisma db push` sullo schema (`global-setup.ts`), non dalle migrazioni. Piano corretto in `e81ba43`. — *Se sbagliato:* la migrazione andrebbe riscritta con la CLI puntata a un database usa e getta; nessun dato perso.

**Ruling 9 — Il Minor degli accenti entra nel fix round, contro la regola che i Minor restano fuori.** Il commento della migrazione usa `e'`/`perche'` invece di `è`/`perché`, e la forma veniva dal mio brief: l'implementer ha fatto bene a copiarla. Correggerlo costa nulla mentre l'implementer è già dentro il file, e tutte le altre migrazioni del progetto sono accentate. — *Se sbagliato:* una riga di diff in più in un round che partiva comunque per l'Important.

**Ruling 10 — La risposta dei conflitti resta con un solo `giorniDalFile`, e il codice deve dire perché.** Il revisore ha ragione che il valore mostrato è quello della prima fattura del gruppo. Non cambio la forma della risposta: la finestra dei conflitti serve a *mostrare* il caso e a far scegliere fra file e anagrafica, mentre la scelta «usa i valori del file» viene applicata **per riga** nel Task 11, con il `giorniDalFile` della singola fattura. Il valore nel conflitto è indicativo, non operativo — ma questo non era scritto da nessuna parte, e ora va scritto. — *Se sbagliato:* la finestra mostrerebbe un valore rappresentativo dove servirebbe un elenco; si vedrebbe alla prima prova con un fornitore a termini misti, e la risposta si allargherebbe con un campo in più.

**Ruling 11 — Il piano mi aveva fatto prescrivere un import che rompeva il bundle client.** Il Task 2, su mia istruzione esplicita («riusa `TIPI_DOCUMENTO_NOTA_CREDITO`, non ridefinirla»), importava la costante da `invoice-schedule-service.ts`, che importa `@/lib/prisma`. `segnoDiPresentazione` è una funzione di presentazione destinata a un componente client: quell'import avrebbe trascinato Prisma nel bundle. Invisibile a `tsc`, ai test e alla revisione del diff — esattamente il difetto che la memoria del progetto descrive. L'implementer del Task 6 l'ha trovato costruendo una pagina client di prova e lanciando `npm run build`, ha spostato la costante in `src/lib/invoices/tipi-documento.ts` e l'ha ri-esportata dal servizio per non toccare i due consumer server. Accolgo la correzione: il riuso resta, cambia solo dove vive la costante. — *Se sbagliato:* la costante vivrebbe in un modulo in più; il rischio vero era l'opposto, e si sarebbe visto solo al primo `npm run build` dopo il Task 12.

**Ruling 12 — Via `@testing-library/user-event`; i test pilotano con `fireEvent`.** L'implementer l'aveva installata perché i test del mio brief la usavano, e ha fatto bene a dichiararlo. Il revisore è andato a leggere il sorgente di Radix: né `react-radio-group` né `react-checkbox` usano pointer capture, quindi il click diretto basta; il commento del progetto che sconsiglia `fireEvent` riguarda i popup, che devono calcolare un layout. Il pacchetto non sbloccava alcun test. Ho corretto il piano su **tutti** i task (19 occorrenze di `userEvent` → 0) prima che i Task 8, 9 e 11 copiassero il precedente, e aggiunto l'helper `caricaFile` per l'upload nel Task 12. Piano corretto in `33efe85`. — *Se sbagliato:* un test di interazione più difficile da scrivere in qualche punto futuro; si reinstalla in un minuto.

**Ruling 13 — I due Minor del Task 8 entrano nel round.** Regola generale: i Minor restano fuori. Qui li includo perché toccano lo stesso file e la stessa preoccupazione dell'Important (la leggibilità della tabella a 226 righe), e perché il primo — un import `within` inutilizzato lasciato «perché il test è il contratto» — nasce da un'ambiguità del mio brief: «verbatim» vincola il comportamento verificato, non la byte-identità. — *Se sbagliato:* due righe di diff in più in un round già aperto.

**Ruling 14 — Il testo che una sintesi vocale pronuncia viene prima del mio refuso.** Il regex del mio test cercava «usa l anagrafica» con uno spazio al posto dell'apostrofo; l'implementer ha tolto l'apostrofo dall'`aria-label` per farlo passare, applicando alla lettera la regola «il test è il contratto». È la stessa ambiguità del Task 8, ma qui con una conseguenza vera: «l anagrafica» letto da un motore TTS diventa «elle anagrafica» o perde la lettera. Il contratto è il *comportamento*, non la mia battitura. Regex corretto nel piano (`9fbf3b8`), apostrofo rimesso nell'etichetta. — *Se sbagliato:* un regex più permissivo del necessario; nessun effetto sul prodotto.

**Ruling 15 — Lo stato derivato resta, ma il reset va ripristinato.** Rimuovendo l'`useEffect` bocciato da `react-hooks/set-state-in-effect` è sparito anche l'azzeramento delle scelte al cambio di `conflitti`: una scelta di un import precedente riaffiora come preselezione se lo stesso fornitore ricompare, e il Task 12 monta il wizard con `open`/`onOpenChange`, cioè tenendolo montato. Si adotta il pattern React di aggiornamento durante il render, che soddisfa il lint e ripristina il comportamento, con un test che lo dimostri. Questo l'avevo mancato io: il revisore l'ha trovato ragionando su come il Task 12 monterà il componente. — *Se sbagliato:* un reset in più fra due sessioni d'import, che è comunque il comportamento atteso.

**Ruling 16 — Il difetto del Task 10 è del mio brief, e la correzione va presa dal codice che esiste già.** Lo Step 4 mostrava il solo `electronicInvoice.update({deletedAt})`. Ma `Schedule` ha un `deletedAt` proprio, scollegato da quello della fattura, e i due endpoint gemelli (`DELETE /api/invoices/[id]`, `bulk-delete`) fanno da anni tre cose che il mio snippet ignorava: rifiutare le fatture `RECORDED`, chiamare `checkInvoiceDeletable` per i pagamenti già registrati, e archiviare le scadenze con `softDeleteSchedulesForInvoice` nella stessa transazione. L'implementer è stato istruito a leggere quegli endpoint e seguirli, non me. — *Se sbagliato:* la sostituzione diventa più severa del necessario (rifiuta casi che poteva accettare), che in contabilità è l'errore giusto da fare.

**Ruling 17 — Il Task 11 distingue i tre 409 dalla politica scelta, non dal messaggio.** La rotta ora risponde 409 in tre casi: duplicato con politica «salta» (atteso), fattura già registrata in prima nota, e scadenze con pagamenti registrati. Gli ultimi due sono rifiuti veri, e trattarli come «Duplicato» nascondderebbe all'utente il motivo per cui una fattura non è entrata. Regola per il PassoEsecuzione: con `politicaDuplicati: 'salta'` un 409 è un duplicato; con `'sostituisci'` un 409 è un errore, e il messaggio della risposta va mostrato. Nessun parsing di stringhe. — *Se sbagliato:* si aggiunge un codice macchina alla risposta, senza toccare la logica.

**Ruling 18 — La scelta «Anagrafica» dev'essere fatta valere davvero: oggi non fa nulla.** L'implementer del Task 11 ha segnalato una divergenza fra il codice e la prosa del mio brief su quando mandare `giorniPagamentoScelti`. Indagando, il difetto è più profondo e mio: `estraiScadenze` usa i giorni **solo** quando il documento non porta una `DataScadenzaPagamento`, mentre `giorniDalFile` è non-null **solo** quando la porta. Il campo viene quindi mandato esattamente nei casi in cui non ha effetto, e taciuto in quelli in cui l'avrebbe: la finestra dei conflitti mostra una scelta che non cambia nulla — proprio ciò che le convenzioni del progetto vietano («niente UI che promette automazioni inesistenti»).

**Ruling 19 — La verifica d'integrità va alimentata da una lettura vera, non dal conteggio del client.** Il revisore ha dimostrato che il pannello, così com'è, confronterebbe un numero con se stesso: `PassoEsecuzione` non legge il corpo della 201, quindi `fornitoreCreato` si perde e il Task 12 non avrebbe altro dato che il proprio conteggio. Correzione: `EsitoRiga` porta `fornitoreCreato` e `idCreata`; il Task 12 ricava «Fornitori creati» dal flag del server e «Fatture create nel database» da una **rilettura**, riusando `POST /api/fatture/verifica-duplicati` con le chiavi delle fatture appena importate — quelle che risultano presenti sono quelle davvero scritte. Una rotta che esiste già, usata per interrogare il database invece di fidarsi del client. — *Se sbagliato:* una chiamata in più a fine import; il pannello resterebbe onesto comunque.

**Ruling 20 — Imponendo i giorni, le rate conservano i loro intervalli.** La re-review del round 2 ha chiuso il finding ma ha trovato un gap: `imposta()` non riceve la posizione della rata, quindi un documento a tre rate con termini imposti produce tre scadenze **lo stesso giorno**. Nell'archivio reale due documenti hanno rate multiple (uno da tre, uno da cinque), e importi che cadono insieme invece di scaglionarsi falsano la previsione di cassa. Regola adottata: la prima rata va a `dataFattura + giorniImposti`, le successive mantengono la distanza che avevano dalla prima nel documento; se il documento non porta date, tutte alla stessa, perché lì non esiste alcuno scaglionamento da conservare. — *Se sbagliato:* scadenze scaglionate dove l'utente ne voleva una sola; si vede nello scadenzario e si corregge a mano sulla singola fattura.

**Ruling 21 — La prova sul campo si fa su un database locale, non in produzione.** L'implementer del Task 12 si è fermato prima di premere «Avvia Importazione», perché il `.env` del worktree punta al Supabase di produzione e l'ultimo controllo avrebbe scritto fino a 226 fatture vere. Ha fatto bene: è una scrittura irreversibile su un sistema esterno, e non è una decisione che spetta a me. Alternativa trovata senza disturbare l'utente: esiste un PostgreSQL locale in ascolto sulla 5433 (lo stesso su cui l'harness crea i database `weiss_itest_*`) e il seed crea `admin@weisscafe.it` / `admin123`. La prova si fa lì, su un database dedicato, con la `DATABASE_URL` passata inline e mai scritta nel `.env` — che è un collegamento a quello della checkout principale, dove lavora l'altra sessione. — *Se sbagliato:* la prova gira su dati di seed invece che sui dati veri, il che per l'importatore non cambia nulla: le 226 fatture sono le stesse.

**Ruling 22 — Il fornitore lo crea il server dai dati che già ha, non il client rimandandoglieli.** Alla riga 481 di `route.ts` il ramo di creazione richiede `createSupplier && supplierData`; la procedura guidata manda il primo e mai il secondo, perché non passa più da `/api/invoices/parse` — l'anteprima ora si calcola nel browser. Il vecchio dialog quel `supplierData` lo otteneva proprio da quella chiamata, quindi il wizard **regredisce** rispetto a ciò che sostituisce. Correzione: quando `supplierData` non arriva, la rotta ricava i dati del cedente dall'XML che sta già riparsando, riusando `matchSupplier(fattura)` — la stessa funzione che li costruisce in `parse/route.ts`. Il `supplierData` esplicito continua a prevalere, per il caso in cui l'utente li abbia corretti a mano. — *Se sbagliato:* si creerebbero anagrafiche da documenti che l'utente non voleva in rubrica; ma è ciò che il dialog precedente faceva da sempre, e senza `supplier_id` metà delle funzioni a valle non funzionano.

**Ruling 23 — `/api/invoices/parse` si cancella.** I suoi due soli chiamanti erano i dialog che questo ramo elimina; nessuno la interroga più. `src/CLAUDE.md` è esplicito: una rotta senza consumer non è «pronta per dopo». La cancello **dopo** aver applicato il fix I2, che riporta `suggestAccountForSupplier` in uso dentro la rotta di import — altrimenti resterebbe orfana anche quella. — *Se sbagliato:* si ripristina da git in un minuto; il rischio opposto è la ventunesima rotta senza consumatori in un progetto che ne ha già pagate venti.

---

## Le postille della revisione finale

**Sul Ruling 10.** Il commento dice che la scelta «usa i valori del file» viene
applicata per riga con il `giorniDalFile` della singola fattura. Nel codice non
è così, ed è meglio così: scegliendo «Importazione» non si manda nulla e la data
del documento vince da sé, riga per riga, senza passare da un numero di giorni.
L'esito promesso è rispettato, il meccanismo descritto no.

**Sul Ruling 18.** La decisione è giusta — «giorni imposti» invece di «giorni per
la stima» è l'unico modo perché quella finestra significhi qualcosa. Ma l'anello
finale era rotto: per i fornitori con partita IVA che inizia per zero la scelta
non arrivava al server. Corretto nell'ondata finale (C1); il ruling non era
sbagliato, era incompiuto.

**L'avvertimento, sul Ruling 7.** La grafia `_metaDato.xml` resta **non provata**:
viene dalla schermata del concorrente e nessun archivio reale ha ancora
esercitato il filtro — nella prova sul campo `metadatiIgnorati` non è mai stato
diverso da zero. Se ci si sbaglia, i metadati finiscono fra gli scartati con
«Header fattura mancante»: rumore visibile, non un guasto silenzioso. **La prima
volta che entra uno zippone mensile vero dell'Agenzia, guardare quel contatore.**

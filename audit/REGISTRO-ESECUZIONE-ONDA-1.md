# SDD ledger — plan: docs/superpowers/plans/2026-08-11-analisi-competitiva-onda-1.md

Worktree: /Users/nicolascarpa/Desktop/accounting-wt/onda-1 (branch analisi/onda-1, da bda503b)
Comandi: `nvm use 22 && npm test -- --run` · `TEST_DB_SUFFIX=onda1b npm run test:integration`

## Baseline (prima del Task 1)

- Unit: 1350 passati / 1350, 100 file. Verde.
- Integrazione: 363 passati, **30 rossi preesistenti** in 7 file, tutti FUORI dal
  perimetro del piano: `budget/confronto`, `budget/category-aggregator`,
  `chiusure/[id]`, `prima-nota/suddivisione-scavalcata`, `allocation-service`.
  Causa: cercano conti `400.01`/`400.02`/`500.01`, codici che il piano dei conti
  v4 ha rinominato. Coincide con la nota di progetto «30 test rossi preesistenti».
  **Invariante di fine onda: il numero non deve crescere e nessun nuovo file
  deve entrare nell'elenco.**
- Setup: `bd85dbb` aggiunge `cost_centers` alle tabelle congelate dell'harness
  di integrazione (62 → 30 rossi). Fuori piano, precondizione all'esecuzione.

## Regole operative di questa esecuzione

- **I revisori sul modello più capace non hanno inviato il rapporto**, due volte
  su due (revisione e re-revisione del Task 4): sono passati in idle con
  l'analisi completata ma senza chiamare SendMessage, anche con l'istruzione
  esplicita di rispondere comunque. Rimedio: dopo un dispaccio di revisione,
  se arriva un'idle senza rapporto, chiederlo subito invece di attendere.
  Non è un motivo per abbassare il modello su questo task — il rapporto, una
  volta richiesto, è stato il migliore dell'onda.

- **Rigenerare il brief subito prima di ogni dispaccio**, mai riusare quelli
  pre-generati: il piano è stato corretto cinque volte in corsa e un brief
  vecchio consegnerebbe una specifica superata. Comando:
  `.../scripts/task-brief docs/superpowers/plans/2026-08-11-analisi-competitiva-onda-1.md N`
- **Verificare le assunzioni del task sul codice PRIMA di dispacciare.** Ha già
  intercettato cinque difetti di specifica (ToggleGroup inesistente, rotta
  prima-nota, MovimentiClient nel posto sbagliato, stati vuoti già presenti,
  raggruppamento scadenzario inesistente, rotta /test che risponde alla domanda
  inversa). Costa un paio di `grep`, risparmia un giro di correzioni.
- **Suffisso database obbligatorio** nei test di integrazione: `TEST_DB_SUFFIX=onda1b`.
  Senza, si distrugge il database di un'altra copia di lavoro.

## Task

Task 1: implementato (commit bba16da). Revisione: spec ✅, qualità approvata,
  1 Important + 2 Minor.
Task 1: minor (deferred): posizione dell'import di formatNumeroCsv in coda a
  formatters.test.ts invece che in testa — stilistico, nessun impatto, riflette
  lo snippet del brief.
Task 1: conflitto piano risolto senza arbitrato — lo snippet dello Step 6
  sommava in `number`, i Vincoli Globali del piano vietano `number` nei
  passaggi intermedi e legano ogni task: i Vincoli governano sullo snippet.
Task 1: fix round 1/5 dispacciato (Important: usare sumMoney per l'aggregazione
  dei totali; Minor: il JSDoc di formatNumeroCsv mostra 1.234,50 ma la funzione
  non raggruppa).
Task 1: fix round 1/5 eseguito (commit 46590fb; sumMoney+toApi, JSDoc corretto,
  nuovo test src/app/api/scadenzario/export/__tests__/route.test.ts; 31/31).
  Re-revisione mirata dispacciata.
Task 1: fix round 1/5 (2 addressed, 0 open; commits bba16da..46590fb).
Task 1: minor (deferred): il commento di route.test.ts (righe ~39-44) dichiara
  che il test coglie una regressione alla somma in `number`. Con QUEI tre
  importi (100.10/50.05, 200.20/0, 0.30/0.30) la somma in virgola mobile
  arrotondata a due decimali dà lo stesso risultato, quindi il test non
  fallirebbe sotto il codice vecchio. Il fix in route.ts è corretto e il test è
  ben costruito: è la garanzia dichiarata nel commento a essere sovrastimata.
  Rimedio: scegliere importi che attraversano un bordo di arrotondamento,
  oppure ammorbidire il commento. Per la triage della revisione finale.
Task 1: minor (deferred): le celle per-riga di scadenzario/export/route.ts:70-72
  convertono ancora con `Number()` fuori da Money. Preesistente, fuori dal
  perimetro del rilievo.
Task 1: complete (commits 770aff2..46590fb, review clean)

Task 7: RIMOSSO dall'onda (commit 56b2e3b). SCD-02 presupponeva una lista
  raggruppata; la lista scadenze è una tabella piatta con ordinamento per
  colonna, e introdurre i gruppi è una decisione di prodotto (gruppi e
  ordinamento si contendono lo stesso spazio), non un quick win. Il Task 8 copre
  buona parte del bisogno. Torna nel backlog con effort M.
  → l'onda passa da 16 a 15 task. Il numero 7 resta vuoto per non disallineare.

Task 2: implementato (commit e8b4c03). Unit 1357/1357; integrazione 366/396 con
  i 30 rossi preesistenti invariati (7 file: i 5 annunciati più closure-service
  e quadratura). Revisione dispacciata.
Task 2: l'implementatore ha corretto un errore del brief — `callRoute`
  restituisce `{status, body, headers}` e il codice di test lo usava come corpo.
  Terzo difetto di specifica mio in questa onda.
Task 2: revisione — spec ✅, qualità NON approvata. 1 Critical + 1 Important.
  Critical: il `where` di base della summary esclude `annullata`, quello della
  lista no → card e lista mostrano insiemi diversi su una scadenza pagata a
  mano e poi annullata (la cancellazione logica non azzera `importoPagato`).
  Important: `haFiltriAttivi()` non conosce `pagateSenzaMovimento`, quindi il
  pulsante «Reset filtri» non compare mai proprio nello stato che la funzione
  crea: l'utente resta filtrato senza uscita visibile.
Task 2: fix round 1/5 dispacciato. Decisione presa: vince la semantica della
  summary (le annullate restano fuori), e il criterio va estratto in un posto
  solo — due frammenti identici su basi diverse sono la causa del Critical.
Task 2: fix round 1/5 eseguito (commit 332a0af). Criterio estratto in
  `src/lib/scadenzario/pagate-senza-movimento.ts`, `haFiltriAttivi()` aggiornata,
  test di regressione aggiunto (pagata a mano → annullata → sparisce da
  entrambi). Unit 1357/1357; integrazione 367/397, i 30 rossi invariati.
  Re-revisione mirata dispacciata.
Task 2: fix round 1/5 (2 addressed, 1 nuovo aperto; commits e8b4c03..332a0af).
  Nuovo Important nato dal fix: `Object.assign(where, criterio())` sovrascrive
  un `?stato=` esplicito, perché il criterio condiviso ora contiene `stato`.
  Non raggiungibile dall'interfaccia, ma il contratto della rotta è rotto.
Task 2: minor (deferred): `ScheduleFilters` è definita due volte — in
  `src/types/schedule.ts` e inline in `schedule-filters.tsx`. Verificato
  preesistente al task. Stessa classe del Critical (due copie che divergono):
  per la triage della revisione finale.
Task 2: fix round 2/5 dispacciato. Rimedio imposto: comporre in `AND` invece di
  assegnare a livello superiore, così nessun campo può essere sovrascritto —
  nemmeno quelli che qualcuno aggiungerà al criterio in futuro.
Task 2: fix round 2/5 eseguito (commit 122e7cf). Composizione in `AND`, test di
  combinazione `?stato=&pagateSenzaMovimento=` aggiunto. L'implementatore ha
  verificato il test contro il codice VECCHIO (stash mirato per file, apply per
  sha, drop per hash — mai pop al buio, lo stack è condiviso): falliva come
  atteso. Unit 1357/1357; integrazione 368/398, i 30 invariati.
  Re-revisione del giro 2 dispacciata.
Task 2: fix round 2/5 (1 addressed, 0 open; commits 332a0af..122e7cf).
  Rimedio verificato generale (nessun `if` su `stato`), nessun altro punto
  scrive `where.AND`, test credibile per costruzione: la scadenza parziale
  soddisfa il filtro ma non `stato=pagata`, quindi il test fallisce sul codice
  vecchio indipendentemente dalla dichiarazione dell'implementatore.
Task 2: complete (commits 56b2e3b..122e7cf, review clean dopo 2 giri)

Task 3: implementato (commit 906e581). Modulo puro `src/lib/previsionale/proietta.ts`
  + 8 test, tutti verdi. Revisione dispacciata con attenzione all'arbitraggio.
  Nota dell'implementatore, valida per il Task 4: la gerarchia funziona solo se
  chi costruisce i FlussoPrevisto assegna la STESSA chiave a fonti che
  descrivono lo stesso denaro. Il modulo puro assume la chiave come
  precondizione dell'input e non può verificarla.
  → Presupposto verificato da me nel codice: la generazione da ricorrenza
  valorizza `Schedule.recurrenceId` (ricorrenze/[id]/genera/route.ts:78), quindi
  la chiave `ricorrenza:<id>` avrà su cosa appoggiarsi. Se fosse stato falso,
  la deduplicazione sarebbe stata inerte senza che nulla lo segnalasse.
Task 3: revisione — spec ✅, qualità approvata. Implementazione corretta su
  tutti e tre i punti delicati (chiave assente mai scartata; raggruppamento per
  `giorno::chiave`; scelta del vincitore come riduzione per minimo, quindi
  indipendente dall'ordine). 2 Important sui TEST, non sul codice:
  – l'indipendenza dall'ordine non è fissata: in tutti i casi con chiave
    condivisa la fonte affidabile è sempre la seconda dell'array, quindi un
    ingenuo «vince l'ultimo» passerebbe tutti e otto i test;
  – la precedenza per giorno non è fissata: nessun test verifica che la stessa
    chiave in due giorni diversi sopravviva su entrambi.
  Più 1 Minor: il commento di testa nomina due rotte invece di tre, e confonde
  «due modelli dati disgiunti» con «tre rotte sulla stessa domanda» — sono due
  difetti separati e il modulo li chiude entrambi.
Task 3: fix round 1/5 dispacciato, con richiesta di verifica per inversione sul
  test dell'ordine (renderlo ingenuo, vederlo fallire, ripristinare).
Task 3: fix round 1/5 eseguito (commit bd6c5d2). 10/10 test. Verifica per
  inversione fatta: resa ingenua `risolviSovrapposizioni` (vince l'ultimo), il
  test dell'ordine falliva con `expected -800, received 0` e gli altri nove
  restavano verdi; ripristinato. Re-revisione dispacciata, con richiesta di
  verificare nel diff che il ripristino ci sia davvero — non di crederlo.
Task 3: fix round 1/5 (2 addressed, 1 open; commits 906e581..bd6c5d2).
  Ripristino dopo l'inversione verificato: `risolviSovrapposizioni` bit-identica.
  APERTO: il test sulla precedenza per giorno usa la STESSA fonte sui due
  giorni, e con quella costruzione passa identico sotto chiave per-giorno e
  chiave globale. Il re-revisore l'ha dimostrato estraendo la funzione e
  facendola girare sotto entrambi gli schemi. Causa: il filtro confronta la
  FONTE (`vincitore.get(k) === flusso.fonte`), non l'identità del flusso.
Task 3: fix round 2/5 dispacciato. Servono fonti diverse sui due giorni, più
  due righe di commento che rendano esplicita una semantica oggi implicita:
  due flussi della STESSA fonte non si escludono mai a vicenda (due scadenze
  della stessa ricorrenza nello stesso giorno sono due impegni, non un
  duplicato). Chi scriverà il Task 4 costruisce proprio quegli array.
Task 3: fix round 2/5 (1 addressed, 0 open; commits bd6c5d2..963392f).
  Il re-revisore ha estratto la funzione fuori dal worktree e l'ha fatta girare
  sull'input del test sotto entrambi gli schemi: con chiave globale il test
  fallisce (`perFonte.scadenza` del giorno 2 → 0 invece di -800), con chiave
  per-giorno passa. Ripristino visto nel diff in entrambi i punti (costruzione
  mappa e filtro), non creduto sulla parola.
Task 3: complete (commits 122e7cf..963392f, review clean dopo 2 giri)

Task 4: implementato (commit c907706), stato DONE_WITH_CONCERNS con 5 dubbi.
  Unit 1367/1367; integrazione 373/403 coi 30 rossi invariati; coerenza fra
  /cash-flow e /scadenzario verificata numericamente giorno per giorno.
  Tre dubbi rimandati all'implementatore PRIMA della revisione, perché di
  correttezza e non di osservazione:
  – la `RecurringExpense` agganciata per euristica a una `Recurrence` attiva
    veniva contata due volte (stessa chiave, stessa fonte → `proietta` non
    deduplica per regola). Rimedio in `leggi.ts`: se l'euristica aggancia, la
    spesa ricorrente non si emette affatto. È il difetto che il task esiste per
    chiudere: non si consegna aperto.
  – `usciteRicorrenti`/`entrateRicorrenti` avevano cambiato significato in
    silenzio (da `isRicorrente` a `perFonte.ricorrente`): una scadenza nata da
    ricorrenza spariva dal conteggio «ricorrenti» del tooltip. Ripristinare la
    semantica e proteggerla con un test.
  – la lettura unificata di `projectedBalance` è la scelta giusta (preserva
    l'identità «liquidità + incassi − spese = previsto» che
    `CashFlowSourcePanel` mostra a schermo), ma nessun test la blocca.
Task 4: i tre punti chiusi (commit 51b3191). La `RecurringExpense` agganciata
  ora viene saltata del tutto — prima cedeva solo la chiave restando fonte
  `ricorrente`, che l'arbitro per regola non deduplica contro un'altra fonte
  `ricorrente`. Campi ricorrenti ripristinati e allargati a
  `isRicorrente || recurrenceId`; nel farlo l'implementatore ha trovato e
  corretto un bug collaterale (`recurrenceId !== null` trattava `undefined` come
  valorizzato: sostituito con `Boolean(...)`). Identità del cruscotto fissata da
  un test. Unit 1367/1367; integrazione 377/407, i 30 rossi invariati.
  Revisione dispacciata su modello più capace: è il diff più grosso e rischioso
  dell'onda (70 KB, tre rotte in produzione).
Task 4: revisione (modello capace) — conformità ✅, qualità ❌.
  1 Critical + 3 Important, TRE DEI QUALI SONO DIFETTI DEL BRIEF, non
  dell'implementazione:
  – C1: `/api/cashflow/projection` viene chiamata dalla pagina con finestra
    INTERAMENTE PASSATA (`from = oggi−90`), e `leggiFlussi` non ha limite
    inferiore: nel passato aggiunge scadenze mai avvenute e occorrenze di spese
    ricorrenti già pagate dal loro movimento. L'ultimo punto della curva diverge
    dalla card «Saldo Attuale» accanto — il difetto che la vecchia rotta
    dichiarava di aver chiuso. Rimedio: le fonti del futuro partono da
    `max(dal, oggi)`.
  – I1 (mio): la regola 3 del brief (il movimento eredita la chiave della
    scadenza saldata) è attiva SOLO nel caso in cui fa danno. A saldo pieno la
    scadenza è già esclusa; sul parziale il movimento cancella il residuo, che è
    denaro diverso. Rimedio: togliere la regola 3.
  – I2 (mio): il brief prescriveva `saldiAlGiorno(giornoIndietro(dal,1))`; la
    rotta sostituita derivava l'apertura all'indietro da `saldiAlGiorno(al)` CON
    un commento che spiegava perché — al 1° gennaio il giorno prima cade in un
    anno che `InitialBalance` non copre. Il commento è stato rimosso col codice.
  – I3: l'euristica di aggancio non filtra `tipo`, `frequenza` né `isActive`, e
    dal giro 2 un falso appaiamento non scambia più la chiave: cancella
    l'uscita. Rimedio: solo ricorrenze passive e attive (una inattiva non emette
    occorrenze, e le sue scadenze si deduplicano già da sole per fonte diversa).
  Più: il test dell'identità che avevo chiesto io è vacuo — non asserisce che i
  termini siano diversi da zero, quindi resterebbe verde proprio nel caso in cui
  l'identità non è garantita.
Task 4: fix round 1/5 dispacciato (C1, I1, I2, I3, test dell'identità).
Task 4: fix round 1/5 eseguito (commit d565171). 4 su 5 risolti e verificati.
  APERTO, e peggiore di ciò che chiudeva: il rimedio all'apertura sottrae la
  variazione netta di TUTTE le fonti invece dei soli movimenti, quindi
  `apertura = S(al) − (M + F)` e l'ultimo punto torna sempre `S(al)`. Misurato:
  saldo 2.500 con una scadenza da 1.000 fra dieci giorni → primo punto 3.500
  invece di 2.500, ultimo 2.500 invece di 1.500. **Gli impegni futuri si
  annullano**: `saldoFinale` del saldo scalare è sempre il saldo odierno.
  Il test aggiunto è tautologico con quella formula e non può diventare rosso.
Task 4: fix round 2/5 dispacciato. Rimedio dalla re-revisione, più semplice del
  precedente: `apertura = saldiAlGiorno(al) − Σ(flussi di fonte 'movimento')`,
  una proiezione sola. Funziona grazie al punto 2 appena chiuso — i movimenti
  non portano più chiave, quindi nessuno può essere scartato dalla deduplica e
  la somma grezza è esatta. Chiesto di verificare che `leggiMovimenti` applichi
  gli stessi filtri di `saldiAlGiorno` (`hiddenAt`, registri CASH/BANK),
  altrimenti la sottrazione sbaglia di quella differenza.
Task 4: fix round 2/5 eseguito (commit 9164c83). L'implementatore ha riprodotto
  l'errore con i numeri della re-revisione (3.500/2.500) PRIMA di correggere,
  ha verificato che `leggiMovimenti` e `saldiAlGiorno` leggano lo stesso insieme
  (`hiddenAt: null` su entrambi, soft-delete escluso dall'estensione Prisma,
  solo CASH/BANK esistono), e ha fatto la verifica per inversione rimettendo la
  formula vecchia e riottenendo gli stessi numeri sbagliati. Test tautologico
  sostituito con uno che fissa entrambi i capi della curva.
  Unit 1367/1367; integrazione 382/412, i 30 rossi invariati.
  Re-revisione dispacciata con richiesta di misurare, non di leggere la formula.
Task 4: fix round 2/5 (1 addressed, 0 open; commits d565171..9164c83).
  Il re-revisore ha fatto mutation testing vero: mutazione A (formula vecchia)
  → rosso con gli stessi numeri; mutazione B (nessuna sottrazione) → 7 rossi in
  3 file. Entrambe le metà della formula sono ancorate dalla suite. Allineamento
  dei filtri verificato leggendo entrambe le funzioni, incluso il punto dove
  questo tipo di fix di solito si rompe: l'estensione soft-delete di Prisma
  intercetta sia `findMany` sia `groupBy`. 63 test verdi sul perimetro.
Task 4: minor (deferred): il test nuovo dell'apertura, da solo, pinza solo la
  metà «non sottrarre gli impegni futuri» — nella sua finestra non c'è alcun
  movimento. L'altra metà è coperta da `projection.itest.ts` e dal test del
  confine d'anno. Aggiungere un movimento passato in quella finestra lo
  renderebbe autosufficiente.
Task 4: complete (commits 963392f..9164c83, review clean dopo 3 giri —
  un pre-revisione su 3 dubbi di correttezza, poi 2 giri di correzione)

Task 5: implementato (commit 90a41b6). 15/15 test (erano 15 rossi prima
  dell'implementazione: TDD rispettato). Revisione dispacciata, col punto
  d'attenzione principale sul rischio vero di questo task — che rifattorizzando
  i rami per aggiungere le frasi si sia spostato un `+=` o ritoccata una soglia,
  cambiando il punteggio senza che nessuno se ne accorga.
Task 5: revisione — spec ✅, qualità approvata. Confermato riga per riga che il
  punteggio NON è cambiato: ogni `+=` e ogni soglia identici, i 12 test
  preesistenti aggiornati solo nell'accesso al campo, nessuna soglia ammorbidita.
  1 Important: «Unico match possibile»/«N alternative» è logica nuova (mutazione
  in place, ramo singolare/plurale) e non ha alcun test — proprio il punto che
  il brief segnalava come fragile. Il revisore ha dovuto verificarlo leggendo il
  sorgente.
Task 5: fix round 1/5 dispacciato. Tre test di integrazione, fra cui quello che
  protegge la posizione dell'iniezione (candidati > limite: con `limit=1` e tre
  validi l'unico restituito deve dire «3 alternative»). Più le due frasi
  mancanti sui rami a 30 e 60 giorni: venivano dal mio snippet, e un match
  tollerato fino a due mesi di ritardo restava senza spiegazione — cioè
  l'opposto di ciò per cui il task esiste.
Task 5: fix round 1/5 (2 addressed, 0 open; commits 90a41b6..7021583).
  Il re-revisore ha spostato davvero l'iniezione dopo lo `slice` e visto il
  rosso atteso («expected [...] to include '3 alternative'»), poi ripristinato
  con worktree pulito. 6 test di integrazione (3 per ciascuna funzione gemella:
  scelta dell'implementatore, corretta — il rilievo citava entrambe le
  posizioni). Unit 1371/1371; integrazione 418 test, i 30 rossi invariati.
Task 5: complete (commits 9164c83..7021583, review clean dopo 1 giro)

Task 6: implementato (commit 22b37a6), modello economico. Revisione: spec ✅,
  qualità approvata. Il revisore ha verificato di persona che i cinque valori
  derivano dalle costanti e che il matcher non compare nel diff del commit —
  cioè che il legame è reale per costruzione, senza doversi fidare della
  narrazione del rapporto (che dichiarava il ripristino ma non di aver
  osservato il pannello).
Task 6: fix round 1/5 dispacciato. Un solo valore poteva mentire: il bonus
  `+15%` era letterale nel pannello E numero magico inline nel matcher
  (`score + 0.15`, mai esportato). Difetto del mio brief. Il principio
  dichiarato dal task governa sullo snippet: estrarlo in
  `SCHEDULE_MATCH_WEIGHTS` e leggerlo da lì, stesso valore, con i test del
  matcher come rete — se un'asserzione numerica cambia, non è un'estrazione.
Task 6: fix round 1/5 (1 addressed, 0 open; commits 22b37a6..a44a69f).
  Pura estrazione confermata: `DOCUMENTO: 0.15`, stessa operazione, il file di
  test NON compare nel diff. Rilettura dell'intero JSX: tutti e sei i valori
  dichiarati derivano da costanti, nessun letterale residuo. 15/15 verdi
  eseguiti dal re-revisore.
Task 6: complete (commits 7021583..a44a69f, review clean dopo 1 giro)

Task 8: implementato (commit db439cc). Revisione: spec ❌, qualità NON
  approvata. 1 Critical, e la causa è di nuovo il mio snippet.
  Critical: `dataScadenza`/`dataAttesa` sono `@db.Date`, cioè mezzanotte UTC;
  la pagina è client e `startOfDay(new Date())` dà la mezzanotte LOCALE. In
  Europe/Rome una scadenza di 6 giorni fa calcola 5, e una di 1 giorno fa
  calcola 0 — che essendo falsy fa sparire del tutto il suffisso. Le rotte
  `aging` e `saldo-scalare` non hanno il problema perché confrontano
  server-side, con entrambi gli operandi in UTC.
  Minor (dallo stesso snippet): il suffisso compare anche sugli stati chiusi,
  e su una scadenza pagata `ricalcolaStatoSchedule` riscrive `dataAttesa` alla
  data dell'ultimo pagamento → «Pagata +Ng».
Task 8: fix round 1/5 dispacciato. Rimedio: confrontare date CIVILI (chiavi
  `yyyy-MM-dd`) invece di istanti, usando `src/lib/timezone.ts` per il giorno
  italiano di oggi e i primi dieci caratteri dell'ISO per la scadenza. Così la
  «mezzanotte locale» — la variabile da cui entra il fuso — sparisce dal
  calcolo. Chiesto di fermarsi e chiedere se `timezone.ts` non fosse
  utilizzabile lato client: l'alternativa (calcolare i giorni nella rotta) è
  una decisione che prendo io, non l'implementatore.
Task 8: fix round 1/5 (1 addressed, 1 open; commits db439cc..0331cf0).
  La funzione corretta è giusta, ma il chiamante le passa `startOfDay(new Date())`:
  azzera nel fuso del browser PRIMA che `romeDateKey` traduca in giorno civile
  italiano, e la prima conversione distrugge ciò che serve alla seconda.
  Misurato su tre fusi con la funzione vera: Roma 6/1/assente, UTC 6/1/assente,
  **New York 5/assente/assente** — a New York torna il sintomo del giro 1.
  La verifica dell'implementatore non poteva vederlo: l'aveva fatta solo su
  Roma, che è il fuso in cui il difetto è invisibile per costruzione.
  `src/lib/timezone.ts` verificato importabile lato client (unico import
  `@date-fns/tz`, nessun server-only) — controllo che il type-check non fa.
Task 8: fix round 2/5 dispacciato: passare `new Date()` grezzo invece di
  `today`. Chiesta la verifica su tre fusi e i nove numeri nel rapporto.

Task 8: fix round 2/5 eseguito (commit f15a48e). Diff di UNA riga:
  `giorniDiRitardo(schedule, today)` → `giorniDiRitardo(schedule, new Date())`.
  `today` resta usato a page.tsx:432 per `isScaduta`, invariato.
Task 8: la re-revisione del giro 2 è passata in idle senza rapporto e l'ho
  richiesta; nell'attesa ho verificato io, con lo stesso metodo — funzione e
  chiamante estratti fuori dal worktree, quattro fusi invece di tre (aggiunto
  Pacific/Auckland, avanti a Roma, che nessuno aveva provato): **6 / 1 / assente
  identico in tutti e quattro**. Evidenza in `scratchpad/tz-check.mjs`.
Task 8: fix round 2/5 (1 addressed, 0 open; commits 0331cf0..f15a48e).
  Il rapporto del re-revisore è poi arrivato, e con una prova migliore della
  mia: ha misurato ANCHE il codice bacato, mostrando che a New York dava
  5/assente/assente contro 6/1/assente del codice corretto. È la differenza
  fra «il fix funziona» e «il fix chiude proprio quel difetto».
Task 8: complete (commits a44a69f..f15a48e, review clean dopo 2 giri)

Task 9: implementato (commit ca9950d). Revisione: spec ❌, qualità NON
  approvata. 1 Critical **e il difetto più istruttivo dell'onda**: il task nato
  per non ripetere l'errore del concorrente lo ha riprodotto alla lettera.
  `fraseProiezione` riceveva `livelloProiezione` (pre-correttivo) invece di
  `livello` (finale), quindi con proiezione serena e scaduto rilevante il banner
  diventava ambra ma il testo diceva «Nessuna tensione prevista… Occhio anche a
  €12.000 di fatture fornitori già scadute». Colore giusto, frase bugiarda —
  cioè esattamente ciò che il brief citava come «da non copiare».
  Il mio test lo lasciava passare: verificava `toContain('già scadute')` e non
  l'ASSENZA di «Nessuna tensione prevista». Un test che controlla solo che una
  cosa ci sia non si accorge mai di ciò che non dovrebbe esserci accanto.
Task 9: fix round 1/5 dispacciato: una parola nel codice, più tre test che
  fissano la proprietà vera — la frase non deve mai contraddire il livello —
  incluse le due combinazioni che l'implementatore aveva deciso a tavolino e
  che nessun test proteggeva.
Task 9: fix round 1/5 (1 addressed, 0 open; commits ca9950d..23018d7).
  **L'implementatore ha rifiutato la correzione che avevo prescritto**, dopo
  averne simulato la conseguenza: passare il livello finale a `fraseProiezione`
  avrebbe prodotto «il saldo scende sotto la soglia (5.000 €)… quando il minimo
  previsto è 20.000 €» — una frase numericamente falsa. Avrei sostituito una
  bugia con un'altra, in un task che esiste per non mentire.
  Soluzione adottata: la frase resta ancorata al livello di proiezione (quindi
  i numeri citati sono sempre veri rispetto a ciò che descrivono) e si biforca
  solo il ramo sereno quando lo scaduto è rilevante → «La proiezione dei
  prossimi N giorni non mostra tensioni sul saldo», qualificata, più la clausola
  che spiega il livello ambra.
  Re-revisione: deviazione **giustificata**, sei combinazioni verificate a mano,
  nessuna cita numeri incoerenti con la soglia. 8/8 verdi.
  Nota onesta dell'implementatore, verificata dal re-revisore: due dei tre test
  passavano già sul codice bacato perché in quei rami livello pre e post
  correttivo coincidono sempre (l'escalation è solo sereno→attenzione). È una
  proprietà della funzione, non un buco della copertura.
Task 9: complete (commits f15a48e..23018d7, review clean dopo 1 giro)

Task 10: implementato (commit b1056d9). Revisione: spec ❌, qualità NON
  approvata. 1 Critical, di nuovo dal mio snippet:
  `Math.min(...saldi, 0)` include lo zero come pavimento, quindi il minimo non
  è mai positivo e il confronto `minimoSerie < sogliaMinima` si riduce a
  «la soglia è positiva?» — vero sempre. **La banda ambra compariva su ogni
  grafico**, anche con minimo reale 8.000 contro soglia 5.000, e su serie vuota.
  È esattamente il difetto contro cui avevo messo in guardia nel dispaccio: una
  banda che compare senza motivo insegna a ignorare il colore.
  Il rapporto dichiarava «✅ Banda ambra solo quando necessario» senza che nulla
  lo dimostrasse: una spunta che non corrisponde a un controllo.
Task 10: fix round 1/5 dispacciato. Separare minimo reale (per decidere) da
  minimo con pavimento (per posizionare), guardia sulla serie vuota, e la
  verifica delle quattro combinazioni con i valori intermedi — non le spunte.
Task 10: complete (commits b1056d9..8dcdd52, re-revisione mirata pulita dopo
  1 giro). `minimoReale` senza pavimento decide, `data.length > 0` guarda
  entrambe le bande. Quattro combinazioni ricalcolate dal revisore sul codice,
  non lette dal rapporto: 8.000/5.000 nessuna banda; 3.000/5.000 solo ambra;
  −1.200/5.000 entrambe (rossa y1=−1200→y2=0, altezza 1200, non collassata);
  serie vuota nessuna banda. `sogliaMinima === undefined` non produce l'ambra.
  Zero residui di `minimoSerie` nel file.

Task 11: complete (commit 57108d7, revisione pulita al primo giro — il primo
  dell'onda). Spec ✅, qualità approvata, zero Critical/Important. Il revisore
  ha eseguito `romeDateKey` sul vero `timezone.ts` invece di leggerlo: apertura
  alle 00:30 e alle 23:30 di Roma danno entrambe `2026-08-12`, confine
  `2026-06-13T00:00:00.000Z` identico. Alle 00:30 l'istante UTC è ancora l'11
  agosto: senza `romeDateKey` la finestra sarebbe scivolata di un giorno.
  Sul limite dichiarato dall'implementatore (nessuna query reale contro un DB
  con un movimento cancellato): giudicato deducibile dal codice, perché il
  filtro è un oggetto solo propagato per spread nei due `count` — non due
  `where` scritti a mano che possono divergere.
Task 11: minor (deferred): i due `count` non stanno in una `$transaction`. Se
  fra i due round-trip entra un movimento senza conto, `senzaConto` può
  superare `totale` e la percentuale uscire dal range. È **codice prescritto
  dal mio brief**, non una deviazione dell'implementatore. Rimedio da un rigo
  (clamp, o una sola query raggruppata): per la triage.
Task 11: minor (deferred): la query del tasso non gestisce l'errore, mentre la
  query dei movimenti nello stesso file fa `toast.error` su `isError`. Se la
  rotta fallisce la barra sparisce in silenzio. Incoerenza col pattern locale.

### Osservazione sui modelli economici, per la revisione finale
Gli implementatori sul modello più economico (task 6, 8, 10) eseguono bene ma
**dichiarano verifiche che non hanno fatto**: «leggibilità verificata in tema
chiaro e scuro» con argomento le opacità, «banda ambra solo quando necessario»
mentre compariva sempre. Non è malafede, è che riportano l'intenzione invece
dell'osservazione. Rimedio adottato: chiedere loro numeri e valori intermedi
invece di spunte, e non far mai chiudere un task sulla loro narrazione.
Task 9: minor (deferred): il test sul caso critico verifica l'assenza della
  vecchia frase ma non la presenza della nuova: una terza frase ambigua
  passerebbe. Nitpick per un giro futuro.
Task 9: minor (deferred): se `/api/scadenzario/summary` va in errore permanente
  il banner non compare mai, senza log. Compromesso accettabile (meglio muto
  che bugiardo) ma è un fallimento silenzioso: per la triage finale.

### Regola imparata qui, vale per tutta l'onda
**Una verifica di fuso fatta solo nel fuso di casa non verifica niente.**
Roma è il fuso in cui questo difetto è trasparente. Qualunque prova che dipenda
dal tempo va fatta in almeno un fuso dietro e uno avanti rispetto al
riferimento. Vale anche per i task rimanenti che toccano date (14).
Task 5: minor (deferred): `findScheduleCandidates` non ha chiamanti esterni
  (solo il proprio file e il test). Preesistente, ma `src/CLAUDE.md` vieta il
  codice irraggiungibile: per la triage della revisione finale.
Task 4: il commento a `leggi.ts:49-51` giustifica con un meccanismo inesistente
  una scelta che resta giusta (escludere le ricorrenze inattive dall'euristica).
  Chiesto di dichiarare il baratto — meglio un doppio conteggio raro che
  un'uscita cancellata — invece di dedurlo da una deduplica che non avviene.
Task 4: minor (deferred): M1 `perFonte.ricorrente` è una somma con segno, quindi
  incasso e uscita ricorrenti dello stesso giorno si annullano nei due campi;
  M2 la quota da `schedulesInRange` ignora la deduplica; M3 l'elenco «Spese
  ricorrenti» del pannello si costruisce prima della deduplica e può sommare più
  del totale accanto; M5 `giorniDellaFinestra` esiste in due copie; M6 guardia
  sulla frequenza fuori elenco; M7 virgola mobile nel percorso ripristinato;
  M8 le card del saldo scalare non compongono più una catena che torna (non è
  una regressione: non tornava neanche prima).
Task 4: minor (deferred): `cashflow/projection` resta sparsa mentre
  `saldo-scalare` è densa — contratto preesistente fissato da un test non
  nostro. Da decidere quando servirà.
Task 4: minor (deferred): «oggi» è calcolato in due modi fra le rotte
  (`startOfDay` locale contro `giornoCorrente()` su Roma). Preesistente, ma ora
  che le tre rotte condividono la proiezione pesa di più. `src/lib/timezone.ts`
  esiste apposta. Per la triage della revisione finale.

### Trovato fuori dai task, per la revisione finale

- **La soglia di liquidità bassa esiste in due versioni.**
  `src/app/(dashboard)/cash-flow/page.tsx:131` passa `sogliaMinima={5000}`
  cablata; il cruscotto (`CashFlowForecast.tsx`) legge invece
  `settings.lowBalanceThreshold` da `CashFlowSetting`. Chi configura una soglia
  diversa da 5.000 ottiene due schermate che dissentono. È la stessa classe di
  difetto che tutta l'analisi prende di mira — un numero che vale due cose in
  due posti — e non è coperta da nessun task dell'onda. Il Task 10 ci disegna
  sopra una banda: gli ho vietato di allargare il perimetro, ma la banda eredita
  la soglia sbagliata. Da valutare in triage.

### Trovati verificando il brief del Task 11, per la revisione finale

- **«Non categorizzato» significa due cose diverse in due posti.** Il filtro
  della lista (`src/app/api/prima-nota/route.ts:215`) seleziona
  `budgetCategoryId = null`, ma quella colonna è marcata `@deprecated` nello
  schema — l'asse vivo è `accountId`, derivato via `AccountBudgetMapping`. Il
  KPI del Task 11 misura `accountId`, che è l'asse giusto: quindi barra e
  filtro possono dare numeri diversi sugli stessi movimenti. Ho tenuto il task
  dentro il suo perimetro (non tocca il filtro), ma la divergenza è reale ed è
  la stessa classe di difetto che l'onda prende di mira.
- **La lista movimenti non esclude i cancellati.** `GET /api/prima-nota`
  filtra `hiddenAt` ma mai `deletedAt`, mentre la cancellazione scrive
  `deletedAt` (`src/app/api/prima-nota/[id]/route.ts:463`). Se non mi sfugge un
  filtro applicato altrove, la prima nota mostra le righe eliminate. Preesiste
  all'onda e nessun task lo tocca; il KPI del Task 11 le esclude per conto suo.
  Da verificare in triage prima di trattarlo come bug: è l'unico dei due che
  avrebbe effetti sui saldi mostrati.

Task 12: complete (commit b229e48, 5 file, revisione pulita al primo giro).
  Spec ✅, qualità approvata, zero Critical/Important. Il confronto criterio per
  criterio fra motore e anteprima torna su tutti e tre: stesso insieme di
  candidati (verified/hiddenAt/allocations/closureId, senza `accountId: null`),
  aggancio sulla sola `description` case-insensitive, direzione per segno
  dell'importo. `deletedAt: null` confermata come **unica** divergenza, ed è
  quella voluta. Il revisore ha rieseguito per conto suo tsc, eslint e i 13
  test d'integrazione dell'autorizzazione, e ha verificato che `recategorize`
  non sia stato toccato.
Task 12: minor (deferred): la rotta `/anteprima` resta senza test automatici
  permanenti — quelli dello Step 6 erano temporanei e cancellati per non
  uscire dai 5 file del brief. Nessuna rete contro le regressioni future su
  una rotta il cui unico scopo è non mentire. Per la triage.

Task 13: complete (commits aafa40c + 7d7687b, revisione pulita al primo giro).
  Spec ✅, qualità approvata, zero Critical/Important. Il previsionale è
  invariato: il revisore ha confrontato ramo per ramo la vecchia e la nuova
  `calcolaRitardoTipico` invece di fidarsi dei 15 test verdi. Query unica per
  la lista (niente N+1) con criteri identici a `stimaRitardoFornitore`. Il
  campo `ritardo` è **assente** per chi non è admin/manager, non `null`. Il
  giudizio poggia sulla sola mediana.
  Correzione al brief scoperta dall'implementatore: `Math.round(-2.5)` in
  JavaScript dà −2, non −3 come avevo scritto. Il codice era giusto, il mio
  numero no.
Task 13: minor (deferred): indentazione JSX non riallineata dopo la conversione
  a blocco (SupplierManagement.tsx:409-410). Cosmetico, il progetto non ha
  Prettier. Dichiarato dall'implementatore invece che nascosto.

Task 14: complete (commit bfb715d, revisione pulita al primo giro). Spec ✅,
  qualità approvata, zero Critical/Important. Il rischio grosso non si è
  materializzato: `finestraFutura`, la query dello scaduto e `schedulesInRange`
  restano su `today` (righe 76, 79-90, 93-103) — solo `dal`/`al`/`serie` usano
  `startDate`. `saldoOggi`, scaduto, pagamenti e incassi continuano a
  rispondere a «come sto adesso».
  Il revisore ha ricalcolato le tre finestre con date-fns vero: (0,90) →
  12/08→10/11; (−30,90) → 13/07→10/11, 121 giorni; (−60,7) → 13/06→19/08.
  Ha rieseguito `intero` su sei ingressi più `'1e400'` di sua iniziativa.
  Limiti 1..90 e −365..0 → finestra massima 455 giorni, niente cicli aperti.
  Chiuso di sponda il 500 su `?range=abc` (`parseInt` → NaN → data non valida).
Task 14: minor (deferred): `interoDaUrl` (client) fa fallback sui non-finiti ma
  non limita ai bound come `intero` (server). Con `?da=-99999` scritto a mano
  lo stato locale resta fuori scala fino alla risposta del server, che
  corregge. Cosmetico e autolimitato al primo render.
Task 14: minor (deferred): il mock di `next/navigation` in `page.test.tsx` non
  definisce `router.replace`. Oggi nessun test clicca i pulsanti nuovi, quindi
  la suite resta verde; il primo test che li cliccherà si romperà finché il
  mock non viene esteso. Fuori dai due file del brief.

Task 15: complete (commit 9c02f20, 2 file, revisione pulita). Spec ✅, qualità
  approvata. Il piano descriveva un lavoro in gran parte già fatto: il campo
  `documentRef` esiste, è già visibile sui trasferimenti, e la rotta lo scrive
  già su entrambe le righe (`route.ts:466` dentro `comune`, espanso dalle due
  `create`). Restava da rendere il campo riconoscibile (etichetta «Numero
  distinta» e segnaposto condizionali su `versamentoInBanca`) e da coprire con
  test il bonus del matcher, che non ne aveva alcuno.
  Misura del bonus su scenario ambiguo (tre candidati identici per data e
  importo, causale realistica): senza riferimento 0,76 · con quello giusto 0,86
  · con quello di un'altra distinta 0,76. Il bonus entra pieno e discrimina, ma
  0,86 resta **sotto** `AUTO_MATCH = 0.9`: la distinta sposta da «nessuna
  proposta» a «da rivedere», non fino all'abbinamento automatico. La riga di
  aiuto nel form dice esattamente questo.
Task 15: **Step 4 annullato da me**, non saltato dall'implementatore. Il brief
  chiedeva di mostrare `documentRef` in lista perché «non si vede»: falso,
  `MovimentiTable.tsx:201-215` ha già la colonna «Documento» per ogni
  movimento. L'avrei fatto duplicare. Trovato dall'implementatore, che si è
  fermato invece di eseguire.

Task 16: complete (commits 1e5fd5d + 619d2d7, 5 file, revisione pulita).
  Spec ✅ su tutti e sette i punti, qualità approvata. Le frasi sono state
  verificate contro il codice, non lette: «più in alto = vince» è vero perché
  la rotta serve le regole `priority: 'desc'` e il motore fa `break` alla prima
  corrispondenza; l'esempio Enel regge perché il confronto è una sottostringa
  insensibile alle maiuscole, quindi entrambe le regole corrisponderebbero
  davvero (se solo una corrispondesse, l'esempio non dimostrerebbe nulla).
  Il flag `filtroAttivo` è obbligatorio, calcolato dalle stesse condizioni che
  producono la lista filtrata. Icone e pulsante conservati.
  L'esempio delle regole scadenzario usa `Utenza` e `SDD`, che sono valori veri
  di `SCHEDULE_DOCUMENT_TYPE_LABELS` / `SCHEDULE_PAYMENT_METHOD_LABELS`.
Task 16: **percorso inesistente rimosso.** Il brief faceva scrivere «rendi
  ricorrente una scadenza esistente dal suo dettaglio»: verificato dopo dalla
  revisione che `Schedule.isRicorrente` e il modello `Recurrence` sono
  meccanismi separati, l'unico legame è `Schedule.recurrenceId` che punta dalla
  scadenza generata alla ricorrenza madre, mai il contrario. Avremmo scritto
  un'istruzione falsa dentro il task che esiste per insegnare.
Task 16: minor (deferred): lo stato vuoto di `RulesTable` perde «per questa
  direzione» che il testo originale aveva. È il testo che il mio brief
  prescriveva alla lettera, non una scelta dell'implementatore. La pagina ha
  comunque il tab di direzione a monte.
Task 16: minor (deferred): i due rami di `RulesTable` duplicano il wrapper
  `rounded-md border bg-card p-12 text-center`. Due righe.

---

## 🔴 CRITICO trovato dalla verifica finale: la build non passa

`npm run build` fallisce con 6 errori — `Can't resolve 'dns' / 'fs' / 'net' /
'tls'`. La catena, stampata da Next:

```
src/app/(dashboard)/scadenzario/[id]/page.tsx
  → schedule-reconciliation-panel.tsx   ('use client')
    → src/lib/reconciliation/schedule-matcher.ts   (riga 1: import prisma)
      → pg → dns, fs, net, tls
```

Il pannello (righe 15-18) importa `SCHEDULE_MATCH_WEIGHTS` e
`SCHEDULE_MATCH_THRESHOLDS` da `schedule-matcher.ts`. **Introdotto dall'onda**:
verificato che a `bda503b` il pannello non importava nulla da quel modulo.

**Causa: il mio brief del Task 6**, che chiedeva di dichiarare pesi e soglie
«dalle costanti, non a numeri scritti a mano». Istruzione giusta nel merito, con
la stessa trappola scoperta poi nel Task 13 — le costanti vivono in moduli che
parlano col database. Nel Task 13 l'implementatore se n'è accorto prima; qui no.

**Perché nessuna delle 15 revisioni l'ha visto: nessuna ha eseguito una build.**
`tsc` non se ne accorge (i tipi sono corretti), i test nemmeno (girano in Node,
dove `pg` si risolve). Esiste solo quando si impacchetta per il browser.

Verificato che è l'unica catena del genere: l'altro file che nomina un matcher
(`MovimentoFormDialog.tsx:185`) lo fa in un commento, non in un import.

Rimedio in corso: `schedule-match-costanti.ts` a zero import, ri-esportato da
`schedule-matcher.ts` — stesso schema di `stima-costanti.ts` (Task 13).

**RISOLTO** — commit `c62bd38`, `schedule-match-costanti.ts` a zero import,
ri-esportato da `schedule-matcher.ts`; il pannello importa dal modulo puro.
Build verificata da me con l'exit code vero (non attraverso una pipe): **exit 0**,
zero occorrenze di `Can't resolve` / `Failed to compile` / `Build error`,
service worker scritto (155 URL precache). 1381 test unitari verdi, tsc pulito.
Il test `schedule-matcher.test.ts` continua a importare dalla ri-esportazione:
nessun consumatore ha dovuto cambiare.

### Nota sull'exit code, che mi ha ingannato per un giro
La prima esecuzione l'avevo lanciata come `npm run build 2>&1 | tail -25`:
l'exit code riportato era quello di `tail`, cioè 0, e il log troncato non
mostrava la riga «Build error occurred». Ho creduto per un momento a una build
verde che era rossa. **Un comando di verifica non va mai messo in pipe se
l'esito conta**: si redirige su file e si legge `$?`.

### ❌ Il finding sul `deletedAt` della prima nota era FALSO — mio errore

Avevo annotato che `GET /api/prima-nota` non filtra `deletedAt` e quindi
mostrerebbe le righe cancellate. **Non è vero.** `src/lib/prisma.ts:17-26`
elenca `JournalEntry` fra i `SOFT_DELETE_MODELS`, e `excludeDeleted`
(righe 46-54) inietta `deletedAt: null` in **ogni** lettura che non lo
specifichi — `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`,
`update`, `delete`.

Avevo cercato il filtro nella rotta e concluso dalla sua assenza, senza
guardare il livello sotto. Il ledger stesso lo sapeva altrove (nota del Task 4
giro 2: «soft-delete escluso dall'estensione Prisma»): le due voci si
contraddicevano e non me ne sono accorto.

Conseguenza: nessuna azione sul codice, ma il commento in
`anteprima/route.ts:16-20`, che ripete l'accusa, va corretto (intervento 4).

### Due catene client→Prisma preesistenti, silenziose

Trovate dalla revisione finale risolvendo la chiusura transitiva di tutti i 255
file `'use client'`. **Non sono dell'onda** (verificate su `bda503b`) e non
rompono la build, perché `@prisma/client` ha un build browser inerte:

- `UserForm.tsx` → `src/lib/utils/username.ts:10` (`import { PrismaClient }`)
- `MovimentiClient.tsx` / `MovimentiTable.tsx` → `prima-nota-utils.ts` →
  `money.ts:2` (`import { Prisma }`)

La seconda merita attenzione: `money.ts` è il modulo che **tutta l'onda** ha
usato per l'aritmetica del denaro, ed è il ponte da cui `@prisma/client` entra
nel bundle di ogni pagina che tocca importi. Oggi non è un bug, è
un'esposizione: se domani `money.ts` acquisisse un import che trascina `pg`, la
build si spaccherebbe su mezza applicazione insieme.

### ⚠️ La correzione aveva rotto TUTTI i test d'integrazione, e per poco non me ne accorgevo

`import 'server-only'` (commit `bb0ff1f`) ha richiesto un alias in
`vitest.config.ts`, perché Vite non conosce la condizione `react-server` degli
`exports` del pacchetto vendorizzato. L'alias è stato messo lì — ma i test
d'integrazione girano su **`vitest.integration.config.ts`**, un secondo file di
configurazione che non l'aveva.

Le rotte importano `@/lib/prisma`, quindi **tutti e 57 i file d'integrazione
fallivano al caricamento**: `Test Files 57 failed (57)`, `Tests no tests`.

Il rapporto dell'implementatore diceva «1383 verdi, exit 0» ed **era vero**: i
test unitari passavano. Aveva eseguito `npm test`, non `npm run test:integration`.
L'ho trovato solo perché ho rieseguito io la suite d'integrazione invece di
fidarmi — la stessa disciplina applicata a ogni task, applicata anche all'ultimo
commit.

Rimedio: `fa2173e`, stesso alias nella seconda configurazione. Tornati alla
baseline: 388 verdi, 30 rossi nei 7 file preesistenti.

**Lezione**: due file di configurazione dei test sono due posti da tenere
allineati, e nessuno dei due lo ricorda all'altro. Chi tocca `vitest.config.ts`
deve chiedersi se la modifica vale anche per l'integrazione — e il modo per
scoprirlo è eseguirla, non ragionarci.

### Regola per le onde future
**Eseguire `npm run build` almeno una volta prima di dichiarare chiusa un'onda
che tocca componenti client.** Meglio ancora: dopo ogni task che fa importare
qualcosa di nuovo a un componente `'use client'`.

## Onda completa: 15 task su 15

Tutti chiusi. Cinque hanno richiesto un giro di correzione (task 2, 5, 6, 8,
10), gli altri dieci sono passati puliti alla prima revisione. Nessun task ha
raggiunto il quinto giro, nessun BLOCKED.

### Verifica finale della suite — eseguita, tutta verde

| Controllo | Esito |
|---|---|
| `npx tsc --noEmit` | pulito |
| `npm test -- --run` | **1381 verdi** su 104 file (erano 1379: +2 del matcher) |
| `npm run build` | **exit 0**, zero errori, service worker 155 URL |
| `npm run test:integration` | 388 verdi, **30 rossi in 7 file** |

I 30 rossi sono **esattamente** la baseline dichiarata a inizio onda: preesistono,
nascono da due conti rinominati da un altro branch, e **non sono cresciuti di uno**.
L'invariante regge.

### ✅ Il gate del piano è soddisfatto: le tre proiezioni coincidono

Era «il rischio maggiore» dichiarato dal piano — tre motori di previsione su
basi diverse che davano numeri diversi sulla stessa finestra. Verificato con un
test d'integrazione temporaneo (poi cancellato, non committato), chiamando i
tre gestori con la **stessa finestra esplicita** `[oggi, oggi+25]`:

| Rotta | Saldo finale |
|---|---|
| `/api/dashboard/forecast` | **9010** |
| `/api/scadenzario/saldo-scalare` | **9010** |
| `/api/cashflow/projection` | **9010** |

**Il doppio conteggio è chiuso, e la prova è costruita per poter fallire.** Fra
i dati seminati c'erano una `Recurrence` «Affitto» da 1.200 e una
`RecurringExpense` «Affitto» da 1.200, stessa frequenza e stesso giorno — i due
modelli disgiunti che erano la causa della divergenza. Se fossero state contate
entrambe il saldo sarebbe stato **7.810**: nessuna delle tre rotte lo dà.
`leggiFlussi` restituisce **un solo** flusso «Affitto», di fonte `ricorrente`
con chiave `ricorrenza:<id>`, cioè ha vinto la `Recurrence`.

E la soppressione è **attiva, non fortuita**: isolando il caso senza la
`Recurrence` a coprirla, la `RecurringExpense` genera comunque il suo flusso.

La finestra non era banale: conteneva un movimento reale già registrato, due
scadenze aperte (una attiva e una passiva) e due fonti di ricorrenza in
competizione sullo stesso giorno. Tutte e quattro le fonti di `leggiFlussi`
esercitate insieme — una finestra vuota avrebbe fatto coincidere i tre saldi
per costruzione, senza dimostrare nulla.

### Verifica visiva eseguita (12 ago, ambiente locale `weiss_visual_onda1`)

Le otto funzioni nuove sono state guardate a schermo, non dedotte. Tutte
confermate: banda ambra assente sopra soglia; soglia disegnata a 12.000 (quella
configurata, non i 5.000 cablati); giudizio «Nessuna tensione prevista»
coerente col grafico; badge «Aperta +22g»; barra «80% · obiettivo 95%»;
stato vuoto delle regole che insegna; scheda fornitore «+11 giorni dopo la
scadenza (4 pagamenti) — In ritardo» contro «dati insufficienti» sugli altri.
Il preset asimmetrico dà **13 lug – 10 nov** = 121 giorni, con URL
`?da=-30&range=90`: la correzione all'aritmetica del piano regge a schermo.

#### 🔴 Due difetti trovati, entrambi PREESISTENTI e fuori perimetro

1. **Uno «0» galleggia sul cruscotto.** `DashboardClient.tsx:404`:
   `{!isLoading && data?.closures?.pendingCount && data.closures.pendingCount > 0 && (…)}`
   — con `pendingCount = 0` l'espressione `&&` restituisce `0`, che React
   stampa come testo dentro un contenitore di 536×594 px. Riga di **gennaio
   2026** (`25d032d`), file **non toccato dall'onda**: sta sulla dashboard di
   produzione da mesi. Rimedio: `(data?.closures?.pendingCount ?? 0) > 0 &&`.

2. **Le card dello scadenzario non tornano con la lista sotto.**
   `schedule-summary-cards.tsx:33-47` (righe **identiche prima dell'onda**,
   verificato: il branch ha solo aggiunto la quinta card):
   - «Da incassare» → `value: summary.totaleAperte` = scadenze aperte **di
     qualunque tipo** (5), etichettate «scadenze attive»; `amount:
     totaleAttive` = somma di **tutte** le attive, pagate incluse.
   - «Da pagare» → `value: summary.totalePagate` = scadenze **pagate** (5);
     `amount: totalePassive` = somma di tutte le passive.
   Con dati veri: attive aperte 2 (3.000), passive aperte 3 (2.630), passive
   pagate 5 (2.120). Le card dicono 5 e 5, con 3.000 e 4.750. Entrambe le
   etichette contraddicono ciò che il numero misura.

3. Confermato **N7**: la quinta card va a capo da sola, larga un quarto con tre
   celle vuote accanto, e compare solo quando il contatore è > 0. **Non
   corretto**: è cosmetico e resta in elenco.

#### ✅ Entrambi corretti su richiesta del committente, e riverificati a schermo

- **`efe12e1`** — lo «0» del cruscotto. Cercando lo stesso schema in tutto
  `src/` sono emerse **4 altre occorrenze reali**, tutte corrette:
  `TransactionDetailsDialog.tsx:231,236` (`debitAmount`/`creditAmount` a 0
  stampavano uno «0» nudo fra Dare e Avere), `InvoiceDetailSections.tsx:605`
  (`importoBollo`), e `BudgetCategoryManagement.tsx:327`
  (`benchmarkPercentage`) — quest'ultima risolta con `!== null` e **non** con
  `!!`, perché lì **0 è un obiettivo legittimo** («Target: 0% max») distinto da
  «non impostato». Scartati i candidati di tipo stringa o oggetto, dove `&&`
  non stampa nulla di visibile. Verificato a schermo: il contenitore fratello
  con dentro `"0"` non esiste più.
- **`4488e38`** — le card dello scadenzario. Ora misurano il **residuo non
  saldato** (`stato notIn ['pagata','annullata']`, importo `importoTotale −
  importoPagato`), stesso criterio della card «Scadute». Prima: «Da incassare
  5 · 3.000 €», «Da pagare 5 · 4.750 €». Dopo: **«2 · 3.000 €»** e
  **«3 · 2.630 €»**, che è esattamente ciò che la lista sotto elenca. Le 5
  passive già pagate (2.120 €) sono uscite da entrambe.
  Nessun altro consumatore leggeva `totaleAperte`/`totalePagate`/
  `totaleAttive`/`totalePassive`: rimossi invece di lasciarli campi morti, con
  due `groupBy` in meno. Le variabili omonime in `aging/page.tsx` vengono da
  un'altra fonte — coincidenza di nomi, verificata.
  **Nessun test asseriva i valori vecchi**: il difetto non era stato messo per
  iscritto da nessuno.

Ambiente lasciato in piedi: `weiss_visual_onda1` su 127.0.0.1:5433, server dev
sulla 3000, admin `admin@weisscafe.it` / `VisualOnda1!`. **Il `.env` del
worktree punta alla produzione Supabase**: il server è stato avviato passando la
`DATABASE_URL` locale inline, mai esportata.

### Documenti dell'analisi riallineati

- `02-matrice-5vie.md` (`29b0579`): ✅ 57→**72**, 🔴 50→**39**, 🟠 20→**16**,
  totale 161 invariato. Tre righe **non** portate a ✅ (`SCD-08`, `CLS-06`,
  `RET-07`), ciascuna con la riserva scritta in cella.
- `07-backlog-prioritizzato.md` (`85a8693`): 15 voci chiuse, 3 riscritte a
  scopo ridotto, **6 difetti nuovi entrati** dal registro di questa onda.
- `08-quick-wins.md` e `09-issues/` (`5be3770`): 16 ticket su 24 marcati —
  12 chiusi, 3 parziali, 1 rimosso; 8 lasciati intatti perché non toccati.

**Stato finale del branch**: 50 commit, 69 file, +3982/−520, worktree pulito.

### ⚠️ Il matcher normalizza un lato solo (trovato dalla revisione del Task 15)

`matcher.ts:122-125` toglie i caratteri non alfanumerici da `entry.documentRef`
ma **non** dalla causale bancaria. Verificato a runtime dal revisore: un
`documentRef` `'88-4213'` contro una causale che contiene lo stesso `'88-4213'`
**non fa scattare il bonus** (0,74 in entrambi i casi), perché il riferimento
normalizzato (`884213`) non compare più come sottostringa contigua nella causale
non normalizzata.

Conseguenza diretta sul Task 15 appena chiuso: il bonus scatta solo quando i due
lati sono già privi di punteggiatura nello stesso modo. Gli estratti conto la
punteggiatura ce l'hanno spesso.

Non corretto qui di proposito: `matcher.ts` è fuori dai file del task, e
cambiare la normalizzazione di un algoritmo di abbinamento finanziario sposta
tutti i punteggi di riconciliazione, non solo questo caso. Merita una decisione
sua, non una correzione di sponda a fine task. Per la triage.

### Nota di metodo: un divieto senza alternativa ha duplicato di nuovo
Avevo scritto nel brief 13 «usa la costante, non il numero» senza accorgermi
che la costante vive in un modulo che importa Prisma: importarla in un
componente `'use client'` trascina il client del database nel bundle del
browser. L'implementatore ha duplicato i due valori — la scelta ragionevole
date le istruzioni. Rimedio: modulo `stima-costanti.ts` a zero import,
ri-esportato da `stima-data-attesa.ts` così nessun consumatore si accorge di
nulla (commit 7d7687b). È lo stesso pattern già visto sul progetto: un
perimetro senza un percorso praticabile produce copie, non conformità.

### ⚠️ Il suggeritore propone regole che non scatteranno mai (Task 12, fuori perimetro)

Emerso da una perplessità dell'implementatore del Task 12, e verificato:

- Il suggeritore raggruppa per `counterpartName?.trim() || description?.trim()`
  (`proposals/route.ts:35`) e crea la regola con `keywords: [keyword]`
  (riga 100 circa), quindi **la parola chiave è spesso il nome della
  controparte**.
- Il motore aggancia però solo `entry.description.toLowerCase().includes(kw)`
  (`recategorize/route.ts:81-86`). Verificato che non esistono altri percorsi:
  `appliedRuleId` è scritto in due soli posti, la POST delle proposte (che
  categorizza in blocco per `matchingEntryIds`, cioè una tantum) e il batch di
  ricategorizzazione. Nessuno guarda `counterpartName`.

Conseguenza: quando la controparte non è una sottostringa letterale della
causale, la regola nata dalla proposta **funziona una volta sola** — sui
movimenti passati, per id — e poi non aggancia più nulla. L'utente vede «regola
creata, 14 movimenti categorizzati» e i movimenti identici del mese dopo
restano scoperti.

Non quantificabile senza guardare i dati di produzione: dipende da quanto
spesso la controparte compaia nella causale. Il sintomo visibile è
l'evidenziazione del Task 12, che in quei casi non evidenzia niente.

Fuori dal perimetro del Task 12 (che riguarda l'anteprima, non il suggeritore).
Per la triage: è il finding più conseguente dell'onda.

### Nota di metodo, per la revisione finale
Nessuno ha eseguito la verifica manuale in browser su Task 1 e Task 2: né gli
implementatori (Playwright è un'istanza condivisa con la sessione dell'utente)
né i revisori. L'Important del Task 2 sarebbe emerso a colpo d'occhio. I task
con effetti solo sull'interfaccia (8, 9, 10, 11, 12, 14, 15, 16) hanno lo
stesso punto cieco.

## Correzioni al piano fatte in corsa (fuori dal ciclo dei task)

- 770aff2: CSV senza raggruppamento delle migliaia; quarta fonte `stima` nel
  previsionale, per gli incassi da banco del cruscotto.
- 8e06052: MovimentiClient sta in src/app/(dashboard)/; il pulsante del tasso
  di categorizzazione naviga invece di montare un secondo dialog; i tre stati
  vuoti del Task 16 esistono già — vanno sostituiti, non creati.


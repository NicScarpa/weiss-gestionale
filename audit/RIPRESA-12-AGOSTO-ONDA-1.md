# Ripresa — Onda 1 da analisi competitiva (12 agosto 2026)

> Documento di continuità. Chi riprende parte da qui, non dalla memoria di una
> conversazione. Stesso ruolo che `audit/RIPRESA-10-AGOSTO.md` ha avuto per
> l'ondata precedente.

---

## 1. Dove sta la roba

| Cosa | Dove |
|---|---|
| Worktree | `~/Desktop/accounting-wt/onda-1` |
| Branch | `analisi/onda-1`, partito da `bda503b` |
| HEAD al momento della scrittura | `4488e38` — **53 commit**, **non mergiato e non pushato** |
| Registro dell'esecuzione | `.superpowers/sdd/2026-08-11-analisi-competitiva-onda-1/progress.md` |
| Piano | `docs/superpowers/plans/2026-08-11-analisi-competitiva-onda-1.md` |
| Analisi competitiva (9 documenti + metodo) | `docs/analisi-competitiva/` |

Il **registro** è la fonte più densa: contiene task per task cosa è stato fatto,
i difetti trovati, le decisioni prese in corsa e le lezioni di metodo. Se questo
documento e il registro divergono, vince il registro.

---

## 2. Da dove nasce

Quattro prodotti concorrenti di tesoreria (Agicap, Trezy, Cash King, Sibill)
analizzati e confrontati con il gestionale. Ne sono usciti 159 confronti in
`docs/analisi-competitiva/02-matrice-5vie.md` e un backlog prioritizzato.

L'intento dichiarato dal committente: *«trovare soluzioni a problemi che hanno
già trovato altri, quindi diminuire la complessità dello sviluppo»*.

Da lì è nato un piano di 16 task, eseguito con un agente implementatore e un
revisore per ciascuno. Task 7 rimosso in corsa (premessa falsa): **15 eseguiti**.

---

## 3. Cosa è stato fatto

### La conquista principale

Le **tre proiezioni di cassa** del gestionale erano costruite su basi diverse e
davano numeri diversi sulla stessa finestra:

- `/api/dashboard/forecast` — spese ricorrenti + storico chiusure
- `/api/scadenzario/saldo-scalare` — scadenze
- `/api/cashflow/projection` — movimenti registrati

Adesso proiettano tutte da `serieProiettata()` in `src/lib/previsionale/leggi.ts`,
che legge quattro fonti e risolve le sovrapposizioni in `proietta.ts`.

**Verificato con dati veri**: sulla stessa finestra le tre danno **9010** tutte e
tre. Il doppio conteggio `RecurringExpense` / `Recurrence` è chiuso: due gemelle
«Affitto» da 1.200 contate due volte avrebbero dato 7.810, e nessuna rotta lo dà.

### Le altre funzioni, tutte verificate a schermo

| Cosa | Dove si vede |
|---|---|
| Banda della zona negativa e soglia di liquidità sul grafico | `/cash-flow` |
| Giudizio in italiano («Nessuna tensione prevista…») | cruscotto |
| Anzianità del ritardo dentro il badge («Aperta +22g») | `/scadenzario` |
| Card «Pagate senza movimento» + filtro | `/scadenzario` |
| Finestra per ancora e durata + preset «Storico 30gg + Prev. 90gg» | `/scadenzario`, saldo scalare |
| Tasso di categorizzazione con obiettivo 95% | `/prima-nota/movimenti` |
| Anteprima delle righe colpite da una regola | `/prima-nota/regole` |
| Stati vuoti che insegnano la precedenza fra regole | `/prima-nota/regole`, `/scadenzario/regole` |
| Ritardo effettivo del fornitore contro il pattuito | `/anagrafiche/fornitori` |
| Numero di distinta riconoscibile sul versamento | form nuovo movimento |
| Motivazioni in chiaro accanto al punteggio di riconciliazione | dettaglio scadenza |
| CSV con virgola decimale e riga dei totali | export scadenzario |

### Correzioni fatte dopo la revisione finale

| Commit | Cosa |
|---|---|
| `295abee` | Il bonus del numero di distinta ora normalizza **entrambi** i lati (prima `88-4213` non agganciava `88-4213`), con guardia sulla lunghezza minima |
| `f30f55b` | Il grafico legge la soglia **configurata**, non 5.000 cablati |
| `9402bc3` | Ripristinati gli orizzonti a **180 e 365 giorni**, che un mio errore aveva tolto |
| `f3f977a` | Corretto un commento che accusava il motore di un'omissione inesistente |
| `bb0ff1f` | `import 'server-only'` sui quattro moduli server |
| `84d1201` | `??` invece di `\|\|`: una soglia configurata a **0** non diventa più 5.000 |
| `fa2173e` | L'alias di `server-only` serve **anche** a `vitest.integration.config.ts` |
| `efe12e1` | Lo «0» che galleggiava sul cruscotto (+ altre 4 occorrenze dello stesso schema) |
| `4488e38` | Le card «Da incassare»/«Da pagare» misurano il residuo non saldato |

---

## 4. Verifiche eseguite, con i numeri

| Controllo | Esito |
|---|---|
| `npx tsc --noEmit` | pulito |
| `npm test -- --run` | **1383 verdi** su 104 file |
| `npm run build` | **exit 0**, zero errori |
| `npm run test:integration` | 388 verdi, **30 rossi in 7 file** |
| Le tre proiezioni | **9010 = 9010 = 9010** |
| Verifica visiva | 8 funzioni su 8 confermate a schermo |

I **30 rossi sono la baseline dichiarata a inizio onda**: preesistono, nascono da
due conti rinominati da un altro branch, e **non sono cresciuti di uno**. Se
qualcuno li vede per la prima volta, non sono una regressione.

---

## 5. Cosa resta aperto

### Decisioni immediate

1. **Merge del branch** — pronto e verificato, non fatto perché è una scelta del
   committente.
2. **La quinta card va a capo da sola** sullo scadenzario (griglia a 4 colonne,
   card a 5). Cosmetico.
3. **Spegnere l'ambiente di verifica** (§7).

### I difetti veri, in ordine di quanto fanno male

**① Registrare un pagamento non crea il movimento contabile.**
`POST /api/scadenzario/[id]/pagamenti` scrive `SchedulePayment` e cambia stato,
ma nessun `JournalEntry`. Paghi Metro 780 € in contanti, la scadenza diventa
«Pagata», e in prima nota non esiste alcuna uscita: il saldo di cassa non scende
e il costo non entra nel conto economico. Ora almeno si vede — è la card «Pagate
senza movimento». **Non chiuso perché serve decidere su quale conto e quale
registro scrivere il movimento: è una scelta contabile, non tecnica.**

**② Il suggeritore crea regole che scattano una volta sola.**
`proposals/route.ts:35` raggruppa per `counterpartName`, il motore
(`recategorize/route.ts:81-85`) aggancia **solo** `description`. La regola nata
da una proposta categorizza i movimenti passati per id e poi non aggancia più
nulla. Peggiora nel tempo, e insieme alla barra del tasso di categorizzazione fa
sembrare colpa dell'utente un difetto del sistema. Tre strade possibili
(cambiare il suggeritore / cambiare il motore / avvisare), la seconda cambia il
comportamento di tutte le regole esistenti: **va scelta, non improvvisata**.
*Diagnosi rapida senza query*: nel dialogo delle proposte l'evidenziazione gialla
non evidenzia nulla esattamente sulle proposte che non funzioneranno.

**③ «Non categorizzato» misura due assi diversi.**
Il filtro della lista usa `budgetCategoryId` (colonna `@deprecated`), il KPI usa
`accountId` (l'asse vivo). Barra e filtro possono dare numeri diversi sugli
stessi movimenti. **Da chiudere insieme a ②: è lo stesso tema.**

**④ Il pannello «Come nasce la previsione» elenca voci che il totale non conta.**
`forecast/route.ts:158` costruisce l'elenco da `flussiBase`, cioè **prima** che
`proietta()` tolga i doppioni. Il numero è giusto, la spiegazione no — dentro un
pannello che esiste solo per spiegare. Caso stretto: si presenta quando
`prossimaGenerazione` di una ricorrenza è rimasta indietro.

**⑤ Due definizioni di «oggi» nella stessa richiesta.**
`forecast/route.ts:81` usa `startOfDay(new Date())` (mezzanotte **del server**,
UTC in produzione) mentre `leggiFlussi` usa `giornoCorrente()` (giorno civile
**di Roma**). Fra le 00:00 e le 02:00 italiane il server è ancora al giorno
prima: i movimenti di oggi vengono contati **due volte**. Rimedio:
`giornoCorrente()` anche lì.

**⑥ Il numero di distinta aiuta ma non decide.**
Nello scenario ambiguo il bonus porta il punteggio da 0,76 a **0,86**, sotto la
soglia di abbinamento automatico (**0,90**). Sposta da «nessuna proposta» a «da
rivedere». L'aiuto scritto nel form dice esattamente questo, quindi non è una
promessa tradita — ma non risolve il caso da solo.

### Minori, tutti nel backlog

Barra del tasso senza gestione errore · due `count` non transazionali · giudizio
muto se il summary fallisce · rotta `/anteprima` senza test permanenti · debito
minore del riordino previsionale · `interoDaUrl` non limita ai bound · mock di
`router.replace` da estendere · indentazione JSX · sezione P4 che dichiara venti
voci elencandone diciannove (preesistente, segnalata invece che indovinata).

### Due esposizioni, non difetti

Due componenti client tirano `@prisma/client` nel bundle del browser
(`UserForm.tsx` → `utils/username.ts`; `MovimentiClient`/`MovimentiTable` →
`prima-nota-utils.ts` → `money.ts:2`). Preesistenti, innocue oggi perché quella
build browser è inerte. `money.ts` è il ponte da cui entra in ogni pagina che
tocca importi: se acquisisse un import che trascina `pg`, la build si
spaccherebbe su mezza applicazione.

---

## 6. Decisioni prese, da non ri-litigare

- **Le card di tesoreria restano ancorate a oggi** anche quando la finestra del
  grafico scorre nel passato: saldo, scaduto e totali rispondono a «come sto
  adesso», non «cosa c'era nella finestra».
- **`dal = oggi + ancora`, `al = oggi + durata`.** Non `al = dal + durata`,
  altrimenti «Storico 30gg + Prev. 90gg» darebbe solo 60 giorni di futuro.
- **Il giudizio sul fornitore poggia sulla sola mediana.** `paymentTermsDays`
  (fattura→scadenza) e il ritardo (oltre la scadenza) misurano assi diversi:
  sottrarli non produce una quantità dotata di significato.
- **L'anteprima delle regole esclude i cancellati** anche se il motore non lo fa:
  mostrare righe che l'utente non vede da nessuna parte è peggio che divergere.
- **`RecurringExpense` e `Recurrence` restano due modelli disgiunti**, con la
  sovrapposizione risolta in lettura. Quale dei due sopravvive va deciso **prima
  dell'Onda 5** (raccomandazione: `Recurrence`, perché genera scadenze vere e
  quindi riconciliabili).
- **Il soft delete è garantito dall'estensione Prisma** (`src/lib/prisma.ts`),
  che inietta `deletedAt: null` in ogni lettura dei modelli elencati. Non serve
  filtrarlo a mano, e un commento che diceva il contrario è stato corretto.

---

## 7. Ambiente di verifica visiva

Creato per guardare le pagine con dati veri. **Ancora in piedi** al momento della
scrittura.

| | |
|---|---|
| Database | `weiss_visual_onda1` su `postgresql://nicolascarpa@127.0.0.1:5433` |
| Server dev | `http://localhost:3000` |
| Amministratore | `admin@weisscafe.it` / `VisualOnda1!` |

Dati seminati: 50 movimenti (10 senza conto → tasso 80%), saldo iniziale 24.000,
soglia di liquidità **12.000** (diversa dal default, apposta), 10 scadenze (1
scaduta da 22 giorni, 5 pagate senza movimento), un fornitore con 4 pagamenti in
ritardo di 11 giorni, **zero regole e zero ricorrenze** per vedere gli stati
vuoti.

> ⚠️ **Il `.env` del worktree punta alla produzione Supabase.** Il server dev va
> avviato passando la `DATABASE_URL` locale **inline nel comando**, mai
> esportata. Non eseguire mai migrazioni verso quell'host.

Per spegnerlo: terminare il processo `next dev` sulla 3000 ed eventualmente
`DROP DATABASE weiss_visual_onda1`.

---

## 8. Trappole d'ambiente

- **Node 22 obbligatorio.** In questa shell `nvm use` non è disponibile: anteporre
  `PATH="/Users/nicolascarpa/.nvm/versions/node/v22.22.0/bin:$PATH"` ai comandi
  npm/npx. In una shell normale, `nvm use 22 &&` sulla stessa riga.
- **Test d'integrazione**: serve `TEST_DB_SUFFIX=onda1b`, altrimenti si distrugge
  il database di un'altra copia di lavoro.
- **`psql`**: serve libpq — `PATH="/opt/homebrew/opt/libpq/bin:$PATH"`. Il ruolo
  sul locale è `nicolascarpa`, non `postgres`.
- **Mai `git stash`**: la pila è condivisa fra i worktree.
- **Playwright è un'istanza sola**, condivisa con la sessione dell'utente:
  navigarla gli sposta la scheda sotto le mani. Chiedere prima.
- **`npm run build` non va mai messo in pipe** se l'esito conta: l'exit code
  diventa quello di `tail` e una build rossa si legge verde. Redirigere su file e
  leggere `$?`. **È successo davvero durante quest'onda.**

---

## 9. Lezioni di metodo, pagate care

**La build va eseguita.** Un componente `'use client'` che importa una costante
da un modulo che carica Prisma trascina il driver PostgreSQL nel browser e rompe
la compilazione. `tsc` non se ne accorge (i tipi sono giusti), i test nemmeno
(girano in Node). **Quindici revisioni per-task non l'hanno vista perché il
difetto non è nel diff**: la riga aggiunta era irreprensibile, il problema stava
nella chiusura transitiva di quell'import. Ora `import 'server-only'` sui moduli
server rende quella classe *impossibile* invece che *rilevabile*.

**Un divieto senza alternativa produce duplicazione.** «Usa la costante, non il
numero» ha prodotto due copie dei valori, perché la costante viveva in un modulo
che parla col database. Il percorso praticabile è un modulo `*-costanti.ts` a
zero import, ri-esportato dall'originale: `stima-costanti.ts` e
`schedule-match-costanti.ts` sono i due precedenti.

**Chiedere valori, non spunte.** Gli implementatori dichiaravano verifiche non
fatte («banda ambra solo quando necessario» mentre compariva sempre). Chiedere
numeri e valori intermedi delle condizioni ha chiuso il problema.

**Guardare le pagine.** Dieci task su quindici avevano effetti solo a schermo e
nessuno li aveva aperti. La verifica visiva finale non ha trovato difetti
nell'onda, ma **due difetti preesistenti che nessuno aveva mai visto** — uno «0»
sul cruscotto da gennaio e due card che contavano una cosa diversa da quella che
dichiaravano.

**Verificare il brief contro il codice prima di dispacciarlo.** Su quindici task,
dieci volte il difetto era nel mio brief e non nell'esecuzione: aritmetiche
sbagliate, insiemi di candidati errati, funzionalità già esistenti che avrei
fatto duplicare, un percorso indicato all'utente che non esiste.

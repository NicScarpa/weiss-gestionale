# W5-F2 — Ripartizione dei costi fra conti e memoria fornitore-prodotto

**Agente:** F2-ALLOCATION · **Data:** 2026-08-08 · **Branch:** `audit-w5/f2-allocation` (da `main`, HEAD `bc4841b`)
**Scope:** `src/lib/services/allocation-service.ts` e tutto ciò che lo usa (split manuale, ereditarietà
pro-quota alla riconciliazione, undo), la memoria fornitore-prodotto (`SupplierProductAccount`,
`src/lib/line-categorization/index.ts`, `PATCH /api/invoices/[id]/righe-conti`), e il punto in cui questi
numeri entrano — o non entrano — nel budget.
**Metodo:** sola lettura. Nessuna query al database, né di produzione né locale. Dove ho verificato un
calcolo l'ho fatto rieseguendo la funzione così com'è scritta, su numeri inventati: gli esempi in euro
qui sotto sono riproducibili senza toccare dati veri.
**Nota:** questo è un audit, non una correzione. Non ho modificato una riga di codice.

---

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|-----------|--------|
| F2-ALL-001 | P1 | Certa | Una proposta dell'AI mai confermata da nessuno riscrive il conto di un pagamento vero, e il budget ci manda sopra l'intero importo |
| F2-ALL-002 | P1 | Certa | "Suddiviso su 2 conti" non suddivide niente: nei report l'intera cifra resta su un conto solo |
| F2-ALL-003 | P2 | Certa | La ripartizione può creare denaro: 731,34 € ripartiti diventano 731,37 € |
| F2-ALL-004 | P2 | Certa | Le proporzioni sono calcolate al netto dell'IVA su un importo pagato lordo: 30 € sul conto sbagliato su una fattura da 1.284 € |
| F2-ALL-005 | P2 | Certa | Due suddivisioni contemporanee sullo stesso movimento si sommano invece di sostituirsi |
| F2-ALL-006 | P2 | Certa | La memoria riconosce un prodotto dal codice articolo senza verificare che sia lo stesso prodotto |
| F2-ALL-007 | P2 | Certa | Una memoria sbagliata è per sempre: non c'è nessuna schermata per vederla o cancellarla |
| F2-ALL-008 | P2 | Certa | "Conferma tutte" non insegna niente alla memoria: l'AI ricomincia da capo a ogni fattura |
| F2-ALL-009 | P2 | Certa | Modificando il movimento si può cambiare il conto scavalcando la suddivisione (le altre due strade lo vietano) |
| F2-ALL-010 | P3 | Certa | Un doppio import simultaneo lascia la fattura categorizzata a metà, e da lì la ripartizione non parte più |
| F2-ALL-011 | P3 | Certa | Il contatore `conferme` viene scritto e non è mai letto da nessuno |
| F2-ALL-012 | P3 | Certa | Una conferma successiva può cancellare il codice articolo memorizzato |
| F2-ALL-013 | P3 | Certa | Nessun test di concorrenza e nessun test su database reale per queste due aree |

**Conteggio:** 2×P1 · 7×P2 · 4×P3. Nessun P0.

---

## F2-ALL-001 · P1 · Una proposta dell'AI mai confermata riscrive il conto di un pagamento vero

**Dove:** `src/lib/services/schedule-reconciliation-service.ts:102-105` · `src/lib/services/allocation-service.ts:80-90` · `src/lib/saldi.ts:339-350`

Quando si riconcilia un pagamento con la scadenza di una fattura, il sistema legge come sono state
imputate le righe di quella fattura e ripartisce il pagamento in proporzione. La lettura è questa:

```ts
const imputazioni = await tx.invoiceLineAccount.findMany({
  where: { invoiceId },
  select: { accountId: true, importo: true },
})
```

Manca il filtro sullo stato. Le righe della fattura possono essere `'confermata'` (qualcuno le ha
guardate) oppure `'proposta'` — cioè un'ipotesi che l'AI ha scritto da sola all'import, quella che
nell'interfaccia compare in giallo e che nessuno ha ancora approvato. Qui contano uguale.

Non finisce lì. Subito dopo, `aggiornaContoDominante` prende la fetta più grossa e **riscrive il conto
del movimento**:

```ts
await tx.journalEntry.update({
  where: { id: journalEntryId },
  data: { accountId: dominante.accountId, budgetCategoryId: …, categorizationSource: 'split' },
})
```

E il budget legge esattamente quel conto, con l'importo intero del movimento (`saldi.ts:339`,
`movimentiPerContoEMese`, che raggruppa per `accountId` sommando `debitAmount`/`creditAmount`).

**Cosa succede in pratica.** Arriva la fattura di un fornitore misto da 1.200 €. L'AI ipotizza: 700 €
"Detersivi e pulizia", 500 € "Alimentari". Nessuno apre la fattura per controllare. Due settimane dopo
si riconcilia il bonifico da 1.200 € con la scadenza. Da quel momento il movimento risulta imputato a
"Detersivi e pulizia" — e nel confronto budget quel conto si prende **tutti e 1.200 €**, alimentari
compresi. Il conto che l'utente (o una regola dello scadenzario) aveva scelto per quel movimento viene
sovrascritto senza avviso: il motore delle regole scrive il movimento con
`categorizationSource: 'rule'` e il conto configurato dal titolare (`src/lib/schedule-rules/engine.ts:323`),
la riconciliazione lo sostituisce con quello dedotto dall'AI.

L'unico caso in cui il sistema si ferma è se il movimento ha già una suddivisione **manuale**
(`schedule-reconciliation-service.ts:116-119`, «le fette manuali vincono sempre»). Una semplice
categorizzazione manuale del movimento, senza suddivisione, non lo protegge.

**Verifica:** importare una fattura con `ANTHROPIC_API_KEY` configurata, non confermare nessuna riga,
riconciliare il pagamento, e rileggere `accountId` e `categorizationSource` del movimento.

**Nota:** l'ereditarietà si astiene se non tutte le righe hanno un'imputazione
(`imputazioni.length < invoice.lineItems.length`), ma quel controllo conta le righe, non ne guarda lo
stato: una fattura interamente "gialla" lo supera.

---

## F2-ALL-002 · P1 · "Suddiviso su 2 conti" non suddivide niente nei report

**Dove:** `src/lib/saldi.ts:339-350` · `src/lib/budget/category-aggregator.ts:18-32` · `src/components/prima-nota/movimenti/MovimentiTable.tsx:225-231`

Le fette di ripartizione (`journal_entry_allocations`) oggi non sono lette da nessun report. Il
confronto budget parte da `movimentiPerContoEMese`, che raggruppa i movimenti per `accountId` e somma
l'importo pieno. Le fette compaiono solo in tre posti: il badge "Suddiviso (N)" nell'elenco dei
movimenti, il dialogo di modifica, e il blocco che impedisce di cancellare una chiusura di cassa.

**Cosa succede in pratica.** Il titolare apre un pagamento da 1.000 €, lo suddivide in 700 €
"Alimentari" e 300 € "Pulizie", salva, e vede il badge "Suddiviso (2)". Nel confronto budget quel mese
Alimentari mostra **1.000 €** e Pulizie **0 €**: l'unico effetto reale della suddivisione è di aver
spostato il movimento intero sul conto della fetta più grossa.

Questo **è documentato** come confine voluto — `docs/superpowers/specs/2026-08-05-allocation-design.md`
rimanda a una "futura fase report" con un helper `getContiEffettivi` che oggi non esiste. Lo segno
comunque come P1 perché nell'interfaccia non c'è nulla che lo dica, e la distanza fra ciò che il
titolare crede di aver fatto e ciò che i numeri dicono è l'intero importo del movimento. Finché la fase
report non arriva, la suddivisione andrebbe presentata per quello che è: una scelta del conto
principale con una nota di dettaglio.

---

## F2-ALL-003 · P2 · La ripartizione può creare denaro

**Dove:** `src/lib/services/allocation-service.ts:17-30`

Il commento sopra la funzione promette: «la somma restituita è SEMPRE esattamente la quota». Non è
vero. L'ultima fetta riceve il resto (`residuo`), ma se il resto è negativo — perché gli arrotondamenti
delle fette precedenti hanno già consumato più della quota — la riga `if (centesimi > 0)` lo butta via
invece di sottrarlo. La somma allora **supera** la quota.

Ho rieseguito la funzione così com'è. Con undici conti di pesi
`835,90 · 830,73 · 806,77 · 719,39 · 694,60 · 547,51 · 401,33 · 219,16 · 214,38 · 105,97 · 0,01`
e una quota di **731,34 €**, la somma delle fette scritte è **731,37 €**: tre centesimi comparsi dal
nulla, e la fetta da 0,01 € sparita. Lo scarto è sempre in eccesso, mai in difetto — il codice non può
perdere denaro, solo crearne — e cresce con il numero di conti: fino a circa mezzo centesimo per conto.
Serve che l'ultima fetta (la più piccola, perché `calcolaPesiDaRighe` ordina per importo decrescente)
sia minuscola rispetto alle altre: una riga di arrotondamento, un contributo CONAI, un imballo da pochi
centesimi.

Sono cifre irrisorie in sé. Contano per due motivi: il commento dichiara un'invariante che il codice non
mantiene, e sopra quell'invariante sono costruiti i controlli di quadratura altrove (che infatti
tollerano ±0,01 € proprio per compensare).

**Aritmetica in virgola mobile.** Il progetto ha `src/lib/money.ts` come unico modulo per i conti in
denaro (nato in W1, l'unico che usa `decimal.js`). L'allocazione non lo usa: `ripartisciProQuota`,
`calcolaPesiDaRighe` e i controlli di quadratura di `setEntryAllocations` lavorano con i numeri a
virgola mobile di JavaScript, e le somme dei `Decimal` letti dal database passano tutte da `Number()`.

**Verifica:** `ripartisciProQuota` è una funzione pura senza accessi al database — basta chiamarla con i
pesi qui sopra e sommare il risultato.

---

## F2-ALL-004 · P2 · Le proporzioni sono al netto dell'IVA, l'importo pagato è lordo

**Dove:** `src/lib/line-categorization/index.ts:102` e `:176` · `src/app/api/invoices/[id]/righe-conti/route.ts:108` · `src/lib/services/schedule-reconciliation-service.ts:146-149`

I pesi della ripartizione sono i `PrezzoTotale` delle righe della fattura, cioè **imponibili**, IVA
esclusa. La quota da ripartire è invece l'importo del bonifico, IVA inclusa. Con aliquote diverse sulle
righe le proporzioni non tornano.

**Esempio.** Fattura con due righe: alimentari 1.000 € + IVA 4% = 1.040 €; detersivi 200 € + IVA 22% =
244 €. Totale pagato 1.284 €. La ripartizione usa i pesi 1.000 e 200, quindi assegna
**1.070,00 € agli alimentari e 214,00 € ai detersivi**. La verità è 1.040 € e 244 €: **30 € finiti sul
conto sbagliato**, il 2,3% della fattura. Su una fattura di sole bevande e detersivi lo scarto è più
marcato ancora.

Il documento di design elenca fra i rischi «somma righe ≠ netAmount (sconti/abbuoni)», ma la differenza
di aliquota non è nominata e non c'è normalizzazione.

---

## F2-ALL-005 · P2 · Due suddivisioni contemporanee si sommano invece di sostituirsi

**Dove:** `src/lib/services/allocation-service.ts:115-167`

`setEntryAllocations` funziona come una sostituzione: cancella le fette manuali e riscrive le nuove. Ma
tutti i controlli — esistenza del movimento, somma delle fette già ereditate, validità dei conti — sono
fatti **fuori** dalla transazione, e dentro la transazione non c'è nessun blocco sulla riga del
movimento. È esattamente la classe di difetti corretta in W1 per la doppia riconciliazione: lì il
servizio blocca il movimento (`bloccaMovimento`, con `SELECT … FOR UPDATE`), qui no.

**Cosa succede in pratica.** Due richieste arrivano insieme sullo stesso movimento da 1.000 € (due
schede del browser, due utenti, o un client che ritenta). Entrambe cancellano — e non trovano niente,
perché nessuna delle due vede ancora le righe dell'altra — poi entrambe scrivono le loro tre fette.
Risultato: **sei fette per 2.000 € su un movimento da 1.000 €**, cioè l'invariante che tutto il modulo
difende. Il controllo `somma + sommaEreditate > importoUtile` non se ne accorge, perché somma solo le
fette di origine `'ereditata'`.

Allo stesso modo, una riconciliazione che sta scrivendo fette ereditate in quel momento non viene vista
dal controllo, che ha letto il totale prima di aprire la transazione.

Il pulsante di salvataggio del dialogo è disabilitato durante l'invio
(`SplitEntryDialog.tsx:358-359`), quindi il doppio clic è coperto: restano le due schede, i due utenti e
le chiamate dirette all'API.

**Verifica:** due `PUT /api/prima-nota/[id]/suddivisione` lanciate insieme sullo stesso movimento, poi
contare le righe in `journal_entry_allocations`.

---

## F2-ALL-006 · P2 · La memoria riconosce il prodotto dal codice articolo senza verificare che sia lo stesso prodotto

**Dove:** `src/lib/line-categorization/index.ts:79-82` · `src/lib/sdi/parser.ts:403-414`

La memoria è indicizzata sul **nome normalizzato** del prodotto (`@@unique(venueId, supplierId,
nomeNormalizzato)`), ma la ricerca prova **prima** il codice articolo:

```ts
const memoriaPerCodice = riga.codiceArticolo
  ? memorie.find((m) => m.codiceArticolo && m.codiceArticolo === riga.codiceArticolo)
  : undefined
const memoria = memoriaPerCodice ?? memorie.find((m) => m.nomeNormalizzato === nomeNormalizzato)
```

Il codice articolo non è unico in tabella: se due prodotti diversi dello stesso fornitore portano lo
stesso valore, `find` restituisce la prima riga che il database gli passa — un ordine arbitrario. E il
match per codice vince **anche quando esiste una memoria esatta per quel nome**. Il codice, poi, è preso
dal parser come il **primo** blocco `CodiceArticolo` della riga, qualunque sia il `CodiceTipo`: EAN,
codice interno del fornitore, codice cliente, indifferentemente.

**Cosa succede in pratica.** Un fornitore che compila `CodiceValore` con un progressivo o con un codice
di gruppo uguale per molte righe fa collassare tutti quei prodotti su una sola memoria: il detersivo
viene imputato al conto del pane. E siccome le righe risolte dalla memoria vengono scritte direttamente
come **`'confermata'`** (`index.ts:95-106`), quell'imputazione non compare fra le cose da rivedere.

Non ho potuto provare su fatture vere che un fornitore usi codici ripetuti — è la premessa del
problema, non il problema. Il difetto strutturale è certo: nulla verifica che il codice identifichi lo
stesso prodotto.

---

## F2-ALL-007 · P2 · Una memoria sbagliata è per sempre

**Dove:** `src/app/api/invoices/[id]/righe-conti/route.ts:136-163` (unico punto che scrive) · nessuna schermata la legge

Ho cercato in tutta l'applicazione: `SupplierProductAccount` è scritta in un solo punto e non esiste
nessuna pagina, elenco o API che la mostri, la modifichi o la cancelli. La si alimenta e basta.

**Cosa succede in pratica.** Un giorno qualcuno conferma per errore "Farina 00 kg 25" sul conto
"Attrezzature". Da quel momento, a ogni fattura di quel fornitore, la riga della farina viene scritta
automaticamente come **confermata** sul conto sbagliato — verde, non gialla, quindi fuori da qualunque
lista di controllo — e nessuno se ne accorge finché non guarda i costi per conto a fine anno. L'unico
modo di correggere è ritrovare una fattura con quella riga e riconfermarla a mano sul conto giusto.

L'unico contrappeso è l'AI, che può rimettere in dubbio una memoria (`dubbioSuMemoria`) riportando la
riga a "proposta". È un contrappeso probabilistico, non un rimedio: se `ANTHROPIC_API_KEY` non è
configurata (`index.ts:109-112`) la memoria non viene messa in discussione da nessuno.

---

## F2-ALL-008 · P2 · "Conferma tutte" non insegna niente alla memoria

**Dove:** `src/app/api/invoices/[id]/righe-conti/route.ts:167-177`

La memoria si scrive solo nel ramo che conferma le righe una per una. Il ramo `confermaTutte`, che
approva in blocco tutte le proposte dell'AI, fa un `updateMany` sullo stato e non tocca
`SupplierProductAccount`.

**Cosa succede in pratica.** Il titolare importa la fattura del solito fornitore, l'AI propone le
imputazioni giuste, lui clicca "Conferma tutte". Il mese dopo, stessa fattura, stessi prodotti: nessuna
memoria è stata creata, quindi tutte le righe ripassano dall'AI (con la relativa chiamata a pagamento) e
ricompaiono gialle da confermare. Il percorso più comodo dell'interfaccia è anche l'unico che non
insegna niente: la memoria si costruisce solo per chi conferma riga per riga.

---

## F2-ALL-009 · P2 · Modificando il movimento si può cambiare il conto scavalcando la suddivisione

**Dove:** `src/app/api/prima-nota/[id]/route.ts:135-146` · a confronto con `[id]/categorize/route.ts:40-52` e `recategorize/route.ts:44-51`

Due strade su tre proteggono la suddivisione: la ricategorizzazione singola rifiuta il movimento se ha
delle fette, e quella massiva li esclude a monte (`allocations: { none: {} }`). La modifica del
movimento no: `PUT /api/prima-nota/[id]` scrive `accountId` senza guardare le fette e senza toccare
`categorizationSource`.

**Cosa succede in pratica.** Un movimento suddiviso 700/300 viene aperto in modifica e gli si cambia il
conto: adesso il movimento è imputato a un conto che non corrisponde a nessuna delle sue fette, e
continua a dichiararsi `categorizationSource: 'split'`. Alla prima riconciliazione successiva il conto
dominante lo riscrive di nuovo. Gli importi non cambiano — cambia il conto su cui il budget li conta.

L'importo del movimento, invece, non è modificabile da questa strada (la `PUT` non accetta
`debitAmount`/`creditAmount`): la domanda «se l'importo cambia dopo la ripartizione, le fette si
adeguano?» non si pone, perché l'importo non cambia. Se un giorno diventasse modificabile, non esiste
niente che ricalcoli o invalidi le fette.

---

## F2-ALL-010 · P3 · Un doppio import simultaneo lascia la fattura categorizzata a metà

**Dove:** `src/lib/line-categorization/index.ts:92-107` e `:168-181`

Le righe si scrivono con `create`, non con `upsert`. Se la stessa fattura viene categorizzata due volte
in parallelo (doppio invio dell'import arrivato insieme), la seconda va in violazione di unicità su
`(invoiceId, numeroLinea)`, l'eccezione risale al `try/catch` generale e **interrompe il ciclo**: le
righe successive non vengono mai scritte. La funzione non lancia (è best-effort per scelta) e non
registra niente di visibile all'utente.

La fattura resta categorizzata a metà, e da lì la ripartizione pro-quota non parte più: il controllo
`imputazioni.length < invoice.lineItems.length` la blocca per sempre, perché non esiste nessun percorso
che riprovi la categorizzazione di una fattura già importata.

---

## F2-ALL-011 · P3 · Il contatore `conferme` non è letto da nessuno

`SupplierProductAccount.conferme` viene inizializzato a 1 e incrementato a ogni conferma
(`righe-conti/route.ts:152` e `:157`), e non compare in nessun altro punto del codice. Nessuna soglia,
nessun ordinamento, nessuna preferenza fra memorie: una mappatura confermata trenta volte e una
confermata per sbaglio una volta sola valgono identico. Va notato che il contatore cresce anche quando
l'utente **cambia** il conto: conta le conferme, non l'accordo.

---

## F2-ALL-012 · P3 · Una conferma successiva può cancellare il codice articolo memorizzato

**Dove:** `src/app/api/invoices/[id]/righe-conti/route.ts:154-158`

Il ramo `update` dell'upsert scrive `codiceArticolo: linea.codiceArticolo ?? null`. Se lo stesso
prodotto viene riconfermato partendo da una fattura in cui quella riga non porta il codice articolo, il
codice memorizzato in precedenza viene azzerato, e da lì in avanti il riconoscimento per codice non
funziona più per quel prodotto.

---

## F2-ALL-013 · P3 · Copertura di test

I test unitari ci sono e sono scritti bene: 307 righe su `allocation-service`, 386 su
`line-categorization`, 353 sulla rotta delle righe fattura, 217 sulla rotta della suddivisione. Coprono
gli esiti principali, i casi di rifiuto, lo scoping per sede della memoria e l'anti-allucinazione
dell'AI. Quello che non coprono:

- **Concorrenza:** nessun test con due operazioni simultanee, in nessuna delle due aree. Tutti i test
  usano un Prisma finto, quindi non potrebbero coglierla nemmeno volendo (F2-ALL-005).
- **Database reale:** non esiste nessun `.itest.ts` per queste aree. Le transazioni, i vincoli di
  unicità e il comportamento dei `Decimal` non sono mai esercitati davvero.
- **Arrotondamenti:** il test «gli arrotondamenti quadrano sull'ultima fetta: la somma è sempre la
  quota» (`allocation-service.test.ts:46`) verifica un solo caso, e quel caso quadra. Bastano undici
  pesi con una coda minuscola per farlo cadere (F2-ALL-003).
- **Stato delle righe nell'ereditarietà:** nessun test distingue una riga confermata da una proposta
  (F2-ALL-001).

---

## Ciò che è fatto bene

- **Cancellazioni logiche rispettate.** `setEntryAllocations` filtra `deletedAt: null`, e in tutta
  l'area non c'è una riga di SQL grezzo che possa aggirare l'estensione introdotta in W4.
- **Permessi e sede.** Entrambe le rotte richiedono `admin` o `manager` e verificano che il documento
  appartenga alla sede della sessione, prima di qualunque scrittura.
- **La memoria è per sede, non globale**, con il ragionamento scritto nel codice e un test dedicato:
  l'anagrafica fornitori è condivisa, la memoria no.
- **L'annullo della riconciliazione ritira le fette prima di cancellare la riconciliazione**, perché la
  chiave esterna è `onDelete: SetNull` e l'ordine inverso lascerebbe fette orfane. È il tipo di
  attenzione che di solito manca.
- **L'AI non è creduta sulla parola:** conti inesistenti e numeri di riga inventati vengono scartati con
  un log, e una proposta non sovrascrive mai una riga già presente.
- **Il tetto sulla capienza del movimento** nell'ereditarietà pro-quota (una fattura riconciliata in più
  tranche non può far sforare il movimento) è un controllo che qualcuno ha aggiunto pensandoci.

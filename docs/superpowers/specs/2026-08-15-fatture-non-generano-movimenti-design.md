# Un documento fiscale non genera denaro

Il 15 agosto 2026 il proprietario ha aperto la prima nota, registro banca, e ha
trovato un'uscita di 92,60 € verso TIM. In banca quel movimento non c'era. Non
era un difetto di calcolo: il gestionale l'aveva scritto lui, perché qualcuno
aveva premuto «Registra in Prima Nota» sulla fattura.

Questa spec toglie quella possibilità. L'invariante che vuole stabilire è una
frase sola:

> **Ogni riga di prima nota corrisponde a un movimento di denaro realmente
> avvenuto. I documenti si associano ai movimenti, mai il contrario.**

Il lavoro è piccolo perché la macchina giusta esiste già: la riconciliazione
assistita (`docs/superpowers/specs/2026-08-13-riconciliazione-assistita-design.md`,
Fase A1 in produzione dal 14 agosto) sa legare un movimento a una scadenza,
generare il pagamento ed ereditare le imputazioni della fattura. Quello che
manca non è un motore: è togliere di mezzo la scorciatoia che lo aggira.

---

## Il difetto, in concreto

`POST /api/invoices/[id]/record` (`src/app/api/invoices/[id]/record/route.ts:126-147`)
crea un `JournalEntry` così:

```ts
registerType: 'BANK',
date: invoice.invoiceDate,          // la data della FATTURA
creditAmount: invoice.totalAmount,  // avere = uscita di banca
counterpartId: bankAccount.id,      // conto BANCA di sistema
```

Nessun legame con un `BankTransaction`. E i saldi (`src/lib/saldi.ts`) escludono
solo i movimenti cancellati e quelli nascosti, **non** quelli con
`verified: false`: la riga sposta davvero il saldo della banca.

Sono tre errori sovrapposti.

1. **L'importo.** Denaro segnato come uscito da un conto in cui non si è mosso.
2. **La data.** È quella della fattura, non del pagamento: il saldo è sbagliato
   dall'emissione fino al pagamento vero, anche quando il pagamento poi avviene.
3. **Il doppio conteggio, differito.** Quando il movimento vero arriva
   dall'open banking, `src/app/api/prima-nota/import/route.ts:38-45` prende ogni
   transazione con `matchedEntryId: null` e ne crea un movimento nuovo. Quello
   nato dalla fattura non è legato a nulla, quindi non viene riconosciuto: lo
   stesso euro conta due volte.

Il codice lo sapeva già a metà. La stessa rotta, alle righe 66-83, si rifiuta di
registrare se sullo scadenzario risultano pagamenti: *«Registrarla anche in prima
nota conterebbe l'uscita due volte»*. La collisione era dichiarata, ma sorvegliata
su un lato solo dei tre.

### Perché il percorso corretto non perde nulla

Il dubbio legittimo era: togliendo la scorciatoia si perde la categorizzazione del
costo? No. Quando un movimento viene riconciliato a una scadenza nata da fattura,
`ereditaFetteDaFattura` (`src/lib/services/schedule-reconciliation-service.ts:854`)
trasferisce al movimento le imputazioni di riga della fattura, pro quota. Conto e
centro di costo arrivano da lì.

E lo stato della fattura non dipendeva comunque dal bottone: `PAID` lo scrive la
scadenza quando è saldata (`src/lib/scadenzario/stato-schedule.ts:274`).

---

## Le sei decisioni prese

### 1. Da un documento fiscale non nasce mai un movimento bancario

Vale per fatture e note di credito, senza eccezioni. La banca si muove solo da
movimenti importati — open banking o CSV — e il documento vi si associa.

*Costo se sbagliata:* per registrare una fattura pagata bisogna prima avere
l'estratto conto. È il prezzo dell'invariante, e per la banca è quello giusto:
il movimento esiste o non esiste, e il gestionale non è la fonte che lo decide.

### 2. Per il contante, una scorciatoia guidata che passa comunque dalla scadenza

Per la cassa non esiste un flusso da importare: qualcuno il movimento deve
crearlo. La scorciatoia rimane, ma non salta nulla — crea un movimento di cassa
**vero**, alla data in cui hai pagato, e lo riconcilia alla scadenza con la
stessa funzione che usa la banca.

*Perché non una porta parallela:* una seconda strada per scrivere in prima nota è
esattamente la forma del difetto che stiamo togliendo. Qui la strada è una sola,
con un involucro più comodo davanti.

*Costo se sbagliata:* l'involucro è codice in più rispetto al puro divieto. Se si
rivelasse inutile si cancella senza toccare il motore.

### 3. Lo stato `RECORDED` sparisce

La scala diventa `IMPORTED → MATCHED → CATEGORIZED → PAID`.

«Registrata» significava «le ho scritto un movimento di banca». Se quel movimento
non nasce più dal documento, lo stato non descrive più niente — e uno stato che
non descrive niente, fra sei mesi, qualcuno lo interpreta.

Non serviva nemmeno a proteggere le fatture dalla cancellazione: quel compito ce
l'ha `checkInvoicesDeletable`, che guarda i pagamenti registrati sulle scadenze.

*Costo se sbagliata:* si perde un gradino intermedio nella lista fatture. Chi
volesse distinguere «già in contabilità» da «solo categorizzata» dovrebbe
guardare le riconciliazioni della scadenza, che è comunque il posto dove quella
verità vive.

### 4. L'azione vive sulla scadenza; la fattura è una facciata

L'oggetto che si salda è la scadenza, non la fattura — è già la posizione della
spec della riconciliazione assistita, e le fatture a più rate la rendono
necessaria.

*Costo se sbagliata:* il dialogo sulla fattura deve risolvere quale rata sta
saldando. Con una rata sola, il caso normale, la scelta non si mostra nemmeno.

### 5. Il dis-abbinamento non cancella il movimento

Annullare una riconciliazione riporta la scadenza a scoperta e lascia il
movimento dov'è: quel movimento dice «di cassa ne è uscita, quel giorno», e il
fatto non dipende da quale documento salda. Se è stato un errore si cancella in
prima nota, dove si cancellano i movimenti.

*Costo se sbagliata:* un movimento di cassa sbagliato sopravvive al suo
dis-abbinamento e va rimosso a mano. Il contrario però ricreerebbe in piccolo il
difetto di partenza — un documento che comanda l'esistenza di un movimento.

### 6. Il movimento di cassa porta il conto della fattura in testata

Nel conto economico «le fette vincono sulla testata»
(`src/lib/report/conto-economico.ts:14-19`): quando le fette esistono, l'`accountId`
di testata viene ignorato. Ma **senza** fette la testata è l'unica fonte.

Una fattura senza imputazione di riga produrrebbe una riconciliazione senza fette,
e il costo sparirebbe dal conto economico. Quindi la testata si valorizza sempre
con il conto della fattura: innocua quando le fette ci sono, indispensabile quando
mancano.

---

## Cosa sparisce

**La rotta e il bottone.** `POST /api/invoices/[id]/record` e la sua cartella;
il bottone «Registra in Prima Nota» (`src/components/invoices/InvoiceDetail.tsx:487-508`),
la sua mutation (`recordInvoice`, righe 136-137 e 310-311) e il badge
«✓ Registrata in Prima Nota» (riga 624).

**Lo stato `RECORDED`** dall'enum `InvoiceStatus` (`prisma/schema.prisma:2697-2703`).
Ricadute censite:

| Punto | Oggi | Dopo |
|---|---|---|
| `statoFatturaNonPagata` (`stato-schedule.ts:236-247`) | scende a `RECORDED` se c'è `journalEntryId`/`recordedAt` | scende a `CATEGORIZED` se c'è `accountId`, poi `MATCHED`, poi `IMPORTED` |
| `STATI_NON_ELIMINABILI` (`bulk-delete/route.ts:18`) | `['RECORDED', 'PAID']` | `['PAID']` |
| `canEdit` (`InvoiceDetail.tsx:415`) | esclude `RECORDED` e `PAID` | esclude `PAID` |
| filtri e selezione (`InvoiceList.tsx:295, 495-496, 555`) | escludono entrambi | escludono `PAID` |
| `isRegistered` (`InvoiceDetailSections.tsx:164`, `invoice-utils.ts:75`) | `RECORDED \|\| PAID` | da rivedere caso per caso |

**Le due colonne** `ElectronicInvoice.journalEntryId` e `recordedAt`, con la
relazione `JournalEntry.electronicInvoice`. Le scriveva solo la rotta eliminata e
le leggeva solo `statoFatturaNonPagata`. Tenerle vuote lascerebbe in piedi proprio
l'attrezzo che la decisione 1 vieta: la possibilità di dire «questa fattura ha
generato questo movimento».

> Attenzione a non confonderle con i `journalEntryId` di
> `src/app/api/invoices/[id]/route.ts:216-229`: quelli vengono da
> `ScheduleReconciliation` — i movimenti **riconciliati**, il percorso sano — e
> restano.

---

## Cosa nasce

### L'azione «Segna come pagata» sulla fattura

Prende il posto del bottone tolto.

1. **Quale rata.** Con una sola scadenza aperta è preselezionata e la scelta non
   si mostra.
2. **Come è stata pagata**, due strade:
   - **Con un movimento già in prima nota.** I candidati li calcola e li motiva
     già `GET /api/scadenzario/[id]/riconciliazioni`, più una ricerca per quando
     la proposta giusta non c'è. Vale per banca e per cassa: né
     `schedule-matcher.ts` né `schedule-reconciliation-service.ts` nominano mai
     `registerType`, quindi il motore è indifferente al registro.
   - **In contanti, movimento non ancora in prima nota.** Chiede data
     (oggi come predefinita) e importo (il residuo come predefinito).
3. Conferma.

Non compare sulle note di credito e sugli altri documenti di rettifica, che non
generano scadenza per costruzione (`TIPI_DOCUMENTO_SENZA_SCADENZA`): riducono il
dovuto, e di quello si occupa `righeDaSottrarreNote`. Né su una fattura senza
scadenze: lì va spiegata come non applicabile, non offerta e poi fatta fallire.

### `POST /api/scadenzario/[id]/paga-in-contanti`

Il caso «movimento esistente» usa `POST /api/scadenzario/[id]/riconciliazioni`,
che esiste già e non si tocca. Il caso contanti ha un endpoint nuovo che, in
**una** transazione:

- crea il `JournalEntry` con `registerType: 'CASH'`, la data indicata, e il verso
  deciso da `toDebitCredit` in base al tipo di scadenza (passiva = uscita) — mai
  scritto a mano: è l'unico posto dove vive la convenzione dare/avere del
  progetto;
- valorizza `accountId` con il conto della fattura (decisione 6);
- risolve il centro di costo con `risolviCentroDiCosto` a partire da quel conto;
- segna `verified: true`: qui non c'è nulla di indovinato, un umano dichiara un
  fatto;
- chiama `reconcileScheduleWithEntry`, che fa il resto — `SchedulePayment`,
  `ScheduleReconciliation`, eredità pro-quota delle fette, riallineamento della
  fattura a `PAID`.

Autorizzazione e forma come le rotte sorelle dello scadenzario: `admin` o
`manager`, che è la regola per i dati finanziari (`src/CLAUDE.md`).

**Cosa non nasce:** nessun motore nuovo, nessuna logica di stato nuova, nessun
secondo modo di scrivere in prima nota. L'endpoint è un involucro sottile attorno
a una funzione che c'è già.

---

## La migrazione

In produzione la fotografia è questa (misurata il 15 agosto 2026): 228 fatture in
tabella, 227 cancellate logicamente e **nessuna** con `journal_entry_id`. Una sola
riga viva: la fattura TIM, `RECORDED`, con `account_id` e `supplier_id`
valorizzati, il cui movimento è già stato cancellato a mano dal proprietario.

Quella riga è oggi in uno stato incoerente — dice «registrata» ma dietro non ha
più nulla — ed è proprio quello stato a impedirne la cancellazione.

L'ordine è obbligato: non si può togliere da un enum un valore ancora in uso.

1. `UPDATE electronic_invoices SET status = 'CATEGORIZED' WHERE status = 'RECORDED'`
   — la regola è quella di `statoFatturaNonPagata`, e la TIM ha `account_id`.
2. Ricreazione dell'enum `InvoiceStatus` senza `RECORDED`: tipo nuovo,
   `ALTER TABLE ... USING`, drop del vecchio, rinomina. Postgres non sa eliminare
   un valore d'enum in altro modo.
3. `ALTER TABLE electronic_invoices DROP COLUMN journal_entry_id, DROP COLUMN recorded_at`.

La migrazione va scritta a mano e applicata con `prisma migrate deploy`: il `.env`
di questa macchina punta alla produzione, quindi nessun comando Prisma che scriva
su database va eseguito in locale contro quella stringa.

---

## Le prove

Oltre agli unit sull'endpoint nuovo — verso dedotto dal tipo di scadenza, testata
di ripiego, `verified: true`, tutto in una transazione sola — tre contano più
delle altre.

**L'invariante, su database vero.** Importare e categorizzare una fattura non deve
muovere di un centesimo né il saldo banca né quello cassa, letti da
`src/lib/saldi.ts`. È il test che, se fosse esistito, avrebbe impedito tutta questa
storia.

**Il ciclo completo, su database vero.** Pagamento in contanti → esiste un
`JournalEntry` in registro `CASH` alla data indicata, la scadenza risulta saldata,
la fattura è `PAID`, le fette sono state ereditate, e il saldo cassa si è mosso
esattamente dell'importo pagato.

**La porta chiusa.** `POST /api/invoices/[id]/record` risponde 404.

I test che difendono l'invariante vanno **visti fallire** sul codice attuale prima
di essere considerati validi: un test che non è mai stato rosso non prova che
morda.

---

## Fuori perimetro

- **La carta di credito.** Resta la fase D della spec della riconciliazione
  assistita: manca il tipo di conto, l'import dei movimenti e l'estratto mensile.
- **Uno stato «Parzialmente pagata»** per le fatture con una rata su due saldata.
  Utile e oggi assente, ma è un'aggiunta, non una conseguenza di questo lavoro.
- **`pagamenti/[id]/esegui` cablato a `registerType: 'BANK'`**, che manda in banca
  anche un pagamento in contanti. È un difetto vero e vicino, ma di un altro
  percorso — quello dei pagamenti programmati — e va corretto separatamente per
  non allargare questa modifica.
- **La riconciliazione a lotti** e il suo motore di proposta: non si toccano.

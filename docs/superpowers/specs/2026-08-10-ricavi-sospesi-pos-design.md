# Imputazione dei ricavi, sospesi e incassi POS — design

**Stato**: **approvata dal committente il 10 agosto 2026**, non ancora eseguita. Nessuna riga di codice, nessuna migrazione. Le decisioni di prodotto sono al §2; le cinque scelte di design proposte dall'agente — le due fasi del transitorio (§6), la forchetta 0,5–2,5 % sulle commissioni dedotte (§4, caso G), il saldo parziale dei sospesi (§3.1), `origine = 'chiusura'` sulle allocazioni (§3.4) e la conservazione di `suspendedAmount`/`posAmount` come totali vincolati (§3.2, §3.3) — sono state approvate insieme alla spec.

**Dipendenza bloccante**: tutto poggia sul **piano dei conti v4**, che non è in produzione (`conti/piano-v4`, migrazioni `20260807000000` e `20260808000000` non applicate). I conti `10.01`, `11.01`, `11.02` e il campo `Account.systemKey` **esistono solo su quel branch**. Vedi §9.

---

## 1. Contesto — cosa non funziona oggi

**Gli incassi non sono imputati a nessun conto di ricavo.** `generateJournalEntriesFromClosure` (`src/lib/closure-journal-entries.ts:128-183`) scrive le uscite con il loro conto (`accountId: expense.accountId`) e gli incassi **senza**. Non è una formula sbagliata: è un campo mai valorizzato.

Conseguenza misurabile: `ricaviNonAttribuiti` (`src/lib/budget/category-aggregator.ts:281`) fa `fatturato delle chiusure − movimenti su conti di ricavo`, e siccome il secondo termine è zero, **vale il fatturato intero**. Il commento nel codice lo dice già: «oggi vale quasi il fatturato intero […] dirlo esplicitamente è l'unico modo perché non sparisca in silenzio».

**`nonReceiptAmount` mescola tre fenomeni diversi.** La formula è `(cashAmount + posAmount) − receiptAmount` (`src/lib/closure-calculations.ts:66-67`). Su una serata con 850 di scontrini, 200 di fatture, 50 di sospesi e 40 di spese pagate in contanti, quel campo vale 110 — che è `+200 di fatture − 50 di sospesi − 40 di spese`. Si chiama «non scontrinato» e chi lo legge intende «non documentato»: due cose diverse, e nessuna delle due è quel numero.

**I sospesi non hanno identità.** `CashStation.suspendedAmount` è un totale giornaliero anonimo. Nessuna scrittura, nessun credito, nessun modo di sapere chi deve cosa: compare nel PDF e nell'Excel della chiusura, e in nient'altro.

**Gli incassi POS non distinguono il terminale.** `CashStation.posAmount` è un numero solo. Con tre provider che accreditano in modi diversi, non è possibile sapere quale accredito chiude quale incasso.

---

## 2. Decisioni del committente (10 agosto 2026)

Riportate come prese, perché il resto del documento le implementa e non le discute.

1. **I corrispettivi sono il fiscalizzato del giorno, ma alimentano cassa e banca, non un conto «corrispettivi» a sé.** Il ricavo contabile si registra **sul denaro entrato**: movimento in ingresso in cassa per il contante, in banca per il POS, entrambi imputati a `10.01`.
2. **Le statistiche di vendita si basano solo sulla chiusura**, alla data in cui la vendita è avvenuta. Sono un piano separato dalla contabilità.
3. **Il sospeso non genera scritture quando nasce.** Quando viene saldato, il denaro entra e va su `10.01` come qualsiasi incasso. Serve un'**anagrafica dei crediti** per sapere chi deve cosa, e il saldo **chiude la partita** aperta.
4. **Eventi e compleanni su conti distinti**: `11.01 Ricavi eventi serali`, `11.02 Ricavi eventi privati e compleanni`. Non sono fuori dai corrispettivi fiscali: solo conti diversi.
5. **L'incasso di una postazione dev'essere spezzabile su più conti**, liberamente, dall'interfaccia della chiusura.
6. **I terminali POS sono parecchi e non coincidono con le postazioni** (su una postazione possono essercene due). Vanno registrati con le loro regole di comportamento e riconciliazione.
7. **Il fondo cassa non si tocca**: è vietato ai ragazzi pagare con il fondo, quindi le spese sono sempre pagate con l'incasso del giorno.
8. **Il compleanno di sabato si fiscalizza sabato**, se viene fiscalizzato.
9. Lo sfasamento di uno o due giorni fra incasso POS e accredito **non è un problema** per la tesoreria, ma il conto transitorio è considerato una buona idea.

**Rimandati esplicitamente**: il budget su base fiscalizzata o incassata; i ricavi e costi non fiscalizzati. Vedi §8.

---

## 3. Modello dati

### 3.1 `SuspendedCredit` — l'anagrafica dei crediti (nuovo)

```prisma
model SuspendedCredit {
  id             String   @id @default(cuid())
  venueId        String   @map("venue_id")
  // Dove è nato: la chiusura del giorno della vendita.
  closureId      String   @map("closure_id")
  stationId      String?  @map("station_id")
  dataGenerazione DateTime @map("data_generazione") @db.Date
  importo        Decimal  @db.Decimal(10, 2)
  // Chi deve: testo libero (un nome scritto la sera) oppure un cliente in anagrafica.
  descrizione    String   @db.VarChar(200)
  customerId     String?  @map("customer_id")
  stato          SuspendedCreditStatus @default(APERTO)
  // Dove è stato saldato: la chiusura del giorno dell'incasso.
  saldoClosureId String?  @map("saldo_closure_id")
  dataSaldo      DateTime? @map("data_saldo") @db.Date
  importoSaldato Decimal   @default(0) @map("importo_saldato") @db.Decimal(10, 2)
  note           String?
  createdById    String?  @map("created_by")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
}

enum SuspendedCreditStatus { APERTO PARZIALE SALDATO ANNULLATO }
```

`CashStation.suspendedAmount` **resta** e non cambia significato: è il totale della postazione, e le voci di questa tabella ne sono il dettaglio. Un saldo parziale è ammesso (`PARZIALE`, `importoSaldato` < `importo`) perché su un conto da 1200 capita che paghino in due volte.

### 3.2 `PosTerminal` — l'anagrafica dei terminali (nuovo)

```prisma
model PosTerminal {
  id                  String   @id @default(cuid())
  venueId             String   @map("venue_id")
  nome                String                        // "Bancone 1", "Palco"
  provider            PosProvider
  modalitaAccredito   PosSettlementMode @map("modalita_accredito")
  // Conto su cui l'incasso resta finché la banca non accredita (fase B).
  transitoryAccountId String?  @map("transitory_account_id")
  // Dove finiscono le commissioni trattenute alla fonte.
  feeAccountId        String?  @map("fee_account_id")
  // Come si riconosce il suo accredito in estratto conto.
  matchPattern        String?  @map("match_pattern") @db.VarChar(200)
  isActive            Boolean  @default(true) @map("is_active")
}

enum PosProvider { WORLDLINE AXERVE SUMUP ALTRO }

enum PosSettlementMode {
  LORDO            // accredita l'intero transato; commissioni su fattura separata (Worldline)
  NETTO_DICHIARATO // accredita il netto e scrive la commissione nella causale (Axerve)
  NETTO_DEDOTTO    // accredita il netto e non dice quanto ha trattenuto (SumUp)
}
```

### 3.3 `CashStationPos` — l'incasso POS per terminale (nuovo)

```prisma
model CashStationPos {
  id         String  @id @default(cuid())
  stationId  String  @map("station_id")
  terminalId String  @map("terminal_id")
  importo    Decimal @db.Decimal(10, 2)

  @@unique([stationId, terminalId])
}
```

**Vincolo**: `Σ CashStationPos.importo == CashStation.posAmount`. `posAmount` resta la fonte per statistiche e quadratura, quindi nulla di esistente cambia comportamento; sotto c'è il dettaglio che serve alla riconciliazione.

### 3.4 L'imputazione a conto: si riusa `JournalEntryAllocation`

Non serve nulla di nuovo. `JournalEntryAllocation` (`prisma/schema.prisma`) ripartisce già un movimento su più conti (`accountId`, `importo`, `origine`), con l'editor di split in uso. La riga di incasso della chiusura nasce **con le sue allocazioni**, con `origine = 'manuale'`.

Serve un solo valore nuovo per `origine`: **`'chiusura'`**, che distingue le fette generate dalla chiusura da quelle disegnate a mano in prima nota. Senza, rigenerare le scritture di una chiusura non saprebbe quali fette può sostituire.

### 3.5 Conti nuovi nel piano v4

Da aggiungere ai patrimoniali di sistema del seed (`prisma/seed.ts:213-217`), che oggi sono tre:

| systemKey | Nome | Tipo | A cosa serve |
|---|---|---|---|
| `POS_WORLDLINE` | POS Worldline da accreditare | ATTIVO | transitorio (fase B) |
| `POS_AXERVE` | POS Axerve da accreditare | ATTIVO | transitorio (fase B) |
| `POS_SUMUP` | POS SumUp da accreditare | ATTIVO | transitorio (fase B) |

Le commissioni hanno già il loro posto: `32.3` del piano v4 (`Commissioni Pagobancomat`, `Commissioni su bonifici`).

---

## 4. Le scritture, caso per caso

Serata di riferimento, una postazione: scontrini **850**, fatture **200**, sospesi **50**, contanti in cassa a fine serata **560**, POS **400**, spese pagate in contanti **40**. Quadra: venduto 1050 = incassato 1000 + sospeso 50; dei 600 contanti incassati, 40 se ne sono andati in spese.

### Caso A — serata normale

| # | Registro | Tipo | Importo | Allocazione |
|---|---|---|---|---|
| 1 | CASH | INCASSO | 600 | `10.01` 600 |
| 2 | CASH | USCITA | 40 | conto di costo della spesa |
| 3 | BANK | INCASSO | 400 | `10.01` 400 |

Ricavo imputato: **1000**, cioè il denaro entrato. I 50 di sospeso non generano nulla (decisione §2.3). Le righe 1 e 2 sono quelle di oggi: **cambia solo che la 1 e la 3 nascono con l'allocazione**.

### Caso B — evento a metà serata

Stessa serata, ma 400 dei 1000 incassati sono di un evento. L'operatore ripartisce in chiusura:

| # | Registro | Importo | Allocazione |
|---|---|---|---|
| 1 | CASH | 600 | `10.01` 400 · `11.01` 200 |
| 3 | BANK | 400 | `10.01` 200 · `11.01` 200 |

La ripartizione è **libera** (decisione §2.5): l'operatore decide gli importi. I progressivi orari (`HourlyPartial.receiptProgressive`, `posProgressive`) possono **proporre** una divisione quando l'evento ha un orario d'inizio, ma è un aiuto facoltativo, non una regola.

### Caso C — il sospeso nasce (sabato)

Fiscalizzato sabato (decisione §2.8): la chiusura di sabato ha già i 1200 nei corrispettivi, quindi **le statistiche di sabato sono giuste senza fare nulla**.

- Nessuna scrittura per il sospeso.
- Si crea un `SuspendedCredit` da 1200, stato `APERTO`, con il nome di chi deve.
- `cashAmount` e `posAmount` di sabato non lo contengono: la cassa quadra.

### Caso D — il sospeso viene saldato (lunedì)

Lunedì entrano 1200 in contanti oltre alle vendite del giorno (500). **Il denaro passa dal cassetto**, quindi la chiusura deve dichiararlo o il conteggio segnala un'eccedenza di 1200.

In chiusura si compila il campo nuovo **«di cui saldo sospesi»**, scegliendo le partite aperte da chiudere:

| # | Registro | Importo | Allocazione |
|---|---|---|---|
| 1 | CASH | 1700 | `10.01` 1700 |

- `cashAmount` = 1700 → la cassa quadra, nessun falso allarme.
- I corrispettivi di lunedì restano **500**: le statistiche di lunedì non contano i 1200 (già contati sabato).
- Il `SuspendedCredit` passa a `SALDATO`, con `saldoClosureId` e `dataSaldo`.
- Il ricavo contabile su `10.01` accoglie i 1200 lunedì: è il criterio per cassa deciso al §2.1.

Se pagano col POS invece che in contanti, identico sulla riga 3.

**Nota su `nonReceiptAmount`**: lunedì varrà 1200, e continuerà a sembrare «incasso non scontrinato». Con il saldo sospesi dichiarato, il campo può finalmente essere corretto — vedi §8.3.

### Caso E — accredito lordo (Worldline)

L'accredito bancario porta l'intero transato. La riga 3 del giorno viene **riconciliata** con il movimento bancario (`BankTransaction.matchedEntryId`, meccanismo esistente): nessuna scrittura aggiuntiva. Le commissioni arrivano separatamente come fattura passiva e seguono la loro strada nello scadenzario, su `32.3`.

### Caso F — accredito netto dichiarato (Axerve)

Causale reale: `Disposizione di giro conto *WEISS SRL … BS 190,00+ COM 1,90-/BENEF/… BS 190,00+ COM 1,90-`, importo accreditato **188,10**, causale bancaria **79**.

Il lordo e la commissione si leggono dalla causale:

```
/BS\s+([\d.]+,\d{2})\+\s+COM\s+([\d.]+,\d{2})-/
```

(prima occorrenza; la seconda è la ripetizione dopo `/BENEF/`). Controllo obbligatorio: `lordo − commissione == importo accreditato`. Se non torna, **non si applica nulla** e la riconciliazione resta manuale.

Alla riconciliazione si genera una riga di costo da **1,90** su `32.3`.

### Caso G — accredito netto non dichiarato (SumUp)

Causale reale: `Bonifico a vs favore *INST 16:40 Sumup Limited 2073980192 SUMUP PID1774208 PAYOUT 070826`, importo **892,22**, causale bancaria **48**. Nessuna traccia del lordo né della commissione, e **il payout può accorpare più giornate**.

Riconciliazione assistita:

1. il sistema cerca fra gli incassi SumUp non ancora accreditati la combinazione il cui lordo supera l'accredito di una percentuale compresa in una **forchetta configurabile** (default 0,5 %–2,5 %);
2. la propone all'operatore, che conferma o corregge la selezione;
3. la differenza diventa una riga di costo su `32.3`.

**Il controllo che non va tolto**: se la percentuale dedotta cade fuori dalla forchetta, il sistema **rifiuta e segnala**. Dedurre la commissione per differenza significa che qualunque ammanco o errore di registrazione può travestirsi da commissione: la forchetta è ciò che impedisce di far sparire un problema chiamandolo con un altro nome.

---

## 5. Cosa cambia nella chiusura di cassa

Per ogni postazione:

1. **Incasso POS per terminale** — righe `{terminale, importo}` la cui somma è il `posAmount` di sempre. Nella pratica una riga sola (Worldline); una seconda solo quando si è usato altro.
2. **Imputazione dell'incasso a conti di ricavo** — ripartizione libera su `10.01` / `11.01` / `11.02`, con il totale vincolato all'incasso della postazione. Precompilata su `10.01`, così una serata normale non richiede alcun intervento.
3. **Sospesi generati** — righe `{descrizione o cliente, importo}`, la cui somma è `suspendedAmount`.
4. **Saldo sospesi incassati oggi** — selezione fra le partite aperte, con l'indicazione se il denaro è entrato in contanti o col POS. Entra nella quadratura, **non** nei corrispettivi.

Vincoli di quadratura da mostrare prima della validazione:

- `Σ allocazioni == cashAmount + posAmount` (comprensivo dei saldi sospesi incassati);
- `Σ CashStationPos.importo == posAmount`;
- `Σ sospesi generati == suspendedAmount`;
- ogni saldo sospeso ≤ residuo della partita che chiude.

---

## 6. Fase B — il transitorio POS

Al §2.9 il committente considera il transitorio una buona idea e lo sfasamento un problema minore. C'è però un ostacolo strutturale: **`RegisterType` ammette solo `CASH` e `BANK`** (`prisma/schema.prisma:2196`). Un transitorio non è né l'uno né l'altro, e metterlo su `BANK` è esattamente il difetto che il transitorio dovrebbe risolvere — il saldo banca del gestionale anticipa quello reale.

Quindi due fasi, e la seconda è opzionale:

**Fase A** (questa spec): la riga POS resta su `BANK` con la data della chiusura, come oggi, ma **allocata al conto di ricavo**. Le commissioni nascono alla riconciliazione (casi F e G). Difetto noto e accettato: per uno o due giorni il saldo banca è più alto del reale, dell'importo del POS non ancora accreditato.

**Fase B**: si aggiunge `TRANSITORY` a `RegisterType` e i tre conti del §3.5. La riga del giorno va sul transitorio, l'accredito la gira in banca al netto delle commissioni. Il saldo banca diventa fedele all'estratto conto. Costo: ogni query, filtro e totale che oggi assume due soli registri va rivisto — vale la pena farlo solo se lo sfasamento comincia a dare fastidio davvero.

---

## 7. Fase C — le API SumUp

Il caso G deduce la commissione. Le API la dicono.

- **Payouts** — `GET /v1.0/merchants/{merchant_code}/payouts` su intervallo di date. Campi: `amount`, **`fee`**, `date`, `id`, `reference`, `status`, `type`, `transaction_code`. Non espone l'elenco delle transazioni del payout.
- **Transactions** — `GET /v2.1/merchants/{merchant_code}/transactions/history`, filtrabile per data (`oldest_time`, `newest_time`), stato e tipo. Ogni transazione porta `amount`, **`fee_amount`**, `timestamp`, `status`, **`payout_date`**, `payout_type` e `transaction_events` con l'evento `PAYOUT`.

Insieme chiudono il cerchio: dal `payout_date` si ricostruisce **quali transazioni compongono un accredito**, e `fee` diventa un dato certo invece che una deduzione. Sparisce con essa il rischio del caso G.

Autenticazione: Bearer token, scope `payouts.read`. Le credenziali seguono la strada già battuta: `.env` più Railway, mai in repo.

Da fare **dopo** la fase A: senza le API il sistema funziona, con le API funziona meglio. L'aggancio può seguire lo schema del design open banking già in casa (`docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`) invece di inventarne un altro.

---

## 8. Punti lasciati aperti

**8.1 Il budget su quale base.** Rimandato dal committente. Con le decisioni di questa spec il conto `10.01` riceve l'incassato mentre `ricaviDalleChiusure` somma il fiscalizzato: la differenza — sospesi aperti meno sospesi saldati — **non andrà a zero**. Il numero oggi chiamato «ricavi non attribuiti» continuerà quindi a esistere e a dire il falso sul proprio nome. Va deciso se il budget si confronta sul venduto o sull'incassato, e il campo va rinominato di conseguenza.

**8.2 Ricavi e costi non fiscalizzati.** Segnalato dal committente («se viene fiscalizzato»). Tocca poco il codice e molto altro.

**8.3 `nonReceiptAmount`.** Una volta che la chiusura dichiara i saldi sospesi e le fatture, il campo può diventare quello che il suo nome promette: `(cash + pos) − receipt − invoice − saldiSospesiIncassati + spesePagateInContanti`. Da fare insieme a §8.1, perché entrambi toccano la lettura della chiusura.

**8.4 Più terminali dello stesso provider.** Se due terminali SumUp hanno payout separati, il transitorio va tenuto per terminale e non per provider. Da verificare sul campo prima della fase B.

---

## 9. Sequenza obbligata

1. **Allineare `conti/piano-v4` a `main`** (48 commit avanti, 21 indietro, `origin/main` non è suo antenato).
2. **Aggiungere al piano v4** i tre conti transitori (§3.5) — si fa ora, finché il piano non è nato, invece di correggerlo dopo con una migrazione di dati.
3. **Rilasciare il piano v4** in produzione (`npm run db:migrate:deploy`, che ora rimette anche la RLS).
4. **Poi** questa spec, fase A.

I punti 1-3 non dipendono da questo documento: sono lavoro già in canna.

---

## 10. Come si verifica che funzioni

- **Quadratura**: su una chiusura reale, `Σ allocazioni == cashAmount + posAmount`, e il conteggio cassa non segnala differenze quando si salda un sospeso.
- **Statistiche**: la serata del compleanno mostra i 1200 su sabato e non su lunedì; il totale del mese non cambia (controllo debole da solo — va accompagnato dal precedente, o è vero per costruzione).
- **Contabilità**: la somma annua di `10.01`+`11.01`+`11.02` è pari al denaro incassato, non al fiscalizzato: la differenza è esattamente `sospesi aperti a fine anno − sospesi aperti a inizio anno`.
- **Riconciliazione Axerve**: sul movimento reale del 16/07/2026, il parser estrae `190,00` e `1,90`, e `190,00 − 1,90 == 188,10`.
- **Riconciliazione SumUp**: sul movimento reale del 07/08/2026 da `892,22`, la selezione proposta ha una commissione dedotta dentro la forchetta; forzando una selezione sbagliata, **il sistema rifiuta**.

# Referto sonda GoCardless — 2026-08-12

Fase 0 (spike) della spec `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`, su 653 movimenti reali di 2 conti.

> **Questo è il referto pubblicabile.** Il repository è pubblico, quindi qui ci sono solo aggregati: nessun IBAN, nessun saldo, nessuna causale, nessuna controparte. Il referto completo, con i campioni in chiaro, è in `scripts/gocardless/snapshots/referto-2026-08-12.md`, che il repository non traccia.

## 1. Istituto, storico, durata dell'accesso

- `institution_id`: `BANCA_DELLA_MARCA_ICRAITRRU40`
- storico dichiarato dall'istituto: **90 giorni**
- storico concesso nell'agreement: 90 giorni
- accesso valido per: **180 giorni**
- scope: balances, details, transactions

Due ipotesi della spec cadono qui. Non esiste un `institution_id` unico per l'hub ICCREA: ogni BCC ha il proprio. E lo storico è di 90 giorni, non i 24 mesi che la spec dava per acquisiti — la data di taglio per conto serve ancora, ma il rischio di duplicare la prima nota copre un trimestre, non due anni. In compenso l'accesso dura 180 giorni: l'SCA si rifà due volte l'anno, e il banner di rinnovo va tarato su questo.

## 2. Conti

- conti analizzati: **2**
- conti coperti dal consenso ma **esclusi**: 1
- valute: EUR
- movimenti analizzati: **653**

La decisione presa a tavolino — un consenso solo copre tutti i conti dello stesso istituto — regge sul campo, ma ha un rovescio che la spec non aveva previsto: **il consenso si dà per home banking, non per conto**. Se nello stesso home banking convivono i conti dell'azienda e un conto personale dell'amministratore, l'API li espone tutti. Quale conto entra nel gestionale è quindi una scelta da fare **prima** della chiamata, non un filtro da applicare alla visualizzazione: su un conto personale la differenza fra non trattare un dato e trattarlo per poi nasconderlo non è di forma.

## 3. Chiavi: `transactionId` e `internalTransactionId`

| campo | duplicati dentro un conto | valori ripetuti su più conti |
|---|---|---|
| `transactionId` | 0 | 244 ⚠️ |
| `internalTransactionId` | 0 | 32 ⚠️ |

**È il risultato che pesa di più su questa fase.** Entrambi gli id sono una chiave dentro il singolo conto e nessuno dei due lo è fra conti diversi: il formato è un contatore per giorno e per conto, quindi due movimenti senza alcun rapporto fra loro portano lo stesso valore. Il vincolo a database è oggi `@@unique([venueId, bankReference])` (`prisma/schema.prisma:1749`) e **non contiene il conto**: usando l'id di GoCardless come `bankReference`, il secondo dei due movimenti sparirebbe come duplicato. `BankTransaction.bankAccountId` non è un miglioramento del modello, è la condizione perché la deduplicazione sia corretta; la chiave giusta è `(bankAccountId, transactionId)`.

- stabilità degli id nel tempo: **non ancora verificabile**, serve un secondo scarico a distanza

## 4. Causali

- `remittanceInformationUnstructured` valorizzata: **100.0%**
- lunghezza: minima 11, mediana 102, massima 230 caratteri
- contiene un riferimento a fattura: **5.4%**
- contiene sequenze di 3+ cifre: **70.0%**

La causale c'è sempre ed è lunga: il timore della spec, che arrivasse troncata o generica, non si avvera. Quello che è troncato è l'etichetta iniziale del tipo di operazione, non il resto.

## 5. Controparte: non arriva

- entrate (230): `debtorName` valorizzato in **0.0%**
- uscite (423): `creditorName` valorizzato in **0.0%**

Campi che la banca manda davvero — l'elenco completo:

| campo | presente in |
|---|---|
| `transactionId` | 100.0% |
| `entryReference` | 100.0% |
| `endToEndId` | 100.0% |
| `bookingDate` | 100.0% |
| `valueDate` | 100.0% |
| `transactionAmount` | 100.0% |
| `remittanceInformationUnstructured` | 100.0% |
| `proprietaryBankTransactionCode` | 100.0% |
| `internalTransactionId` | 100.0% |

Nove campi, e `creditorName`, `debtorName`, `creditorAccount`, `debtorAccount` non sono fra questi: non sono vuoti, **non esistono proprio**. La Fase 4 della spec — estendere il match delle regole al nome della controparte — non è rinviabile, è impraticabile così com'è scritta. Il nome sta dentro la causale, dopo un `*` che compare nel **54.5%** dei movimenti e separa l'etichetta dell'operazione dal resto: va estratto da lì.

## 6. Copertura delle regole di categorizzazione

Calcolata su 0 regole attive. Numeri nel referto completo.

## 7. `bookingDate` contro `valueDate`

- entrambe presenti nel **100.0%** dei movimenti
- differiscono nel **3.1%** dei casi

Mappatura senza sorprese: `bookingDate → transaction_date` (la data che la prima nota usa già) e `valueDate → value_date`. Le due colonne esistono entrambe.

## 8. `proprietaryBankTransactionCode`: il segnale che non ci aspettavamo

La banca classifica ogni movimento con un codice proprio: **25 codici distinti** sul 100% dei movimenti. Non è testo libero da indovinare, è una tassonomia che la banca assegna a monte.

| codice | movimenti | tipo di operazione |
|---|---|---|
| `48//00` | 195 | Bonifico a vs favore |
| `16//37` | 135 | Commissioni su bonifico tramite in |
| `26//11` | 97 | Bonifico tramite Internet Banking |
| `31//22` | 50 | SDD Core - Richiesta Incasso SEPA |
| `16//33` | 26 | Comm. richiesta incasso SEPA B2C |
| `16//32` | 21 | Comm. richiesta incasso SEPA B2B |
| `31//21` | 21 | SDD B2B - Richiesta Incasso SEPA |
| `26//20` | 20 | Vs disposizione permanente a favor |
| `39//11` | 16 | Disposizione per emolumenti intern |
| `19//83` | 12 | Imposte e tasse:Delega Unificata(p C.ATT |
| `79//00` | 12 | Disposizione di giro conto |
| `48//30` | 9 | Bonifico dall'estero @ OP. 88/4 |
| `78//50` | 7 | Versamento contante tramite CSA - Versam |
| `34//00` | 6 | Giro conto |
| `45//15` | 4 | Carta del Credito Cooperativo |
| `16//00` | 4 | Commissioni |
| `19//05` | 4 | Imposta di bollo Imposta di bollo al 3 |
| `52//30` | 3 | Prelevamento contante allo sportel |
| `15//10` | 3 | Addebito rata mutuo |
| `78//10` | 2 | — |
| `68//00` | 2 | — |
| `18//00` | 1 | — |
| `11//70` | 1 | — |
| `16//40` | 1 | — |
| `39//00` | 1 | — |

> L'etichetta è il prefisso comune a tutte le causali dello stesso codice, calcolato solo dai codici con almeno tre movimenti: è la parte fissa dell'operazione, non la causale di un movimento vero.

Vale la pena rileggere la Fase 4 alla luce di questa tabella. La controparte non arriva, ma arriva qualcosa che per l'imputazione contabile è più solido: commissioni, imposte, stipendi, rate di mutuo, incassi POS, versamenti di contante e giroconti hanno ciascuno il proprio codice. Una mappa `codice → conto` prende con certezza la fetta che le keyword oggi prendono per approssimazione, e lascia al riconoscimento testuale solo bonifici e SDD, dove il fornitore va davvero identificato.

---

Prodotto da `scripts/gocardless-probe.ts --step=report`. Nessuna scrittura sul database.
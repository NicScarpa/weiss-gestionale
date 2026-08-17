# Open banking Fase 3 — i movimenti entrano davvero

> **Spec approvata il 15 agosto 2026.** Argomenta la riga «Fase 3» della roadmap in
> `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md`, che era
> dichiarata «da dettagliare quando avremo il referto». Il referto c'è
> (`docs/gocardless-referto-2026-08-12.md`) e le Fasi 1, 2a e 2b sono in produzione.

**Obiettivo:** portare i movimenti bancari veri dentro `bank_transactions`, con una
sincronizzazione periodica che rispetta il contingente della banca, si accorge di
essere fallita e lo dice.

---

## Perché adesso, e cosa sblocca

Il gestionale sa collegare una banca, sa quali conti copre il consenso, sa quali
l'utente vuole importare — e **non scarica un solo movimento**. La tabella
`bank_transactions` in produzione è vuota: verificato il 15 agosto, zero righe.

Questo blocca due cose a valle, non una:

1. **La riconciliazione assistita** (Fase A1, in produzione dal 14 agosto) ha
   motore, lotti e rotte, ma la sua coda è vuota perché non esistono movimenti da
   proporre. La Fase A2 — schermata e approvazione — non ha senso prima di qui.
2. **La taratura della soglia 85** della fascia Alta, che è il numero per cui la
   Fase A1 è stata separata da A2 e che non è mai stato prodotto: serve avere
   insieme i movimenti veri e le scadenze vere.

La decisione 7 della spec della riconciliazione — «Prima la Fase 3 dell'open
banking» — è quindi vincolante, non un'opinione.

---

## Lo stato verificato il 15 agosto 2026

Misurato sulla produzione, non dedotto:

| Cosa | Valore |
|---|---|
| `bank_transactions` | **0 righe** |
| Scadenze vive | **1** (92,60 €); altre 232 soft-deleted, pulizia dell'import di prova |
| Conti bancari | 3: `Banca della Marca - Weiss` (BANK, collegato), `Cassa`, `Cassetta di sicurezza` (CASH) |
| Collegamenti open banking | 1 `LN` (attivo), 1 `RJ` (rifiutato) |
| `ux_bank_transactions_conto_provider` | **esiste**, UNIQUE parziale su `(bank_account_id, provider_transaction_id)` con i `NULL` esclusi |
| `RESEND_API_KEY` in produzione | **assente** (33 variabili sul servizio `weiss-gestionale`, questa non c'è) |
| Cricchetto autorizzazioni | 254, pari alla baseline |

Due conseguenze pratiche di questa tabella:

- **Il primo giro non può duplicare niente**, perché non c'è niente. Il timore che
  ha guidato tre fasi — sovrapporre i 90 giorni di GoCardless allo storico CSV — non
  si applica a questo conto. Resta vero per i conti che si collegheranno dopo.
- **Il canale mail oggi non funziona**, e non solo per noi: senza
  `RESEND_API_KEY`, `sendEmail` registra un errore nei log e restituisce `false`.
  Anche il recupero password e gli inviti sono muti in produzione. Vedi
  *Prerequisiti*.

---

## Le decisioni prese

### 1. Solo i movimenti contabilizzati

GoCardless restituisce due liste, `booked` e `pending`. **Importiamo solo
`booked`.**

Un movimento provvisorio, quando si consolida, **cambia identificativo e spesso
importo** (la mancia su un pagamento con carta, l'arrotondamento del cambio):
tenerli significherebbe scrivere la logica che riconosce il provvisorio diventato
definitivo e li fonde, su due campi che possono cambiare entrambi. È il punto in
cui nascono i doppioni.

⚠️ **Questa è una modifica alla Fase 1, non codice nuovo.**
`mappaMovimenti` (`src/lib/gocardless/mapper.ts:66`) oggi fa
`[...booked, ...pending]`: fonde le due liste in una. Va cambiata, con il suo test.

Il prezzo teorico sarebbe vedere le spese con carta uno o due giorni più tardi.
**Oggi non lo paghiamo**: `rispostaMovimentiSchema`
(`src/lib/gocardless/types.ts:43-50`) annota che *la banca non manda `pending`* —
il campo ha `.default([])` proprio per questo. Con Banca della Marca la lista è
sempre vuota e la decisione è a costo zero; vale come difesa per il giorno in cui
un secondo istituto li mandasse, o questo cambiasse comportamento senza dirlo.

### 2. Una sincronizzazione a notte, due a mano, una di riserva

Il contingente della banca è di **4 chiamate al giorno per conto e per endpoint**
(`http_x_ratelimit_account_success_limit=4`). Gli endpoint sotto contingente sono
tre e distinti: `/transactions/`, `/balances/`, `/details/`. Una sincronizzazione
spende 1 su `transactions` e 1 su `balances`, quindi il tetto reale è di **4
sincronizzazioni al giorno per conto**, non 4 chiamate in tutto.

La distribuzione scelta:

| | Quante | Perché |
|---|---|---|
| Cron notturno | 1 | i movimenti sono pronti al mattino |
| «Sincronizza ora» | 2 | verifiche durante la giornata |
| Riserva | 1 | **i ritentativi** |

La riserva non è prudenza generica: il client ha il ritentativo con backoff
(`ritentabile`), e **un tentativo ripetuto brucia una chiamata del contingente**.
Oggi nessuno le conta. È il difetto che il piano 2b segnalava al punto 1.

### 3. Il contatore conta le chiamate HTTP realmente partite

Non le sincronizzazioni riuscite, non i giri di cron: **le chiamate**. Il conteggio
si incrementa nel punto in cui la richiesta parte, non dove il chiamante crede di
averne fatta una.

La fonte di verità per riallinearlo sono gli header che la banca restituisce a ogni
chiamata per conto: `http_x_ratelimit_account_success_limit`, `..._remaining`,
`..._reset` (secondi). Un header si legge solo **dopo** aver speso la chiamata,
quindi il contatore persistito serve comunque per decidere *prima* — ma quando
l'header arriva, vince lui.

**Metà del lavoro è già fatto e non va rifatto**: il client legge gli header
(`leggiLimiti`) e li restituisce al chiamante insieme ai dati — `Risposta<T>` è
`{ dati, limiti }`. Il contatore non deve toccare gli header HTTP: riceve `limiti`
da ogni chiamata.

I campi ci sono già su `BankSyncRun`: `rateLimitRemaining`, `rateLimitResetAt`.

### 4. La deduplica resta al database

`ux_bank_transactions_conto_provider` è un indice UNIQUE **parziale** — Prisma non
sa rappresentarli, sta in `prisma/sql/constraints.sql` e nel `migration.sql` della
migrazione `20260812120000_open_banking_fase_1`. Verificato presente in produzione.

**La sincronizzazione non reimplementa la deduplica**: inserisce e tratta la
violazione (`P2002`) come «già visto», contandolo in `movimentiDuplicati`. Scrivere
un controllo applicativo «esiste già?» creerebbe una seconda fonte di verità che
diverge dalla prima sotto concorrenza — due giri sovrapposti passerebbero entrambi
il controllo e solo l'indice fermerebbe il secondo.

Ragione ulteriore, dal referto dell'8 agosto: **`transactionId` collide fra conti**
(249 casi su 678). La chiave giusta è la coppia, e solo l'indice la impone.

### 5. I movimenti nascono da riconciliare

`status: PENDING`, `bankAccountId` valorizzato, `importSource: PSD2_GOCARDLESS`.

Così entrano da soli nella coda della riconciliazione assistita, che legge
`PENDING | UNMATCHED | TO_REVIEW`. Nessun ponte da costruire: è il pezzo che chiude
il cerchio fra le due funzioni.

Il timore della spec dell'8 agosto — «due flussi di import che si comportano
diversamente» — **non si applica più**: la rotta di import oggi crea un solo stato,
`PENDING` (`src/app/api/bank-transactions/import/route.ts`). Verificato.

### 6. Il primo giro prende tutti i 90 giorni

Perché non c'è nulla con cui sovrapporsi (`bank_transactions` è vuota). Dai giri
successivi `date_from` parte dall'ultimo movimento noto per quel conto.

`syncCutoffDate` **esiste, è documentato e nessuno lo usa**: la Fase 3 lo legge, e
serve ai conti che si collegheranno dopo con uno storico CSV alle spalle.

### 7. Un fallimento si vede in tre posti

Perché la sincronizzazione notturna gira quando non c'è nessuno a guardare, ed è la
stessa forma di rischio dell'errore già commesso in quest'area: il rinnovo del
consenso scriveva la data di validità *prima* che l'autenticazione riuscisse, e così
**spegneva proprio l'avviso che avrebbe segnalato il problema**.

| Dove | Cosa | Costruito o esistente |
|---|---|---|
| Campanello in alto | bollino rosso col conteggio | **esistente**: `NotificationBell` interroga `/api/notifications/history` ogni 60 s e ha già `unreadCount`. Basta scrivere una riga in `NotificationLog`. |
| Mail agli admin | avviso del fallimento | `sendEmail` esiste (Resend). **Richiede la chiave**, vedi Prerequisiti. |
| Pagina dei movimenti | ultimo giro riuscito, esito, quanti movimenti sono entrati | da costruire, legge `BankSyncRun` |

Serve un valore nuovo in `enum NotificationType` — gli attuali sono tutti di turni,
presenze e documenti. `NotificationChannel` ha già `EMAIL` e `IN_APP`: non va
toccato.

**La mail non deve fallire in silenzio.** `sendEmail` restituisce `false` quando la
chiave manca, e oggi nessun chiamante guarda quel valore. La Fase 3 lo guarda: se la
mail non parte, il pannello lo dice. Un canale d'allarme che tace è peggio di un
canale d'allarme assente, perché chi lo guarda crede di essere coperto.

---

## Architettura

### Dove vive il codice

| File | Responsabilità |
|---|---|
| `src/lib/gocardless/sincronizzazione.ts` | **funzione pura**: da risposta GoCardless a righe da inserire. Nessun database, nessuna rete. È ciò che permette di provarla sulle fixture dei 678 movimenti veri. |
| `src/lib/gocardless/contingente.ts` | il contatore: quante chiamate restano, quando si riapre, come si riallinea sugli header |
| `src/lib/services/bank-sync-service.ts` | l'orchestratore: legge i conti accesi, chiama, scrive `BankTransaction` e `BankSyncRun`, notifica |
| `src/app/api/banca/sincronizzazione/cron/route.ts` | il cron, difeso da `CRON_SECRET` |
| `src/app/api/banca/sincronizzazione/route.ts` | «Sincronizza ora», `withAuth` ruolo `admin` |

La separazione fra funzione pura e orchestratore è la stessa già adottata da
`schedule-matcher.ts` e dal motore della riconciliazione: è ciò che rende il pezzo
difficile provabile senza montare niente.

### Il cron non è in `vercel.json`

`vercel.json` dichiara dei job ma **la produzione è Railway, dove viene ignorato**.
I cron veri sono servizi Railway separati che chiamano l'endpoint con `curl` — nel
progetto esiste già `cron-presenze`, immagine `curlimages/curl`.

La Fase 3 aggiunge quindi **un servizio cron su Railway**, non una riga in
`vercel.json`. È un passo di rilascio, non di codice, e va scritto nel piano perché
altrimenti il codice esiste e non lo chiama nessuno — lo stesso sintomo già noto di
`/api/shifts/reminder`, che ha il guard `CRON_SECRET` e non è raggiungibile da
nessuna parte.

La rotta riusa il modello di `verificaSegretoCron()`
(`src/app/api/promemoria-timbratura/cron/route.ts`), e va aggiunta a
`PUBLIC_PREFIXES` del middleware — altrimenti il middleware la redirige al login e
il cron riceve una pagina HTML al posto della risposta.

### Idempotenza

Due giri sovrapposti non devono raddoppiare nulla. Tre difese, in ordine:

1. l'indice unico parziale (decisione 4);
2. un giro in corso per lo stesso conto blocca il successivo — `BankSyncRun` senza
   `finishedAt` più recente di una soglia;
3. il contatore, che rifiuta prima di chiamare.

---

## Cosa si vede

**Nel pannello delle connessioni**, per ogni conto acceso: data e esito dell'ultimo
giro, quanti movimenti sono entrati, quante sincronizzazioni restano oggi e — a
contingente esaurito — **quando si riapre**, letto da `rateLimitResetAt`. Un pulsante
spento che non dice perché è un pulsante rotto.

**Nella pagina dei movimenti bancari**: quanto sono aggiornati i dati e quando è
stata l'ultima sincronizzazione riuscita. È la domanda che ci si pone guardando quei
numeri — «me li posso fidare?» — e oggi la pagina non la risponde.

---

## Le voci ereditate dal piano 2b

Il piano `2026-08-13-open-banking-fase-2b.md` ne rimandava otto a qui. Stato al 15
agosto:

| # | Voce | Stato |
|---|---|---|
| 1 | Cron, contatore, `syncCutoffDate` | **è questa spec** |
| 2 | Riassegnare un conto della banca a un altro conto del gestionale dà 500 (`providerAccountId` unico globale, violazione non tradotta) | **dentro**, si chiude come il 409 già fatto |
| 3 | Stabilità degli identificativi dei movimenti mai verificata | **dentro**: il primo giro vero è l'occasione, un secondo giro a distanza di giorni la misura |
| 4 | Rilascio in produzione | **fatto** il 13-14 agosto |
| 5 | Tasto Indietro lascia il pannello inerte | **dentro** |
| 6 | «Mostra archiviati» perde le scelte non salvate (rimedio noto: `placeholderData: keepPreviousData`) | **dentro** |
| 7 | La scadenza del consenso è una stima per eccesso; la fonte vera è `GET /agreements/enduser/{id}/`, fuori dal contingente | **dentro** |
| 8 | Cricchetto a 258 | **chiuso**: misurato a 254, pari alla baseline |

Le voci 5, 6 e 7 sono difetti del pannello che la Fase 3 tocca comunque: chiuderle
qui significa provarle mentre quel codice viene esercitato, invece che alla cieca.

---

## Cosa NON entra

- **L'estrazione della controparte** dal testo dopo il `*` e la **mappa
  `proprietaryBankTransactionCode` → conto**: sono la Fase 4. Il referto dice che
  insieme coprono l'82% dei movimenti, ed è lavoro di categorizzazione, non di
  trasporto.
- **La dismissione dell'import CSV**: Fase 5. Il CSV resta l'unica via per lo storico
  oltre i 90 giorni e non è dismissibile del tutto.
- **La schermata della riconciliazione assistita** (Fase A2): viene dopo, e adesso
  avrà dati veri su cui girare.

---

## Prerequisiti

**`RESEND_API_KEY` va procurata e messa su Railway** (servizio `weiss-gestionale`).
Non posso crearla io: serve un account Resend e un dominio verificato per il
mittente.

Finché manca, la Fase 3 si costruisce e funziona lo stesso — campanello e pagina dei
movimenti non dipendono dalla mail — ma **il canale mail resta spento e il pannello
lo dichiara**. Non è un blocco: è un pezzo che si accende dopo, senza toccare il
codice.

⚠️ Ricordare che `railway variables --set` **non ridistribuisce**: la variabile
appare nel pannello e manca nel container finché non si lancia `railway redeploy`.

---

## Come si prova

**Il banco di prova sono i 678 movimenti veri** già catturati dalla sonda, in
`scripts/gocardless/snapshots/` (fuori dal repo: contengono IBAN, nomi di
controparti reali e i token). La funzione pura si esercita su quelli senza spendere
una sola chiamata del contingente.

- **Unitari**: la funzione pura (booked contro pending, i campi mappati, il segno,
  la data valuta), il contatore (soglie, riallineamento sugli header, il ritentativo
  che consuma), `date_from` calcolato da `syncCutoffDate` e dall'ultimo movimento.
- **Integrazione**: le due rotte con `withAuth` e `CRON_SECRET`, la violazione
  `P2002` contata come duplicato e non come errore, `BankSyncRun` scritto in ogni
  esito, la notifica scritta al secondo fallimento e non al primo.
- **Con `fetch` mockato**: `creaClient` accetta `fetchImpl` e
  `src/lib/gocardless/__tests__/client.test.ts` lo usa già. L'annotazione «saremmo
  i primi» della spec dell'8 agosto è superata: si riusa quel modello.
- **Sul campo, una volta**: un giro vero sul conto collegato. Costa 2 chiamate delle
  4, ed è l'unico modo di verificare la voce 3 (stabilità degli identificativi) e il
  percorso di ritorno dalla banca.

**La build va eseguita**, entrambe: la CI prova `next build --webpack` prima di
`npm run build` (Turbopack) e le due non concordano. Un import client→prisma rompe
il bundle e nessuna revisione del diff può vederlo.

---

## Domande ancora aperte

- **Quante notti di fallimento prima della mail.** Proposta: **due consecutive** per
  la mail, **ogni fallimento** per il campanello. Un errore isolato della banca è
  frequente; una notifica che si impara a ignorare smette di funzionare quando serve.
  Da rivedere dopo il primo mese di dati veri.
- **L'ora del cron.** Proposta: notte italiana, dopo la chiusura contabile della
  banca. Va deciso guardando a che ora i movimenti del giorno prima diventano
  `booked` — informazione che avremo solo dopo il primo giro vero.
- **Se il conto `Cassa` e `Cassetta di sicurezza` debbano essere esclusi
  esplicitamente** dal pannello di sincronizzazione: sono `CASH`, non hanno IBAN e
  non possono avere un `providerAccountId`, quindi oggi sono già fuori di fatto. Da
  verificare che siano fuori anche *a schermo*, senza un interruttore che promette
  qualcosa di impossibile.

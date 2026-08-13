# Da dove riprendere — 10 agosto 2026

**Scritto a fine sessione.** Autosufficiente: contiene tutto ciò che serve per ripartire senza
ricostruire il contesto. Il prompt da incollare è in fondo (§7).

---

## 1. Dove siamo

**In produzione** (`main` = `f6c35ec`, deploy Railway **SUCCESS**): il registro delle migrazioni
Prisma, **undici P1** delle tre relazioni W5, **sei lotti** di P2 e debito tecnico, e **tutte e
dodici le decisioni di prodotto**.
Gate all'ultimo rilascio: **1001 test unit · 393 di integrazione** · tsc + tsc e2e + tsc test ·
lint 0 errori · strict 24 · audit 0/0 · build webpack e turbopack.

**Non resta nulla di verificato fuori da `main`.**

**Chiuso oggi in emergenza**: la Data API di Supabase esponeva `public` con 80 tabelle su 80.
Con la sola `anon key` erano leggibili `invitation_tokens` (token in chiaro), `bank_accounts` e
`audit_logs`. Verificato prima e dopo: ora rispondono `404 PGRST205`. **L'app non è toccata**,
accede via Prisma con la connection string diretta.

---

## 2. ~~Sette rami da mergiare~~ — FATTO E DISTRIBUITO

**`main` = `f6c35ec` · deploy Railway `SUCCESS`.**

Integrati tutti il 10 agosto, sei merge, zero conflitti. Gate finale verde, con i tre controlli
aggiunti oggi (`tsc e2e`, `tsc test`, `build webpack`):

```
1001 test unit (73 file)     da 983 → +18
 393 integrazione (52 file)  da 363 → +30
tsc · tsc e2e · tsc test · lint 0 errori · strict 24 · audit 0/0
build webpack ✓ · build turbopack ✓
```

Contenuto: riporto d'anno · budget non cancellabile · tipo scadenza immutabile · via il campo
`valuta` · il gate prova anche webpack · 18 copie di `entraCome` in una · la prima migrazione vera
del registro (drop `register_balances`) · il tipo del movimento si salva invece di essere dedotto ·
Switch touch 44×44 · i due lati di un trasferimento riconoscibili · cache dedicata ai documenti ·
chiusura cassa disponibile senza rete anche se mai visitata.

**Le dodici decisioni di prodotto sono tutte implementate e rilasciate.**

I sei rami sorgente restano per riferimento e si possono cancellare:
`decisioni/{committente,drop-register-balances,entry-type,interfaccia}`, `offline/indagine`,
`residuo/ci-e-helper`. Idem i worktree in `~/Desktop/accounting-wt/`.

> **Metodo di integrazione, per la prossima volta** (collaudato su otto ondate): worktree staccato
> (`git worktree add <dir> --detach origin/main`), merge `--no-ff` uno per volta, gate, e solo alla
> fine `git push origin HEAD:main`. Se il gate cade, il colpevole è per costruzione l'ultimo merge →
> `git revert -m 1`. Con perimetri disgiunti si può fare un gate solo alla fine, come oggi: se cade,
> si isola rifacendo. **Il push su `main` fa partire il deploy automatico Railway.**

---

## 3. Due decisioni di prodotto, bloccanti per il lavoro relativo

### 3.1 Su quale base imputare i ricavi (ha un risvolto fiscale)

`ricaviDalleChiusure` somma **corrispettivi** (`receiptAmount + invoiceAmount`);
`generateJournalEntriesFromClosure` scrive il **denaro entrato** (`cashAmount + posAmount`).
Coincidono solo senza sospesi né differenze cassa, e il sistema **misura già** la differenza:
`closure-calculations.ts:66-67` la salva come `nonReceiptAmount` su ogni postazione.

- **(a) imputare sui movimenti di incasso**: semplice, ma `unassignedRevenue` diventa lo scarto fra
  corrispettivi e incasso — un numero che esiste già altrove, sotto un'etichetta che dice altro.
- **(b) imputare sui corrispettivi**: `unassignedRevenue` va davvero a zero e «ricavo» resta una
  grandezza sola. Richiede di decidere cosa fare quando corrispettivi ≠ incasso.

L'agente propendeva per **(b)** e io concordo, ma è una decisione del committente.
**Corollario da decidere insieme**: `nonReceiptAmount` sottrae `receiptAmount` ma **non**
`invoiceAmount`, mentre la formula dei ricavi li somma entrambi — le due parti del sistema non
concordano su cosa sia un corrispettivo.

### 3.2 Cosa deve restituire il filtro «Versamento»

Il filtro `movementType` (`prima-nota/route.ts:163-187`) usa ancora l'euristica che l'etichetta ha
appena smesso di usare. Misurato con dati veri: «Uscita» restituisce anche la metà di un versamento,
«Prelievo» restituisce un bonifico a fornitore, «Versamento» restituisce **una sola** delle due righe.

Prima etichetta e filtro erano coerenti perché **sbagliavano allo stesso modo**; ora l'etichetta dice
il vero e l'errore del filtro si vede. Allinearlo richiede di decidere: **filtrando «Versamento» si
vuole una riga o entrambe?**

---

## 4. Finding aperti, in ordine di gravità

### 4.1 ~~Venti tabelle senza RLS (#37)~~ — CHIUSO il 10 agosto, **80 su 80 protette**

Erano **21**, non 20 (il conteggio escludeva `_prisma_migrations`). Applicato in produzione:
`Tabelle esaminate: 80 · protette: 80 · fallite: 0`. Verificato dopo, con lo strumento
indipendente: `Totali: 80 | Protette: 80 | Scoperte: 0`.

Il difetto era doppio, e nessuna delle due metà si vedeva dall'esterno:

- `prisma/sql/enable_rls_all_tables.sql` **non aveva mai abilitato una sola RLS**: moriva alla prima
  tabella con `column reference "table_name" is ambiguous` (SQLSTATE 42702) — la variabile PL/pgSQL
  si chiamava come la colonna — e il blocco `DO` è atomico. Stampava un `RAISE NOTICE` di successo
  **prima** di eseguire, quindi annunciava una protezione per ogni tabella che non proteggeva.
- Due liste scritte a mano e divergenti (57 nel SQL, 47 nel `.mjs`), mai riaggiornate.

Oggi **non c'è più nessuna lista**: il file cicla su `pg_tables`, e `scripts/enable-rls.mjs` non
duplica la logica — esegue quel file. Le 21 scoperte erano accomunate da una cosa sola: essere nate
dopo l'ultimo aggiornamento manuale dell'elenco.

Aggiunte che prima non c'erano: guardia contro l'autoesclusione (`FORCE RLS` vale anche per il
proprietario: chi esegue senza `BYPASSRLS` si chiude fuori dai propri dati in silenzio),
`lock_timeout = 5s` (l'`ALTER TABLE` prende un `ACCESS EXCLUSIVE`, e in coda dietro di lui si
accoda il traffico dell'applicazione), e il ramo per PostgreSQL non-Supabase, dove `service_role`
non esiste. Verificato per inversione su database usa-e-getta: il vecchio file sullo stesso banco
muore con 42702 lasciando **zero** RLS; il nuovo protegge tutto, è idempotente, prende le tabelle
nate dopo, e sotto contesa di lock molla la tabella occupata dopo 5,1 s senza fermare le altre.

`npm run rls:check` · `rls:enable:dry` · `rls:enable`.

> **Quel che resta aperto**: `prisma migrate deploy` non sa nulla di RLS, quindi **ogni tabella
> nuova nasce scoperta**. Il passo è nel runbook (`prisma/migrations/README.md`), ma è un
> promemoria scritto, non un gate. Il gate vero sarebbe `npm run rls:check` in un cron: esce 1.
>
> **E non è RLS che protegge oggi**: la Data API è chiusa, l'unico accesso è la connection string
> diretta come `postgres`, che ha `BYPASSRLS` e passa comunque. RLS è la seconda serratura — quella
> che rende innocuo il giorno in cui la Data API venisse riaperta.

### 4.2 Offline: intermittenza residua non spiegata (#32)

Da 2,5% a **0,83%** (1 su 120). Il rischio strutturale è chiuso. Il residuo riguarda il ricaricamento
della pagina corrente e **non c'è una quarta ipotesi che non sia indovinare**. Tre tentativi hanno
rivelato tre trappole: il matcher che non intercetta il riscaldamento (regressione al 100%), la
doppia scrittura in corsa, il precache che metteva **la pagina di login sotto l'URL della chiusura**.

### 4.3 I 292 handler con auth a mano (#26) → **cricchetto acceso**, conversione a lotti

**L'emorragia è fermata.** `scripts/check-route-auth.mjs --ratchet` gira in CI e fallisce se il
numero **sale**: chi aggiunge una route deve usare `withAuth`, chi converte abbassa la soglia.
Prima era un rapporto che non falliva mai, in attesa che la conversione finisse — e l'attesa
costava: i 255 del censimento precedente erano diventati **260** mentre la conversione era «in
corso». `--strict` resta la meta, e diventerà la forma in CI a baseline zero.

**Primo lotto convertito**: le cinque route di `report/`, con la caratterizzazione scritta prima
(`src/app/api/report/__tests__/autorizzazione.test.ts`, 35 test) e verificata per inversione —
togliendo il controllo di ruolo da una route, tre test cadono. La conversione è a comportamento
invariato: `unauthorized()`/`forbidden()` danno gli stessi identici messaggi degli inline. Un
irrigidimento voluto c'è: `requireAuth` rifiuta anche chi deve ancora cambiare la password.

**Falso positivo dello strumento, corretto**: `POST /api/saldi/riporto-anno/cron` (esiste solo su
`main`) risultava «senza alcun controllo» pur verificando `CRON_SECRET` — il controllo sta in un
helper del preambolo, e `classifica()` cercava il segreto solo nel corpo. Uno strumento di
sicurezza che accusa il codice sano insegna a non credergli.

Nota confermata: `DELETE /api/venues` risulta «senza controllo» ma **risponde sempre 403**, è un
tappo deliberato. È l'unico rimasto in quella colonna.

**Conti, e attenzione a dove sono misurati** (vedi §4.6): su `conti/piano-v4` **255** da
convertire; su `origin/main` **258**. La baseline va ricalcolata dopo l'allineamento.

### 4.4 Campi fantasma (#39) — sul branch sembrano vivi, su `main` sono chiusi

Passato il criterio sulle 59 interfacce di `src/types/` contro gli 80 modelli Prisma. I due
candidati con campo **obbligatorio** assente dallo schema erano `Schedule.valuta` e
`JournalEntry.entryType` — cioè esattamente i due già noti. Verificati: su `origin/main` **sono
entrambi risolti**, e `valuta` ha al suo posto un commento che spiega perché non deve tornare.
Compaiono solo perché questo branch è indietro.

Il resto dell'elenco è rumore da euristica: `*FormData`, `*Filters`, `*ListResponse`, `*Summary`
sono DTO, non riflessi di una tabella, e il confronto per prefisso del nome li associa a un modello
a torto. **Un controllo automatico di questo tipo va scritto sui soli tipi che pretendono di
rispecchiare una riga**, altrimenti annega il segnale.

### 4.6 🔴 Questo branch è indietro di 21 commit da `main` (scoperto il 10 ago)

`conti/piano-v4` è **48 commit avanti e 21 indietro**, e `origin/main` **non è suo antenato**. Ogni
misura presa qui è di un albero che non esiste da nessuna parte: il censimento dà 260 dove `main`
dà 259, e due finding «aperti» del §4.4 sono chiusi da giorni. **Prima di proseguire il debito, il
branch va allineato** (`git merge origin/main`), e poi vanno ricalcolate le baseline.

### 4.4 Campi fantasma (#39)

Quattro trovati in due giorni: `valuta` (tipo obbligatorio, colonna inesistente), `entryType`
(dedotto), più i tre già presidiati da un test dedicato (`stato`, `dataPagamento`, `importoPagato`).
**Il progetto ha già un test dedicato al fenomeno**: vale la pena passare il criterio §5 su tutti i
tipi che dichiarano campi non presenti nello schema.

### 4.5 `nonReceiptAmount` non sottrae `invoiceAmount`

Dove si incassa a fronte di fattura, l'importo risulta «non scontrinato» pur essendo documentato.
Legato alla decisione §3.1.

---

## 5. Il criterio da applicare sistematicamente (#35)

> **«Il test asserisce il valore o solo la forma?»**

Ne ha smascherati tre in un giorno, tutti verdi e tutti ciechi sulla cosa che dovevano difendere:
il test delle ricorrenze contava le occorrenze **senza guardarne le date**; «il totale del mese non
cambia» era vero **per costruzione algebrica**; l'asserzione sul conteggio delle fette era cieca allo
spostamento fra conti.

**Vale la pena passarlo su tutta la suite**, non solo sui test nuovi.

---

## 6. Verifiche che nessun agente può fare

1. **Sentry riceve davvero un errore?** Progetto `4511870340300880`. Variabili configurate e codice
   in produzione, ma **nessuno ha mai visto arrivare nulla**.
2. **Le push arrivano a un telefono vero?** Chiavi VAPID su Railway, catena dimostrata in
   laboratorio, mai provata su un telefono. Ogni dipendente deve attivarle **una volta** dal portale.
3. **I report con importi veri**: riepilogo mensile e confronto annuale sono stati sistemati a 390 px
   con un database di prova a zero. Con sei cifre stanno **per calcolo**, ma nessuno li ha visti.

---

## 7. Prompt per riprendere

**Il §2 è chiuso: tutto è su `main`.** Il prossimo passo naturale è la sicurezza (§4.1), che è
l'unica cosa rimasta con una conseguenza fuori dal repository.

```
Leggi /Users/nicolascarpa/Desktop/accounting/audit/RIPRESA-10-AGOSTO.md e chiudi il
finding §4.1: sostituisci le due liste RLS scritte a mano con un ciclo su pg_tables e
correggi enable_rls_all_tables.sql, che non ha mai funzionato. Poi dimmi quali tabelle
restano scoperte e cosa serve per proteggerle.
```

In alternativa, se preferisci il debito più grosso:

```
Leggi /Users/nicolascarpa/Desktop/accounting/audit/RIPRESA-10-AGOSTO.md e parti dal §4.3:
converti i 255 handler rimasti a withAuth, a lotti, con la caratterizzazione scritta PRIMA
di ogni conversione.
```

Oppure, se vuoi che il criterio del §5 diventi un lavoro invece che una nota:

```
Leggi /Users/nicolascarpa/Desktop/accounting/audit/RIPRESA-10-AGOSTO.md §5 e passa il
criterio «il test asserisce il valore o solo la forma?» su tutta la suite: elencami i test
che passano guardando la forma, con il difetto che ciascuno lascerebbe passare.
```

---

## 8. Trappole d'ambiente imparate oggi (le altre stanno in `remediation-trappole-ambiente.md`)

1. **`rm -rf .next`** quando `tsc` cita route inesistenti: è cache stantia, non codice. Costato dieci
   minuti a due agenti.
2. **`SECONDS` non avanza in una subshell zsh in background**: un `while [ $SECONDS -lt $end ]`
   diventa un ciclo infinito. Oggi ne sono rimasti 21, load a 283, setup dei test da 80 a 819
   secondi — e ha fatto cadere test altrui facendoli sembrare flaky.
3. **`grep -c 'test.fail('` conta anche i commenti.** Tre numeri del piano precedente erano sbagliati
   così.
4. **`$?` dopo una pipe cattura l'ultimo comando, non il primo**: `npx knip | tail; echo $?` misura
   `tail`.
5. **Turbopack e webpack hanno severità diverse sullo stesso codice.** Il gate ora prova entrambi.
6. **Per verificare PostgREST serve la `anon key`**: senza, risponde `401` sempre, sia che lo schema
   sia esposto sia che non lo sia.

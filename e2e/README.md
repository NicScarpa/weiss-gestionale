# Test end-to-end

Pochi test, veri. La regola è una sola: **nessuna asserzione che non possa
fallire.** La suite precedente ne conteneva trentaquattro del tipo
`expect(true).toBe(true)` e cercava un campo di login «Email» che da gennaio si
chiama «Username»; non poteva nemmeno partire, perché `@playwright/test` non era
installata. Una suite verde che non prova nulla è peggio di una suite assente:
dà fiducia falsa.

## Come si esegue

Serve un Postgres locale e un database seedato — **mai** quello di produzione.
`e2e/helpers/db.ts` si rifiuta di aprire una connessione se `DATABASE_URL` non
punta a `127.0.0.1`/`localhost`.

```sh
source ~/.nvm/nvm.sh && nvm use 22

# .env.local con valori locali (DATABASE_URL, NEXTAUTH_URL, AUTH_SECRET,
# ENCRYPTION_KEY a 32 byte in base64)
npx prisma db push && npx tsx prisma/seed.ts

npm run test:e2e          # avvia da sé `next dev`, o riusa quello già attivo
npm run test:e2e:ui       # stessa suite, con l'interfaccia di Playwright
```

**`127.0.0.1`, non `localhost`.** Su macOS `localhost` risolve prima a IPv6
(`::1`) mentre `next dev` ascolta su IPv4, e la suite fallisce con errori di
connessione che sembrano un'applicazione rotta. Si passa l'indirizzo esplicito,
e conviene avviare anche il server sullo stesso:

```sh
npm run dev -- -p 3020 -H 127.0.0.1
E2E_BASE_URL=http://127.0.0.1:3020 E2E_PORT=3020 npm run test:e2e
```

Porta e indirizzo sono variabili apposta: più copie di lavoro del repository
girano insieme sulla stessa macchina, e due suite sulla stessa porta si
rubano il server a vicenda. Vale anche per il database: `weiss_dev_e2e_<copia>`,
mai uno condiviso, perché le spec liberano giorni e archiviano righe.

`prisma db push` **non** accetta `--skip-generate`: passarglielo non dà errore,
stampa la guida e non fa niente.

## La prova offline è a parte, e perché

`npm run test:e2e:offline` usa `playwright.offline.config.ts` e **richiede una
build di produzione già avviata**:

```sh
npm run build
npm run start -- -p 3011
npm run test:e2e:offline
```

Non è una complicazione gratuita. In sviluppo il service worker non esiste
proprio: `ServiceWorkerRegistration` esce subito quando
`process.env.NODE_ENV !== 'production'`, e `public/sw.js` viene prodotto da
`npm run build:sw`, incluso solo in `npm run build`. Girare la prova offline
contro `next dev` verificherebbe l'assenza del service worker, non il
comportamento offline.

Il TLS non è più un ostacolo: `src/lib/db-tls.ts` esenta dalla cifratura le sole
connessioni verso un host di loopback, quindi `npm start` con
`NODE_ENV=production` parla con un Postgres locale senza SSL. L'eccezione
dipende da dove punta `DATABASE_URL` e non da un interruttore, così non c'è modo
di allentarla per sbaglio su Railway. Prima serviva un Postgres locale con
`ssl = on` (o un proxy TLS montato a mano), e questa prova non la eseguiva
nessuno.

## Come è fatta

**Una sessione sola.** Il login è limitato a cinque tentativi al minuto per
coppia IP+utente (`src/lib/auth.ts:79`): una suite in cui ogni test entra per
conto suo esaurisce la soglia intorno al sesto test, e da lì in poi
l'applicazione risponde «credenziali non corrette» — fallimenti che non dicono
niente sul prodotto e somigliano a un difetto di autenticazione. Il global setup
apre una sessione e la salva; le spec la riusano con `apriConSessioneAdmin`.
`login.spec.ts` è l'unica che parte senza, perché il login è il suo oggetto.

**Il database si legge, non si indovina.** Dove conta il dato salvato — la data
di una scadenza, lo stato di una chiusura, quante righe ha creato un click — il
test lo legge da Postgres invece di fidarsi di quello che lo schermo mostra.

**Lo stato di partenza si prepara.** Le chiusure sono uniche per (sede, giorno)
e le scadenze si accumulano: ogni test libera il proprio giorno e archivia le
proprie righe prima di cominciare, altrimenti dal secondo giro in poi il rosso
non parlerebbe del prodotto.

## `test.fail()`: oggi non ce n'è nessuno

**La suite non contiene più nessun `test.fail()`.** È la notizia buona: ogni
difetto che questa suite aveva trovato è stato corretto, e i test che li
riproducevano sono diventati guardie di regressione.

La regola con cui si toglie l'annotazione è l'unica cosa che conta ed è sempre
la stessa: **si toglie dopo aver visto il test passare davvero**, con database
seedato e browser vero. `test.fail()` che passa Playwright lo segnala come
«Expected to fail, but passed» — quello è il segnale, non il commit che dice di
aver corretto il difetto. Toglierla sulla fiducia trasforma una riproduzione
eseguibile in un'asserzione finta, che è ciò per cui la suite precedente (34
`expect(true).toBe(true)`) è stata cancellata.

Storico, per chi si chiede cosa difendono questi test:

| Dove | Difetto, e dov'è stato chiuso |
| --- | --- |
| `chiusura-cassa.spec.ts` | `PUT /api/chiusure/[id]` rispondeva sempre 500: cancellava le postazioni contando su un cascade verso `cash_counts` che non c'è (`onDelete: Restrict`), e nessuna chiusura era modificabile. Corretto in `857f4ef`, annotazione tolta l'8 ago 2026 dopo esecuzione. |
| `prima-nota.spec.ts` | Il campo «IVA (opzionale)» lasciato vuoto produceva `NaN` e bloccava il salvataggio: un campo dichiarato opzionale era di fatto obbligatorio. Corretto in `f5a56e2`, annotazione tolta l'8 ago 2026 dopo esecuzione. |
| `mobile.spec.ts` | A 390 px sfondavano la prima nota (32 px) e lo scadenzario (405 px). Corretti in W4; la marcatura `difettoNoto` era già stata tolta allora. |
| `offline.spec.ts` | La coda mai riempita e il fallback a una pagina non precacheata. Corretti in W4, annotazioni tolte allora dopo esecuzione contro una build di produzione. |

Resta in `mobile.spec.ts` il ramo `if (pagina.difettoNoto) test.fail()`: nessuna
delle pagine elencate porta più quella proprietà, quindi il ramo non viene mai
preso. Non dà errore di tipo perché `e2e` è escluso da `tsconfig.json` e non è
nominato in `eslint.config.mjs`: **questa cartella oggi non è né type-checked né
lintata**, ed è il motivo per cui un accesso a una proprietà inesistente ci vive
tranquillo.

## Un rosso vero, intermittente

`offline.spec.ts` › «la pagina appena visitata si ricarica e resta compilabile»
**fallisce circa una volta su due** (misurato: 5 rossi su 10 esecuzioni contro
una build di produzione). Quando fallisce, la pagina ricaricata senza rete
mostra la pagina «Sei offline» invece del modulo — cioè esattamente lo scenario
che `attendiPaginaInCache` esiste per escludere.

Quello che si sa, verificato:

- il documento **è** correttamente in cache (`others`) e contiene la pagina
  vera: controllato quattro volte su quattro, mai il fallback;
- inserendo un centinaio di millisecondi di lavoro fra l'attesa e
  `setOffline(true)` il test passa quattro volte su quattro.

Quindi l'attesa si dichiara soddisfatta troppo presto: il documento c'è, ma
qualcos'altro che serve alla navigazione offline non è ancora pronto. **Non è
stato aggiunto un ritardo per farlo passare**, perché nasconderebbe la domanda
che conta: se la corsa è nel prodotto e non nel test, un operatore che perde la
rete subito dopo aver aperto la chiusura si vede «Sei offline» al posto del
modulo che stava compilando. Distinguere i due casi richiede di guardare la
configurazione del service worker, che non è di questa cartella.

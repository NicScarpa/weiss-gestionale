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

## `test.fail()`: i difetti trovati e non corretti

Cinque test sono marcati `test.fail()`. Non sono test disattivati: **vengono
eseguiti e devono fallire**. Sono riproduzioni eseguibili di difetti del
prodotto che questa suite ha trovato e che non le competeva correggere. Quando
il difetto verrà risolto il test diventerà rosso — ed è quello il segnale per
togliere l'annotazione.

| Dove | Difetto |
| --- | --- |
| `chiusura-cassa.spec.ts` | `PUT /api/chiusure/[id]` risponde sempre 500: cancella le postazioni contando su un cascade verso `cash_counts` che non c'è (`onDelete: Restrict`). Nessuna chiusura è modificabile né inviabile da `/chiusura-cassa/[id]/modifica`. |
| `prima-nota.spec.ts` | Il campo «IVA (opzionale)» lasciato vuoto produce `NaN` e blocca il salvataggio: un campo dichiarato opzionale è di fatto obbligatorio. |
| `mobile.spec.ts` | A 390 px sfondano orizzontalmente la prima nota (32 px) e lo scadenzario (405 px). |

Il dettaglio, con file e riga, sta nel commento sopra ciascun test.

I due difetti di `offline.spec.ts` — la coda mai riempita e il fallback a una
pagina non precacheata — sono stati corretti in W4. L'annotazione è stata tolta
dopo aver visto i test passare contro una build di produzione, non prima:
toglierla e basta li avrebbe trasformati in asserzioni finte.

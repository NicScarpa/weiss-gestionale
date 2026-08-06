# A2 — Sicurezza & Controllo Accessi

**Data:** 2026-08-06 · **Branch:** `scadenzario/stima-data-attesa` · **Metodo:** sola lettura, nessuna
esecuzione dell'app, nessuna scrittura fuori da `audit/`.

**Perimetro coperto:** autenticazione (NextAuth v5), middleware, autorizzazione per ruolo su tutte le
180 route API, isolamento dei dati, gestione segreti, cifratura, audit trail, rate limiting, upload,
header di sicurezza, dipendenze. Include la regressione sui 47 VULN di `SECURITY_AUDIT_REPORT.md`
(feb 2026) dopo l'ondata di remediation di agosto 2026.

---

## Sintesi

La remediation di agosto ha chiuso davvero la maggior parte dei 47 VULN: sessione a 8 ore, cifratura
AES-256-GCM dei campi sensibili, soft delete sulle scritture, security header, SSL sul database,
policy password a 10 caratteri con complessità, `/api/docs` spento in produzione, cron protetti da
`CRON_SECRET`, Sentry senza PII, service worker che non cachea le API, migrazione da `xlsx` a
`exceljs`. La history git è pulita: nessun `.env` né `credenziali*.env` risulta più aggiunto in
alcun commit raggiungibile.

Restano però **quattro problemi di rilievo**, tutti nati dallo stesso schema: un meccanismo di
sicurezza è stato costruito correttamente ma applicato solo in parte del codice.

1. Un dipendente (`staff`) autenticato può **riclassificare in blocco le scritture di prima nota**
   chiamando direttamente un endpoint privo di controllo di ruolo.
2. Le credenziali dei portali esterni (**Agenzia delle Entrate**, banca, HR) sono in chiaro su disco
   nella cartella del progetto.
3. Il blocco del seed in produzione si basa su `NODE_ENV` e **non protegge** dallo scenario reale:
   `.env` punta al database di produzione e il comando parte dalla macchina di sviluppo.
4. Le dipendenze di produzione hanno **21 vulnerabilità critical/high**, incluse una critica su
   `next-auth`/`@auth/core` (il livello di autenticazione) e una su `jspdf`.

Gli helper `requireAuth`/`requireRole` esistono in `src/lib/api-utils.ts` e sono scritti bene, ma
sono usati in **1 route su 180**: le altre 163 ripetono a mano `const session = await auth()` e il
controllo di ruolo, quando c'è, è copiato in forme diverse. È questa duplicazione, non un errore
isolato, la causa dei buchi trovati.

---

## Registro dei finding

| ID | Sev | Confidenza | Area | File | Sintesi | Effort |
|----|-----|------------|------|------|---------|--------|
| A2-01 | **Alta** | Certa | Autorizzazione | `src/app/api/categorization-rules/proposals/route.ts` | Qualsiasi utente autenticato riclassifica in blocco scritture di prima nota | S |
| A2-02 | **Alta** | Certa | Segreti | `credenziali.env`, `credenziali_fluida.env` | Credenziali Entratel/Sibill/Fluida/Sesame in chiaro nella root del progetto | S |
| A2-03 | **Alta** | Certa | Integrità dati | `prisma/seed.ts`, `package.json` | Il guard anti-seed usa `NODE_ENV`: non blocca `db:seed`/`db:reset` verso il DB di produzione | S |
| A2-04 | **Alta** | Certa | Dipendenze | `package.json` | 21 vulnerabilità critical/high in produzione, tra cui `next-auth` beta.30 (CVE critica) e `jspdf` 4.2.0 | M |
| A2-05 | Media | Certa | Autorizzazione | 12 route (elenco sotto) | Route con dati finanziari accessibili a qualsiasi ruolo, contro la convenzione in `src/CLAUDE.md` | M |
| A2-06 | Media | Certa | Autenticazione | `src/lib/api-utils.ts` + 179 route | `mustChangePassword` non applicato lato server: il cambio password forzato è solo una modale | M |
| A2-07 | Media | Certa | Tracciabilità | 29 route finanziarie | Audit trail parziale; nessun log su login, logout e tentativi falliti | M |
| A2-08 | Media | Certa | Anti-abuso | `src/lib/rate-limit.ts` | Rate limiting su 8 endpoint su 180; Upstash non configurato → fallback in-memory per processo | M |
| A2-09 | Media | Alta | Upload | `src/app/api/documents/route.ts` | Magic bytes verificati solo se il client dichiara PDF; `contentType` del client riemesso `inline` → XSS stored | S |
| A2-10 | Media | Certa | Integrità dati | `cashflow/summary`, `pagamenti/summary` | Le query SQL raw aggirano il soft delete: i record cancellati rientrano nei totali | S |
| A2-11 | Media | Certa | Hardening | `next.config.ts` | CSP con `'unsafe-inline'` e `'unsafe-eval'` su `script-src` | M |
| A2-12 | Bassa | Certa | Autenticazione | `src/app/api/staff/invite/route.ts` | Token invito con `randomUUID` (122 bit); link generico riutilizzabile 7 giorni senza binding email | S |
| A2-13 | Bassa | Certa | Autorizzazione | `products`, `recurring-expenses`, `proposals` | `venueId` accettato dal body senza verifica | S |
| A2-14 | Bassa | Certa | Segreti | `README.md`, `prisma/seed.ts` | Credenziali di default documentate (`admin123`) e password deboli nel seed; vedi anche la raccomandazione P2 sui dati di produzione | S |
| A2-15 | Bassa | Certa | Configurazione | `.env`, `.env.example` | `NEXT_PUBLIC_APP_URL` assente dal `.env` (CORS e link invito); `DATABASE_CA_CERT` non documentato | S |
| A2-16 | Bassa | Certa | Tracciabilità | `src/lib/audit.ts` | Log scritti fuori transazione con errori silenziati; nessuna protezione da manomissione | M |
| A2-17 | Bassa | Alta | Cifratura | `src/lib/encryption.ts` | Nessun versioning della chiave: una rotazione rende illeggibili i dati già cifrati | M |
| A2-18 | Bassa | Certa | Conformità | — | Nessun meccanismo di anonimizzazione/cancellazione GDPR per i dati dei dipendenti | L |

---

## Dettaglio dei finding rilevanti

### A2-01 — Riclassificazione della prima nota senza controllo di ruolo (Alta)

`POST /api/categorization-rules/proposals` verifica solo che esista una sessione. Non controlla il
ruolo, non valida il body con Zod, prende `venueId` dal client e non scrive audit log. Il corpo della
transazione fa questo:

```ts
await tx.journalEntry.updateMany({
  where: { id: { in: matchingEntryIds } },
  data: { budgetCategoryId, appliedRuleId: rule.id, categorizationSource: 'rule' },
})
```

`matchingEntryIds` arriva dal client e non viene validato contro nulla: un utente `staff` — nel
contesto reale, un barista con accesso al portale dipendenti — può inviare una lista arbitraria di ID
di scritture contabili e riassegnarle a una categoria di budget a sua scelta, senza lasciare traccia.
L'effetto non è la cancellazione di dati ma la falsificazione della loro classificazione, che è
esattamente ciò su cui si costruiscono budget, report e analisi costi.

Lo stesso vale, con impatto minore, per tutto il CRUD di `/api/categorization-rules` e
`/api/budget-categories` (compresi `[id]`, `mappings`, `reorder`, `seed`): i 403 presenti in quei file
sono controlli di regola di business (categoria di sistema non modificabile), non controlli di ruolo.

**Rimedio:** applicare `requireRole(session, ['admin', 'manager'])`, validare il body con Zod,
risolvere `venueId` con `getVenueId()` e aggiungere `createAuditLog`.

### A2-02 — Credenziali di terze parti in chiaro nella root (Alta)

`credenziali.env` e `credenziali_fluida.env` sono presenti sul disco nella cartella del progetto.
Contengono, in chiaro:

- **FISCONLINE / ENTRATEL** — codice fiscale, password e PIN (accesso ai servizi dell'Agenzia delle
  Entrate: dichiarazioni, fatturazione elettronica, cassetto fiscale)
- **SIBILL** — utenza e password (aggregatore bancario)
- **FLUIDA** e **SESAME** — utenze e password (piattaforme HR)

Verificato che sono correttamente in `.gitignore` (riga 41: `credenziali*.env`) e che **non compaiono
in nessun commit** della history riscritta. Il rischio residuo non è git: è che credenziali di questo
peso stiano in chiaro accanto al codice, dove finiscono in backup di cartella, sincronizzazioni cloud
e nel contesto di qualsiasi strumento che legga la directory di progetto. Il PIN Entratel, in
particolare, non è ruotabile con la stessa facilità di una password applicativa.

**Rimedio:** spostarli fuori dall'albero di progetto, in un password manager. Se serve un file locale,
tenerlo in una directory diversa da quella del repository.

### A2-03 — Il blocco del seed non copre lo scenario reale (Alta)

`prisma/seed.ts` si apre con:

```ts
if (process.env.NODE_ENV === 'production') {
  console.error('SEED BLOCCATO IN PRODUZIONE')
  process.exit(1)
}
```

Il guard controlla la variabile sbagliata. `.env` punta al pooler Supabase di **produzione**, e
`npm run db:seed` gira via `tsx` da una macchina di sviluppo dove `NODE_ENV` non vale `production`:
il guard passa e il seed scrive sul database reale. `npm run db:reset` è peggio, perché premette
`prisma db push --force-reset`, che azzera lo schema prima di riseminare.

Il preflight ha già segnato questi comandi come vietati durante l'audit, ma la protezione è
procedurale (ci si ricorda di non lanciarli) mentre dovrebbe essere nel codice.

**Rimedio:** derivare il guard dalla destinazione invece che dall'ambiente — bloccare se
`DATABASE_URL` contiene l'host di produzione (`pooler.supabase.com`), a meno di una variabile di
conferma esplicita del tipo `I_KNOW_THIS_IS_PROD=1`.

### A2-04 — 21 vulnerabilità critical/high nelle dipendenze di produzione (Alta)

`npm audit --omit=dev` riporta 45 vulnerabilità totali, di cui 21 critical/high. Le due che toccano
direttamente la sicurezza dell'applicazione:

| Pacchetto | Versione | Problema | Fix |
|-----------|----------|----------|-----|
| `next-auth` / `@auth/core` | 5.0.0-beta.30 / 0.41.0 | **Critical** — errori di configurazione possono far fallire in modo permissivo i controlli di autenticazione basati su esistenza; `getToken()` solleva eccezione non gestita su header Bearer malformati | `next-auth@5.0.0-beta.32` |
| `jspdf` | 4.2.0 | **Critical** — PDF object injection e HTML injection | aggiornamento disponibile |

Le altre riguardano la catena di build e strumenti (`rollup`, `postcss`, `picomatch`, `tmp`,
`brace-expansion`), più `axios` (SSRF via bypass di NO_PROXY), `sharp`, `node-forge`, `form-data`,
`protobufjs`, `websocket-driver`. Va notato che `jspdf` era già stato aggiornato a 4.2.0 per chiudere
VULN-008: la versione target di febbraio ha nel frattempo accumulato nuove CVE. È il segnale che
serve un controllo ricorrente, non una bonifica una tantum.

**Rimedio:** `npm audit fix`, poi salire a `next-auth@5.0.0-beta.32` verificando la compatibilità del
callback `jwt`/`session`. Aggiungere `npm audit --omit=dev` alla CI.

### A2-05 — Route finanziarie senza guard di ruolo (Media)

`src/CLAUDE.md` stabilisce che «le route con dati finanziari (prima nota, scadenzario, budget,
pagamenti, report, riconciliazione, cash flow, movimenti bancari) richiedono ruolo `admin` o
`manager`». Queste non lo fanno — si fermano al controllo di sessione:

| Route | Metodi | Cosa espone/consente a un `staff` |
|-------|--------|-----------------------------------|
| `/api/categorization-rules` + `[id]`, `proposals` | GET POST PATCH DELETE | vedi A2-01 |
| `/api/budget-categories` + `[id]`, `mappings`, `reorder`, `seed` | GET POST PUT DELETE | modifica del piano delle categorie di budget |
| `/api/chiusure/[id]/pdf` | GET | scarica il PDF di qualsiasi chiusura di cassa |
| `/api/chiusure/[id]/excel` | GET | idem, in Excel |
| `/api/chiusure/[id]/submit` | POST | invia una chiusura in approvazione |
| `/api/dashboard/forecast` | GET | previsione di cassa a 30 giorni e saldi proiettati |
| `/api/payee-suggestions` | GET | elenco fornitori e beneficiari |
| `/api/venues/[id]/cash-stations` | GET | configurazione delle postazioni di cassa |

Il layout della dashboard reindirizza lo staff al portale, quindi il buco non è raggiungibile
cliccando nella UI: va sfruttato chiamando l'API. Per un gestionale con accesso dipendenti su
dispositivo personale è una distinzione debole.

Nota: `/api/venues/[id]/staff` restituisce solo nome, cognome ed email dei colleghi — nessun dato
retributivo. Le route su dipendenti e retribuzioni (`/api/staff`, `/api/staff/[id]`,
`/api/attendance/records`) sono invece correttamente protette, così come il download dei cedolini dal
portale (`/api/portal/documents/[id]` verifica la proprietà del documento).

### A2-06 — `mustChangePassword` non è applicato lato server (Media)

`requireAuth()` in `src/lib/api-utils.ts` gestisce correttamente il caso, restituendo 403 con codice
`MUST_CHANGE_PASSWORD`. Ma è usato in **una sola route** (`/api/chiusure`). Le altre 163 fanno il
controllo a mano e si limitano a `if (!session?.user)`. Il solo enforcement reale è
`src/components/auth/ForcePasswordChangeModal.tsx`, cioè una modale lato client.

Conseguenza: un utente a cui l'admin ha resettato la password con `/api/users/[id]/reset-password`
può continuare a usare l'intera applicazione via API senza mai cambiare la password temporanea.
L'impatto è contenuto dal fatto che la password temporanea è generata con `randomBytes(16)` e quindi
non indovinabile, ma la garanzia di rotazione che il flusso promette non esiste.

VULN-019 del report di febbraio va quindi considerata **ancora aperta**.

### A2-07 — Audit trail parziale, autenticazione non tracciata (Media)

`createAuditLog` è ben fatto (utente, azione, entità, valori prima/dopo, IP, user-agent) ed è usato
in 35 route. Restano scoperte 29 route che mutano dati finanziari, tra cui:

- `POST /api/pagamenti/[id]/esegui` — esecuzione di un pagamento
- `PATCH/DELETE /api/pagamenti/[id]` e `POST /api/pagamenti`
- tutta la famiglia `/api/bank-transactions/*` (import, match, unmatch, confirm, ignore, delete)
- `DELETE /api/invoices/[id]`, `POST /api/invoices/bulk-delete`
- `/api/settings/initial-balances` (saldi iniziali dei conti)
- `/api/cashflow/forecasts/*`

`chiusure/[id]/validate` è invece coperto, perché delega a `closure-service.ts` che logga.

Inoltre **non esiste alcun audit degli eventi di autenticazione**: `src/lib/auth.ts` aggiorna
`lastLoginAt` ma non scrive audit log, e il tipo `AuditLogParams` prevede le azioni `LOGIN` e
`PASSWORD_CHANGE` che non vengono mai usate. Non c'è quindi modo di ricostruire chi è entrato, da
dove, né di accorgersi di una campagna di tentativi falliti.

### A2-08 — Copertura e affidabilità del rate limiting (Media)

Il rate limiting è applicato a 8 endpoint su 180: il login (in `auth.ts`, chiave IP+identificativo),
`change-password`, `forgot-password`, `reset-password`, `bank-transactions`, `chiusure`,
`prima-nota/import`, `users`. Gli endpoint di lettura massiva ed export non ne hanno.

Più rilevante: `.env` non contiene `UPSTASH_REDIS_REST_URL`/`_TOKEN`, quindi il limiter cade sul
fallback in-memory, una `Map` di processo. Su Railway questo significa che il contatore si azzera a
ogni riavvio o deploy e non è condiviso tra istanze: la protezione anti brute-force sul login è molto
più debole di quanto il codice suggerisca. Il fallback logga un `warn` all'avvio, ma nulla lo rende
evidente in esercizio.

### A2-09 — Upload documenti: validazione condizionata al MIME dichiarato dal client (Media)

In `src/app/api/documents/route.ts` (upload dei cedolini):

```ts
if (file.type === 'application/pdf') {
  if (!fileBuffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) { ... }
}
```

Il controllo dei magic bytes scatta solo se il client **dichiara** `application/pdf`. Dichiarando
`text/html` non viene fatta alcuna verifica, non esiste allow-list di tipi, e `file.type` viene
salvato in `contentType` e poi riemesso in risposta da `/api/documents/[id]` con
`Content-Disposition: inline` (e da `/api/portal/documents/[id]`, sempre `inline`). Un file HTML
servito inline dall'origine dell'applicazione, con una CSP che ammette `'unsafe-inline'` (A2-11),
esegue script nel contesto della sessione di chi lo apre — potenzialmente un dipendente che scarica
quello che crede sia il proprio cedolino.

L'upload è riservato ad `admin`, il che riduce la probabilità, ma il pattern corretto esiste già a
pochi file di distanza: `/api/scadenzario/[id]/allegati` ha allow-list dei MIME e mappa dei magic
bytes per tipo. Va replicato.

### A2-10 — Il soft delete viene aggirato dalle query raw (Media)

L'estensione Prisma aggiunge `deletedAt: null` a `findMany`, `count`, `aggregate`, `groupBy`.
`$queryRaw` non passa dall'estensione, e due riepiloghi finanziari non filtrano a mano:

- `src/app/api/cashflow/summary/route.ts` — `SELECT AVG(...) FROM journal_entries WHERE venue_id = ...`
- `src/app/api/pagamenti/summary/route.ts` — `SELECT stato, COUNT(*) FROM payments GROUP BY stato`

`JournalEntry` e `Payment` sono entrambi in `SOFT_DELETE_MODELS`. I record cancellati continuano
quindi a pesare sulla previsione di cassa e sui conteggi per stato dei pagamenti. Le query sono
tagged template, quindi parametrizzate: nessun rischio di SQL injection. Il problema è solo il
filtro mancante — va aggiunto `AND deleted_at IS NULL`.

### A2-11 — CSP permissiva (Media)

`script-src 'self' 'unsafe-inline' 'unsafe-eval'` annulla gran parte del valore difensivo della CSP
contro l'XSS, ed è ciò che rende sfruttabile A2-09. `'unsafe-eval'` è richiesto da alcune librerie
(il rendering PDF lato client è il sospetto principale); `'unsafe-inline'` è tipicamente eliminabile
passando ai nonce generati nel middleware. Da affrontare dopo A2-09, che è il rimedio più economico.

### A2-12 — Token di invito (Bassa)

`globalThis.crypto.randomUUID()` fornisce 122 bit di entropia contro i 256 di `randomBytes(32)` già
usato nel reset password: non è sfruttabile in pratica, ma è un'incoerenza gratuita.

Più interessante il design del **link generico**: `email: null`, valido 7 giorni, riutilizzabile
finché nessuno lo consuma, e chi lo possiede completa la registrazione creando da sé un account con
ruolo `staff` (`/api/staff/invite/complete` è pubblico per necessità). Il binding email c'è ma solo
per gli inviti nominali. Chiunque intercetti o riceva il link — inoltrato su WhatsApp, per dire —
entra nel portale dipendenti. Se la funzione serve così com'è, andrebbe almeno accorciata la durata e
tracciato in audit ogni consumo.

---

## Raccomandazione P2 — verificare le credenziali di default sui dati di produzione

**Non è un finding: non abbiamo alcuna evidenza sullo stato reale degli account di produzione, né in
un senso né nell'altro. È una verifica che manca, e che solo il proprietario può fare.**

VULN-007 e VULN-018 sono state chiuse a febbraio mettendo in sicurezza il **codice**: il seed si
rifiuta di girare con `NODE_ENV=production` (con il limite descritto in A2-03) e nel bundle client non
restano password. Nessuna delle due, però, dice nulla sui **dati già presenti** nel database di
produzione: se un account fu creato quando le default erano in uso, la sua password è ancora quella,
e nessun intervento sul codice la cambia retroattivamente.

Le default note e pubblicate nel `README.md` (righe 59-61) sono `admin@weisscafe.it / admin123`,
`manager@weisscafe.it / manager123`, `staff@weisscafe.it / staff123`; il seed ne usa altre della
stessa forma (`extra123`). L'applicazione è raggiungibile da Internet su Railway.

**Come verificare, senza tentare alcun login.** Provare le credenziali contro la produzione sarebbe
una verifica distruttiva: aggiorna `lastLoginAt`, consuma il flag di primo accesso e, sugli account
dei dipendenti, rischia di bloccare fuori una persona che usa il portale per timbrare. Il controllo
va fatto dal pannello Supabase, in lettura:

1. Elencare gli account con `SELECT email, must_change_password, last_login_at, created_at FROM users`.
2. Trattare come sospetti quelli creati agli albori del progetto che non hanno mai cambiato password.
3. Forzare un reset dal pannello utenti dell'applicazione per tutti i sospetti, invece di verificarne
   la password.
4. Rimuovere le credenziali dal `README.md` (A2-14), che è la ragione per cui sono note.

Una nota di metodo per chi eseguirà il punto 2: come da A2-07 **non esiste audit degli eventi di
autenticazione**, quindi `lastLoginAt` è l'unico segnale disponibile e registra solo l'ultimo accesso
riuscito. Non permette di escludere accessi passati, e nessun log applicativo li ricostruisce.
L'assenza di tracce, qui, non è prova che non sia successo nulla.

---

## Regressione sui 47 VULN di febbraio 2026

| Esito | VULN | Note |
|-------|------|------|
| **Risolti (verificati)** | 001, 015, 016, 017, 020, 021, 023, 024, 026, 030, 031, 032, 034, 035, 037, 042 | history pulita; sessione 8h; AES-256-GCM; header presenti; i cascade rimasti sono su modelli non finanziari; SSL con `rejectUnauthorized`; `exceljs`; Next 16.1.6; policy 10 caratteri; Zod su prima nota; docs spento in produzione; CORS nel middleware; Sentry senza PII; SW `NetworkOnly` sulle API; pool 20 + timeout; cron con `CRON_SECRET` |
| **Risolti per architettura** | 002, 009, 010, 011, 012, 013, 014, 029, 039, 040 | l'app è dichiaratamente single-venue: `getVenueId()` risolve l'unica sede e i confronti cross-venue sono tautologici (documentato in `src/lib/venue.ts`). Da riaprire in blocco se si torna al multi-sede |
| **Risolti solo in parte** | 004 → A2-08 · 005 → A2-07 · 006 → A2-10 · 007 → A2-03 · 008 → A2-04 · 019 → A2-06 · 027/028 → A2-12 · 033 → A2-09 · 036 → A2-04 | il meccanismo è stato costruito ma non applicato ovunque |
| **Ancora aperti** | 018 (parziale: nessuna password nel bundle client, ma restano nel `README.md` → A2-14) · 022 (GDPR → A2-18) · 038 (import non atomico: nessun `$transaction` in `prima-nota/import` né `bank-transactions/import`) · 046 (dipendenze → A2-04) | |
| **Chiusi nel codice, non verificati nei dati** | 007, 018 | il seed è protetto e il bundle è pulito, ma nessuno ha controllato se gli account **già esistenti** in produzione portino ancora le default → raccomandazione P2 nella sezione dedicata |
| **Non verificati** | 041 (backup), 043, 044, 045, 047 | fuori dal perimetro di lettura statica o già coperti da altri agenti |
| **Nuovo, non presente a febbraio** | A2-01, A2-02, A2-10, A2-11 | |

---

## Nota trasversale per il consolidamento

Il problema strutturale non è nessuno dei singoli finding, ma il fatto che **il controllo di accesso
è duplicato 180 volte a mano**. `requireAuth`/`requireRole` sono scritti, testabili e usati una volta
sola; ogni route reimplementa `const session = await auth(); if (!session?.user) return 401` e poi,
facoltativamente, un controllo di ruolo in una delle almeno quattro forme presenti nel codice
(`session.user.role !== 'admin'`, lettura del ruolo dal DB, `canPerformAction`, array di ruoli
ammessi). In un impianto così, una route nuova nasce insicura per default e nessuno se ne accorge.

L'intervento con il miglior rapporto tra costo e rischio evitato è un wrapper unico
(`withAuth(handler, { roles })`) applicato a tutte le route, con una verifica in CI che fallisca se
un `route.ts` esporta un handler che non ci passa. Tutti i finding A2-01, A2-05 e A2-06 sparirebbero
insieme, e non potrebbero ripresentarsi.

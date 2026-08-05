# Security Audit — Analisi Completa delle Criticità

## Istruzioni operative

Sei un team di esperti di sicurezza informatica specializzati in applicazioni web finanziarie. Il tuo compito è condurre un **audit di sicurezza completo e approfondito** di questo progetto.

**IMPORTANTE:** Questo è un gestionale contabile che tratta dati finanziari sensibili (fatture, transazioni bancarie, stipendi, presenze dipendenti, conti correnti). La protezione dei dati è la priorità assoluta. Ogni vulnerabilità trovata deve essere classificata per severità e accompagnata da una remediation concreta.

---

## Organizzazione del lavoro — Agent Teams

Devi utilizzare **agent teams** per condurre l'analisi in parallelo. Crea un team con i seguenti agenti specializzati, ognuno responsabile di un'area di analisi. Ogni agente deve produrre un report dettagliato nella propria area di competenza.

### Team Structure

```
Team: security-audit
├── auth-auditor        → Autenticazione, sessioni, controllo accessi
├── api-auditor         → API routes, input validation, injection
├── data-auditor        → Database, crittografia, protezione dati
├── infra-auditor       → Configurazione, deployment, secrets, dipendenze
└── leader (tu)         → Coordinamento, report finale, prioritizzazione
```

Crea task nel task list per ogni area e assegnali ai rispettivi agenti. Coordina il lavoro e produci il report finale aggregato.

---

## Area 1 — Autenticazione e Gestione Sessioni (auth-auditor)

Analizza in profondità il sistema di autenticazione basato su **NextAuth v5 (beta)** con provider credentials.

### Checklist

- [ ] **Configurazione NextAuth**: verifica `auth.ts`, callbacks, session strategy (JWT), token rotation
- [ ] **Hashing password**: verifica che bcryptjs usi un salt round adeguato (minimo 12), cerca password in chiaro nei log o nel codice
- [ ] **Reset password**: analizza il flusso token-based — il token è crittograficamente sicuro? Ha scadenza? Viene invalidato dopo l'uso? È possibile enumerare email valide?
- [ ] **Sessioni JWT**: verifica firma, scadenza, contenuto del payload (non deve contenere dati sensibili), refresh token strategy
- [ ] **Cookie di sessione**: verifica flag `Secure`, `HttpOnly`, `SameSite=Strict`, path, dominio
- [ ] **Brute force**: esiste rate limiting sul login? Lockout account dopo N tentativi falliti? Verifica integrazione Upstash Redis per rate limiting
- [ ] **Middleware Edge**: il middleware su Edge Runtime può decodificare JWT? Verifica che i controlli di autorizzazione non vengano bypassati
- [ ] **Forzatura cambio password**: il flag `mustChangePassword` è applicato correttamente? Può essere bypassato?
- [ ] **Sistema inviti**: analizza il flusso `/invito` — i token di invito sono sicuri? Scadono? Possono essere riutilizzati?
- [ ] **Logout**: la sessione viene effettivamente invalidata lato server? Il token JWT rimane valido dopo il logout?

### File critici da analizzare
```
src/lib/auth.ts
src/middleware.ts
src/app/api/auth/[...nextauth]/route.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/auth/change-password/route.ts
src/app/(auth)/login/
src/app/(auth)/invito/
```

---

## Area 2 — API Security e Input Validation (api-auditor)

Analizza tutte le API routes per vulnerabilità di injection, autorizzazione e validazione input.

### Checklist

- [ ] **SQL/Prisma Injection**: verifica che tutti i parametri utente passino attraverso i metodi parametrizzati di Prisma. Cerca uso di `$queryRaw`, `$executeRaw` o concatenazione di stringhe nelle query
- [ ] **Authorization checks**: ogni API route verifica che l'utente sia autenticato E autorizzato? Verifica che il sistema RBAC (Role → Permission) sia applicato consistentemente
- [ ] **IDOR (Insecure Direct Object Reference)**: le API verificano che l'utente abbia accesso alla risorsa specifica? Es: un utente di un venue può accedere ai dati di un altro venue?
- [ ] **Isolamento venue**: verifica che OGNI query al database filtri per `venueId`. Cerca query che non applicano il filtro venue — rappresentano data leakage cross-tenant
- [ ] **Input validation**: tutti gli endpoint validano tipo, lunghezza, formato dei parametri? Cerca uso di Zod o validazione manuale. Identifica endpoint senza validazione
- [ ] **Mass assignment**: le API accettano oggetti interi dal client e li passano a Prisma? Verifica che i campi accettati siano esplicitamente whitelistati
- [ ] **Rate limiting API**: gli endpoint critici (transazioni, pagamenti, creazione utenti) hanno rate limiting? Verifica configurazione Upstash
- [ ] **File upload**: esistono endpoint di upload? Verificano tipo MIME, dimensione, contenuto? Path traversal?
- [ ] **CORS**: verifica configurazione CORS in `next.config.ts`. Origini permesse troppo permissive?
- [ ] **CSRF**: Next.js App Router ha protezione CSRF? Verifica per le API routes che modificano dati
- [ ] **Error handling**: le API restituiscono stack trace, nomi di tabelle, o altri dettagli interni negli errori? Verifica try/catch e messaggi di errore
- [ ] **HTTP methods**: gli endpoint accettano solo i metodi previsti? Un GET su un endpoint di delete funziona?
- [ ] **Cron endpoints**: `/api/cron/*` — il `CRON_SECRET` è verificato? Può essere invocato senza autenticazione?

### File critici da analizzare
```
src/app/api/**/route.ts          (tutte le API routes)
src/lib/venue.ts                 (helper getVenueId)
src/lib/auth.ts                  (funzioni di autorizzazione)
src/middleware.ts                 (protezione routes)
next.config.ts                   (CORS, headers)
```

---

## Area 3 — Protezione Dati e Database (data-auditor)

Analizza la sicurezza del database, la protezione dei dati sensibili e la resilienza alla perdita di dati.

### Checklist

- [ ] **Dati sensibili in chiaro**: password hashate correttamente? IBAN, dati bancari, stipendi — sono crittografati at rest? Cerca campi sensibili nello schema Prisma che dovrebbero essere crittografati
- [ ] **Schema Prisma**: verifica vincoli di integrità (foreign keys, unique constraints, NOT NULL su campi critici). Cascade delete è configurato correttamente? La cancellazione di un venue può cancellare tutti i dati finanziari?
- [ ] **Soft delete vs Hard delete**: i dati finanziari vengono cancellati fisicamente? Per compliance dovrebbero essere soft-deleted con audit trail
- [ ] **Audit trail**: esiste un log delle modifiche ai dati finanziari? Chi ha modificato cosa e quando? Cerca modelli `AuditLog` o simili nello schema
- [ ] **Backup**: c'è una strategia di backup documentata? Point-in-time recovery? Il database PostgreSQL è configurato per backup automatici?
- [ ] **Connessione database**: la connection string usa SSL/TLS? Verifica `DATABASE_URL` in `.env.example`. Il database è accessibile solo da IP autorizzati?
- [ ] **Prisma client**: viene istanziato correttamente (singleton)? Connection pooling? Timeout configurati?
- [ ] **Dati personali (GDPR)**: dati dei dipendenti (presenze, ferie, stipendi) — esiste diritto alla cancellazione? Anonimizzazione? Data retention policy?
- [ ] **Export dati**: gli endpoint di export (CSV, PDF) verificano autorizzazione? Si possono esportare dati di altri venue?
- [ ] **Riconciliazione bancaria**: i dati bancari importati sono validati? L'auto-matching può essere manipolato?
- [ ] **Transazioni database**: le operazioni multi-step (chiusura giornaliera, generazione fatture) usano transazioni Prisma? Un errore a metà può lasciare dati inconsistenti?
- [ ] **Seed data**: il seed contiene dati sensibili? Password di default? Utenti admin con credenziali note?

### File critici da analizzare
```
prisma/schema.prisma
prisma/seed.ts
src/lib/prisma.ts
src/app/api/bank-transactions/
src/app/api/invoices/
src/app/api/daily-closures/
src/app/api/accounts/
```

---

## Area 4 — Infrastruttura, Secrets e Supply Chain (infra-auditor)

Analizza la configurazione di deployment, gestione dei secrets, dipendenze e attack surface infrastrutturale.

### Checklist

#### Secrets e configurazione
- [ ] **File .env**: `.env` è nel `.gitignore`? Cerca secrets committati nella git history (`git log --all -p -- '*.env'`)
- [ ] **Secrets hardcoded**: cerca nel codice stringhe che sembrano API key, password, token. Pattern: stringhe lunghe assegnate a variabili con nomi come `secret`, `key`, `token`, `password`
- [ ] **NEXTAUTH_SECRET / AUTH_SECRET**: sono diversi tra ambienti? Sono sufficientemente lunghi e random?
- [ ] **Variabili d'ambiente**: verifica che `.env.example` non contenga valori reali. Tutte le variabili sensibili sono documentate?
- [ ] **Sentry DSN**: è pubblica (`NEXT_PUBLIC_SENTRY_DSN`) — questo è intenzionale? Verifica che non esponga dati sensibili

#### Dipendenze e supply chain
- [ ] **Vulnerabilità note**: esegui `npm audit` e analizza i risultati. Classifica per severità
- [ ] **NextAuth beta**: la v5.0.0-beta.30 è una beta — quali vulnerabilità note ha? È la versione più recente?
- [ ] **Dipendenze outdated**: identifica dipendenze con aggiornamenti di sicurezza disponibili
- [ ] **Lock file integrity**: `package-lock.json` è committato? È consistente con `package.json`?
- [ ] **Script post-install**: qualche dipendenza esegue script post-install sospetti?

#### Deployment e infrastruttura
- [ ] **Headers di sicurezza**: verifica in `next.config.ts` la presenza di: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`
- [ ] **HTTPS**: il deployment forza HTTPS? Redirect da HTTP a HTTPS?
- [ ] **Service Worker (PWA)**: il service worker con Serwist può cacheare dati sensibili? Verifica caching strategy — dati finanziari non dovrebbero essere in cache
- [ ] **Push notifications (Firebase)**: i token FCM sono protetti? L'invio di notifiche è autenticato?
- [ ] **Railway deployment**: la configurazione Railway è sicura? Network policy? Accesso al database limitato?
- [ ] **Error reporting (Sentry)**: Sentry è configurato per NON inviare dati sensibili (PII scrubbing)? Verifica `beforeSend` hooks

#### Client-side security
- [ ] **XSS**: cerca uso di `dangerouslySetInnerHTML`, rendering di HTML non sanitizzato, interpolazione di input utente nel DOM
- [ ] **localStorage/sessionStorage**: dati sensibili salvati nel browser storage? Token, dati finanziari?
- [ ] **Console.log**: cerca log di dati sensibili che finiscono nella console del browser in produzione
- [ ] **Source maps**: le source map sono disabilitate in produzione? Espongono il codice sorgente?
- [ ] **Bundle analysis**: il bundle client contiene codice server-side o secrets leakati tramite `NEXT_PUBLIC_*`?

### File critici da analizzare
```
next.config.ts
.gitignore
.env.example
sentry.client.config.ts
sentry.server.config.ts
src/instrumentation-client.ts
src/app/sw.ts (service worker)
package.json
package-lock.json
```

---

## Report Finale — Struttura richiesta

Dopo che tutti gli agenti hanno completato la loro analisi, il leader deve aggregare i risultati in un report strutturato. Salva il report in `SECURITY_AUDIT_REPORT.md` con questa struttura:

```markdown
# Security Audit Report — [Nome Progetto]
**Data:** [data]
**Auditor:** Claude Code Agent Team

## Executive Summary
[2-3 paragrafi: stato generale della sicurezza, rischi principali, azioni immediate richieste]

## Vulnerabilità Critiche (P0 — Azione Immediata)
[Vulnerabilità che permettono accesso non autorizzato, data breach, o distruzione dati]

Per ogni vulnerabilità:
### [VULN-001] Titolo
- **Severità:** Critica
- **Area:** [Auth/API/Data/Infra]
- **Descrizione:** [cosa è il problema]
- **Impatto:** [cosa può succedere se sfruttata]
- **File coinvolti:** [percorsi file]
- **Proof of concept:** [come riprodurre, se applicabile]
- **Remediation:** [codice o configurazione per risolvere]

## Vulnerabilità Alte (P1 — Entro 1 settimana)
[Stessa struttura di P0]

## Vulnerabilità Medie (P2 — Entro 1 mese)
[Stessa struttura di P0]

## Vulnerabilità Basse (P3 — Backlog)
[Stessa struttura di P0]

## Raccomandazioni Generali
[Best practice non legate a vulnerabilità specifiche]

## Hardening Checklist
[Lista di azioni di hardening con checkbox]

## Allegati
- Output npm audit
- Lista completa file analizzati
- Configurazioni raccomandate (headers, CSP policy, etc.)
```

---

## Classificazione Severità

Usa questa scala per classificare ogni finding:

| Severità | Criterio | Esempio |
|----------|----------|---------|
| **Critica (P0)** | Accesso non autorizzato ai dati, RCE, bypass auth completo | SQL injection, auth bypass, secrets esposti |
| **Alta (P1)** | Data leakage parziale, privilege escalation, IDOR | Cross-tenant data access, missing auth check |
| **Media (P2)** | Problemi di configurazione, info disclosure | Headers mancanti, error stack trace, XSS stored |
| **Bassa (P3)** | Best practice non seguite, rischio teorico | Cookie flags, CSP mancante, dipendenze outdated |

---

## Vincoli dell'analisi

- **Non eseguire test distruttivi**: non modificare dati, non creare utenti di test, non alterare il database
- **Analisi statica**: basa l'analisi sulla lettura del codice sorgente, configurazioni e dipendenze
- **Sii specifico**: per ogni vulnerabilità indica il file esatto e la riga di codice
- **Sii pratico**: ogni remediation deve essere implementabile, con codice d'esempio quando possibile
- **Prioritizza**: non tutto è critico. Classifica accuratamente per permettere un piano d'azione realistico
- **Contesto finanziario**: questo è un gestionale contabile — i dati finanziari hanno requisiti di integrità e riservatezza superiori alla media. Tratta ogni potenziale data breach come severità elevata

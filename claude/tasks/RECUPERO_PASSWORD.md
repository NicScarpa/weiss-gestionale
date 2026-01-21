# Task: Recupero Credenziali Login

## Stato: COMPLETATO

## Obiettivo
1. ✅ Rimuovere la scritta "Accedi con username" dalla pagina di login
2. ✅ Implementare funzionalità di recupero password via email con link di reset

---

## Modifiche Implementate

### 1. Schema Prisma
**File**: `prisma/schema.prisma`

Aggiunti campi al model User:
```prisma
// === Recupero password ===
resetToken        String?   @unique @map("reset_token")
resetTokenExpiry  DateTime? @map("reset_token_expiry")
```

Database aggiornato con `npx prisma db push`.

### 2. Servizio Email
**File nuovo**: `src/lib/email.ts`

- Client Resend configurato
- Funzione `sendEmail()` generica
- Funzione `sendPasswordResetEmail(email, token, username)` con template HTML responsive
- Fallback mock in development se RESEND_API_KEY non configurata

### 3. API Endpoint Forgot Password
**File nuovo**: `src/app/api/auth/forgot-password/route.ts`

- POST: riceve email
- Cerca utente per email
- Genera token con `crypto.randomUUID()`
- Salva token con scadenza 1 ora
- Invia email con link di reset
- Risposta sempre generica (non rivela se email esiste)

### 4. API Endpoint Reset Password
**File nuovo**: `src/app/api/auth/reset-password/route.ts`

- GET: verifica validità token (per UI)
- POST: reimposta password
  - Valida token (esiste, non scaduto, utente attivo)
  - Hash nuova password (bcryptjs, 12 rounds)
  - Invalida token dopo uso
  - Rimuove flag `mustChangePassword`

### 5. Pagina Forgot Password
**File nuovo**: `src/app/(auth)/forgot-password/page.tsx`

- Form con campo email
- Stato di successo con messaggio generico
- Link per tornare al login
- Stesso stile della pagina login (sfondo nero, card, logo)

### 6. Pagina Reset Password
**File nuovo**: `src/app/(auth)/reset-password/page.tsx`

- Verifica token all'avvio (GET API)
- Form con nuova password + conferma
- Toggle visibilità password
- Validazioni:
  - Min 8 caratteri
  - Password coincidenti
  - No password di default (1234567890)
- Redirect automatico al login dopo successo
- Gestione errori per token scaduto/invalido

### 7. Pagina Login Modificata
**File**: `src/app/(auth)/login/page.tsx`

- Aggiunto import `Link` da next/link
- Rimosso: `<p>Accedi con username</p>`
- Aggiunto: link "Password dimenticata?" → `/forgot-password`

### 8. Variabili d'Ambiente
**File**: `.env.example`

Aggiunte:
```env
# Resend (Email Service)
RESEND_API_KEY=""
EMAIL_FROM="noreply@weisscafe.it"
```

---

## File Creati/Modificati

| Azione | File |
|--------|------|
| ✅ Modifica | `prisma/schema.prisma` |
| ✅ Crea | `src/lib/email.ts` |
| ✅ Crea | `src/app/api/auth/forgot-password/route.ts` |
| ✅ Crea | `src/app/api/auth/reset-password/route.ts` |
| ✅ Crea | `src/app/(auth)/forgot-password/page.tsx` |
| ✅ Crea | `src/app/(auth)/reset-password/page.tsx` |
| ✅ Modifica | `src/app/(auth)/login/page.tsx` |
| ✅ Modifica | `.env.example` |

---

## Dipendenze Aggiunte

```bash
npm install resend
```

---

## Configurazione Necessaria

Per attivare l'invio email in produzione:

1. Registrarsi su [Resend](https://resend.com)
2. Creare API key
3. Verificare dominio email (o usare sandbox per test)
4. Aggiungere al `.env`:
   ```env
   RESEND_API_KEY=re_xxxxx
   EMAIL_FROM=noreply@tuodominio.com
   ```

**Nota**: In development senza API key configurata, le email vengono loggate invece di essere inviate.

---

## Limitazioni

- **Solo utenti con email**: Lo staff senza email non può recuperare la password autonomamente
- **Soluzione alternativa**: L'admin può resettare manualmente via gestione utenti (endpoint esistente `/api/users/[id]/reset-password`)

---

## Test Effettuati

1. ✅ TypeScript check: nessun errore
2. ✅ Pagina `/forgot-password`: accessibile (HTTP 200)
3. ✅ Pagina `/reset-password`: accessibile (HTTP 200)
4. ✅ Pagina `/login`: link "Password dimenticata?" presente
5. ✅ API `/api/auth/forgot-password`: risposta corretta
6. ✅ API `/api/auth/reset-password?token=invalid`: gestisce token invalido

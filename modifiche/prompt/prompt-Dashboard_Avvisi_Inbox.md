# Prompt - Implementazione Dashboard Avvisi/Inbox

## Istruzioni per Claude Code

Sei un senior full-stack developer specializzato in Next.js, React, TypeScript e Prisma. Devi implementare un sistema centralizzato di notifiche e avvisi (Inbox) per il gestionale Weiss Cafe. Il progetto si trova in `/Users/nicolascarpa/Desktop/accounting`.

---

## Contesto Tecnico del Progetto

### Stack Tecnologico
- **Framework**: Next.js 16.1.1 con App Router + React 19 + TypeScript
- **ORM**: Prisma 7.2.0 con PostgreSQL (Supabase)
- **UI**: shadcn/ui (Radix UI) + TailwindCSS 4
- **State**: React Query (TanStack) 5.90
- **Auth**: NextAuth 5.0 con RBAC (admin, manager, staff)
- **Email**: Resend 6.8.0 (`src/lib/email.ts`)
- **Push**: Firebase Admin SDK 13.6.0 (`src/lib/notifications/fcm.ts`)
- **Toast**: Sonner
- **Validazione**: Zod 4.3
- **Date**: date-fns 4.1 (locale IT, timezone Europe/Rome)
- **PWA**: Serwist 9.4.2

### Sistema Notifiche Esistente
Il progetto ha GIA un sistema di notifiche parzialmente implementato:

**Modelli Prisma** (in `prisma/schema.prisma`):
- `NotificationLog`: Log con type, title, body, channel (PUSH/EMAIL/IN_APP), status (PENDING/SENT/DELIVERED/FAILED/READ), timestamp sent/delivered/read, referenceId/referenceType
- `NotificationPreference`: Preferenze per utente (pushEnabled, emailEnabled, per-type toggles per turni/presenze/ferie)
- `PushSubscription`: Token FCM con device metadata

**Libreria** (in `src/lib/notifications/`):
- `types.ts`: Interfacce NotificationPayload, SendNotificationOptions, etc.
- `fcm.ts`: Integrazione Firebase Cloud Messaging (send singolo e batch)
- `send.ts` (354 righe): Core service con sendNotification(), sendBulkNotification(), shouldSendNotification(), logNotification(), getUnreadNotifications(), markNotificationAsRead()
- `triggers.ts` (508 righe): Funzioni trigger per turni (published, reminder, swap), anomalie presenze, ferie (approved, rejected, new request)

**API Routes** (in `src/app/api/notifications/`):
- `subscribe/route.ts`: POST/DELETE/GET per FCM token
- `preferences/route.ts`: GET/PUT per preferenze
- `history/route.ts`: GET (lista paginata + unreadCount), PATCH (mark as read), DELETE (pulizia vecchie)

**Sistemi Alert Separati**:
- `BudgetAlert` model + `src/lib/budget/alert-generator.ts`: Genera alert per sforamenti budget (OVER_BUDGET, UNDER_REVENUE)
- `PriceAlert` model + `src/lib/price-tracking/index.ts`: Alert per variazioni prezzo fornitore (soglia 5%)

**Enum NotificationType attuali**: SHIFT_PUBLISHED, SHIFT_REMINDER, SHIFT_SWAP_REQUEST/APPROVED/REJECTED, ANOMALY_CREATED/RESOLVED, LEAVE_APPROVED/REJECTED/REMINDER, NEW_LEAVE_REQUEST, STAFF_ANOMALY, GENERAL

**Cosa MANCA e devi implementare**:
- Dashboard Inbox UI (componenti React per visualizzare notifiche in-app)
- Icona campanella con badge contatore nel layout
- Pagina completa Inbox con filtri e azioni
- Pagina impostazioni notifiche nel frontend
- Integrazione Telegram Bot API
- Trigger per: chiusure cassa, fatture in scadenza, certificazioni, budget alerts, price alerts, riconciliazione bancaria, cash flow
- Template email per notifiche (esiste solo template password reset)
- Cron jobs per notifiche basate su scadenze
- Nuovi tipi NotificationType per tutti gli eventi sopra

---

## Cosa Devi Implementare

### Architettura

Ogni notifica DEVE SEMPRE creare un record `NotificationLog` con channel `IN_APP`. I canali aggiuntivi (email, push, Telegram) sono opzionali secondo le preferenze utente. Questo garantisce che l'Inbox sia sempre completo e consultabile.

Flusso:
```
Evento (API Route / Cron Job)
  -> Trigger Function (src/lib/notifications/triggers.ts)
    -> sendNotification() (src/lib/notifications/send.ts)
      -> SEMPRE: write NotificationLog IN_APP
      -> SE emailEnabled + tipo abilitato: invia email (Resend)
      -> SE pushEnabled + tipo abilitato: invia push (FCM)
      -> SE telegramEnabled + tipo abilitato: invia messaggio (Telegram Bot API)
```

---

### FASE 1: Estensione Schema Database

**File**: `prisma/schema.prisma`

1. **Aggiungi all'enum `NotificationType`**:
```
CLOSURE_SUBMITTED
CLOSURE_VALIDATED
CLOSURE_REJECTED
BUDGET_ALERT
BUDGET_ALERT_RESOLVED
INVOICE_DEADLINE_APPROACHING
INVOICE_OVERDUE
PRICE_INCREASE
PRICE_DECREASE
CERT_EXPIRING_SOON
CERT_EXPIRED
BANK_RECON_ALERT
LOW_CASH_FLOW
```

2. **Aggiungi al modello `NotificationPreference`**:
```prisma
telegramEnabled    Boolean @default(false)
telegramChatId     String?
closureSubmitted   Boolean @default(true)
closureValidated   Boolean @default(true)
closureRejected    Boolean @default(true)
budgetAlert        Boolean @default(true)
invoiceDeadline    Boolean @default(true)
priceAlert         Boolean @default(true)
certExpiring       Boolean @default(true)
bankReconAlert     Boolean @default(true)
cashFlowAlert      Boolean @default(true)
```

3. **Aggiungi al modello `NotificationLog`**:
```prisma
priority    NotificationPriority @default(NORMAL)
actionUrl   String?
actionLabel String?
expiresAt   DateTime?
```

4. **Aggiungi nuovo enum**:
```prisma
enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

5. **Esegui migrazione**: `npx prisma migrate dev --name add-notification-inbox-system`

6. **Aggiorna `src/lib/notifications/types.ts`**: Aggiungi `priority`, `actionUrl`, `actionLabel`, `expiresAt` a `NotificationPayload`. Aggiungi interfacce dati per i nuovi tipi (ClosureData, BudgetAlertData, InvoiceDeadlineData, PriceAlertData, CertExpiryData, BankReconData, CashFlowData).

---

### FASE 2: Servizio Telegram

**File nuovo**: `src/lib/notifications/telegram.ts`

Implementa usando fetch diretto (NO librerie esterne) verso `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage`. Funzioni:
- `sendTelegramMessage(chatId: string, text: string, parseMode?: 'Markdown' | 'HTML')`: Invio base con retry
- `sendTelegramNotification(chatId: string, payload: NotificationPayload)`: Wrapper con formattazione per tipo notifica
- `isTelegramConfigured()`: Check variabile ambiente TELEGRAM_BOT_TOKEN
- Mock in development se token non configurato

**File nuovo**: `src/app/api/notifications/telegram/route.ts`
- POST: Genera token univoco di linking, ritorna deep link `https://t.me/{BOT_USERNAME}?start={token}`
- GET: Verifica se il linking e' completato (chatId salvato in NotificationPreference)
- DELETE: Rimuovi collegamento (nullifica telegramChatId)

**File nuovo**: `src/app/api/webhooks/telegram/route.ts`
- Riceve update dal bot Telegram (webhook)
- Quando utente invia `/start {token}`: valida token, salva chatId in NotificationPreference, rispondi con conferma
- Verifica TELEGRAM_WEBHOOK_SECRET per sicurezza

**Variabili ambiente da aggiungere**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`

---

### FASE 3: Estensione Service Layer

**File da modificare**: `src/lib/notifications/send.ts`

1. In `sendNotification()`:
   - Aggiungi SEMPRE scrittura record IN_APP nel NotificationLog (anche se l'utente ha disabilitato email/push)
   - Aggiungi logica per canale TELEGRAM: se `preferences.telegramEnabled && preferences.telegramChatId`, chiama `sendTelegramNotification()`
   - Salva `priority`, `actionUrl`, `actionLabel`, `expiresAt` nel NotificationLog

2. In `shouldSendNotification()`:
   - Aggiungi mapping per tutti i nuovi NotificationType -> campo preferenza corrispondente

3. Aggiungi funzione `getNotificationIcon(type: NotificationType): string` che ritorna il nome dell'icona Lucide per ogni tipo.

**File nuovo**: `src/lib/notifications/email-templates.ts`
Template HTML responsive con branding Weiss Cafe per ogni tipo di notifica. Ogni template deve avere:
- Header con logo/nome
- Corpo con messaggio contestualizzato
- Pulsante CTA che punta all'actionUrl
- Footer con link per gestire preferenze
- Versione text fallback

Template richiesti:
- `closureSubmittedEmail(closureDate, venueName, submitterName)`
- `closureRejectedEmail(closureDate, venueName, rejectionNotes)`
- `budgetAlertEmail(categoryName, variance, month, venueName)`
- `invoiceDeadlineEmail(supplierName, invoiceNumber, amount, dueDate, daysLeft)`
- `invoiceOverdueEmail(supplierName, invoiceNumber, amount, dueDate, daysOverdue)`
- `certExpiringEmail(employeeName, certType, expiryDate, daysLeft)`
- `certExpiredEmail(employeeName, certType, expiryDate)`
- `lowCashFlowEmail(venueName, projectedBalance, threshold, criticalDate)`

**File nuovo**: `src/lib/notifications/telegram-templates.ts`
Template in formato Markdown per messaggi Telegram. Devono essere concisi (max 200 caratteri il corpo). Stessi tipi dei template email.

---

### FASE 4: Trigger per Tutti i Moduli

**File da modificare**: `src/lib/notifications/triggers.ts`

Aggiungi le seguenti funzioni trigger. Ogni trigger deve:
1. Recuperare i dati necessari dal database
2. Determinare i destinatari corretti (basato su ruolo e venue)
3. Chiamare `sendNotification()` per ogni destinatario con payload appropriato
4. Usare `try/catch` e NON bloccare il flusso principale (fire-and-forget)

Trigger da implementare:

```typescript
// Chiusure Cassa
notifyClosureSubmitted(closureId: string)
// Destinatari: tutti gli utenti con permesso 'closure.validate' della venue
// Priorita: HIGH
// ActionUrl: /chiusura-cassa/{closureId}

notifyClosureValidated(closureId: string)
// Destinatari: utente che ha inviato la chiusura (submittedById)
// Priorita: NORMAL
// ActionUrl: /chiusura-cassa/{closureId}

notifyClosureRejected(closureId: string, rejectionNotes: string)
// Destinatari: utente che ha inviato la chiusura
// Priorita: HIGH
// ActionUrl: /chiusura-cassa/{closureId}/modifica

// Budget
notifyBudgetAlert(alertId: string)
// Destinatari: admin + manager della venue del budget
// Priorita: HIGH
// ActionUrl: /budget (con filtro venue/anno)

notifyBudgetAlertResolved(alertId: string)
// Destinatari: chi ha preso in carico (acknowledgedById)
// Priorita: LOW

// Prezzi
notifyPriceAlert(alertId: string)
// Destinatari: admin + manager
// Priorita: HIGH per INCREASE, NORMAL per DECREASE
// ActionUrl: /price-alerts (o dove si visualizzano)

// Fatture
notifyInvoiceDeadline(invoiceId: string, daysLeft: number)
// Destinatari: admin + manager
// Priorita: NORMAL (7gg), HIGH (3gg), URGENT (1gg/oggi)
// ActionUrl: /fatture/{invoiceId}

notifyInvoiceOverdue(invoiceId: string, daysOverdue: number)
// Destinatari: admin
// Priorita: URGENT

// Certificazioni
notifyCertExpiring(certId: string, daysLeft: number)
// Destinatari: dipendente + manager della venue
// Priorita: NORMAL (30gg), HIGH (7gg)

notifyCertExpired(certId: string)
// Destinatari: dipendente + manager + admin
// Priorita: URGENT

// Banca
notifyBankReconAlert(venueId: string, unreconciledCount: number, oldestDate: Date)
// Destinatari: admin
// Priorita: NORMAL

// Cash Flow
notifyLowCashFlow(venueId: string, projectedBalance: number, thresholdDate: Date)
// Destinatari: admin + manager venue
// Priorita: URGENT
```

**File da modificare per inserire chiamate ai trigger**:

1. `src/app/api/chiusure/[id]/submit/route.ts`:
   - Dopo il blocco che aggiorna status a SUBMITTED, aggiungi:
   ```typescript
   // Fire-and-forget: non blocca la response
   notifyClosureSubmitted(id).catch(err => logger.error('Notification error', err))
   ```

2. `src/app/api/chiusure/[id]/validate/route.ts`:
   - Dopo validazione (approve): `notifyClosureValidated(id).catch(...)`
   - Dopo rejection: `notifyClosureRejected(id, rejectionNotes).catch(...)`

3. `src/lib/budget/alert-generator.ts`:
   - Dopo creazione BudgetAlert (riga ~86): `notifyBudgetAlert(alert.id).catch(...)`
   - Dopo risoluzione (riga ~94): `notifyBudgetAlertResolved(alert.id).catch(...)`

4. `src/lib/price-tracking/index.ts`:
   - Dopo creazione PriceAlert: `notifyPriceAlert(alert.id).catch(...)`

---

### FASE 5: Dashboard Inbox UI

#### 5.1 - Hook React per Notifiche
**File nuovo**: `src/hooks/useNotifications.ts`

```typescript
// Hook per contatore non lette (polling ogni 30 secondi)
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/history?limit=0&unreadOnly=true')
      const data = await res.json()
      return data.unreadCount as number
    },
    refetchInterval: 30000,
  })
}

// Hook per lista notifiche con paginazione
export function useNotifications(filters: NotificationFilters) {
  return useInfiniteQuery({
    queryKey: ['notifications', filters],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: '20',
        offset: String(pageParam),
        ...(filters.type && { type: filters.type }),
        ...(filters.unreadOnly && { unreadOnly: 'true' }),
      })
      const res = await fetch(`/api/notifications/history?${params}`)
      return res.json()
    },
    getNextPageParam: (lastPage, pages) => {
      const totalLoaded = pages.flatMap(p => p.notifications).length
      return totalLoaded < lastPage.pagination.total ? totalLoaded : undefined
    },
  })
}

// Mutation per segnare come letta
export function useMarkAsRead()
export function useMarkAllAsRead()
export function useDeleteNotifications()
```

#### 5.2 - Componente Campanella con Badge
**File da modificare**: Il componente header/sidebar del layout (cerca in `src/components/layout/`)

Aggiungi nell'area header/toolbar:
- Icona `Bell` da Lucide con Popover (Radix UI)
- Badge rosso circolare sovrapposto con contatore (usa `useUnreadCount()`)
- Badge nascosto se count = 0

#### 5.3 - Popover Anteprima
**File nuovo**: `src/components/notifications/NotificationPopover.tsx`

- Usa componente `Popover` di Radix UI (gia installato)
- Mostra ultime 5 notifiche non lette
- Ogni item: icona per tipo (Lucide), titolo, timestamp relativo (date-fns `formatDistanceToNow` con locale `it`), indicatore non letto (pallino blu)
- Click su notifica: `markAsRead(id)` + `router.push(actionUrl)`
- Header: "Notifiche" + link "Segna tutte come lette"
- Footer: link "Vedi tutte" -> `/inbox`
- Empty state: "Nessuna nuova notifica"

#### 5.4 - Pagina Inbox
**File nuovo**: `src/app/(dashboard)/inbox/page.tsx` (server component wrapper)
**File nuovo**: `src/app/(dashboard)/inbox/InboxClient.tsx`

Layout pagina:
- **Header**: Titolo "Inbox", contatore "(X non lette)", pulsanti "Segna tutte come lette" e "Elimina lette"
- **Filtri** (tabs o select):
  - Tab: "Tutte" | "Non lette" | "Importanti" (priority HIGH/URGENT)
  - Select tipo: Tutti, Chiusure, Budget, Fatture, Prezzi, Certificazioni, Turni, Ferie, Presenze, Banca, Cash Flow
- **Lista notifiche** con infinite scroll:
  - Raggruppate per data (Oggi, Ieri, Questa settimana, Precedenti)
  - Ogni notifica:
    - Icona colorata per tipo/priorita (rosso URGENT, arancione HIGH, blu NORMAL, grigio LOW)
    - Titolo (bold se non letta)
    - Descrizione (body troncato a 120 caratteri)
    - Timestamp relativo (date-fns formatDistanceToNow locale IT)
    - Badge priorita se HIGH/URGENT
    - Pulsante azione primaria (actionLabel, es. "Valida chiusura") -> naviga a actionUrl
    - Menu contestuale: "Segna come letta", "Elimina"
  - Sfondo leggermente diverso per notifiche non lette
- **Empty state**: Illustrazione + "Nessuna notifica" / "Tutto letto!"
- **Stile**: Coerente con il resto della dashboard. Usa Card, Badge, Button, Separator da shadcn/ui.

#### 5.5 - Aggiornamento Sidebar
**File da modificare**: componente sidebar/navigation (cerca in `src/components/layout/`)
- Aggiungi voce menu "Inbox" o "Avvisi" con icona Bell
- Badge contatore accanto al testo (usa `useUnreadCount()`)
- Posiziona nella sezione principale del menu, preferibilmente in alto

---

### FASE 6: Pagina Impostazioni Notifiche

**File nuovo**: `src/app/(dashboard)/impostazioni/notifiche/page.tsx`
**File nuovo**: `src/app/(dashboard)/impostazioni/notifiche/NotificationSettingsClient.tsx`

Layout pagina:

**Sezione 1 - Canali di Notifica**:
- **Push Notifications**: Switch on/off + lista dispositivi registrati con pulsante rimuovi
- **Email**: Switch on/off
- **Telegram**: Switch on/off + se attivo: mostra stato collegamento
  - Se non collegato: pulsante "Collega Telegram" -> apre deep link bot
  - Se collegato: mostra "Collegato" + pulsante "Scollega"
  - Pulsante "Invia messaggio di test"

**Sezione 2 - Tipi di Notifica** (griglia/tabella):
Righe per categoria:
| Tipo Notifica | In-App | Email | Push | Telegram |
|--------------|--------|-------|------|----------|
| Chiusure inviate | (sempre on) | toggle | toggle | toggle |
| Chiusure approvate/rifiutate | (sempre on) | toggle | toggle | toggle |
| Alert budget | (sempre on) | toggle | toggle | toggle |
| Scadenze fatture | (sempre on) | toggle | toggle | toggle |
| Alert prezzi | (sempre on) | toggle | toggle | toggle |
| Certificazioni in scadenza | (sempre on) | toggle | toggle | toggle |
| Turni pubblicati | (sempre on) | toggle | toggle | toggle |
| Promemoria turno | (sempre on) | toggle | toggle | toggle |
| Richieste ferie | (sempre on) | toggle | toggle | toggle |
| Anomalie presenze | (sempre on) | toggle | toggle | toggle |
| Riconciliazione bancaria | (sempre on) | toggle | toggle | toggle |
| Previsione liquidita | (sempre on) | toggle | toggle | toggle |

La colonna "In-App" mostra un'icona check grigia non cliccabile (sempre attivo).

**Pulsanti**: "Salva preferenze", "Ripristina default"

**API da aggiornare**: `src/app/api/notifications/preferences/route.ts`
- Aggiornare schema Zod per includere tutti i nuovi campi
- GET: ritornare preferenze complete con default
- PUT: salvare tutti i campi, upsert se non esistono

---

### FASE 7: Cron Jobs per Notifiche Scheduled

**File nuovo**: `src/app/api/cron/notifications/route.ts`

Endpoint unico per tutte le verifiche periodiche. Protetto con:
```typescript
const authHeader = request.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Esegue in sequenza:
1. **Fatture in scadenza**: Query InvoiceDeadline dove isPaid=false e dueDate in (oggi+7, oggi+3, oggi+1, oggi). Per scadute: dueDate < oggi. Chiama trigger appropriato.
2. **Certificazioni**: Query Certification dove expiryDate in (oggi+30, oggi+14, oggi+7, oggi). Per scadute: expiryDate < oggi. Chiama trigger.
3. **Riconciliazione bancaria**: Query BankTransaction dove status in (PENDING, TO_REVIEW, UNMATCHED) e transactionDate > oggi-7. Se count > 0, chiama trigger.
4. **Cash flow**: Per ogni venue con CashFlowSetting, verifica se proiezione < lowBalanceThreshold. Se si, chiama trigger.

**Deduplicazione**: Prima di inviare, verifica che non esista gia un NotificationLog con stesso referenceId + referenceType + type + sentAt odierno.

Ritorna JSON con riepilogo:
```json
{
  "executed": "2026-02-02T08:00:00Z",
  "results": {
    "invoiceDeadlines": { "checked": 15, "notified": 3 },
    "certifications": { "checked": 42, "notified": 2 },
    "bankRecon": { "checked": 8, "notified": 1 },
    "cashFlow": { "checked": 3, "notified": 0 }
  }
}
```

Configurazione cron consigliata (Vercel/Railway):
- `/api/cron/notifications` -> ogni giorno alle 08:00 Europe/Rome
- `/api/shifts/reminder` -> ogni 10 minuti (gia esistente)

---

## Linee Guida di Sviluppo

### Pattern da seguire
- Usa gli stessi pattern gia presenti nel codebase per API routes (schema Zod, auth check, error handling)
- Usa React Query (useQuery, useMutation, useInfiniteQuery) per data fetching come gia fatto nel progetto
- Usa componenti shadcn/ui esistenti (Card, Badge, Button, Switch, Popover, Dialog, Tabs, Separator)
- Usa Lucide per le icone (gia installato)
- Usa date-fns con locale IT per formattazione date (gia installato)
- Formatta importi con separatore decimale virgola (es. 1.234,56) come nel resto del progetto
- I trigger di notifica devono essere fire-and-forget: `.catch(err => logger.error(...))` per non bloccare le API
- Usa il logger Pino gia configurato in `src/lib/logger.ts`

### Validazione Zod
Per tutti i nuovi endpoint, crea schema Zod per validazione input. Segui il pattern gia presente in `src/lib/validations/`.

### Autenticazione e Autorizzazione
Tutti gli endpoint devono verificare la sessione utente con `getServerSession(authOptions)`. Le notifiche devono rispettare il modello RBAC: un utente vede solo le proprie notifiche.

### Accessibilita
- Tutti i toggle devono avere label accessibili
- Le notifiche nell'inbox devono avere `role="listitem"` e `aria-label` appropriati
- Il badge del contatore deve avere `aria-label="X notifiche non lette"`
- I colori di priorita devono avere testo alternativo (non solo colore)

### Mobile
- L'inbox deve essere fully responsive e touch-friendly
- Target touch minimo 44x44px per pulsanti e azioni
- Il popover su mobile deve diventare un bottom sheet o pagina dedicata

### Performance
- Non caricare tutte le notifiche insieme: usa infinite scroll con limit=20
- Il polling del contatore (30s) deve essere leggero: solo COUNT query
- I trigger notifica non devono rallentare le API principali (fire-and-forget)

---

## Ordine di Esecuzione

1. **FASE 1** (Schema + Tipi) - prerequisito per tutto
2. **FASE 2** (Telegram) - puo essere fatto in parallelo con FASE 3
3. **FASE 3** (Service Layer) - richiede FASE 1 completata
4. **FASE 4** (Trigger) - richiede FASE 3 completata. I singoli trigger (4.1-4.7) possono essere implementati in parallelo
5. **FASE 5** (Inbox UI) - puo iniziare dopo FASE 1 usando dati mock, completare dopo FASE 3
6. **FASE 6** (Impostazioni UI) - parallelizzabile con FASE 5
7. **FASE 7** (Cron Jobs) - richiede FASE 4 completata

### Orchestrazione sotto-agenti (se supportato)

Per massimizzare il parallelismo, organizza il lavoro cosi:

**Agente A (Backend Core)**: FASE 1 -> FASE 2 -> FASE 3
**Agente B (Frontend UI)**: Dopo FASE 1 completata -> FASE 5 + FASE 6 (usando le API esistenti + mock per i nuovi tipi)
**Agente C (Trigger sincroni)**: Dopo FASE 3 -> Task 4.1 (chiusure), 4.2 (budget), 4.3 (prezzi)
**Agente D (Cron + Trigger async)**: Dopo FASE 3 -> Task 4.4 (fatture), 4.5 (certificazioni), 4.6 (banca), 4.7 (cash flow) + FASE 7

---

## Verifica Finale

Al termine dell'implementazione, verifica:
- [ ] `npx prisma migrate dev` esegue senza errori
- [ ] `npm run build` compila senza errori TypeScript
- [ ] L'Inbox mostra le notifiche correttamente
- [ ] La campanella mostra il badge con contatore aggiornato
- [ ] Le impostazioni salvano correttamente le preferenze
- [ ] I trigger vengono chiamati nei punti giusti (aggiungi log temporanei per verifica)
- [ ] Il cron endpoint risponde correttamente con auth e senza
- [ ] Le notifiche scadute vengono gestite (expiresAt)
- [ ] Il layout e' responsive e usabile su mobile

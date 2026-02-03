# Piano di Implementazione - Dashboard Avvisi/Inbox

## Panoramica

Implementazione di un sistema centralizzato di notifiche e avvisi (Inbox) all'interno del gestionale Weiss Cafe. Il sistema raccoglie notifiche da tutti i moduli del gestionale, le presenta in una dashboard unificata, e consente la configurazione dei canali di delivery (in-app, email, Telegram).

## Stato Attuale del Sistema

### Gia implementato
- **Modelli Prisma**: `NotificationLog`, `NotificationPreference`, `PushSubscription` con enum `NotificationType`, `NotificationChannel`, `NotificationStatus`
- **Libreria notifiche**: `src/lib/notifications/` con `fcm.ts`, `send.ts`, `triggers.ts`, `types.ts`
- **API endpoints**: 6 route in `/api/notifications/` (subscribe, preferences, history)
- **Trigger attivi**: turni (published, reminder, swap), anomalie presenze, ferie (approved, rejected, new request)
- **Email service**: Resend configurato in `src/lib/email.ts` (solo password reset)
- **Budget alerts**: Sistema separato con modello `BudgetAlert` e generatore in `src/lib/budget/alert-generator.ts`
- **Price alerts**: Sistema separato con modello `PriceAlert` in `src/lib/price-tracking/`

### Mancante
- Dashboard/Inbox UI per visualizzare notifiche in-app
- Icona campanella con badge contatore nel layout
- Pagina impostazioni notifiche nel frontend
- Trigger per: chiusure cassa, fatture in scadenza, certificazioni, budget alerts, price alerts, cash flow, riconciliazione
- Integrazione Telegram
- Template email per notifiche (solo password reset esiste)
- Cron jobs per notifiche scheduled (certificazioni, scadenze fatture, cash flow)
- Unificazione dei sistemi separati (BudgetAlert, PriceAlert) nel sistema NotificationLog

---

## Architettura Target

```
                    +------------------+
                    |   Event Source   |
                    | (API Route /     |
                    |  Cron Job)       |
                    +--------+---------+
                             |
                    +--------v---------+
                    | Notification     |
                    | Service          |
                    | (src/lib/        |
                    |  notifications/) |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v-----+  +-----v------+
     |  IN_APP    |  |   EMAIL    |  |  TELEGRAM  |
     |  (DB +     |  |  (Resend)  |  |  (Bot API) |
     |  Inbox UI) |  |            |  |            |
     +------------+  +------------+  +------------+
```

### Flusso Notifica
1. Un evento si verifica (es. chiusura inviata)
2. La route API chiama il trigger appropriato da `triggers.ts`
3. Il trigger chiama `sendNotification()` che:
   - Controlla le preferenze utente (`shouldSendNotification`)
   - Scrive SEMPRE su `NotificationLog` con channel=IN_APP (inbox)
   - Se `emailEnabled` e tipo abilitato: invia email via Resend
   - Se `telegramEnabled` e tipo abilitato: invia messaggio Telegram
   - Se `pushEnabled` e tipo abilitato: invia push FCM

---

## Fasi di Implementazione

### FASE 1: Estensione Schema e Tipi Notifica
**Obiettivo**: Aggiornare lo schema Prisma e i tipi TypeScript per supportare tutti i nuovi tipi di notifica e il canale Telegram.

#### Task 1.1 - Aggiornamento Enum NotificationType
**File**: `prisma/schema.prisma`
**Modifica**: Aggiungere nuovi tipi all'enum:
```
CLOSURE_SUBMITTED        // Chiusura inviata per validazione
CLOSURE_VALIDATED        // Chiusura approvata
CLOSURE_REJECTED         // Chiusura rifiutata
BUDGET_ALERT             // Sforamento budget
BUDGET_ALERT_RESOLVED    // Budget rientrato
INVOICE_DEADLINE_APPROACHING  // Scadenza fattura imminente (7gg, 3gg, 1gg)
INVOICE_OVERDUE          // Fattura scaduta non pagata
PRICE_INCREASE           // Aumento prezzo fornitore
PRICE_DECREASE           // Diminuzione prezzo fornitore
CERT_EXPIRING_SOON       // Certificazione in scadenza (30gg)
CERT_EXPIRED             // Certificazione scaduta
BANK_RECON_ALERT         // Transazioni bancarie da riconciliare
LOW_CASH_FLOW            // Previsione liquidita sotto soglia
```

#### Task 1.2 - Aggiornamento Modello NotificationPreference
**File**: `prisma/schema.prisma`
**Modifica**: Aggiungere campi:
```prisma
// Canale Telegram
telegramEnabled    Boolean @default(false)
telegramChatId     String?

// Preferenze nuovi tipi
closureSubmitted       Boolean @default(true)
closureValidated       Boolean @default(true)
closureRejected        Boolean @default(true)
budgetAlert            Boolean @default(true)
invoiceDeadline        Boolean @default(true)
priceAlert             Boolean @default(true)
certExpiring           Boolean @default(true)
bankReconAlert         Boolean @default(true)
cashFlowAlert          Boolean @default(true)
```

#### Task 1.3 - Aggiornamento NotificationLog per priorita e azioni
**File**: `prisma/schema.prisma`
**Modifica**: Aggiungere campi:
```prisma
priority    NotificationPriority @default(NORMAL)
actionUrl   String?   // URL per navigazione diretta (es. /chiusura-cassa/123)
actionLabel String?   // Label del pulsante azione (es. "Valida chiusura")
expiresAt   DateTime? // Scadenza notifica (auto-dismiss)
```

Nuovo enum:
```prisma
enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

#### Task 1.4 - Migrazione Database
**Comando**: `npx prisma migrate dev --name add-notification-inbox-system`

#### Task 1.5 - Aggiornamento Tipi TypeScript
**File**: `src/lib/notifications/types.ts`
**Modifica**: Aggiornare interfacce `NotificationPayload`, aggiungere `priority`, `actionUrl`, `actionLabel`, `expiresAt`. Aggiungere interfacce dati per ogni nuovo tipo.

**Parallelizzabile**: Task 1.1, 1.2, 1.3 sono nello stesso file, vanno fatte sequenzialmente. Task 1.5 puo essere preparata in parallelo.

---

### FASE 2: Servizio Telegram
**Obiettivo**: Implementare l'integrazione con Telegram Bot API per l'invio di notifiche.

#### Task 2.1 - Servizio Telegram Bot
**File nuovo**: `src/lib/notifications/telegram.ts`
**Contenuto**:
- Funzione `sendTelegramMessage(chatId, text, options?)` usando fetch diretto verso `https://api.telegram.org/bot{TOKEN}/sendMessage`
- Supporto Markdown per formattazione
- Funzione `sendTelegramNotification(chatId, payload: NotificationPayload)` con template per tipo
- Gestione errori e retry
- Mock in development
- Variabili ambiente: `TELEGRAM_BOT_TOKEN`

#### Task 2.2 - Endpoint Registrazione Telegram
**File nuovo**: `src/app/api/notifications/telegram/route.ts`
- **POST**: Avvia processo linking tramite deep link Telegram (`https://t.me/{botname}?start={token}`)
- **GET**: Verifica stato linking
- **DELETE**: Rimuovi collegamento Telegram

#### Task 2.3 - Webhook Telegram (opzionale, per linking)
**File nuovo**: `src/app/api/webhooks/telegram/route.ts`
- Riceve messaggi dal bot Telegram
- Quando utente invia /start con token, collega chatId a NotificationPreference

**Parallelizzabile**: Task 2.1 e' prerequisito per 2.2 e 2.3. Task 2.2 e 2.3 possono essere sviluppate in parallelo.

---

### FASE 3: Estensione Service Layer Notifiche
**Obiettivo**: Aggiornare il servizio di invio per supportare Telegram e i nuovi tipi.

#### Task 3.1 - Aggiornamento sendNotification
**File**: `src/lib/notifications/send.ts`
**Modifica**:
- Aggiungere logica per canale TELEGRAM in `sendNotification()`
- Assicurarsi che OGNI notifica scriva SEMPRE un record IN_APP (inbox)
- Aggiungere `priority`, `actionUrl`, `actionLabel`, `expiresAt` al log
- Aggiornare `shouldSendNotification()` per i nuovi tipi

#### Task 3.2 - Template Email per Notifiche
**File nuovo**: `src/lib/notifications/email-templates.ts`
**Contenuto**: Template HTML per ogni tipo di notifica:
- `closureSubmittedEmail(closure)` - "Nuova chiusura da validare"
- `closureValidatedEmail(closure)` - "Chiusura approvata"
- `closureRejectedEmail(closure, notes)` - "Chiusura rifiutata"
- `budgetAlertEmail(alert)` - "Attenzione: sforamento budget"
- `invoiceDeadlineEmail(invoice, daysLeft)` - "Fattura in scadenza"
- `certExpiringEmail(cert, daysLeft)` - "Certificazione in scadenza"
- Template base riutilizzabile con branding Weiss Cafe

#### Task 3.3 - Template Telegram per Notifiche
**File nuovo**: `src/lib/notifications/telegram-templates.ts`
**Contenuto**: Template Markdown per messaggi Telegram per ogni tipo di notifica.

**Parallelizzabile**: Task 3.1 e' prerequisito. Task 3.2 e 3.3 possono essere sviluppate in parallelo.

---

### FASE 4: Implementazione Trigger per Tutti i Moduli
**Obiettivo**: Aggiungere trigger di notifica in tutti i punti del sistema che generano eventi rilevanti.

#### Task 4.1 - Trigger Chiusure Cassa
**File da modificare**:
- `src/app/api/chiusure/[id]/submit/route.ts` - dopo riga 75: chiamare `notifyClosureSubmitted()`
- `src/app/api/chiusure/[id]/validate/route.ts` - dopo riga 130: chiamare `notifyClosureValidated()` o `notifyClosureRejected()`

**File da modificare**: `src/lib/notifications/triggers.ts`
- Aggiungere: `notifyClosureSubmitted(closureId)` - notifica tutti i manager della venue
- Aggiungere: `notifyClosureValidated(closureId)` - notifica chi ha inviato la chiusura
- Aggiungere: `notifyClosureRejected(closureId, notes)` - notifica chi ha inviato + note rifiuto

#### Task 4.2 - Trigger Budget Alert
**File da modificare**: `src/lib/budget/alert-generator.ts`
- Dopo riga 86 (creazione alert): chiamare `notifyBudgetAlert(alertId)`
- Dopo riga 94 (risoluzione): chiamare `notifyBudgetAlertResolved(alertId)`

**File da modificare**: `src/lib/notifications/triggers.ts`
- Aggiungere: `notifyBudgetAlert(alertId)` - notifica admin e manager venue
- Aggiungere: `notifyBudgetAlertResolved(alertId)` - notifica chi ha preso in carico

#### Task 4.3 - Trigger Price Alert
**File da modificare**: `src/lib/price-tracking/index.ts`
- Quando crea PriceAlert: chiamare `notifyPriceAlert(alertId)`

**File da modificare**: `src/lib/notifications/triggers.ts`
- Aggiungere: `notifyPriceAlert(alertId)` - notifica admin e manager

#### Task 4.4 - Trigger Fatture in Scadenza (Cron Job)
**File nuovo**: `src/app/api/cron/invoice-deadlines/route.ts`
- Endpoint protetto con CRON_SECRET
- Query: `InvoiceDeadline WHERE isPaid=false AND dueDate IN (oggi+7, oggi+3, oggi+1, oggi, ieri)`
- Per ogni scadenza: `notifyInvoiceDeadline(invoiceId, daysLeft)`
- Evitare duplicati: controllare NotificationLog prima di inviare

**File da modificare**: `src/lib/notifications/triggers.ts`
- Aggiungere: `notifyInvoiceDeadline(invoiceId, daysLeft)` - notifica admin/manager
- Aggiungere: `notifyInvoiceOverdue(invoiceId)` - notifica urgente

#### Task 4.5 - Trigger Certificazioni in Scadenza (Cron Job)
**File nuovo**: `src/app/api/cron/cert-expiry/route.ts`
- Endpoint protetto con CRON_SECRET
- Query: `Certification WHERE expiryDate IN (oggi+30, oggi+14, oggi+7, oggi, scaduta)`
- Per ogni certificazione: `notifyCertExpiring(certId, daysLeft)`
- Evitare duplicati

**File da modificare**: `src/lib/notifications/triggers.ts`
- Aggiungere: `notifyCertExpiring(certId, daysLeft)` - notifica dipendente + manager
- Aggiungere: `notifyCertExpired(certId)` - notifica urgente a tutti

#### Task 4.6 - Trigger Riconciliazione Bancaria (Cron Job)
**File nuovo**: `src/app/api/cron/bank-recon/route.ts`
- Endpoint protetto con CRON_SECRET
- Query: `BankTransaction WHERE status IN (PENDING, TO_REVIEW, UNMATCHED) AND transactionDate > oggi-7`
- Se ci sono transazioni pendenti: `notifyBankReconAlert(count, oldestDate)`

#### Task 4.7 - Trigger Cash Flow (Cron Job)
**File nuovo**: `src/app/api/cron/cash-flow/route.ts`
- Endpoint protetto con CRON_SECRET
- Per ogni venue: calcola previsione liquidita prossimi 7 giorni
- Se sotto soglia `lowBalanceThreshold`: `notifyLowCashFlow(venueId, projectedBalance, thresholdDate)`

**Parallelizzabile**: Task 4.1, 4.2, 4.3 sono indipendenti tra loro. Task 4.4, 4.5, 4.6, 4.7 sono indipendenti tra loro. Tutti dipendono dalla Fase 3.

---

### FASE 5: Dashboard Inbox UI
**Obiettivo**: Creare l'interfaccia utente per la visualizzazione e gestione delle notifiche.

#### Task 5.1 - Icona Campanella con Badge nel Layout
**File da modificare**: `src/components/layout/` (sidebar o header)
- Aggiungere icona Bell (Lucide) nella barra superiore o sidebar
- Badge rosso con contatore notifiche non lette
- Hook `useUnreadCount()` con polling ogni 30 secondi (o React Query refetchInterval)
- Click apre popover con anteprima ultime 5 notifiche + link "Vedi tutte"

#### Task 5.2 - Popover Anteprima Notifiche
**File nuovo**: `src/components/notifications/NotificationPopover.tsx`
- Popover (Radix UI, gia installato) con lista ultime 5 notifiche
- Ogni notifica mostra: icona tipo, titolo, tempo relativo (es. "2 ore fa")
- Click su notifica: segna come letta + naviga a actionUrl
- Pulsante "Segna tutte come lette"
- Pulsante "Vedi tutte" -> pagina inbox

#### Task 5.3 - Pagina Inbox Completa
**File nuovo**: `src/app/(dashboard)/inbox/page.tsx`
**File nuovo**: `src/app/(dashboard)/inbox/InboxClient.tsx`
- Lista notifiche con infinite scroll (React Query useInfiniteQuery)
- Filtri: tipo, letto/non letto, priorita, data
- Tab: "Tutte" | "Non lette" | "Importanti" (priority HIGH/URGENT)
- Ogni notifica:
  - Icona colorata per tipo (es. rosso per URGENT, giallo per budget, blu per info)
  - Titolo, descrizione breve, timestamp relativo
  - Badge priorita se HIGH/URGENT
  - Pulsante azione (es. "Valida chiusura" -> navigazione diretta)
  - Pulsante "Segna come letta" / "Archivia"
- Azioni bulk: "Segna tutte come lette", "Elimina lette"
- Empty state quando non ci sono notifiche

#### Task 5.4 - Hook e Utility React
**File nuovo**: `src/hooks/useNotifications.ts`
- `useUnreadCount()`: Contatore non lette con polling
- `useNotifications(filters)`: Lista notifiche con paginazione
- `useMarkAsRead(id)`: Mutation per segnare come letta
- `useMarkAllAsRead()`: Mutation per segnare tutte
- `useDeleteNotifications(ids)`: Mutation per eliminare

#### Task 5.5 - Aggiornamento Sidebar/Navigation
**File da modificare**: componente di navigazione principale
- Aggiungere voce "Inbox" / "Avvisi" nella sidebar con badge contatore
- Icona: Bell o Inbox (Lucide)

**Parallelizzabile**: Task 5.1 e 5.4 sono prerequisiti. Task 5.2 e 5.3 possono essere sviluppate in parallelo dopo 5.4. Task 5.5 e' indipendente.

---

### FASE 6: Pagina Impostazioni Notifiche
**Obiettivo**: Creare la UI per configurare le preferenze di notifica per ciascun utente.

#### Task 6.1 - Pagina Impostazioni Notifiche
**File nuovo**: `src/app/(dashboard)/impostazioni/notifiche/page.tsx`
**File nuovo**: `src/app/(dashboard)/impostazioni/notifiche/NotificationSettingsClient.tsx`
- Sezione "Canali di notifica":
  - Toggle Push notifications (on/off) + lista dispositivi registrati
  - Toggle Email (on/off)
  - Toggle Telegram (on/off) + processo linking bot + test messaggio
- Sezione "Tipi di notifica" (tabella/griglia):
  - Righe: ogni tipo di notifica (chiusure, budget, fatture, prezzi, certificazioni, turni, ferie, presenze, riconciliazione, cash flow)
  - Colonne: In-App (sempre on, non disabilitabile) | Email | Push | Telegram
  - Toggle per ogni combinazione tipo/canale
- Pulsante "Salva preferenze"
- Pulsante "Ripristina default"

#### Task 6.2 - API Aggiornamento Preferenze
**File da modificare**: `src/app/api/notifications/preferences/route.ts`
- Aggiornare schema Zod per nuovi campi
- PUT/PATCH: salvare tutti i nuovi campi di preferenza
- GET: ritornare tutte le preferenze con default

#### Task 6.3 - Gestione Dispositivi Push
**File da modificare**: `src/app/api/notifications/subscribe/route.ts`
- Aggiungere endpoint per rinominare dispositivo
- Aggiungere endpoint per inviare notifica di test

**Parallelizzabile**: Task 6.1, 6.2, 6.3 possono essere sviluppate in parallelo.

---

### FASE 7: Cron Jobs e Scheduling
**Obiettivo**: Configurare i job periodici per le notifiche basate su scadenze e controlli.

#### Task 7.1 - Endpoint Cron Unificato
**File nuovo**: `src/app/api/cron/notifications/route.ts`
- Endpoint unico che esegue tutti i check:
  1. Fatture in scadenza (7gg, 3gg, 1gg, oggi, scadute)
  2. Certificazioni in scadenza (30gg, 14gg, 7gg, oggi, scadute)
  3. Transazioni bancarie non riconciliate (> 3 giorni)
  4. Cash flow sotto soglia
- Protetto con `Authorization: Bearer {CRON_SECRET}`
- Log esecuzione e risultati
- Deduplicazione: non inviare stessa notifica due volte nello stesso giorno

#### Task 7.2 - Documentazione Configurazione Cron
Documentare come configurare i cron job (Vercel Cron, Railway Cron, o servizio esterno):
- `/api/cron/notifications` - Ogni giorno alle 08:00 Europe/Rome
- `/api/shifts/reminder` - Ogni 10 minuti (gia esistente)

**Parallelizzabile**: Task 7.1 e 7.2 sono indipendenti.

---

### FASE 8: Test e Validazione
**Obiettivo**: Assicurare la qualita e stabilita del sistema.

#### Task 8.1 - Test Unitari Service Layer
- Test per `sendNotification()` con mock dei canali
- Test per `shouldSendNotification()` con diverse configurazioni
- Test per ogni trigger function
- Test per template email e Telegram

#### Task 8.2 - Test API Routes
- Test per tutti gli endpoint notifiche (subscribe, preferences, history)
- Test per i cron endpoint
- Test per il webhook Telegram

#### Task 8.3 - Test Componenti UI
- Test per NotificationPopover
- Test per pagina Inbox (filtri, paginazione, azioni)
- Test per pagina Impostazioni

#### Task 8.4 - Test E2E
- Flusso completo: evento -> notifica in-app -> lettura -> archiviazione
- Flusso impostazioni: configura preferenze -> verifica delivery canali

**Parallelizzabile**: Task 8.1, 8.2, 8.3 possono essere eseguiti in parallelo. Task 8.4 richiede che tutto sia funzionante.

---

## Diagramma Dipendenze Fasi

```
FASE 1 (Schema + Tipi)
  |
  +---> FASE 2 (Telegram Service)
  |       |
  +---> FASE 3 (Service Layer)  <--- dipende da FASE 2
          |
          +---> FASE 4 (Trigger) --- puo essere parallelizzata internamente
          |
          +---> FASE 5 (Inbox UI) --- puo essere parallelizzata internamente
          |
          +---> FASE 6 (Impostazioni UI) --- parallelizzabile con FASE 5
          |
          +---> FASE 7 (Cron Jobs) --- dipende da FASE 4
                  |
                  +---> FASE 8 (Test)
```

**Parallelizzazione ottimale per sotto-agenti:**
- **Agente A**: FASE 1 -> FASE 2 -> FASE 3 (backend core)
- **Agente B** (dopo FASE 1): FASE 5 + FASE 6 (frontend UI) - puo iniziare dopo FASE 1 usando mock dei dati
- **Agente C** (dopo FASE 3): FASE 4 task 4.1-4.3 (trigger sincroni)
- **Agente D** (dopo FASE 3): FASE 4 task 4.4-4.7 + FASE 7 (cron jobs)
- **Agente E** (alla fine): FASE 8 (test)

---

## Elementi Notificabili - Riepilogo Completo

| Categoria | Evento | Priorita | Destinatari | Canali Suggeriti |
|-----------|--------|----------|-------------|-----------------|
| **Chiusure** | Chiusura inviata per validazione | HIGH | Manager venue | In-app, Email, Telegram |
| **Chiusure** | Chiusura approvata | NORMAL | Staff che ha inviato | In-app |
| **Chiusure** | Chiusura rifiutata | HIGH | Staff che ha inviato | In-app, Email, Telegram |
| **Budget** | Sforamento budget categoria | HIGH | Admin, Manager | In-app, Email, Telegram |
| **Budget** | Budget rientrato nella norma | LOW | Chi ha preso in carico | In-app |
| **Fatture** | Scadenza tra 7 giorni | NORMAL | Admin, Manager | In-app |
| **Fatture** | Scadenza tra 3 giorni | HIGH | Admin, Manager | In-app, Email |
| **Fatture** | Scadenza domani/oggi | URGENT | Admin, Manager | In-app, Email, Telegram |
| **Fatture** | Fattura scaduta non pagata | URGENT | Admin | In-app, Email, Telegram |
| **Prezzi** | Aumento prezzo > 5% | HIGH | Admin, Manager | In-app, Email |
| **Prezzi** | Diminuzione prezzo > 5% | NORMAL | Admin, Manager | In-app |
| **Certificazioni** | Scadenza tra 30 giorni | NORMAL | Dipendente, Manager | In-app |
| **Certificazioni** | Scadenza tra 7 giorni | HIGH | Dipendente, Manager | In-app, Email |
| **Certificazioni** | Certificazione scaduta | URGENT | Dipendente, Manager, Admin | In-app, Email, Telegram |
| **Turni** | Nuovi turni pubblicati | NORMAL | Staff assegnato | In-app, Push |
| **Turni** | Promemoria turno (1h prima) | NORMAL | Dipendente | Push |
| **Turni** | Richiesta scambio turno | NORMAL | Dipendente target | In-app, Push |
| **Ferie** | Nuova richiesta ferie | NORMAL | Manager | In-app, Email |
| **Ferie** | Ferie approvate | NORMAL | Dipendente | In-app, Push |
| **Ferie** | Ferie rifiutate | HIGH | Dipendente | In-app, Push, Email |
| **Presenze** | Anomalia rilevata | HIGH | Dipendente, Manager | In-app, Push |
| **Presenze** | Anomalia risolta | NORMAL | Dipendente | In-app |
| **Banca** | Transazioni da riconciliare (>3gg) | NORMAL | Admin | In-app |
| **Cash Flow** | Liquidita prevista sotto soglia | URGENT | Admin, Manager | In-app, Email, Telegram |

---

## Suggerimenti Architetturali

### 1. IN_APP come canale base obbligatorio
Ogni notifica DEVE creare un record `NotificationLog` con channel `IN_APP`, indipendentemente dalle preferenze utente. Questo garantisce che l'Inbox sia sempre completo. I canali aggiuntivi (email, push, Telegram) sono opzionali e configurabili.

### 2. Deduplicazione Notifiche
Per i cron job, implementare un meccanismo di deduplicazione basato su:
- `referenceId` + `referenceType` + `type` + data odierna
- Evita di inviare la stessa notifica piu volte nello stesso giorno

### 3. Raggruppamento Notifiche (Digest)
Per evitare spam, considerare un sistema di digest:
- Se ci sono piu di 3 notifiche dello stesso tipo nello stesso giorno, raggrupparle in un singolo messaggio email/Telegram
- Es. "Hai 5 fatture in scadenza questa settimana" invece di 5 email separate

### 4. Telegram senza dipendenze pesanti
Usare fetch diretto verso Telegram Bot API invece di librerie come `node-telegram-bot-api`. Questo mantiene il bundle leggero e riduce le dipendenze.

### 5. Real-time vs Polling
Per la v1, usare polling con React Query (refetchInterval: 30000). In futuro, se necessario, si puo aggiungere Server-Sent Events (SSE) per aggiornamenti real-time senza la complessita di WebSocket.

### 6. Separazione Concern
Mantenere i trigger di notifica separati dalla business logic. I trigger devono essere chiamate fire-and-forget che non bloccano il flusso principale (usare `Promise.resolve().then(...)` o simili per non rallentare le API).

---

## Stima Complessita per Fase

| Fase | File Nuovi | File Modificati | Complessita |
|------|-----------|----------------|-------------|
| FASE 1 | 0 | 2 | Bassa |
| FASE 2 | 3 | 0 | Media |
| FASE 3 | 2 | 1 | Media |
| FASE 4 | 4 | 4 | Alta |
| FASE 5 | 5 | 2 | Alta |
| FASE 6 | 2 | 2 | Media |
| FASE 7 | 1 | 0 | Media |
| FASE 8 | 4 | 0 | Media |
| **Totale** | **21** | **11** | - |

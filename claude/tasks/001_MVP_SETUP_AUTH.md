# Task 001: MVP Setup e Autenticazione

## Obiettivo
Setup iniziale del progetto Next.js 14 con autenticazione, database PostgreSQL e struttura base.

---

## Piano di Implementazione

### Fase 1: Setup Progetto (Step 1-5)

#### Step 1: Inizializzazione Next.js
- Creare progetto Next.js 14 con App Router
- Configurare TypeScript, TailwindCSS, ESLint
- Struttura cartelle come da PRD

#### Step 2: Dipendenze
```bash
# Core
@prisma/client, prisma, @tanstack/react-query, zod, react-hook-form, @hookform/resolvers

# UI
tailwindcss, shadcn/ui components (button, card, input, select, table, dialog, etc.)

# Auth
next-auth@beta, bcryptjs

# Utils
date-fns, decimal.js, lucide-react
```

#### Step 3: Setup Prisma + PostgreSQL
- Configurare Prisma con PostgreSQL
- Creare schema completo (da PRD)
- Configurare migrations

#### Step 4: Schema Database
Entità da creare:
- `User`, `Role`, `Permission`, `RolePermission`
- `Venue`, `CashStationTemplate`
- `DailyClosure`, `CashStation`, `CashCount`
- `HourlyPartial`, `DailyExpense`, `DailyAttendance`
- `Account`, `JournalEntry`, `RegisterBalance`
- `Supplier`

#### Step 5: Seed Dati Test
- 3 ruoli: admin, manager, staff
- 10 permessi base
- 1 sede: Weiss Cafè
- 7 template postazioni cassa
- Utenti test (admin + staff)
- Piano dei conti base
- Fornitori esempio

### Fase 2: Autenticazione (Step 6-8)

#### Step 6: NextAuth.js
- Credentials provider
- JWT strategy
- Session con user info + role + venue

#### Step 7: Layout Base
- Sidebar navigazione
- Header con user info
- Responsive design

#### Step 8: Protezione Route
- Middleware per route protette
- HOC/Hook per check permessi
- Redirect non autorizzati

### Fase 3: GitHub e Deploy Prep (Step 9-10)

#### Step 9: Git Repository
- Inizializzare git
- Creare .gitignore
- Creare repo GitHub
- Push iniziale

#### Step 10: Configurazione Ambiente
- .env.example
- Documentazione setup locale
- README.md base

---

## Ragionamento

### Perché questo ordine?
1. **Setup first**: Base solida prima di qualsiasi feature
2. **Database early**: Lo schema è il fondamento di tutto
3. **Auth prima delle feature**: Ogni pagina deve essere protetta
4. **GitHub subito**: Versionamento fin dall'inizio

### Scelte Tecniche
- **Next.js 14 App Router**: Moderno, ottimo per PWA futura
- **Prisma**: Type-safe, migrations semplici
- **NextAuth.js**: Standard de facto per Next.js
- **shadcn/ui**: Componenti personalizzabili, non opinionated

---

## Checklist

- [x] Step 1: Inizializzazione Next.js
- [x] Step 2: Installazione dipendenze
- [x] Step 3: Setup Prisma
- [x] Step 4: Schema database completo
- [x] Step 5: Seed dati test
- [x] Step 6: NextAuth.js configurazione
- [x] Step 7: Layout base con sidebar
- [x] Step 8: Protezione route
- [x] Step 9: GitHub repository
- [x] Step 10: Configurazione ambiente

---

## Progress Log

### 2 Gennaio 2026
- Piano creato e approvato
- **Step 1 COMPLETATO**: Next.js 16.1.1 + React 19 + TypeScript + Tailwind
  - Progetto creato in `/Users/nicolascarpa/Desktop/accounting`
  - Build test passato con successo
  - File esistenti (CLAUDE.md, PRD/, claude/) preservati
- **Step 2 COMPLETATO**: Dipendenze installate
  - Core: @prisma/client, @tanstack/react-query, zod, react-hook-form, next-auth@beta
  - Utils: date-fns, decimal.js, bcryptjs, lucide-react
  - UI: 16 componenti shadcn/ui (button, card, input, form, table, dialog, etc.)
  - Build test passato con successo
- **Step 3-4 COMPLETATO**: Prisma + Schema Database
  - Connessione PostgreSQL su Supabase (porta 5432 diretta)
  - Prisma 7 con adapter pattern (@prisma/adapter-pg)
  - Schema completo: 15 modelli (User, Role, Permission, Venue, etc.)
  - Relazioni RBAC complete
  - `prisma db push` eseguito con successo
- **Step 5 COMPLETATO**: Seed dati test
  - 3 ruoli: admin, manager, staff
  - 10 permessi base
  - 1 sede: Weiss Cafè con 7 postazioni cassa
  - 11 utenti test (admin@weisscafe.it / admin123)
  - Piano conti base (20 conti)
  - 4 fornitori esempio
- **Step 6 COMPLETATO**: NextAuth.js
  - Credentials provider con bcrypt
  - JWT strategy (30 giorni)
  - Session estesa con user info, role, venue
  - API route handlers
  - Type augmentation per TypeScript
- **Step 7 COMPLETATO**: Layout base con sidebar
  - Dashboard layout con protezione auth
  - Sidebar navigabile con collapse
  - Header con user menu e logout
  - Route: /, /chiusura-cassa, /prima-nota, /report, /impostazioni
  - Pagine placeholder per ogni sezione
- **Step 8 COMPLETATO**: Protezione route
  - Middleware NextAuth per route protette
  - Redirect a /login per non autenticati
  - Controllo ruoli per /impostazioni (admin, manager only)
  - Matchers configurati correttamente
- **Step 9 COMPLETATO**: Git Repository
  - Repository git inizializzato
  - Commit iniziale con tutti i file
  - README.md con documentazione setup
- **Step 10 COMPLETATO**: Configurazione ambiente
  - .env.example aggiornato con tutte le variabili
  - Documentazione setup locale nel README

### TASK 001 COMPLETATO
Setup MVP e autenticazione completati. Il sistema è pronto per lo sviluppo delle feature principali:
- Chiusura Cassa
- Prima Nota
- Report

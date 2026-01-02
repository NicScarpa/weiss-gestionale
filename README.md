# Weiss Cafè Gestionale

Sistema gestionale per Weiss Cafè - Contabilità e controllo di gestione.

## Requisiti

- Node.js 18+
- PostgreSQL 15+ (Supabase consigliato)

## Setup Locale

### 1. Clona il repository

```bash
git clone https://github.com/YOUR_USERNAME/weiss-gestionale.git
cd weiss-gestionale
```

### 2. Installa le dipendenze

```bash
npm install
```

### 3. Configura le variabili d'ambiente

```bash
cp .env.example .env
```

Modifica `.env` con le tue credenziali:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="genera-con-openssl-rand-base64-32"
AUTH_SECRET="stesso-valore-di-nextauth-secret"
```

### 4. Setup Database

```bash
# Crea le tabelle
npx prisma db push

# Popola con dati di test
npm run db:seed
```

### 5. Avvia il server di sviluppo

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

## Credenziali Test

- **Admin**: admin@weisscafe.it / admin123
- **Manager**: manager@weisscafe.it / manager123
- **Staff**: staff@weisscafe.it / staff123

## Stack Tecnologico

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Styling**: TailwindCSS + shadcn/ui
- **Database**: PostgreSQL + Prisma 7
- **Auth**: NextAuth.js v5
- **State**: TanStack Query

## Struttura Progetto

```
src/
├── app/
│   ├── (auth)/          # Pagine di autenticazione
│   ├── (dashboard)/     # Pagine protette
│   └── api/             # API routes
├── components/
│   ├── layout/          # Layout components (sidebar, header)
│   └── ui/              # shadcn/ui components
└── lib/                 # Utilities (auth, prisma, utils)
```

## Documentazione

- [PRD Modulo Contabilità](./PRD/PRD_v1_1.md)
- [PRD Modulo Personale](./PRD/PRD_Modulo_Gestione_Personale_v1.0.md)

## License

Private - All rights reserved

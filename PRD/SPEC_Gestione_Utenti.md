# Specifica Tecnica: Modulo Gestione Utenti

**Progetto:** Sistema Gestionale Weiss Cafè  
**Modulo:** Gestione Utenti e Autenticazione  
**Versione:** 1.0  
**Data:** 10 Gennaio 2026  

---

## 1. Contesto e Obiettivi

### 1.1 Obiettivo
Implementare un sistema completo di gestione utenti integrato nella sezione Impostazioni, che permetta:
- Creazione e gestione utenti con ruoli differenziati (Admin, Manager, Staff)
- Sistema di autenticazione con credenziali auto-generate per lo staff
- Gestione del primo accesso con cambio password obbligatorio
- Profilo personale modificabile da ogni utente

### 1.2 Posizione nel Sistema
- **Route:** `/impostazioni/utenti`
- **Pagine esistenti da NON modificare:**
  - `/impostazioni/generali` - Sedi e Prima Nota
  - `/impostazioni/fornitori` - Fornitori
  - `/impostazioni/conti` - Piano dei conti
  - `/impostazioni/budget` - Budget

---

## 2. Regole di Business

### 2.1 Tabella Permessi per Ruolo

| Azione | ADMIN | MANAGER | STAFF |
|--------|-------|---------|-------|
| Creare Staff | ✅ | ✅ | ❌ |
| Creare Manager | ✅ | ❌ | ❌ |
| Creare Admin | ✅ | ❌ | ❌ |
| Disattivare Staff | ✅ | ✅ | ❌ |
| Disattivare Manager | ✅ | ❌ | ❌ |
| Disattivare Admin | ✅ | ❌ | ❌ |
| Visualizzare lista utenti | ✅ Tutti | ✅ Solo Staff | ❌ |
| Modificare altri utenti | ✅ Tutti | ✅ Solo Staff | ❌ |
| Modificare proprio profilo | ✅ | ✅ | ✅ |
| Accedere a /impostazioni/utenti | ✅ | ✅ | ❌ |

### 2.2 Sistema di Autenticazione

#### Username
| Ruolo | Formato Username | Esempio |
|-------|------------------|---------|
| STAFF | `NomeCognome` (auto-generato) | `VanessaBasso` |
| MANAGER | Email aziendale | `manager@weisscafe.com` |
| ADMIN | Email aziendale | `admin@weisscafe.com` |

#### Password
- **Password iniziale:** `1234567890` (uguale per tutti i nuovi utenti)
- **Primo accesso:** Cambio password OBBLIGATORIO (modale bloccante)
- **Requisiti nuova password:** Minimo 8 caratteri, diversa da `1234567890`

#### Gestione Username Duplicati (Solo Staff)
Se esistono già utenti con lo stesso NomeCognome:
- Primo utente: `MarioRossi`
- Secondo utente: `MarioRossi2`
- Terzo utente: `MarioRossi3`
- etc.

#### Normalizzazione Username
Rimuovere automaticamente:
- Accenti: `é` → `e`, `à` → `a`
- Apostrofi: `D'Amico` → `DAmico`
- Spazi: `De Rossi` → `DeRossi`
- Caratteri speciali: tutto ciò che non è `[a-zA-Z]`

### 2.3 Campi Profilo Modificabili dallo Staff

| Campo | Modificabile da Staff | Modificabile da Admin/Manager |
|-------|----------------------|-------------------------------|
| Nome | ❌ | ✅ |
| Cognome | ❌ | ✅ |
| Username | ❌ | ❌ (auto-generato) |
| Password | ✅ | ✅ (reset) |
| Email | ✅ | ✅ |
| Telefono | ✅ | ✅ |
| Indirizzo | ✅ | ✅ |
| Ruolo | ❌ | ✅ (solo Admin) |
| Sede | ❌ | ✅ |
| Tipo dipendente | ❌ | ✅ |
| Tariffa oraria | ❌ | ✅ |

### 2.4 Vincoli
- **Sede:** Obbligatoria per tutti gli utenti
- **Multi-sede:** NO - ogni utente appartiene a UNA sola sede
- **Soft delete:** Gli utenti vengono disattivati (`isActive: false`), mai eliminati

---

## 3. Schema Database

### 3.1 Modifica Tabella User (Prisma)

```prisma
// prisma/schema.prisma

model User {
  id                  String    @id @default(cuid())
  
  // === AUTENTICAZIONE ===
  username            String    @unique    // "NomeCognome" per staff, email per admin/manager
  email               String?              // Opzionale per staff, obbligatoria per admin/manager
  passwordHash        String
  mustChangePassword  Boolean   @default(true)
  
  // === ANAGRAFICA ===
  firstName           String
  lastName            String
  phone               String?
  address             String?
  
  // === RUOLO E SEDE ===
  role                Role      @default(STAFF)
  venueId             String
  venue               Venue     @relation(fields: [venueId], references: [id])
  
  // === LAVORO (per staff) ===
  hourlyRate          Decimal?  @db.Decimal(10, 2)
  employeeType        EmployeeType @default(FIXED)
  hireDate            DateTime?
  
  // === STATO ===
  isActive            Boolean   @default(true)
  lastLoginAt         DateTime?
  
  // === AUDIT ===
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  createdById         String?
  createdBy           User?     @relation("CreatedByUser", fields: [createdById], references: [id])
  createdUsers        User[]    @relation("CreatedByUser")
  
  // === RELAZIONI ESISTENTI ===
  dailyAttendances    DailyAttendance[]
  submittedClosures   DailyClosure[]    @relation("SubmittedBy")
  validatedClosures   DailyClosure[]    @relation("ValidatedBy")
  journalEntries      JournalEntry[]

  @@index([venueId])
  @@index([role])
  @@index([isActive])
}

enum Role {
  ADMIN
  MANAGER
  STAFF
}

enum EmployeeType {
  FIXED   // Dipendente fisso
  EXTRA   // Collaboratore occasionale
}
```

### 3.2 Migration

```bash
npx prisma migrate dev --name add_user_auth_fields
```

### 3.3 Seed Utente Admin Iniziale

```typescript
// prisma/seed.ts

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Trova o crea la sede principale
  const venue = await prisma.venue.findFirst({
    where: { code: 'WEISS' }
  });

  if (!venue) {
    throw new Error('Sede WEISS non trovata. Esegui prima il seed delle sedi.');
  }

  // Crea admin iniziale
  const adminPassword = await bcrypt.hash('1234567890', 12);
  
  await prisma.user.upsert({
    where: { username: 'admin@weisscafe.com' },
    update: {},
    create: {
      username: 'admin@weisscafe.com',
      email: 'admin@weisscafe.com',
      passwordHash: adminPassword,
      mustChangePassword: true,
      firstName: 'Admin',
      lastName: 'Weiss',
      role: Role.ADMIN,
      venueId: venue.id
    }
  });

  console.log('✅ Utente admin creato: admin@weisscafe.com / 1234567890');
}

main();
```

---

## 4. Utility Functions

### 4.1 Generazione Username Unico

```typescript
// lib/utils/username.ts

/**
 * Normalizza una stringa rimuovendo accenti, apostrofi, spazi e caratteri speciali
 */
export function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Rimuove accenti
    .replace(/[^a-zA-Z]/g, '');       // Solo lettere
}

/**
 * Genera username base da nome e cognome
 */
export function generateUsername(firstName: string, lastName: string): string {
  const cleanFirst = normalizeString(firstName);
  const cleanLast = normalizeString(lastName);
  return `${cleanFirst}${cleanLast}`;
}

/**
 * Genera username unico, aggiungendo numero progressivo se necessario
 */
export async function generateUniqueUsername(
  prisma: PrismaClient,
  firstName: string,
  lastName: string
): Promise<string> {
  const baseUsername = generateUsername(firstName, lastName);
  
  // Cerca tutti gli username che iniziano con baseUsername
  const existingUsers = await prisma.user.findMany({
    where: {
      username: {
        startsWith: baseUsername
      }
    },
    select: { username: true }
  });
  
  // Se non esiste nessuno, restituisci il base
  if (existingUsers.length === 0) {
    return baseUsername;
  }
  
  const existingUsernames = new Set(existingUsers.map(u => u.username));
  
  // Se il base non è usato, restituiscilo
  if (!existingUsernames.has(baseUsername)) {
    return baseUsername;
  }
  
  // Trova il prossimo numero disponibile
  let counter = 2;
  while (existingUsernames.has(`${baseUsername}${counter}`)) {
    counter++;
  }
  
  return `${baseUsername}${counter}`;
}
```

### 4.2 Permessi Utente

```typescript
// lib/utils/permissions.ts

import { Role } from '@prisma/client';

type RoleArray = Role[];

export const userPermissions = {
  // Quali ruoli può creare ciascun ruolo
  canCreateRoles: {
    [Role.ADMIN]: [Role.ADMIN, Role.MANAGER, Role.STAFF] as RoleArray,
    [Role.MANAGER]: [Role.STAFF] as RoleArray,
    [Role.STAFF]: [] as RoleArray
  },
  
  // Quali ruoli può modificare ciascun ruolo
  canModifyRoles: {
    [Role.ADMIN]: [Role.ADMIN, Role.MANAGER, Role.STAFF] as RoleArray,
    [Role.MANAGER]: [Role.STAFF] as RoleArray,
    [Role.STAFF]: [] as RoleArray
  },
  
  // Quali ruoli può disattivare ciascun ruolo
  canDeactivateRoles: {
    [Role.ADMIN]: [Role.ADMIN, Role.MANAGER, Role.STAFF] as RoleArray,
    [Role.MANAGER]: [Role.STAFF] as RoleArray,
    [Role.STAFF]: [] as RoleArray
  },
  
  // Quali ruoli può vedere nella lista ciascun ruolo
  canViewRoles: {
    [Role.ADMIN]: [Role.ADMIN, Role.MANAGER, Role.STAFF] as RoleArray,
    [Role.MANAGER]: [Role.STAFF] as RoleArray,
    [Role.STAFF]: [] as RoleArray
  }
};

/**
 * Verifica se un utente può eseguire un'azione su un target
 */
export function canPerformAction(
  action: 'create' | 'modify' | 'deactivate' | 'view',
  currentUserRole: Role,
  targetRole: Role
): boolean {
  const permissionKey = {
    create: 'canCreateRoles',
    modify: 'canModifyRoles',
    deactivate: 'canDeactivateRoles',
    view: 'canViewRoles'
  }[action] as keyof typeof userPermissions;
  
  return userPermissions[permissionKey][currentUserRole].includes(targetRole);
}

/**
 * Verifica se l'utente può accedere alla pagina gestione utenti
 */
export function canAccessUserManagement(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MANAGER;
}
```

---

## 5. API Endpoints

### 5.1 Struttura Routes

```
/api/users
  GET     /                → Lista utenti (filtrata per ruolo chiamante)
  POST    /                → Crea nuovo utente
  GET     /[id]            → Dettaglio utente
  PATCH   /[id]            → Modifica utente
  DELETE  /[id]            → Disattiva utente (soft delete)
  POST    /[id]/reset-password → Reset password a valore iniziale

/api/users/me
  GET     /                → Profilo utente corrente
  PATCH   /                → Modifica proprio profilo

/api/auth
  POST    /login           → Login
  POST    /logout          → Logout
  POST    /change-password → Cambio password
```

### 5.2 GET /api/users - Lista Utenti

```typescript
// app/api/users/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { userPermissions } from '@/lib/utils/permissions';
import { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const currentUser = session.user;
  
  // Staff non può accedere alla lista
  if (currentUser.role === Role.STAFF) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });
  }
  
  // Determina quali ruoli può vedere
  const visibleRoles = userPermissions.canViewRoles[currentUser.role as Role];
  
  // Parametri query
  const { searchParams } = new URL(request.url);
  const roleFilter = searchParams.get('role');
  const venueFilter = searchParams.get('venueId');
  const statusFilter = searchParams.get('status') || 'active';
  const search = searchParams.get('search');
  
  // Costruisci where clause
  const where: any = {
    role: {
      in: roleFilter && visibleRoles.includes(roleFilter as Role) 
        ? [roleFilter as Role] 
        : visibleRoles
    }
  };
  
  // Filtro stato
  if (statusFilter === 'active') {
    where.isActive = true;
  } else if (statusFilter === 'inactive') {
    where.isActive = false;
  }
  // 'all' non aggiunge filtro
  
  // Filtro sede
  if (venueFilter) {
    where.venueId = venueFilter;
  }
  
  // Ricerca testuale
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }
  
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      employeeType: true,
      hourlyRate: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      venue: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    },
    orderBy: [
      { role: 'asc' },
      { lastName: 'asc' },
      { firstName: 'asc' }
    ]
  });
  
  return NextResponse.json({ users });
}
```

### 5.3 POST /api/users - Crea Utente

```typescript
// app/api/users/route.ts (aggiungere al file esistente)

import bcrypt from 'bcryptjs';
import { generateUniqueUsername } from '@/lib/utils/username';
import { canPerformAction } from '@/lib/utils/permissions';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const currentUser = session.user;
  const body = await request.json();
  
  const { 
    firstName, 
    lastName, 
    email, 
    role, 
    venueId, 
    hourlyRate, 
    employeeType,
    hireDate 
  } = body;
  
  // === VALIDAZIONI ===
  
  // Campi obbligatori
  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json(
      { error: 'Nome e cognome sono obbligatori' }, 
      { status: 400 }
    );
  }
  
  if (!venueId) {
    return NextResponse.json(
      { error: 'La sede è obbligatoria' }, 
      { status: 400 }
    );
  }
  
  if (!role || !Object.values(Role).includes(role)) {
    return NextResponse.json(
      { error: 'Ruolo non valido' }, 
      { status: 400 }
    );
  }
  
  // Email obbligatoria per Admin e Manager
  if ((role === Role.ADMIN || role === Role.MANAGER) && !email?.trim()) {
    return NextResponse.json(
      { error: 'Email obbligatoria per Admin e Manager' }, 
      { status: 400 }
    );
  }
  
  // Verifica permessi
  if (!canPerformAction('create', currentUser.role as Role, role as Role)) {
    return NextResponse.json(
      { error: `Non hai i permessi per creare utenti con ruolo ${role}` }, 
      { status: 403 }
    );
  }
  
  // Verifica sede esistente
  const venue = await prisma.venue.findUnique({
    where: { id: venueId }
  });
  
  if (!venue) {
    return NextResponse.json(
      { error: 'Sede non trovata' }, 
      { status: 400 }
    );
  }
  
  // === GENERAZIONE CREDENZIALI ===
  
  let username: string;
  
  if (role === Role.STAFF) {
    // Staff: username = NomeCognome (unico)
    username = await generateUniqueUsername(prisma, firstName.trim(), lastName.trim());
  } else {
    // Admin/Manager: username = email
    username = email.toLowerCase().trim();
    
    // Verifica unicità email/username
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'Esiste già un utente con questa email' }, 
        { status: 400 }
      );
    }
  }
  
  // Password iniziale: 1234567890
  const passwordHash = await bcrypt.hash('1234567890', 12);
  
  // === CREAZIONE UTENTE ===
  
  const newUser = await prisma.user.create({
    data: {
      username,
      email: email?.trim().toLowerCase() || null,
      passwordHash,
      mustChangePassword: true,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role as Role,
      venueId,
      hourlyRate: role === Role.STAFF && hourlyRate ? parseFloat(hourlyRate) : null,
      employeeType: role === Role.STAFF ? (employeeType || 'FIXED') : null,
      hireDate: hireDate ? new Date(hireDate) : null,
      createdById: currentUser.id
    },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      venue: {
        select: { id: true, name: true }
      }
    }
  });
  
  return NextResponse.json({
    user: newUser,
    credentials: {
      username,
      temporaryPassword: '1234567890',
      message: 'L\'utente dovrà cambiare la password al primo accesso'
    }
  }, { status: 201 });
}
```

### 5.4 PATCH /api/users/[id] - Modifica Utente

```typescript
// app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { canPerformAction } from '@/lib/utils/permissions';
import { Role } from '@prisma/client';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const currentUser = session.user;
  const targetUserId = params.id;
  
  // Trova utente target
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId }
  });
  
  if (!targetUser) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  }
  
  // Verifica permessi
  if (!canPerformAction('modify', currentUser.role as Role, targetUser.role)) {
    return NextResponse.json(
      { error: 'Non hai i permessi per modificare questo utente' }, 
      { status: 403 }
    );
  }
  
  const body = await request.json();
  
  // Campi che possono essere modificati
  const allowedFields = [
    'firstName', 
    'lastName', 
    'email', 
    'phone', 
    'address', 
    'venueId',
    'hourlyRate', 
    'employeeType',
    'hireDate'
  ];
  
  // Solo Admin può cambiare ruolo
  if (currentUser.role === Role.ADMIN && body.role) {
    allowedFields.push('role');
  }
  
  // Costruisci update data
  const updateData: any = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'hourlyRate') {
        updateData[field] = body[field] ? parseFloat(body[field]) : null;
      } else if (field === 'hireDate') {
        updateData[field] = body[field] ? new Date(body[field]) : null;
      } else if (field === 'email') {
        updateData[field] = body[field]?.trim().toLowerCase() || null;
      } else {
        updateData[field] = body[field];
      }
    }
  }
  
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      address: true,
      role: true,
      employeeType: true,
      hourlyRate: true,
      isActive: true,
      venue: {
        select: { id: true, name: true }
      }
    }
  });
  
  return NextResponse.json({ user: updatedUser });
}
```

### 5.5 DELETE /api/users/[id] - Disattiva Utente

```typescript
// app/api/users/[id]/route.ts (aggiungere)

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const currentUser = session.user;
  const targetUserId = params.id;
  
  // Non puoi disattivare te stesso
  if (currentUser.id === targetUserId) {
    return NextResponse.json(
      { error: 'Non puoi disattivare il tuo stesso account' }, 
      { status: 400 }
    );
  }
  
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId }
  });
  
  if (!targetUser) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  }
  
  // Verifica permessi
  if (!canPerformAction('deactivate', currentUser.role as Role, targetUser.role)) {
    return NextResponse.json(
      { error: 'Non hai i permessi per disattivare questo utente' }, 
      { status: 403 }
    );
  }
  
  // Soft delete
  await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive: false }
  });
  
  return NextResponse.json({ success: true, message: 'Utente disattivato' });
}
```

### 5.6 POST /api/users/[id]/reset-password - Reset Password

```typescript
// app/api/users/[id]/reset-password/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { canPerformAction } from '@/lib/utils/permissions';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const currentUser = session.user;
  const targetUserId = params.id;
  
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId }
  });
  
  if (!targetUser) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  }
  
  // Verifica permessi (stesso di modifica)
  if (!canPerformAction('modify', currentUser.role as Role, targetUser.role)) {
    return NextResponse.json(
      { error: 'Non hai i permessi per resettare la password di questo utente' }, 
      { status: 403 }
    );
  }
  
  // Reset a password iniziale
  const passwordHash = await bcrypt.hash('1234567890', 12);
  
  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      passwordHash,
      mustChangePassword: true
    }
  });
  
  return NextResponse.json({ 
    success: true, 
    message: 'Password resettata. L\'utente dovrà cambiarla al prossimo accesso.',
    temporaryPassword: '1234567890'
  });
}
```

### 5.7 GET/PATCH /api/users/me - Profilo Personale

```typescript
// app/api/users/me/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      address: true,
      role: true,
      employeeType: true,
      hourlyRate: true,
      mustChangePassword: true,
      lastLoginAt: true,
      venue: {
        select: { id: true, name: true, code: true }
      }
    }
  });
  
  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const body = await request.json();
  
  // Campi modificabili dal proprio profilo
  const allowedFields = ['phone', 'email', 'address'];
  
  const updateData: any = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'email') {
        updateData[field] = body[field]?.trim().toLowerCase() || null;
      } else {
        updateData[field] = body[field];
      }
    }
  }
  
  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      address: true,
      role: true,
      venue: {
        select: { id: true, name: true }
      }
    }
  });
  
  return NextResponse.json({ user: updatedUser });
}
```

### 5.8 POST /api/auth/change-password - Cambio Password

```typescript
// app/api/auth/change-password/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  
  const { currentPassword, newPassword } = await request.json();
  
  // Validazioni
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Password attuale e nuova sono obbligatorie' }, 
      { status: 400 }
    );
  }
  
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'La nuova password deve avere almeno 8 caratteri' }, 
      { status: 400 }
    );
  }
  
  if (newPassword === '1234567890') {
    return NextResponse.json(
      { error: 'Scegli una password diversa da quella temporanea' }, 
      { status: 400 }
    );
  }
  
  // Verifica password attuale
  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  });
  
  const validPassword = await bcrypt.compare(currentPassword, user!.passwordHash);
  
  if (!validPassword) {
    return NextResponse.json(
      { error: 'Password attuale non corretta' }, 
      { status: 400 }
    );
  }
  
  // Aggiorna password
  const newHash = await bcrypt.hash(newPassword, 12);
  
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false
    }
  });
  
  return NextResponse.json({ success: true, message: 'Password aggiornata' });
}
```

---

## 6. Componenti UI

### 6.1 Struttura File

```
app/
├── impostazioni/
│   └── utenti/
│       ├── page.tsx              # Lista utenti
│       ├── nuovo/
│       │   └── page.tsx          # Form creazione
│       └── [id]/
│           └── page.tsx          # Dettaglio/modifica
├── profilo/
│   └── page.tsx                  # Profilo personale

components/
├── users/
│   ├── UserTable.tsx             # Tabella utenti
│   ├── UserForm.tsx              # Form creazione/modifica
│   ├── UserFilters.tsx           # Filtri lista
│   └── CredentialsDialog.tsx     # Modale credenziali post-creazione
├── auth/
│   └── ForcePasswordChangeModal.tsx  # Modale cambio password obbligatorio
```

### 6.2 Pagina Lista Utenti

```tsx
// app/impostazioni/utenti/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { UserTable } from '@/components/users/UserTable';
import { UserFilters } from '@/components/users/UserFilters';
import { toast } from 'sonner';

interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  employeeType: string | null;
  isActive: boolean;
  venue: { id: string; name: string };
}

interface Filters {
  role: string;
  venueId: string;
  status: string;
  search: string;
}

export default function UtentiPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    role: 'ALL',
    venueId: 'ALL',
    status: 'active',
    search: ''
  });

  // Redirect se non autorizzato
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'STAFF') {
      redirect('/profilo');
    }
  }, [session, status]);

  // Carica utenti
  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.role !== 'ALL') params.set('role', filters.role);
        if (filters.venueId !== 'ALL') params.set('venueId', filters.venueId);
        if (filters.status !== 'all') params.set('status', filters.status);
        if (filters.search) params.set('search', filters.search);

        const response = await fetch(`/api/users?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setUsers(data.users);
        } else {
          toast.error(data.error);
        }
      } catch (error) {
        toast.error('Errore nel caricamento utenti');
      } finally {
        setLoading(false);
      }
    }

    if (status === 'authenticated') {
      loadUsers();
    }
  }, [filters, status]);

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Sei sicuro di voler disattivare questo utente?')) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Utente disattivato');
        setUsers(users.map(u => 
          u.id === userId ? { ...u, isActive: false } : u
        ));
      } else {
        const data = await response.json();
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Errore durante la disattivazione');
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });

      if (response.ok) {
        toast.success('Utente riattivato');
        setUsers(users.map(u => 
          u.id === userId ? { ...u, isActive: true } : u
        ));
      }
    } catch (error) {
      toast.error('Errore durante la riattivazione');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Resettare la password a "1234567890"?')) return;

    try {
      const response = await fetch(`/api/users/${userId}/reset-password`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('Password resettata a: 1234567890');
      } else {
        const data = await response.json();
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Errore durante il reset');
    }
  };

  const currentUserRole = session?.user?.role as Role;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gestione Utenti</h1>
          <p className="text-gray-500">
            {currentUserRole === 'ADMIN' 
              ? 'Gestisci tutti gli utenti del sistema'
              : 'Gestisci gli utenti staff'}
          </p>
        </div>
        <Link href="/impostazioni/utenti/nuovo">
          <Button>+ Nuovo Utente</Button>
        </Link>
      </div>

      {/* Filtri */}
      <UserFilters 
        filters={filters}
        onFiltersChange={setFilters}
        showRoleFilter={currentUserRole === 'ADMIN'}
      />

      {/* Tabella */}
      <UserTable 
        users={users}
        loading={loading}
        currentUserRole={currentUserRole}
        currentUserId={session?.user?.id}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        onResetPassword={handleResetPassword}
      />
    </div>
  );
}
```

### 6.3 Form Creazione Utente

```tsx
// app/impostazioni/utenti/nuovo/page.tsx

'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CredentialsDialog } from '@/components/users/CredentialsDialog';
import { toast } from 'sonner';

// Funzione per anteprima username (client-side)
function generateUsernamePreview(firstName: string, lastName: string): string {
  const cleanFirst = firstName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  const cleanLast = lastName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return `${cleanFirst}${cleanLast}`;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  venueId: string;
  employeeType: 'FIXED' | 'EXTRA';
  hourlyRate: string;
}

interface CreatedUser {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    role: Role;
  };
  credentials: {
    username: string;
    temporaryPassword: string;
  };
}

export default function NuovoUtentePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  const currentUserRole = session?.user?.role as Role;
  
  // Ruoli che può creare
  const creatableRoles: Role[] = currentUserRole === 'ADMIN'
    ? [Role.ADMIN, Role.MANAGER, Role.STAFF]
    : [Role.STAFF];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      role: Role.STAFF,
      venueId: '',
      employeeType: 'FIXED',
      hourlyRate: ''
    }
  });

  const selectedRole = watch('role');
  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const isStaff = selectedRole === Role.STAFF;

  // Carica sedi
  useEffect(() => {
    async function loadVenues() {
      const response = await fetch('/api/venues');
      const data = await response.json();
      if (response.ok) {
        setVenues(data.venues);
      }
    }
    loadVenues();
  }, []);

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          hourlyRate: data.hourlyRate || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error);
        return;
      }

      // Mostra dialog con credenziali
      setCreatedUser(result);

    } catch (error) {
      toast.error('Errore durante la creazione');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Se utente creato, mostra dialog credenziali
  if (createdUser) {
    return (
      <CredentialsDialog
        user={createdUser.user}
        credentials={createdUser.credentials}
        onClose={() => router.push('/impostazioni/utenti')}
        onCreateAnother={() => {
          setCreatedUser(null);
          // Reset form
        }}
      />
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nuovo Utente</h1>
        <p className="text-gray-500">Crea un nuovo utente nel sistema</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Nome e Cognome */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome *</Label>
            <Input
              id="firstName"
              {...register('firstName', { required: 'Obbligatorio' })}
              placeholder="Mario"
            />
            {errors.firstName && (
              <p className="text-sm text-red-500">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Cognome *</Label>
            <Input
              id="lastName"
              {...register('lastName', { required: 'Obbligatorio' })}
              placeholder="Rossi"
            />
            {errors.lastName && (
              <p className="text-sm text-red-500">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Ruolo */}
        <div className="space-y-2">
          <Label>Ruolo *</Label>
          <Select
            value={selectedRole}
            onValueChange={(value) => setValue('role', value as Role)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {creatableRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500">
            {isStaff
              ? 'Lo staff accede con Username (NomeCognome)'
              : 'Admin e Manager accedono con email'}
          </p>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">
            Email {!isStaff && '*'}
          </Label>
          <Input
            id="email"
            type="email"
            {...register('email', {
              required: !isStaff ? 'Obbligatorio per Admin/Manager' : false,
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Email non valida'
              }
            })}
            placeholder="mario@weisscafe.com"
          />
          {isStaff && (
            <p className="text-sm text-gray-500">
              Opzionale per lo staff (per comunicazioni)
            </p>
          )}
          {errors.email && (
            <p className="text-sm text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Sede */}
        <div className="space-y-2">
          <Label>Sede *</Label>
          <Select
            value={watch('venueId')}
            onValueChange={(value) => setValue('venueId', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona sede" />
            </SelectTrigger>
            <SelectContent>
              {venues.map((venue) => (
                <SelectItem key={venue.id} value={venue.id}>
                  {venue.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campi specifici Staff */}
        {isStaff && (
          <>
            <div className="space-y-2">
              <Label>Tipo dipendente</Label>
              <Select
                value={watch('employeeType')}
                onValueChange={(value) => setValue('employeeType', value as 'FIXED' | 'EXTRA')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Dipendente fisso</SelectItem>
                  <SelectItem value="EXTRA">Extra/Occasionale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Tariffa oraria (€)</Label>
              <Input
                id="hourlyRate"
                type="number"
                step="0.50"
                {...register('hourlyRate')}
                placeholder="10.00"
              />
              <p className="text-sm text-gray-500">
                Per calcolo automatico compensi extra
              </p>
            </div>
          </>
        )}

        {/* Anteprima username (solo Staff) */}
        {isStaff && firstName && lastName && (
          <Card className="bg-gray-50">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-500">Username che verrà generato:</p>
              <p className="font-mono font-bold text-lg">
                {generateUsernamePreview(firstName, lastName)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                (potrebbe avere un numero se già esistente)
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Annulla
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creazione...' : 'Crea Utente'}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

### 6.4 Dialog Credenziali Post-Creazione

```tsx
// components/users/CredentialsDialog.tsx

'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Role } from '@prisma/client';

interface Props {
  user: {
    firstName: string;
    lastName: string;
    username: string;
    role: Role;
  };
  credentials: {
    username: string;
    temporaryPassword: string;
  };
  onClose: () => void;
  onCreateAnother: () => void;
}

export function CredentialsDialog({
  user,
  credentials,
  onClose,
  onCreateAnother
}: Props) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Mostra toast di conferma
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-green-600 flex items-center gap-2">
          <span>✓</span> Utente creato con successo
        </CardTitle>
        <CardDescription>
          {user.firstName} {user.lastName} ({user.role})
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Box credenziali */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 mb-3">
            📋 Credenziali di accesso
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-amber-600 uppercase tracking-wide">
                Username
              </p>
              <div className="flex items-center justify-between">
                <p className="font-mono font-bold text-lg">
                  {credentials.username}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(credentials.username)}
                >
                  Copia
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-amber-600 uppercase tracking-wide">
                Password temporanea
              </p>
              <div className="flex items-center justify-between">
                <p className="font-mono font-bold text-lg">
                  {credentials.temporaryPassword}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(credentials.temporaryPassword)}
                >
                  Copia
                </Button>
              </div>
            </div>
          </div>

          <p className="text-xs text-amber-700 mt-4 flex items-start gap-1">
            <span>⚠️</span>
            <span>
              L'utente dovrà cambiare la password al primo accesso.
              Comunica queste credenziali in modo sicuro.
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onCreateAnother}>
            Crea altro utente
          </Button>
          <Button onClick={onClose}>
            Torna alla lista
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 6.5 Modale Cambio Password Obbligatorio

```tsx
// components/auth/ForcePasswordChangeModal.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onSuccess: () => void;
}

export function ForcePasswordChangeModal({ isOpen, onSuccess }: Props) {
  const [currentPassword, setCurrentPassword] = useState('1234567890');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validazioni client-side
    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono');
      return;
    }

    if (newPassword.length < 8) {
      setError('La password deve avere almeno 8 caratteri');
      return;
    }

    if (newPassword === '1234567890') {
      setError('Scegli una password diversa da quella temporanea');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error);
        return;
      }

      toast.success('Password aggiornata con successo!');
      onSuccess();

    } catch (error) {
      setError('Errore durante il cambio password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent 
        className="sm:max-w-md"
        // Impedisce la chiusura cliccando fuori o premendo Escape
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Cambio Password Obbligatorio</DialogTitle>
          <DialogDescription>
            Per motivi di sicurezza, devi impostare una nuova password 
            prima di continuare a utilizzare il sistema.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Password attuale</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Password attuale"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nuova password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimo 8 caratteri"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Conferma nuova password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ripeti la nuova password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </p>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Aggiornamento...' : 'Imposta Nuova Password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 6.6 Integrazione nel Layout App

```tsx
// components/providers/AuthProvider.tsx

'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { ForcePasswordChangeModal } from '@/components/auth/ForcePasswordChangeModal';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, update } = useSession();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    // Mostra modale se l'utente deve cambiare password
    if (session?.user?.mustChangePassword) {
      setShowPasswordModal(true);
    }
  }, [session?.user?.mustChangePassword]);

  const handlePasswordChanged = async () => {
    setShowPasswordModal(false);
    // Aggiorna la sessione per riflettere mustChangePassword: false
    await update();
  };

  return (
    <>
      {children}
      <ForcePasswordChangeModal
        isOpen={showPasswordModal}
        onSuccess={handlePasswordChanged}
      />
    </>
  );
}
```

### 6.7 Pagina Profilo Personale

```tsx
// app/profilo/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

export default function ProfiloPage() {
  const { data: session, update } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    address: ''
  });

  // Carica dati profilo
  useEffect(() => {
    async function loadProfile() {
      const response = await fetch('/api/users/me');
      const data = await response.json();
      if (response.ok) {
        setFormData({
          phone: data.user.phone || '',
          email: data.user.email || '',
          address: data.user.address || ''
        });
      }
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Profilo aggiornato');
        setIsEditing(false);
        await update(); // Refresh sessione
      } else {
        const data = await response.json();
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    } finally {
      setIsLoading(false);
    }
  }

  const user = session?.user;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Il mio profilo</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{user?.firstName} {user?.lastName}</span>
            <Badge>{user?.role}</Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Dati NON modificabili */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-500 text-sm">Nome</Label>
              <p className="font-medium">{user?.firstName}</p>
            </div>
            <div>
              <Label className="text-gray-500 text-sm">Cognome</Label>
              <p className="font-medium">{user?.lastName}</p>
            </div>
            <div>
              <Label className="text-gray-500 text-sm">Username</Label>
              <p className="font-mono">{user?.username}</p>
            </div>
            <div>
              <Label className="text-gray-500 text-sm">Sede</Label>
              <p>{user?.venue?.name}</p>
            </div>
          </div>

          <Separator />

          {/* Dati modificabili */}
          <div className="space-y-4">
            <h3 className="font-medium">Informazioni di contatto</h3>

            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+39 333 1234567"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="mario@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Indirizzo</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Via Roma 1, 33077 Sacile (PN)"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(false)}
                  >
                    Annulla
                  </Button>
                  <Button 
                    onClick={handleSave}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Salvataggio...' : 'Salva'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-gray-500 text-sm">Telefono</Label>
                    <p>{formData.phone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500 text-sm">Email</Label>
                    <p>{formData.email || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500 text-sm">Indirizzo</Label>
                    <p>{formData.address || '-'}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsEditing(true)}
                  >
                    Modifica dati
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      // Apri modale cambio password
                    }}
                  >
                    Cambia password
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 7. Middleware Protezione Route

```typescript
// middleware.ts

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Route /impostazioni/utenti richiede ADMIN o MANAGER
    if (path.startsWith('/impostazioni/utenti')) {
      if (token?.role !== 'ADMIN' && token?.role !== 'MANAGER') {
        return NextResponse.redirect(new URL('/profilo', req.url));
      }
    }

    // Staff non può accedere a certe route di impostazioni
    if (path.startsWith('/impostazioni') && token?.role === 'STAFF') {
      return NextResponse.redirect(new URL('/profilo', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    }
  }
);

export const config = {
  matcher: [
    '/impostazioni/:path*',
    '/profilo/:path*',
    '/dashboard/:path*',
    '/chiusura-cassa/:path*',
    // Aggiungi altre route protette
  ]
};
```

---

## 8. Checklist Implementazione

### 8.1 Database

- [ ] Aggiornare schema Prisma con nuovi campi User
- [ ] Creare migration: `npx prisma migrate dev --name add_user_auth_fields`
- [ ] Aggiornare seed con admin iniziale
- [ ] Verificare relazioni esistenti (DailyAttendance, DailyClosure, etc.)

### 8.2 Utility Functions

- [ ] Creare `lib/utils/username.ts`
- [ ] Creare `lib/utils/permissions.ts`
- [ ] Scrivere test per `generateUniqueUsername`

### 8.3 API Endpoints

- [ ] `GET /api/users` - Lista utenti
- [ ] `POST /api/users` - Crea utente
- [ ] `GET /api/users/[id]` - Dettaglio
- [ ] `PATCH /api/users/[id]` - Modifica
- [ ] `DELETE /api/users/[id]` - Disattiva
- [ ] `POST /api/users/[id]/reset-password` - Reset password
- [ ] `GET /api/users/me` - Profilo corrente
- [ ] `PATCH /api/users/me` - Modifica profilo
- [ ] `POST /api/auth/change-password` - Cambio password

### 8.4 Componenti UI

- [ ] `app/impostazioni/utenti/page.tsx` - Lista
- [ ] `app/impostazioni/utenti/nuovo/page.tsx` - Creazione
- [ ] `app/impostazioni/utenti/[id]/page.tsx` - Dettaglio/Modifica
- [ ] `app/profilo/page.tsx` - Profilo personale
- [ ] `components/users/UserTable.tsx`
- [ ] `components/users/UserFilters.tsx`
- [ ] `components/users/CredentialsDialog.tsx`
- [ ] `components/auth/ForcePasswordChangeModal.tsx`

### 8.5 Integrazioni

- [ ] Aggiornare layout sidebar con link a "Utenti"
- [ ] Integrare `ForcePasswordChangeModal` in AuthProvider
- [ ] Configurare middleware protezione route
- [ ] Aggiornare NextAuth callbacks per includere `mustChangePassword`

### 8.6 Test

- [ ] Test creazione utente Staff (username auto-generato)
- [ ] Test creazione utente Admin/Manager (email required)
- [ ] Test duplicazione username (deve aggiungere numero)
- [ ] Test permessi (Manager non può creare Admin)
- [ ] Test cambio password obbligatorio al primo login
- [ ] Test disattivazione/riattivazione utente

---

## 9. Note Importanti

### 9.1 Sicurezza

- Le password sono sempre hashate con bcrypt (cost factor 12)
- La password iniziale `1234567890` è uguale per tutti ma DEVE essere cambiata
- Non loggare mai password in chiaro
- Usare HTTPS in produzione

### 9.2 UX

- Il modale cambio password è BLOCCANTE (non può essere chiuso senza completare)
- Mostrare sempre anteprima username prima della creazione
- Dopo la creazione, mostrare le credenziali in modo chiaro e copiabile
- Gli utenti disattivati appaiono grigi ma non sono eliminati

### 9.3 Compatibilità

- Questo modulo si integra con il sistema esistente
- NON modificare le altre pagine di impostazioni
- Usare gli stessi componenti UI (shadcn/ui) già nel progetto
- Mantenere lo stesso stile di gestione errori e toast

---

*Fine Specifica Tecnica - Modulo Gestione Utenti v1.0*

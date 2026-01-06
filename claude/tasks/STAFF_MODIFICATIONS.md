# Modifiche Sezione STAFF - Riepilogo Implementazione

**Stato**: COMPLETATO
**Data**: 2026-01-06
**Build**: OK

## Modifiche Implementate

### 1. Schema Database (Prisma)

**File**: `prisma/schema.prisma`

**Nuovo enum ContractType**:
```prisma
enum ContractType {
  TEMPO_DETERMINATO        // Data ass. + cess. obbligatorie
  TEMPO_INDETERMINATO      // Solo data ass. obbligatoria
  LAVORO_INTERMITTENTE     // Data ass. + cess. obbligatorie
  LAVORATORE_OCCASIONALE   // Date nascoste
  LIBERO_PROFESSIONISTA    // Date nascoste
}
```

**Nuovi campi User**:
- `phoneNumber` - Numero di telefono
- `workDaysPerWeek` - Giorni lavorativi settimanali (1-7)
- `vatNumber` - P.IVA per freelance/occasionali
- `fiscalCode` - Codice Fiscale per freelance/occasionali
- `availableDays` - Array giorni disponibilità EXTRA (0-6)
- `availableHolidays` - Disponibilità festivi per EXTRA

### 2. API Endpoints

**`/api/staff/[id]` (GET/PUT)**:
- Aggiunto supporto per tutti i nuovi campi
- Email ora modificabile
- VenueId e RoleId modificabili (solo admin)

**`/api/staff` (POST)**:
- Supporto creazione con nuovi campi contratto
- Nuovi tipi contratto supportati

**`/api/roles` (GET)** - NUOVO:
- Lista ruoli per dropdown selezione

### 3. Lista Staff (page.tsx)

**File**: `src/app/(dashboard)/staff/page.tsx`

- Rimossa icona Eye dalle azioni
- Icona Settings ora porta direttamente a `/staff/{id}`
- Aggiornati filtri contratto con nuovi tipi
- Aggiornato getContractBadge per nuovi tipi

### 4. Form Dipendente (EmployeeProfileForm.tsx)

**File**: `src/components/staff/EmployeeProfileForm.tsx`

#### Tab Info
- Email ora editabile
- Aggiunto campo Telefono
- Sede e Ruolo ora selezionabili tramite dropdown

#### Tab Contratto
- 5 nuovi tipi contratto allineati alla normativa italiana
- Date condizionali in base al tipo contratto:
  - T. Determinato: data ass. + cess. visibili
  - T. Indeterminato: solo data ass. visibile
  - Intermittente: data ass. + cess. visibili
  - Occasionale/Freelance: date nascoste
- Aggiunto campo "Giorni lavorativi / settimana" (1-7)
- Aggiunto campo "Ore settimanali" (mantenuto)
- Campi P.IVA e Codice Fiscale per occasionali/freelance

#### Tab Compensi (ex Tariffe)
- Rinominato da "Tariffe" a "Compensi"
- Switch EXTRA con logica invertita:
  - OFF (default) = Staff fisso
  - ON = EXTRA (lavoratore a chiamata)
- Griglia disponibilità per EXTRA:
  - LUN, MAR, MER, GIO, VEN, SAB, DOM
  - FESTIVI
- Compensi rinominati (Tariffa → Compenso)

### 5. Pagina Dettaglio Staff

**File**: `src/app/(dashboard)/staff/[id]/page.tsx`

- Rimosso bottone "Gestisci Vincoli" (vincoli già visibili in pagina)
- Aggiunto caricamento venues e roles per dropdown
- Props venues/roles passate al form

### 6. Fix Aggiuntivi

**File**: `src/lib/shift-generation/types.ts`
- Aggiornato tipo ContractType con nuovi valori

**File**: `src/app/api/schedules/daily/route.ts`
- Aggiornata logica tariffa per usare `isFixedStaff`
- Aggiunto `isFixedStaff` nella query select

## File Modificati

| File | Tipo |
|------|------|
| prisma/schema.prisma | Schema DB |
| src/app/api/staff/[id]/route.ts | API |
| src/app/api/staff/route.ts | API |
| src/app/api/roles/route.ts | API (nuovo) |
| src/app/(dashboard)/staff/page.tsx | UI |
| src/app/(dashboard)/staff/[id]/page.tsx | UI |
| src/components/staff/EmployeeProfileForm.tsx | UI |
| src/lib/shift-generation/types.ts | Types |
| src/app/api/schedules/daily/route.ts | API |

## Note Tecniche

- Migrazione enum: vecchi valori (FISSO, EXTRA, INTERMITTENTE) rimossi
- Database sincronizzato con `prisma db push --accept-data-loss`
- Build TypeScript: OK
- Nessun breaking change per l'utente finale

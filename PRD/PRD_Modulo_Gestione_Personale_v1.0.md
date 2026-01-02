# PRD - Modulo Gestione Personale
## Sistema Gestionale Weiss Cafè

**Versione:** 1.0  
**Data:** 2 Gennaio 2026  
**Stato:** Specifiche tecniche dettagliate per Fase 4  
**Riferimento:** PRD v1.1 - Sezione Fase 4

---

## 1. Executive Summary

### 1.1 Panoramica
Questo documento dettaglia le specifiche tecniche per il **Modulo Gestione Personale** del Sistema Gestionale Weiss Cafè. Il modulo comprende quattro sotto-moduli interconnessi:

1. **Anagrafica Dipendenti Avanzata** - Profili con vincoli e preferenze
2. **Generazione Turni AI** - Algoritmo di scheduling automatico
3. **Portale Dipendente** - Accesso self-service per staff
4. **Rilevazione Presenze** - Timbrature digitali geolocalizzate

### 1.2 Benchmark Competitor
| Funzionalità | JetHR | Sesame HR | Weiss (Target) |
|--------------|-------|-----------|----------------|
| Timbratura app/web | ✓ | ✓ | ✓ |
| Geolocalizzazione | ✓ | ✓ | ✓ |
| QR Code sede | ✓ | ✗ | ✓ |
| AI scheduling | ✗ | ✓ | ✓ |
| Vincoli per dipendente | Parziale | Parziale | **Avanzato** |
| Vincoli relazionali | ✗ | ✗ | **✓** |
| Portale dipendente | ✓ | ✓ | ✓ |
| Export PDF turni | ✓ | ✓ | ✓ |
| Integrazione cassa | ✗ | ✗ | **✓** |

### 1.3 Differenziazione Weiss
- **Vincoli relazionali**: "Silvia e Andrea devono avere almeno 1 giorno libero insieme"
- **Integrazione nativa**: Turni collegati direttamente a chiusura cassa e labor cost
- **Bar-specific**: Template turni ottimizzati per fasce mattina/aperitivo/sera
- **Costo in tempo reale**: Visualizzazione costo turno mentre si pianifica

---

## 2. Modello Dati

### 2.1 Estensione Anagrafica Dipendenti

```sql
-- Estensione tabella users esistente
ALTER TABLE users ADD COLUMN IF NOT EXISTS (
    -- Dati contrattuali
    contract_type VARCHAR(50),              -- "fisso", "extra", "intermittente"
    contract_hours_week DECIMAL(4,1),       -- Ore settimanali contratto (es. 40, 24)
    hire_date DATE,
    termination_date DATE,
    
    -- Costi
    hourly_rate_base DECIMAL(10,2),         -- Tariffa oraria base
    hourly_rate_extra DECIMAL(10,2),        -- Tariffa straordinario
    hourly_rate_holiday DECIMAL(10,2),      -- Tariffa festivo
    hourly_rate_night DECIMAL(10,2),        -- Tariffa notturno (dopo 22:00)
    
    -- Accesso portale
    portal_enabled BOOLEAN DEFAULT false,
    portal_pin VARCHAR(6),                  -- PIN per timbratura rapida
    app_token VARCHAR(255),                 -- Token per app mobile
    
    -- Preferenze notifiche
    notify_email BOOLEAN DEFAULT true,
    notify_push BOOLEAN DEFAULT true,
    notify_whatsapp BOOLEAN DEFAULT false,
    whatsapp_number VARCHAR(20)
);
```

### 2.2 Vincoli Dipendente (employee_constraints)

```sql
CREATE TABLE employee_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES venues(id),    -- NULL = tutte le sedi
    
    constraint_type VARCHAR(50) NOT NULL,
    -- Tipi: "availability", "max_hours", "min_rest", "preferred_shift", 
    --       "blocked_day", "skill_required", "consecutive_days"
    
    -- Configurazione vincolo (JSON flessibile)
    config JSONB NOT NULL,
    
    -- Validità temporale
    valid_from DATE,
    valid_to DATE,                          -- NULL = sempre valido
    
    -- Priorità (per conflitti)
    priority INTEGER DEFAULT 5,             -- 1=bassa, 10=critica
    is_hard_constraint BOOLEAN DEFAULT true, -- false = preferenza, true = obbligatorio
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

-- Indici
CREATE INDEX idx_employee_constraints_user ON employee_constraints(user_id);
CREATE INDEX idx_employee_constraints_type ON employee_constraints(constraint_type);
CREATE INDEX idx_employee_constraints_dates ON employee_constraints(valid_from, valid_to);
```

**Esempi di configurazione vincoli:**

```json
// Tipo: "availability" - Vanessa lavora solo mattina
{
    "constraint_type": "availability",
    "config": {
        "allowed_shifts": ["morning"],
        "allowed_days": ["mon", "tue", "wed", "thu", "fri", "sat"],
        "blocked_days": ["sun"]
    }
}

// Tipo: "availability" - Andrea può lavorare mattina e sera
{
    "constraint_type": "availability",
    "config": {
        "allowed_shifts": ["morning", "evening"],
        "allowed_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    }
}

// Tipo: "max_hours" - Massimo 40 ore settimanali
{
    "constraint_type": "max_hours",
    "config": {
        "max_hours_week": 40,
        "max_hours_day": 10,
        "max_consecutive_days": 6
    }
}

// Tipo: "min_rest" - Riposo minimo tra turni
{
    "constraint_type": "min_rest",
    "config": {
        "min_hours_between_shifts": 11,
        "min_rest_day_per_week": 1
    }
}

// Tipo: "preferred_shift" - Preferenza (soft constraint)
{
    "constraint_type": "preferred_shift",
    "config": {
        "preferred_shifts": ["aperitivo"],
        "preferred_days": ["fri", "sat"]
    },
    "is_hard_constraint": false
}

// Tipo: "blocked_day" - Giorno fisso bloccato
{
    "constraint_type": "blocked_day",
    "config": {
        "blocked_weekday": "wed",
        "reason": "Corso universitario"
    }
}

// Tipo: "skill_required" - Competenze richieste
{
    "constraint_type": "skill_required",
    "config": {
        "skills": ["barista", "cocktail"],
        "can_work_alone": true,
        "can_handle_cash": true
    }
}
```

### 2.3 Vincoli Relazionali (relationship_constraints)

```sql
CREATE TABLE relationship_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id),
    
    constraint_type VARCHAR(50) NOT NULL,
    -- Tipi: "same_day_off", "never_together", "always_together", 
    --       "min_overlap", "max_together"
    
    -- Dipendenti coinvolti
    user_ids UUID[] NOT NULL,               -- Array di user_id
    
    -- Configurazione
    config JSONB NOT NULL,
    
    -- Validità
    valid_from DATE,
    valid_to DATE,
    
    priority INTEGER DEFAULT 5,
    is_hard_constraint BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX idx_relationship_constraints_users ON relationship_constraints USING GIN(user_ids);
```

**Esempi di vincoli relazionali:**

```json
// Silvia e Andrea devono avere almeno 1 giorno libero insieme a settimana
{
    "constraint_type": "same_day_off",
    "user_ids": ["uuid-silvia", "uuid-andrea"],
    "config": {
        "min_common_days_off_per_week": 1,
        "preferred_day": "sun"  // opzionale
    }
}

// Marco e Luca non devono mai lavorare insieme (conflitto)
{
    "constraint_type": "never_together",
    "user_ids": ["uuid-marco", "uuid-luca"],
    "config": {
        "same_shift": true,
        "same_day": false       // possono lavorare stesso giorno, turni diversi
    }
}

// Sempre almeno 1 senior in turno
{
    "constraint_type": "always_together",
    "user_ids": ["uuid-senior1", "uuid-senior2", "uuid-senior3"],
    "config": {
        "min_present": 1,
        "applies_to_shifts": ["evening"]
    }
}
```

### 2.4 Definizione Turni (shift_definitions)

```sql
CREATE TABLE shift_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id),
    
    name VARCHAR(100) NOT NULL,             -- "Mattina", "Aperitivo", "Sera"
    code VARCHAR(20) NOT NULL,              -- "M", "A", "S"
    color VARCHAR(7),                       -- Colore HEX per UI (#FF5733)
    
    -- Orari
    start_time TIME NOT NULL,               -- 06:00
    end_time TIME NOT NULL,                 -- 16:00
    break_minutes INTEGER DEFAULT 0,        -- Pausa inclusa
    
    -- Calcolo ore
    total_hours DECIMAL(4,2) GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 - (break_minutes / 60.0)
    ) STORED,
    
    -- Requisiti
    min_staff INTEGER DEFAULT 1,
    max_staff INTEGER,
    required_skills TEXT[],                 -- ["barista", "cassa"]
    
    -- Costi
    rate_multiplier DECIMAL(3,2) DEFAULT 1.0,  -- Moltiplicatore tariffa
    
    is_active BOOLEAN DEFAULT true,
    position INTEGER,                       -- Ordine visualizzazione
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dati iniziali per Weiss Cafè
INSERT INTO shift_definitions (venue_id, name, code, color, start_time, end_time, break_minutes, min_staff) VALUES
('weiss-uuid', 'Mattina', 'M', '#FCD34D', '06:00', '16:00', 30, 2),
('weiss-uuid', 'Aperitivo', 'A', '#F97316', '16:00', '21:00', 0, 2),
('weiss-uuid', 'Sera', 'S', '#8B5CF6', '21:00', '02:00', 0, 3),
('weiss-uuid', 'Giornata intera', 'G', '#10B981', '10:00', '22:00', 60, 1),
('weiss-uuid', 'Evento', 'E', '#EF4444', '18:00', '03:00', 0, 5);
```

### 2.5 Pianificazione Turni (shift_schedules)

```sql
CREATE TABLE shift_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id),
    
    -- Periodo pianificazione
    name VARCHAR(100),                      -- "Settimana 1-7 Gen 2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Stato
    status VARCHAR(20) DEFAULT 'draft',     
    -- "draft", "generated", "review", "published", "archived"
    
    -- Generazione AI
    generation_params JSONB,                -- Parametri usati per generazione
    generation_log JSONB,                   -- Log con warning/conflitti risolti
    generation_score DECIMAL(5,2),          -- Score qualità (0-100)
    
    -- Workflow
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    published_by UUID REFERENCES users(id),
    published_at TIMESTAMP,
    
    notes TEXT,
    
    UNIQUE(venue_id, start_date, end_date)
);
```

### 2.6 Assegnazioni Turno (shift_assignments)

```sql
CREATE TABLE shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES shift_schedules(id) ON DELETE CASCADE,
    
    user_id UUID NOT NULL REFERENCES users(id),
    shift_definition_id UUID REFERENCES shift_definitions(id),
    
    -- Data e orari (override possibile)
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER DEFAULT 0,
    
    -- Sede (per multi-sede)
    venue_id UUID NOT NULL REFERENCES venues(id),
    work_station VARCHAR(50),               -- "BAR", "CASSA", "SALA"
    
    -- Stato assegnazione
    status VARCHAR(20) DEFAULT 'scheduled',
    -- "scheduled", "confirmed", "swapped", "absent", "worked"
    
    -- Per scambi turno
    swap_requested_by UUID REFERENCES users(id),
    swap_with_user_id UUID REFERENCES users(id),
    swap_status VARCHAR(20),                -- "pending", "approved", "rejected"
    
    -- Calcolo costi
    hours_scheduled DECIMAL(4,2),
    hourly_rate_applied DECIMAL(10,2),
    cost_estimated DECIMAL(10,2),
    
    -- Effettivo (da timbrature)
    actual_start TIME,
    actual_end TIME,
    hours_worked DECIMAL(4,2),
    cost_actual DECIMAL(10,2),
    
    -- Note
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(schedule_id, user_id, date, start_time)
);

CREATE INDEX idx_shift_assignments_date ON shift_assignments(date);
CREATE INDEX idx_shift_assignments_user ON shift_assignments(user_id);
CREATE INDEX idx_shift_assignments_status ON shift_assignments(status);
```

### 2.7 Ferie e Permessi (leave_requests)

```sql
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,       -- "FE", "ROL", "MA", "PAR"
    name VARCHAR(100) NOT NULL,             -- "Ferie", "Rol/Ex Festività", "Malattia"
    
    color VARCHAR(7),
    icon VARCHAR(50),
    
    requires_approval BOOLEAN DEFAULT true,
    requires_document BOOLEAN DEFAULT false, -- Es. certificato malattia
    max_days_advance INTEGER,               -- Richiesta max X giorni prima
    min_days_advance INTEGER,               -- Richiesta min X giorni prima
    
    affects_accrual BOOLEAN DEFAULT true,   -- Scala dal monte ore
    paid BOOLEAN DEFAULT true,
    
    is_active BOOLEAN DEFAULT true
);

-- Tipi standard
INSERT INTO leave_types (code, name, color, requires_approval, requires_document) VALUES
('FE', 'Ferie', '#10B981', true, false),
('ROL', 'Permesso ROL', '#3B82F6', true, false),
('MA', 'Malattia', '#EF4444', false, true),
('PAR', 'Permesso non retribuito', '#6B7280', true, false),
('MAT', 'Maternità/Paternità', '#EC4899', true, true),
('LUT', 'Lutto', '#1F2937', false, true),
('STU', 'Permesso studio', '#8B5CF6', true, false);

CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    leave_type_id UUID NOT NULL REFERENCES leave_types(id),
    
    -- Periodo
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Per permessi orari
    is_partial_day BOOLEAN DEFAULT false,
    start_time TIME,
    end_time TIME,
    
    -- Calcolo
    days_requested DECIMAL(4,2),            -- Giorni (0.5 per mezza giornata)
    hours_requested DECIMAL(5,2),           -- Ore totali
    
    -- Workflow approvazione
    status VARCHAR(20) DEFAULT 'pending',
    -- "pending", "approved", "rejected", "cancelled"
    
    requested_at TIMESTAMP DEFAULT NOW(),
    
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    
    -- Documenti allegati
    document_url TEXT,
    document_uploaded_at TIMESTAMP,
    
    -- Note
    notes TEXT,
    manager_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
```

### 2.8 Saldi Ferie/Permessi (leave_balances)

```sql
CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    leave_type_id UUID NOT NULL REFERENCES leave_types(id),
    year INTEGER NOT NULL,
    
    -- Saldi
    accrued DECIMAL(6,2) DEFAULT 0,         -- Maturato
    used DECIMAL(6,2) DEFAULT 0,            -- Usato
    pending DECIMAL(6,2) DEFAULT 0,         -- In attesa approvazione
    available DECIMAL(6,2) GENERATED ALWAYS AS (accrued - used - pending) STORED,
    
    -- Riporto anno precedente
    carried_over DECIMAL(6,2) DEFAULT 0,
    
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, leave_type_id, year)
);
```

### 2.9 Timbrature (attendance_records)

```sql
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    venue_id UUID NOT NULL REFERENCES venues(id),
    date DATE NOT NULL,
    
    -- Timbratura
    punch_type VARCHAR(10) NOT NULL,        -- "in", "out", "break_start", "break_end"
    punch_time TIMESTAMP NOT NULL,
    
    -- Metodo timbratura
    punch_method VARCHAR(20) NOT NULL,
    -- "app", "web", "qr_code", "manual", "whatsapp"
    
    -- Geolocalizzazione
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    location_accuracy INTEGER,              -- Metri
    location_verified BOOLEAN,              -- Entro raggio sede
    
    -- Device info
    device_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Collegamento a turno programmato
    shift_assignment_id UUID REFERENCES shift_assignments(id),
    
    -- Anomalie
    is_anomaly BOOLEAN DEFAULT false,
    anomaly_type VARCHAR(50),
    -- "early", "late", "outside_location", "missing_out", "overtime"
    anomaly_resolved BOOLEAN DEFAULT false,
    anomaly_resolved_by UUID REFERENCES users(id),
    anomaly_notes TEXT,
    
    -- Foto (opzionale, per verifica)
    photo_url TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, date);
CREATE INDEX idx_attendance_anomaly ON attendance_records(is_anomaly) WHERE is_anomaly = true;
```

### 2.10 Policy Timbratura (attendance_policies)

```sql
CREATE TABLE attendance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id),
    name VARCHAR(100) NOT NULL,
    
    -- Metodi consentiti
    allowed_methods TEXT[] DEFAULT ARRAY['app', 'web', 'qr_code'],
    
    -- Geolocalizzazione
    geolocation_required BOOLEAN DEFAULT false,
    geolocation_radius_meters INTEGER DEFAULT 100,
    venue_latitude DECIMAL(10, 8),
    venue_longitude DECIMAL(11, 8),
    
    -- Tolleranze
    early_clock_in_minutes INTEGER DEFAULT 15,  -- Può timbrare max X min prima
    late_clock_in_minutes INTEGER DEFAULT 10,   -- Grace period ritardo
    auto_clock_out_hours INTEGER DEFAULT 12,    -- Auto-uscita dopo X ore
    
    -- Promemoria
    reminder_before_shift_minutes INTEGER DEFAULT 30,
    reminder_missing_clock_out BOOLEAN DEFAULT true,
    
    -- QR Code
    qr_code_enabled BOOLEAN DEFAULT false,
    qr_code_refresh_seconds INTEGER DEFAULT 30,
    
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Algoritmo Generazione Turni AI

### 3.1 Overview

L'algoritmo di generazione turni utilizza una combinazione di:
1. **Constraint Satisfaction Problem (CSP)** per vincoli hard
2. **Ottimizzazione multi-obiettivo** per preferenze soft
3. **Euristica greedy** per soluzione iniziale
4. **Local search** per miglioramento iterativo

### 3.2 Input Algoritmo

```typescript
interface ScheduleGenerationInput {
    // Periodo
    startDate: Date;
    endDate: Date;
    venueId: string;
    
    // Staff disponibile
    employees: Employee[];
    
    // Vincoli
    employeeConstraints: EmployeeConstraint[];
    relationshipConstraints: RelationshipConstraint[];
    
    // Definizioni turni
    shiftDefinitions: ShiftDefinition[];
    
    // Requisiti giornalieri
    dailyRequirements: DailyRequirement[];
    
    // Parametri ottimizzazione
    optimizationParams: {
        maxIterations: number;
        priorityWeights: {
            costMinimization: number;      // 0-1
            fairDistribution: number;      // 0-1
            preferenceMatching: number;    // 0-1
            skillCoverage: number;         // 0-1
        };
    };
    
    // Turni esistenti da rispettare (es. già confermati)
    lockedAssignments: ShiftAssignment[];
    
    // Ferie/assenze approvate
    approvedLeaves: LeaveRequest[];
}
```

### 3.3 Requisiti Giornalieri

```typescript
interface DailyRequirement {
    date: Date;
    dayType: 'normal' | 'weekend' | 'holiday' | 'event';
    eventName?: string;
    
    shifts: {
        shiftDefinitionId: string;
        minStaff: number;
        maxStaff: number;
        preferredStaff: number;
        requiredSkills: string[];
        
        // Override orari per eventi
        customStartTime?: Time;
        customEndTime?: Time;
    }[];
    
    // Budget giornaliero (opzionale)
    maxLaborCost?: number;
}
```

### 3.4 Fasi Algoritmo

```
┌─────────────────────────────────────────────────────────────────┐
│                    FASE 1: PREPROCESSING                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. Carica vincoli dipendenti e relazionali                      │
│ 2. Calcola disponibilità effettiva (escl. ferie/malattie)       │
│ 3. Identifica giorni critici (eventi, sotto-organico)           │
│ 4. Calcola ore residue per rispetto contratto                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 FASE 2: SOLUZIONE INIZIALE                      │
├─────────────────────────────────────────────────────────────────┤
│ Algoritmo Greedy:                                               │
│ 1. Per ogni giorno, ordina turni per priorità (sera > mattina)  │
│ 2. Per ogni turno, seleziona dipendenti:                        │
│    a. Filtra per disponibilità (hard constraint)                │
│    b. Ordina per: ore residue, costo, preferenze                │
│    c. Assegna rispettando min/max staff                         │
│ 3. Verifica vincoli relazionali, backtrack se violati           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FASE 3: OTTIMIZZAZIONE                         │
├─────────────────────────────────────────────────────────────────┤
│ Local Search con Simulated Annealing:                           │
│ 1. Calcola score soluzione corrente                             │
│ 2. Genera soluzione vicina (swap turni tra dipendenti)          │
│ 3. Se migliora score → accetta                                  │
│ 4. Se peggiora → accetta con probabilità decrescente            │
│ 5. Ripeti fino a convergenza o max iterazioni                   │
│                                                                 │
│ Funzione Score:                                                 │
│ S = w1*CostScore + w2*FairnessScore + w3*PrefScore + w4*SkillScore│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FASE 4: VALIDAZIONE                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Verifica tutti i vincoli hard soddisfatti                    │
│ 2. Genera lista warning per vincoli soft non rispettati         │
│ 3. Calcola metriche qualità:                                    │
│    - % copertura turni                                          │
│    - Distribuzione ore tra dipendenti (deviazione std)          │
│    - % preferenze rispettate                                    │
│    - Costo totale vs budget                                     │
│ 4. Genera log dettagliato decisioni                             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Output Algoritmo

```typescript
interface ScheduleGenerationOutput {
    success: boolean;
    
    // Risultato
    schedule: ShiftSchedule;
    assignments: ShiftAssignment[];
    
    // Metriche qualità
    metrics: {
        coveragePercent: number;           // % turni coperti
        fairnessScore: number;             // 0-100, distribuzione ore
        preferenceScore: number;           // 0-100, preferenze rispettate
        totalCost: number;                 // Costo totale periodo
        avgHoursPerEmployee: number;
        hoursStdDeviation: number;         // Deviazione standard ore
    };
    
    // Warning e problemi
    warnings: {
        type: string;
        severity: 'low' | 'medium' | 'high';
        message: string;
        affectedDate?: Date;
        affectedEmployees?: string[];
    }[];
    
    // Turni non coperti
    uncoveredShifts: {
        date: Date;
        shiftDefinitionId: string;
        missingStaff: number;
    }[];
    
    // Log decisioni per trasparenza
    decisionLog: {
        timestamp: Date;
        decision: string;
        reason: string;
    }[];
}
```

### 3.6 Esempio Configurazione Vincoli Weiss Cafè

```json
{
    "employees": [
        {
            "id": "vanessa-basso",
            "name": "Vanessa Basso",
            "type": "fisso",
            "contractHours": 40,
            "constraints": [
                {
                    "type": "availability",
                    "config": {
                        "allowed_shifts": ["morning"],
                        "reason": "Solo turno mattina"
                    },
                    "priority": 10,
                    "isHard": true
                }
            ]
        },
        {
            "id": "andrea-nadin",
            "name": "Andrea Nadin",
            "type": "extra",
            "hourlyRate": 10.00,
            "constraints": [
                {
                    "type": "availability",
                    "config": {
                        "allowed_shifts": ["morning", "evening"],
                        "blocked_days": ["mon", "wed"]
                    }
                },
                {
                    "type": "max_hours",
                    "config": {
                        "max_hours_week": 24
                    }
                }
            ]
        },
        {
            "id": "silvia-carniello",
            "name": "Silvia Carniello",
            "type": "fisso"
        },
        {
            "id": "andrea-segatto",
            "name": "Andrea Segatto",
            "type": "fisso"
        }
    ],
    
    "relationshipConstraints": [
        {
            "type": "same_day_off",
            "userIds": ["silvia-carniello", "andrea-segatto"],
            "config": {
                "min_common_days_off_per_week": 1,
                "reason": "Coppia - richiedono giorno libero comune"
            },
            "priority": 8,
            "isHard": true
        }
    ],
    
    "dailyRequirements": {
        "default_weekday": {
            "shifts": [
                {"shift": "morning", "min": 2, "max": 3},
                {"shift": "aperitivo", "min": 2, "max": 3},
                {"shift": "evening", "min": 2, "max": 4}
            ]
        },
        "default_weekend": {
            "shifts": [
                {"shift": "morning", "min": 2, "max": 3},
                {"shift": "aperitivo", "min": 3, "max": 4},
                {"shift": "evening", "min": 3, "max": 5}
            ]
        }
    }
}
```

---

## 4. Requisiti Funzionali

### 4.1 Modulo: Anagrafica Dipendenti Avanzata

#### RF-EMP-001: Profilo dipendente esteso
Il sistema deve permettere di configurare per ogni dipendente:
- Dati anagrafici e contrattuali
- Tipologia contratto (fisso/extra/intermittente)
- Ore settimanali da contratto
- Tariffe orarie (base, straordinario, festivo, notturno)
- Competenze/skills
- Abilitazione portale dipendente

#### RF-EMP-002: Gestione vincoli individuali
Il sistema deve permettere di definire vincoli per dipendente:

| Tipo Vincolo | Esempio | Hard/Soft |
|--------------|---------|-----------|
| Disponibilità turno | "Solo mattina" | Hard |
| Giorni bloccati | "Mai il mercoledì" | Hard |
| Max ore settimanali | "Max 40 ore" | Hard |
| Max giorni consecutivi | "Max 6 giorni" | Hard |
| Riposo minimo | "11 ore tra turni" | Hard |
| Turno preferito | "Preferisce sera" | Soft |
| Giorno preferito libero | "Preferisce domenica" | Soft |

#### RF-EMP-003: Gestione vincoli relazionali
Il sistema deve permettere di definire vincoli tra dipendenti:

| Tipo Vincolo | Esempio |
|--------------|---------|
| Giorno libero comune | "Silvia e Andrea: 1+ giorno libero insieme/settimana" |
| Mai insieme | "Marco e Luca: mai stesso turno" |
| Sempre insieme | "Junior sempre con Senior" |
| Overlap minimo | "Cambio turno: 30 min overlap" |

#### RF-EMP-004: Validità temporale vincoli
I vincoli devono avere date di validità opzionali (es. "Solo durante estate", "Fino a fine corso universitario").

---

### 4.2 Modulo: Generazione Turni AI

#### RF-SHIFT-001: Definizione turni tipo
Il sistema deve permettere di configurare turni predefiniti:
- Nome, codice, colore
- Orario inizio/fine
- Pausa inclusa
- Staff minimo/massimo
- Skills richieste
- Moltiplicatore tariffa

**Turni predefiniti Weiss Cafè:**
| Codice | Nome | Orario | Pausa | Min Staff |
|--------|------|--------|-------|-----------|
| M | Mattina | 06:00-16:00 | 30min | 2 |
| A | Aperitivo | 16:00-21:00 | 0 | 2 |
| S | Sera | 21:00-02:00 | 0 | 3 |
| G | Giornata | 10:00-22:00 | 60min | 1 |
| E | Evento | Variabile | 0 | 5+ |

#### RF-SHIFT-002: Requisiti giornalieri
Il sistema deve permettere di definire requisiti per tipologia giorno:
- Giorno feriale standard
- Weekend
- Festivo
- Evento speciale (QMD, ecc.)

Per ogni tipo: turni richiesti, staff minimo/massimo, skills necessarie.

#### RF-SHIFT-003: Generazione automatica bozza
Il sistema deve generare automaticamente una bozza turni:
- Input: periodo (data inizio → data fine), sede
- Rispetto di tutti i vincoli hard
- Ottimizzazione vincoli soft
- Bilanciamento ore tra dipendenti
- Minimizzazione costo (preferenza extra più economici)

#### RF-SHIFT-004: Parametri generazione
L'utente deve poter configurare:
- Pesi ottimizzazione (costo vs equità vs preferenze)
- Budget massimo periodo
- Override requisiti per giorni specifici
- Turni già bloccati/confermati

#### RF-SHIFT-005: Output generazione
Il sistema deve fornire:
- Pianificazione completa periodo
- Score qualità (0-100)
- Lista warning (vincoli soft non rispettati)
- Lista turni non coperti
- Costo totale stimato
- Distribuzione ore per dipendente

#### RF-SHIFT-006: Modifica manuale post-generazione
Dopo la generazione, il manager deve poter:
- Modificare singole assegnazioni (drag & drop)
- Aggiungere/rimuovere turni
- Scambiare turni tra dipendenti
- Il sistema deve ri-validare e segnalare violazioni

#### RF-SHIFT-007: Copia pianificazione
Il sistema deve permettere di:
- Copiare settimana precedente
- Copiare stesso periodo anno precedente
- Salvare template settimanali riutilizzabili

#### RF-SHIFT-008: Pubblicazione turni
Workflow pubblicazione:
1. **Draft**: In elaborazione, non visibile a staff
2. **Review**: Completo, in revisione manager
3. **Published**: Pubblicato, visibile a staff (notifica automatica)
4. **Archived**: Periodo concluso

---

### 4.3 Modulo: Portale Dipendente

#### RF-PORTAL-001: Accesso dipendente
Ogni dipendente con `portal_enabled = true` deve poter accedere tramite:
- Web app (responsive)
- PWA installabile su smartphone
- Credenziali: email + password oppure PIN rapido

#### RF-PORTAL-002: Dashboard dipendente
La home del portale deve mostrare:
- Prossimi turni (settimana corrente + successiva)
- Saldo ferie/permessi
- Richieste in sospeso
- Notifiche recenti
- Quick action: richiedi ferie, timbra

#### RF-PORTAL-003: Visualizzazione turni
Il dipendente deve poter:
- Vedere i propri turni in formato calendario
- Vedere turni dei colleghi (se abilitato)
- Filtrare per settimana/mese
- Vedere dettagli turno (orario, sede, note)

#### RF-PORTAL-004: Richiesta ferie/permessi
Il dipendente deve poter:
- Richiedere ferie/permessi
- Selezionare tipo (ferie, ROL, permesso non retribuito, ecc.)
- Selezionare periodo (date o ore)
- Aggiungere note/motivazione
- Allegare documenti (es. certificato malattia)
- Vedere stato richiesta (in attesa, approvata, rifiutata)
- Annullare richiesta in attesa

#### RF-PORTAL-005: Visualizzazione saldi
Il dipendente deve vedere:
- Ferie maturate, usate, residue
- ROL maturati, usati, residui
- Ore lavorate mese corrente
- Straordinari accumulati

#### RF-PORTAL-006: Richiesta scambio turno
Il dipendente deve poter:
- Richiedere scambio turno con collega
- Selezionare collega disponibile
- Il collega riceve notifica per accettare/rifiutare
- Se accettato → va ad approvazione manager
- Se approvato → turni scambiati automaticamente

#### RF-PORTAL-007: Timbratura da app
Se abilitato, il dipendente deve poter timbrare:
- Ingresso/uscita
- Inizio/fine pausa
- Con geolocalizzazione (se richiesta da policy)
- Con QR code (se in sede)

#### RF-PORTAL-008: Notifiche
Il dipendente deve ricevere notifiche per:
- Turni pubblicati
- Turni modificati
- Richiesta ferie approvata/rifiutata
- Richiesta scambio turno ricevuta
- Promemoria inizio turno
- Timbratura mancante

Canali: push notification, email, (opzionale) WhatsApp.

---

### 4.4 Modulo: Approvazione Ferie (Manager)

#### RF-LEAVE-001: Dashboard richieste
Il manager deve vedere:
- Richieste in attesa di approvazione
- Filtri: dipendente, tipo, periodo
- Ordinamento per data richiesta/urgenza

#### RF-LEAVE-002: Valutazione richiesta
Per ogni richiesta il manager deve vedere:
- Chi richiede, cosa, quando
- Saldo attuale dipendente
- Calendario team (chi è già in ferie quel giorno)
- Impatto su copertura turni
- Warning se sotto-organico

#### RF-LEAVE-003: Approvazione/Rifiuto
Il manager deve poter:
- Approvare con un click
- Rifiutare con motivazione obbligatoria
- Approvare parzialmente (es. solo alcuni giorni)

#### RF-LEAVE-004: Approvatori multipli
Il sistema deve supportare:
- Approvatore singolo (manager diretto)
- Approvazione gerarchica (manager → titolare)
- Approvatori per reparto/sede

---

### 4.5 Modulo: Rilevazione Presenze

#### RF-ATT-001: Metodi timbratura
Il sistema deve supportare:
- **App mobile**: PWA con bottone timbra
- **Web**: Portale dipendente
- **QR Code**: Scansione QR in sede da app
- **Manuale**: Inserimento retroattivo da manager

#### RF-ATT-002: Geolocalizzazione
Se abilitata nella policy:
- Rileva posizione GPS al momento della timbratura
- Confronta con coordinate sede
- Se fuori raggio → segnala anomalia (ma permette timbratura)
- Salva lat/long per audit

#### RF-ATT-003: QR Code sede
Per sedi che richiedono presenza fisica:
- Tablet in sede mostra QR Code rotante (ogni 30 sec)
- Dipendente scansiona da app
- QR contiene token temporale + sede
- Valida presenza in sede

#### RF-ATT-004: Calcolo ore automatico
Il sistema deve calcolare automaticamente:
- Ore lavorate (uscita - ingresso - pause)
- Straordinari (ore oltre orario schedulato)
- Ore notturne (dopo 22:00)
- Ore festive

#### RF-ATT-005: Gestione anomalie
Anomalie da rilevare:
- Timbratura in anticipo eccessivo
- Timbratura in ritardo
- Mancata timbratura uscita
- Posizione fuori sede
- Ore eccessive (possibile dimenticanza uscita)

Per ogni anomalia:
- Notifica al manager
- Dashboard anomalie da risolvere
- Risoluzione: correzione manuale + nota

#### RF-ATT-006: Integrazione turni
Il sistema deve:
- Collegare timbrature a turno schedulato
- Calcolare scostamento (ritardo/anticipo)
- Aggiornare `shift_assignments` con ore effettive
- Calcolare costo effettivo vs stimato

#### RF-ATT-007: Report presenze
Il sistema deve generare:
- Foglio presenze mensile per dipendente
- Riepilogo ore per categoria (ordinarie, straordinari, notturne)
- Export per consulente del lavoro (formato compatibile)
- Storico timbrature con filtri

---

### 4.6 Modulo: Export e Stampa

#### RF-EXP-001: Export PDF turni
Il sistema deve generare PDF:
- **Planning settimanale**: Griglia giorni × turni con nomi
- **Planning per dipendente**: Calendario personale
- **Stampa per bacheca**: Formato A3/A4 per affissione

#### RF-EXP-002: Export Excel
Export dati per elaborazioni esterne:
- Turni periodo (csv/xlsx)
- Presenze mensili (formato consulente lavoro)
- Riepilogo costi personale

#### RF-EXP-003: Integrazione chiusura cassa
I dati presenze devono integrarsi con chiusura cassa:
- Pre-compilazione sezione "Personale"
- Calcolo automatico compensi
- Confronto turno schedulato vs effettivo

---

## 5. Interfaccia Utente

### 5.1 Wireframe: Calendario Turni (Manager)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pianificazione Turni                          [Genera AI] [Pubblica]        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ◄ Dicembre 2025    [Settimana] [Mese]    Gennaio 2026 ►                    │
│                                                                             │
│ Sede: [Weiss Cafè ▼]     Staff: [Tutti ▼]     Stato: [Draft ▼]            │
├──────────┬────────┬────────┬────────┬────────┬────────┬────────┬──────────┤
│          │  Lun   │  Mar   │  Mer   │  Gio   │  Ven   │  Sab   │   Dom    │
│          │  06/01 │  07/01 │  08/01 │  09/01 │  10/01 │  11/01 │  12/01   │
├──────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤
│ MATTINA  │Vanessa │Vanessa │Vanessa │Vanessa │Vanessa │Serena  │ CHIUSO   │
│ 06-16    │Serena  │Serena  │ Andrea │Serena  │Serena  │Vanessa │          │
│          │        │        │        │        │        │        │          │
├──────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤
│ APERITIVO│ Brian  │ Brian  │ Brian  │ Silvia │ Silvia │ Silvia │ CHIUSO   │
│ 16-21    │Matteo M│ Andrea │Matteo M│ Andrea │ Brian  │ Brian  │          │
│          │        │        │        │        │Matteo D│Matteo D│          │
├──────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤
│ SERA     │ Silvia │ Silvia │Andrea S│ Brian  │Andrea S│Andrea S│ CHIUSO   │
│ 21-02    │Andrea S│Andrea S│ Silvia │Matteo M│ Silvia │ Silvia │          │
│          │Matteo D│Patrick │Patrick │Matteo D│Patrick │Patrick │          │
│          │        │        │        │        │Matteo D│Matteo D│          │
├──────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────────┤
│ ⚠️ Warning: Martedì 07 - solo 2 persone sera (richiesto min 3)             │
│ 💰 Costo settimana stimato: €2.340 | Budget: €2.500 ✓                      │
└─────────────────────────────────────────────────────────────────────────────┘

Legenda: 🟡 Mattina  🟠 Aperitivo  🟣 Sera  🔴 Ferie  ⬜ Riposo
```

### 5.2 Wireframe: Configurazione Vincoli Dipendente

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Vincoli Dipendente: Vanessa Basso                            [Salva] [✕]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ DISPONIBILITÀ TURNI                                                         │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ☑ Mattina (06:00-16:00)                                                │ │
│ │ ☐ Aperitivo (16:00-21:00)                                              │ │
│ │ ☐ Sera (21:00-02:00)                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ GIORNI DISPONIBILI                                                          │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ☑ Lun  ☑ Mar  ☑ Mer  ☑ Gio  ☑ Ven  ☑ Sab  ☐ Dom                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ VINCOLI ORE                                                                 │
│ ┌───────────────────┬─────────────────────────────────────────────────────┐ │
│ │ Max ore/settimana │ [40     ]                                          │ │
│ │ Max ore/giorno    │ [10     ]                                          │ │
│ │ Max gg consecutivi│ [6      ]                                          │ │
│ │ Riposo minimo     │ [11     ] ore tra turni                            │ │
│ └───────────────────┴─────────────────────────────────────────────────────┘ │
│                                                                             │
│ GIORNI BLOCCATI FISSI                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ + Aggiungi giorno bloccato                                             │ │
│ │                                                                        │ │
│ │ • Mercoledì pomeriggio - "Corso universitario" [Modifica] [Elimina]   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ PREFERENZE (soft constraint)                                                │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Turno preferito: [Mattina ▼]                                           │ │
│ │ Giorno libero preferito: [Domenica ▼]                                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ⚠️ I vincoli "hard" sono obbligatori, le preferenze sono best-effort        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Wireframe: Vincoli Relazionali

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Vincoli Relazionali                                    [+ Nuovo vincolo]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 👫 GIORNO LIBERO COMUNE                                    [Modifica]   │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ Dipendenti: Silvia Carniello, Andrea Segatto                           │ │
│ │ Regola: Almeno 1 giorno libero in comune a settimana                   │ │
│ │ Priorità: ████████░░ (8/10) - Hard constraint                          │ │
│ │ Note: Coppia convivente                                                │ │
│ │ Valido: Sempre                                                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 👥 SEMPRE ALMENO UNO PRESENTE                              [Modifica]   │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ Dipendenti: Vanessa Basso, Serena Rui, Brian Monferone                 │ │
│ │ Regola: Almeno 1 senior sempre presente nei turni sera                 │ │
│ │ Priorità: ██████████ (10/10) - Hard constraint                         │ │
│ │ Note: Necessario per gestione cassa                                    │ │
│ │ Valido: Sempre                                                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🚫 MAI INSIEME                                             [Modifica]   │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ Dipendenti: Marco Rossi, Luca Bianchi                                  │ │
│ │ Regola: Mai nello stesso turno                                         │ │
│ │ Priorità: █████████░ (9/10) - Hard constraint                          │ │
│ │ Note: Conflitto personale                                              │ │
│ │ Valido: Fino a 31/03/2026                                              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Wireframe: Portale Dipendente (Mobile)

```
┌─────────────────────────────┐
│ ≡  Weiss Cafè      👤 Silvia│
├─────────────────────────────┤
│                             │
│  Ciao Silvia! 👋            │
│                             │
│  PROSSIMO TURNO             │
│  ┌─────────────────────────┐│
│  │ 🟣 Oggi, 21:00 - 02:00  ││
│  │    Sera - Weiss Cafè    ││
│  │    Con: Andrea S, Patrick│
│  │                         ││
│  │ [Timbra ingresso]       ││
│  └─────────────────────────┘│
│                             │
│  QUESTA SETTIMANA           │
│  ┌─────────────────────────┐│
│  │ Lun 06  🟣 21:00-02:00  ││
│  │ Mar 07  🟣 21:00-02:00  ││
│  │ Mer 08  ⬜ Riposo        ││
│  │ Gio 09  🟣 21:00-02:00  ││
│  │ Ven 10  🟣 21:00-02:00  ││
│  │ Sab 11  🟣 21:00-02:00  ││
│  │ Dom 12  ⬜ Riposo        ││
│  └─────────────────────────┘│
│                             │
│  SALDO FERIE                │
│  ┌─────────────────────────┐│
│  │ 🏖️ Ferie: 12.5 giorni    ││
│  │ ⏰ ROL: 24 ore           ││
│  │                         ││
│  │ [Richiedi ferie]        ││
│  └─────────────────────────┘│
│                             │
├─────────────────────────────┤
│  🏠    📅    ➕    🔔    👤  │
│ Home Turni Richiedi Notif. Profilo│
└─────────────────────────────┘
```

### 5.5 Wireframe: Richiesta Ferie (Mobile)

```
┌─────────────────────────────┐
│ ←  Richiedi Assenza         │
├─────────────────────────────┤
│                             │
│  TIPO ASSENZA               │
│  ┌─────────────────────────┐│
│  │ [🏖️ Ferie            ▼] ││
│  └─────────────────────────┘│
│                             │
│  PERIODO                    │
│  ┌───────────┬─────────────┐│
│  │ Dal       │ Al          ││
│  │ 15/01/26  │ 17/01/26    ││
│  │     📅    │     📅      ││
│  └───────────┴─────────────┘│
│                             │
│  ☐ Mezza giornata          │
│                             │
│  RIEPILOGO                  │
│  ┌─────────────────────────┐│
│  │ Giorni richiesti: 3     ││
│  │ Saldo attuale: 12.5     ││
│  │ Saldo dopo: 9.5         ││
│  └─────────────────────────┘│
│                             │
│  ⚠️ Nota: in quei giorni    │
│     anche Brian è in ferie  │
│                             │
│  NOTE (opzionale)           │
│  ┌─────────────────────────┐│
│  │ Weekend lungo           ││
│  │                         ││
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │     [Invia richiesta]   ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

---

## 6. API Endpoints

### 6.1 Turni

```
GET    /api/v1/schedules                    # Lista pianificazioni
POST   /api/v1/schedules                    # Crea nuova pianificazione
GET    /api/v1/schedules/:id                # Dettaglio pianificazione
PUT    /api/v1/schedules/:id                # Modifica pianificazione
DELETE /api/v1/schedules/:id                # Elimina pianificazione
POST   /api/v1/schedules/:id/generate       # Genera turni AI
POST   /api/v1/schedules/:id/publish        # Pubblica turni

GET    /api/v1/schedules/:id/assignments    # Lista assegnazioni
POST   /api/v1/schedules/:id/assignments    # Aggiungi assegnazione
PUT    /api/v1/assignments/:id              # Modifica assegnazione
DELETE /api/v1/assignments/:id              # Elimina assegnazione

GET    /api/v1/shift-definitions            # Lista turni tipo
POST   /api/v1/shift-definitions            # Crea turno tipo
```

### 6.2 Vincoli

```
GET    /api/v1/employees/:id/constraints    # Vincoli dipendente
POST   /api/v1/employees/:id/constraints    # Aggiungi vincolo
PUT    /api/v1/constraints/:id              # Modifica vincolo
DELETE /api/v1/constraints/:id              # Elimina vincolo

GET    /api/v1/relationship-constraints     # Vincoli relazionali
POST   /api/v1/relationship-constraints     # Aggiungi vincolo relazionale
```

### 6.3 Ferie/Permessi

```
GET    /api/v1/leave-requests               # Lista richieste (filtri)
POST   /api/v1/leave-requests               # Nuova richiesta
GET    /api/v1/leave-requests/:id           # Dettaglio richiesta
PUT    /api/v1/leave-requests/:id           # Modifica richiesta
DELETE /api/v1/leave-requests/:id           # Annulla richiesta
POST   /api/v1/leave-requests/:id/approve   # Approva
POST   /api/v1/leave-requests/:id/reject    # Rifiuta

GET    /api/v1/employees/:id/leave-balance  # Saldo ferie dipendente
GET    /api/v1/leave-types                  # Tipi assenza disponibili
```

### 6.4 Presenze

```
POST   /api/v1/attendance/punch             # Timbratura
GET    /api/v1/attendance/today             # Presenze oggi
GET    /api/v1/attendance                   # Storico presenze (filtri)
GET    /api/v1/attendance/anomalies         # Anomalie da risolvere
PUT    /api/v1/attendance/:id/resolve       # Risolvi anomalia

GET    /api/v1/attendance/policies          # Policy timbratura
POST   /api/v1/attendance/qr-token          # Genera token QR
```

### 6.5 Export

```
GET    /api/v1/schedules/:id/export/pdf     # Export PDF turni
GET    /api/v1/attendance/export/payroll    # Export presenze per paghe
GET    /api/v1/schedules/:id/export/excel   # Export Excel turni
```

---

## 7. Notifiche

### 7.1 Trigger Notifiche

| Evento | Destinatario | Canali | Template |
|--------|--------------|--------|----------|
| Turni pubblicati | Staff coinvolto | Push, Email | "Nuovi turni pubblicati per {periodo}" |
| Turno modificato | Dipendente | Push, Email | "Il tuo turno di {data} è stato modificato" |
| Richiesta ferie ricevuta | Manager | Push, Email | "{nome} ha richiesto {tipo} dal {data}" |
| Ferie approvate | Dipendente | Push, Email | "La tua richiesta di {tipo} è stata approvata" |
| Ferie rifiutate | Dipendente | Push, Email | "La tua richiesta di {tipo} è stata rifiutata" |
| Richiesta scambio | Collega | Push | "{nome} vuole scambiare turno con te" |
| Promemoria turno | Dipendente | Push | "Il tuo turno inizia tra 30 minuti" |
| Timbratura mancante | Dipendente | Push | "Hai dimenticato di timbrare l'uscita?" |
| Anomalia rilevata | Manager | Push, Email | "Anomalia timbratura: {dettaglio}" |

### 7.2 Preferenze Notifiche

Ogni dipendente può configurare:
- Canali attivi (push, email, whatsapp)
- Promemoria turno (sì/no, quanti minuti prima)
- Digest giornaliero vs notifiche immediate

---

## 8. Metriche e KPI

### 8.1 KPI Generazione Turni

| Metrica | Target | Descrizione |
|---------|--------|-------------|
| Copertura turni | 100% | % turni con staff ≥ minimo |
| Distribuzione ore | σ < 2h | Deviazione std ore tra dipendenti |
| Preferenze rispettate | > 80% | % soft constraint soddisfatti |
| Costo vs budget | < 100% | Costo generato / budget |
| Tempo generazione | < 30s | Per pianificazione settimanale |

### 8.2 KPI Presenze

| Metrica | Target | Descrizione |
|---------|--------|-------------|
| Puntualità | > 95% | % timbrature entro tolleranza |
| Anomalie | < 5% | % timbrature con anomalie |
| Adozione portale | 100% | % staff che usa app |
| Tempo risoluzione anomalie | < 24h | Media tempo risoluzione |

---

## 9. Piano Implementazione

### Fase 4.1 - Fondamenta (4 settimane)
1. Schema database esteso
2. Anagrafica dipendenti avanzata
3. Definizione turni tipo
4. UI configurazione vincoli base

### Fase 4.2 - Generazione Turni (6 settimane)
1. Algoritmo generazione base
2. Gestione vincoli hard
3. Ottimizzazione vincoli soft
4. UI calendario turni manager
5. Workflow pubblicazione

### Fase 4.3 - Portale Dipendente (4 settimane)
1. Autenticazione dipendente
2. Visualizzazione turni
3. Richiesta ferie/permessi
4. Gestione saldi
5. Notifiche base

### Fase 4.4 - Presenze (4 settimane)
1. Timbratura app/web
2. Geolocalizzazione
3. QR Code
4. Gestione anomalie
5. Report presenze

### Fase 4.5 - Raffinamento (2 settimane)
1. Export PDF
2. Integrazione chiusura cassa
3. Testing completo
4. Ottimizzazione performance

---

## 10. Note per lo Sviluppatore

### 10.1 Priorità implementazione
1. **Schema DB**: Partire dal modello dati completo
2. **Vincoli individuali**: Core della generazione
3. **Algoritmo base**: Greedy prima, ottimizzazione dopo
4. **Portale semplice**: Visualizzazione prima, richieste dopo
5. **Presenze base**: App punch prima, QR dopo

### 10.2 Librerie suggerite
- **Scheduling**: OptaPlanner (Java), python-constraint, or-tools
- **Calendar UI**: FullCalendar, react-big-calendar
- **PDF**: pdfkit, puppeteer
- **Geolocation**: Browser Geolocation API
- **Push notifications**: Firebase Cloud Messaging

### 10.3 Test cases critici
1. Generazione con vincoli conflittuali
2. Vincolo relazionale "giorno libero comune"
3. Richiesta ferie in periodo sotto-organico
4. Timbratura fuori sede con geolocalizzazione
5. Scambio turno con approvazione
6. Calcolo automatico straordinari

---

*Fine documento - Modulo Gestione Personale v1.0*

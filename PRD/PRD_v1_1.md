# PRD - Sistema Gestionale Weiss Cafè

## Product Requirements Document
**Versione:** 1.1  
**Data:** 31 Dicembre 2025  
**Autore:** [Nome]  
**Stato:** Draft per revisione  
**Changelog v1.1:** Integrazione raccomandazioni da Analisi Competitiva

---

## 1. Executive Summary

### 1.1 Panoramica
Sviluppo di una web application per la gestione contabile e amministrativa di **Weiss Cafè**, un cocktail bar con caffetteria situato a Sacile (PN). Il sistema sostituirà l'attuale gestione basata su fogli Excel, digitalizzando e automatizzando i processi di registrazione incassi, prima nota, e analisi finanziaria.

### 1.2 Obiettivi principali
1. **Digitalizzare** il processo di chiusura cassa giornaliera (attualmente cartaceo)
2. **Centralizzare** la gestione contabile di cassa e banca
3. **Automatizzare** calcoli, quadrature e report
4. **Predisporre** il sistema per gestione multi-sede (Villa Varda, Casette)
5. **[NEW]** Eliminare il data entry manuale attraverso import automatici (fatture SDI, movimenti banca)
6. **[NEW]** Implementare controllo di gestione proattivo con budget e analisi scostamenti

### 1.3 MVP - Minimum Viable Product (Fase 1)
1. Prima nota Cassa/Banca
2. Form digitale chiusura cassa giornaliera **(MOBILE-FIRST)**
3. Storico incassi e confronti temporali

### 1.4 Posizionamento Competitivo
Dall'analisi dei competitor (BPilot, TomatoAI, iammi, Restaurant365, MarginEdge), il sistema si differenzia per:
- **Bar-specific**: Ottimizzato per cocktail bar, non generico ristorante
- **Italian-first**: Piena conformità fiscale italiana (SDI, F24, LIPE)
- **Simple & focused**: Core accounting + cash management senza bloat
- **Staff-friendly**: Mobile-first per uso quotidiano reale

---

## 2. Contesto e Background

### 2.1 L'attività
- **Tipologia:** Cocktail bar con caffetteria
- **Sede principale:** Weiss Cafè, Sacile (PN)
- **Sedi secondarie:** Villa Varda, Casette (da integrare in futuro)
- **Fasce operative:**
  - Mattina (apertura - 16:00): caffetteria
  - Aperitivo (16:00 - 21:00): bar
  - Sera (21:00 - chiusura): cocktail bar

### 2.2 Situazione attuale
- Gestione tramite file Excel complesso (~30 fogli)
- Chiusura cassa su modulo cartaceo compilato dai dipendenti
- Inserimento dati manuale il giorno successivo
- Nessuna integrazione con sistemi esterni

### 2.3 Pain points
- Data entry ripetitivo e time-consuming
- Rischio errori di trascrizione
- Difficoltà nel tracciare differenze di cassa
- Analisi storiche laboriose
- Nessun alert automatico
- **[NEW]** Nessun controllo budget vs actual
- **[NEW]** Riconciliazione bancaria manuale

### 2.4 Stakeholders
| Ruolo | Nome/Descrizione | Utilizzo sistema |
|-------|------------------|------------------|
| Titolare/Admin | Proprietario | Accesso completo, configurazioni |
| Manager | Collaboratrice fidata | Inserimento dati, report |
| Staff | Dipendenti turno | Compilazione chiusura cassa |

### 2.5 Benchmark Competitor
| Competitor | Punti di forza | Pricing |
|------------|----------------|---------|
| BPilot | Riconciliazione bancaria AI, Budget 24 mesi | €69/mese |
| iammi | AI Co-Pilot, Alert automatici | €49-199/mese |
| TomatoAI | Food cost, Tracking prezzi fornitori | Su richiesta |
| Restaurant365 | AI Scheduling, P&L automatico | Enterprise |
| MarginEdge | Zero data entry fatture, Liquor management | $330/mese |

---

## 3. Architettura del sistema

### 3.1 Stack tecnologico raccomandato
```
Frontend: React/Next.js + TailwindCSS
Backend: Node.js/Express o Python/FastAPI
Database: PostgreSQL
Auth: JWT + Role-based access control
Hosting: Cloud (AWS/Vercel/Railway)
```

### 3.2 Requisiti non funzionali
- **[UPDATED] Mobile-first**: Form chiusura cassa come PWA installabile
- **[NEW] Offline-first**: Compilazione offline con sync quando connesso
- **Performance**: Caricamento pagine < 2s
- **Disponibilità**: 99.5% uptime
- **Backup**: Giornaliero automatico
- **Sicurezza**: HTTPS, password hashing, audit log

### 3.3 Best Practice UI/UX (da competitor)
- **PWA (Progressive Web App)**: Form chiusura cassa installabile su device
- **Touch-optimized**: Pulsanti grandi, tastierini numerici ottimizzati
- **Photo upload**: Possibilità di allegare foto scontrini/documenti
- **Voice notes**: Note vocali per anomalie (futuro)

---

## 4. Modello Dati

### 4.1 Entità principali

#### 4.1.1 Sedi (venues)
```sql
venues {
  id: UUID PRIMARY KEY
  name: VARCHAR(100) NOT NULL           -- "Weiss Cafè", "Villa Varda", "Casette"
  code: VARCHAR(10) UNIQUE              -- "WEISS", "VV", "CAS"
  address: TEXT
  default_float: DECIMAL(10,2)          -- Fondo cassa predefinito (es. 114.00)
  is_active: BOOLEAN DEFAULT true
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

#### 4.1.2 Utenti (users)
```sql
users {
  id: UUID PRIMARY KEY
  email: VARCHAR(255) UNIQUE NOT NULL
  password_hash: VARCHAR(255) NOT NULL
  first_name: VARCHAR(100)
  last_name: VARCHAR(100)
  role_id: UUID REFERENCES roles(id)
  venue_id: UUID REFERENCES venues(id)  -- Sede di appartenenza
  hourly_rate: DECIMAL(10,2)            -- Tariffa oraria (per extra)
  is_fixed_staff: BOOLEAN DEFAULT false -- Dipendente fisso vs extra
  is_active: BOOLEAN DEFAULT true
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

#### 4.1.3 Ruoli e permessi (roles, permissions)
```sql
roles {
  id: UUID PRIMARY KEY
  name: VARCHAR(50) NOT NULL            -- "admin", "manager", "staff"
  description: TEXT
  is_custom: BOOLEAN DEFAULT false
  created_at: TIMESTAMP
}

permissions {
  id: UUID PRIMARY KEY
  code: VARCHAR(100) UNIQUE             -- "cash_closure.create", "reports.view"
  description: TEXT
  module: VARCHAR(50)                   -- "cash", "bank", "reports", "admin"
}

role_permissions {
  role_id: UUID REFERENCES roles(id)
  permission_id: UUID REFERENCES permissions(id)
  PRIMARY KEY (role_id, permission_id)
}
```

#### 4.1.4 Chiusure cassa giornaliere (daily_closures)
```sql
daily_closures {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  date: DATE NOT NULL
  weather_morning: VARCHAR(50)          -- "sole", "nuvoloso", "pioggia"
  weather_afternoon: VARCHAR(50)
  weather_evening: VARCHAR(50)
  temperature_morning: INTEGER          -- Celsius (futuro: da API meteo)
  temperature_afternoon: INTEGER
  temperature_evening: INTEGER
  notes: TEXT                           -- Note giornaliere (eventi, etc.)
  is_event: BOOLEAN DEFAULT false       -- Giornata evento (QMD, etc.)
  event_name: VARCHAR(100)              -- Nome evento se applicabile
  status: VARCHAR(20) DEFAULT 'draft'   -- draft, submitted, validated
  submitted_by: UUID REFERENCES users(id)
  submitted_at: TIMESTAMP
  validated_by: UUID REFERENCES users(id)
  validated_at: TIMESTAMP
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
  
  UNIQUE(venue_id, date)
}
```

#### 4.1.5 Postazioni cassa (cash_stations)
```sql
cash_stations {
  id: UUID PRIMARY KEY
  closure_id: UUID REFERENCES daily_closures(id) ON DELETE CASCADE
  name: VARCHAR(50) NOT NULL            -- "BAR", "CASSA 1", "MARSUPIO", "TAVOLI"
  position: INTEGER                     -- Ordine visualizzazione
  
  -- Incassi
  receipt_amount: DECIMAL(10,2)         -- Corrispettivo (scontrinato)
  receipt_vat: DECIMAL(10,2)            -- IVA scorporata dal corrispettivo
  invoice_amount: DECIMAL(10,2)         -- Fatture emesse
  invoice_vat: DECIMAL(10,2)            -- IVA fatture
  suspended_amount: DECIMAL(10,2)       -- Sospesi/conti aperti
  cash_amount: DECIMAL(10,2)            -- Incasso contanti
  pos_amount: DECIMAL(10,2)             -- Incasso POS
  total_amount: DECIMAL(10,2)           -- Totale incasso (calcolato)
  
  -- Fondo cassa
  float_amount: DECIMAL(10,2)           -- Fondo cassa per questa postazione
  
  created_at: TIMESTAMP
}
```

#### 4.1.6 Parziali orari (hourly_partials)
```sql
hourly_partials {
  id: UUID PRIMARY KEY
  closure_id: UUID REFERENCES daily_closures(id) ON DELETE CASCADE
  station_id: UUID REFERENCES cash_stations(id)  -- NULL se riferito a tutta la sede
  time_slot: TIME NOT NULL              -- 16:00, 21:00
  
  receipt_progressive: DECIMAL(10,2)    -- Corrispettivo progressivo
  pos_progressive: DECIMAL(10,2)        -- POS progressivo
  coffee_counter: INTEGER               -- Contatore caffè totale macchina
  coffee_delta: INTEGER                 -- Caffè fatti nella fascia
  weather: VARCHAR(50)
  
  created_at: TIMESTAMP
}
```

#### 4.1.7 Conteggio liquidità (cash_counts)
```sql
cash_counts {
  id: UUID PRIMARY KEY
  station_id: UUID REFERENCES cash_stations(id) ON DELETE CASCADE
  
  -- Banconote
  bills_500: INTEGER DEFAULT 0
  bills_200: INTEGER DEFAULT 0
  bills_100: INTEGER DEFAULT 0
  bills_50: INTEGER DEFAULT 0
  bills_20: INTEGER DEFAULT 0
  bills_10: INTEGER DEFAULT 0
  bills_5: INTEGER DEFAULT 0
  
  -- Monete
  coins_2: INTEGER DEFAULT 0
  coins_1: INTEGER DEFAULT 0
  coins_050: INTEGER DEFAULT 0
  coins_020: INTEGER DEFAULT 0
  coins_010: INTEGER DEFAULT 0
  coins_005: INTEGER DEFAULT 0
  coins_002: INTEGER DEFAULT 0
  coins_001: INTEGER DEFAULT 0
  
  total_counted: DECIMAL(10,2)          -- Calcolato automaticamente
  expected_total: DECIMAL(10,2)         -- Atteso (fondo + incassi - uscite)
  difference: DECIMAL(10,2)             -- Differenza (ammanco/eccedenza)
  
  created_at: TIMESTAMP
}
```

#### 4.1.8 Uscite cassa giornaliere (daily_expenses)
```sql
daily_expenses {
  id: UUID PRIMARY KEY
  closure_id: UUID REFERENCES daily_closures(id) ON DELETE CASCADE
  
  payee: VARCHAR(200) NOT NULL          -- Beneficiario
  description: VARCHAR(500)             -- Causale
  document_ref: VARCHAR(100)            -- Riferimento documento (fattura, DDT)
  document_type: VARCHAR(50)            -- "fattura", "ricevuta", "personale", "nessuno"
  amount: DECIMAL(10,2) NOT NULL
  vat_amount: DECIMAL(10,2)             -- IVA se presente
  account_id: UUID REFERENCES accounts(id)  -- Conto di imputazione
  is_paid: BOOLEAN DEFAULT true         -- Checkbox pagato
  paid_by: VARCHAR(100)                 -- Chi ha anticipato (es. "LUCA")
  
  created_at: TIMESTAMP
}
```

#### 4.1.9 Presenze giornaliere (daily_attendance)
```sql
daily_attendance {
  id: UUID PRIMARY KEY
  closure_id: UUID REFERENCES daily_closures(id) ON DELETE CASCADE
  user_id: UUID REFERENCES users(id)
  
  shift: VARCHAR(20) NOT NULL           -- "morning", "evening"
  hours: DECIMAL(4,1)                   -- Ore lavorate (NULL se codice)
  status_code: VARCHAR(10)              -- "FE", "R", "Z", "C" o NULL se ore numeriche
  hourly_rate: DECIMAL(10,2)            -- Tariffa oraria applicata
  total_pay: DECIMAL(10,2)              -- Compenso totale (calcolato)
  is_paid: BOOLEAN DEFAULT false        -- Pagato in giornata
  notes: TEXT
  
  created_at: TIMESTAMP
}
```

#### 4.1.10 Piano dei conti (accounts)
```sql
accounts {
  id: UUID PRIMARY KEY
  code: VARCHAR(20) UNIQUE              -- Codice conto
  name: VARCHAR(200) NOT NULL           -- Nome conto
  type: VARCHAR(50) NOT NULL            -- "ricavo", "costo", "attivo", "passivo"
  category: VARCHAR(100)                -- Categoria (es. "Costi personale")
  parent_id: UUID REFERENCES accounts(id)  -- Per struttura gerarchica
  is_active: BOOLEAN DEFAULT true
  
  created_at: TIMESTAMP
}
```

#### 4.1.11 Movimenti prima nota (journal_entries)
```sql
journal_entries {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  date: DATE NOT NULL
  
  register_type: VARCHAR(10) NOT NULL   -- "cash", "bank"
  document_ref: VARCHAR(100)            -- Riferimento documento
  document_type: VARCHAR(50)            -- Tipo documento
  description: VARCHAR(500) NOT NULL    -- Causale
  
  debit_amount: DECIMAL(10,2)           -- Dare
  credit_amount: DECIMAL(10,2)          -- Avere
  vat_amount: DECIMAL(10,2)             -- IVA
  
  account_id: UUID REFERENCES accounts(id)
  counterpart_id: UUID REFERENCES accounts(id)  -- Conto di contropartita
  
  -- Collegamento a chiusura cassa (se derivato)
  closure_id: UUID REFERENCES daily_closures(id)
  expense_id: UUID REFERENCES daily_expenses(id)
  
  -- [NEW] Per riconciliazione bancaria
  reconciliation_status: VARCHAR(20) DEFAULT 'pending'  -- pending, matched, manual
  bank_transaction_id: UUID REFERENCES bank_transactions(id)
  
  running_balance: DECIMAL(10,2)        -- Saldo progressivo
  
  created_by: UUID REFERENCES users(id)
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

#### 4.1.12 Saldi cassa/banca (register_balances)
```sql
register_balances {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  register_type: VARCHAR(10) NOT NULL   -- "cash", "bank"
  date: DATE NOT NULL
  
  opening_balance: DECIMAL(10,2)
  total_debits: DECIMAL(10,2)
  total_credits: DECIMAL(10,2)
  closing_balance: DECIMAL(10,2)
  
  UNIQUE(venue_id, register_type, date)
}
```

### 4.2 [NEW] Entità aggiuntive da Analisi Competitiva

#### 4.2.1 Storico prezzi fornitori (supplier_price_history)
```sql
supplier_price_history {
  id: UUID PRIMARY KEY
  supplier_id: UUID REFERENCES suppliers(id)
  item_code: VARCHAR(50)                -- Codice articolo fornitore
  item_description: VARCHAR(200)
  
  price: DECIMAL(10,2) NOT NULL
  unit: VARCHAR(20)                     -- "kg", "lt", "pz", etc.
  effective_date: DATE NOT NULL
  
  -- Calcoli automatici
  previous_price: DECIMAL(10,2)
  price_change_pct: DECIMAL(5,2)        -- Variazione % vs prezzo precedente
  
  source_document: VARCHAR(100)         -- Fattura da cui è stato rilevato
  created_at: TIMESTAMP
}
```

#### 4.2.2 Budget e target (budget_targets)
```sql
budget_targets {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  year: INTEGER NOT NULL
  month: INTEGER NOT NULL               -- 1-12, NULL per target annuale
  
  target_type: VARCHAR(50) NOT NULL     -- "revenue", "cost_category", "kpi"
  category: VARCHAR(100)                -- Categoria costo se applicabile
  
  target_amount: DECIMAL(12,2)
  actual_amount: DECIMAL(12,2)          -- Aggiornato automaticamente
  variance_amount: DECIMAL(12,2)        -- Scostamento (calcolato)
  variance_pct: DECIMAL(5,2)            -- Scostamento % (calcolato)
  
  notes: TEXT
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
  
  UNIQUE(venue_id, year, month, target_type, category)
}
```

#### 4.2.3 Configurazione alert (alerts_config)
```sql
alerts_config {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  user_id: UUID REFERENCES users(id)    -- NULL = tutti gli admin
  
  alert_type: VARCHAR(50) NOT NULL      -- "cash_difference", "budget_variance", 
                                        -- "invoice_due", "price_change", "labor_cost"
  threshold_value: DECIMAL(10,2)        -- Soglia numerica
  threshold_pct: DECIMAL(5,2)           -- Soglia percentuale
  comparison: VARCHAR(10)               -- "gt", "lt", "eq" (greater than, less than, equal)
  
  is_active: BOOLEAN DEFAULT true
  notification_channels: VARCHAR(100)   -- "email", "push", "sms" (comma-separated)
  
  created_at: TIMESTAMP
}
```

#### 4.2.4 Movimenti bancari importati (bank_transactions)
```sql
bank_transactions {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  
  -- Dati dall'estratto conto
  transaction_date: DATE NOT NULL
  value_date: DATE
  description: VARCHAR(500)
  amount: DECIMAL(10,2) NOT NULL        -- Positivo = entrata, Negativo = uscita
  balance_after: DECIMAL(12,2)
  
  -- Metadati import
  bank_reference: VARCHAR(100)          -- Riferimento univoco banca
  import_batch_id: UUID                 -- Per tracciare import
  imported_at: TIMESTAMP
  
  -- Riconciliazione
  reconciliation_status: VARCHAR(20) DEFAULT 'pending'  -- pending, matched, manual, ignored
  matched_journal_id: UUID REFERENCES journal_entries(id)
  match_confidence: DECIMAL(3,2)        -- 0.00-1.00 per matching AI
  reconciled_by: UUID REFERENCES users(id)
  reconciled_at: TIMESTAMP
  
  created_at: TIMESTAMP
}
```

#### 4.2.5 Fatture elettroniche importate (electronic_invoices)
```sql
electronic_invoices {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  
  -- Dati fattura SDI
  sdi_id: VARCHAR(100) UNIQUE           -- ID univoco SDI
  invoice_number: VARCHAR(50)
  invoice_date: DATE
  supplier_vat: VARCHAR(20)             -- P.IVA fornitore
  supplier_name: VARCHAR(200)
  
  -- Importi
  taxable_amount: DECIMAL(10,2)         -- Imponibile
  vat_amount: DECIMAL(10,2)             -- IVA
  total_amount: DECIMAL(10,2)           -- Totale
  
  -- Scadenza
  due_date: DATE
  payment_terms: VARCHAR(100)
  
  -- Stato elaborazione
  status: VARCHAR(20) DEFAULT 'imported' -- imported, categorized, recorded, paid
  account_id: UUID REFERENCES accounts(id)  -- Conto assegnato (auto o manuale)
  journal_entry_id: UUID REFERENCES journal_entries(id)
  
  -- File XML originale
  xml_content: TEXT
  
  imported_at: TIMESTAMP
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

#### 4.2.6 Scadenzario fornitori (supplier_deadlines)
```sql
supplier_deadlines {
  id: UUID PRIMARY KEY
  venue_id: UUID REFERENCES venues(id)
  supplier_id: UUID REFERENCES suppliers(id)
  invoice_id: UUID REFERENCES electronic_invoices(id)
  
  due_date: DATE NOT NULL
  amount: DECIMAL(10,2) NOT NULL
  
  status: VARCHAR(20) DEFAULT 'pending' -- pending, paid, overdue, partial
  paid_amount: DECIMAL(10,2) DEFAULT 0
  paid_date: DATE
  payment_method: VARCHAR(50)           -- "bonifico", "contanti", "rid", "assegno"
  payment_reference: VARCHAR(100)
  
  notes: TEXT
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### 4.3 Relazioni ER (sintesi aggiornata)

```
venues 1--* daily_closures
daily_closures 1--* cash_stations
daily_closures 1--* hourly_partials
daily_closures 1--* daily_expenses
daily_closures 1--* daily_attendance
cash_stations 1--1 cash_counts
users *--1 roles
roles *--* permissions
accounts 1--* journal_entries
daily_closures 1--* journal_entries

-- [NEW] Relazioni da Analisi Competitiva
suppliers 1--* supplier_price_history
venues 1--* budget_targets
venues 1--* alerts_config
venues 1--* bank_transactions
bank_transactions 1--1 journal_entries (riconciliazione)
venues 1--* electronic_invoices
electronic_invoices 1--1 journal_entries
suppliers 1--* supplier_deadlines
electronic_invoices 1--1 supplier_deadlines
```

---

## 5. Requisiti Funzionali - MVP

### 5.1 Modulo: Autenticazione e autorizzazione

#### 5.1.1 Login/Logout
- **RF-AUTH-001**: Il sistema deve permettere login con email e password
- **RF-AUTH-002**: Il sistema deve supportare "remember me" (token persistente)
- **RF-AUTH-003**: Il sistema deve permettere logout con invalidazione sessione
- **RF-AUTH-004**: Il sistema deve bloccare account dopo 5 tentativi falliti

#### 5.1.2 Gestione ruoli
- **RF-AUTH-010**: Admin può creare ruoli personalizzati
- **RF-AUTH-011**: Admin può assegnare permessi granulari ai ruoli
- **RF-AUTH-012**: I permessi devono essere verificati su ogni azione

**Permessi MVP:**
| Codice | Descrizione |
|--------|-------------|
| `closure.create` | Creare chiusura cassa |
| `closure.edit` | Modificare chiusura cassa |
| `closure.validate` | Validare chiusura cassa |
| `closure.view` | Visualizzare chiusure |
| `journal.create` | Creare movimenti prima nota |
| `journal.edit` | Modificare movimenti |
| `journal.view` | Visualizzare prima nota |
| `reports.view` | Visualizzare report |
| `admin.users` | Gestire utenti |
| `admin.settings` | Gestire impostazioni |

---

### 5.2 Modulo: Chiusura Cassa Giornaliera

#### 5.2.1 Form chiusura cassa - Giorno normale

**RF-CASH-001**: Il form deve replicare la struttura del modulo cartaceo attuale

**[UPDATED] Requisiti UI/UX Mobile-First:**
- **RF-CASH-001a**: Il form deve essere sviluppato come PWA installabile
- **RF-CASH-001b**: Il form deve funzionare offline con sync automatico
- **RF-CASH-001c**: Tastierini numerici ottimizzati per touch
- **RF-CASH-001d**: Pulsanti di dimensione minima 44x44px

**Sezione Header:**
- Data (obbligatoria, default oggi)
- Meteo generale (select: sole/nuvoloso/pioggia/variabile)
- Note giornaliere (textarea)

**Sezione Incassi per cassa:**
Il sistema deve permettere da 1 a N postazioni cassa configurabili.

Per ogni postazione:
| Campo | Tipo | Obbligatorio | Note |
|-------|------|--------------|------|
| Nome postazione | Select | Sì | Da anagrafica postazioni |
| Corrispettivo | Decimal | Sì | Importo scontrinato |
| IVA | Decimal | Auto-calc | Scorporo automatico (aliquota configurabile) |
| Fatture | Decimal | No | Fatture emesse |
| IVA Fatture | Decimal | No | |
| Sospesi | Decimal | No | Conti aperti |
| Contanti | Decimal | Sì | |
| POS | Decimal | Sì | |
| Totale | Decimal | Auto-calc | Contanti + POS |

**RF-CASH-002**: Il sistema deve calcolare automaticamente:
- IVA scorporata: `corrispettivo - (corrispettivo / 1.10)`
- Totale incasso: `contanti + POS`
- "Non battuto": `totale - corrispettivo`
- Totale generale (somma di tutte le casse)

**Sezione Parziali orari:**
| Campo | Tipo | Note |
|-------|------|------|
| Parziale 16:00 - Corrispettivo | Decimal | Progressivo cassa |
| Parziale 16:00 - POS | Decimal | Tra parentesi nel form cartaceo |
| Parziale 16:00 - Meteo | Select | |
| Parziale 16:00 - Caffè totale | Integer | Contatore macchina |
| Parziale 16:00 - Caffè fascia | Integer | Auto-calc o manuale |
| Parziale 21:00 - [stessi campi] | | |

**RF-CASH-003**: I caffè per fascia devono essere calcolati automaticamente:
- Caffè mattina = Contatore 16:00 - Contatore giorno precedente
- Caffè aperitivo = Contatore 21:00 - Contatore 16:00
- Caffè sera = Contatore chiusura - Contatore 21:00 (opzionale)

**Sezione Conteggio liquidità:**

Per ogni postazione cassa, griglia conteggio:
| Taglio | Quantità | Totale |
|--------|----------|--------|
| 500€ | input | auto-calc |
| 200€ | input | auto-calc |
| 100€ | input | auto-calc |
| 50€ | input | auto-calc |
| 20€ | input | auto-calc |
| 10€ | input | auto-calc |
| 5€ | input | auto-calc |
| 2€ | input | auto-calc |
| 1€ | input | auto-calc |
| 0,50€ | input | auto-calc |
| 0,20€ | input | auto-calc |
| 0,10€ | input | auto-calc |
| 0,05€ | input | auto-calc |
| 0,02€ | input | auto-calc |
| 0,01€ | input | auto-calc |
| **TOTALE** | | **auto-calc** |

**RF-CASH-004**: Il sistema deve:
- Calcolare totale liquidità automaticamente
- Permettere inserimento fondo cassa per ogni postazione
- Calcolare: `Liquidità netta = Totale contato - Fondo cassa`
- Calcolare: `Atteso = Fondo cassa + Incassi contanti - Uscite contanti`
- Evidenziare differenza (ammanco in rosso, eccedenza in verde)

**Sezione Uscite:**

Tabella dinamica (aggiungi/rimuovi righe):
| Campo | Tipo | Note |
|-------|------|------|
| Fornitore/Beneficiario | Autocomplete | Da anagrafica + libero |
| Documento | Text | Riferimento fattura/DDT |
| Tipo documento | Select | Fattura/DDT/Ricevuta/Personale/Nessuno |
| IVA | Decimal | |
| Importo | Decimal | |
| Conto | Autocomplete | Piano dei conti |
| Pagato | Checkbox | Default: checked |
| Anticipato da | Text | Es. "LUCA" per gestione anticipi |

**RF-CASH-005**: Il sistema deve suggerire automaticamente il conto in base al fornitore/causale (machine learning o regole)

**Sezione Personale:**

Due sottosezioni: Dipendenti fissi e Extra

**Dipendenti fissi (mattina/sera):**
| Campo | Tipo | Note |
|-------|------|------|
| Dipendente | Select | Da anagrafica dipendenti fissi |
| Ore / Codice | Input | Numerico o select (FE/R/Z/C) |

Codici speciali:
- `FE` = Ferie
- `R` = Riposo  
- `Z` = Permesso
- `C` = Servizio in altra sede (es. Casetta)

**Extra:**
| Campo | Tipo | Note |
|-------|------|------|
| Nome | Autocomplete | Da anagrafica + libero |
| Ore | Decimal | |
| Tariffa | Decimal | Auto da anagrafica, modificabile |
| Totale | Decimal | Auto-calc o manuale (forfait) |
| Pagato | Checkbox | |

**RF-CASH-006**: Per gli extra, il sistema deve:
- Pre-compilare tariffa oraria da anagrafica
- Calcolare totale = ore × tariffa
- Permettere override manuale per forfait

#### 5.2.2 Form chiusura cassa - Evento

**RF-CASH-010**: Il form evento deve estendere il form normale con:
- Flag "È un evento" (attiva modalità evento)
- Nome evento (text)
- Possibilità di aggiungere postazioni cassa dinamicamente
- Template postazioni preconfigurate: BAR, CASSA 1, CASSA 2, TAVOLI, MARSUPIO, ESTERNO
- Conteggio liquidità separato per ogni postazione
- Sezione "Anticipi" per gestire chi anticipa pagamenti

**RF-CASH-011**: Il riepilogo evento deve mostrare:
- Subtotale per ogni postazione
- Totale evento (somma postazioni evento, escluso BAR fisso)
- Totale generale (BAR + evento)
- Totale uscite per "anticipatore" (es. "TOTALE LUCA: 1.720€")

#### 5.2.3 Workflow chiusura cassa

```
[Staff compila] → [Draft salvato] → [Submit] → [Manager valida] → [Confermato]
                        ↓                              ↓
                  [Auto-save ogni 30s]         [Può respingere con note]
                  [Sync offline quando online]
```

**RF-CASH-020**: Stati chiusura:
- `draft`: In compilazione, modificabile da staff
- `submitted`: Inviato, in attesa validazione
- `validated`: Validato, genera movimenti prima nota
- `rejected`: Respinto, torna a draft con note

**RF-CASH-021**: Alla validazione, il sistema deve generare automaticamente:
- Movimento cassa: incasso contanti (dare)
- Movimento cassa: versamento a banca se presente (avere)
- Movimenti cassa: tutte le uscite (avere)
- Categorizzazione automatica dei movimenti

---

### 5.3 Modulo: Prima Nota Cassa

#### 5.3.1 Visualizzazione

**RF-JOUR-001**: La prima nota cassa deve mostrare:
- Filtri: periodo (da/a), conto, causale, importo
- Tabella movimenti con colonne:
  - Data
  - Documento
  - Causale
  - Dare
  - Avere
  - Conto
  - Saldo progressivo
  - **[NEW]** Stato riconciliazione (icona)
- Saldo iniziale periodo
- Totale dare / Totale avere
- Saldo finale

**RF-JOUR-002**: Il saldo progressivo deve aggiornarsi automaticamente

#### 5.3.2 Inserimento manuale

**RF-JOUR-010**: Form inserimento movimento:
| Campo | Tipo | Obbligatorio |
|-------|------|--------------|
| Data | Date | Sì |
| Tipo documento | Select | No |
| Numero documento | Text | No |
| Causale | Text + Autocomplete | Sì |
| Dare | Decimal | Sì (mutualmente esclusivo) |
| Avere | Decimal | Sì (mutualmente esclusivo) |
| IVA | Decimal | No |
| Conto | Autocomplete | Sì |
| Note | Textarea | No |

**RF-JOUR-011**: Il sistema deve suggerire il conto in base alla causale

#### 5.3.3 Operazioni speciali

**RF-JOUR-020**: Versamento contanti in banca
- Tipo: "Versamento"
- Genera movimento cassa (avere) + movimento banca (dare)
- Campo importo unico

**RF-JOUR-021**: Prelievo contanti da banca
- Tipo: "Prelievo"
- Genera movimento banca (avere) + movimento cassa (dare)

---

### 5.4 Modulo: Prima Nota Banca

#### 5.4.1 Struttura analoga a Prima Nota Cassa

**RF-BANK-001**: Stessa struttura della prima nota cassa con:
- Saldo contabile iniziale
- Movimenti con dare/avere
- Saldo progressivo
- Gestione commissioni POS separate

#### 5.4.2 Tipologie movimento banca specifiche

| Tipo | Dare | Avere |
|------|------|-------|
| Incasso POS | X | |
| Bonifico in uscita | | X |
| Bonifico in entrata | X | |
| Versamento contanti | X | |
| Prelievo contanti | | X |
| Commissioni | | X |
| RID/SDD | | X |
| Interessi attivi | X | |
| Interessi passivi | | X |

---

### 5.5 Modulo: Storico e Report

#### 5.5.1 Dashboard principale

**RF-REP-001**: La dashboard deve mostrare (configurabile):

**KPI Cards:**
- Fatturato periodo (con variazione % vs periodo precedente)
- Incasso medio giornaliero
- Saldo IVA
- Liquidità totale (cassa + banca)
- **[UPDATED]** Labor cost % (calcolato automaticamente con trend)
- F&B cost %
- **[NEW]** Varianza vs Budget (se configurato)

**Grafici:**
- Andamento incassi (line chart, ultimi 30 giorni)
- Confronto anno precedente (bar chart)
- Distribuzione incassi per fascia oraria (pie chart)
- Incassi per giorno settimana (bar chart)

#### 5.5.2 Report incassi giornalieri

**RF-REP-010**: Tabella mensile stile Excel attuale:
| Data | Giorno | €AM | POS AM | ☕ | €APE | POS APE | ☕ | €PM | POS PM | TOT | CORR | Note |
|------|--------|-----|--------|---|------|---------|---|-----|--------|-----|------|------|

**RF-REP-011**: Funzionalità:
- Filtro per mese/anno
- Filtro per sede
- Export Excel/CSV
- Totali e medie in fondo
- Confronto con stesso periodo anno precedente

#### 5.5.3 Report storico annuale

**RF-REP-020**: Tabella comparativa anni:
| Mese | 2025 | Corr% | 2024 | Corr% | 2023 | ... | Ø Giorn |
|------|------|-------|------|-------|------|-----|---------|

**RF-REP-021**: Metriche calcolate:
- Totale anno
- Media mensile
- Media giornaliera
- % corrispettivi su totale
- Variazione YoY

#### 5.5.4 Report costi

**RF-REP-030**: Breakdown costi per categoria:
- Costo personale (fissi + extra + TFR + F24)
- Materie prime e sussidiarie
- Costi per servizi
- Godimento beni di terzi
- Costi amministrativi
- Imposte e tasse
- Investimenti

**RF-REP-031**: Per ogni categoria:
- Valore assoluto
- % su fatturato
- Confronto budget
- Trend mensile

---

### 5.6 Modulo: Anagrafiche

#### 5.6.1 Anagrafica dipendenti

**RF-ANA-001**: Campi dipendente:
- Dati anagrafici (nome, cognome, CF, contatti)
- Tipo: fisso/extra
- Tariffa oraria (per extra)
- Sede di appartenenza
- Data assunzione
- Stato: attivo/inattivo

#### 5.6.2 Anagrafica fornitori

**RF-ANA-010**: Campi fornitore:
- Ragione sociale
- P.IVA / CF
- Indirizzo
- Contatti
- Conto predefinito (per suggerimento automatico)
- Termini pagamento (gg)
- Note

#### 5.6.3 Piano dei conti

**RF-ANA-020**: Gestione piano conti gerarchico:
- Codice conto
- Descrizione
- Tipo (ricavo/costo/attivo/passivo)
- Categoria padre
- Attivo/inattivo

---

## 6. [NEW] Requisiti Funzionali - Fase 2

### 6.1 Modulo: Import Fatture Elettroniche SDI

**RF-SDI-001**: Il sistema deve connettersi al Sistema di Interscambio (SDI) dell'Agenzia delle Entrate per:
- Download automatico fatture passive (acquisto)
- Parsing XML fattura elettronica
- Estrazione dati: fornitore, importi, scadenze, dettaglio righe

**RF-SDI-002**: Workflow elaborazione fattura importata:
```
[Import da SDI] → [Categorizzazione AI] → [Review utente] → [Registrazione prima nota]
                                                ↓
                                    [Aggiornamento scadenzario]
```

**RF-SDI-003**: Categorizzazione automatica:
- Suggerimento conto basato su storico fornitore
- Confidence score per ogni suggerimento
- Apprendimento da correzioni manuali

**RF-SDI-004**: Creazione automatica scadenza:
- Data scadenza da fattura o calcolata da termini fornitore
- Inserimento in scadenzario con stato "pending"

### 6.2 Modulo: Budget e Analisi Scostamenti

**RF-BUD-001**: Configurazione budget:
- Target mensili e/o annuali
- Per categoria di ricavo (mattina, aperitivo, sera, eventi)
- Per categoria di costo (da piano conti)
- Per KPI (labor cost %, F&B cost %)

**RF-BUD-002**: Analisi scostamenti automatica:
- Calcolo varianza: `actual - budget`
- Calcolo varianza %: `(actual - budget) / budget × 100`
- Aggiornamento real-time al caricamento dati

**RF-BUD-003**: Visualizzazione:
- Tabella budget vs actual per categoria
- Grafico waterfall per varianze
- Trend mensile con linea budget

**RF-BUD-004**: Alert scostamenti:
- Notifica quando varianza > soglia configurabile
- Soglie differenziate per positivo/negativo

### 6.3 Modulo: Tracking Prezzi Fornitori

**RF-PRICE-001**: Rilevazione automatica prezzi:
- Estrazione prezzi da fatture importate (SDI)
- Associazione articolo-fornitore
- Storicizzazione con data effettiva

**RF-PRICE-002**: Calcolo variazioni:
- Variazione % vs ultimo prezzo
- Variazione % vs media ultimi 3/6/12 mesi
- Trend grafico per articolo

**RF-PRICE-003**: Alert variazioni:
- Notifica quando variazione > soglia (es. ±5%)
- Report settimanale variazioni significative

### 6.4 Modulo: Labor Cost % Avanzato

**RF-LAB-001**: Calcolo automatico:
```
Labor Cost % = (Costo totale personale / Fatturato) × 100
```
Dove:
- Costo personale = stipendi netti + contributi + TFR + compensi extra
- Fatturato = totale incassi periodo

**RF-LAB-002**: Breakdown labor cost:
- Per tipologia (fissi vs extra)
- Per fascia oraria (mattina/aperitivo/sera)
- Per sede

**RF-LAB-003**: Trend e benchmark:
- Grafico trend mensile
- Confronto YoY
- Alert quando > target (default 30%)

### 6.5 Modulo: Sistema Alert Potenziato

**RF-ALERT-001**: Tipologie alert configurabili:
| Tipo | Trigger | Default |
|------|---------|---------|
| Differenza cassa | `abs(differenza) > soglia` | 5€ |
| Scadenza fattura | `giorni_a_scadenza <= X` | 7 giorni |
| Budget variance | `varianza_pct > soglia` | 10% |
| Variazione prezzo | `variazione_pct > soglia` | 5% |
| Labor cost alto | `labor_cost_pct > soglia` | 30% |
| Liquidità bassa | `liquidità < soglia` | 5.000€ |

**RF-ALERT-002**: Canali notifica:
- In-app (badge + lista notifiche)
- Email (digest giornaliero o immediato)
- Push notification (se PWA installata)

---

## 7. [NEW] Requisiti Funzionali - Fase 3

### 7.1 Modulo: Open Banking e Riconciliazione

**RF-BANK-010**: Import movimenti bancari:
- Connessione Open Banking PSD2 (o import CSV/XLSX)
- Download automatico estratto conto
- Frequenza: giornaliera o on-demand

**RF-BANK-011**: Riconciliazione automatica AI:
- Matching movimenti banca ↔ prima nota
- Criteri: data, importo, descrizione (fuzzy matching)
- Confidence score per ogni match proposto

**RF-BANK-012**: Workflow riconciliazione:
```
[Import movimenti] → [Matching AI] → [Review match sospetti] → [Conferma]
                           ↓
                   [Movimenti non matchati → Inserimento manuale]
```

**RF-BANK-013**: Dashboard riconciliazione:
- Movimenti matchati automaticamente
- Movimenti da verificare (confidence < 90%)
- Movimenti non matchati
- Saldo banca vs saldo prima nota

### 7.2 Modulo: Cash Flow Previsionale

**RF-CF-001**: Proiezione entrate:
- Basata su pattern storici (stesso periodo anno precedente)
- Aggiustamento per stagionalità
- Considerazione eventi programmati

**RF-CF-002**: Proiezione uscite:
- Scadenze fornitori programmate
- Stipendi e contributi (cadenza fissa)
- F24 e tasse (cadenza nota)
- Costi ricorrenti (affitto, utenze, etc.)

**RF-CF-003**: Visualizzazione:
- Grafico cash flow prossimi 30/60/90 giorni
- Saldo previsto minimo e data
- Alert se saldo previsto < soglia

**RF-CF-004**: Simulazioni what-if:
- Posticipo/anticipo pagamenti
- Variazione incassi previsti
- Impatto su liquidità

### 7.3 Modulo: Scadenzario Avanzato

**RF-SCAD-001**: Vista calendario scadenze:
- Calendario mensile con importi giornalieri
- Filtri: fornitore, stato, importo

**RF-SCAD-002**: Gestione pagamenti:
- Registrazione pagamento (totale o parziale)
- Collegamento a movimento banca
- Generazione disposizione bonifico (futuro)

**RF-SCAD-003**: Report aging:
- Fatture per anzianità (0-30, 31-60, 61-90, >90 giorni)
- Totali per fascia
- Dettaglio per fornitore

---

## 8. User Stories

### 8.1 Epic: Chiusura cassa

```
US-001: Come staff di turno, voglio compilare la chiusura cassa da smartphone/tablet 
        così da non dover usare moduli cartacei.
        
        Criteri di accettazione:
        - Form responsive funzionante su mobile (PWA)
        - Funzionamento offline con sync
        - Tutti i campi del modulo cartaceo presenti
        - Calcoli automatici funzionanti
        - Salvataggio draft automatico
        - Possibilità di inviare per validazione

US-002: Come manager, voglio validare le chiusure cassa dei dipendenti
        così da verificare la correttezza prima della registrazione.
        
        Criteri di accettazione:
        - Lista chiusure in attesa di validazione
        - Dettaglio completo visualizzabile
        - Possibilità di approvare o respingere
        - Note obbligatorie in caso di reject
        - Notifica allo staff in caso di reject

US-003: Come admin, voglio che le chiusure validate generino automaticamente 
        i movimenti di prima nota, così da evitare doppia digitazione.
        
        Criteri di accettazione:
        - Generazione automatica movimenti cassa
        - Corretta categorizzazione
        - Collegamento chiusura ↔ movimenti
        - Possibilità di modificare/integrare manualmente

US-004: Come staff, voglio vedere la differenza di cassa in tempo reale
        così da sapere subito se c'è un ammanco.
        
        Criteri di accettazione:
        - Calcolo automatico cassa attesa
        - Evidenziazione visiva differenza
        - Alert se differenza > soglia configurabile
```

### 8.2 Epic: Prima nota

```
US-010: Come admin, voglio registrare manualmente movimenti di cassa/banca
        così da tracciare operazioni non derivanti da chiusure.
        
        Criteri di accettazione:
        - Form inserimento con tutti i campi necessari
        - Suggerimento automatico conto
        - Aggiornamento saldo progressivo
        - Possibilità di allegare documento

US-011: Come admin, voglio effettuare versamenti da cassa a banca
        così da trasferire contanti con un'unica operazione.
        
        Criteri di accettazione:
        - Operazione "Versamento" dedicata
        - Genera movimento cassa (avere) e banca (dare)
        - Importo unico, doppia registrazione automatica

US-012: Come manager, voglio filtrare e cercare movimenti
        così da trovare rapidamente operazioni specifiche.
        
        Criteri di accettazione:
        - Filtro per data (range)
        - Filtro per conto
        - Ricerca libera su causale
        - Filtro per importo (range)
        - Export risultati
```

### 8.3 Epic: Report

```
US-020: Come admin, voglio vedere una dashboard con i KPI principali
        così da avere una visione immediata dell'andamento.
        
        Criteri di accettazione:
        - KPI cards configurabili
        - Dati aggiornati in tempo reale
        - Confronto con periodo precedente
        - Grafici interattivi

US-021: Come admin, voglio confrontare gli incassi con l'anno precedente
        così da valutare la crescita.
        
        Criteri di accettazione:
        - Tabella comparativa multi-anno
        - Stesso formato dell'Excel attuale
        - Calcolo variazioni %
        - Export Excel

US-022: Come admin, voglio analizzare i costi per categoria
        così da identificare aree di ottimizzazione.
        
        Criteri di accettazione:
        - Breakdown per categoria
        - % su fatturato
        - Trend temporale
        - Confronto con budget
```

### 8.4 [NEW] Epic: Automazione (Fase 2-3)

```
US-030: Come admin, voglio che le fatture fornitori vengano importate automaticamente
        così da eliminare il data entry manuale.
        
        Criteri di accettazione:
        - Connessione a SDI funzionante
        - Import automatico giornaliero
        - Categorizzazione AI con suggerimenti
        - Creazione automatica scadenze

US-031: Come admin, voglio impostare budget mensili e vedere gli scostamenti
        così da avere controllo proattivo sui costi.
        
        Criteri di accettazione:
        - Configurazione budget per categoria
        - Calcolo automatico varianze
        - Alert quando varianza > soglia
        - Report budget vs actual

US-032: Come admin, voglio che i movimenti bancari vengano riconciliati automaticamente
        così da ridurre il tempo di quadratura.
        
        Criteri di accettazione:
        - Import movimenti da banca
        - Matching automatico AI
        - Review movimenti sospetti
        - Report riconciliazione

US-033: Come admin, voglio vedere il cash flow previsto
        così da pianificare i pagamenti.
        
        Criteri di accettazione:
        - Proiezione entrate da storico
        - Scadenze uscite programmate
        - Grafico cash flow 30/60/90 giorni
        - Alert liquidità bassa
```

---

## 9. Wireframes e UI/UX

### 9.1 Layout generale

```
┌─────────────────────────────────────────────────────────────┐
│  LOGO    [Dashboard] [Cassa] [Banca] [Report]    [User ▼]   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐                                                 │
│ │         │                                                 │
│ │ Sidebar │           Main Content Area                     │
│ │  Menu   │                                                 │
│ │         │                                                 │
│ │         │                                                 │
│ └─────────┘                                                 │
├─────────────────────────────────────────────────────────────┤
│  Footer: © Weiss Cafè | v1.0.0 | Supporto                   │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Form chiusura cassa (mobile-first) - [UPDATED]

```
┌───────────────────────────┐
│ ← Chiusura Cassa    [⋮]   │  ← Menu: Salva offline, Sync
│                           │
│ Data: [27/12/2025    ▼]   │
│ Meteo: [☀️ Sole       ▼]   │
│ Note: [________________]  │
│                           │
│ ═══ CASSA BAR ═══════════ │
│                           │
│ Corrispettivo             │
│ ┌─────────────────────┐   │
│ │           1.760,00  │   │  ← Tastierino numerico grande
│ └─────────────────────┘   │
│ IVA (auto)        160,00  │
│                           │
│ Contanti                  │
│ ┌─────────────────────┐   │
│ │           1.355,50  │   │
│ └─────────────────────┘   │
│                           │
│ POS                       │
│ ┌─────────────────────┐   │
│ │           1.618,90  │   │
│ └─────────────────────┘   │
│ ─────────────────────────│
│ TOTALE          2.974,40  │
│ Non battuto     1.214,40  │
│ ┌───────────────────────┐ │
│ │ ⚠️ Differenza: +23,50 │ │  ← Alert visivo
│ └───────────────────────┘ │
│                           │
│ [+ Aggiungi cassa]        │
│                           │
│ ═══ PARZIALI ════════════ │
│ [Espandi/Comprimi ▼]      │
│                           │
│ ═══ LIQUIDITÀ ═══════════ │
│ [Espandi/Comprimi ▼]      │
│                           │
│ ═══ USCITE ══════════════ │
│ [Espandi/Comprimi ▼]      │
│                           │
│ ═══ PERSONALE ═══════════ │
│ [Espandi/Comprimi ▼]      │
│                           │
│ ┌─────────┐ ┌───────────┐ │
│ │ Salva   │ │  Invia ✓  │ │  ← Pulsanti grandi (44px+)
│ │ bozza   │ │           │ │
│ └─────────┘ └───────────┘ │
│                           │
│ 🔄 Ultima sync: 5 min fa  │  ← Stato offline/sync
└───────────────────────────┘
```

### 9.3 Prima nota - Desktop

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Prima Nota Cassa                                           [+ Nuovo]    │
├─────────────────────────────────────────────────────────────────────────┤
│ Filtri: [01/12/2025] → [31/12/2025]  Conto:[Tutti ▼]  [🔍 Cerca...]    │
├─────────────────────────────────────────────────────────────────────────┤
│ Saldo iniziale 01/12/2025:                              € 115.560,07    │
├───────┬────────────┬─────────────────────────┬──────────┬───────┬───────┤
│ Data  │ Documento  │ Causale                 │   Dare   │ Avere │ Saldo │
├───────┼────────────┼─────────────────────────┼──────────┼───────┼───────┤
│ 02/01 │ INCASSO    │ Incasso giornaliero     │ 1.058,20 │       │116.618│
│ 02/01 │ -          │ Servizi pulizie         │          │ 25,00 │116.593│
│ 02/01 │ -          │ Dash                    │          │ 35,00 │116.558│
│ ...   │ ...        │ ...                     │ ...      │ ...   │ ...   │
├───────┴────────────┴─────────────────────────┼──────────┼───────┼───────┤
│                                      TOTALI: │ 45.230,00│38.120 │       │
│                              Saldo finale:   │          │       │122.668│
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.4 [NEW] Dashboard Riconciliazione Bancaria

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Riconciliazione Bancaria                          [Importa] [Riconcilia]│
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │  Matchati    │ │ Da verificare│ │ Non matchati │ │  Differenza  │   │
│  │     127      │ │      8       │ │      3       │ │   € 234,50   │   │
│  │     ✓        │ │      ⚠️       │ │      ❌       │ │              │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│ Tab: [Tutti] [Da verificare] [Non matchati]                             │
├───────┬─────────────────────┬──────────┬────────────────────┬──────────┤
│ Data  │ Banca               │ Importo  │ Prima Nota         │ Match %  │
├───────┼─────────────────────┼──────────┼────────────────────┼──────────┤
│ 15/12 │ BONIFICO TOSANO SRL │ -790,35  │ Tosano ft.123      │ 95% [✓]  │
│ 15/12 │ POS NEXI            │ +1.234,50│ Incasso POS 15/12  │ 87% [?]  │
│ 16/12 │ BONIFICO ILLY       │ -456,00  │ (nessun match)     │ 0%  [+]  │
└───────┴─────────────────────┴──────────┴────────────────────┴──────────┘
```

---

## 10. Configurazioni e Impostazioni

### 10.1 Parametri globali

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `vat_rate_default` | 10% | Aliquota IVA predefinita |
| `cash_float_default` | 114.00 | Fondo cassa predefinito |
| `cash_difference_threshold` | 5.00 | Soglia alert differenza cassa |
| `currency` | EUR | Valuta |
| `date_format` | DD/MM/YYYY | Formato data |
| `decimal_separator` | , | Separatore decimali |
| **[NEW]** `labor_cost_target` | 30% | Target labor cost % |
| **[NEW]** `budget_variance_threshold` | 10% | Soglia alert scostamento budget |
| **[NEW]** `price_change_threshold` | 5% | Soglia alert variazione prezzo |

### 10.2 Configurazione sedi

Per ogni sede:
- Nome e codice
- Fondo cassa specifico
- Postazioni cassa disponibili
- Aliquote IVA (se diverse)
- Utenti abilitati

### 10.3 Template postazioni cassa

Postazioni predefinite configurabili:
- BAR (sempre presente)
- CASSA 1, CASSA 2, CASSA 3
- TAVOLI
- MARSUPIO
- ESTERNO

---

## 11. Integrazioni

### 11.1 [UPDATED] Priorità integrazioni

| # | Sistema | Funzionalità | Fase | Priorità |
|---|---------|--------------|------|----------|
| 1 | **SDI (Sistema di Interscambio)** | Import fatture elettroniche passive | 2 | CRITICA |
| 2 | **Open Banking PSD2** | Import estratti conto automatico | 3 | ALTA |
| 3 | DATEV Koinos | Backup import fatture | 3 | ALTA |
| 4 | RelaxBanking | Import movimenti (se no PSD2) | 3 | MEDIA |
| 5 | API Meteo (OpenWeatherMap) | Correlazione vendite/meteo | 3 | MEDIA |
| 6 | Agenzia delle Entrate | Cassetto fiscale | 4 | BASSA |

### 11.2 Integrazioni Future (Fase 4+)

- **AI Turni**: Generazione automatica bozza turni basata su pattern storici
- **Magazzino/Inventario**: Gestione stock, ordini, inventari
- **Beverage cost tracking**: Calcolo costo per cocktail (come MarginEdge Freepour)
- **Waste/Shrinkage analysis**: Analisi sprechi e differenze inventariali

---

## 12. [UPDATED] Piano di Rilascio

### Fase 1 - MVP (8-12 settimane)
1. Setup infrastruttura e database
2. Autenticazione e autorizzazione
3. Anagrafiche base (utenti, fornitori, piano conti)
4. **Form chiusura cassa (MOBILE-FIRST, PWA, offline-first)**
5. Prima nota cassa
6. Prima nota banca
7. Report base (incassi giornalieri, storico)

**Nota critica**: Il form chiusura cassa deve essere sviluppato come PWA installabile con supporto offline per garantire adozione da parte dello staff.

### Fase 2 - Consolidamento + Automazione (6-8 settimane)

**Funzionalità originali:**
1. Form chiusura cassa eventi
2. Dashboard KPI avanzata
3. Export/Import dati
4. Gestione multi-sede

**[NEW] Funzionalità da analisi competitiva:**
5. **Import automatico fatture SDI** - Elimina data entry fatture
6. **Tracking variazione prezzi fornitori** - Alert automatici
7. **Modulo Budget** - Target con analisi scostamenti
8. **Labor cost % avanzato** - Calcolo automatico e trend
9. **Sistema alert potenziato** - Notifiche multi-canale

### Fase 3 - Integrazioni Avanzate (6-8 settimane)

**Funzionalità originali:**
1. Import fatture DATEV (backup)
2. API meteo
3. Scadenzario fornitori avanzato

**[NEW] Funzionalità da analisi competitiva:**
4. **Open Banking PSD2** - Import estratti conto automatico
5. **Riconciliazione bancaria AI** - Matching automatico movimenti
6. **Cash flow previsionale** - Proiezioni basate su pattern storici
7. **AI Scheduling** (base) - Suggerimenti turni basati su storico

### Fase 4 - Funzionalità Avanzate (TBD)
1. AI generazione turni completa
2. Gestione magazzino
3. Beverage cost tracking (stile MarginEdge Freepour)
4. Waste/shrinkage analysis
5. Logbook/Team chat

---

## 13. Metriche di Successo

### 13.1 KPI tecnici
- Tempo caricamento pagine < 2s
- Uptime > 99.5%
- Zero perdita dati
- **[NEW]** Sync offline < 5s quando torna online

### 13.2 KPI di adozione
- 100% chiusure cassa digitali entro 30 giorni dal rilascio
- **[UPDATED]** Riduzione tempo data entry del 90% (benchmark BPilot)
- Zero errori di trascrizione
- **[NEW]** PWA installata su 100% device staff

### 13.3 KPI di business
- Identificazione immediata differenze cassa
- Report disponibili in tempo reale
- Decisioni basate su dati aggiornati
- **[NEW]** Riconciliazione bancaria < 15 min/settimana (vs ore attuali)
- **[NEW]** Labor cost monitorato in tempo reale

---

## 14. Appendici

### A. Glossario

| Termine | Definizione |
|---------|-------------|
| Corrispettivo | Importo fiscalmente registrato (scontrinato) |
| Fondo cassa | Importo fisso lasciato in cassa per il cambio |
| Prima nota | Registro cronologico dei movimenti finanziari |
| QMD | "Quella Maledetta Domenica" - evento domenicale |
| Sospeso | Conto aperto, pagamento differito |
| Extra | Collaboratore occasionale pagato a ore/forfait |
| **[NEW]** SDI | Sistema di Interscambio - piattaforma AdE per fatture elettroniche |
| **[NEW]** PSD2 | Payment Services Directive 2 - normativa Open Banking |
| **[NEW]** Labor cost % | Costo personale / Fatturato × 100 |

### B. Codici stato dipendente

| Codice | Significato |
|--------|-------------|
| FE | Ferie |
| R | Riposo |
| Z | Permesso |
| C | Servizio in altra sede (Casetta) |

### C. Riferimenti file Excel originale

| Foglio Excel | Modulo sistema |
|--------------|----------------|
| GEN-DIC | Chiusura cassa + Report incassi |
| CASSA | Prima nota cassa |
| BANCA | Prima nota banca |
| STORICO | Report storico |
| BUDGET 25 | Report costi/KPI + Modulo Budget |
| BILANCIO 25 | Piano dei conti |
| SCADENZARIO | Scadenzario fornitori |
| ORE MESE | Presenze da chiusure |
| TURNI WEISS | (Fase 3-4) Gestione turni AI |

### D. [NEW] Benchmark Competitor

| Funzionalità | BPilot | TomatoAI | iammi | R365 | MarginEdge | PRD v1.1 |
|--------------|--------|----------|-------|------|------------|----------|
| Import fatture SDI | ✓ AI | — | ✓ | — | — | **Fase 2** |
| Riconciliazione bancaria | ✓ Auto | — | — | ✓ | — | **Fase 3** |
| Budget e forecasting | ✓ 24m | ✓ | ✓ | ✓ | — | **Fase 2** |
| Cash flow previsionale | ✓ | — | ✓ | ✓ | Parziale | **Fase 3** |
| Alert automatici | ✓ | ✓ | ✓ | ✓ | — | **Fase 2** |
| Dashboard KPI | ✓ | ✓ | ✓ | ✓ | ✓ | **Fase 1** |
| Tracking prezzi fornitori | — | ✓ | ✓ | ✓ | ✓ | **Fase 2** |
| Labor cost % | — | ✓ | ✓ | ✓ AI | Parziale | **Fase 2** |
| Mobile-first/PWA | ✓ | ✓ | ✓ | ✓ | ✓ | **Fase 1** |
| AI Scheduling | — | — | — | ✓ | — | **Fase 3-4** |
| Liquor management | — | — | — | Parziale | ✓ Freepour | **Fase 4** |

---

## 15. Note per lo sviluppatore

### 15.1 Priorità implementazione

1. **Database schema** - Iniziare dal modello dati completo (incluse nuove tabelle)
2. **Auth system** - Fondamentale per tutto il resto
3. **Anagrafiche** - Prerequisito per le funzionalità core
4. **Form chiusura cassa** - Core del sistema, **MOBILE-FIRST**
5. **Prima nota** - Collegata alle chiusure
6. **Report** - Consumano i dati inseriti
7. **[NEW]** Import SDI - Massimo impatto su data entry
8. **[NEW]** Budget - Controllo di gestione proattivo

### 15.2 Attenzione particolare a

- **Calcoli decimali**: Usare DECIMAL, non FLOAT
- **Timezone**: Tutto in Europe/Rome
- **Audit trail**: Loggare chi fa cosa e quando
- **Backup**: Strategia robusta fin dall'inizio
- **[UPDATED] Mobile UX**: Il form chiusura deve essere PWA con offline-first
- **[NEW] Performance sync**: Sync offline deve essere < 5 secondi
- **[NEW] AI matching**: Implementare fuzzy matching per riconciliazione

### 15.3 Test cases critici

1. Chiusura con differenza cassa
2. Chiusura evento multi-cassa
3. Versamento cassa → banca
4. Generazione automatica movimenti
5. Calcolo KPI con dati parziali
6. Confronto YoY con giorni lavorativi diversi
7. **[NEW]** Compilazione offline e sync
8. **[NEW]** Import fattura SDI e categorizzazione
9. **[NEW]** Matching riconciliazione bancaria
10. **[NEW]** Alert scostamento budget

### 15.4 [NEW] API/Integrazioni - Note tecniche

| Integrazione | Documentazione | Note |
|--------------|----------------|------|
| SDI | [fatturapa.gov.it](https://www.fatturapa.gov.it) | Richiede accreditamento come intermediario o uso servizio terzo |
| Open Banking PSD2 | Varie (Fabrick, Tink, etc.) | Valutare aggregatori italiani |
| OpenWeatherMap | [openweathermap.org/api](https://openweathermap.org/api) | Piano gratuito sufficiente |

---

*Fine documento PRD v1.1*

**Changelog:**
- v1.0 (31/12/2025): Versione iniziale
- v1.1 (31/12/2025): Integrazione raccomandazioni da Analisi Competitiva
  - Aggiunto focus Mobile-first/PWA per Fase 1
  - Anticipato Import SDI a Fase 2
  - Aggiunto Modulo Budget in Fase 2
  - Aggiunto Tracking prezzi fornitori in Fase 2
  - Aggiunto Labor cost % avanzato in Fase 2
  - Aggiunto Open Banking e Riconciliazione AI in Fase 3
  - Aggiunto Cash flow previsionale in Fase 3
  - Aggiunte nuove tabelle database
  - Aggiornata roadmap con tempistiche
  - Aggiunto benchmark competitor

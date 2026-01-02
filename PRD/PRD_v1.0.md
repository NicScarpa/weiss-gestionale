# PRD - Sistema Gestionale Weiss Cafè

## Product Requirements Document
**Versione:** 1.0  
**Data:** 31 Dicembre 2025  
**Autore:** [Nome]  
**Stato:** Draft per revisione

---

## 1. Executive Summary

### 1.1 Panoramica
Sviluppo di una web application per la gestione contabile e amministrativa di **Weiss Cafè**, un cocktail bar con caffetteria situato a Sacile (PN). Il sistema sostituirà l'attuale gestione basata su fogli Excel, digitalizzando e automatizzando i processi di registrazione incassi, prima nota, e analisi finanziaria.

### 1.2 Obiettivi principali
1. **Digitalizzare** il processo di chiusura cassa giornaliera (attualmente cartaceo)
2. **Centralizzare** la gestione contabile di cassa e banca
3. **Automatizzare** calcoli, quadrature e report
4. **Predisporre** il sistema per gestione multi-sede (Villa Varda, Casette)

### 1.3 MVP - Minimum Viable Product (Fase 1)
1. Prima nota Cassa/Banca
2. Form digitale chiusura cassa giornaliera
3. Storico incassi e confronti temporali

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

### 2.4 Stakeholders
| Ruolo | Nome/Descrizione | Utilizzo sistema |
|-------|------------------|------------------|
| Titolare/Admin | Proprietario | Accesso completo, configurazioni |
| Manager | Collaboratrice fidata | Inserimento dati, report |
| Staff | Dipendenti turno | Compilazione chiusura cassa |

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
- **Responsive design**: Desktop-first, ma fruibile da mobile
- **Performance**: Caricamento pagine < 2s
- **Disponibilità**: 99.5% uptime
- **Backup**: Giornaliero automatico
- **Sicurezza**: HTTPS, password hashing, audit log

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

### 4.2 Relazioni ER (sintesi)

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
- Labor cost %
- F&B cost %

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

## 6. User Stories MVP

### 6.1 Epic: Chiusura cassa

```
US-001: Come staff di turno, voglio compilare la chiusura cassa da smartphone/tablet 
        così da non dover usare moduli cartacei.
        
        Criteri di accettazione:
        - Form responsive funzionante su mobile
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

### 6.2 Epic: Prima nota

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

### 6.3 Epic: Report

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

---

## 7. Wireframes e UI/UX

### 7.1 Layout generale

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

### 7.2 Form chiusura cassa (mobile-first)

```
┌───────────────────────────┐
│ ← Chiusura Cassa          │
│                           │
│ Data: [27/12/2025    ▼]   │
│ Meteo: [☀️ Sole       ▼]   │
│ Note: [________________]  │
│                           │
│ ═══ CASSA BAR ═══════════ │
│                           │
│ Corrispettivo  [1760.00]  │
│ IVA (auto)        160.00  │
│ Fatture        [_______]  │
│ Sospesi        [_______]  │
│ ─────────────────────────│
│ Contanti      [1355.50]   │
│ POS           [1618.90]   │
│ ─────────────────────────│
│ TOTALE          2974.40   │
│ Non battuto     1214.40 ⚠️│
│                           │
│ [+ Aggiungi cassa]        │
│                           │
│ ═══ PARZIALI ════════════ │
│ ...                       │
│                           │
│ ═══ LIQUIDITÀ ═══════════ │
│ ...                       │
│                           │
│ ═══ USCITE ══════════════ │
│ ...                       │
│                           │
│ ═══ PERSONALE ═══════════ │
│ ...                       │
│                           │
│ [Salva bozza] [Invia ✓]   │
└───────────────────────────┘
```

### 7.3 Prima nota - Desktop

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

---

## 8. Configurazioni e Impostazioni

### 8.1 Parametri globali

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `vat_rate_default` | 10% | Aliquota IVA predefinita |
| `cash_float_default` | 114.00 | Fondo cassa predefinito |
| `cash_difference_threshold` | 5.00 | Soglia alert differenza cassa |
| `currency` | EUR | Valuta |
| `date_format` | DD/MM/YYYY | Formato data |
| `decimal_separator` | , | Separatore decimali |

### 8.2 Configurazione sedi

Per ogni sede:
- Nome e codice
- Fondo cassa specifico
- Postazioni cassa disponibili
- Aliquote IVA (se diverse)
- Utenti abilitati

### 8.3 Template postazioni cassa

Postazioni predefinite configurabili:
- BAR (sempre presente)
- CASSA 1, CASSA 2, CASSA 3
- TAVOLI
- MARSUPIO
- ESTERNO

---

## 9. Integrazioni Future (Post-MVP)

### 9.1 Fatturazione elettronica
- **Sistema**: DATEV Koinos (portale commercialista)
- **Funzionalità**: Import automatico fatture passive
- **Priorità**: Alta

### 9.2 Agenzia delle Entrate
- **Sistema**: Cassetto fiscale AdE
- **Funzionalità**: Download fatture XML
- **Priorità**: Media

### 9.3 Home banking
- **Sistema**: RelaxBanking (Banca della Marca)
- **Funzionalità**: Import movimenti bancari
- **Priorità**: Media

### 9.4 Meteo
- **Sistema**: API meteo (OpenWeatherMap o simile)
- **Funzionalità**: Compilazione automatica meteo + temperatura
- **Priorità**: Bassa

### 9.5 AI Turni
- **Funzionalità**: Generazione automatica bozza turni
- **Input**: Parametri (copertura minima, preferenze, vincoli)
- **Output**: Proposta turni da revisionare
- **Priorità**: Fase 3

### 9.6 Magazzino/Inventario
- **Funzionalità**: Gestione stock, ordini, inventari
- **Priorità**: Fase 4

---

## 10. Piano di Rilascio

### Fase 1 - MVP (8-12 settimane)
1. Setup infrastruttura e database
2. Autenticazione e autorizzazione
3. Anagrafiche base (utenti, fornitori, piano conti)
4. Form chiusura cassa (giorno normale)
5. Prima nota cassa
6. Prima nota banca
7. Report base (incassi giornalieri, storico)

### Fase 2 - Consolidamento (4-6 settimane)
1. Form chiusura cassa eventi
2. Dashboard KPI avanzata
3. Alert e notifiche
4. Export/Import dati
5. Multi-sede

### Fase 3 - Integrazioni (6-8 settimane)
1. Import fatture DATEV
2. Import movimenti banca
3. API meteo
4. Scadenzario fornitori

### Fase 4 - Funzionalità avanzate (TBD)
1. AI generazione turni
2. Gestione magazzino
3. App mobile nativa (se necessaria)

---

## 11. Metriche di Successo

### 11.1 KPI tecnici
- Tempo caricamento pagine < 2s
- Uptime > 99.5%
- Zero perdita dati

### 11.2 KPI di adozione
- 100% chiusure cassa digitali entro 30 giorni dal rilascio
- Riduzione tempo data entry del 50%
- Zero errori di trascrizione

### 11.3 KPI di business
- Identificazione immediata differenze cassa
- Report disponibili in tempo reale
- Decisioni basate su dati aggiornati

---

## 12. Appendici

### A. Glossario

| Termine | Definizione |
|---------|-------------|
| Corrispettivo | Importo fiscalmente registrato (scontrinato) |
| Fondo cassa | Importo fisso lasciato in cassa per il cambio |
| Prima nota | Registro cronologico dei movimenti finanziari |
| QMD | "Quella Maledetta Domenica" - evento domenicale |
| Sospeso | Conto aperto, pagamento differito |
| Extra | Collaboratore occasionale pagato a ore/forfait |

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
| BUDGET 25 | Report costi/KPI |
| BILANCIO 25 | Piano dei conti |
| SCADENZARIO | (Fase 3) Scadenzario |
| ORE MESE | Presenze da chiusure |
| TURNI WEISS | (Fase 3) Gestione turni |

---

## 13. Note per lo sviluppatore

### 13.1 Priorità implementazione

1. **Database schema** - Iniziare dal modello dati completo
2. **Auth system** - Fondamentale per tutto il resto
3. **Anagrafiche** - Prerequisito per le funzionalità core
4. **Form chiusura cassa** - Core del sistema
5. **Prima nota** - Collegata alle chiusure
6. **Report** - Consumano i dati inseriti

### 13.2 Attenzione particolare a

- **Calcoli decimali**: Usare DECIMAL, non FLOAT
- **Timezone**: Tutto in Europe/Rome
- **Audit trail**: Loggare chi fa cosa e quando
- **Backup**: Strategia robusta fin dall'inizio
- **Mobile UX**: Il form chiusura deve essere perfetto su mobile

### 13.3 Test cases critici

1. Chiusura con differenza cassa
2. Chiusura evento multi-cassa
3. Versamento cassa → banca
4. Generazione automatica movimenti
5. Calcolo KPI con dati parziali
6. Confronto YoY con giorni lavorativi diversi

---

*Fine documento PRD v1.0*

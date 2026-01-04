# Specifiche Tecniche: Sezione Budget
## Sistema Gestionale Weiss Cafè

**Versione:** 1.0  
**Data:** 4 Gennaio 2026  
**Basato su:** Analisi del foglio "BUDGET 25" del file Contabilità.xlsx

---

## 1. Panoramica Strutturale

La sezione Budget è un cruscotto finanziario mensile che aggrega dati dalla Prima Nota (CASSA e BANCA) e li presenta in una vista strutturata per categoria di costo/ricavo, con calcolo automatico di percentuali e totali.

### 1.1 Principio Fondamentale: Raggruppamenti User-Defined

**IMPORTANTE:** I raggruppamenti delle voci di budget sono completamente personalizzabili dall'utente. 

Il sistema NON ha categorie predefinite hardcoded. L'utente:
- **Crea** le proprie macro-categorie (es. "Costi Personale", "Food Cost", "Spese Fisse")
- **Organizza** sottocategorie a piacimento (es. sotto "Costi Personale" → "Fissi", "Extra", "Pulizie")
- **Associa** i conti del piano dei conti alle categorie desiderate tramite drag & drop
- **Definisce** benchmark di riferimento per ogni categoria (es. "Costi Personale < 30%")
- **Riordina** le categorie secondo le proprie preferenze di visualizzazione

Questa flessibilità permette di adattare il budget alle specifiche esigenze di ogni attività.

### 1.2 Struttura Temporale
- **Granularità:** Mensile (Gennaio - Dicembre)
- **Ogni mese ha DUE colonne:**
  - Colonna valore assoluto (€)
  - Colonna percentuale (% su ricavi del mese)
- **Colonna finale:** TOTALE annuale

### 1.3 Layout Colonne Database

```
| Etichetta | GEN_valore | GEN_pct | FEB_valore | FEB_pct | ... | DIC_valore | DIC_pct | TOTALE |
```

---

## 2. Riferimento: Struttura Excel Originale

**NOTA:** Questa sezione documenta la struttura del foglio BUDGET 25 originale come **riferimento**. L'utente può replicare questa struttura o crearne una completamente diversa.

La struttura seguente è fornita come esempio e può essere usata come template iniziale.

### 2.1 KPI DI SISTEMA (Sempre Presenti)

Queste voci sono calcolate automaticamente dal sistema e non possono essere eliminate:

| Campo | Descrizione | Formula/Origine |
|-------|-------------|-----------------|
| `BUDGET` | Obiettivo di fatturato mensile | Input manuale dall'utente |
| `RICAVI` | Totale ricavi del mese | Somma conti categorizzati come "revenue" |
| `COSTI TOTALI` | Totale costi del mese | Somma di tutte le categorie di tipo "cost" |
| `UTILE` | Risultato operativo | RICAVI - COSTI TOTALI |
| `LIQUIDITÀ` | Saldo cassa + banca | Riferimento a saldi Prima Nota |

### 2.2 Esempio Categorie dall'Excel Originale

Le seguenti categorie sono quelle usate nell'Excel "BUDGET 25" e possono servire come template:

#### Costi Personale (Benchmark suggerito: 30%)
- Costo personale (dipendenti fissi sera)
- Costo personale EXTRA
- Costo personale MATTINA
- Pulizie
- Sicurezza
- TFR, F24 e altri costi

#### Materie Prime (Benchmark suggerito: 35%)
- Materie Prime (acquisti produzione)
- Mat. di consumo, cancelleria e pulizia
- Acquisto di beni e attrezzatura

#### Costi Amministrativi
- Affitti e utenze (ufficio)
- Materiale di consumo (ufficio)
- Retribuzione personale (ufficio)
- Acquisto beni e attrezzatura (ufficio)

#### Godimento Beni di Terzi
- Leasing & Affitti
- ILIA & TARI
- Spese Condominiali

#### Costi per Servizi
- Energia
- Demanio Idrico
- Commercialista
- Consulente del lavoro
- Telefonia
- Leasing Strumentali
- Assicurazione
- Servizi di vigilanza
- Servizi fotografici & Social
- Costi per consulenze
- Costi di manutenzione
- Spese per eventi
- Altri costi per servizi
- Oneri diversi di gestione
- Oneri finanziari
- Commissioni bancarie

#### Altre Categorie
- Imposte e Tasse
- Investimenti
- IVA (a credito, a debito, saldo)

---

## 3. Modello Dati Proposto

### 3.1 Tabella: `budget_targets`

```sql
CREATE TABLE budget_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_revenue DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(venue_id, year, month)
);
```

### 3.2 Tabella: `budget_categories` (User-Defined)

**IMPORTANTE:** I raggruppamenti sono completamente personalizzabili dall'utente. L'utente può creare, modificare, eliminare categorie e decidere liberamente quali conti del piano dei conti associare a ciascuna categoria.

```sql
CREATE TABLE budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id),  -- Ogni sede può avere raggruppamenti diversi
  code VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id UUID REFERENCES budget_categories(id) ON DELETE CASCADE,  -- Per sottocategorie
  display_order INTEGER NOT NULL DEFAULT 0,
  category_type VARCHAR(20) NOT NULL CHECK (category_type IN ('revenue', 'cost', 'kpi', 'tax', 'investment', 'vat')),
  color VARCHAR(7),  -- Colore HEX per visualizzazione (es. #FF5733)
  icon VARCHAR(50),  -- Nome icona opzionale (es. "users", "shopping-cart")
  benchmark_percentage DECIMAL(5,2),  -- Soglia di allarme opzionale
  benchmark_comparison VARCHAR(10) CHECK (benchmark_comparison IN ('lt', 'lte', 'gt', 'gte', 'eq')),  -- Tipo confronto
  description TEXT,  -- Note/descrizione della categoria
  is_system BOOLEAN DEFAULT false,  -- true per categorie di sistema non eliminabili (RICAVI, COSTI, etc.)
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(venue_id, code)
);

-- Indici per performance
CREATE INDEX idx_budget_categories_venue ON budget_categories(venue_id);
CREATE INDEX idx_budget_categories_parent ON budget_categories(parent_id);
CREATE INDEX idx_budget_categories_order ON budget_categories(venue_id, display_order);
```

### 3.2.1 Categorie di Sistema (Seed Iniziale)

Solo le categorie di sistema essenziali vengono create automaticamente. L'utente crea tutte le altre.

```sql
-- Categorie di sistema (is_system = true, non eliminabili)
INSERT INTO budget_categories (venue_id, code, name, display_order, category_type, is_system) VALUES
('{venue_id}', 'BUDGET_TARGET', 'Budget Target', 1, 'kpi', true),
('{venue_id}', 'RICAVI', 'Ricavi', 2, 'revenue', true),
('{venue_id}', 'COSTI_TOTALI', 'Totale Costi', 3, 'cost', true),
('{venue_id}', 'UTILE', 'Utile Operativo', 4, 'kpi', true),
('{venue_id}', 'LIQUIDITA', 'Liquidità', 5, 'kpi', true),
('{venue_id}', 'IVA_SALDO', 'Saldo IVA', 6, 'vat', true);

-- Le categorie utente (es. "Costi Personale", "Materie Prime") vengono create dall'utente
-- attraverso l'interfaccia di configurazione
```

### 3.2.2 Logica Categorie User-Defined

**Principi:**
1. L'utente crea macro-categorie (es. "Costi Personale", "Food Cost", "Spese Fisse")
2. Opzionalmente crea sotto-categorie (es. sotto "Costi Personale" → "Fissi", "Extra", "Pulizie")
3. Associa i conti del piano dei conti alle categorie (foglia o macro)
4. Il sistema aggrega automaticamente i dati in base alle associazioni
5. Le macro-categorie mostrano la somma delle sotto-categorie + eventuali conti direttamente associati

**Esempio struttura utente:**
```
📁 Costi Personale (macro, benchmark: 30%)
   ├── 👤 Dipendenti Fissi
   │     └── [Conto: Retribuzione personale SERA]
   │     └── [Conto: Retribuzione personale MATTINA]
   ├── 👤 Collaboratori Extra  
   │     └── [Conto: Retribuzione personale EXTRA]
   │     └── [Conto: Retribuzione personale EXTRA MATTINA]
   ├── 🧹 Pulizie
   │     └── [Conto: Retribuzione del personale PULIZIE]
   └── 📋 Contributi e TFR
         └── [Conto: TFR]
         └── [Conto: F24]
         └── [Conto: INPS]

📁 Food & Beverage Cost (macro, benchmark: 35%)
   ├── 🍷 Bevande
   │     └── [Conto: Acquisto di vino]
   │     └── [Conto: Acquisto beni per produzione di servizi]
   ├── ☕ Caffetteria
   │     └── [Conto: Acquisto di caffè]
   └── 🍕 Alimentari
         └── [Conto: Acquisto di beni alimentari]
         └── [Conto: Acquisto di frutta]
```

### 3.3 Tabella: `account_budget_mapping` (User-Defined)

L'utente decide quali conti associare a quali categorie budget.

```sql
CREATE TABLE account_budget_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  budget_category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Un conto può appartenere a UNA SOLA categoria budget
  UNIQUE(account_id)
);

CREATE INDEX idx_account_budget_mapping_category ON account_budget_mapping(budget_category_id);
CREATE INDEX idx_account_budget_mapping_account ON account_budget_mapping(account_id);
```

### 3.3.1 Vista: Conti Non Assegnati

```sql
-- Mostra i conti del piano dei conti non ancora assegnati a nessuna categoria budget
CREATE VIEW v_unassigned_accounts AS
SELECT a.*
FROM accounts a
LEFT JOIN account_budget_mapping abm ON a.id = abm.account_id
WHERE abm.id IS NULL
  AND a.is_active = true
ORDER BY a.type, a.name;
```

### 3.4 Vista: `v_budget_monthly` (Aggregazione Dinamica)

```sql
CREATE VIEW v_budget_monthly AS
WITH RECURSIVE category_tree AS (
  -- Categorie radice (senza parent)
  SELECT 
    id,
    venue_id,
    code,
    name,
    parent_id,
    display_order,
    category_type,
    benchmark_percentage,
    1 AS level,
    ARRAY[display_order] AS path
  FROM budget_categories
  WHERE parent_id IS NULL AND is_active = true
  
  UNION ALL
  
  -- Sottocategorie ricorsive
  SELECT 
    bc.id,
    bc.venue_id,
    bc.code,
    bc.name,
    bc.parent_id,
    bc.display_order,
    bc.category_type,
    bc.benchmark_percentage,
    ct.level + 1,
    ct.path || bc.display_order
  FROM budget_categories bc
  JOIN category_tree ct ON bc.parent_id = ct.id
  WHERE bc.is_active = true
),
monthly_category_amounts AS (
  SELECT 
    ct.venue_id,
    ct.id AS category_id,
    EXTRACT(YEAR FROM je.date)::INTEGER AS year,
    EXTRACT(MONTH FROM je.date)::INTEGER AS month,
    SUM(COALESCE(je.credit_amount, 0) - COALESCE(je.debit_amount, 0)) AS amount
  FROM category_tree ct
  JOIN account_budget_mapping abm ON abm.budget_category_id = ct.id
  JOIN journal_entries je ON je.account_id = abm.account_id AND je.venue_id = ct.venue_id
  GROUP BY ct.venue_id, ct.id, EXTRACT(YEAR FROM je.date), EXTRACT(MONTH FROM je.date)
),
monthly_revenue AS (
  SELECT 
    venue_id, 
    year, 
    month, 
    SUM(amount) AS revenue
  FROM monthly_category_amounts mca
  JOIN budget_categories bc ON mca.category_id = bc.id
  WHERE bc.category_type = 'revenue'
  GROUP BY venue_id, year, month
)
SELECT 
  ct.venue_id,
  ct.id AS category_id,
  ct.code AS category_code,
  ct.name AS category_name,
  ct.parent_id,
  ct.level,
  ct.path,
  ct.display_order,
  ct.category_type,
  ct.benchmark_percentage,
  mca.year,
  mca.month,
  COALESCE(mca.amount, 0) AS amount,
  CASE 
    WHEN mr.revenue > 0 THEN ABS(COALESCE(mca.amount, 0)) / mr.revenue * 100
    ELSE 0 
  END AS percentage_of_revenue,
  bt.target_revenue AS budget_target
FROM category_tree ct
LEFT JOIN monthly_category_amounts mca ON ct.id = mca.category_id
LEFT JOIN monthly_revenue mr ON ct.venue_id = mr.venue_id 
  AND mca.year = mr.year 
  AND mca.month = mr.month
LEFT JOIN budget_targets bt ON ct.venue_id = bt.venue_id 
  AND mca.year = bt.year 
  AND mca.month = bt.month
ORDER BY ct.path;
```

---

## 4. API Endpoints

### 4.1 Gestione Categorie Budget (CRUD)

#### POST `/api/budget/categories`
Crea una nuova categoria budget.

**Request:**
```json
{
  "venue_id": "uuid",
  "name": "Costi Personale",
  "code": "COSTI_PERS",
  "parent_id": null,
  "category_type": "cost",
  "display_order": 10,
  "benchmark_percentage": 30.00,
  "benchmark_comparison": "lte",
  "color": "#3B82F6",
  "icon": "users",
  "description": "Tutti i costi relativi al personale"
}
```

**Response:**
```json
{
  "id": "uuid",
  "venue_id": "uuid",
  "name": "Costi Personale",
  "code": "COSTI_PERS",
  "parent_id": null,
  "category_type": "cost",
  "display_order": 10,
  "benchmark_percentage": 30.00,
  "is_system": false,
  "created_at": "2025-01-04T10:00:00Z"
}
```

#### GET `/api/budget/categories/{venue_id}`
Restituisce l'albero completo delle categorie con i conti associati.

**Response:**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Costi Personale",
      "code": "COSTI_PERS",
      "category_type": "cost",
      "benchmark_percentage": 30.00,
      "accounts_count": 5,
      "children": [
        {
          "id": "uuid",
          "name": "Dipendenti Fissi",
          "accounts": [
            {"id": "uuid", "code": "601001", "name": "Retribuzione personale SERA"},
            {"id": "uuid", "code": "601002", "name": "Retribuzione personale MATTINA"}
          ],
          "children": []
        }
      ]
    }
  ],
  "unassigned_accounts": [
    {"id": "uuid", "code": "609999", "name": "Conto non categorizzato"}
  ]
}
```

#### PUT `/api/budget/categories/{id}`
Modifica una categoria esistente.

#### DELETE `/api/budget/categories/{id}`
Elimina una categoria (solo se non è di sistema e non ha sottocategorie).

#### PUT `/api/budget/categories/reorder`
Riordina le categorie via drag & drop.

**Request:**
```json
{
  "venue_id": "uuid",
  "order": [
    {"id": "uuid1", "display_order": 1, "parent_id": null},
    {"id": "uuid2", "display_order": 2, "parent_id": null},
    {"id": "uuid3", "display_order": 1, "parent_id": "uuid1"}
  ]
}
```

### 4.2 Gestione Mapping Conti → Categorie

#### POST `/api/budget/categories/{category_id}/accounts`
Associa uno o più conti a una categoria.

**Request:**
```json
{
  "account_ids": ["uuid1", "uuid2", "uuid3"]
}
```

#### DELETE `/api/budget/categories/{category_id}/accounts/{account_id}`
Rimuove l'associazione di un conto da una categoria.

#### PUT `/api/budget/accounts/{account_id}/move`
Sposta un conto da una categoria a un'altra.

**Request:**
```json
{
  "from_category_id": "uuid_old",
  "to_category_id": "uuid_new"
}
```

### 4.3 GET `/api/budget/{venue_id}/{year}`

Restituisce il budget completo per un anno con struttura dinamica basata sulle categorie utente.

**Response:**
```json
{
  "venue_id": "uuid",
  "year": 2025,
  "months": {
    "1": {
      "budget_target": 60000,
      "revenue": 64790.96,
      "costs": -43358.54,
      "profit": 21432.42,
      "categories": [
        {
          "code": "COSTI_PERSONALE",
          "name": "Costi Personale",
          "amount": 15593.08,
          "percentage": 24.07,
          "benchmark": 30.00,
          "status": "ok",
          "subcategories": [...]
        }
      ]
    }
  },
  "totals": {
    "budget_target": 870000,
    "revenue": 734081.72,
    "costs": -731403.56,
    "profit": 2678.16
  }
}
```

### 4.2 PUT `/api/budget/{venue_id}/{year}/{month}/target`

Aggiorna il budget target mensile.

**Request:**
```json
{
  "target_revenue": 75000
}
```

### 4.3 GET `/api/budget/{venue_id}/comparison`

Confronto anno corrente vs precedente.

---

## 5. Componenti React

### 5.1 `BudgetDashboard.tsx`

```typescript
interface BudgetDashboardProps {
  venueId: string;
  year: number;
}

// Visualizza:
// - KPI cards in cima (Budget, Ricavi, Costi, Utile, Liquidità)
// - Tabella mensile con tutte le categorie USER-DEFINED
// - Colonna TOTALE a destra
// - Percentuali colorate (verde < benchmark, rosso > benchmark)
// - Grafici di trend opzionali
// - Pulsante "Configura Categorie" per accedere all'editor
```

### 5.2 `BudgetCategoryRow.tsx`

```typescript
interface BudgetCategoryRowProps {
  category: BudgetCategory;
  monthlyData: MonthlyBudgetData[];
  total: number;
  level: number;  // Per indentazione visiva
  isExpanded?: boolean;
  onToggle?: () => void;
}

// - Righe espandibili per categorie con sottocategorie
// - Indentazione visiva basata sul livello (level)
// - Icona e colore personalizzati dalla categoria
// - Formattazione valuta italiana (€ 1.234,56)
// - Percentuali con 2 decimali
// - Indicatore visivo vs benchmark (icona warning se superato)
```

### 5.3 `BudgetTargetEditor.tsx`

```typescript
// Modale per editare i target mensili
// Input per 12 mesi con calcolo automatico totale
```

### 5.4 `BudgetCategoryManager.tsx` (NUOVO - Configurazione Raggruppamenti)

```typescript
interface BudgetCategoryManagerProps {
  venueId: string;
  onSave: () => void;
}

// Editor completo per gestire i raggruppamenti budget
// Layout a due colonne:
// - Sinistra: Albero categorie (drag & drop per riordinare)
// - Destra: Lista conti non assegnati

// Funzionalità:
// - Creare nuova categoria (macro o sotto-categoria)
// - Modificare nome, colore, icona, benchmark
// - Eliminare categoria (con conferma, solo se vuota o sposta conti)
// - Drag & drop conti da "non assegnati" alle categorie
// - Drag & drop conti tra categorie diverse
// - Drag & drop per riordinare categorie
// - Espandere/collassare sottocategorie
// - Ricerca conti per nome/codice
```

**Wireframe BudgetCategoryManager:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Configura Raggruppamenti Budget                              [✕ Chiudi]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [+ Nuova Categoria]                          🔍 Cerca conti...         │
│                                                                         │
│  ┌─────────────────────────────┐   ┌─────────────────────────────────┐ │
│  │ CATEGORIE BUDGET            │   │ CONTI NON ASSEGNATI (12)        │ │
│  │                             │   │                                  │ │
│  │ 📁 Costi Personale (30%) ▼  │   │ ☐ 601099 - Altro personale      │ │
│  │   ├── 👤 Dipendenti Fissi   │   │ ☐ 602001 - Acquisto generico    │ │
│  │   │     └── Retrib. SERA    │   │ ☐ 609001 - Spese varie          │ │
│  │   │     └── Retrib. MATTINA │   │ ☐ 701001 - Ricavi extra         │ │
│  │   ├── 👤 Extra              │   │ ...                              │ │
│  │   └── 🧹 Pulizie            │   │                                  │ │
│  │ 📁 Food Cost (35%) ▼        │   │ [Assegna selezionati →]          │ │
│  │   ├── 🍷 Bevande            │   │                                  │ │
│  │   └── ☕ Caffetteria        │   └─────────────────────────────────┘ │
│  │ 📁 Spese Fisse ▼            │                                       │
│  │   └── 🏠 Affitto            │   ℹ️ Trascina i conti sulle          │
│  │                             │      categorie per assegnarli        │
│  └─────────────────────────────┘                                       │
│                                                                         │
│  [Salva Configurazione]                    [Annulla]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.5 `CategoryEditModal.tsx`

```typescript
interface CategoryEditModalProps {
  category?: BudgetCategory;  // undefined per nuova categoria
  parentId?: string;  // per creare sottocategoria
  venueId: string;
  onSave: (category: BudgetCategory) => void;
  onClose: () => void;
}

// Form per creare/modificare una categoria:
// - Nome categoria (obbligatorio)
// - Codice (auto-generato da nome, modificabile)
// - Categoria padre (select, opzionale)
// - Tipo (ricavo/costo/altro)
// - Colore (color picker)
// - Icona (icon picker da set predefinito)
// - Benchmark % (opzionale)
// - Tipo confronto benchmark (minore di, maggiore di, etc.)
// - Descrizione (textarea opzionale)
```

### 5.6 `AccountDragItem.tsx`

```typescript
interface AccountDragItemProps {
  account: Account;
  isDragging: boolean;
  onRemove?: () => void;  // Per rimuovere da categoria corrente
}

// Componente draggabile per singolo conto
// Mostra: codice, nome, tipo
// Icona drag handle a sinistra
// Pulsante rimuovi (×) se già assegnato
```

---

## 6. Logica di Aggregazione

### 6.1 Calcolo Ricavi

```typescript
const calculateRevenue = async (venueId: string, year: number, month: number) => {
  const revenueAccounts = ['Corrispettivi', 'Ricavi EVENTI', 'Proventi vari'];
  
  return await db.journalEntry.aggregate({
    _sum: { debit_amount: true },
    where: {
      venue_id: venueId,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1)
      },
      account: {
        name: { in: revenueAccounts }
      }
    }
  });
};
```

### 6.2 Calcolo Costi per Categoria

```typescript
const calculateCategoryCosts = async (
  venueId: string, 
  year: number, 
  month: number,
  categoryCode: string
) => {
  // Recupera tutti i conti mappati alla categoria
  const mappings = await db.accountBudgetMapping.findMany({
    where: { budget_category_code: categoryCode },
    include: { account: true }
  });
  
  const accountIds = mappings.map(m => m.account_id);
  
  // Somma i movimenti
  const result = await db.journalEntry.aggregate({
    _sum: { 
      credit_amount: true  // I costi sono in AVERE nella prima nota cassa
    },
    where: {
      venue_id: venueId,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1)
      },
      account_id: { in: accountIds }
    }
  });
  
  return result._sum.credit_amount || 0;
};
```

---

## 7. Indicazioni Implementative

### 7.1 Priorità Sviluppo

1. **Prima:** Tabella `budget_categories` con supporto gerarchico e `account_budget_mapping`
2. **Seconda:** API CRUD per gestione categorie
3. **Terza:** Componente `BudgetCategoryManager` (editor raggruppamenti)
4. **Quarta:** Vista SQL per aggregazione dinamica
5. **Quinta:** API endpoint GET budget con struttura dinamica
6. **Sesta:** Componente tabella budget (`BudgetDashboard`)
7. **Settima:** Editor target budget
8. **Ottava:** Grafici e comparazioni

### 7.2 Attenzione Particolare

- **Raggruppamenti User-Defined:** Il sistema NON deve avere categorie hardcoded. L'utente crea tutto da zero (eccetto i KPI di sistema)
- **Conti non assegnati:** Mostrare sempre i conti non ancora categorizzati con warning visivo
- **Gerarchia ricorsiva:** Supportare N livelli di sottocategorie (consigliato max 3)
- **Drag & Drop:** Implementare con libreria robusta (es. @dnd-kit/core per React)
- **Segno importi:** I costi sono positivi nella vista budget ma negativi nel totale
- **IVA:** Gestita separatamente, non inclusa nei costi operativi
- **Percentuali:** Sempre calcolate sui RICAVI del mese corrispondente
- **Arrotondamenti:** 2 decimali per valute, 2 decimali per percentuali
- **Timezone:** Europe/Rome per tutte le date
- **Multi-sede:** Ogni sede ha i propri raggruppamenti indipendenti

### 7.3 Vincoli Logici

```typescript
// Un conto può appartenere a UNA SOLA categoria
// Le categorie di sistema (is_system=true) non possono essere eliminate
// Non si può eliminare una categoria con sottocategorie (prima svuotarla)
// Non si può eliminare una categoria con conti assegnati (prima spostarli)
// L'ordine di visualizzazione (display_order) è per livello (siblings)
```

### 7.4 Wizard Prima Configurazione

Al primo accesso alla sezione Budget, se non esistono categorie user-defined:

1. **Mostrare wizard di configurazione:**
   - "Benvenuto! Configura i tuoi raggruppamenti di budget"
   - Opzione A: "Usa template predefinito" (carica struttura esempio)
   - Opzione B: "Inizia da zero" (vai all'editor vuoto)

2. **Template predefinito (opzionale):**
```typescript
const defaultTemplate = [
  { name: "Costi Personale", benchmark: 30, children: [
    { name: "Dipendenti Fissi" },
    { name: "Collaboratori Extra" },
    { name: "Pulizie" },
    { name: "TFR e Contributi" }
  ]},
  { name: "Food & Beverage Cost", benchmark: 35, children: [
    { name: "Bevande" },
    { name: "Alimentari" },
    { name: "Caffetteria" }
  ]},
  { name: "Costi Struttura", children: [
    { name: "Affitto" },
    { name: "Utenze" },
    { name: "Manutenzioni" }
  ]},
  { name: "Costi Servizi", children: [
    { name: "Consulenze" },
    { name: "Marketing" },
    { name: "Assicurazioni" }
  ]},
  { name: "Spese Eventi" }
];
```

### 7.5 Test Cases Critici

1. Creazione categoria senza conti (deve mostrare € 0)
2. Spostamento conto da una categoria all'altra (dati storici ricalcolati)
3. Eliminazione categoria con verifica vincoli
4. Mese senza ricavi (divisione per zero nelle percentuali)
5. Categoria senza movimenti (mostrare € 0, non nascondere)
6. Cambio anno con dati parziali
7. Confronto YoY con struttura categorie cambiata nel tempo
8. Export Excel con struttura dinamica
9. Riordinamento categorie via drag & drop
10. Creazione sottocategoria multi-livello (3+ livelli)

---

## 8. Esempio Output Atteso

**Nota:** La struttura delle categorie nell'esempio è puramente indicativa. L'utente può creare raggruppamenti completamente diversi.

**Esempio con raggruppamenti personalizzati dall'utente:**

| Categoria | GEN | % | FEB | % | ... | TOTALE |
|-----------|-----|---|-----|---|-----|--------|
| **BUDGET** | 60.000 | - | 60.000 | - | ... | 870.000 |
| **RICAVI** | 64.791 | 100% | 46.593 | 100% | ... | 734.082 |
| **COSTI TOTALI** | -43.359 | 66,9% | -44.435 | 95,4% | ... | -731.404 |
| 📁 Staff & Collaboratori ⚠️ | 15.593 | 24,1% | 13.876 | 29,8% | ... | 219.358 |
| └ 👤 Team Fisso | 8.717 | 13,5% | 7.843 | 16,8% | ... | 123.690 |
| └ 👤 Collaboratori | 3.460 | 5,3% | 3.065 | 6,6% | ... | 36.393 |
| └ 🧹 Servizi Pulizia | 140 | 0,2% | 188 | 0,4% | ... | 5.589 |
| └ 📋 Contributi | 3.276 | 5,1% | 2.780 | 6,0% | ... | 53.686 |
| 📁 Food & Beverage | 13.585 | 21,0% | 15.498 | 33,3% | ... | 308.547 |
| └ 🍷 Bevande | 8.200 | 12,7% | 9.100 | 19,5% | ... | 185.000 |
| └ ☕ Caffetteria | 2.500 | 3,9% | 2.800 | 6,0% | ... | 55.000 |
| └ 🍕 Alimentari | 2.885 | 4,5% | 3.598 | 7,7% | ... | 68.547 |
| 📁 Struttura | 7.480 | 11,5% | 5.315 | 11,4% | ... | 66.570 |
| 📁 Servizi Professionali | 2.100 | 3,2% | 2.500 | 5,4% | ... | 32.000 |
| 📁 Eventi & Marketing | 4.632 | 7,1% | 5.771 | 12,4% | ... | 45.840 |
| ... | ... | ... | ... | ... | ... | ... |

**Legenda:**
- ⚠️ = Categoria sopra il benchmark impostato dall'utente
- 📁 = Macro-categoria (espandibile)
- └ = Sottocategoria
- Icone personalizzabili dall'utente

---

*Fine Specifiche Budget v1.0*

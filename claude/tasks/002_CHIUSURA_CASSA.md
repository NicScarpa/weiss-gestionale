# Task 002: Chiusura Cassa

## Obiettivo
Implementare il form di chiusura cassa giornaliera con conteggio contanti, calcoli automatici e workflow di validazione.

---

## Piano di Implementazione

### Fase 1: API e Tipi (Step 1-3)

#### Step 1: Types e Validazione Zod
- Definire tipi TypeScript per DailyClosure, CashStation, CashCount
- Schema Zod per validazione form
- Costanti (tagli banconote/monete, fondo cassa €114)

#### Step 2: API Routes - Lettura
- `GET /api/chiusure` - Lista chiusure con filtri
- `GET /api/chiusure/[id]` - Dettaglio singola chiusura
- `GET /api/venues/[id]/cash-stations` - Template postazioni per sede

#### Step 3: API Routes - Scrittura
- `POST /api/chiusure` - Crea nuova chiusura (DRAFT)
- `PUT /api/chiusure/[id]` - Aggiorna chiusura
- `POST /api/chiusure/[id]/submit` - Invia per validazione
- `POST /api/chiusure/[id]/validate` - Valida (solo manager/admin)

### Fase 2: Componenti UI (Step 4-7)

#### Step 4: CashCountGrid Component
- Griglia conteggio banconote (€500, €200, €100, €50, €20, €10, €5)
- Griglia conteggio monete (€2, €1, €0.50, €0.20, €0.10, €0.05, €0.01)
- Input quantità con calcolo totale real-time
- Touch-friendly (min 44x44px)

#### Step 5: CashStationCard Component
- Card per ogni postazione (BAR, CASSA 1-3, TAVOLI, MARSUPIO)
- Integra CashCountGrid
- Mostra totale postazione
- Expand/collapse per mobile

#### Step 6: Form Chiusura Completo
- Selezione data
- Sezione postazioni cassa
- Sezione parziali orari (16:00, 21:00)
- Sezione uscite giornaliere
- Sezione presenze staff
- Sezione versamento banca
- Riepilogo con calcoli

#### Step 7: Calcoli Automatici
- Totale lordo (somma postazioni)
- IVA 10%
- Totale netto
- Totale uscite
- Fondo cassa (€114 default)
- Differenza cassa (con alert se > €5)

### Fase 3: Pagine e Workflow (Step 8-10)

#### Step 8: Pagina Lista Chiusure
- Tabella con filtri (data, stato, sede)
- Badge stato (DRAFT, SUBMITTED, VALIDATED)
- Azioni rapide (modifica, visualizza, elimina)

#### Step 9: Pagina Nuova Chiusura
- Form wizard multi-step o single page scrollable
- Salvataggio automatico draft
- Validazione real-time

#### Step 10: Workflow e Prima Nota
- Transizioni stato con permessi
- Generazione automatica movimenti prima nota su VALIDATED
- Notifiche toast

---

## Struttura Dati

### Tagli Contanti
```typescript
const BILL_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5]
const COIN_DENOMINATIONS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.01]
```

### Postazioni Default (Weiss Cafè)
- BAR
- CASSA 1
- CASSA 2
- CASSA 3
- TAVOLI
- MARSUPIO
- POS (solo lettura da scontrini)

### Stati Chiusura
- `DRAFT` - Bozza modificabile
- `SUBMITTED` - Inviata per validazione
- `VALIDATED` - Validata e registrata in prima nota

---

## Checklist

- [x] Step 1: Types e validazione Zod
- [ ] Step 2: API lettura
- [ ] Step 3: API scrittura
- [ ] Step 4: CashCountGrid component
- [ ] Step 5: CashStationCard component
- [ ] Step 6: Form chiusura completo
- [ ] Step 7: Calcoli automatici
- [ ] Step 8: Pagina lista chiusure
- [ ] Step 9: Pagina nuova chiusura
- [ ] Step 10: Workflow e prima nota

---

## Progress Log

### 2 Gennaio 2026
- Piano creato
- **Step 1 COMPLETATO**: Types e validazione Zod
  - `src/lib/constants.ts` - Costanti (tagli, default, formattatori)
  - `src/types/chiusura-cassa.ts` - Tipi TypeScript completi
  - `src/lib/validations/chiusura-cassa.ts` - Schema Zod per form
  - `src/lib/calculations.ts` - Utility calcoli con Decimal.js

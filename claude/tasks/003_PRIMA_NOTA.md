# Task 003: Prima Nota

## Obiettivo
Implementare il sistema di Prima Nota (registri contabili cassa e banca) con movimenti manuali, automatici da chiusure validate, e saldi progressivi.

---

## Piano di Implementazione

### Fase 1: API e Tipi (Step 1-3)

#### Step 1: Types e Validazione Zod
- Definire tipi TypeScript per JournalEntry, RegisterBalance
- Schema Zod per validazione movimenti
- Costanti (tipi registro, tipi movimento)

#### Step 2: API Routes - Lettura
- `GET /api/prima-nota` - Lista movimenti con filtri (registro, data, tipo)
- `GET /api/prima-nota/[id]` - Dettaglio movimento
- `GET /api/prima-nota/saldi` - Saldi attuali registri
- `GET /api/prima-nota/saldi/storico` - Storico saldi

#### Step 3: API Routes - Scrittura
- `POST /api/prima-nota` - Crea movimento manuale
- `PUT /api/prima-nota/[id]` - Modifica movimento
- `DELETE /api/prima-nota/[id]` - Elimina movimento
- `POST /api/prima-nota/versamento` - Versamento cassa→banca

### Fase 2: Componenti UI (Step 4-6)

#### Step 4: JournalEntryForm Component
- Form per inserimento movimento
- Selezione registro (CASSA/BANCA)
- Tipo movimento (INCASSO/USCITA/VERSAMENTO/PRELIEVO)
- Importo, data, descrizione, riferimenti

#### Step 5: JournalEntryTable Component
- Tabella movimenti con saldo progressivo
- Filtri per registro, periodo, tipo
- Colonne: Data, Descrizione, Dare, Avere, Saldo
- Colorazione per tipo movimento

#### Step 6: RegisterBalanceCards Component
- Card riepilogative saldi
- Saldo cassa attuale
- Saldo banca attuale
- Totale disponibile

### Fase 3: Pagine e Integrazione (Step 7-9)

#### Step 7: Pagina Prima Nota Cassa
- Lista movimenti registro CASH
- Form inserimento manuale
- Saldo progressivo

#### Step 8: Pagina Prima Nota Banca
- Lista movimenti registro BANK
- Form inserimento manuale
- Riconciliazione (futuro)

#### Step 9: Integrazione Chiusure
- Generazione automatica movimenti su validazione chiusura
- Movimento incasso giornaliero (DARE cassa)
- Movimenti uscite (AVERE cassa)
- Movimento versamento banca (se presente)

### Fase 4: Report e Funzionalità Avanzate (Step 10)

#### Step 10: Report e Esportazione
- Report movimenti per periodo
- Esportazione CSV/Excel
- Stampa giornale

---

## Struttura Dati

### Tipi Registro
```typescript
type RegisterType = 'CASH' | 'BANK'
```

### Tipi Movimento
```typescript
type EntryType = 'INCASSO' | 'USCITA' | 'VERSAMENTO' | 'PRELIEVO' | 'GIROCONTO'
```

### Movimento Prima Nota
```typescript
interface JournalEntry {
  id: string
  registerType: RegisterType
  entryType: EntryType
  date: Date
  amount: Decimal
  description: string
  reference?: string           // Rif. documento
  closureId?: string           // Link a chiusura
  accountId?: string           // Conto contabile
  counterpartRegister?: string // Per giroconti
  runningBalance?: Decimal     // Saldo progressivo (calcolato)
}
```

---

## Regole di Business

### Segno Movimenti
- **CASSA**:
  - INCASSO → Dare (+)
  - USCITA → Avere (-)
  - VERSAMENTO → Avere (-) verso banca
  - PRELIEVO → Dare (+) da banca

- **BANCA**:
  - VERSAMENTO → Dare (+) da cassa
  - PRELIEVO → Avere (-) verso cassa
  - INCASSO → Dare (+) bonifici
  - USCITA → Avere (-) pagamenti

### Generazione da Chiusura
Quando una chiusura viene validata:
1. Creare movimento INCASSO su CASSA per totale incassi
2. Creare movimenti USCITA su CASSA per ogni spesa
3. Se versamento > 0, creare coppia VERSAMENTO (cassa-) e (banca+)

---

## Checklist

- [x] Step 1: Types e validazione Zod
- [x] Step 2: API lettura
- [x] Step 3: API scrittura
- [x] Step 4: JournalEntryForm component
- [x] Step 5: JournalEntryTable component
- [x] Step 6: RegisterBalanceCards component
- [x] Step 7: Pagina prima nota cassa
- [x] Step 8: Pagina prima nota banca
- [x] Step 9: Integrazione chiusure
- [x] Step 10: Report e esportazione

---

## Progress Log

### 2 Gennaio 2026
- Piano creato
- **Step 1 COMPLETATO**: Types e validazione Zod
  - `src/types/prima-nota.ts` - Tipi TypeScript
  - `src/lib/validations/prima-nota.ts` - Schema Zod
  - `src/lib/prima-nota-utils.ts` - Utility calcoli

- **Step 2 COMPLETATO**: API lettura
  - `src/app/api/prima-nota/route.ts` - GET lista movimenti, POST crea movimento
  - `src/app/api/prima-nota/[id]/route.ts` - GET/PUT/DELETE singolo movimento
  - `src/app/api/prima-nota/saldi/route.ts` - GET saldi attuali registri
  - `src/app/api/prima-nota/saldi/storico/route.ts` - GET storico saldi per periodo

- **Step 3 COMPLETATO**: API scrittura
  - `src/app/api/prima-nota/versamento/route.ts` - POST versamento cassa→banca
  - Crea coppia di movimenti (CASH credit, BANK debit) in transazione
  - Aggiorna automaticamente RegisterBalance

- **Step 4 COMPLETATO**: JournalEntryForm component
  - `src/components/prima-nota/JournalEntryForm.tsx`
  - Form per nuovo movimento con selezione registro, tipo, importo, descrizione
  - Validazione client-side, anteprima importo

- **Step 5 COMPLETATO**: JournalEntryTable component
  - `src/components/prima-nota/JournalEntryTable.tsx`
  - Tabella movimenti con colonne Dare/Avere/Saldo
  - Paginazione, azioni modifica/elimina, colorazione importi

- **Step 6 COMPLETATO**: RegisterBalanceCards component
  - `src/components/prima-nota/RegisterBalanceCards.tsx`
  - Cards riepilogative saldi Cassa, Banca, Totale Disponibile
  - Componente SingleRegisterCard per pagine dedicate

- **Step 7-8 COMPLETATO**: Pagine Prima Nota Cassa/Banca
  - `src/app/(dashboard)/prima-nota/page.tsx` - Server component
  - `src/app/(dashboard)/prima-nota/PrimaNotaClient.tsx` - Client component
  - Tabs Cassa/Banca, filtri, form nuovo movimento, esportazione

- **Step 9 COMPLETATO**: Integrazione Chiusure
  - `src/lib/closure-journal-entries.ts` - Utility generazione movimenti
  - Aggiornato `/api/chiusure/[id]/validate/route.ts`
  - Su validazione: genera movimento incasso, movimenti uscite, versamento banca
  - Su rifiuto: elimina movimenti generati

- **Step 10 COMPLETATO**: Report e Esportazione
  - `src/app/api/prima-nota/export/route.ts` - GET esportazione CSV/JSON
  - Bottone esporta nella pagina Prima Nota
  - CSV con formato italiano (separatore ;, numeri con virgola)

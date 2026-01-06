# Tracking Prezzi - Piano Implementazione

**Stato**: COMPLETATO
**Data**: 2026-01-06
**Commit**: 510f655

## Obiettivo

Implementare un sistema di tracking prezzi articoli che:
1. Cattura i prezzi degli articoli dalle fatture elettroniche SDI
2. Mantiene uno storico dei prezzi per prodotto
3. Genera alert automatici per variazioni significative (>5%)
4. Permette il confronto prezzi tra fornitori

## Implementazione Completata

### 1. Schema Database (Prisma)

Modelli creati in `prisma/schema.prisma`:

- **Product**: Catalogo prodotti normalizzato
  - Campi: name, originalName, code, category, unit
  - Traccia lastPrice, lastPriceDate, lastSupplierId
  - Relazioni con Venue, PriceHistory, PriceAlert

- **PriceHistory**: Storico prezzi per articolo
  - Registra price, quantity, totalPrice per ogni acquisto
  - Calcola previousPrice, priceChange, priceChangePct
  - Collegato a Supplier, invoiceId, invoiceDate

- **PriceAlert**: Alert variazioni prezzo
  - Tipi: INCREASE, DECREASE, NEW_PRODUCT, NEW_SUPPLIER
  - Stati: PENDING, ACKNOWLEDGED, APPROVED, DISPUTED
  - Soglia alert: variazioni >= 5%

### 2. API Endpoints

- `GET /api/products` - Lista prodotti con filtri (search, category, supplier)
- `POST /api/products` - Crea prodotto manualmente
- `GET /api/products/[id]` - Dettaglio con stats e storico
- `PATCH /api/products/[id]` - Aggiorna prodotto
- `DELETE /api/products/[id]` - Soft delete
- `GET /api/products/[id]/price-history` - Storico completo con trend
- `GET /api/price-alerts` - Lista alert con statistiche
- `GET /api/price-alerts/[id]` - Dettaglio alert
- `PATCH /api/price-alerts/[id]` - Aggiorna stato alert

### 3. Libreria Price Tracking

File: `src/lib/price-tracking/index.ts`

Funzioni:
- `normalizeProductName()` - Normalizza nomi per matching
- `inferCategory()` - Deduce categoria da descrizione
- `trackPricesFromInvoice()` - Processa linee fattura
- `getPriceTrackingStats()` - Statistiche per dashboard

### 4. Integrazione SDI Import

File: `src/app/api/invoices/route.ts`

L'import fatture ora:
1. Crea/aggiorna prodotti nel catalogo
2. Registra prezzi nello storico
3. Genera alert per variazioni >5%
4. Genera alert NEW_PRODUCT per nuovi articoli

### 5. UI Frontend

Pagine create:

- `/prodotti` - Lista prodotti con:
  - Ricerca testuale
  - Filtro per categoria
  - Stats cards (totale, alert, categorie)
  - Tabella con ultimo prezzo e variazione
  - Indicatori visivi per aumenti significativi

- `/prodotti/[id]` - Dettaglio prodotto con:
  - Stats (ultimo, medio, min, max)
  - Tab Storico Prezzi
  - Tab Confronto Fornitori
  - Tab Alert con azioni

### 6. Sidebar

Aggiunta voce "Prodotti" nella navigazione con icona Package.

## Funzionalità

### Tracking Automatico
- Quando una fattura SDI viene importata, le linee vengono processate
- I prodotti vengono creati o aggiornati automaticamente
- Lo storico prezzi viene registrato con variazioni percentuali

### Categorizzazione
Categorie inferite automaticamente:
- BEVANDE_ALCOLICHE (vino, birra, spirits...)
- BEVANDE_ANALCOLICHE (acqua, succhi, soft drink...)
- CAFFETTERIA (caffè, cialde, zucchero...)
- FOOD (pane, dolci, snack...)
- GELATO
- PULIZIA (detersivi, carta...)
- PACKAGING (bicchieri, piatti...)

### Alert Prezzi
Generati automaticamente quando:
- Variazione prezzo >= 5% (INCREASE/DECREASE)
- Nuovo prodotto importato (NEW_PRODUCT)
- Nuovo fornitore per prodotto esistente (NEW_SUPPLIER)

### Confronto Fornitori
La UI mostra prezzo medio per fornitore, evidenziando:
- Fornitore con prezzo migliore
- Numero acquisti per fornitore

## Test

- Build: OK
- TypeScript: OK
- Prisma schema sync: OK

## Note Tecniche

- Prezzi salvati con precisione Decimal(10,4) per prezzi unitari
- Percentuali con Decimal(5,2)
- Soft delete per prodotti (isActive flag)
- Indici su productId, invoiceDate, supplierId per performance

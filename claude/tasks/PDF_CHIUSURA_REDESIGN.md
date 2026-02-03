# Ridisegno PDF Chiusura Cassa (Layout Foglio Cartaceo Weiss)

## Stato: COMPLETATO

## Problemi Risolti
1. **Bug NaN**: La route API cercava campi `totalRevenue`, `totalCash`, `totalPos`, `totalExpenses`, `netCash`, `cashDifference` che **non esistono** nello schema Prisma. `Number(undefined)` = `NaN`. Ora i totali vengono calcolati aggregando i dati dalle relazioni (`stations`, `expenses`).
2. **Layout errato**: Il PDF aveva un layout generico. Ora segue il layout del foglio cartaceo originale Weiss Cafè.

## File Modificati

### 1. `src/app/api/chiusure/[id]/pdf/route.ts`
- Rimosso il type assertion fittizio con campi inesistenti (`totalRevenue`, etc.)
- Calcolo totali dalle stazioni: `totalCash = SUM(stations.cashAmount)`, etc.
- Passaggio completo dati stazioni (7 colonne: corrispettivo, IVA, fatture, sospesi, contanti, POS, totale)
- Dati cashCount completi con totali per verifica
- Uscite con `payee`, `description`, `paidBy` separati
- Parziali con `receiptProgressive`, `posProgressive`, `coffeeCounter`, `coffeeDelta`, `weather`
- Presenze con `shift`, `statusCode`, `hours`, `totalPay`, `isPaid`, `isExtra`
- `isExtra` derivato da `User.isFixedStaff` (false = extra)
- Aggiunto `isFixedStaff` alla select dell'include attendance.user

### 2. `src/lib/pdf/ClosurePdfTemplate.tsx` — Riscrittura completa
Nuovo layout in sezioni:

#### Header
- Logo Weiss Cafè (PNG) + titolo "CHIUSURA CASSA" + venue + data + meteo + compilatore/validatore

#### Sezione 1: Tabella Postazioni Cassa
8 colonne: POSTAZIONE | CORRISP. | IVA | FATTURE | SOSPESI | CONTANTI | POS | TOTALE
Con riga TOTALE in fondo.

#### Sezione 2: Parziali Orari
Card per ogni parziale (16:00, 21:00) con importo progressivo, dettaglio contanti+POS, meteo, contatore caffè con delta.

#### Sezione 3: Uscite
Tabella: CAUSALE (payee + descrizione) | PAGAMENTO (paidBy) | IMPORTO

#### Sezione 4: Layout a Due Colonne
- **Sinistra — LIQUIDITÀ**: griglia conteggio fisico banconote/monete (€500→€0,01) con quantità e valore. Tagli a zero nascosti.
- **Destra — DIPENDENTI**: tabella 2 colonne (MATTINA / SERA), + sezione EXTRA con ore, compenso, flag pagato.

#### Summary Box
Riepilogo finanziario: Totale Contanti, POS, Incassi, Uscite, Cassa Netta, Differenza Cassa.

#### Footer
"Weiss Cafè Gestionale" | data/ora generazione | ID chiusura

### 3. `public/images/logo.png`
Logo SVG convertito in PNG (396x280px, RGBA) per compatibilità con `<Image>` di react-pdf.

## Test
- Build Next.js: OK (nessun errore)
- Type-check: OK (nessun errore nei file modificati)
- Generazione PDF con dati mock: OK (17.5 KB, 1 pagina A4, layout corretto)
- PDF aperto e verificato visivamente

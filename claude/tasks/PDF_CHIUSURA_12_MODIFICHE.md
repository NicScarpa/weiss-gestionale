# Piano: 12 Modifiche PDF Chiusura Cassa

## Analisi codice attuale

- **Template:** `src/lib/pdf/ClosurePdfTemplate.tsx` (801 righe) - Font Helvetica, 3 colonne expenses, data "EEEE d MMMM yyyy", SummaryBox presente, tagli con qty=0 nascosti
- **API route:** `src/app/api/chiusure/[id]/pdf/route.ts` (193 righe) - expenses senza documentType/documentRef/vatAmount/isPaid, Content-Disposition: attachment
- **Hook:** `src/hooks/useClosureMutation.ts` (177 righe) - submit senza apertura PDF
- **Font Avenir Next:** presente su macOS in `/System/Library/Fonts/Avenir Next.ttc`
- **Directory:** `public/fonts/` e `public/images/weather/` da creare

## Ordine di esecuzione

### Fase 0: Prerequisiti
- [x] 0.1: Estrarre font Avenir Next (.ttf) da .ttc con fonttools
- [x] 0.2: Creare 6 icone meteo PNG minimaliste (sharp da SVG)

### Fase 1: API route
- [x] 1.1: Aggiungere campi expense (documentType, documentRef, vatAmount, isPaid) alla route PDF
- [x] 1.2: Aggiungere supporto query param `?view=inline` per Content-Disposition

### Fase 2: Modifiche template semplici
- [x] 2.1: #2 - Registrare font Avenir Next + Font.register + sostituito tutte le 8 occorrenze Helvetica
- [x] 2.2: #3 - Mostrare tutti i 15 tagli con trattino per qty=0
- [x] 2.3: #4 - Data formato "GIO 29/01/2026" (EEE dd/MM/yyyy uppercase)
- [x] 2.4: #5 - Rimuovere venue name dall'header (mantenuto solo eventName)
- [x] 2.5: #6 - Filtrare postazioni con totalAmount=0 (activeStations)
- [x] 2.6: #11 - Rimuovere SummaryBox (funzione + 7 stili + chiamata + fmtCurrency rimossa)

### Fase 3: Modifiche template coordinate
- [x] 3.1: #7+#12 - ExpensesTable 7 colonne + cleanPayeeName + getDocTypeLabel
- [x] 3.2: #8 - Centrare colonne numeriche StationsTable + fmtEuro nella riga TOTALE
- [x] 3.3: #9 - Contanti + uscite cassa (paidBy !== ESTERNO) nella riga TOTALE stazioni

### Fase 4: Icone e submit
- [x] 4.1: #10 - Meteo icone PNG nei parziali (getWeatherIconPath + Image)
- [x] 4.2: #1 - window.open PDF inline dopo submit in useClosureMutation

### Fase 5: Verifica
- [x] 5.1: Verifica TypeScript (tsc --noEmit) - 0 errori
- [x] 5.2: Verifica ESLint - 0 errori

## File modificati

| File | Modifiche |
|------|-----------|
| `src/app/api/chiusure/[id]/pdf/route.ts` | Campi expense + ?view=inline |
| `src/lib/pdf/ClosurePdfTemplate.tsx` | Font, data, venue, postazioni, tagli, expenses 7 col, stazioni centrate+EUR, meteo PNG, SummaryBox rimosso, staff pulito |
| `src/hooks/useClosureMutation.ts` | window.open PDF dopo submit |
| `public/fonts/*.ttf` | NUOVI - 2 file font |
| `public/images/weather/*.png` | NUOVI - 6 icone |

## Vincoli
- Zero nuovi file .ts/.tsx
- Nessuna migrazione DB
- Backward-compatible (chiusure vecchie senza errori)
- Solo componenti @react-pdf/renderer
- Path assoluti per font e immagini

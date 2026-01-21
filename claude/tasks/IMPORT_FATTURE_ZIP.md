# Task: Import Fatture da File ZIP

## Obiettivo
Implementare la possibilità di caricare fatture elettroniche (.xml e .p7m) direttamente da file ZIP nella sezione fatture.

## Data Inizio
2026-01-21

## Piano di Implementazione

### Fase 1: Core ZIP Utilities
- [x] Aggiungere dipendenza `jszip ^3.10.1` a package.json
- [x] Creare `src/lib/zip-utils.ts` con funzioni:
  - `isZipFile()` - verifica estensione
  - `isZipContent()` - verifica magic bytes
  - `isInvoiceFile()` - verifica se file è fattura
  - `extractInvoicesFromZip()` - estrazione principale
  - `createFileFromExtracted()` - conversione a File object
  - `getZipErrorMessage()` - messaggi errore in italiano

### Fase 2: Integrazione UI
- [x] Modificare `InvoiceImportDialog.tsx`:
  - Estendere interfaccia `FileItem` con `sourceZip`
  - Aggiungere stato estrazione ZIP
  - Modificare `handleFiles()` per gestire ZIP
  - Aggiornare input file: `accept=".xml,.p7m,.zip"`
  - Aggiornare testo drop zone

### Fase 3: UX Enhancements
- [x] Mostrare icona diversa per file da ZIP (Package icon)
- [x] Mostrare origine ZIP nel nome file "(da archivio.zip)"
- [x] Aggiungere statistiche ZIP nel summary

### Fase 4: Testing
- [x] Verifica TypeScript (nessun errore)
- [x] Build Next.js completato con successo
- [ ] Test manuale con ZIP contenente fatture XML
- [ ] Test manuale con ZIP contenente fatture P7M
- [ ] Test manuale con ZIP misto (PDF, immagini, fatture)
- [ ] Test errori: ZIP corrotto, ZIP vuoto

---

## Dettagli Implementazione

### File Creati
1. **`src/lib/zip-utils.ts`** - Utility complete per estrazione ZIP
   - Limiti di sicurezza: max 50MB ZIP, max 10MB per file, max 500 file
   - Supporta cartelle annidate
   - NON supporta ZIP annidati (sicurezza)
   - Error handling con codici specifici

### File Modificati
1. **`package.json`** - Aggiunta dipendenza jszip
2. **`src/components/invoices/InvoiceImportDialog.tsx`**
   - Import utility ZIP
   - Estensione interfaccia FileItem
   - Logica estrazione in handleFiles()
   - UI per file da ZIP
   - Statistiche nel summary

### Flusso Utente
```
1. Utente carica file ZIP
2. Sistema estrae file .xml e .p7m
3. File estratti aggiunti alla coda
4. Processamento normale (parsing → import/review)
5. Summary mostra statistiche ZIP
```

### Limiti Implementati
| Limite | Valore | Motivo |
|--------|--------|--------|
| Max ZIP size | 50MB | Prestazioni browser |
| Max file size | 10MB | Memory usage |
| Max files | 500 | UI performance |
| Nested ZIP | No | Sicurezza |

---

## Modifiche Apportate

### 2026-01-21: Implementazione Iniziale
- Creato `zip-utils.ts` con tutte le funzionalità di estrazione
- Modificato `InvoiceImportDialog.tsx` per supporto ZIP
- Aggiunta dipendenza jszip
- Implementata UI per visualizzazione file da ZIP
- Aggiunte statistiche ZIP nel summary

### 2026-01-21: Completamento Integrazione
- Corrette chiamate al logger in `zip-utils.ts` per rispettare la firma `(message, data)`
- Integrata gestione ZIP in `handleFiles()` con:
  - Estrazione automatica file XML/P7M
  - Toast di feedback (successo/errori)
  - Visualizzazione origine ZIP nella lista file
  - Icona Package per file estratti da ZIP
- Verifica TypeScript: nessun errore
- Build Next.js: completato con successo

---

## Stato: ✅ COMPLETATO

La funzionalità è pronta per il test manuale. Per testare:
1. Aprire `/fatture` nell'applicazione
2. Click su "Importa Fatture"
3. Selezionare un file ZIP contenente fatture XML/P7M
4. Verificare che i file vengano estratti e visualizzati nella lista
5. Procedere con l'importazione normale

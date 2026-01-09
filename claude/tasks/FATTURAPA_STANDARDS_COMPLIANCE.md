# Task: Standardizzazione Parsing FatturaPA secondo Specifiche Ufficiali

**Data**: 2025-01-09
**Status**: COMPLETATO

## Obiettivo

Analizzare le specifiche tecniche ufficiali della Fattura Elettronica italiana (FatturaPA) per garantire un parsing robusto e conforme agli standard dell'Agenzia delle Entrate.

## Lavoro Svolto

### 1. Analisi Documentazione Ufficiale

- Consultate Specifiche Tecniche v1.9 (fatturapa.gov.it)
- Analizzato Schema XSD FatturaPA v1.2.3
- Documentata struttura XML completa in piano

### 2. Aggiornamento Types (types.ts)

- Aggiornato riferimento versione a v1.2.3
- Aggiunti TD28 e TD29 ai TIPI_DOCUMENTO
- Aggiunte interfacce per error handling strutturato:
  - `ParseErrorCode` - 10 codici errore
  - `ParseWarningCode` - 8 codici warning
  - `ParseError` - Errore strutturato con code, field, message
  - `ParseWarning` - Warning strutturato
  - `ParseResult` - Risultato parsing con success, data, errors, warnings

### 3. Nuova Funzione parseFatturaPASafe (parser.ts)

Creata funzione alternativa che:
- Restituisce `ParseResult` invece di lanciare eccezioni
- Cattura errori strutturati con codice e campo
- Genera warning per:
  - Tipo documento non riconosciuto
  - Modalità pagamento non riconosciuta
  - P.IVA con lunghezza non standard
  - Linee dettaglio vuote
  - ImportoTotaleDocumento mancante
  - Fatture multiple nel body

### 4. Logging Diagnostico (p7m-utils.ts)

Aggiunta funzione `extractXmlFromP7mWithDiagnostics` che restituisce:
- `P7mExtractionResult` con:
  - success/error
  - logs dettagliati per ogni fase
  - diagnostics (fileSize, extractionStrategy, cleaningApplied)

### 5. Test Suite Compliance

Aggiunti 7 nuovi test suite in `sdi-parser.test.ts`:
- FatturaPA Compliance - Tipi Documento
- FatturaPA Compliance - Natura Operazione
- FatturaPA Compliance - Pagamenti
- FatturaPA Compliance - Formati Data e Importi
- FatturaPA Compliance - Causale
- FatturaPA Compliance - Bollo Virtuale
- FatturaPA Compliance - Dettaglio Linee
- FatturaPA Compliance - Validazione Base
- sdi/parser - parseFatturaPASafe (Error Handling)

**Totale test aggiunti**: 7 nuovi test per parseFatturaPASafe

## File Modificati

| File | Modifiche |
|------|-----------|
| `src/lib/sdi/types.ts` | TD28, TD29, interfacce ParseResult/Error/Warning |
| `src/lib/sdi/parser.ts` | Funzione parseFatturaPASafe |
| `src/lib/p7m-utils.ts` | extractXmlFromP7mWithDiagnostics |
| `src/lib/__tests__/sdi-parser.test.ts` | 7 nuovi test suite compliance |

## Test Results

```
Test Files  10 passed
Tests       308 passed
```

## Piano Originale

Vedi: `/Users/nicolascarpa/.claude/plans/cuddly-purring-forest.md`

## Integrazione API (2025-01-09)

### parseFatturaPASafe integrato nelle API

**File modificati:**
- `src/app/api/invoices/route.ts` - Import principale
- `src/app/api/invoices/parse/route.ts` - Anteprima/preview

**Cambiamenti:**
- Sostituito `parseFatturaPA` con `parseFatturaPASafe`
- In caso di errore: restituisce `parseErrors` array con codice, campo, messaggio
- In caso di successo: restituisce `parseWarnings` array se presenti

**Esempio risposta con errori (400):**
```json
{
  "error": "Errore nel parsing della fattura: [MISSING_VAT] CedentePrestatore/IdFiscaleIVA: P.IVA fornitore mancante",
  "parseErrors": [
    {
      "code": "MISSING_VAT",
      "field": "CedentePrestatore/IdFiscaleIVA",
      "message": "P.IVA fornitore mancante"
    }
  ]
}
```

**Esempio risposta con warnings (201):**
```json
{
  "id": "...",
  "invoiceNumber": "123/2025",
  "parseWarnings": [
    {
      "code": "UNKNOWN_DOCUMENT_TYPE",
      "field": "DatiGeneraliDocumento/TipoDocumento",
      "message": "Tipo documento TD99 non riconosciuto",
      "value": "TD99"
    }
  ]
}
```

## Prossimi Passi Suggeriti

1. ~~Integrare `parseFatturaPASafe` nell'API di import fatture~~ ✅ FATTO
2. Usare `extractXmlFromP7mWithDiagnostics` per debug in caso di errori
3. Mostrare warnings all'utente nel frontend dopo import riuscito
4. Considerare validazione XSD runtime (opzionale)

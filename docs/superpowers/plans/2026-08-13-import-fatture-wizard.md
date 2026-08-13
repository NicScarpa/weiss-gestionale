# Import fatture: procedura guidata in tre passi — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire i due dialog di import fatture con una sola procedura guidata in tre passi che accetta XML, P7M e ZIP, dichiara i duplicati *prima* di scrivere, risolve i conflitti sui termini di pagamento e chiude con un riepilogo navigabile.

**Architecture:** Un solo componente `ImportaFattureWizard` sostituisce `CaricaFattureDialog` e `InvoiceImportDialog`. L'anteprima è calcolata **interamente nel browser** — `parseFatturaPASafe` dipende solo da `fast-xml-parser` e `p7m-utils` gestisce già gli `ArrayBuffer`, quindi 226 fatture si leggono in locale senza trasferire nulla. Al server si mandano solo gli XML delle fatture che l'utente ha davvero deciso di importare, a blocchi, e il server **riparsa sempre**: il client non è mai la fonte di verità.

**Tech Stack:** Next.js (App Router), React 19, TypeScript strict, Prisma, Vitest + Testing Library, shadcn/ui, TanStack Query, JSZip, fast-xml-parser.

**Spec:** `docs/cashking/07-import-fattura-elettronica.md` — referto di reverse engineering del flusso CashKing, con il confronto misurato contro il nostro parser sui 226 file di `docs/fatture/FT-ultimi3mesi-xml.zip`.

## Global Constraints

- **Node 22 obbligatorio.** Ogni comando `npm`/`npx`/`node` va preceduto da `nvm use 22 &&` **nella stessa riga di shell** (ogni invocazione di Bash parte da una shell nuova).
- **Lingua delle rotte: italiano** per i percorsi nuovi. Non creare la variante inglese di una rotta già esistente in italiano.
- **Ogni rotta chiama `auth()`** e, trattandosi di dati finanziari, richiede ruolo `admin` o `manager`.
- **Sede sempre da `getVenueId()`** (`src/lib/venue.ts`), mai `venue.findFirst()`.
- **Importi sempre `Decimal`** in Prisma, mai `Float`.
- **Le scritture contabili non si cancellano:** `deletedAt`, mai `delete()`.
- **Niente UI che promette automazioni inesistenti.** Un dato mostrato dev'essere un dato che il sistema usa o conserva davvero.
- **La build va eseguita**, non bastano `tsc` e i test: un import client→prisma rompe il bundle e nessuna revisione del diff lo vede. Mai `npm run build | tail` (l'exit code diventa quello di `tail`).
- Test: `nvm use 22 && npm test -- --run <percorso>`. Type-check: `nvm use 22 && npx tsc --noEmit`.
- **Una route non esporta nulla oltre ai suoi metodi HTTP.** Niente `export` di schemi, tipi o funzioni ausiliarie da un `route.ts`: `npm run build` in locale gira su Turbopack, la CI prova prima `next build --webpack`, e i due non concordano proprio su questo. Una build verde in locale non dice nulla su quella della CI. Tipi condivisi → in un modulo a parte.
- **I test d'integrazione (`*.itest.ts`) usano l'impalcatura del progetto**, mai `vi.mock('@/lib/auth')` scritto a mano: `setupIntegrationDb()` da `@/test/integration/db`, `loginAs()` da `@/test/integration/auth-mock`, `jsonRequest()`/`callRoute()` da `@/test/integration/api`. Leggi `src/app/api/invoices/__tests__/import-idempotente.itest.ts` prima di scriverne uno.
- **Ogni test d'integrazione si crea i dati che gli servono.** Non dare per esistente nulla che non hai inserito tu nel test: il database di test non è quello di sviluppo.
- Le route nuove seguono lo stile di quelle vicine in `src/app/api/invoices/`: `auth()` diretto più controllo del ruolo. Il wrapper `AuthedRoute` di `api-utils.ts` non è lo standard di quest'area.

## Decisioni già prese (non ridiscuterle in esecuzione)

| Tema | Decisione | Perché |
|---|---|---|
| Dove avviene l'anteprima | **Nel browser** | Il parser è isomorfo. CashKing trasferisce 17,1 MB due volte; noi zero. |
| Chi è la fonte di verità | **Il server**, che riparsa l'XML ricevuto | Il client si può manomettere. |
| Duplicati | Rilevati **in anteprima**, marcati riga per riga | CashKing chiede la politica alla cieca e non mostra quali. |
| Conflitti anagrafici | Solo sui **termini di pagamento** (`Supplier.paymentTermsDays`) | È l'unico default per fornitore che abbiamo, ed è quello che decide la scadenza stimata. **Non** esiste un'aliquota IVA predefinita per fornitore: inventarne una sarebbe UI che promette un'automazione inesistente. |
| Note di credito | TD04 e TD08 mostrate in negativo **solo in anteprima**; il dato salvato resta positivo | In un elenco vanno lette in negativo, come fa CashKing. Ma su `main` la riconciliazione le **sottrae già** partendo da importi positivi (`righeDaSottrarreNote`): negarle anche alla fonte le invertirebbe due volte. Vedi il Task 2. |
| Ritenuta d'acconto | **Letta e conservata**, mai contabilizzata | Il trattamento contabile è sospeso (memoria del 13 ago: la ritenuta è un canale di saldo con ciclo F24). Leggerla e mostrarla non anticipa nulla; buttarla via sì. |
| Scadenze stimate | Restano a +30 giorni, ma l'anteprima **dichiara** che sono stime | Non copiamo CashKing, che le mette alla data fattura (debiti già scaduti all'import) o le lascia nulle per un terzo dei documenti. |
| «PDF errati» | Contatore **non replicato** | Non trattiamo PDF. Un contatore fisso a zero è rumore. |

---

## Struttura dei file

**Nuovi**

| File | Responsabilità |
|---|---|
| `src/components/fatture/importa/ImportaFattureWizard.tsx` | Contenitore: stato del passo corrente, opzioni, orchestrazione. Nient'altro. |
| `src/components/fatture/importa/PassoCaricamento.tsx` | Passo 1: opzioni + zona di rilascio + contatore file selezionati. |
| `src/components/fatture/importa/PassoAnteprima.tsx` | Passo 2: tabella delle fatture trovate, con esclusione per riga. |
| `src/components/fatture/importa/DialogConflitti.tsx` | Finestra dei termini in conflitto, con risoluzione singola e in blocco. |
| `src/components/fatture/importa/PassoEsecuzione.tsx` | Passo 3: avanzamento, contatori vivi, log per riga. |
| `src/components/fatture/importa/RiepilogoFinale.tsx` | Esito: contatori filtranti, tabella espandibile, verifica integrità. |
| `src/components/fatture/importa/tipi.ts` | Tipi condivisi fra i pezzi sopra. |
| `src/lib/invoices/segno-documento.ts` | Il segno con cui una nota di credito va **mostrata** (Task 2). |
| `src/lib/sdi/lettura-file.ts` | Da `File[]` a `FatturaLetta[]`: sbustamento ZIP/P7M e parsing, nel browser. |
| `src/app/api/fatture/verifica-duplicati/route.ts` | Dice quali fra le fatture proposte sono già in archivio. |
| `src/app/api/fatture/conflitti-termini/route.ts` | Dice per quali fornitori i termini del file divergono dall'anagrafica. |

**Modificati**

| File | Modifica |
|---|---|
| `src/lib/zip-utils.ts:82,235-255` | Escludere `*_metaDato.xml`; contarli a parte. |
| `src/lib/sdi/types.ts:112-151` | Aggiungere `datiRitenuta?: DatiRitenuta` a `FatturaParsata`. |
| `src/lib/sdi/parser.ts` | Estrazione di `DatiRitenuta` (Task 3). **`calcolaImporti` non si tocca.** |
| `src/app/api/invoices/route.ts:66-86,387-395` | Accettare `politicaDuplicati` e `giorniPagamentoScelti`. |
| `prisma/schema.prisma:1591` | Colonna `withholding Json?` su `ElectronicInvoice`. |
| `src/app/(dashboard)/fatture/page.tsx:14,84` | Montare il wizard. |
| `src/components/invoices/InvoiceList.tsx:65,696` | Montare il wizard. |

**Eliminati a fine lavoro (Task 12)**

- `src/components/fatture/CaricaFattureDialog.tsx`
- `src/components/invoices/InvoiceImportDialog.tsx`

---

## Task 1: Lo ZIP ignora i metadati dell'Agenzia

Lo zippone AdE accompagna ogni fattura con un `..._metaDato.xml`. Oggi lo tratteremmo come una fattura e produrremmo un errore di parsing per ognuno: con un archivio mensile vero significa raddoppiare i file e riempire il riepilogo di errori falsi.

**Files:**
- Modify: `src/lib/zip-utils.ts:82` (costanti) e `:235-255` (filtro)
- Test: `src/lib/__tests__/zip-utils.test.ts` (creare — oggi non esiste)

**Interfaces:**
- Produces: `isFileMetadatoAdE(filename: string): boolean` — esportata, usata anche dal Task 6.
- Produces: `ZipExtractionResult.stats.metadataFiles: number` — conteggio separato dei metadati scartati.

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `src/lib/__tests__/zip-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { extractInvoicesFromZip, isFileMetadatoAdE, isInvoiceFile } from '../zip-utils'

async function creaZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [nome, contenuto] of Object.entries(files)) zip.file(nome, contenuto)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('isFileMetadatoAdE', () => {
  it('riconosce il metadato dell Agenzia in tutte le grafie', () => {
    expect(isFileMetadatoAdE('IT01234567890_00001_metaDato.xml')).toBe(true)
    expect(isFileMetadatoAdE('IT01234567890_00001_METADATO.XML')).toBe(true)
    expect(isFileMetadatoAdE('IT01234567890_00001_metadato.xml')).toBe(true)
  })

  it('non scambia per metadato una fattura vera', () => {
    expect(isFileMetadatoAdE('IT01234567890_019IC.xml')).toBe(false)
    expect(isFileMetadatoAdE('SM03473_GR1Qa.xml.p7m')).toBe(false)
  })
})

describe('extractInvoicesFromZip', () => {
  it('scarta i metadati e li conta a parte', async () => {
    const buffer = await creaZip({
      'IT01234567890_00001.xml': '<FatturaElettronica/>',
      'IT01234567890_00001_metaDato.xml': '<metadati/>',
      'IT01234567890_00002.xml': '<FatturaElettronica/>',
      'IT01234567890_00002_metaDato.xml': '<metadati/>',
    })

    const risultato = await extractInvoicesFromZip(buffer, 'zippone.zip')

    expect(risultato.success).toBe(true)
    expect(risultato.files.map((f) => f.name)).toEqual([
      'IT01234567890_00001.xml',
      'IT01234567890_00002.xml',
    ])
    expect(risultato.stats.metadataFiles).toBe(2)
    expect(risultato.stats.invoiceFiles).toBe(2)
    expect(risultato.errors).toHaveLength(0)
  })

  it('accetta le estensioni in maiuscolo', async () => {
    const buffer = await creaZip({ 'IT02634040246_226C8.XML.P7M': 'contenuto' })
    const risultato = await extractInvoicesFromZip(buffer, 'archivio.zip')
    expect(risultato.files).toHaveLength(1)
    expect(isInvoiceFile('IT02634040246_226C8.XML.P7M')).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/zip-utils.test.ts
```

Atteso: FAIL — `isFileMetadatoAdE is not a function`.

- [ ] **Step 3: Implementare**

In `src/lib/zip-utils.ts`, dopo la costante `INVOICE_EXTENSIONS` (riga 82):

```typescript
/**
 * Riconosce il file di metadati che l'Agenzia delle Entrate affianca a ogni
 * fattura dentro l'archivio mensile. Non è una fattura: se lo trattiamo come
 * tale otteniamo un errore di parsing per ogni documento dell'archivio.
 */
export function isFileMetadatoAdE(filename: string): boolean {
  return /_metadato\.xml$/i.test(filename)
}
```

Nell'interfaccia `ZipExtractionResult.stats` (riga ~47) aggiungere:

```typescript
    /** File di metadati AdE scartati senza segnalare errore */
    metadataFiles: number
```

Inizializzarlo a `0` nell'oggetto `result` (riga ~171) e, nel filtro `invoiceFiles` (riga ~235), inserire **prima** del controllo sugli ZIP annidati:

```typescript
    if (isFileMetadatoAdE(fileName)) {
      result.stats.metadataFiles++
      return false
    }
```

Nel calcolo di `skippedFiles` (riga ~258) sottrarre anche i metadati:

```typescript
  result.stats.skippedFiles =
    allFiles.length - invoiceFiles.length - result.stats.errorFiles - result.stats.metadataFiles
```

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/zip-utils.test.ts
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zip-utils.ts src/lib/__tests__/zip-utils.test.ts
git commit -m "feat(import): lo ZIP scarta i metadati dell'Agenzia invece di sbatterci contro"
```

---

## Task 2: Il segno delle note di credito, dove serve davvero

> **Rettifica al piano (13 ago, dopo la verifica contro `origin/main`).** La prima
> stesura faceva negare gli importi a `calcolaImporti`. Su `main` **non si può**:
> `schedule-reconciliation-service.ts` sottrae già le righe delle note di credito
> alla fattura rettificata (`righeDaSottrarreNote`, che filtra su
> `TIPI_DOCUMENTO_NOTA_CREDITO`), assumendole **positive**. Negarle alla fonte
> produrrebbe la doppia inversione contro cui quel file mette in guardia per
> iscritto: «un errore di importo doppio, sul conto sbagliato».
>
> Quindi il segno resta **una questione di presentazione**: l'anteprima d'import
> mostra la nota di credito in negativo — è ciò che l'utente si aspetta leggendo
> un elenco, ed è ciò che fa CashKing — mentre il dato persistito non cambia.

**Files:**
- Create: `src/lib/invoices/segno-documento.ts`
- Test: `src/lib/invoices/__tests__/segno-documento.test.ts`

**Interfaces:**
- Consumes: `TIPI_DOCUMENTO_NOTA_CREDITO` da `@/lib/services/invoice-schedule-service` — **esiste già, non ridefinirla**: è `new Set(['TD04', 'TD08'])` e la usano `riallineamento.ts` e `schedule-reconciliation-service.ts`.
- Produces: `segnoDiPresentazione(tipoDocumento: string, importo: number): number` — l'importo con il segno che va **mostrato**, mai quello da salvare.
- Consumed by: Task 6 (`lettura-file.ts`), per le colonne Netto, IVA e Lordo dell'anteprima.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect } from 'vitest'
import { segnoDiPresentazione } from '../segno-documento'

describe('segnoDiPresentazione', () => {
  it('mostra in negativo le note di credito', () => {
    expect(segnoDiPresentazione('TD04', 164.33)).toBe(-164.33)
    expect(segnoDiPresentazione('TD08', 1900)).toBe(-1900)
  })

  it('lascia positive le fatture ordinarie', () => {
    expect(segnoDiPresentazione('TD01', 164.33)).toBe(164.33)
    expect(segnoDiPresentazione('TD24', 1143.41)).toBe(1143.41)
    expect(segnoDiPresentazione('TD06', 528.67)).toBe(528.67)
  })

  it('lascia positive le note di DEBITO, che aumentano il dovuto', () => {
    expect(segnoDiPresentazione('TD05', 100)).toBe(100)
    expect(segnoDiPresentazione('TD09', 100)).toBe(100)
  })

  it('non inverte due volte un documento gia negativo', () => {
    // Esiste davvero: IT03590860262_07UWS.xml.p7m e un TD01 da -70,00
    expect(segnoDiPresentazione('TD01', -70)).toBe(-70)
    expect(segnoDiPresentazione('TD04', -164.33)).toBe(-164.33)
  })

  it('regge lo zero senza produrre -0', () => {
    expect(Object.is(segnoDiPresentazione('TD04', 0), 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/invoices/__tests__/segno-documento.test.ts
```

Atteso: FAIL — modulo `../segno-documento` non trovato.

- [ ] **Step 3: Implementare**

```typescript
import { TIPI_DOCUMENTO_NOTA_CREDITO } from '@/lib/services/invoice-schedule-service'

/**
 * L'importo con il segno da MOSTRARE, mai quello da salvare.
 *
 * Una nota di credito riduce il debito verso il fornitore: in un elenco va
 * letta in negativo, altrimenti il totale di una selezione somma crediti e
 * debiti come se fossero la stessa cosa.
 *
 * Il dato persistito resta positivo, e deve restarlo: la riconciliazione
 * sottrae le righe delle note alla fattura rettificata
 * (`righeDaSottrarreNote` in schedule-reconciliation-service.ts) partendo da
 * importi positivi. Negarli anche alla fonte li invertirebbe due volte.
 *
 * TD05 e TD09 — le note di DEBITO — restano positive: rettificano una fattura
 * nel verso opposto, aumentando il dovuto.
 */
export function segnoDiPresentazione(tipoDocumento: string, importo: number): number {
  if (!TIPI_DOCUMENTO_NOTA_CREDITO.has(tipoDocumento)) return importo
  // Il documento puo gia portare il segno: invertirlo di nuovo lo riporterebbe
  // positivo. E `importo <= 0` invece di `< 0` per non produrre -0.
  if (importo <= 0) return importo
  return -importo
}
```

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/lib/invoices/__tests__/segno-documento.test.ts
```

Atteso: PASS, 5 test.

- [ ] **Step 5: Verificare di non aver mosso nulla a valle**

```bash
nvm use 22 && npm test -- --run src/lib/services/ src/lib/invoices/ src/lib/__tests__/sdi-parser.test.ts
```

Atteso: PASS. Se qui qualcosa diventa rosso, la funzione e stata usata dove non doveva: e una funzione di sola presentazione, nessun servizio deve chiamarla.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invoices/segno-documento.ts src/lib/invoices/__tests__/segno-documento.test.ts
git commit -m "feat(fatture): il segno di presentazione delle note di credito"
```

> **Fuori ambito, ma da sapere:** `src/app/api/invoices/stats/route.ts:77-84` somma le
> TD04 ai costi (`totals.costi += net`) invece di sottrarle, quindi una nota di credito
> **aumenta** i costi nel grafico di `/fatture`. E un difetto reale e indipendente da
> questo lavoro: non va corretto qui, dove passerebbe senza il suo test e senza che
> nessuno guardi il grafico. Merita un intervento suo.



## Task 3: La ritenuta d'acconto viene letta e conservata

Nove documenti su 226 la portano — tutte parcelle TD06. Oggi si perde. La leggiamo e la salviamo; **non** la contabilizziamo: il trattamento contabile resta sospeso.

**Files:**
- Modify: `src/lib/sdi/types.ts:112-157`, `src/lib/sdi/parser.ts`
- Modify: `prisma/schema.prisma:1591-1635`
- Create: migrazione Prisma
- Test: `src/lib/__tests__/sdi-parser.test.ts`

**Interfaces:**
- Produces: `interface DatiRitenuta { tipoRitenuta: string; importoRitenuta: number; aliquotaRitenuta: number; causalePagamento?: string }` in `types.ts`.
- Produces: `FatturaParsata.datiRitenuta?: DatiRitenuta`.
- Produces: colonna `ElectronicInvoice.withholding Json?`.

- [ ] **Step 0: Estrarre il generatore XML già esistente, invece di scriverne un terzo**

`src/app/api/invoices/__tests__/import-idempotente.itest.ts` contiene già `xmlFattura(opzioni)`: un FatturaPA parametrico e completo (numero, data, P.IVA, rate, `tipoDocumento`, `fattureCollegate`). Serve identico al Task 6 e al Task 10. Sarebbe la terza copia in giro — `src/app/api/invoices/[id]/righe-conti/__tests__/route.itest.ts` ne ha già una sua.

1. Sposta `xmlFattura` e la sua `interface OpzioniXml` in `src/test/factories/fattura-xml.factory.ts` (stessa cartella e stesso stile di `closure.factory.ts`), esportandole.
2. Aggiungi a `OpzioniXml` il campo che serve qui:

```typescript
  /** DatiRitenuta nel documento: assente se non specificato. */
  ritenuta?: { tipo: string; importo: string; aliquota: string; causale?: string }
```

e, dentro `DatiGeneraliDocumento`, subito dopo `ImportoTotaleDocumento`:

```typescript
  const datiRitenuta = opzioni.ritenuta
    ? `<DatiRitenuta><TipoRitenuta>${opzioni.ritenuta.tipo}</TipoRitenuta><ImportoRitenuta>${opzioni.ritenuta.importo}</ImportoRitenuta><AliquotaRitenuta>${opzioni.ritenuta.aliquota}</AliquotaRitenuta>${opzioni.ritenuta.causale ? `<CausalePagamento>${opzioni.ritenuta.causale}</CausalePagamento>` : ''}</DatiRitenuta>`
    : ''
```

3. In `import-idempotente.itest.ts` togli la definizione locale e importa `xmlFattura` dalla factory. Quel file deve restare verde: è la prova che l'estrazione non ha cambiato nulla.

```bash
nvm use 22 && npm test -- --run src/app/api/invoices/__tests__/import-idempotente.itest.ts
```

Atteso: PASS, stesso numero di test di prima.

- [ ] **Step 1: Scrivere il test che fallisce**

In `src/lib/__tests__/sdi-parser.test.ts`, usando la factory appena estratta:

```typescript
import { xmlFattura } from '@/test/factories/fattura-xml.factory'

describe('estrazione della ritenuta d acconto', () => {
  it('legge tipo, importo, aliquota e causale', () => {
    const xml = xmlFattura({
      tipoDocumento: 'TD06',
      ritenuta: { tipo: 'RT02', importo: '312.11', aliquota: '20.00', causale: 'A' },
    })

    const fattura = parseFatturaPASafe(xml, 'parcella.xml').data!

    expect(fattura.datiRitenuta).toEqual({
      tipoRitenuta: 'RT02',
      importoRitenuta: 312.11,
      aliquotaRitenuta: 20,
      causalePagamento: 'A',
    })
  })

  it('omette la causale quando il documento non la porta', () => {
    const xml = xmlFattura({
      tipoDocumento: 'TD06',
      ritenuta: { tipo: 'RT01', importo: '226.00', aliquota: '20.00' },
    })
    const fattura = parseFatturaPASafe(xml, 'parcella.xml').data!

    expect(fattura.datiRitenuta).toEqual({
      tipoRitenuta: 'RT01',
      importoRitenuta: 226,
      aliquotaRitenuta: 20,
    })
  })

  it('lascia il campo assente quando la ritenuta non c è', () => {
    const fattura = parseFatturaPASafe(xmlFattura(), 'fattura.xml').data!
    expect(fattura.datiRitenuta).toBeUndefined()
  })

  it('non intacca gli importi del documento', () => {
    const senza = calcolaImporti(parseFatturaPASafe(xmlFattura({ tipoDocumento: 'TD06' }), 'a.xml').data!)
    const con = calcolaImporti(
      parseFatturaPASafe(
        xmlFattura({
          tipoDocumento: 'TD06',
          ritenuta: { tipo: 'RT02', importo: '100.00', aliquota: '20.00' },
        }),
        'b.xml'
      ).data!
    )

    // Il lordo resta quello del documento: la ritenuta non si sottrae qui.
    expect(con.totalAmount).toBe(senza.totalAmount)
  })
})
```

> **Prima del test, lo Step 0 qui sotto: la fixture esiste già, va estratta.**

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/sdi-parser.test.ts -t "ritenuta"
```

Atteso: FAIL — `expected undefined to equal Object`.

- [ ] **Step 3: Aggiungere il tipo**

In `src/lib/sdi/types.ts`, accanto a `DatiBollo` (riga ~153):

```typescript
/**
 * Ritenuta d'acconto sul documento. Viene letta e conservata, mai imputata:
 * il trattamento contabile della ritenuta è sospeso — è un canale di saldo con
 * ciclo di vita proprio (F24), non una riga da girare a conto.
 */
export interface DatiRitenuta {
  /** RT01 persone fisiche, RT02 persone giuridiche, RT03 INPS, RT04 ENASARCO… */
  tipoRitenuta: string
  importoRitenuta: number
  aliquotaRitenuta: number
  /** Causale del modello 770 (A, B, C…) */
  causalePagamento?: string
}
```

In `FatturaParsata`, dopo `datiBollo` (riga ~146):

```typescript
  // Ritenuta d'acconto
  datiRitenuta?: DatiRitenuta
```

- [ ] **Step 4: Estrarre nel parser**

In `src/lib/sdi/parser.ts`, dove si compone l'oggetto `FatturaParsata` (cercare `formatoTrasmissione: getText(datiTrasmissione.FormatoTrasmissione)` — righe 485 e 943: **entrambe le occorrenze**), aggiungere accanto a `datiBollo`:

```typescript
    datiRitenuta: estraiDatiRitenuta(datiGeneraliDocumento),
```

E la funzione, accanto alle altre di estrazione:

```typescript
/**
 * `DatiRitenuta` sta dentro `DatiGeneraliDocumento`. Nelle parcelle può essere
 * ripetuto (ritenuta erariale e previdenziale insieme): prendiamo il primo,
 * che è quello erariale, e ignoriamo gli altri finché il tema non si riapre.
 */
function estraiDatiRitenuta(datiGeneraliDocumento: unknown): DatiRitenuta | undefined {
  const nodo = (datiGeneraliDocumento as Record<string, unknown>)?.DatiRitenuta
  if (!nodo) return undefined

  const primo = Array.isArray(nodo) ? nodo[0] : nodo
  const r = primo as Record<string, unknown>

  const importoRitenuta = getNumber(r.ImportoRitenuta)
  const tipoRitenuta = getText(r.TipoRitenuta)

  if (!tipoRitenuta && importoRitenuta === 0) return undefined

  const causalePagamento = getText(r.CausalePagamento)

  return {
    tipoRitenuta,
    importoRitenuta,
    aliquotaRitenuta: getNumber(r.AliquotaRitenuta),
    ...(causalePagamento ? { causalePagamento } : {}),
  }
}
```

> Se in `parser.ts` la funzione numerica si chiama diversamente da `getNumber`, usare quella esistente — cercare come viene letto `ImportoTotaleDocumento`. Importare `DatiRitenuta` dal blocco `import type … from './types'` in cima.

- [ ] **Step 5: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/lib/__tests__/sdi-parser.test.ts
```

Atteso: PASS.

- [ ] **Step 6: Aggiungere la colonna e migrare**

In `prisma/schema.prisma`, dentro `model ElectronicInvoice`, sotto `vatSummary`:

```prisma
  /// Ritenuta d'acconto letta dall'XML (DatiRitenuta). Conservata, mai imputata:
  /// il trattamento contabile è sospeso.
  withholding    Json?             @map("withholding")
```

> ⛔ **Non eseguire `prisma migrate dev`.** Il `.env` di questo worktree è un
> collegamento a quello principale, e la sua `DATABASE_URL` punta al Supabase di
> **produzione**: `migrate dev` applicherebbe la migrazione ai dati veri, e
> userebbe anche uno shadow database sullo stesso server. La migrazione qui si
> scrive a mano — è già lo stile del progetto, come si vede dai commenti estesi
> di `prisma/migrations/20260813000002_nota_credito_rettifica/migration.sql`.

Crea `prisma/migrations/20260813120000_ritenuta_su_fattura/migration.sql`:

```sql
-- electronic_invoices.withholding: la ritenuta d'acconto letta dall'XML
-- (DatiRitenuta), conservata e mai imputata. Il trattamento contabile della
-- ritenuta e' sospeso: e' un canale di saldo con ciclo di vita proprio (F24),
-- non una riga da girare a conto. Leggerla e non salvarla la perderebbe; ecco
-- perche' la colonna esiste prima che esista una schermata che la usa.
--
-- Nullable e senza backfill: le fatture gia' importate restano `null`, che e'
-- il loro stato vero — l'unica fonte che puo' popolare il campo e' il flusso di
-- import, che gira solo in avanti.
--
-- Json e non quattro colonne: i quattro campi (tipo, importo, aliquota,
-- causale) si leggono e si scrivono sempre insieme, e nessuno di essi viene
-- mai interrogato da solo. Stessa scelta gia' fatta per `line_items`,
-- `references` e `vat_summary` sulla stessa tabella.
ALTER TABLE "electronic_invoices" ADD COLUMN "withholding" JSONB;
```

Poi rigenera il client — questo comando **non** tocca alcun database:

```bash
nvm use 22 && npx prisma generate
```

I test d'integrazione non hanno bisogno che la migrazione sia applicata: il loro
database modello nasce da `prisma db push` sullo schema (`src/test/integration/global-setup.ts`),
quindi basta che `prisma/schema.prisma` sia aggiornato. In produzione la applica
il deploy, con `migrate deploy`.

- [ ] **Step 7: Salvare il dato all'import**

In `src/app/api/invoices/route.ts`, nella `prisma.electronicInvoice.create`, aggiungere al blocco `data`:

```typescript
        withholding: fattura.datiRitenuta ?? undefined,
```

- [ ] **Step 8: Verificare che la build regga**

```bash
nvm use 22 && npm run build
echo "exit: $?"
```

Atteso: exit 0. (Non incanalare in `tail`: l'exit code diventerebbe quello di `tail`.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/sdi/types.ts src/lib/sdi/parser.ts src/lib/__tests__/sdi-parser.test.ts prisma/ src/app/api/invoices/route.ts
git commit -m "feat(fatture): la ritenuta d'acconto viene letta e conservata, non imputata"
```

---

## Task 4: Sapere quali fatture sono già in archivio, prima di scrivere

CashKing chiede la politica dei duplicati alla cieca e non mostra mai quali lo sono. Noi li dichiariamo in anteprima, riga per riga. Serve una rotta che risponda in blocco.

**Files:**
- Create: `src/app/api/fatture/verifica-duplicati/route.ts`
- Test: `src/app/api/fatture/verifica-duplicati/__tests__/route.itest.ts`

**Interfaces:**
- Produces: `POST /api/fatture/verifica-duplicati`
  - richiesta: `{ fatture: Array<{ chiave: string; numero: string; data: string; partitaIva: string }> }` (max 1000)
  - risposta: `{ duplicati: Array<{ chiave: string; idEsistente: string; statoEsistente: string; importataIl: string }> }`
  - `chiave` è opaca per il server: il client ci mette il nome del file e la usa per riallineare le righe.

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `src/app/api/fatture/verifica-duplicati/__tests__/route.itest.ts`. **Leggi prima `src/app/api/invoices/__tests__/import-idempotente.itest.ts`**: l'impalcatura è quella, e va usata identica — `setupIntegrationDb()`, `loginAs()`, `jsonRequest()`. Niente `vi.mock('@/lib/auth')` scritto a mano, e nessun dato dato per esistente: il test si crea i propri.

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST } from '../route'

setupIntegrationDb()

async function fatturaInArchivio(numero: string, data: string, piva: string) {
  return prisma.electronicInvoice.create({
    data: {
      invoiceNumber: numero,
      invoiceDate: new Date(`${data}T00:00:00.000Z`),
      supplierVat: piva,
      supplierName: 'FORNITORE DI PROVA SRL',
      netAmount: 100,
      vatAmount: 22,
      totalAmount: 122,
      venueId: await venueDiTest(),
    },
  })
}

describe('POST /api/fatture/verifica-duplicati', () => {
  it('segnala solo le fatture già presenti', async () => {
    await loginAs('admin')
    const esistente = await fatturaInArchivio('DUP-1', '2026-06-01', '01234567890')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [
            { chiave: 'gia-vista.xml', numero: 'DUP-1', data: '2026-06-01', partitaIva: '01234567890' },
            { chiave: 'mai-vista.xml', numero: 'MAI-9999', data: '2026-08-01', partitaIva: '01234567890' },
          ],
        },
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicati).toHaveLength(1)
    expect(body.duplicati[0].chiave).toBe('gia-vista.xml')
    expect(body.duplicati[0].idEsistente).toBe(esistente.id)
  })

  it('riconosce la stessa fattura scritta con gli zeri iniziali', async () => {
    await loginAs('admin')
    await fatturaInArchivio('ZERI-1', '2026-06-02', '1234567890')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [{ chiave: 'a.xml', numero: 'ZERI-1', data: '2026-06-02', partitaIva: '0001234567890' }],
        },
      })
    )

    expect((await res.json()).duplicati).toHaveLength(1)
  })

  it('ignora le fatture archiviate', async () => {
    await loginAs('admin')
    const archiviata = await fatturaInArchivio('CANC-1', '2026-06-03', '01234567890')
    await prisma.electronicInvoice.update({
      where: { id: archiviata.id },
      data: { deletedAt: new Date() },
    })

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [{ chiave: 'a.xml', numero: 'CANC-1', data: '2026-06-03', partitaIva: '01234567890' }],
        },
      })
    )

    expect((await res.json()).duplicati).toHaveLength(0)
  })

  it('nega l accesso a chi non è admin o manager', async () => {
    await loginAs('staff')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', { method: 'POST', body: { fatture: [] } })
    )

    expect(res.status).toBe(403)
  })
})
```

> Se `venueDiTest` non è esportata da `@/test/integration/fixtures/closures` con quella firma, apri il file e usa quella vera — l'obiettivo è una sede valida, non questo nome preciso. Il soft-delete passa dall'estensione Prisma: verifica come gli altri `.itest.ts` archiviano un record prima di copiare l'`update` qui sopra.

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/app/api/fatture/verifica-duplicati/__tests__/route.itest.ts
```

Atteso: FAIL — modulo `../route` non trovato.

- [ ] **Step 3: Implementare la rotta**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const schema = z.object({
  fatture: z
    .array(
      z.object({
        chiave: z.string().min(1),
        numero: z.string().min(1),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data attesa in formato YYYY-MM-DD'),
        partitaIva: z.string().min(1),
      })
    )
    .max(1000, 'Troppe fatture in una sola verifica'),
})

/**
 * Dice quali fra le fatture proposte esistono già, in una sola andata e ritorno.
 * Serve a marcare i duplicati in anteprima: l'utente decide sapendo, invece di
 * scoprire a cose fatte quante ne sono state saltate.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { fatture } = schema.parse(await request.json())
    if (fatture.length === 0) return NextResponse.json({ duplicati: [] })

    // Una query sola: si cercano tutte le fatture con uno dei numeri proposti,
    // poi si accoppia in memoria su (numero, data, P.IVA). Filtrare in SQL su
    // tutte e tre le colonne significherebbe un OR con 226 rami.
    const candidate = await prisma.electronicInvoice.findMany({
      where: {
        invoiceNumber: { in: [...new Set(fatture.map((f) => f.numero))] },
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        supplierVat: true,
        status: true,
        importedAt: true,
      },
    })

    const senzaZeri = (piva: string) => piva.replace(/^0+/, '')
    const indice = new Map<string, (typeof candidate)[number]>()
    for (const c of candidate) {
      const giorno = c.invoiceDate.toISOString().slice(0, 10)
      indice.set(`${c.invoiceNumber}|${giorno}|${senzaZeri(c.supplierVat)}`, c)
    }

    const duplicati = fatture.flatMap((f) => {
      const trovata = indice.get(`${f.numero}|${f.data}|${senzaZeri(f.partitaIva)}`)
      if (!trovata) return []
      return [
        {
          chiave: f.chiave,
          idEsistente: trovata.id,
          statoEsistente: trovata.status,
          importataIl: trovata.importedAt.toISOString(),
        },
      ]
    })

    return NextResponse.json({ duplicati })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    logger.error('Errore POST /api/fatture/verifica-duplicati', error)
    return NextResponse.json({ error: 'Errore nella verifica dei duplicati' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/app/api/fatture/verifica-duplicati/__tests__/route.itest.ts
```

Atteso: PASS, 3 test.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fatture/verifica-duplicati/
git commit -m "feat(import): una rotta dice in blocco quali fatture sono già in archivio"
```

---

## Task 5: I termini di pagamento in conflitto

Quando la fattura porta una scadenza che implica termini diversi da quelli concordati col fornitore, l'utente deve poter scegliere quale vince — invece di subire il file in silenzio, come accade oggi.

**Files:**
- Create: `src/app/api/fatture/conflitti-termini/route.ts`
- Test: `src/app/api/fatture/conflitti-termini/__tests__/route.itest.ts`

**Interfaces:**
- Produces: `POST /api/fatture/conflitti-termini`
  - richiesta: `{ fatture: Array<{ chiave: string; partitaIva: string; denominazione: string; giorniDalFile: number | null; aliquote: number[] }> }`
  - risposta: `{ conflitti: Array<{ partitaIva: string; denominazione: string; giorniDalFile: number; giorniAnagrafica: number; aliquote: number[]; chiavi: string[] }> }`
  - `chiavi` elenca le fatture toccate: serve a scrivere «Trovate N fatture con valori in conflitto».
  - `aliquote` viaggia solo come **contesto da mostrare** accanto ai termini, mai confrontata: senza un'aliquota predefinita per fornitore non esiste nulla con cui confrontarla. Lo fa anche CashKing — nella loro finestra la colonna dei valori predefiniti riporta i soli giorni.

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

setupIntegrationDb()

const richiesta = (body: unknown) =>
  jsonRequest('/api/fatture/conflitti-termini', { method: 'POST', body })

beforeEach(async () => {
  await loginAs('admin')
})

describe('POST /api/fatture/conflitti-termini', () => {
  it('segnala il fornitore i cui termini divergono dal file', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'PROVA CONFLITTI SRL', vatNumber: '99999999999', paymentTermsDays: 60 },
    })

    const res = await POST(richiesta({
      fatture: [
        { chiave: 'a.xml', partitaIva: '99999999999', denominazione: 'PROVA CONFLITTI SRL', giorniDalFile: 30, aliquote: [22] },
        { chiave: 'b.xml', partitaIva: '99999999999', denominazione: 'PROVA CONFLITTI SRL', giorniDalFile: 30, aliquote: [10] },
      ],
    }))

    const body = await res.json()
    expect(body.conflitti).toHaveLength(1)
    expect(body.conflitti[0]).toMatchObject({
      partitaIva: '99999999999',
      giorniDalFile: 30,
      giorniAnagrafica: 60,
    })
    expect(body.conflitti[0].chiavi).toEqual(['a.xml', 'b.xml'])
    // Le aliquote si accumulano come contesto, senza generare conflitto
    expect(body.conflitti[0].aliquote).toEqual([22, 10])

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando i termini coincidono', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'CONCORDE SRL', vatNumber: '88888888888', paymentTermsDays: 30 },
    })
    const res = await POST(richiesta({
      fatture: [{ chiave: 'a.xml', partitaIva: '88888888888', denominazione: 'CONCORDE SRL', giorniDalFile: 30 }],
    }))
    expect((await res.json()).conflitti).toHaveLength(0)
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando il fornitore non ha termini concordati', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'SENZA TERMINI SRL', vatNumber: '77777777777', paymentTermsDays: null },
    })
    const res = await POST(richiesta({
      fatture: [{ chiave: 'a.xml', partitaIva: '77777777777', denominazione: 'SENZA TERMINI SRL', giorniDalFile: 15 }],
    }))
    expect((await res.json()).conflitti).toHaveLength(0)
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando il file non porta alcuna scadenza', async () => {
    const res = await POST(richiesta({
      fatture: [{ chiave: 'a.xml', partitaIva: '99999999999', denominazione: 'X', giorniDalFile: null }],
    }))
    expect((await res.json()).conflitti).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/app/api/fatture/conflitti-termini/__tests__/route.itest.ts
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const schema = z.object({
  fatture: z
    .array(
      z.object({
        chiave: z.string().min(1),
        partitaIva: z.string().min(1),
        denominazione: z.string(),
        giorniDalFile: z.number().int().nullable(),
        aliquote: z.array(z.number()).default([]),
      })
    )
    .max(1000),
})

/**
 * Confronta i termini che la fattura implica (scadenza meno data documento) con
 * quelli concordati in anagrafica. Si raggruppa per partita IVA, non per nome:
 * il nome è testo libero e nello stesso archivio lo stesso soggetto compare come
 * «WEISS S.R.L.», «Weiss s.r.l.» e «WEISS SRL SOCIO UNICO».
 *
 * L'aliquota IVA non entra nel confronto: non esiste un'aliquota predefinita per
 * fornitore, e mostrarne una sarebbe promettere un'automazione che non c'è.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { fatture } = schema.parse(await request.json())
    const conTermini = fatture.filter((f) => f.giorniDalFile !== null)
    if (conTermini.length === 0) return NextResponse.json({ conflitti: [] })

    const partiteIva = [...new Set(conTermini.map((f) => f.partitaIva))]
    const fornitori = await prisma.supplier.findMany({
      where: { vatNumber: { in: partiteIva }, isActive: true },
      select: { vatNumber: true, name: true, paymentTermsDays: true },
    })

    const terminiPerPiva = new Map(
      fornitori
        .filter((f) => f.vatNumber && f.paymentTermsDays !== null)
        .map((f) => [f.vatNumber as string, { giorni: f.paymentTermsDays as number, nome: f.name }])
    )

    const perPiva = new Map<
      string,
      {
        denominazione: string
        giorniDalFile: number
        giorniAnagrafica: number
        aliquote: number[]
        chiavi: string[]
      }
    >()

    for (const f of conTermini) {
      const anagrafica = terminiPerPiva.get(f.partitaIva)
      if (!anagrafica) continue
      if (anagrafica.giorni === f.giorniDalFile) continue

      const esistente = perPiva.get(f.partitaIva)
      if (esistente) {
        esistente.chiavi.push(f.chiave)
        for (const aliquota of f.aliquote) {
          if (!esistente.aliquote.includes(aliquota)) esistente.aliquote.push(aliquota)
        }
        continue
      }

      perPiva.set(f.partitaIva, {
        denominazione: anagrafica.nome || f.denominazione,
        giorniDalFile: f.giorniDalFile as number,
        giorniAnagrafica: anagrafica.giorni,
        aliquote: [...f.aliquote],
        chiavi: [f.chiave],
      })
    }

    return NextResponse.json({
      conflitti: [...perPiva.entries()].map(([partitaIva, dati]) => ({ partitaIva, ...dati })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    logger.error('Errore POST /api/fatture/conflitti-termini', error)
    return NextResponse.json({ error: 'Errore nel calcolo dei conflitti' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/app/api/fatture/conflitti-termini/__tests__/route.itest.ts
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fatture/conflitti-termini/
git commit -m "feat(import): rileva i termini di pagamento in conflitto con l'anagrafica"
```

---

## Task 6: Leggere i file nel browser

Il pezzo che trasforma `File[]` in righe d'anteprima, senza toccare la rete.

**Files:**
- Create: `src/lib/sdi/lettura-file.ts`
- Test: `src/lib/sdi/__tests__/lettura-file.test.ts`

**Interfaces:**
- Consumes: `extractInvoicesFromZip`, `isZipFile`, `isFileMetadatoAdE` (Task 1); `segnoDiPresentazione` (Task 2); `extractXmlFromP7mWithDiagnostics`, `isP7mFile`; `parseFatturaPASafe`, `calcolaImporti`, `estraiScadenze`.
- Produces:

```typescript
export interface FatturaLetta {
  chiave: string            // nome del file: identifica la riga in tutto il flusso
  nomeFile: string
  xmlContent: string
  daZip: string | null      // nome dell'archivio di provenienza
  numero: string
  data: string              // YYYY-MM-DD
  tipoDocumento: string
  denominazioneFornitore: string
  partitaIvaFornitore: string
  denominazioneCliente: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  aliquote: number[]        // tutte, non una sola
  primaScadenza: string | null
  scadenzaStimata: boolean
  giorniDalFile: number | null
  ritenuta: { importo: number; aliquota: number; tipo: string } | null
}

export interface EsitoLettura {
  fatture: FatturaLetta[]
  scartati: Array<{ nomeFile: string; motivo: string }>
  metadatiIgnorati: number
}

export async function leggiFileFattura(files: File[]): Promise<EsitoLettura>
```

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'
import { leggiFileFattura } from '../lettura-file'

// Stesso generatore degli itest, estratto nel Task 3: un solo FatturaPA di
// prova in tutto il progetto, non uno per file di test.
const XML_MINIMO = xmlFattura({ numero: '42', data: '2026-06-01', piva: '07945211006' })

function fileDaTesto(nome: string, testo: string): File {
  return new File([new Blob([testo])], nome, { type: 'application/xml' })
}

describe('leggiFileFattura', () => {
  it('legge un XML sciolto', async () => {
    const esito = await leggiFileFattura([fileDaTesto('IT07945211006_001.xml', XML_MINIMO)])

    expect(esito.fatture).toHaveLength(1)
    expect(esito.fatture[0]).toMatchObject({
      chiave: 'IT07945211006_001.xml',
      numero: '42',
      data: '2026-06-01',
      tipoDocumento: 'TD01',
      denominazioneFornitore: 'Torrefazione di prova Srl',
      partitaIvaFornitore: '07945211006',
      totalAmount: 122,
      netAmount: 100,
      vatAmount: 22,
      primaScadenza: '2026-07-01',
      scadenzaStimata: false,
      giorniDalFile: 30,
      daZip: null,
      ritenuta: null,
    })
    expect(esito.fatture[0].aliquote).toEqual([22])
  })

  it('spacchetta uno ZIP e ricorda da dove viene ogni fattura', async () => {
    const zip = new JSZip()
    zip.file('cartella/IT07945211006_001.xml', XML_MINIMO)
    zip.file('cartella/IT07945211006_001_metaDato.xml', '<metadati/>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const fileZip = new File([new Blob([buffer])], 'agosto.zip', { type: 'application/zip' })

    const esito = await leggiFileFattura([fileZip])

    expect(esito.fatture).toHaveLength(1)
    expect(esito.fatture[0].daZip).toBe('agosto.zip')
    expect(esito.metadatiIgnorati).toBe(1)
  })

  it('mette fra gli scartati il file che non si riesce a leggere', async () => {
    const esito = await leggiFileFattura([fileDaTesto('rotto.xml', '<non-una-fattura/>')])
    expect(esito.fatture).toHaveLength(0)
    expect(esito.scartati).toHaveLength(1)
    expect(esito.scartati[0].nomeFile).toBe('rotto.xml')
    expect(esito.scartati[0].motivo).toBeTruthy()
  })

  it('mostra in negativo una nota di credito, senza toccare l XML', async () => {
    const notaCredito = XML_MINIMO.replace('<TipoDocumento>TD01<', '<TipoDocumento>TD04<')
    const esito = await leggiFileFattura([fileDaTesto('nota.xml', notaCredito)])

    expect(esito.fatture[0].totalAmount).toBe(-122)
    expect(esito.fatture[0].netAmount).toBe(-100)
    expect(esito.fatture[0].vatAmount).toBe(-22)
    // L'XML che andrà al server resta quello originale, intatto
    expect(esito.fatture[0].xmlContent).toContain('<ImportoTotaleDocumento>122.00<')
  })

  it('marca come stimata la scadenza che l XML non porta', async () => {
    const senzaScadenza = XML_MINIMO.replace(
      '<DataScadenzaPagamento>2026-07-01</DataScadenzaPagamento>',
      ''
    )
    const esito = await leggiFileFattura([fileDaTesto('senza.xml', senzaScadenza)])
    expect(esito.fatture[0].scadenzaStimata).toBe(true)
    expect(esito.fatture[0].giorniDalFile).toBeNull()
  })
})
```

> `giorniDalFile` è **null** quando la scadenza è stimata: una stima non è un termine concordato e non deve generare falsi conflitti.

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/lib/sdi/__tests__/lettura-file.test.ts
```

Atteso: FAIL — modulo `../lettura-file` non trovato.

- [ ] **Step 3: Implementare**

```typescript
/**
 * Da file scelti dall'utente a righe d'anteprima, tutto nel browser.
 *
 * Il parser dipende solo da fast-xml-parser e p7m-utils lavora già sugli
 * ArrayBuffer: non serve mandare nulla al server per mostrare l'anteprima.
 * Il server riceverà poi soltanto gli XML delle fatture davvero scelte, e li
 * riparserà — il client non è mai la fonte di verità.
 */
import { extractInvoicesFromZip, isZipFile, createFileFromExtracted } from '@/lib/zip-utils'
import { extractXmlFromP7mWithDiagnostics, isP7mFile } from '@/lib/p7m-utils'
import { segnoDiPresentazione } from '@/lib/invoices/segno-documento'
import { parseFatturaPASafe, calcolaImporti, estraiScadenze } from './parser'

export interface FatturaLetta { /* …come da blocco Interfaces… */ }
export interface EsitoLettura { /* …come da blocco Interfaces… */ }

const MILLISECONDI_AL_GIORNO = 24 * 60 * 60 * 1000

function giorniFra(dataFattura: string, scadenza: Date): number {
  const partenza = new Date(`${dataFattura}T00:00:00.000Z`).getTime()
  return Math.round((scadenza.getTime() - partenza) / MILLISECONDI_AL_GIORNO)
}

export async function leggiFileFattura(files: File[]): Promise<EsitoLettura> {
  const fatture: FatturaLetta[] = []
  const scartati: Array<{ nomeFile: string; motivo: string }> = []
  let metadatiIgnorati = 0

  // Prima si spacchettano gli archivi, poi si legge tutto con lo stesso codice.
  const daLeggere: Array<{ file: File; daZip: string | null }> = []

  for (const file of files) {
    if (!isZipFile(file.name)) {
      daLeggere.push({ file, daZip: null })
      continue
    }
    try {
      const risultato = await extractInvoicesFromZip(await file.arrayBuffer(), file.name)
      metadatiIgnorati += risultato.stats.metadataFiles
      for (const estratto of risultato.files) {
        daLeggere.push({ file: createFileFromExtracted(estratto), daZip: file.name })
      }
      for (const errore of risultato.errors) {
        scartati.push({ nomeFile: errore.fileName ?? file.name, motivo: errore.message })
      }
    } catch (errore) {
      scartati.push({
        nomeFile: file.name,
        motivo: errore instanceof Error ? errore.message : "Archivio illeggibile",
      })
    }
  }

  for (const { file, daZip } of daLeggere) {
    try {
      let xmlContent: string
      if (isP7mFile(file.name)) {
        const sbustato = extractXmlFromP7mWithDiagnostics(await file.arrayBuffer(), file.name)
        if (!sbustato.success || !sbustato.xml) {
          scartati.push({ nomeFile: file.name, motivo: sbustato.error ?? 'Firma P7M illeggibile' })
          continue
        }
        xmlContent = sbustato.xml
      } else {
        xmlContent = await file.text()
      }

      const esito = parseFatturaPASafe(xmlContent, file.name)
      if (!esito.success || !esito.data) {
        scartati.push({
          nomeFile: file.name,
          motivo: esito.errors.map((e) => e.message).join('; ') || 'Documento non riconosciuto',
        })
        continue
      }

      const fattura = esito.data
      const importi = calcolaImporti(fattura)
      const scadenze = estraiScadenze(fattura)
      const prima = scadenze[0]

      fatture.push({
        chiave: file.name,
        nomeFile: file.name,
        xmlContent,
        daZip,
        numero: fattura.numero,
        data: fattura.data,
        tipoDocumento: fattura.tipoDocumento,
        denominazioneFornitore: fattura.cedentePrestatore.denominazione,
        partitaIvaFornitore: fattura.cedentePrestatore.partitaIva,
        denominazioneCliente: fattura.cessionarioCommittente.denominazione,
        // Segno di sola presentazione: una nota di credito va letta in negativo
        // in un elenco. Il dato che andrà al server resta l'XML originale.
        netAmount: segnoDiPresentazione(fattura.tipoDocumento, importi.netAmount),
        vatAmount: segnoDiPresentazione(fattura.tipoDocumento, importi.vatAmount),
        totalAmount: segnoDiPresentazione(fattura.tipoDocumento, importi.totalAmount),
        aliquote: [...new Set(fattura.datiRiepilogo.map((r) => r.aliquotaIVA))].sort((a, b) => a - b),
        primaScadenza: prima ? prima.dueDate.toISOString().slice(0, 10) : null,
        scadenzaStimata: prima ? prima.dataStimata === true : false,
        giorniDalFile: prima && !prima.dataStimata ? giorniFra(fattura.data, prima.dueDate) : null,
        ritenuta: fattura.datiRitenuta
          ? {
              importo: fattura.datiRitenuta.importoRitenuta,
              aliquota: fattura.datiRitenuta.aliquotaRitenuta,
              tipo: fattura.datiRitenuta.tipoRitenuta,
            }
          : null,
      })
    } catch (errore) {
      scartati.push({
        nomeFile: file.name,
        motivo: errore instanceof Error ? errore.message : 'Errore di lettura',
      })
    }
  }

  return { fatture, scartati, metadatiIgnorati }
}
```

> Se due file omonimi arrivano da archivi diversi, `chiave` collide. Renderla univoca in coda alla funzione, prima del `return`:
> ```typescript
> const viste = new Map<string, number>()
> for (const f of fatture) {
>   const quante = viste.get(f.chiave) ?? 0
>   viste.set(f.chiave, quante + 1)
>   if (quante > 0) f.chiave = `${f.chiave}#${quante + 1}`
> }
> ```

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/lib/sdi/__tests__/lettura-file.test.ts
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sdi/lettura-file.ts src/lib/sdi/__tests__/lettura-file.test.ts
git commit -m "feat(import): lettura di XML, P7M e ZIP nel browser, senza rete"
```

---

## Task 7: Passo 1 — opzioni e scelta dei file

Riproduce la prima schermata di CashKing: l'interruttore sull'anagrafica, la politica dei duplicati con **«Salta le righe duplicate» spuntata di default**, la zona di rilascio con i formati dichiarati e il contatore dei file scelti.

**Files:**
- Create: `src/components/fatture/importa/tipi.ts`
- Create: `src/components/fatture/importa/PassoCaricamento.tsx`
- Test: `src/components/fatture/importa/__tests__/PassoCaricamento.test.tsx`

**Interfaces:**
- Produces in `tipi.ts`:

```typescript
export type PoliticaDuplicati = 'salta' | 'sostituisci'

export interface OpzioniImport {
  sovrascriviAnagrafica: boolean
  politicaDuplicati: PoliticaDuplicati
}

export const OPZIONI_PREDEFINITE: OpzioniImport = {
  sovrascriviAnagrafica: false,
  politicaDuplicati: 'salta',
}

export type StatoRiga = 'importata' | 'duplicata' | 'errore' | 'esclusa'
```

- Produces: `<PassoCaricamento opzioni onOpzioniChange fileScelti onFileScelti inLettura />`

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PassoCaricamento } from '../PassoCaricamento'
import { OPZIONI_PREDEFINITE } from '../tipi'

describe('PassoCaricamento', () => {
  it('parte con «Salta le righe duplicate» selezionata e l anagrafica non sovrascritta', () => {
    render(
      <PassoCaricamento
        opzioni={OPZIONI_PREDEFINITE}
        onOpzioniChange={vi.fn()}
        fileScelti={[]}
        onFileScelti={vi.fn()}
        inLettura={false}
      />
    )

    expect(screen.getByRole('radio', { name: /salta le righe duplicate/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /sostituisci con i nuovi dati/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /sovrascrivi dati anagrafici/i })).not.toBeChecked()
  })

  it('dichiara i formati accettati', () => {
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )
    const testo = screen.getByText(/formati supportati/i).textContent ?? ''
    expect(testo).toContain('XML')
    expect(testo).toContain('P7M')
    expect(testo).toContain('ZIP')
    expect(testo).toContain('_metaDato.xml')
  })

  it('mostra quanti file sono stati scelti', () => {
    const tre = [
      new File(['x'], 'a.xml'),
      new File(['x'], 'b.xml.p7m'),
      new File(['x'], 'c.xml'),
    ]
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={tre} onFileScelti={vi.fn()} inLettura={false} />
    )
    expect(screen.getByText('3 file selezionati')).toBeInTheDocument()
    expect(screen.getByText('a.xml')).toBeInTheDocument()
  })

  it('riferisce la scelta della politica duplicati', async () => {
    const onOpzioniChange = vi.fn()
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={onOpzioniChange} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )

    fireEvent.click(screen.getByRole('radio', { name: /sostituisci con i nuovi dati/i }))

    expect(onOpzioniChange).toHaveBeenCalledWith(
      expect.objectContaining({ politicaDuplicati: 'sostituisci' })
    )
  })

  it('accetta anche gli archivi nel campo file', () => {
    const { container } = render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', '.xml,.p7m,.zip,.XML,.P7M,.ZIP')
    expect(input).toHaveAttribute('multiple')
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/PassoCaricamento.test.tsx
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare `tipi.ts`**

Copiare il blocco `Interfaces` qui sopra in `src/components/fatture/importa/tipi.ts`.

- [ ] **Step 4: Implementare `PassoCaricamento.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileCode2Icon, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpzioniImport, PoliticaDuplicati } from './tipi'

const FORMATI_ACCETTATI = '.xml,.p7m,.zip,.XML,.P7M,.ZIP'

interface Props {
  opzioni: OpzioniImport
  onOpzioniChange: (opzioni: OpzioniImport) => void
  fileScelti: File[]
  onFileScelti: (files: File[]) => void
  inLettura: boolean
}

export function PassoCaricamento({ opzioni, onOpzioniChange, fileScelti, onFileScelti, inLettura }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [trascinamento, setTrascinamento] = useState(false)

  const aggiungi = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return
    onFileScelti([...fileScelti, ...Array.from(lista)])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Checkbox
          id="sovrascrivi-anagrafica"
          checked={opzioni.sovrascriviAnagrafica}
          onCheckedChange={(valore) =>
            onOpzioniChange({ ...opzioni, sovrascriviAnagrafica: valore === true })
          }
        />
        <div className="space-y-1">
          <Label htmlFor="sovrascrivi-anagrafica" className="font-medium">
            Sovrascrivi dati anagrafici esistenti
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, i dati anagrafici (indirizzo, P.IVA, città) dei fornitori già presenti
            vengono aggiornati con quelli del file importato.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">Come gestire i duplicati?</p>
        <RadioGroup
          value={opzioni.politicaDuplicati}
          onValueChange={(valore) =>
            onOpzioniChange({ ...opzioni, politicaDuplicati: valore as PoliticaDuplicati })
          }
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="salta" id="duplicati-salta" />
            <Label htmlFor="duplicati-salta" className="font-normal cursor-pointer">
              Salta le righe duplicate (mantieni i dati esistenti)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sostituisci" id="duplicati-sostituisci" />
            <Label htmlFor="duplicati-sostituisci" className="font-normal cursor-pointer">
              Sostituisci con i nuovi dati
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div
        className={cn(
          'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          trascinamento && 'border-primary bg-primary/5'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setTrascinamento(true)
        }}
        onDragLeave={() => setTrascinamento(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTrascinamento(false)
          aggiungi(e.dataTransfer.files)
        }}
      >
        <FileCode2Icon className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 font-medium">Seleziona uno o più file di fattura elettronica</p>
        <p className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground">
          Formati supportati: XML, P7M (FPA12, FPR12, FSM10), ZIP mensile dell&apos;Agenzia delle
          Entrate. I file _metaDato.xml vengono ignorati automaticamente.
        </p>

        {fileScelti.length > 0 && (
          <div className="mt-4 space-y-2">
            <Badge variant="secondary">{fileScelti.length} file selezionati</Badge>
            <ul className="mx-auto max-h-40 max-w-md space-y-0.5 overflow-y-auto text-left text-xs text-muted-foreground">
              {fileScelti.slice(0, 10).map((file, indice) => (
                <li key={`${file.name}-${indice}`} className="truncate">{file.name}</li>
              ))}
              {fileScelti.length > 10 && <li>… e altri {fileScelti.length - 10}</li>}
            </ul>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={FORMATI_ACCETTATI}
          multiple
          className="hidden"
          onChange={(e) => {
            aggiungi(e.target.files)
            e.target.value = ''
          }}
        />

        <Button type="button" className="mt-4" onClick={() => inputRef.current?.click()} disabled={inLettura}>
          {inLettura ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Lettura in corso…
            </>
          ) : (
            'Seleziona File'
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/PassoCaricamento.test.tsx
```

Atteso: PASS, 5 test.

- [ ] **Step 6: Commit**

```bash
git add src/components/fatture/importa/tipi.ts src/components/fatture/importa/PassoCaricamento.tsx src/components/fatture/importa/__tests__/PassoCaricamento.test.tsx
git commit -m "feat(import): passo 1 con opzioni duplicati e conteggio dei file scelti"
```

---

## Task 8: Passo 2 — l'anteprima delle fatture trovate

La tabella di CashKing, con due cose che loro non hanno: il **duplicato marcato** e la possibilità di **escludere una riga**.

**Files:**
- Create: `src/components/fatture/importa/PassoAnteprima.tsx`
- Test: `src/components/fatture/importa/__tests__/PassoAnteprima.test.tsx`

**Interfaces:**
- Consumes: `FatturaLetta` (Task 6).
- Produces:

```typescript
export interface RigaAnteprima extends FatturaLetta {
  duplicata: boolean
  esclusa: boolean
}
```
- Produces: `<PassoAnteprima righe onEsclusioneChange metadatiIgnorati scartati />`

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { PassoAnteprima } from '../PassoAnteprima'
import type { RigaAnteprima } from '../PassoAnteprima'

const riga = (sovrascrivi: Partial<RigaAnteprima> = {}): RigaAnteprima => ({
  chiave: 'IT07945211006_001.xml',
  nomeFile: 'IT07945211006_001.xml',
  xmlContent: '<x/>',
  daZip: null,
  numero: '42',
  data: '2026-06-01',
  tipoDocumento: 'TD01',
  denominazioneFornitore: 'Torrefazione di prova Srl',
  partitaIvaFornitore: '07945211006',
  denominazioneCliente: 'Weiss Cafe',
  netAmount: 100,
  vatAmount: 22,
  totalAmount: 122,
  aliquote: [22],
  primaScadenza: '2026-07-01',
  scadenzaStimata: false,
  giorniDalFile: 30,
  ritenuta: null,
  duplicata: false,
  esclusa: false,
  ...sovrascrivi,
})

describe('PassoAnteprima', () => {
  it('conta le fatture trovate', () => {
    render(<PassoAnteprima righe={[riga(), riga({ chiave: 'b.xml' })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('2 fatture trovate nei file caricati')).toBeInTheDocument()
  })

  it('marca le fatture già in archivio', () => {
    render(<PassoAnteprima righe={[riga({ duplicata: true })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('Duplicato')).toBeInTheDocument()
  })

  it('dice quando la scadenza è una stima, invece di spacciarla per letta', () => {
    render(<PassoAnteprima righe={[riga({ scadenzaStimata: true, primaScadenza: '2026-07-01' })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByTitle(/stimata/i)).toBeInTheDocument()
  })

  it('mostra tutte le aliquote quando il documento ne ha più di una', () => {
    render(<PassoAnteprima righe={[riga({ aliquote: [4, 10, 22] })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText('4% · 10% · 22%')).toBeInTheDocument()
  })

  it('mostra la ritenuta con la sua aliquota', () => {
    render(<PassoAnteprima righe={[riga({ ritenuta: { importo: 83.33, aliquota: 20, tipo: 'RT02' } })]} onEsclusioneChange={vi.fn()} metadatiIgnorati={0} scartati={[]} />)
    expect(screen.getByText(/83,33/)).toBeInTheDocument()
    expect(screen.getByText(/20%/)).toBeInTheDocument()
  })

  it('permette di escludere una riga', async () => {
    const onEsclusioneChange = vi.fn()
    render(<PassoAnteprima righe={[riga()]} onEsclusioneChange={onEsclusioneChange} metadatiIgnorati={0} scartati={[]} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /includi/i }))

    expect(onEsclusioneChange).toHaveBeenCalledWith('IT07945211006_001.xml', true)
  })

  it('segnala i file scartati e i metadati ignorati', () => {
    render(
      <PassoAnteprima
        righe={[riga()]}
        onEsclusioneChange={vi.fn()}
        metadatiIgnorati={3}
        scartati={[{ nomeFile: 'rotto.xml', motivo: 'Documento non riconosciuto' }]}
      />
    )
    expect(screen.getByText(/3 file di metadati/i)).toBeInTheDocument()
    expect(screen.getByText(/rotto\.xml/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/PassoAnteprima.test.tsx
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Tabella con `@/components/ui/table`, importi via `formatCurrency` da `@/lib/formatters`, date in `gg/mm/aaaa`. Colonne, nell'ordine: casella «Includi» · `#` · File · Numero · Tipo Doc. · Data · Scadenza · Fornitore · Cliente · Netto · IVA % · Lordo · Ritenuta · Stato.

Punti che i test fissano:
- intestazione: `{righe.length} fatture trovate nei file caricati`;
- riga duplicata: `<Badge variant="secondary">Duplicato</Badge>` e riga in `opacity-60`;
- scadenza stimata: accanto alla data un'icona con `title="Scadenza stimata: l'XML non riporta la data di pagamento"`;
- aliquote: `righe.aliquote.map((a) => `${a}%`).join(' · ')`;
- ritenuta: `{formatCurrency(r.ritenuta.importo)} ({r.ritenuta.aliquota}%)`, altrimenti `—`;
- casella per riga con `aria-label={`Includi ${r.nomeFile}`}`, `checked={!r.esclusa}`, che chiama `onEsclusioneChange(chiave, esclusa)`;
- sotto la tabella, quando presenti: `{metadatiIgnorati} file di metadati dell'Agenzia ignorati` e l'elenco degli scartati con il motivo.

Con molte righe, avvolgere la tabella in `<div className="max-h-[52vh] overflow-y-auto">`.

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/PassoAnteprima.test.tsx
```

Atteso: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/fatture/importa/PassoAnteprima.tsx src/components/fatture/importa/__tests__/PassoAnteprima.test.tsx
git commit -m "feat(import): anteprima delle fatture trovate, coi duplicati già marcati"
```

---

## Task 9: La finestra dei termini in conflitto

**Files:**
- Create: `src/components/fatture/importa/DialogConflitti.tsx`
- Test: `src/components/fatture/importa/__tests__/DialogConflitti.test.tsx`

**Interfaces:**
- Produces:

```typescript
export interface ConflittoTermini {
  partitaIva: string
  denominazione: string
  giorniDalFile: number
  giorniAnagrafica: number
  /** Solo contesto da mostrare accanto ai termini: non entra nel confronto. */
  aliquote: number[]
  chiavi: string[]
}

export type SceltaConflitto = 'importazione' | 'anagrafica'

interface Props {
  aperto: boolean
  conflitti: ConflittoTermini[]
  onAnnulla: () => void
  onContinua: (scelte: Record<string, SceltaConflitto>) => void  // chiave = partita IVA
}
```

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DialogConflitti } from '../DialogConflitti'

const conflitti = [
  { partitaIva: '111', denominazione: 'ROMA GIANFRANCO SRL', giorniDalFile: 1, giorniAnagrafica: 3, aliquote: [10], chiavi: ['a.xml', 'b.xml'] },
  { partitaIva: '222', denominazione: 'Cromo SRL', giorniDalFile: 0, giorniAnagrafica: 3, aliquote: [22], chiavi: ['c.xml'] },
]

describe('DialogConflitti', () => {
  it('conta le fatture toccate, non i fornitori', () => {
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={vi.fn()} />)
    expect(screen.getByText(/trovate 3 fatture con valori in conflitto/i)).toBeInTheDocument()
  })

  it('propone «Importazione» per tutti come scelta iniziale', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'importazione', '222': 'importazione' })
  })

  it('cambia una riga sola senza toccare le altre', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /usa l['\u2019\s]anagrafica per ROMA GIANFRANCO SRL/i }))
    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'anagrafica', '222': 'importazione' })
  })

  it('risolve tutto in blocco con «Tutti Anagrafica»', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /tutti anagrafica/i }))
    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'anagrafica', '222': 'anagrafica' })
  })

  it('mostra i due valori a confronto', () => {
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={vi.fn()} />)
    expect(screen.getByText('1 giorno data fattura')).toBeInTheDocument()
    expect(screen.getAllByText('3 giorni data fattura')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/DialogConflitti.test.tsx
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare**

Struttura (con `Dialog` di shadcn):

- Titolo: **«Termini di pagamento in conflitto»**.
- Sottotitolo: `Trovate {totaleFatture} fatture con valori in conflitto. Per alcuni fornitori i termini di pagamento del file non corrispondono a quelli concordati in anagrafica.` — dove `totaleFatture = conflitti.reduce((somma, c) => somma + c.chiavi.length, 0)`.
- Riga «Selezione massiva:» con due `Button` — `Tutti Importazione` e `Tutti Anagrafica`.
- Tabella: Fornitore · Valori dal file · Predefiniti anagrafica · Usa.
  - «Valori dal file» porta due badge, come nella schermata di riferimento: `IVA: {aliquote.join('/')}%` e `{giorniInParole(giorniDalFile)}`. Il primo è contesto, non è in conflitto con nulla.
  - «Predefiniti anagrafica» porta il solo badge `{giorniInParole(giorniAnagrafica)}`.
- Per riga due `Button`: quello attivo `variant="default"`, l'altro `variant="outline"`; `aria-label={`Usa l'importazione per ${c.denominazione}`}` e `aria-label={`Usa l'anagrafica per ${c.denominazione}`}` — con l'apostrofo: è testo che un lettore di schermo pronuncia.
- In fondo: `Annulla` e `Continua Importazione`.

Formattazione dei giorni (i test la fissano):

```typescript
const giorniInParole = (giorni: number) =>
  giorni === 1 ? '1 giorno data fattura' : `${giorni} giorni data fattura`
```

Stato interno inizializzato a `importazione` per ogni partita IVA, ricalcolato con `useEffect` quando cambia `conflitti`.

- [ ] **Step 4: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/DialogConflitti.test.tsx
```

Atteso: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add src/components/fatture/importa/DialogConflitti.tsx src/components/fatture/importa/__tests__/DialogConflitti.test.tsx
git commit -m "feat(import): finestra dei termini in conflitto, per fornitore o in blocco"
```

---

## Task 10: L'import accetta la politica e i termini scelti

Il server deve poter **sostituire** una fattura esistente e applicare i termini decisi nella finestra dei conflitti.

**Files:**
- Modify: `src/app/api/invoices/route.ts:66-86` (schema), `:381-395` (duplicato), `:475-485` (scadenze)
- Test: `src/app/api/invoices/__tests__/import-politica-duplicati.itest.ts`

**Interfaces:**
- Consumes: `importInvoiceSchema` esistente.
- Produces: tre campi nuovi nel corpo di `POST /api/invoices`:
  - `politicaDuplicati: 'salta' | 'sostituisci'` (default `'salta'`)
  - `giorniPagamentoScelti?: number` — vince sui termini dell'anagrafica quando presente.
  - `sovrascriviAnagrafica: boolean` (default `false`) — se vero, aggiorna indirizzo, città, provincia, CAP e codice fiscale del fornitore già esistente con quelli del documento.
- Produces: con `'salta'` la risposta resta `409 { error, existingId }`; con `'sostituisci'` la fattura esistente viene messa in `deletedAt` e ne nasce una nuova, risposta `201 { id, sostituisce: <idVecchio> }`.
- Produces: la risposta di successo include sempre `fornitoreCreato: boolean` — è il dato che alimenta «Fornitori creati» nella verifica di integrità (Task 11).

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'
import { POST } from '../route'

setupIntegrationDb()

const richiesta = (body: unknown) => jsonRequest('/api/invoices', { method: 'POST', body })

beforeEach(async () => {
  await loginAs('admin')
})

describe('POST /api/invoices — politica duplicati', () => {
  const XML = xmlFattura({ numero: 'POL-1', data: '2026-06-01', piva: '01234567890' })
  const base = { xmlContent: XML, fileName: 'f.xml', venueId: 'auto', createSupplier: true }

  it('con «salta» rifiuta il duplicato con 409', async () => {
    await POST(richiesta(base))
    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'salta' }))

    expect(seconda.status).toBe(409)
    expect((await seconda.json()).existingId).toBeTruthy()
  })

  it('con «sostituisci» archivia la vecchia e ne crea una nuova', async () => {
    const prima = await POST(richiesta(base))
    const idVecchio = (await prima.json()).id

    const seconda = await POST(richiesta({ ...base, politicaDuplicati: 'sostituisci' }))
    expect(seconda.status).toBe(201)

    const corpo = await seconda.json()
    expect(corpo.sostituisce).toBe(idVecchio)
    expect(corpo.id).not.toBe(idVecchio)

    // La vecchia non si cancella: si archivia.
    const vecchia = await prisma.electronicInvoice.findUnique({ where: { id: idVecchio } })
    expect(vecchia?.deletedAt).not.toBeNull()
  })

  it('dice se il fornitore è stato creato', async () => {
    const res = await POST(richiesta({ ...base, fileName: 'nuovo-fornitore.xml' }))
    expect(await res.json()).toHaveProperty('fornitoreCreato')
  })

  it('con «sovrascrivi anagrafica» aggiorna i dati del fornitore esistente', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'FORNITORE SPA', vatNumber: '07945211006', city: 'CITTÀ VECCHIA' },
    })

    await POST(richiesta({ ...base, fileName: 'agg.xml', sovrascriviAnagrafica: true }))

    const aggiornato = await prisma.supplier.findUnique({ where: { id: fornitore.id } })
    expect(aggiornato?.city).toBe('Bolzano')

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('senza «sovrascrivi anagrafica» lascia intatti i dati del fornitore', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'FORNITORE SPA', vatNumber: '07945211006', city: 'CITTÀ VECCHIA' },
    })

    await POST(richiesta({ ...base, fileName: 'non-agg.xml', sovrascriviAnagrafica: false }))

    const invariato = await prisma.supplier.findUnique({ where: { id: fornitore.id } })
    expect(invariato?.city).toBe('CITTÀ VECCHIA')

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('applica i giorni scelti nella finestra dei conflitti', async () => {
    // Nessuna rata nel documento: la scadenza sarà stimata, ed è lì che i
    // giorni scelti devono farsi valere.
    const senzaScadenza = xmlFattura({ numero: 'POL-2', data: '2026-06-01', rate: [] })

    const res = await POST(richiesta({
      ...base,
      xmlContent: senzaScadenza,
      fileName: 'senza-scadenza.xml',
      giorniPagamentoScelti: 60,
    }))

    const { id } = await res.json()
    const scadenze = await prisma.invoiceDeadline.findMany({ where: { invoiceId: id } })
    expect(scadenze).toHaveLength(1)
    // 2026-06-01 + 60 giorni
    expect(scadenze[0].dueDate.toISOString().slice(0, 10)).toBe('2026-07-31')
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/app/api/invoices/__tests__/import-politica-duplicati.itest.ts
```

Atteso: FAIL — con `'sostituisci'` la rotta risponde comunque 409.

- [ ] **Step 3: Estendere lo schema**

In `importInvoiceSchema` (riga 66):

```typescript
  /** Cosa fare se la fattura è già in archivio. */
  politicaDuplicati: z.enum(['salta', 'sostituisci']).default('salta'),
  /**
   * Giorni di dilazione decisi dall'utente nella finestra dei conflitti.
   * Vincono sui termini dell'anagrafica, che a loro volta vincono sul default.
   */
  giorniPagamentoScelti: z.number().int().positive().max(365).optional(),
  /** Aggiorna i dati del fornitore già esistente con quelli del documento. */
  sovrascriviAnagrafica: z.boolean().default(false),
```

- [ ] **Step 4: Trattare il duplicato secondo la politica**

Sostituire il blocco `if (existingInvoice) { … 409 … }` (righe 387-395) con:

```typescript
    let idSostituita: string | null = null

    if (existingInvoice) {
      if (validatedData.politicaDuplicati === 'salta') {
        return NextResponse.json(
          { error: 'Fattura già importata', existingId: existingInvoice.id },
          { status: 409 }
        )
      }

      // «Sostituisci»: la vecchia si archivia, non si cancella — è una scrittura
      // contabile, e la riga nuova deve poter dire da cosa proviene.
      await prisma.electronicInvoice.update({
        where: { id: existingInvoice.id },
        data: { deletedAt: new Date(), deletedById: session.user.id },
      })
      idSostituita = existingInvoice.id
    }
```

E nella risposta finale di successo aggiungere `...(idSostituita ? { sostituisce: idSostituita } : {})`.

- [ ] **Step 5: Far vincere i giorni scelti**

Alle righe 475-485, dove si legge `paymentTermsDays` del fornitore:

```typescript
      const giorniPagamento =
        validatedData.giorniPagamentoScelti ?? terminiFornitore ?? undefined
```

e passare `giorniPagamento` a `estraiScadenze`.

- [ ] **Step 6: Aggiornare l'anagrafica quando richiesto, e dichiarare il fornitore creato**

Nel ramo in cui il fornitore viene **trovato** (non creato), dentro la gestione fornitore alle righe ~397-430, aggiungere:

```typescript
      if (supplier && validatedData.sovrascriviAnagrafica) {
        const sede = fattura.cedentePrestatore.sede
        await prisma.supplier.update({
          where: { id: supplier.id },
          data: {
            address: sede.indirizzo || undefined,
            city: sede.comune || undefined,
            province: sede.provincia || undefined,
            postalCode: sede.cap || undefined,
            fiscalCode: fattura.cedentePrestatore.codiceFiscale || undefined,
          },
        })
      }
```

Tenere una variabile `let fornitoreCreato = false`, portarla a `true` nel ramo che crea il fornitore, e aggiungerla alla risposta di successo:

```typescript
      fornitoreCreato,
```

- [ ] **Step 7: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/app/api/invoices/
```

Atteso: PASS, compresi i test di idempotenza preesistenti.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/invoices/ src/lib/sdi/__tests__/fixtures/
git commit -m "feat(import): politica duplicati, termini scelti e aggiornamento anagrafica"
```

---

## Task 11: Passo 3 — esecuzione, e il riepilogo che si può interrogare

Qui replichiamo i contatori vivi e il log per riga, e chiudiamo con il riepilogo. La differenza rispetto a CashKing: **i contatori filtrano** e **ogni riga si apre** sui dettagli della fattura, invece di fermarsi a numero e fornitore.

**Files:**
- Create: `src/components/fatture/importa/PassoEsecuzione.tsx`
- Create: `src/components/fatture/importa/RiepilogoFinale.tsx`
- Test: `src/components/fatture/importa/__tests__/RiepilogoFinale.test.tsx`

**Interfaces:**
- Produces:

```typescript
export interface EsitoRiga {
  chiave: string
  nomeFile: string
  numero: string
  denominazioneFornitore: string
  stato: StatoRiga            // 'importata' | 'duplicata' | 'errore' | 'esclusa'
  messaggio?: string
  fattura: RigaAnteprima      // il dettaglio completo, per l'espansione
}

export type FiltroEsito = 'tutte' | StatoRiga
```
- Produces: `<PassoEsecuzione righe opzioni scelteConflitti onFinito />` e `<RiepilogoFinale esiti fattureCreate fornitoriCreati onChiudi onRicomincia />`

- [ ] **Step 1: Scrivere il test che fallisce**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { RiepilogoFinale } from '../RiepilogoFinale'
import type { EsitoRiga } from '../RiepilogoFinale'

const esito = (sovrascrivi: Partial<EsitoRiga>): EsitoRiga => ({
  chiave: 'a.xml',
  nomeFile: 'a.xml',
  numero: '42',
  denominazioneFornitore: 'Torrefazione di prova Srl',
  stato: 'importata',
  fattura: {
    chiave: 'a.xml', nomeFile: 'a.xml', xmlContent: '<x/>', daZip: null,
    numero: '42', data: '2026-06-01', tipoDocumento: 'TD01',
    denominazioneFornitore: 'Torrefazione di prova Srl', partitaIvaFornitore: '07945211006',
    denominazioneCliente: 'Weiss Cafe', netAmount: 100, vatAmount: 22, totalAmount: 122,
    aliquote: [22], primaScadenza: '2026-07-01', scadenzaStimata: false,
    giorniDalFile: 30, ritenuta: null, duplicata: false, esclusa: false,
  },
  ...sovrascrivi,
})

const esiti = [
  esito({ chiave: 'a.xml', stato: 'importata' }),
  esito({ chiave: 'b.xml', nomeFile: 'b.xml', stato: 'duplicata' }),
  esito({ chiave: 'c.xml', nomeFile: 'c.xml', stato: 'duplicata' }),
  esito({ chiave: 'd.xml', nomeFile: 'd.xml', stato: 'errore', messaggio: 'P.IVA assente' }),
]

describe('RiepilogoFinale', () => {
  it('riassume in una riga quante ne sono entrate e quante no', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    expect(screen.getByText(/1 fattura importata, 3 righe saltate/i)).toBeInTheDocument()
  })

  it('mostra i contatori per stato', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    const importati = screen.getByRole('button', { name: /1 importate/i })
    const duplicati = screen.getByRole('button', { name: /2 duplicate/i })
    expect(importati).toBeInTheDocument()
    expect(duplicati).toBeInTheDocument()
  })

  it('filtra la tabella quando si preme un contatore', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /2 duplicate/i }))

    const righe = screen.getAllByRole('row').slice(1) // via l'intestazione
    expect(righe).toHaveLength(2)
    expect(screen.queryByText('a.xml')).not.toBeInTheDocument()
    expect(screen.getByText('b.xml')).toBeInTheDocument()
  })

  it('apre il dettaglio completo della fattura sulla riga', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /dettagli di a\.xml/i }))

    expect(screen.getByText('07945211006')).toBeInTheDocument()   // P.IVA
    expect(screen.getByText(/TD01/)).toBeInTheDocument()          // tipo documento
    expect(screen.getByText(/01\/07\/2026/)).toBeInTheDocument()  // scadenza
    expect(screen.getByText(/122,00/)).toBeInTheDocument()        // lordo
  })

  it('spiega perché una riga è fallita', async () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /1 errori/i }))
    expect(screen.getByText('P.IVA assente')).toBeInTheDocument()
  })

  it('mostra la verifica di integrità', () => {
    render(<RiepilogoFinale esiti={esiti} fattureCreate={1} fornitoriCreati={2} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    const verifica = screen.getByRole('region', { name: /verifica integrità/i })
    expect(within(verifica).getByText('1')).toBeInTheDocument()   // fatture create
    expect(within(verifica).getByText('2')).toBeInTheDocument()   // fornitori creati
    expect(within(verifica).getByText('4')).toBeInTheDocument()   // righe processate
  })

  it('avverte se il conto non torna', () => {
    // 1 importata dichiarata, ma nel database ne risultano 0
    render(<RiepilogoFinale esiti={esiti} fattureCreate={0} fornitoriCreati={0} onChiudi={vi.fn()} onRicomincia={vi.fn()} />)
    expect(screen.getByText(/non corrisponde/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/RiepilogoFinale.test.tsx
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare `PassoEsecuzione.tsx`**

Manda al server una fattura per volta, in serie, aggiornando lo stato dopo ognuna: è ciò che permette la barra di avanzamento onesta e il pulsante di interruzione. Nessun payload gigante — solo `xmlContent` della riga corrente.

```tsx
const [fatte, setFatte] = useState<EsitoRiga[]>([])
const interrompi = useRef(false)

useEffect(() => {
  let vivo = true

  const esegui = async () => {
    for (const riga of righe) {
      if (interrompi.current || !vivo) break

      if (riga.esclusa) {
        setFatte((prec) => [...prec, { …riga, stato: 'esclusa' }])
        continue
      }

      try {
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            xmlContent: riga.xmlContent,
            fileName: riga.nomeFile,
            venueId: 'auto',
            createSupplier: true,
            politicaDuplicati: opzioni.politicaDuplicati,
            sovrascriviAnagrafica: opzioni.sovrascriviAnagrafica,
            ...(scelteConflitti[riga.partitaIvaFornitore] === 'anagrafica'
              ? {}
              : riga.giorniDalFile !== null
                ? { giorniPagamentoScelti: riga.giorniDalFile }
                : {}),
          }),
        })

        if (res.status === 409) {
          setFatte((prec) => [...prec, { …riga, stato: 'duplicata' }])
          continue
        }
        if (!res.ok) {
          const errore = await res.json()
          setFatte((prec) => [...prec, { …riga, stato: 'errore', messaggio: errore.error }])
          continue
        }
        setFatte((prec) => [...prec, { …riga, stato: 'importata' }])
      } catch (errore) {
        setFatte((prec) => [
          ...prec,
          { …riga, stato: 'errore', messaggio: errore instanceof Error ? errore.message : 'Errore di rete' },
        ])
      }
    }

    if (vivo) onFinito(fatte)
  }

  void esegui()
  return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

> Sostituire `…riga` con lo spread reale (`...riga` più i campi di `EsitoRiga`): qui i tre puntini sono scritti così solo per non confondersi con l'ellissi tipografica.
>
> `onFinito` va chiamata con l'elenco accumulato localmente, non con lo stato `fatte` (che dentro l'effetto resta quello del primo render): tenere un array locale `const raccolti: EsitoRiga[] = []` in parallelo a `setFatte`.

In alto: i contatori vivi (Importate · Duplicate · Errori · Rimanenti), la `Progress` e `{fatte.length} di {righe.length} file elaborati`; sotto, il log più recente in cima; in fondo `Annulla importazione` che porta `interrompi.current = true`.

- [ ] **Step 4: Implementare `RiepilogoFinale.tsx`**

- Intestazione con icona di spunta, **«Importazione completata»** e la riga di sintesi: `{n} fattura/e importata/e, {m} righe saltate` (singolare e plurale corretti).
- Cinque riquadri-contatore come `<button>`: `{totale} File elaborati` · `{importate} Importate` · `{duplicate} Duplicate` · `{errori} Errori` · `{escluse} Escluse`. Quello attivo evidenziato; premerlo di nuovo torna a `tutte`.
- Tabella filtrata: File · Numero · Fornitore · Stato (badge). Ogni riga ha un pulsante di espansione con `aria-label={`Dettagli di ${e.nomeFile}`}` che apre sotto una riga con **tutti** i dati: tipo documento, data, scadenza (con la nota se stimata), P.IVA, cliente, netto, IVA per aliquota, lordo, ritenuta, archivio di provenienza, e il messaggio d'errore se c'è.
- Riquadro `<section aria-label="Verifica integrità importazione">` con: Fatture create nel database · Fornitori creati · Righe totali processate. Se `fattureCreate !== importate`, riga in rosso: `Il conteggio non corrisponde: {importate} dichiarate, {fattureCreate} create.`
- In fondo: `Importa altri file` e `Chiudi`.

- [ ] **Step 5: Eseguire i test**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/RiepilogoFinale.test.tsx
```

Atteso: PASS, 7 test.

- [ ] **Step 6: Commit**

```bash
git add src/components/fatture/importa/PassoEsecuzione.tsx src/components/fatture/importa/RiepilogoFinale.tsx src/components/fatture/importa/__tests__/RiepilogoFinale.test.tsx
git commit -m "feat(import): esecuzione con contatori vivi e riepilogo interrogabile"
```

---

## Task 12: Cucire il tutto e togliere i due dialog vecchi

**Files:**
- Create: `src/components/fatture/importa/ImportaFattureWizard.tsx`
- Modify: `src/app/(dashboard)/fatture/page.tsx:14,84`
- Modify: `src/components/invoices/InvoiceList.tsx:65,696`
- Delete: `src/components/fatture/CaricaFattureDialog.tsx`, `src/components/invoices/InvoiceImportDialog.tsx`
- Test: `src/components/fatture/importa/__tests__/ImportaFattureWizard.test.tsx`

**Interfaces:**
- Consumes: tutti i pezzi dei Task 6-11.
- Produces: `<ImportaFattureWizard open onOpenChange onImportComplete />` — **la stessa firma di `CaricaFattureDialog`**, così le due pagine cambiano solo l'import.

- [ ] **Step 1: Scrivere il test d'insieme**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ImportaFattureWizard } from '../ImportaFattureWizard'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'

const XML_MINIMO = xmlFattura({ numero: '42', data: '2026-06-01', piva: '07945211006' })

/**
 * Deposita i file sull'input e lascia sfogare la lettura asincrona.
 *
 * L'idioma del progetto è `fireEvent`, non `userEvent`: i primitivi Radix usati
 * qui (radio, checkbox) rispondono a un click diretto e non richiedono la
 * simulazione degli eventi di puntatore. Vedi la revisione del Task 7.
 */
async function caricaFile(input: HTMLInputElement, ...files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    fireEvent.change(input)
  })
}

beforeEach(() => {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).includes('verifica-duplicati')) {
      return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
    }
    if (String(url).includes('conflitti-termini')) {
      return { ok: true, status: 200, json: async () => ({ conflitti: [] }) } as Response
    }
    return { ok: true, status: 201, json: async () => ({ id: 'nuova-1' }) } as Response
  }) as never
})

describe('ImportaFattureWizard', () => {
  it('porta un XML dal caricamento al riepilogo', async () => {
    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    // Passo 2
    expect(await screen.findByText(/1 fattura trovata nei file caricati/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /avvia importazione/i }))

    // Passo 3 → riepilogo
    expect(await screen.findByText(/importazione completata/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 importate/i })).toBeInTheDocument()
  })

  it('apre la finestra dei conflitti quando ce ne sono', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('verifica-duplicati')) {
        return { ok: true, status: 200, json: async () => ({ duplicati: [] }) } as Response
      }
      if (String(url).includes('conflitti-termini')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            conflitti: [{ partitaIva: '07945211006', denominazione: 'FORNITORE SPA', giorniDalFile: 30, giorniAnagrafica: 60, chiavi: ['IT07945211006_001.xml'] }],
          }),
        } as Response
      }
      return { ok: true, status: 201, json: async () => ({ id: 'nuova-1' }) } as Response
    }) as never

    render(<ImportaFattureWizard open onOpenChange={vi.fn()} onImportComplete={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await caricaFile(input, new File([XML_MINIMO], 'IT07945211006_001.xml', { type: 'application/xml' }))

    fireEvent.click(await screen.findByRole('button', { name: /avvia importazione/i }))

    expect(await screen.findByText(/termini di pagamento in conflitto/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
nvm use 22 && npm test -- --run src/components/fatture/importa/__tests__/ImportaFattureWizard.test.tsx
```

Atteso: FAIL — modulo non trovato.

- [ ] **Step 3: Implementare il contenitore**

Stato: `passo: 'caricamento' | 'anteprima' | 'esecuzione' | 'riepilogo'`, `opzioni`, `fileScelti`, `righe`, `scartati`, `metadatiIgnorati`, `conflitti`, `scelteConflitti`, `esiti`.

Sequenza:
1. `onFileScelti` → `leggiFileFattura(files)` → chiama `verifica-duplicati` con le chiavi → marca `duplicata` → passo `anteprima`.
2. In `anteprima`, «Avvia Importazione» → chiama `conflitti-termini`; se la risposta è vuota va diritto a `esecuzione`, altrimenti apre `DialogConflitti` e ci va dopo «Continua Importazione».
3. `PassoEsecuzione` → `onFinito(esiti)` → passo `riepilogo`, e `onImportComplete()` per far ricaricare la pagina che ospita.
4. Nel riepilogo, `fattureCreate` è il numero di risposte `201` ricevute; `fornitoriCreati` arriva dal campo `supplierCreated` della risposta di import, se presente — altrimenti passare `0` e **non** mostrare la riga.

Dialog largo: `<DialogContent className="max-w-6xl">`. Intestazione con indicatore dei tre passi.

- [ ] **Step 4: Montare nelle due pagine**

In `src/app/(dashboard)/fatture/page.tsx`, riga 14 e riga 84:

```tsx
import { ImportaFattureWizard } from '@/components/fatture/importa/ImportaFattureWizard'
…
<ImportaFattureWizard
  open={importDialogOpen}
  onOpenChange={setImportDialogOpen}
  onImportComplete={() => refetch()}
/>
```

In `src/components/invoices/InvoiceList.tsx`, righe 65 e 696, la stessa sostituzione mantenendo le prop già passate.

- [ ] **Step 5: Togliere i vecchi dialog**

```bash
git rm src/components/fatture/CaricaFattureDialog.tsx src/components/invoices/InvoiceImportDialog.tsx
grep -rn "CaricaFattureDialog\|InvoiceImportDialog" src/ || echo "nessun riferimento residuo"
```

Atteso: nessun riferimento residuo.

- [ ] **Step 6: Verifica completa**

```bash
nvm use 22 && npx tsc --noEmit
nvm use 22 && npm test -- --run
nvm use 22 && npm run build
echo "exit build: $?"
```

Atteso: type-check pulito, test verdi, build exit 0.

- [ ] **Step 7: Prova sul campo**

Avviare il server (`nvm use 22 && npm run dev`), aprire `/fatture`, caricare `docs/fatture/FT-ultimi3mesi-xml.zip` e verificare, con gli occhi:

1. il contatore dice **226 file selezionati**;
2. l'anteprima dice **226 fatture trovate**, con le due TD04 in negativo;
3. il totale a fondo anteprima è **177.546,18 €**;
4. le fatture già in archivio sono marcate **Duplicato** prima di premere qualsiasi cosa;
5. le 9 parcelle TD06 mostrano la ritenuta;
6. il riepilogo finale filtra premendo i contatori e apre il dettaglio riga per riga.

- [ ] **Step 8: Commit**

```bash
git add src/components/fatture/importa/ src/app/\(dashboard\)/fatture/page.tsx src/components/invoices/InvoiceList.tsx
git commit -m "feat(fatture): una sola procedura guidata d'import, con ZIP, duplicati e conflitti"
```

> **Mai `git add -A` in questo repository finché `docs/fatture/` non è ignorata:** contiene 8,5 MB di fatture reali con IBAN, partite IVA e indirizzi dei fornitori, e non è coperta da `.gitignore`. Una volta entrate nella storia, non se ne vanno più.

---

## Verifica finale del piano contro la spec

| Requisito | Task |
|---|---|
| Accettare XML, P7M, ZIP da `/fatture` | 7, 12 |
| Ignorare i `_metaDato.xml` | 1 |
| Politica duplicati, «Salta» preselezionata | 7, 10 |
| Mostrare il numero di file che stanno per essere caricati | 7 |
| Anteprima delle fatture trovate | 8 |
| Conflitti mostrati, risolvibili a uno a uno o in blocco | 5, 9 |
| Riepilogo con duplicate e importate distinte | 11 |
| Contatori che filtrano, dettaglio completo per riga | 11 |
| Verifica di integrità finale | 11 |
| Note di credito mostrate in negativo (senza toccare il dato salvato) | 2, 6 |
| Ritenuta letta e conservata | 3 |
| Duplicati marcati già in anteprima (meglio di CashKing) | 4, 8 |
| Nessun payload da 17 MB (meglio di CashKing) | 6, 11 |
| Scadenze stimate dichiarate (meglio di CashKing) | 8 |

**Fuori ambito, dichiarato:** import da PDF del Cassetto Fiscale e da Rappresentazione SDI; cronologia delle importazioni con annullamento; archiviazione del `.p7m` firmato; contatore «PDF errati».

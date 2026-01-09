# PRD: Miglioramenti Modulo Fatture Elettroniche

**Versione**: 1.0
**Data**: 2026-01-09
**Autore**: Claude (per Nicolas Carpa)
**Priorità**: Alta

---

## 1. Panoramica

Questo documento descrive le modifiche richieste al modulo fatture (`/fatture`) del gestionale Weiss. Le modifiche riguardano la visualizzazione della lista fatture, il dettaglio fattura, il dialog di import, e l'aggiunta di funzionalità di ricerca, filtro e ordinamento.

### 1.1 Obiettivi
- Migliorare l'usabilità della lista fatture con colonne riorganizzate
- Arricchire la vista dettaglio con informazioni complete (descrizioni, riferimenti)
- Permettere la modifica del fornitore durante l'import
- Aggiungere ricerca full-text e filtri anno/mese
- Implementare ordinamento su tutte le colonne

### 1.2 File Coinvolti

| File | Modifiche |
|------|-----------|
| `src/components/invoices/InvoiceList.tsx` | Colonne, filtri, ricerca, ordinamento |
| `src/components/invoices/InvoiceDetail.tsx` | Nuova struttura con descrizioni e riferimenti |
| `src/components/invoices/InvoiceImportDialog.tsx` | Form modifica fornitore |
| `src/app/api/invoices/route.ts` | Query filtri, ricerca, ordinamento |
| `src/app/api/invoices/parse/route.ts` | Restituire dati aggiuntivi |
| `src/lib/sdi/parser.ts` | Estrarre dati DDT e riferimenti |
| `src/lib/sdi/types.ts` | Nuovi tipi per riferimenti |

---

## 2. Requisito 1: Riorganizzazione Colonne Lista Fatture

### 2.1 Stato Attuale
La lista attuale mostra: Numero, Data, Fornitore (con P.IVA), Importo, Stato, Conto

### 2.2 Nuova Struttura Colonne

Le colonne devono essere **rigorosamente in questo ordine**:

| # | Colonna | Label | Descrizione | Larghezza Suggerita |
|---|---------|-------|-------------|---------------------|
| 1 | Tipo Documento | **Doc** | Codice abbreviato del tipo documento | 60px |
| 2 | Data Documento | **Data** | Data nel formato DD/MM/YY | 90px |
| 3 | Numero | **Numero** | Numero documento originale | 120px |
| 4 | Fornitore | **Fornitore** | Solo denominazione, NO P.IVA | flex |
| 5 | Importo | **Importo** | Totale comprensivo IVA | 100px |
| 6 | Stato | **Stato** | Badge registrata/non registrata | 100px |

### 2.3 Mappatura Tipi Documento

Creare costante `DOCUMENT_TYPE_CODES` con abbreviazioni intuitive:

```typescript
export const DOCUMENT_TYPE_CODES: Record<string, { code: string; label: string; color: string }> = {
  'TD01': { code: 'FT', label: 'Fattura', color: 'blue' },
  'TD02': { code: 'ACC', label: 'Acconto', color: 'purple' },
  'TD03': { code: 'ACC', label: 'Acconto', color: 'purple' },
  'TD04': { code: 'NC', label: 'Nota Credito', color: 'red' },
  'TD05': { code: 'ND', label: 'Nota Debito', color: 'orange' },
  'TD06': { code: 'PAR', label: 'Parcella', color: 'teal' },
  'TD07': { code: 'FTS', label: 'Fatt. Semplif.', color: 'gray' },
  'TD08': { code: 'NCS', label: 'NC Semplif.', color: 'red' },
  'TD09': { code: 'NDS', label: 'ND Semplif.', color: 'orange' },
  'TD16': { code: 'INT', label: 'Integrazione', color: 'indigo' },
  'TD17': { code: 'INT', label: 'Integrazione', color: 'indigo' },
  'TD18': { code: 'INT', label: 'Integrazione', color: 'indigo' },
  'TD19': { code: 'INT', label: 'Integrazione', color: 'indigo' },
  'TD20': { code: 'AUT', label: 'Autofattura', color: 'pink' },
  'TD21': { code: 'AUT', label: 'Autofattura', color: 'pink' },
  'TD22': { code: 'EST', label: 'Estrazione', color: 'cyan' },
  'TD23': { code: 'EST', label: 'Estrazione', color: 'cyan' },
  'TD24': { code: 'FTD', label: 'Fatt. Differita', color: 'green' },
  'TD25': { code: 'FTD', label: 'Fatt. Differita', color: 'green' },
  'TD26': { code: 'CES', label: 'Cessione Beni', color: 'amber' },
  'TD27': { code: 'AUT', label: 'Autoconsumo', color: 'pink' },
}
```

### 2.4 Visualizzazione Tipo Documento

```tsx
// Componente per visualizzare il tipo documento
function DocumentTypeCell({ type }: { type: string }) {
  const docType = DOCUMENT_TYPE_CODES[type] || { code: type, label: type, color: 'gray' }

  return (
    <Badge
      variant="outline"
      className={`bg-${docType.color}-50 text-${docType.color}-700 border-${docType.color}-200`}
      title={docType.label}
    >
      {docType.code}
    </Badge>
  )
}
```

### 2.5 Semplificazione Stato

Mappare gli stati interni a due stati visibili:

```typescript
const STATUS_DISPLAY = {
  IMPORTED: { label: 'Non registrata', color: 'amber', icon: Clock },
  MATCHED: { label: 'Non registrata', color: 'amber', icon: Clock },
  CATEGORIZED: { label: 'Non registrata', color: 'amber', icon: Clock },
  RECORDED: { label: 'Registrata', color: 'green', icon: CheckCircle },
  PAID: { label: 'Registrata', color: 'green', icon: CheckCircle },
}
```

### 2.6 Modifiche Database/API

Aggiungere campo `documentType` al model `ElectronicInvoice`:

```prisma
model ElectronicInvoice {
  // ... campi esistenti ...
  documentType  String?   @default("TD01")  // Tipo documento SDI
}
```

Modificare POST `/api/invoices` per salvare il tipo documento durante l'import.

### 2.7 Implementazione InvoiceList.tsx

```tsx
// Nuova struttura tabella
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-[60px]">Doc</TableHead>
      <TableHead className="w-[90px]">Data</TableHead>
      <TableHead className="w-[120px]">Numero</TableHead>
      <TableHead>Fornitore</TableHead>
      <TableHead className="w-[100px] text-right">Importo</TableHead>
      <TableHead className="w-[100px]">Stato</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((invoice) => (
      <TableRow key={invoice.id}>
        <TableCell>
          <DocumentTypeCell type={invoice.documentType} />
        </TableCell>
        <TableCell>
          {format(new Date(invoice.invoiceDate), 'dd/MM/yy', { locale: it })}
        </TableCell>
        <TableCell className="font-mono text-sm">
          {invoice.invoiceNumber}
        </TableCell>
        <TableCell className="max-w-[200px] truncate" title={invoice.supplierName}>
          {invoice.supplierName}
        </TableCell>
        <TableCell className="text-right font-medium">
          {formatCurrency(invoice.totalAmount)}
        </TableCell>
        <TableCell>
          <StatusBadge status={invoice.status} />
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## 3. Requisito 2: Modifica Fornitore in Import Dialog

### 3.1 Stato Attuale
Il dialog di import mostra i dati del fornitore in sola lettura e permette solo di scegliere se creare un nuovo fornitore o usarne uno esistente.

### 3.2 Nuova Funzionalità

Quando il fornitore è **nuovo** (non trovato nel database), mostrare un form modificabile con tutti i campi del fornitore.

### 3.3 Campi Modificabili

| Campo | Tipo | Obbligatorio | Note |
|-------|------|--------------|------|
| Denominazione | text | Sì | Pre-compilato da fattura |
| Partita IVA | text | No | Pre-compilato, validare formato |
| Codice Fiscale | text | No | Pre-compilato |
| Indirizzo | text | No | Pre-compilato |
| CAP | text | No | 5 cifre |
| Comune | text | No | Pre-compilato |
| Provincia | text | No | 2 caratteri |

### 3.4 Modifiche InvoiceImportDialog.tsx

Aggiungere stato per i dati fornitore modificabili:

```tsx
const [editableSupplierData, setEditableSupplierData] = useState<{
  name: string
  vatNumber: string
  fiscalCode: string
  address: string
  postalCode: string
  city: string
  province: string
} | null>(null)

// Quando si riceve il parsing, inizializzare i dati modificabili
useEffect(() => {
  if (parsedData && !parsedData.supplierMatch.found) {
    setEditableSupplierData({
      name: parsedData.supplierMatch.suggestedData.name || '',
      vatNumber: parsedData.supplierMatch.suggestedData.vatNumber || '',
      fiscalCode: parsedData.supplierMatch.suggestedData.fiscalCode || '',
      address: parsedData.supplierMatch.suggestedData.address || '',
      postalCode: parsedData.supplierMatch.suggestedData.postalCode || '',
      city: parsedData.supplierMatch.suggestedData.city || '',
      province: parsedData.supplierMatch.suggestedData.province || '',
    })
  }
}, [parsedData])
```

### 3.5 UI Form Fornitore

```tsx
{/* Sezione Fornitore - Modificabile se nuovo */}
<div className="space-y-3">
  <div className="flex items-center gap-2">
    <Building2 className="h-5 w-5 text-slate-500" />
    <span className="font-medium">Fornitore</span>
    {parsedData.supplierMatch.found ? (
      <Badge className="bg-green-100 text-green-700">
        <Check className="h-3 w-3 mr-1" />
        Trovato
      </Badge>
    ) : (
      <Badge className="bg-amber-100 text-amber-700">
        <Plus className="h-3 w-3 mr-1" />
        Nuovo
      </Badge>
    )}
  </div>

  {parsedData.supplierMatch.found ? (
    // Fornitore esistente - sola lettura
    <div className="p-3 bg-slate-50 rounded-lg">
      <p className="font-medium">{parsedData.supplierMatch.supplier?.name}</p>
      <p className="text-sm text-slate-500">
        P.IVA: {parsedData.supplierMatch.supplier?.vatNumber}
      </p>
    </div>
  ) : (
    // Nuovo fornitore - form modificabile
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
      <p className="text-sm text-amber-700 mb-3">
        Questo fornitore non è presente nel sistema. Puoi modificare i dati prima dell'import.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="supplier-name">Denominazione *</Label>
          <Input
            id="supplier-name"
            value={editableSupplierData?.name || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, name: e.target.value } : null
            )}
          />
        </div>

        <div>
          <Label htmlFor="supplier-vat">Partita IVA</Label>
          <Input
            id="supplier-vat"
            value={editableSupplierData?.vatNumber || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, vatNumber: e.target.value } : null
            )}
            placeholder="12345678901"
          />
        </div>

        <div>
          <Label htmlFor="supplier-fiscal">Codice Fiscale</Label>
          <Input
            id="supplier-fiscal"
            value={editableSupplierData?.fiscalCode || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, fiscalCode: e.target.value.toUpperCase() } : null
            )}
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="supplier-address">Indirizzo</Label>
          <Input
            id="supplier-address"
            value={editableSupplierData?.address || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, address: e.target.value } : null
            )}
          />
        </div>

        <div>
          <Label htmlFor="supplier-postal">CAP</Label>
          <Input
            id="supplier-postal"
            value={editableSupplierData?.postalCode || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, postalCode: e.target.value } : null
            )}
            maxLength={5}
          />
        </div>

        <div>
          <Label htmlFor="supplier-city">Comune</Label>
          <Input
            id="supplier-city"
            value={editableSupplierData?.city || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, city: e.target.value } : null
            )}
          />
        </div>

        <div>
          <Label htmlFor="supplier-province">Provincia</Label>
          <Input
            id="supplier-province"
            value={editableSupplierData?.province || ''}
            onChange={(e) => setEditableSupplierData(prev =>
              prev ? { ...prev, province: e.target.value.toUpperCase() } : null
            )}
            maxLength={2}
            placeholder="PN"
          />
        </div>
      </div>
    </div>
  )}
</div>
```

### 3.6 Modifiche alla Mutation di Import

Passare i dati modificati invece di quelli originali:

```tsx
const importMutation = useMutation({
  mutationFn: () =>
    importInvoice({
      xmlContent,
      fileName,
      venueId: selectedVenueId,
      supplierId: parsedData?.supplierMatch.supplier?.id,
      createSupplier: createNewSupplier,
      // Usare i dati modificati se disponibili
      supplierData: createNewSupplier && editableSupplierData
        ? editableSupplierData
        : parsedData?.supplierMatch.suggestedData,
      accountId: selectedAccountId !== '_none' ? selectedAccountId : undefined,
    }),
  // ...
})
```

---

## 4. Requisito 3: Dettaglio Fattura Completo

### 4.1 Stato Attuale
Il dettaglio mostra: fornitore, importi, conto, scadenze, metadati base. Mancano le **descrizioni delle linee** e i **riferimenti** (DDT, ordini, ecc.).

### 4.2 Dati Mancanti da Visualizzare

1. **Descrizione/Contenuto Fattura** - Le righe dettaglio con descrizioni
2. **Riferimenti DDT** - Numeri e date dei documenti di trasporto
3. **Riferimenti Ordine** - Numeri ordine acquisto
4. **Riferimenti Contratto** - Numeri contratto
5. **Causale Documento** - Testo causale dalla fattura

### 4.3 Modifiche al Parser (parser.ts)

Estrarre i dati di riferimento:

```typescript
export interface DatiRiferimento {
  datiDDT: Array<{
    numeroDDT: string
    dataDDT: string
    riferimentoNumeroLinea?: number[]
  }>
  datiOrdineAcquisto: Array<{
    idDocumento: string
    data?: string
    numItem?: string
    codiceCommessaConvenzione?: string
    codiceCUP?: string
    codiceCIG?: string
  }>
  datiContratto: Array<{
    idDocumento: string
    data?: string
  }>
  datiConvenzione: Array<{
    idDocumento: string
    data?: string
  }>
  datiFattureCollegate: Array<{
    idDocumento: string
    data?: string
  }>
}

// Funzione per estrarre riferimenti
export function estraiRiferimenti(body: Element): DatiRiferimento {
  const datiGenerali = body.getElementsByTagName('DatiGenerali')[0]

  return {
    datiDDT: extractDatiDDT(datiGenerali),
    datiOrdineAcquisto: extractDatiOrdine(datiGenerali, 'DatiOrdineAcquisto'),
    datiContratto: extractDatiOrdine(datiGenerali, 'DatiContratto'),
    datiConvenzione: extractDatiOrdine(datiGenerali, 'DatiConvenzione'),
    datiFattureCollegate: extractDatiOrdine(datiGenerali, 'DatiFattureCollegate'),
  }
}

function extractDatiDDT(datiGenerali: Element): DatiRiferimento['datiDDT'] {
  const ddtElements = datiGenerali.getElementsByTagName('DatiDDT')
  const result: DatiRiferimento['datiDDT'] = []

  for (let i = 0; i < ddtElements.length; i++) {
    const ddt = ddtElements[i]
    const riferimenti: number[] = []
    const rifElements = ddt.getElementsByTagName('RiferimentoNumeroLinea')
    for (let j = 0; j < rifElements.length; j++) {
      const num = parseInt(rifElements[j].textContent || '0')
      if (num > 0) riferimenti.push(num)
    }

    result.push({
      numeroDDT: getTextContent(ddt, 'NumeroDDT') || '',
      dataDDT: getTextContent(ddt, 'DataDDT') || '',
      riferimentoNumeroLinea: riferimenti.length > 0 ? riferimenti : undefined,
    })
  }

  return result
}
```

### 4.4 Modifiche al Database

Aggiungere campi per memorizzare dati estratti (opzionale, o recuperare da xmlContent):

```prisma
model ElectronicInvoice {
  // ... campi esistenti ...

  // Dati aggiuntivi (JSON)
  lineItems     Json?     // Dettaglio linee
  references    Json?     // Riferimenti DDT, ordini, ecc.
  causale       String?   // Causale documento
}
```

### 4.5 Nuova Struttura InvoiceDetail.tsx

```tsx
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
  })

  if (isLoading) return <InvoiceDetailSkeleton />
  if (!invoice) return <div>Fattura non trovata</div>

  // Parsing dei dati JSON memorizzati
  const lineItems = invoice.lineItems as LineItem[] | null
  const references = invoice.references as DatiRiferimento | null

  return (
    <div className="space-y-6">
      {/* Header con info documento */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DocumentTypeCell type={invoice.documentType} large />
                <span>Documento n. {invoice.invoiceNumber}</span>
              </CardTitle>
              <CardDescription>
                Data: {format(new Date(invoice.invoiceDate), 'dd MMMM yyyy', { locale: it })}
              </CardDescription>
            </div>
            <StatusBadge status={invoice.status} />
          </div>
        </CardHeader>
      </Card>

      {/* Sezione Fornitore e Cliente */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Fornitore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{invoice.supplierName}</p>
            <p className="text-sm text-muted-foreground">P.IVA: {invoice.supplierVat}</p>
            {invoice.supplier?.address && (
              <p className="text-sm text-muted-foreground mt-1">
                {invoice.supplier.address}
                {invoice.supplier.city && `, ${invoice.supplier.city}`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4" />
              Cessionario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">WEISS SRL</p>
            <p className="text-sm text-muted-foreground">P.IVA: 01723900930</p>
            <p className="text-sm text-muted-foreground">
              Piazza del Popolo 15/B, 33077 Sacile (PN)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Causale (se presente) */}
      {invoice.causale && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Causale</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{invoice.causale}</p>
          </CardContent>
        </Card>
      )}

      {/* Riferimenti DDT e Ordini */}
      {references && (references.datiDDT?.length > 0 || references.datiOrdineAcquisto?.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Riferimenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {references.datiDDT?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Documenti di Trasporto (DDT)
                </p>
                <div className="flex flex-wrap gap-2">
                  {references.datiDDT.map((ddt, i) => (
                    <Badge key={i} variant="outline">
                      {ddt.numeroDDT} del {format(new Date(ddt.dataDDT), 'dd/MM/yyyy')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {references.datiOrdineAcquisto?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Ordini di Acquisto
                </p>
                <div className="flex flex-wrap gap-2">
                  {references.datiOrdineAcquisto.map((ord, i) => (
                    <Badge key={i} variant="outline">
                      {ord.idDocumento}
                      {ord.data && ` del ${format(new Date(ord.data), 'dd/MM/yyyy')}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SEZIONE CRITICA: Dettaglio Linee/Descrizioni */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <List className="h-4 w-4" />
            Dettaglio Prodotti/Servizi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Descrizione</TableHead>
                <TableHead className="text-right w-[80px]">Q.tà</TableHead>
                <TableHead className="text-right w-[100px]">Prezzo Unit.</TableHead>
                <TableHead className="text-right w-[80px]">IVA %</TableHead>
                <TableHead className="text-right w-[100px]">Totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems?.map((line, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{line.numeroLinea || i + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium">{line.descrizione}</p>
                    {line.codiceArticolo && (
                      <p className="text-xs text-muted-foreground">
                        Cod: {line.codiceArticolo}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.quantita ? `${line.quantita} ${line.unitaMisura || ''}` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(line.prezzoUnitario)}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.aliquotaIVA}%
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(line.prezzoTotale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Riepilogo IVA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Riepilogo IVA</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aliquota</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead className="text-right">Imposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.vatSummary?.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.aliquota}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.imponibile)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.imposta)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium border-t-2">
                <TableCell>Totali</TableCell>
                <TableCell className="text-right">{formatCurrency(invoice.netAmount)}</TableCell>
                <TableCell className="text-right">{formatCurrency(invoice.vatAmount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Totale Documento</span>
              <span>{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scadenze e Pagamenti - vedi Requisito 4 */}
      <PaymentDeadlinesCard deadlines={invoice.deadlines} />

      {/* Metadati e Azioni */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Sede</p>
              <p className="font-medium">{invoice.venue?.name || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Importato il</p>
              <p className="font-medium">
                {format(new Date(invoice.importedAt), 'dd/MM/yyyy HH:mm')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">File</p>
              <p className="font-medium truncate" title={invoice.fileName}>
                {invoice.fileName || '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Conto</p>
              <p className="font-medium">
                {invoice.account ? `${invoice.account.code} - ${invoice.account.name}` : '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## 5. Requisito 4: Dettaglio Scadenze Pagamenti

### 5.1 Stato Attuale
Le scadenze mostrano solo data e importo. Manca la **modalità di pagamento**.

### 5.2 Dati da Visualizzare per Ogni Scadenza

| Campo | Descrizione |
|-------|-------------|
| Data Scadenza | Data di scadenza del pagamento |
| Importo | Importo da pagare |
| Modalità | Metodo di pagamento (Bonifico, RiBa, ecc.) |
| Stato | Pagato/Non pagato |

### 5.3 Mappatura Modalità Pagamento

```typescript
export const PAYMENT_METHODS: Record<string, string> = {
  'MP01': 'Contanti',
  'MP02': 'Assegno',
  'MP03': 'Assegno circolare',
  'MP04': 'Contanti c/o Tesoreria',
  'MP05': 'Bonifico',
  'MP06': 'Vaglia cambiario',
  'MP07': 'Bollettino bancario',
  'MP08': 'Carta di pagamento',
  'MP09': 'RID',
  'MP10': 'RID utenze',
  'MP11': 'RID veloce',
  'MP12': 'RIBA',
  'MP13': 'MAV',
  'MP14': 'Quietanza erario',
  'MP15': 'Giroconto',
  'MP16': 'Domiciliazione',
  'MP17': 'Domiciliazione postale',
  'MP18': 'Bollettino postale',
  'MP19': 'SEPA Direct Debit',
  'MP20': 'SEPA Direct Debit CORE',
  'MP21': 'SEPA Direct Debit B2B',
  'MP22': 'Trattenuta su somme',
  'MP23': 'PagoPA',
}
```

### 5.4 Componente PaymentDeadlinesCard

```tsx
function PaymentDeadlinesCard({ deadlines }: { deadlines: InvoiceDeadline[] }) {
  if (!deadlines || deadlines.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Scadenze Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data Scadenza</TableHead>
              <TableHead>Modalità</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deadlines.map((deadline) => {
              const isPastDue = !deadline.isPaid && new Date(deadline.dueDate) < new Date()

              return (
                <TableRow key={deadline.id}>
                  <TableCell>
                    <span className={cn(isPastDue && 'text-red-600 font-medium')}>
                      {format(new Date(deadline.dueDate), 'dd/MM/yyyy')}
                    </span>
                    {isPastDue && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        Scaduta
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {PAYMENT_METHODS[deadline.paymentMethod] || deadline.paymentMethod || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(deadline.amount)}
                  </TableCell>
                  <TableCell>
                    {deadline.isPaid ? (
                      <Badge className="bg-green-100 text-green-700">
                        <Check className="h-3 w-3 mr-1" />
                        Pagato
                        {deadline.paidAt && (
                          <span className="ml-1">
                            ({format(new Date(deadline.paidAt), 'dd/MM/yy')})
                          </span>
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600">
                        <Clock className="h-3 w-3 mr-1" />
                        Da pagare
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Riepilogo totali */}
        <div className="mt-4 grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg text-sm">
          <div>
            <p className="text-muted-foreground">Totale da pagare</p>
            <p className="font-bold text-lg">
              {formatCurrency(
                deadlines
                  .filter(d => !d.isPaid)
                  .reduce((sum, d) => sum + Number(d.amount), 0)
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Totale pagato</p>
            <p className="font-bold text-lg text-green-600">
              {formatCurrency(
                deadlines
                  .filter(d => d.isPaid)
                  .reduce((sum, d) => sum + Number(d.amount), 0)
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## 6. Requisito 5: Ordinamento Colonne

### 6.1 Funzionalità
Permettere l'ordinamento cliccando sull'header delle colonne nella lista fatture.

### 6.2 Colonne Ordinabili

| Colonna | Campo DB | Direzione Default |
|---------|----------|-------------------|
| Doc | documentType | ASC |
| Data | invoiceDate | DESC |
| Numero | invoiceNumber | ASC |
| Fornitore | supplierName | ASC |
| Importo | totalAmount | DESC |
| Stato | status | ASC |

### 6.3 Implementazione Frontend

```tsx
type SortField = 'documentType' | 'invoiceDate' | 'invoiceNumber' | 'supplierName' | 'totalAmount' | 'status'
type SortDirection = 'asc' | 'desc'

interface SortState {
  field: SortField
  direction: SortDirection
}

function InvoiceList() {
  const [sort, setSort] = useState<SortState>({
    field: 'invoiceDate',
    direction: 'desc',
  })

  const toggleSort = (field: SortField) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const { data } = useQuery({
    queryKey: ['invoices', page, filters, sort],
    queryFn: () => fetchInvoices({
      ...filters,
      sortBy: sort.field,
      sortDir: sort.direction
    }),
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader
            label="Doc"
            field="documentType"
            currentSort={sort}
            onSort={toggleSort}
          />
          <SortableHeader
            label="Data"
            field="invoiceDate"
            currentSort={sort}
            onSort={toggleSort}
          />
          {/* ... altre colonne ... */}
        </TableRow>
      </TableHeader>
    </Table>
  )
}

function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
  className,
}: {
  label: string
  field: SortField
  currentSort: SortState
  onSort: (field: SortField) => void
  className?: string
}) {
  const isActive = currentSort.field === field

  return (
    <TableHead
      className={cn('cursor-pointer select-none hover:bg-slate-50', className)}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="text-slate-400">
          {isActive ? (
            currentSort.direction === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </span>
      </div>
    </TableHead>
  )
}
```

### 6.4 Modifiche API

Aggiungere parametri di ordinamento a GET `/api/invoices`:

```typescript
// In route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Parametri esistenti
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')

  // Nuovi parametri ordinamento
  const sortBy = searchParams.get('sortBy') || 'invoiceDate'
  const sortDir = searchParams.get('sortDir') || 'desc'

  // Validazione campo ordinamento
  const validSortFields = ['documentType', 'invoiceDate', 'invoiceNumber', 'supplierName', 'totalAmount', 'status']
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'invoiceDate'
  const orderDirection = sortDir === 'asc' ? 'asc' : 'desc'

  const invoices = await prisma.electronicInvoice.findMany({
    // ... where conditions ...
    orderBy: {
      [orderField]: orderDirection,
    },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      supplier: true,
      account: true,
      venue: true,
    },
  })

  // ...
}
```

---

## 7. Requisito 6: Ricerca e Filtri Anno/Mese

### 7.1 Funzionalità

Come da riferimento DKLink:
- **Selezione Anno**: Dropdown con anni disponibili (default: anno corrente)
- **Selezione Mese**: Dropdown con mesi o "Tutti i mesi"
- **Ricerca**: Campo testo per cercare in numero, fornitore, importo
- **Statistiche**: Mostrare totali (Totale, Imponibile, IVA, Conteggio)

### 7.2 Componente Toolbar Filtri

```tsx
function InvoiceFiltersToolbar({
  filters,
  onFiltersChange,
  stats,
}: {
  filters: InvoiceFilters
  onFiltersChange: (filters: InvoiceFilters) => void
  stats: InvoiceStats
}) {
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const months = [
    { value: '', label: 'Tutti i mesi' },
    { value: '01', label: 'Gennaio' },
    { value: '02', label: 'Febbraio' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Aprile' },
    { value: '05', label: 'Maggio' },
    { value: '06', label: 'Giugno' },
    { value: '07', label: 'Luglio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Settembre' },
    { value: '10', label: 'Ottobre' },
    { value: '11', label: 'Novembre' },
    { value: '12', label: 'Dicembre' },
  ]

  return (
    <div className="space-y-4">
      {/* Riga filtri */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Selezione Anno */}
        <Select
          value={filters.year?.toString() || currentYear.toString()}
          onValueChange={(value) => onFiltersChange({ ...filters, year: parseInt(value) })}
        >
          <SelectTrigger className="w-[100px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Selezione Mese */}
        <Select
          value={filters.month || ''}
          onValueChange={(value) => onFiltersChange({ ...filters, month: value || undefined })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tutti i mesi" />
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Campo Ricerca */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Cerca per numero, fornitore..."
            value={filters.search || ''}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-9"
          />
          {filters.search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => onFiltersChange({ ...filters, search: '' })}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Filtro Stato */}
        <Select
          value={filters.status || '_all'}
          onValueChange={(value) => onFiltersChange({
            ...filters,
            status: value === '_all' ? undefined : value
          })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tutti gli stati</SelectItem>
            <SelectItem value="registered">Registrate</SelectItem>
            <SelectItem value="unregistered">Non registrate</SelectItem>
          </SelectContent>
        </Select>

        {/* Pulsante Import */}
        <Button onClick={() => setImportDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Importa
        </Button>
      </div>

      {/* Statistiche riassuntive */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Totale</p>
          <p className="text-2xl font-bold text-blue-600">
            {formatCurrency(stats.totalAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Imponibile</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(stats.netAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">IVA</p>
          <p className="text-2xl font-bold text-amber-600">
            {formatCurrency(stats.vatAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Fatture</p>
          <p className="text-2xl font-bold">
            {stats.count}
          </p>
        </Card>
      </div>
    </div>
  )
}
```

### 7.3 Modifiche API per Ricerca e Filtri

```typescript
// In GET /api/invoices
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Parametri filtro
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
  const month = searchParams.get('month') // '01'-'12' o null
  const search = searchParams.get('search')?.trim()
  const statusFilter = searchParams.get('status') // 'registered' | 'unregistered' | null

  // Costruzione filtro date
  let dateFrom: Date
  let dateTo: Date

  if (month) {
    // Filtro per mese specifico
    dateFrom = new Date(year, parseInt(month) - 1, 1)
    dateTo = new Date(year, parseInt(month), 0, 23, 59, 59)
  } else {
    // Filtro per anno intero
    dateFrom = new Date(year, 0, 1)
    dateTo = new Date(year, 11, 31, 23, 59, 59)
  }

  // Costruzione where clause
  const where: Prisma.ElectronicInvoiceWhereInput = {
    invoiceDate: {
      gte: dateFrom,
      lte: dateTo,
    },
    // ... altri filtri esistenti (venueId per manager, ecc.)
  }

  // Filtro stato semplificato
  if (statusFilter === 'registered') {
    where.status = { in: ['RECORDED', 'PAID'] }
  } else if (statusFilter === 'unregistered') {
    where.status = { in: ['IMPORTED', 'MATCHED', 'CATEGORIZED'] }
  }

  // Ricerca full-text
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { supplierName: { contains: search, mode: 'insensitive' } },
      { supplierVat: { contains: search } },
      // Ricerca per importo (se numerico)
      ...(isNumeric(search) ? [{
        totalAmount: { equals: parseFloat(search.replace(',', '.')) }
      }] : []),
    ]
  }

  // Query principale
  const [invoices, total, stats] = await Promise.all([
    prisma.electronicInvoice.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        supplier: { select: { id: true, name: true, vatNumber: true } },
        account: { select: { id: true, code: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.electronicInvoice.count({ where }),
    // Statistiche aggregate
    prisma.electronicInvoice.aggregate({
      where,
      _sum: {
        totalAmount: true,
        netAmount: true,
        vatAmount: true,
      },
      _count: true,
    }),
  ])

  return NextResponse.json({
    data: invoices,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats: {
      totalAmount: stats._sum.totalAmount || 0,
      netAmount: stats._sum.netAmount || 0,
      vatAmount: stats._sum.vatAmount || 0,
      count: stats._count,
    },
  })
}

function isNumeric(str: string): boolean {
  return !isNaN(parseFloat(str.replace(',', '.')))
}
```

### 7.4 Interfacce TypeScript

```typescript
interface InvoiceFilters {
  year?: number
  month?: string  // '01'-'12'
  search?: string
  status?: 'registered' | 'unregistered'
  venueId?: string
}

interface InvoiceStats {
  totalAmount: number
  netAmount: number
  vatAmount: number
  count: number
}

interface InvoiceListResponse {
  data: Invoice[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats: InvoiceStats
}
```

---

## 8. Migrazione Database

### 8.1 Schema Updates

```prisma
model ElectronicInvoice {
  id            String   @id @default(cuid())
  sdiId         String?  @unique

  // Tipo documento (nuovo campo)
  documentType  String   @default("TD01")

  invoiceNumber String
  invoiceDate   DateTime

  supplierId    String?
  supplier      Supplier? @relation(fields: [supplierId], references: [id])
  supplierVat   String
  supplierName  String

  totalAmount   Decimal  @db.Decimal(10, 2)
  vatAmount     Decimal  @db.Decimal(10, 2)
  netAmount     Decimal  @db.Decimal(10, 2)

  status        InvoiceStatus @default(IMPORTED)

  accountId     String?
  account       Account? @relation(fields: [accountId], references: [id])

  // Dati aggiuntivi estratti (nuovi campi)
  lineItems     Json?    // Array di DettaglioLinee
  references    Json?    // DatiRiferimento (DDT, ordini, ecc.)
  vatSummary    Json?    // Riepilogo IVA
  causale       String?  @db.Text

  xmlContent    String?  @db.Text
  fileName      String?

  importedAt    DateTime @default(now())
  processedAt   DateTime?
  recordedAt    DateTime?

  journalEntryId String? @unique
  journalEntry   JournalEntry? @relation(fields: [journalEntryId], references: [id])

  deadlines     InvoiceDeadline[]

  venueId       String
  venue         Venue    @relation(fields: [venueId], references: [id])

  createdBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // Indici per performance
  @@index([invoiceDate])
  @@index([supplierVat])
  @@index([status])
  @@index([documentType])
  @@index([venueId])
}
```

### 8.2 Script di Migrazione

```typescript
// prisma/migrations/xxxx_add_invoice_details/migration.sql

-- Aggiunta campi nuovi
ALTER TABLE "ElectronicInvoice" ADD COLUMN "documentType" TEXT DEFAULT 'TD01';
ALTER TABLE "ElectronicInvoice" ADD COLUMN "lineItems" JSONB;
ALTER TABLE "ElectronicInvoice" ADD COLUMN "references" JSONB;
ALTER TABLE "ElectronicInvoice" ADD COLUMN "vatSummary" JSONB;
ALTER TABLE "ElectronicInvoice" ADD COLUMN "causale" TEXT;

-- Indice per documentType
CREATE INDEX "ElectronicInvoice_documentType_idx" ON "ElectronicInvoice"("documentType");
```

### 8.3 Script per Popolare Dati Esistenti

Creare uno script che ri-parsa le fatture esistenti per estrarre i nuovi dati:

```typescript
// scripts/backfill-invoice-details.ts
import { prisma } from '@/lib/prisma'
import { parseFatturaPA, estraiRiferimenti } from '@/lib/sdi/parser'

async function backfillInvoiceDetails() {
  const invoices = await prisma.electronicInvoice.findMany({
    where: {
      xmlContent: { not: null },
      lineItems: null, // Solo quelle senza dati estratti
    },
    select: {
      id: true,
      xmlContent: true,
    },
  })

  console.log(`Found ${invoices.length} invoices to process`)

  for (const invoice of invoices) {
    try {
      const parsed = parseFatturaPA(invoice.xmlContent!)

      await prisma.electronicInvoice.update({
        where: { id: invoice.id },
        data: {
          documentType: parsed.tipoDocumento,
          lineItems: parsed.dettaglioLinee,
          references: estraiRiferimenti(parsed),
          vatSummary: parsed.datiRiepilogo,
          causale: parsed.causale?.join(' ') || null,
        },
      })

      console.log(`Updated invoice ${invoice.id}`)
    } catch (error) {
      console.error(`Error processing invoice ${invoice.id}:`, error)
    }
  }

  console.log('Done!')
}

backfillInvoiceDetails()
```

---

## 9. Piano di Implementazione

### Fase 1: Database e Backend (Priorità Alta) ✅ COMPLETATA
1. [x] Aggiungere migration per nuovi campi
   - Aggiunto `documentType`, `lineItems`, `references`, `vatSummary`, `causale` a schema.prisma
   - Applicato con `prisma db push`
2. [x] Aggiornare parser.ts per estrarre riferimenti
   - Nuova funzione `estraiDatiEstesi()` per estrarre tutti i dati
   - Nuova funzione `estraiRiferimenti()` per DDT, ordini, contratti
   - Supporto codice articolo nelle linee di dettaglio
3. [x] Aggiornare POST /api/invoices per salvare nuovi dati
   - Estrazione automatica dati estesi all'import
   - Salvataggio in colonne JSON
4. [x] Aggiornare GET /api/invoices per supportare nuovi filtri e ordinamento
   - Parametro `search` per ricerca testuale
   - Parametri `year` e `month` per filtri data
   - Parametri `sortBy` e `sortOrder` per ordinamento
   - Parametro `documentType` per filtro tipo documento
5. [x] Creare script backfill
   - Script: `scripts/backfill-invoice-extended-data.ts`
   - Eseguire con: `npx tsx scripts/backfill-invoice-extended-data.ts`

### Fase 2: Lista Fatture (Priorità Alta)
1. [ ] Creare costanti DOCUMENT_TYPE_CODES e STATUS_DISPLAY
2. [ ] Implementare SortableHeader component
3. [ ] Implementare InvoiceFiltersToolbar con anno/mese/ricerca
4. [ ] Riorganizzare colonne tabella
5. [ ] Aggiungere statistiche aggregate

### Fase 3: Dettaglio Fattura (Priorità Alta)
1. [ ] Ristrutturare InvoiceDetail con nuova UI
2. [ ] Aggiungere sezione descrizioni linee
3. [ ] Aggiungere sezione riferimenti DDT/ordini
4. [ ] Migliorare sezione scadenze con modalità pagamento

### Fase 4: Import Dialog (Priorità Media)
1. [ ] Aggiungere stato editableSupplierData
2. [ ] Implementare form modifica fornitore
3. [ ] Collegare form alla mutation di import

### Fase 5: Test e Rifinitura
1. [ ] Test end-to-end di tutte le funzionalità
2. [ ] Verifica performance con molte fatture
3. [ ] Verifica responsive design

---

## 10. Considerazioni Tecniche

### 10.1 Performance
- Usare indici database per campi filtrati (documentType, invoiceDate, status)
- Implementare debounce sulla ricerca (300ms)
- Caricare statistiche in parallelo con lista

### 10.2 UX
- Mantenere stato filtri in URL per condivisione/bookmark
- Salvare preferenze utente (anno default, ordinamento) in localStorage
- Skeleton loading per stati di caricamento

### 10.3 Compatibilità
- I dati estratti sono opzionali (Json?), quindi fatture vecchie continuano a funzionare
- Lo script backfill può essere eseguito in background senza downtime

---

## 11. Acceptance Criteria

### Lista Fatture
- [ ] Colonne nell'ordine: Doc, Data, Numero, Fornitore, Importo, Stato
- [ ] Tipo documento mostra codice abbreviato (FT, NC, FTD, ecc.)
- [ ] Fornitore mostra solo denominazione, non P.IVA
- [ ] Stato mostra "Registrata" o "Non registrata"
- [ ] Tutte le colonne sono ordinabili
- [ ] Filtro anno funziona
- [ ] Filtro mese funziona
- [ ] Ricerca trova per numero, fornitore, importo
- [ ] Statistiche mostrano totali corretti

### Dettaglio Fattura
- [ ] Mostra tipo documento con descrizione
- [ ] Mostra tabella linee con descrizioni, quantità, prezzi
- [ ] Mostra riferimenti DDT con numero e data
- [ ] Mostra riferimenti ordini se presenti
- [ ] Mostra causale se presente
- [ ] Mostra riepilogo IVA per aliquota
- [ ] Scadenze mostrano modalità pagamento

### Import Dialog
- [ ] Se fornitore nuovo, mostra form modificabile
- [ ] Form permette modifica di tutti i campi fornitore
- [ ] Dati modificati vengono salvati correttamente

---

## 12. Note Finali

Questo PRD copre tutte le richieste specificate. L'implementazione dovrebbe seguire l'ordine delle fasi per garantire che le dipendenze siano rispettate (es. backend prima del frontend).

La struttura modulare permette di implementare le funzionalità incrementalmente, testando ogni fase prima di procedere alla successiva.

// Tipi per Sibill Fatture

export enum InvoiceDocumentType {
  FATTURA = 'FATTURA',
  NOTA_CREDITO = 'NOTA_CREDITO',
  NOTA_DEBITO = 'NOTA_DEBITO',
  PARCELLA = 'PARCELLA',
  AUTOFATTURA = 'AUTOFATTURA',
}

export enum InvoiceDirection {
  RICEVUTE = 'ricevute',
  EMESSE = 'emesse',
}

export interface InvoiceStats {
  imponibile: {
    ricavi: number
    costi: number
    differenza: number
  }
  iva: {
    aCredito: number
    aDebito: number
    ivaNetta: number
  }
  mensile: {
    mese: number
    anno: number
    ricavi: number
    costi: number
  }[]
}

export interface TopCounterpart {
  nome: string
  importo: number
  percentuale: number
}

export interface Corrispettivo {
  id: string
  data: Date
  descrizione: string
  importo: number
  categoria?: string
  incassato: boolean
  registroCassa?: string
  registroBanca?: string
}

export const INVOICE_TYPE_COLORS: Record<InvoiceDocumentType, string> = {
  [InvoiceDocumentType.FATTURA]: '#8cddba',
  [InvoiceDocumentType.NOTA_CREDITO]: '#ffd98c',
  [InvoiceDocumentType.NOTA_DEBITO]: '#c0c8ff',
  [InvoiceDocumentType.PARCELLA]: '#f0c8a0',
  [InvoiceDocumentType.AUTOFATTURA]: '#c8b9df',
} as const

export const INVOICE_TYPE_LABELS: Record<InvoiceDocumentType, string> = {
  [InvoiceDocumentType.FATTURA]: 'Fattura',
  [InvoiceDocumentType.NOTA_CREDITO]: 'Nota di credito',
  [InvoiceDocumentType.NOTA_DEBITO]: 'Nota di debito',
  [InvoiceDocumentType.PARCELLA]: 'Parcella',
  [InvoiceDocumentType.AUTOFATTURA]: 'Autofattura',
} as const

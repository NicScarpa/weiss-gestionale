/**
 * Utility per l'estrazione di fatture elettroniche da archivi ZIP
 *
 * Supporta l'estrazione di file .xml e .p7m (FatturaPA) da archivi ZIP,
 * incluse strutture con cartelle annidate.
 */

import JSZip from 'jszip'
import { logger } from './logger'

// ============================================================================
// Types
// ============================================================================

export interface ExtractedFile {
  /** Nome del file (senza path) */
  name: string
  /** Path completo all'interno dello ZIP */
  originalPath: string
  /** Contenuto binario del file */
  content: ArrayBuffer
  /** Dimensione in bytes */
  size: number
  /** Nome dello ZIP di origine */
  sourceZipName: string
}

export interface ZipExtractionError {
  code: ZipErrorCode
  message: string
  fileName?: string
}

export type ZipErrorCode =
  | 'ZIP_CORRUPT'
  | 'ZIP_EMPTY'
  | 'ZIP_TOO_LARGE'
  | 'ZIP_FILE_TOO_LARGE'
  | 'ZIP_TOO_MANY_FILES'
  | 'ZIP_EXTRACTION_FAILED'
  | 'ZIP_NESTED_NOT_SUPPORTED'

export interface ZipExtractionResult {
  success: boolean
  files: ExtractedFile[]
  errors: ZipExtractionError[]
  stats: {
    /** Numero totale di file nello ZIP */
    totalFiles: number
    /** Numero di file fattura estratti */
    invoiceFiles: number
    /** Numero di file ignorati (non fatture) */
    skippedFiles: number
    /** Numero di file con errori */
    errorFiles: number
  }
}

export interface ZipExtractionOptions {
  /** Dimensione massima per singolo file (default: 10MB) */
  maxFileSize?: number
  /** Numero massimo di file da estrarre (default: 500) */
  maxTotalFiles?: number
  /** Callback per progresso estrazione */
  onProgress?: (extracted: number, total: number) => void
}

// ============================================================================
// Constants
// ============================================================================

/** Dimensione massima ZIP: 50MB */
const MAX_ZIP_SIZE = 50 * 1024 * 1024

/** Dimensione massima singolo file: 10MB */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024

/** Numero massimo file per ZIP */
const DEFAULT_MAX_FILES = 500

/** Estensioni file fattura supportate */
const INVOICE_EXTENSIONS = ['.xml', '.p7m']

/** Magic bytes per identificare ZIP */
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04"

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Verifica se un file è un archivio ZIP basandosi sull'estensione
 */
export function isZipFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip')
}

/**
 * Verifica se il contenuto è un archivio ZIP basandosi sui magic bytes
 */
export function isZipContent(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false

  const view = new Uint8Array(buffer)
  return (
    view[0] === ZIP_MAGIC_BYTES[0] &&
    view[1] === ZIP_MAGIC_BYTES[1] &&
    view[2] === ZIP_MAGIC_BYTES[2] &&
    view[3] === ZIP_MAGIC_BYTES[3]
  )
}

/**
 * Verifica se un file è una fattura elettronica (XML o P7M)
 */
export function isInvoiceFile(filename: string): boolean {
  const lowerName = filename.toLowerCase()
  return INVOICE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

/**
 * Estrae il nome del file dal path completo
 */
function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1]
}

/**
 * Verifica se il file è uno ZIP annidato
 */
function isNestedZip(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip')
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Estrae i file fattura (.xml, .p7m) da un archivio ZIP
 *
 * @param zipBuffer - Buffer contenente l'archivio ZIP
 * @param zipFileName - Nome del file ZIP (per logging e tracciamento)
 * @param options - Opzioni di estrazione
 * @returns Risultato dell'estrazione con file, errori e statistiche
 *
 * @example
 * ```typescript
 * const result = await extractInvoicesFromZip(buffer, 'fatture.zip')
 * if (result.success) {
 *   console.log(`Estratti ${result.stats.invoiceFiles} file`)
 * }
 * ```
 */
export async function extractInvoicesFromZip(
  zipBuffer: ArrayBuffer,
  zipFileName: string,
  options: ZipExtractionOptions = {}
): Promise<ZipExtractionResult> {
  const {
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalFiles = DEFAULT_MAX_FILES,
    onProgress,
  } = options

  const result: ZipExtractionResult = {
    success: false,
    files: [],
    errors: [],
    stats: {
      totalFiles: 0,
      invoiceFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
    },
  }

  logger.info('Inizio estrazione ZIP', { zipFileName, size: zipBuffer.byteLength })

  // Verifica dimensione ZIP
  if (zipBuffer.byteLength > MAX_ZIP_SIZE) {
    result.errors.push({
      code: 'ZIP_TOO_LARGE',
      message: `L'archivio supera il limite di ${MAX_ZIP_SIZE / 1024 / 1024}MB`,
    })
    return result
  }

  // Verifica magic bytes
  if (!isZipContent(zipBuffer)) {
    result.errors.push({
      code: 'ZIP_CORRUPT',
      message: 'Il file non sembra essere un archivio ZIP valido',
    })
    return result
  }

  let zip: JSZip

  try {
    zip = await JSZip.loadAsync(zipBuffer)
  } catch (error) {
    logger.error('Errore apertura ZIP', { error, zipFileName })
    result.errors.push({
      code: 'ZIP_CORRUPT',
      message: `Impossibile aprire l'archivio: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
    })
    return result
  }

  // Raccogli tutti i file (escludendo directory)
  const allFiles: { path: string; file: JSZip.JSZipObject }[] = []

  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      allFiles.push({ path: relativePath, file })
    }
  })

  result.stats.totalFiles = allFiles.length

  logger.info('File trovati nello ZIP', { totalFiles: allFiles.length, zipFileName })

  // Verifica numero file
  if (allFiles.length > maxTotalFiles) {
    result.errors.push({
      code: 'ZIP_TOO_MANY_FILES',
      message: `L'archivio contiene ${allFiles.length} file, il limite è ${maxTotalFiles}`,
    })
    return result
  }

  // Filtra solo i file fattura
  const invoiceFiles = allFiles.filter(({ path }) => {
    const fileName = getFileName(path)

    // Ignora file nascosti e di sistema
    if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) {
      return false
    }

    // Verifica ZIP annidati
    if (isNestedZip(fileName)) {
      result.errors.push({
        code: 'ZIP_NESTED_NOT_SUPPORTED',
        message: `ZIP annidato non supportato: ${fileName}`,
        fileName,
      })
      result.stats.errorFiles++
      return false
    }

    return isInvoiceFile(fileName)
  })

  // Calcola file saltati
  result.stats.skippedFiles =
    allFiles.length - invoiceFiles.length - result.stats.errorFiles

  if (invoiceFiles.length === 0) {
    result.errors.push({
      code: 'ZIP_EMPTY',
      message: "L'archivio non contiene file fattura (.xml o .p7m)",
    })
    return result
  }

  logger.info('File fattura da estrarre', {
    invoiceCount: invoiceFiles.length,
    skipped: result.stats.skippedFiles,
  })

  // Estrai ogni file
  let extractedCount = 0

  for (const { path, file } of invoiceFiles) {
    const fileName = getFileName(path)

    try {
      // Verifica dimensione prima dell'estrazione
      // @ts-expect-error - _data.uncompressedSize non è nel tipo ma esiste
      const uncompressedSize = file._data?.uncompressedSize

      if (uncompressedSize && uncompressedSize > maxFileSize) {
        result.errors.push({
          code: 'ZIP_FILE_TOO_LARGE',
          message: `Il file supera il limite di ${maxFileSize / 1024 / 1024}MB`,
          fileName,
        })
        result.stats.errorFiles++
        continue
      }

      // Estrai contenuto
      const content = await file.async('arraybuffer')

      // Verifica dimensione effettiva
      if (content.byteLength > maxFileSize) {
        result.errors.push({
          code: 'ZIP_FILE_TOO_LARGE',
          message: `Il file supera il limite di ${maxFileSize / 1024 / 1024}MB`,
          fileName,
        })
        result.stats.errorFiles++
        continue
      }

      result.files.push({
        name: fileName,
        originalPath: path,
        content,
        size: content.byteLength,
        sourceZipName: zipFileName,
      })

      extractedCount++
      result.stats.invoiceFiles++

      // Callback progresso
      if (onProgress) {
        onProgress(extractedCount, invoiceFiles.length)
      }
    } catch (error) {
      logger.error('Errore estrazione file', { error, fileName, path })
      result.errors.push({
        code: 'ZIP_EXTRACTION_FAILED',
        message: `Errore estrazione: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
        fileName,
      })
      result.stats.errorFiles++
    }
  }

  result.success = result.files.length > 0

  logger.info('Estrazione ZIP completata', {
    success: result.success,
    extracted: result.files.length,
    errors: result.errors.length,
    stats: result.stats,
  })

  return result
}

// ============================================================================
// File Conversion
// ============================================================================

/**
 * Crea un oggetto File da un file estratto
 *
 * @param extracted - File estratto dallo ZIP
 * @returns Oggetto File standard utilizzabile nel flusso di upload
 */
export function createFileFromExtracted(extracted: ExtractedFile): File {
  const blob = new Blob([extracted.content], {
    type: extracted.name.toLowerCase().endsWith('.xml')
      ? 'application/xml'
      : 'application/pkcs7-mime',
  })

  return new File([blob], extracted.name, {
    type: blob.type,
    lastModified: Date.now(),
  })
}

/**
 * Converte tutti i file estratti in oggetti File
 */
export function createFilesFromExtracted(extracted: ExtractedFile[]): File[] {
  return extracted.map(createFileFromExtracted)
}

// ============================================================================
// Error Messages (Italian)
// ============================================================================

/**
 * Restituisce un messaggio di errore user-friendly in italiano
 */
export function getZipErrorMessage(error: ZipExtractionError): string {
  switch (error.code) {
    case 'ZIP_CORRUPT':
      return "L'archivio ZIP sembra essere corrotto o non valido"
    case 'ZIP_EMPTY':
      return "L'archivio non contiene fatture elettroniche (.xml o .p7m)"
    case 'ZIP_TOO_LARGE':
      return "L'archivio supera la dimensione massima consentita (50MB)"
    case 'ZIP_FILE_TOO_LARGE':
      return error.fileName
        ? `Il file "${error.fileName}" supera la dimensione massima consentita (10MB)`
        : 'Un file supera la dimensione massima consentita (10MB)'
    case 'ZIP_TOO_MANY_FILES':
      return "L'archivio contiene troppi file (massimo 500)"
    case 'ZIP_EXTRACTION_FAILED':
      return error.fileName
        ? `Errore durante l'estrazione di "${error.fileName}"`
        : "Errore durante l'estrazione di un file"
    case 'ZIP_NESTED_NOT_SUPPORTED':
      return error.fileName
        ? `Gli archivi ZIP annidati non sono supportati: "${error.fileName}"`
        : 'Gli archivi ZIP annidati non sono supportati'
    default:
      return error.message || 'Errore sconosciuto durante l\'estrazione'
  }
}

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

export interface FatturaLetta {
  chiave: string // nome del file: identifica la riga in tutto il flusso
  nomeFile: string
  xmlContent: string
  daZip: string | null // nome dell'archivio di provenienza
  numero: string
  data: string // YYYY-MM-DD
  tipoDocumento: string
  denominazioneFornitore: string
  partitaIvaFornitore: string
  denominazioneCliente: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  aliquote: number[] // tutte, non una sola
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
        motivo: errore instanceof Error ? errore.message : 'Archivio illeggibile',
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

  // Se due file omonimi arrivano da archivi diversi, `chiave` collide: la
  // rendiamo univoca qui, in coda, senza toccare `nomeFile` (che resta il
  // nome reale del file per i messaggi all'utente).
  const viste = new Map<string, number>()
  for (const f of fatture) {
    const quante = viste.get(f.chiave) ?? 0
    viste.set(f.chiave, quante + 1)
    if (quante > 0) f.chiave = `${f.chiave}#${quante + 1}`
  }

  return { fatture, scartati, metadatiIgnorati }
}

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')

// Create output directory if not exists
const outputDir = path.join(__dirname, '../docs')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Create PDF document
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 }
})

const outputPath = path.join(outputDir, 'Ricerca_Automazione_Import_Fatture.pdf')
doc.pipe(fs.createWriteStream(outputPath))

// Colors
const colors = {
  primary: '#1e40af',
  success: '#16a34a',
  warning: '#ca8a04',
  danger: '#dc2626',
  gray: '#6b7280',
  black: '#1f2937',
  lightGray: '#f3f4f6'
}

// Helper functions
function addTitle(text) {
  doc.fontSize(22)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text(text, { align: 'center' })
  doc.moveDown(0.5)
}

function addSubtitle(text) {
  doc.fontSize(11)
     .fillColor(colors.gray)
     .font('Helvetica')
     .text(text, { align: 'center' })
  doc.moveDown(1.5)
}

function addSection(text) {
  doc.moveDown(0.5)
  doc.fontSize(16)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text(text)
  doc.moveDown(0.3)
  // Underline
  const y = doc.y
  doc.strokeColor(colors.primary)
     .lineWidth(1)
     .moveTo(50, y)
     .lineTo(250, y)
     .stroke()
  doc.moveDown(0.5)
}

function addSubSection(text) {
  doc.fontSize(13)
     .fillColor(colors.black)
     .font('Helvetica-Bold')
     .text(text)
  doc.moveDown(0.3)
}

function addParagraph(text) {
  doc.fontSize(10)
     .fillColor(colors.black)
     .font('Helvetica')
     .text(text, { align: 'justify', lineGap: 2 })
  doc.moveDown(0.5)
}

function addBullet(text, indent = 0) {
  const bulletX = 60 + (indent * 15)
  doc.fontSize(10)
     .fillColor(colors.black)
     .font('Helvetica')
     .text('•', bulletX, doc.y, { continued: true })
     .text('  ' + text, { align: 'left', lineGap: 2 })
}

function addNumbered(number, text) {
  doc.fontSize(10)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text(number + '.', 60, doc.y, { continued: true })
     .fillColor(colors.black)
     .font('Helvetica')
     .text('  ' + text, { align: 'left', lineGap: 2 })
}

function addTable(headers, rows) {
  const startX = 50
  const colWidth = (doc.page.width - 100) / headers.length
  const rowHeight = 25
  let y = doc.y

  // Header
  doc.fillColor(colors.primary)
  doc.rect(startX, y, doc.page.width - 100, rowHeight).fill()

  doc.fillColor('white')
     .font('Helvetica-Bold')
     .fontSize(9)

  headers.forEach((header, i) => {
    doc.text(header, startX + (i * colWidth) + 5, y + 7, { width: colWidth - 10 })
  })

  y += rowHeight

  // Rows
  rows.forEach((row, rowIndex) => {
    if (y > doc.page.height - 100) {
      doc.addPage()
      y = 50
    }

    const bgColor = rowIndex % 2 === 0 ? colors.lightGray : 'white'
    doc.fillColor(bgColor)
    doc.rect(startX, y, doc.page.width - 100, rowHeight).fill()

    doc.fillColor(colors.black)
       .font('Helvetica')
       .fontSize(9)

    row.forEach((cell, i) => {
      doc.text(cell, startX + (i * colWidth) + 5, y + 7, { width: colWidth - 10 })
    })

    y += rowHeight
  })

  doc.y = y + 10
}

function addCodeBlock(text) {
  const padding = 10
  const startY = doc.y

  doc.fillColor('#f1f5f9')
  doc.roundedRect(50, startY, doc.page.width - 100, 60, 5).fill()

  doc.fontSize(9)
     .fillColor('#334155')
     .font('Courier')
     .text(text, 60, startY + padding, { width: doc.page.width - 120 })

  doc.y = startY + 70
  doc.font('Helvetica')
}

function addHighlight(label, value, color = colors.success) {
  doc.fontSize(10)
     .fillColor(colors.gray)
     .font('Helvetica')
     .text(label + ': ', { continued: true })
     .fillColor(color)
     .font('Helvetica-Bold')
     .text(value)
}

// ============ DOCUMENT CONTENT ============

// Title Page
addTitle('Ricerca: Automazione Import')
addTitle('Fatture Elettroniche')
doc.moveDown(0.5)
addSubtitle('Analisi delle opzioni per automatizzare l\'import delle fatture elettroniche')
addSubtitle('Sistema Gestionale Weiss Cafè')

doc.moveDown(2)

// Date
doc.fontSize(10)
   .fillColor(colors.gray)
   .text('Data: ' + new Date().toLocaleDateString('it-IT'), { align: 'center' })

doc.addPage()

// Obiettivo
addSection('Obiettivo')
addParagraph('Analizzare le opzioni per automatizzare l\'import delle fatture elettroniche, attualmente manuale, con:')
addNumbered(1, 'Un pulsante per avviare l\'import su richiesta')
addNumbered(2, 'Import automatico schedulato (es. giornaliero)')

doc.moveDown(1)

// Stato Attuale
addSection('Stato Attuale del Sistema')

addSubSection('Import Manuale Esistente')
addBullet('Componente: InvoiceImportDialog.tsx')
addBullet('Flusso: Upload file → Parsing → Auto-match fornitori → Review manuale → Import')
addBullet('Formati supportati: XML e P7M (firmati digitalmente)')
addBullet('Parser: src/lib/sdi/parser.ts + src/lib/p7m-utils.ts')

doc.moveDown(0.5)

addSubSection('Cosa Manca')
addBullet('Nessun webhook automatico')
addBullet('Nessun import schedulato/cron')
addBullet('Nessuna integrazione PEC automatica')
addBullet('Nessun polling del Cassetto Fiscale')

doc.moveDown(1)

// Sorgenti Fatture
addSection('Sorgenti delle Fatture Elettroniche')
addParagraph('Le fatture passive possono arrivare attraverso tre canali principali:')

doc.moveDown(0.5)
addTable(
  ['Sorgente', 'Descrizione', 'Automazione'],
  [
    ['Cassetto Fiscale', 'Portale AdE con storico', 'Via servizi API terzi'],
    ['PEC', 'Email certificata con P7M', 'Polling IMAP'],
    ['SDI diretto', 'Codice destinatario', 'Webhook da intermediario']
  ]
)

doc.addPage()

// Opzioni di Automazione
addSection('Opzioni di Automazione')

addSubSection('Opzione 1: API Intermediari SDI (Consigliata)')
addParagraph('Servizi che fanno da ponte con il Sistema di Interscambio, gestendo l\'autenticazione con l\'Agenzia delle Entrate.')

doc.moveDown(0.3)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('fattura-elettronica-api.it')
doc.moveDown(0.2)
addBullet('Download massivo fatture ricevute + polling nuove fatture')
addBullet('Costi: ~1 credito/fattura ricevuta')
addBullet('API REST con parametri: date_from, date_to, unread, partita_iva')
addBullet('Formati: XML, PDF, allegati decodificati')
addBullet('Pro: Documentazione completa, esempi disponibili')

doc.moveDown(0.5)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('Openapi.com')
doc.moveDown(0.2)
addBullet('Ricezione e invio fatture via API')
addBullet('Costi: Da €0.022/fattura')
addBullet('Pro: Importazione storico fatture')
addBullet('Contro: Configurazione iniziale con AdE richiesta')

doc.moveDown(0.5)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('CWBI Cassetto Fiscale')
doc.moveDown(0.2)
addBullet('Accesso diretto al Cassetto Fiscale via API')
addBullet('Autenticazione: FiscoOnLine, SPID, CIE')
addBullet('Pro: Accesso completo a F24, dichiarazioni, fatture')
addBullet('Contro: SPID/CIE non automatizzabile')

doc.moveDown(1)

addSubSection('Opzione 2: Polling PEC')
addParagraph('Connessione IMAP alla casella PEC per estrarre automaticamente gli allegati P7M.')
addBullet('Pro: Nessun costo aggiuntivo se già si ha PEC')
addBullet('Contro: Solo fatture inviate via PEC (non tutte)')
addBullet('Contro: Gestione certificati SSL/TLS complessa')
addBullet('Contro: Parsing email complesso')

doc.moveDown(1)

addSubSection('Opzione 3: n8n Workflow Automation')
addParagraph('Piattaforma di automazione con interfaccia visuale per orchestrare il flusso.')
addBullet('Pro: UI visuale, logging, retry automatici')
addBullet('Pro: Integrazioni pronte per email, HTTP, database')
addBullet('Contro: Richiede hosting separato')
addBullet('Contro: Complessità aggiuntiva da gestire')

doc.moveDown(1)

addSubSection('Opzione 4: Built-in Node.js Scheduler')
addParagraph('Implementazione diretta nell\'applicazione usando node-cron.')
addBullet('Pro: Nessuna dipendenza esterna, codice nel repository')
addBullet('Contro: Richiede gestione stato, retry, logging manuale')

doc.addPage()

// Problemi e Sfide
addSection('Problemi e Sfide')

addSubSection('1. Autenticazione Agenzia Entrate')
addParagraph('SPID e CIE non sono automatizzabili perché richiedono interazione umana (OTP, biometria). La soluzione è usare intermediari autorizzati che gestiscono l\'autenticazione.')

addSubSection('2. Fornitori Nuovi')
addParagraph('Attualmente i fornitori nuovi richiedono review manuale per assegnare venue e conto spesa.')
addBullet('Soluzione A: Auto-assegnare venue di default')
addBullet('Soluzione B: Coda "da revisionare" con notifiche')
addBullet('Soluzione C: Regole smart basate su P.IVA o pattern nome')

addSubSection('3. Gestione Duplicati')
addParagraph('Già gestito nel sistema attuale con check su numero + data + P.IVA fornitore. L\'import automatico deve rispettare questa logica.')

addSubSection('4. Rate Limiting e Errori')
addParagraph('Le API esterne hanno limiti di richieste. Necessario implementare retry con backoff esponenziale, logging errori e sistema di alerting.')

addSubSection('5. Costi')
addParagraph('I servizi API addebitano per fattura. Necessario stimare il volume mensile per calcolare il budget.')

doc.addPage()

// Architettura Proposta
addSection('Architettura Proposta')

addSubSection('Fase 1: Pulsante "Sincronizza Fatture"')
addCodeBlock('UI Button → POST /api/invoices/sync → Fetch da provider → Import batch')

addSubSection('Fase 2: Scheduler Automatico')
addCodeBlock('Cron (node-cron) → Sync giornaliero → Log risultati → Notifica admin')

doc.moveDown(1)

addSubSection('Componenti Necessari')

addNumbered(1, 'API Endpoint: POST /api/invoices/sync')
addBullet('Chiama provider esterno', 1)
addBullet('Scarica fatture nuove', 1)
addBullet('Importa usando logica esistente', 1)
addBullet('Ritorna report (importate, duplicate, errori)', 1)

doc.moveDown(0.3)

addNumbered(2, 'Configurazione Provider')
addBullet('Credenziali API in variabili ambiente', 1)
addBullet('Partita IVA azienda', 1)
addBullet('Parametri sync (date range, filtri)', 1)

doc.moveDown(0.3)

addNumbered(3, 'Tabella InvoiceSyncLog nel database')
addBullet('Traccia ogni sincronizzazione', 1)
addBullet('Status: RUNNING, SUCCESS, PARTIAL, FAILED', 1)
addBullet('Contatori: fetched, imported, duplicates, errors', 1)

doc.moveDown(0.3)

addNumbered(4, 'UI Admin')
addBullet('Pulsante sync manuale', 1)
addBullet('Storico sincronizzazioni', 1)
addBullet('Configurazione schedule', 1)

doc.addPage()

// Raccomandazione
addSection('Raccomandazione')

doc.fontSize(12)
   .fillColor(colors.success)
   .font('Helvetica-Bold')
   .text('Provider Consigliato: fattura-elettronica-api.it')
doc.moveDown(0.5)

addParagraph('Motivazioni della scelta:')
addNumbered(1, 'API REST ben documentate con esempi')
addNumbered(2, 'Download massivo storico + polling incrementale')
addNumbered(3, 'Costi ragionevoli (~€0.10-0.20/fattura stimato)')
addNumbered(4, 'Supporto formati XML e PDF')
addNumbered(5, 'Libreria PHP/esempi disponibili adattabili')

doc.moveDown(1)

addSubSection('Piano di Implementazione')

doc.moveDown(0.3)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('MVP (Fase 1)')
addBullet('Registrazione account provider')
addBullet('Endpoint /api/invoices/sync')
addBullet('Pulsante in UI fatture')

doc.moveDown(0.3)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('Fase 2')
addBullet('node-cron scheduler')
addBullet('Configurazione orario in settings')
addBullet('Email notifica admin')

doc.moveDown(0.3)
doc.fontSize(11).fillColor(colors.primary).font('Helvetica-Bold').text('Fase 3 (opzionale)')
addBullet('n8n per orchestrazione avanzata')
addBullet('Webhook real-time')
addBullet('Dashboard sync status')

doc.moveDown(1.5)

// Prossimi Passi
addSection('Prossimi Passi')
addNumbered(1, 'Scelta provider: Confermare fattura-elettronica-api.it o alternativa')
addNumbered(2, 'Account test: Creare account e testare API con P.IVA reale')
addNumbered(3, 'Stima costi: Calcolare volume mensile fatture × costo unitario')
addNumbered(4, 'Definire comportamento: Cosa fare con fornitori nuovi? Venue di default?')

// Footer
doc.moveDown(2)
doc.fontSize(8)
   .fillColor(colors.gray)
   .text('Documento generato automaticamente - Sistema Gestionale Weiss Cafè', { align: 'center' })

// Finalize PDF
doc.end()

console.log('PDF generato:', outputPath)

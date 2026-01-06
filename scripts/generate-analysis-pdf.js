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

const outputPath = path.join(outputDir, 'Analisi_PRD_vs_Implementazione_2026-01-04.pdf')
doc.pipe(fs.createWriteStream(outputPath))

// Colors
const colors = {
  primary: '#1e40af',
  success: '#16a34a',
  warning: '#ca8a04',
  danger: '#dc2626',
  gray: '#6b7280',
  black: '#1f2937'
}

// Helper functions
function addTitle(text) {
  doc.fontSize(24)
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
  doc.fontSize(16)
     .fillColor(colors.primary)
     .font('Helvetica-Bold')
     .text(text)
  doc.moveDown(0.5)
  doc.moveTo(50, doc.y)
     .lineTo(545, doc.y)
     .stroke(colors.primary)
  doc.moveDown(0.5)
}

function addSubSection(text) {
  doc.fontSize(12)
     .fillColor(colors.black)
     .font('Helvetica-Bold')
     .text(text)
  doc.moveDown(0.3)
}

function addText(text) {
  doc.fontSize(10)
     .fillColor(colors.black)
     .font('Helvetica')
     .text(text)
  doc.moveDown(0.3)
}

function addCheckItem(text, checked) {
  const symbol = checked ? '[X]' : '[ ]'
  const color = checked ? colors.success : colors.gray
  doc.fontSize(10)
     .fillColor(color)
     .font('Helvetica')
     .text(`${symbol} ${text}`)
}

function addTableRow(cells, isHeader = false) {
  const startX = 50
  const cellWidths = [180, 100, 215]
  let x = startX

  cells.forEach((cell, i) => {
    doc.fontSize(isHeader ? 10 : 9)
       .fillColor(isHeader ? colors.primary : colors.black)
       .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
       .text(cell, x, doc.y, { width: cellWidths[i], align: 'left' })
    x += cellWidths[i]
  })
  doc.moveDown(0.5)
}

function addStatusBadge(text, color) {
  doc.fontSize(9)
     .fillColor(color)
     .font('Helvetica-Bold')
     .text(text, { continued: true })
     .fillColor(colors.black)
     .font('Helvetica')
}

// Start document
addTitle('Analisi PRD vs Implementazione')
addSubtitle('Weiss Gestionale - 4 Gennaio 2026')

doc.fontSize(10)
   .fillColor(colors.gray)
   .text('PRD Analizzati: PRD_v1_1.md, PRD_Modulo_Gestione_Personale_v1.0.md, Budget_Section_Specifications.md', { align: 'center' })
doc.moveDown(2)

// Executive Summary
addSection('Riepilogo Esecutivo')

// Table header
doc.fontSize(10).fillColor(colors.primary).font('Helvetica-Bold')
const tableY = doc.y
doc.text('Fase', 50, tableY, { width: 200 })
doc.text('Completamento', 250, tableY, { width: 100 })
doc.text('Stato', 350, tableY, { width: 150 })
doc.moveDown(0.5)

// Draw line
doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb')
doc.moveDown(0.3)

// Table rows
const phases = [
  ['Fase 1 - MVP', '~85%', 'Quasi completa', colors.success],
  ['Fase 2 - Consolidamento', '~20%', 'In ritardo', colors.warning],
  ['Fase 3 - Integrazioni', '~0%', 'Non iniziata', colors.danger],
  ['Fase 4 - Modulo Personale', '~75%', 'In corso', colors.warning],
  ['Fase 5 - Miglioramenti', '~90%', 'Quasi completa', colors.success]
]

phases.forEach(([fase, pct, stato, color]) => {
  const rowY = doc.y
  doc.fontSize(9).fillColor(colors.black).font('Helvetica')
  doc.text(fase, 50, rowY, { width: 200 })
  doc.text(pct, 250, rowY, { width: 100 })
  doc.fillColor(color).font('Helvetica-Bold')
  doc.text(stato, 350, rowY, { width: 150 })
  doc.moveDown(0.4)
})

doc.moveDown(1)

// Phase 1
addSection('Fase 1: MVP (~85%)')

addSubSection('1.1 Autenticazione e RBAC [100%]')
addCheckItem('Login email/password (NextAuth.js v5)', true)
addCheckItem('Ruoli (admin, manager, staff)', true)
addCheckItem('Permessi granulari (Sistema JSON)', true)
addCheckItem('Multi-sede', true)
doc.moveDown(0.5)

addSubSection('1.2 Chiusura Cassa [95%]')
addCheckItem('Form conteggio banconote/monete', true)
addCheckItem('Calcolo differenza (soglia 5 EUR)', true)
addCheckItem('Workflow (draft -> submitted -> validated)', true)
addCheckItem('PWA offline-first', true)
addCheckItem('Export PDF/Excel', true)
addCheckItem('Auto-generazione Prima Nota', false)
doc.moveDown(0.5)

addSubSection('1.3 Prima Nota [90%]')
addCheckItem('Registro CASSA/BANCA', true)
addCheckItem('Movimenti manuali + filtri', true)
addCheckItem('Saldi progressivi', true)
addCheckItem('Export PDF/Excel', true)
addCheckItem('Riconciliazione bancaria (Fase 3)', false)

// New page
doc.addPage()

// Phase 2
addSection('Fase 2: Consolidamento (~20%)')

addSubSection('2.1 Budget [40%] - GAP CRITICO')
addCheckItem('Schema Budget mensile', true)
addCheckItem('CRUD righe budget', true)
doc.fillColor(colors.danger)
addCheckItem('Categorie personalizzate - CRITICO', false)
addCheckItem('Wizard configurazione', false)
addCheckItem('Drag & drop mapping conti', false)
doc.moveDown(0.5)

addSubSection('2.2 Automazioni [30%]')
addCheckItem('Cron job reminder turni', true)
addCheckItem('Cron job auto clock-out', true)
addCheckItem('Auto journal entries da chiusura', false)
addCheckItem('Email recap giornaliero', false)

doc.moveDown(1)

// Phase 3
addSection('Fase 3: Integrazioni (~0%)')
addText('Nessuna integrazione avanzata ancora implementata:')
addCheckItem('SDI Import fatture XML', false)
addCheckItem('Open Banking / Riconciliazione', false)
addCheckItem('Tracking prezzi fornitori', false)

doc.moveDown(1)

// Phase 4
addSection('Fase 4: Modulo Personale (~75%)')

addSubSection('4.1-4.3 Anagrafica e Vincoli [70-95%]')
addCheckItem('Anagrafica dipendenti estesa', true)
addCheckItem('Schema vincoli individuali', true)
addCheckItem('Schema vincoli relazionali', true)
addCheckItem('API POST vincoli', false)
addCheckItem('UI gestione vincoli', false)
doc.moveDown(0.5)

addSubSection('4.4 Generazione Turni [80%]')
addCheckItem('Algoritmo greedy', true)
addCheckItem('Rispetto vincoli', true)
addCheckItem('Workflow DRAFT -> PUBLISHED', true)
addCheckItem('Scambio turni', false)
doc.moveDown(0.5)

addSubSection('4.5-4.6 Portale e Presenze [85-90%]')
addCheckItem('Portale dipendente PWA', true)
addCheckItem('Timbratura GPS con geofencing', true)
addCheckItem('Gestione ferie con workflow', true)
addCheckItem('Rilevazione anomalie', true)
addCheckItem('QR Code timbratura', false)
doc.moveDown(0.5)

addSubSection('4.8 Notifiche Push [50%] - TRIGGER MANCANTI')
addCheckItem('Schema DB completo', true)
addCheckItem('API preferenze', true)
addCheckItem('UI preferenze nel portale', true)
doc.fillColor(colors.danger)
addCheckItem('Trigger invio notifiche - MANCA COLLEGAMENTO', false)

// New page
doc.addPage()

// Priority Actions
addSection('Priorita\' Interventi')

doc.fontSize(12).fillColor(colors.danger).font('Helvetica-Bold')
doc.text('ALTA PRIORITA\'')
doc.moveDown(0.3)

doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('1. Trigger Notifiche (~2-3 ore)')
doc.fontSize(9).fillColor(colors.gray)
doc.text('   - Collegare notifyShiftPublished() a publish schedule')
doc.text('   - Collegare notifyLeaveApproved/Rejected()')
doc.text('   - Collegare notifyAnomalyCreated()')
doc.moveDown(0.5)

doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('2. Auto Journal Entries (~4-6 ore)')
doc.fontSize(9).fillColor(colors.gray)
doc.text('   - Trigger su validazione chiusura')
doc.text('   - Generare movimenti automatici')
doc.moveDown(0.5)

doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('3. Budget Categories (~2-3 giorni)')
doc.fontSize(9).fillColor(colors.gray)
doc.text('   - Tabelle BudgetCategory, AccountBudgetMapping')
doc.text('   - Wizard + drag & drop')
doc.moveDown(1)

doc.fontSize(12).fillColor(colors.warning).font('Helvetica-Bold')
doc.text('MEDIA PRIORITA\'')
doc.moveDown(0.3)
doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('4. API POST Vincoli (~2 ore)')
doc.text('5. UI Vincoli Relazionali (~4 ore)')
doc.text('6. Scambio Turni (~1 giorno)')
doc.moveDown(1)

doc.fontSize(12).fillColor(colors.success).font('Helvetica-Bold')
doc.text('BASSA PRIORITA\' (Fase successiva)')
doc.moveDown(0.3)
doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('7. SDI Import')
doc.text('8. Open Banking')
doc.text('9. QR Code Timbratura')
doc.text('10. Tracking Prezzi')

doc.moveDown(2)

// Missing Notification Triggers
addSection('Trigger Notifiche Mancanti')

doc.fontSize(9).fillColor(colors.gray).font('Helvetica')
doc.text('I trigger sono stati creati in src/lib/notifications/triggers.ts ma NON sono ancora chiamati dalle API:')
doc.moveDown(0.5)

const triggers = [
  ['api/schedules/[id]/publish/route.ts', 'notifyShiftPublished()'],
  ['api/leave-requests/[id]/approve/route.ts', 'notifyLeaveApproved()'],
  ['api/leave-requests/[id]/reject/route.ts', 'notifyLeaveRejected()'],
  ['api/leave-requests/route.ts (POST)', 'notifyNewLeaveRequest()'],
  ['api/attendance/anomalies/route.ts', 'notifyAnomalyCreated()'],
  ['api/attendance/anomalies/[id]/resolve', 'notifyAnomalyResolved()']
]

triggers.forEach(([route, trigger]) => {
  doc.fontSize(9).fillColor(colors.black).font('Helvetica')
  doc.text(`${route}`, { continued: true })
  doc.fillColor(colors.primary).font('Helvetica-Bold')
  doc.text(` -> ${trigger}`)
})

// Footer
doc.moveDown(3)
doc.fontSize(8)
   .fillColor(colors.gray)
   .font('Helvetica')
   .text('Generato il 4 Gennaio 2026 - Weiss Gestionale', { align: 'center' })

// Finalize
doc.end()

console.log(`PDF generato: ${outputPath}`)

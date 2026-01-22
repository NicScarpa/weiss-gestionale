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

const outputPath = path.join(outputDir, 'Analisi_PRD_vs_Implementazione_2026-01-06.pdf')
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

function addText(text, indent = 0) {
  doc.fontSize(10)
     .fillColor(colors.black)
     .font('Helvetica')
     .text(text, 50 + indent, doc.y)
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

function addBullet(text, indent = 0) {
  doc.fontSize(10)
     .fillColor(colors.black)
     .font('Helvetica')
     .text(`• ${text}`, 50 + indent, doc.y)
  doc.moveDown(0.2)
}

// Start document
addTitle('Analisi PRD vs Implementazione')
addSubtitle('Sistema Gestionale Weiss Cafe - 6 Gennaio 2026')

doc.fontSize(10)
   .fillColor(colors.gray)
   .text('PRD: PRD_v1_1.md, PRD_Modulo_Gestione_Personale_v1.0.md, Budget_Section_Specifications.md', { align: 'center' })
doc.moveDown(2)

// Executive Summary
addSection('1. Sommario Esecutivo')

addText('Completamento globale stimato: 78-82%')
doc.moveDown(0.5)

// Module scores table
const modules = [
  ['Chiusura Cassa', '85%', 'Operativo'],
  ['Prima Nota', '85%', 'Bug minore'],
  ['Dashboard', '75%', 'Operativo'],
  ['Staff Management', '90%', 'Operativo'],
  ['Turni/Pianificazione', '80%', 'Operativo'],
  ['Ferie/Permessi', '95%', 'Operativo'],
  ['Presenze', '85%', 'Operativo'],
  ['Budget', '80%', 'Operativo'],
  ['Riconciliazione', '80%', 'Operativo'],
  ['Fatture SDI', '65%', 'Parziale'],
  ['Prodotti/Fornitori', '70%', 'Parziale']
]

// Table header
doc.fontSize(9).fillColor(colors.primary).font('Helvetica-Bold')
doc.text('Modulo', 50, doc.y, { width: 180, continued: false })
doc.text('Completamento', 230, doc.y - 12, { width: 80 })
doc.text('Stato', 350, doc.y - 12, { width: 100 })
doc.moveDown(0.3)
doc.moveTo(50, doc.y).lineTo(450, doc.y).stroke('#e5e7eb')
doc.moveDown(0.2)

modules.forEach(([mod, pct, stato]) => {
  const stateColor = stato === 'Operativo' ? colors.success :
                     stato === 'Bug minore' ? colors.warning : colors.danger
  doc.fontSize(9).fillColor(colors.black).font('Helvetica')
  doc.text(mod, 50, doc.y, { width: 180, continued: false })
  doc.text(pct, 230, doc.y - 12, { width: 80 })
  doc.fillColor(stateColor).font('Helvetica-Bold')
  doc.text(stato, 350, doc.y - 12, { width: 100 })
  doc.moveDown(0.3)
})

doc.moveDown(1)

// Section 2
addSection('2. Cosa Doveva Essere Sviluppato')

addSubSection('2.1 PRD Principale - Fasi')
addBullet('Fase 1 MVP: Auth RBAC, Chiusura Cassa PWA, Prima Nota, Report base')
addBullet('Fase 2: Fatture fornitori, Import SDI, Riconciliazione bancaria')
addBullet('Fase 3: Automazione movimenti, AI categorizzazione')
addBullet('Fase 4: Integrazione commercialista, Export XBRL')
addBullet('Fase 5: Dashboard KPI, Previsioni, ML anomaly detection')
doc.moveDown(0.5)

addSubSection('2.2 PRD Modulo Personale')
addBullet('Anagrafica dipendenti completa')
addBullet('Generazione turni AI con vincoli')
addBullet('Portale dipendente (turni, scambi, ferie)')
addBullet('Timbratura presenze con GPS')
addBullet('Gestione ferie con workflow')
doc.moveDown(0.5)

addSubSection('2.3 Budget Specifications')
addBullet('Categorie budget user-defined')
addBullet('Drag & drop mapping conti')
addBullet('Dashboard KPI vs actual')
addBullet('Alert scostamenti e benchmark')

doc.addPage()

// Section 3
addSection('3. Cosa e\' Stato Sviluppato')

addSubSection('3.1 Moduli Core')
addCheckItem('Autenticazione NextAuth.js v5 con RBAC', true)
addCheckItem('Chiusura Cassa multi-postazione con griglia banconote', true)
addCheckItem('Prima Nota Cassa/Banca con export PDF/Excel/CSV', true)
addCheckItem('Dashboard KPI con previsione cash flow', true)
doc.moveDown(0.5)

addSubSection('3.2 Modulo Personale')
addCheckItem('Anagrafica staff con tabs (Info, Contratto, Compensi, Skills)', true)
addCheckItem('Vincoli individuali e relazionali', true)
addCheckItem('Pianificazione turni settimanale con AI', true)
addCheckItem('Calendario visivo turni con export', true)
addCheckItem('Ferie/Permessi con workflow approvazione', true)
addCheckItem('Timbratura presenze con geolocalizzazione', true)
doc.moveDown(0.5)

addSubSection('3.3 Moduli Aggiuntivi')
addCheckItem('Budget con categorie e dashboard KPI', true)
addCheckItem('Riconciliazione bancaria con matching automatico', true)
addCheckItem('Import fatture SDI (FatturaPA XML)', true)
addCheckItem('Gestione prodotti e fornitori', true)

doc.moveDown(1)

// Section 4
addSection('4. Cosa Manca da Sviluppare')

addSubSection('4.1 Priorita\' CRITICA')
doc.fillColor(colors.danger)
addBullet('Sincronizzazione automatica SDI (polling fatture passive)', 10)
addBullet('AI categorizzazione automatica spese', 10)
addBullet('Open Banking PSD2 (Fabrick/Tink)', 10)
doc.moveDown(0.5)

addSubSection('4.2 Priorita\' ALTA')
doc.fillColor(colors.warning)
addBullet('Export PDF chiusura cassa', 10)
addBullet('Offline persistence con IndexedDB', 10)
addBullet('QR code timbratura presenze', 10)
addBullet('Ottimizzazione algoritmo turni (min-cost)', 10)
addBullet('Grafici trend Budget', 10)
doc.moveDown(0.5)

addSubSection('4.3 Priorita\' MEDIA')
doc.fillColor(colors.gray)
addBullet('Saldo progressivo Prima Nota', 10)
addBullet('Edit/Delete vincoli da UI', 10)
addBullet('Bulk operations riconciliazione', 10)
addBullet('Dashboard fornitori', 10)

doc.addPage()

// Section 5
addSection('5. Bug e Necessita\' di Riprogettazione')

addSubSection('5.1 BUG CRITICO')
doc.fillColor(colors.danger).font('Helvetica-Bold')
doc.fontSize(10).text('BUG-001: Prima Nota - Creazione movimento fallisce')
doc.fillColor(colors.black).font('Helvetica')
doc.fontSize(9)
addBullet('File: src/app/api/prima-nota/route.ts:230', 10)
addBullet('Errore: Foreign key constraint violated (account_id_fkey)', 10)
addBullet('Causa: Form permette invio senza Conto Contabile', 10)
addBullet('Fix: Aggiungere validazione required su accountId', 10)
doc.moveDown(0.5)

addSubSection('5.2 Bug Minori')
addBullet('Warning accessibilita\' DialogContent (aria-describedby)', 10)
addBullet('Sidebar accordion click interference', 10)
doc.moveDown(0.5)

addSubSection('5.3 Riprogettazione Suggerita')
addBullet('State machine pattern per workflow chiusura', 10)
addBullet('Migliorare heuristics matching riconciliazione', 10)
addBullet('Constraint optimization per turni Fase 3', 10)

doc.moveDown(1)

// Section 6
addSection('6. Raccomandazioni')

addSubSection('Quick Wins (1-2 giorni)')
addBullet('Fix bug Prima Nota (accountId validation)', 10)
addBullet('Export PDF chiusura cassa', 10)
addBullet('Saldo progressivo nella tabella Prima Nota', 10)
doc.moveDown(0.5)

addSubSection('Short Term (1-2 settimane)')
addBullet('Offline persistence con IndexedDB', 10)
addBullet('Ottimizzazione algoritmo turni', 10)
addBullet('QR code timbratura', 10)
addBullet('Grafici Budget con Chart.js', 10)
doc.moveDown(0.5)

addSubSection('Medium Term (1-2 mesi)')
addBullet('Sincronizzazione SDI automatica', 10)
addBullet('Open Banking PSD2', 10)
addBullet('AI categorizzazione spese', 10)

doc.moveDown(1)

// Testing results
addSection('7. Risultati Test Funzionali')

doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('Test eseguiti il 6 Gennaio 2026 con Playwright')
doc.moveDown(0.5)

const tests = [
  ['Dashboard', '3/3', 'PASS'],
  ['Chiusura Cassa', '2/2', 'PASS'],
  ['Prima Nota', '1/2', 'FAIL (BUG-001)'],
  ['Staff', '2/2', 'PASS'],
  ['Turni', '2/2', 'PASS'],
  ['Budget', '2/2', 'PASS'],
  ['Riconciliazione', '2/2', 'PASS']
]

doc.fontSize(9).fillColor(colors.primary).font('Helvetica-Bold')
doc.text('Modulo', 50, doc.y, { width: 150, continued: false })
doc.text('Test', 200, doc.y - 12, { width: 80 })
doc.text('Risultato', 300, doc.y - 12, { width: 100 })
doc.moveDown(0.2)
doc.moveTo(50, doc.y).lineTo(400, doc.y).stroke('#e5e7eb')
doc.moveDown(0.2)

tests.forEach(([mod, count, result]) => {
  const resultColor = result === 'PASS' ? colors.success : colors.danger
  doc.fontSize(9).fillColor(colors.black).font('Helvetica')
  doc.text(mod, 50, doc.y, { width: 150, continued: false })
  doc.text(count, 200, doc.y - 12, { width: 80 })
  doc.fillColor(resultColor).font('Helvetica-Bold')
  doc.text(result, 300, doc.y - 12, { width: 100 })
  doc.moveDown(0.3)
})

doc.moveDown(1)
doc.fontSize(10).fillColor(colors.black).font('Helvetica')
doc.text('Coverage stimata: 78%')
doc.text('Tempo medio risposta API: <500ms')
doc.text('Errori console: 2 warning (non bloccanti)')

// Footer
doc.moveDown(3)
doc.fontSize(8)
   .fillColor(colors.gray)
   .font('Helvetica')
   .text('Generato il 6 Gennaio 2026 - Weiss Gestionale v1.0', { align: 'center' })
doc.text('Analisi automatizzata con Claude Code', { align: 'center' })

// Finalize
doc.end()

console.log(`PDF generato: ${outputPath}`)

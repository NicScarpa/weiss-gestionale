// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse')
import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export interface MatchedDocument {
  userId: string
  name: string
  pages: number[]
  pdfBuffer: Buffer
}

export interface UnmatchedDocument {
  pages: number[]
  textSnippet: string
}

export interface SplitResult {
  matched: MatchedDocument[]
  unmatched: UnmatchedDocument[]
}

interface EmployeeLookup {
  userId: string
  fullName: string // "COGNOME NOME"
  fiscalCode: string | null
}

/**
 * Estrae il testo da ogni pagina del PDF usando pdf-parse
 */
async function extractPageTexts(pdfBuffer: Buffer): Promise<string[]> {
  const pageTexts: string[] = []

  // pdf-parse con pagerender custom per ottenere testo per pagina
  await pdf(pdfBuffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      const textContent = await pageData.getTextContent()
      const text = textContent.items.map((item: { str: string }) => item.str).join(' ')
      pageTexts.push(text)
      return text
    },
  })

  return pageTexts
}

/**
 * Costruisce la lookup map dei dipendenti attivi
 */
async function buildEmployeeLookup(): Promise<EmployeeLookup[]> {
  const employees = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fiscalCode: true,
    },
  })

  return employees.map((emp) => ({
    userId: emp.id,
    fullName: `${emp.lastName.toUpperCase()} ${emp.firstName.toUpperCase()}`,
    fiscalCode: emp.fiscalCode,
  }))
}

/**
 * Cerca il nome del dipendente nel testo della pagina.
 * Match esatto su stringa completa "COGNOME NOME" per evitare falsi positivi
 * con nomi simili (es. "ROSSI MARIO" vs "ROSSI MARIA").
 */
function findEmployeeInText(
  text: string,
  employees: EmployeeLookup[]
): EmployeeLookup | null {
  const upperText = text.toUpperCase()

  // Ordina per lunghezza nome decrescente per match più specifico prima
  const sorted = [...employees].sort(
    (a, b) => b.fullName.length - a.fullName.length
  )

  for (const emp of sorted) {
    if (upperText.includes(emp.fullName)) {
      // Conferma con codice fiscale se disponibile
      if (emp.fiscalCode && upperText.includes(emp.fiscalCode.toUpperCase())) {
        return emp
      }
      // Senza codice fiscale, accetta il match sul nome completo
      if (!emp.fiscalCode) {
        return emp
      }
      // Ha codice fiscale ma non trovato nel testo: accetta comunque il match sul nome
      return emp
    }
  }

  return null
}

/**
 * Scompone un PDF bulk di cedolini in singoli PDF per dipendente.
 *
 * 1. Estrae testo da ogni pagina
 * 2. Carica dipendenti attivi dal DB
 * 3. Per ogni pagina, cerca il nome dipendente
 * 4. Raggruppa pagine consecutive con lo stesso dipendente
 * 5. Crea un PDF per ogni gruppo
 */
export async function splitBulkPdf(pdfBuffer: Buffer): Promise<SplitResult> {
  const pageTexts = await extractPageTexts(pdfBuffer)
  const employees = await buildEmployeeLookup()
  const srcDoc = await PDFDocument.load(pdfBuffer)

  logger.info(`[PDF Splitter] ${pageTexts.length} pagine trovate, ${employees.length} dipendenti attivi`)

  // Assegna ogni pagina a un dipendente
  const pageAssignments: Array<{ employee: EmployeeLookup | null; pageIndex: number }> = []
  for (let i = 0; i < pageTexts.length; i++) {
    const employee = findEmployeeInText(pageTexts[i], employees)
    pageAssignments.push({ employee, pageIndex: i })
  }

  // Raggruppa pagine consecutive con lo stesso dipendente
  const groups: Array<{
    employee: EmployeeLookup | null
    pages: number[]
    textSnippet: string
  }> = []

  for (const assignment of pageAssignments) {
    const lastGroup = groups[groups.length - 1]
    if (
      lastGroup &&
      lastGroup.employee?.userId === assignment.employee?.userId &&
      assignment.employee !== null
    ) {
      lastGroup.pages.push(assignment.pageIndex)
    } else {
      groups.push({
        employee: assignment.employee,
        pages: [assignment.pageIndex],
        textSnippet: pageTexts[assignment.pageIndex].substring(0, 200),
      })
    }
  }

  // Crea PDF individuali
  const matched: MatchedDocument[] = []
  const unmatched: UnmatchedDocument[] = []

  for (const group of groups) {
    const newDoc = await PDFDocument.create()
    const copiedPages = await newDoc.copyPages(
      srcDoc,
      group.pages
    )
    for (const page of copiedPages) {
      newDoc.addPage(page)
    }
    const pdfBytes = await newDoc.save()

    if (group.employee) {
      matched.push({
        userId: group.employee.userId,
        name: group.employee.fullName,
        pages: group.pages,
        pdfBuffer: Buffer.from(pdfBytes),
      })
    } else {
      unmatched.push({
        pages: group.pages,
        textSnippet: group.textSnippet,
      })
    }
  }

  logger.info(
    `[PDF Splitter] Risultato: ${matched.length} matched, ${unmatched.length} unmatched`
  )

  return { matched, unmatched }
}

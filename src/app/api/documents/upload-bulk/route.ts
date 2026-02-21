import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { splitBulkPdf } from '@/lib/documents/pdf-splitter'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { sendBulkNotification } from '@/lib/notifications/send'

export const maxDuration = 60

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'documents', 'cedolini')
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// POST /api/documents/upload-bulk - Upload bulk PDF cedolini
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può fare upload bulk
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const period = formData.get('period') as string | null // "2026-01"
    const periodLabel = formData.get('periodLabel') as string | null // "Gennaio 2026"

    if (!file) {
      return NextResponse.json({ error: 'File non fornito' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File troppo grande (max 50MB)' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo file PDF accettati' }, { status: 400 })
    }

    // Validate magic bytes
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    if (!fileBuffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) {
      return NextResponse.json({ error: 'Contenuto file non valido' }, { status: 400 })
    }

    // Split PDF
    const result = await splitBulkPdf(fileBuffer)

    // Salva i PDF matched su disco e crea record DB
    await mkdir(UPLOAD_DIR, { recursive: true })
    const batchId = randomUUID()
    const savedDocuments: Array<{ userId: string; name: string; documentId: string; pages: number[] }> = []

    for (const doc of result.matched) {
      const filename = `${randomUUID()}.pdf`
      const filePath = join(UPLOAD_DIR, filename)
      await writeFile(filePath, doc.pdfBuffer)

      const dbDoc = await prisma.employeeDocument.create({
        data: {
          userId: doc.userId,
          category: 'CEDOLINI',
          filename,
          originalFilename: `cedolino_${doc.name.replace(/\s+/g, '_')}.pdf`,
          contentType: 'application/pdf',
          fileSize: doc.pdfBuffer.length,
          period: period || undefined,
          periodLabel: periodLabel || undefined,
          uploadedByUserId: session.user.id,
          uploadBatchId: batchId,
        },
      })

      savedDocuments.push({
        userId: doc.userId,
        name: doc.name,
        documentId: dbDoc.id,
        pages: doc.pages,
      })
    }

    // Invia notifiche push ai dipendenti
    if (savedDocuments.length > 0) {
      const userIds = savedDocuments.map((d) => d.userId)
      try {
        await sendBulkNotification({
          userIds,
          payload: {
            type: 'NEW_DOCUMENT',
            title: 'Nuovo documento disponibile',
            body: periodLabel
              ? `Il tuo cedolino di ${periodLabel} è disponibile`
              : 'Un nuovo cedolino è stato caricato',
            url: '/portale/documenti',
            referenceType: 'document',
          },
        })
      } catch (err) {
        logger.error('Errore invio notifiche documenti', err)
      }
    }

    return NextResponse.json({
      batchId,
      matched: savedDocuments,
      unmatched: result.unmatched,
      summary: {
        totalPages: result.matched.reduce((sum, d) => sum + d.pages.length, 0) + result.unmatched.reduce((sum, d) => sum + d.pages.length, 0),
        matchedCount: result.matched.length,
        unmatchedCount: result.unmatched.length,
      },
    })
  } catch (error) {
    logger.error('Errore POST /api/documents/upload-bulk', error)
    return NextResponse.json(
      { error: 'Errore nel processamento del PDF' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'scadenzario')

// GET /api/scadenzario/[id]/allegati/[allegId] - Download allegato
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; allegId: string }> }
) {
  try {
    const { id, allegId } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const attachment = await prisma.scheduleAttachment.findFirst({
      where: { id: allegId, scheduleId: id },
      include: {
        schedule: { select: { venueId: true } },
      },
    })

    if (!attachment) {
      return NextResponse.json({ error: 'Allegato non trovato' }, { status: 404 })
    }

    const filePath = join(UPLOAD_DIR, attachment.filename)

    try {
      const buffer = await readFile(filePath)
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': attachment.contentType,
          'Content-Disposition': `attachment; filename="${attachment.originalFilename}"`,
          'Content-Length': String(attachment.fileSize),
        },
      })
    } catch {
      return NextResponse.json({ error: 'File non trovato su disco' }, { status: 404 })
    }
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]/allegati/[allegId]', error)
    return NextResponse.json(
      { error: 'Errore nel download dell\'allegato' },
      { status: 500 }
    )
  }
}

// DELETE /api/scadenzario/[id]/allegati/[allegId] - Elimina allegato
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; allegId: string }> }
) {
  try {
    const { id, allegId } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const attachment = await prisma.scheduleAttachment.findFirst({
      where: { id: allegId, scheduleId: id },
      include: {
        schedule: { select: { venueId: true } },
      },
    })

    if (!attachment) {
      return NextResponse.json({ error: 'Allegato non trovato' }, { status: 404 })
    }

    // Delete from database
    await prisma.scheduleAttachment.delete({
      where: { id: allegId },
    })

    // Try to delete file from disk
    const filePath = join(UPLOAD_DIR, attachment.filename)
    try {
      await unlink(filePath)
    } catch {
      // File might already be deleted, ignore
    }

    return NextResponse.json({ message: 'Allegato eliminato' })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]/allegati/[allegId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione dell\'allegato' },
      { status: 500 }
    )
  }
}

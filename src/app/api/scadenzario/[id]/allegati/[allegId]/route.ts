import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getFile, deleteFile } from '@/lib/storage'


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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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

    const buffer = await getFile(`scadenzario/${attachment.filename}`)

    if (!buffer) {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': attachment.contentType,
        'Content-Disposition': `attachment; filename="${attachment.originalFilename}"`,
        'Content-Length': String(attachment.fileSize),
      },
    })
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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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
    await deleteFile(`scadenzario/${attachment.filename}`)

    return NextResponse.json({ message: 'Allegato eliminato' })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/[id]/allegati/[allegId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione dell\'allegato' },
      { status: 500 }
    )
  }
}

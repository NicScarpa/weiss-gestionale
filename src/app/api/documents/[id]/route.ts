import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getFile, deleteFile } from '@/lib/storage'

/** Chiave di storage del documento, come scritta al momento dell'upload. */
function storageKey(category: string, filename: string): string {
  return `documents/${category.toLowerCase()}/${filename}`
}

// GET /api/documents/[id] - Download file (?inline=1 per l'anteprima nel browser)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const document = await prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })
    }

    // Admin può scaricare tutto, dipendente solo i propri
    if (session.user.role !== 'admin' && document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const fileData = await getFile(storageKey(document.category, document.filename))
    if (!fileData) {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
    }

    const inline = new URL(request.url).searchParams.get('inline') === '1'

    return new NextResponse(new Uint8Array(fileData), {
      headers: {
        'Content-Type': document.contentType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${document.originalFilename}"`,
        'Content-Length': fileData.length.toString(),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/documents/[id]', error)
    return NextResponse.json({ error: 'Errore nel download' }, { status: 500 })
  }
}

// DELETE /api/documents/[id] - Elimina documento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const document = await prisma.employeeDocument.findUnique({
      where: { id },
    })

    if (!document) {
      return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })
    }

    // Elimina file dallo storage
    await deleteFile(storageKey(document.category, document.filename))

    // Elimina record DB
    await prisma.employeeDocument.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/documents/[id]', error)
    return NextResponse.json({ error: 'Errore nella cancellazione' }, { status: 500 })
  }
}

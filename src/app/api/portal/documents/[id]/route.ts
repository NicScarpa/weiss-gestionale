import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getFile } from '@/lib/storage'


// GET /api/portal/documents/[id] - Download documento (verifica ownership)
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

    // Verifica ownership. Un documento ancora da assegnare è intestato solo
    // tecnicamente all'admin che l'ha caricato: dal portale non si scarica.
    if (document.userId !== session.user.id || document.needsAssignment) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const key = `documents/${document.category.toLowerCase()}/${document.filename}`
    const fileData = await getFile(key)

    if (!fileData) {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(fileData), {
      headers: {
        'Content-Type': document.contentType,
        'Content-Disposition': `inline; filename="${document.originalFilename}"`,
        'Content-Length': fileData.length.toString(),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/portal/documents/[id]', error)
    return NextResponse.json({ error: 'Errore nel download' }, { status: 500 })
  }
}

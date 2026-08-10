import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFile } from '@/lib/storage'
import { forbidden, handleApiError, notFound, withAuth } from '@/lib/api-utils'

type Params = { id: string }

// GET /api/portal/documents/[id] - Download documento (verifica ownership)
export const GET = withAuth<Params>(async (_request: NextRequest, { params, user }) => {
  try {
    const document = await prisma.employeeDocument.findUnique({
      where: { id: params.id },
    })

    if (!document) {
      return notFound('Documento non trovato')
    }

    // Verifica ownership. Un documento ancora da assegnare è intestato solo
    // tecnicamente all'admin che l'ha caricato: dal portale non si scarica.
    if (document.userId !== user.id || document.needsAssignment) {
      return forbidden()
    }

    const key = `documents/${document.category.toLowerCase()}/${document.filename}`
    const fileData = await getFile(key)

    if (!fileData) {
      return notFound('File non trovato')
    }

    return new NextResponse(new Uint8Array(fileData), {
      headers: {
        'Content-Type': document.contentType,
        'Content-Disposition': `inline; filename="${document.originalFilename}"`,
        'Content-Length': fileData.length.toString(),
      },
    })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/portal/documents/[id]',
      'Errore nel download'
    )
  }
})

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'
import type { DocumentCategory } from '@prisma/client'

// GET /api/portal/documents - Lista documenti del dipendente autenticato
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const period = searchParams.get('period')

    const documents = await prisma.employeeDocument.findMany({
      where: {
        userId: user.id,
        // I cedolini non abbinati sono intestati provvisoriamente all'admin che
        // ha caricato il PDF: non devono comparire nel suo portale finché non
        // sono assegnati al dipendente giusto.
        needsAssignment: false,
        ...(category ? { category: category as DocumentCategory } : {}),
        ...(period ? { period } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        category: true,
        originalFilename: true,
        fileSize: true,
        period: true,
        periodLabel: true,
        description: true,
        createdAt: true,
      },
    })

    return ok({ documents })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/portal/documents',
      'Errore nel recupero documenti'
    )
  }
})

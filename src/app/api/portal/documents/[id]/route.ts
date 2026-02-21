import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { readFile } from 'fs/promises'
import { join } from 'path'

const UPLOAD_BASE = join(process.cwd(), 'uploads', 'documents')

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

    // Verifica ownership
    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const categoryDir = document.category.toLowerCase()
    const filePath = join(UPLOAD_BASE, categoryDir, document.filename)

    try {
      const fileData = await readFile(filePath)
      return new NextResponse(fileData, {
        headers: {
          'Content-Type': document.contentType,
          'Content-Disposition': `inline; filename="${document.originalFilename}"`,
          'Content-Length': fileData.length.toString(),
        },
      })
    } catch {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
    }
  } catch (error) {
    logger.error('Errore GET /api/portal/documents/[id]', error)
    return NextResponse.json({ error: 'Errore nel download' }, { status: 500 })
  }
}

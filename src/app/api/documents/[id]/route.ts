import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'

const UPLOAD_BASE = join(process.cwd(), 'uploads', 'documents')

// GET /api/documents/[id] - Download file
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

    const categoryDir = document.category.toLowerCase()
    const filePath = join(UPLOAD_BASE, categoryDir, document.filename)

    try {
      const fileData = await readFile(filePath)
      return new NextResponse(fileData, {
        headers: {
          'Content-Type': document.contentType,
          'Content-Disposition': `attachment; filename="${document.originalFilename}"`,
          'Content-Length': fileData.length.toString(),
        },
      })
    } catch {
      return NextResponse.json({ error: 'File non trovato su disco' }, { status: 404 })
    }
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

    // Elimina file dal disco
    const categoryDir = document.category.toLowerCase()
    const filePath = join(UPLOAD_BASE, categoryDir, document.filename)
    try {
      await unlink(filePath)
    } catch {
      logger.warn(`File non trovato su disco: ${filePath}`)
    }

    // Elimina record DB
    await prisma.employeeDocument.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/documents/[id]', error)
    return NextResponse.json({ error: 'Errore nella cancellazione' }, { status: 500 })
  }
}

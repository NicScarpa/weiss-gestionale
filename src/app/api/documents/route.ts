import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_BASE = join(process.cwd(), 'uploads', 'documents')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// GET /api/documents - Lista documenti con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const category = searchParams.get('category')
    const period = searchParams.get('period')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (userId) where.userId = userId
    if (category) where.category = category
    if (period) where.period = period

    const [documents, total] = await Promise.all([
      prisma.employeeDocument.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employeeDocument.count({ where }),
    ])

    return NextResponse.json({
      documents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    logger.error('Errore GET /api/documents', error)
    return NextResponse.json({ error: 'Errore nel recupero documenti' }, { status: 500 })
  }
}

// POST /api/documents - Upload singolo documento
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null
    const category = formData.get('category') as string | null
    const period = formData.get('period') as string | null
    const periodLabel = formData.get('periodLabel') as string | null
    const description = formData.get('description') as string | null

    if (!file || !userId || !category) {
      return NextResponse.json(
        { error: 'File, dipendente e categoria sono obbligatori' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File troppo grande (max 10MB)' }, { status: 400 })
    }

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    // Validate magic bytes per PDF
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    if (file.type === 'application/pdf') {
      if (!fileBuffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) {
        return NextResponse.json({ error: 'Contenuto file non valido' }, { status: 400 })
      }
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const filename = `${randomUUID()}.${ext}`
    const categoryDir = join(UPLOAD_BASE, category.toLowerCase())
    await mkdir(categoryDir, { recursive: true })
    await writeFile(join(categoryDir, filename), fileBuffer)

    const document = await prisma.employeeDocument.create({
      data: {
        userId,
        category: category as 'CEDOLINI' | 'ATTESTATI' | 'ALTRO',
        filename,
        originalFilename: file.name,
        contentType: file.type,
        fileSize: file.size,
        period: period || undefined,
        periodLabel: periodLabel || undefined,
        description: description || undefined,
        uploadedByUserId: session.user.id,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Invia notifica al dipendente
    try {
      const { sendNotification } = await import('@/lib/notifications/send')
      await sendNotification({
        userId,
        payload: {
          type: 'NEW_DOCUMENT',
          title: 'Nuovo documento disponibile',
          body: description || 'Un nuovo documento è stato caricato',
          url: '/portale/documenti',
          referenceType: 'document',
          referenceId: document.id,
        },
      })
    } catch (err) {
      logger.error('Errore invio notifica documento', err)
    }

    return NextResponse.json({ document })
  } catch (error) {
    logger.error('Errore POST /api/documents', error)
    return NextResponse.json({ error: 'Errore nel caricamento documento' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'scadenzario')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'text/xml',
  'application/xml',
]

const ALLOWED_MIME_TYPES: Record<string, Buffer[]> = {
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/jpg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'text/xml': [Buffer.from('<?xml', 'utf8')],
  'application/xml': [Buffer.from('<?xml', 'utf8')],
}

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'xml']

function validateFileMagicBytes(buffer: Buffer, declaredType: string): boolean {
  const signatures = ALLOWED_MIME_TYPES[declaredType]
  if (!signatures) return false
  return signatures.some(sig => buffer.subarray(0, sig.length).equals(sig))
}

// GET /api/scadenzario/[id]/allegati - Lista allegati
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

    const venueId = await getVenueId()

    const schedule = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: { id: true, venueId: true },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const attachments = await prisma.scheduleAttachment.findMany({
      where: { scheduleId: id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ attachments })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]/allegati', error)
    return NextResponse.json(
      { error: 'Errore nel recupero degli allegati' },
      { status: 500 }
    )
  }
}

// POST /api/scadenzario/[id]/allegati - Upload allegato
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()

    const schedule = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: { id: true, venueId: true },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File non fornito' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File troppo grande (max 10MB)' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo file non supportato. Formati accettati: PDF, JPG, PNG, XML' },
        { status: 400 }
      )
    }

    // Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: 'Tipo file non consentito' }, { status: 400 })
    }

    // Validate magic bytes match declared MIME type
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    if (!validateFileMagicBytes(fileBuffer, file.type)) {
      return NextResponse.json({ error: 'Contenuto file non valido' }, { status: 400 })
    }

    // Generate unique filename
    const filename = `${randomUUID()}.${ext}`

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Write file to disk
    const buffer = fileBuffer
    const filePath = join(UPLOAD_DIR, filename)
    await writeFile(filePath, buffer)

    // Save to database
    const attachment = await prisma.scheduleAttachment.create({
      data: {
        scheduleId: id,
        filename,
        originalFilename: file.name,
        contentType: file.type,
        fileSize: file.size,
        uploadedByUserId: session.user.id,
      },
    })

    return NextResponse.json({ attachment })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/[id]/allegati', error)
    return NextResponse.json(
      { error: 'Errore nel caricamento dell\'allegato' },
      { status: 500 }
    )
  }
}

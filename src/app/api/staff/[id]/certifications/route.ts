import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { CreateCertificationSchema } from '@/lib/validations/certifications'

// GET /api/staff/[id]/certifications - Lista certificazioni dipendente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    // Staff può vedere solo le proprie certificazioni
    if (session.user.role === 'staff' && session.user.id !== id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, venueId: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    // Manager può vedere solo dipendenti della stessa sede
    if (session.user.role === 'manager' && user.venueId !== session.user.venueId) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    const certifications = await prisma.certification.findMany({
      where: { userId: id },
      select: {
        id: true,
        type: true,
        obtainedDate: true,
        expiryDate: true,
        documentUploadedAt: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        // Non include documentUrl per performance (potrebbe essere base64 grande)
        // Usa il campo documentUploadedAt come indicatore
      },
      orderBy: [{ type: 'asc' }, { expiryDate: 'asc' }],
    })

    // Aggiungi hasDocument flag
    const data = certifications.map((cert) => ({
      ...cert,
      hasDocument: cert.documentUploadedAt !== null,
    }))

    return NextResponse.json({ data })
  } catch (error) {
    logger.error('Errore GET /api/staff/[id]/certifications', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle certificazioni' },
      { status: 500 }
    )
  }
}

// POST /api/staff/[id]/certifications - Crea nuova certificazione
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono creare certificazioni
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = CreateCertificationSchema.parse(body)

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, venueId: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    // Manager può modificare solo dipendenti della stessa sede
    if (session.user.role === 'manager' && user.venueId !== session.user.venueId) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Check duplicato: 1 certificazione per tipo per utente
    const existing = await prisma.certification.findFirst({
      where: {
        userId: id,
        type: validatedData.type,
      },
    })

    if (existing) {
      return NextResponse.json(
        {
          error: `Certificazione ${validatedData.type} già presente per questo dipendente. Modificare quella esistente.`,
        },
        { status: 409 }
      )
    }

    const certification = await prisma.certification.create({
      data: {
        userId: id,
        type: validatedData.type,
        obtainedDate: new Date(validatedData.obtainedDate),
        expiryDate: new Date(validatedData.expiryDate),
        documentUrl: validatedData.documentUrl || null,
        documentUploadedAt: validatedData.documentUrl ? new Date() : null,
      },
    })

    return NextResponse.json(certification, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/staff/[id]/certifications', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della certificazione' },
      { status: 500 }
    )
  }
}

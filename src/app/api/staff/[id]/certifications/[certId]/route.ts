import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { UpdateCertificationSchema } from '@/lib/validations/certifications'

type RouteParams = { params: Promise<{ id: string; certId: string }> }

// GET /api/staff/[id]/certifications/[certId] - Dettaglio certificazione (con documento)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id, certId } = await params

    // Staff può vedere solo le proprie certificazioni
    if (session.user.role === 'staff' && session.user.id !== id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const certification = await prisma.certification.findFirst({
      where: {
        id: certId,
        userId: id,
      },
    })

    if (!certification) {
      return NextResponse.json(
        { error: 'Certificazione non trovata' },
        { status: 404 }
      )
    }

    // Manager può vedere solo dipendenti della stessa sede
    if (session.user.role === 'manager') {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { venueId: true },
      })
      if (user?.venueId !== session.user.venueId) {
        return NextResponse.json(
          { error: 'Non autorizzato per questa sede' },
          { status: 403 }
        )
      }
    }

    return NextResponse.json({
      data: {
        ...certification,
        hasDocument: certification.documentUploadedAt !== null,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/staff/[id]/certifications/[certId]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della certificazione' },
      { status: 500 }
    )
  }
}

// PUT /api/staff/[id]/certifications/[certId] - Modifica certificazione
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono modificare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id, certId } = await params
    const body = await request.json()
    const validatedData = UpdateCertificationSchema.parse(body)

    // Verifica che la certificazione esista e appartenga al dipendente
    const existing = await prisma.certification.findFirst({
      where: {
        id: certId,
        userId: id,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Certificazione non trovata' },
        { status: 404 }
      )
    }

    // Manager può modificare solo dipendenti della stessa sede
    if (session.user.role === 'manager') {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { venueId: true },
      })
      if (user?.venueId !== session.user.venueId) {
        return NextResponse.json(
          { error: 'Non autorizzato per questa sede' },
          { status: 403 }
        )
      }
    }

    // Prepara i dati per l'update
    const updateData: Record<string, unknown> = {}

    if (validatedData.obtainedDate) {
      updateData.obtainedDate = new Date(validatedData.obtainedDate)
    }
    if (validatedData.expiryDate) {
      updateData.expiryDate = new Date(validatedData.expiryDate)
    }

    // Gestione documento: se cambia documentUrl, aggiorna documentUploadedAt
    if ('documentUrl' in validatedData) {
      updateData.documentUrl = validatedData.documentUrl || null
      updateData.documentUploadedAt = validatedData.documentUrl ? new Date() : null
    }

    const certification = await prisma.certification.update({
      where: { id: certId },
      data: updateData,
    })

    return NextResponse.json({
      data: {
        ...certification,
        hasDocument: certification.documentUploadedAt !== null,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/staff/[id]/certifications/[certId]', error)
    return NextResponse.json(
      { error: 'Errore nella modifica della certificazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/staff/[id]/certifications/[certId] - Elimina certificazione
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono eliminare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id, certId } = await params

    // Verifica che la certificazione esista e appartenga al dipendente
    const existing = await prisma.certification.findFirst({
      where: {
        id: certId,
        userId: id,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Certificazione non trovata' },
        { status: 404 }
      )
    }

    // Manager può eliminare solo per dipendenti della stessa sede
    if (session.user.role === 'manager') {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { venueId: true },
      })
      if (user?.venueId !== session.user.venueId) {
        return NextResponse.json(
          { error: 'Non autorizzato per questa sede' },
          { status: 403 }
        )
      }
    }

    await prisma.certification.delete({
      where: { id: certId },
    })

    return NextResponse.json({ message: 'Certificazione eliminata' })
  } catch (error) {
    logger.error('Errore DELETE /api/staff/[id]/certifications/[certId]', error)
    return NextResponse.json(
      { error: "Errore nell'eliminazione della certificazione" },
      { status: 500 }
    )
  }
}

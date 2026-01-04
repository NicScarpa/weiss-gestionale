import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per aggiornamento dipendente esteso
const updateStaffSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isFixedStaff: z.boolean().optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  defaultShift: z.enum(['MORNING', 'EVENING']).nullable().optional(),
  isActive: z.boolean().optional(),

  // Nuovi campi Fase 4
  contractType: z.enum(['FISSO', 'EXTRA', 'INTERMITTENTE']).nullable().optional(),
  contractHoursWeek: z.number().min(0).max(60).nullable().optional(),
  hireDate: z.string().nullable().optional(),
  terminationDate: z.string().nullable().optional(),

  // Tariffe estese
  hourlyRateBase: z.number().min(0).nullable().optional(),
  hourlyRateExtra: z.number().min(0).nullable().optional(),
  hourlyRateHoliday: z.number().min(0).nullable().optional(),
  hourlyRateNight: z.number().min(0).nullable().optional(),

  // Accesso portale
  portalEnabled: z.boolean().optional(),
  portalPin: z.string().length(6).nullable().optional(),

  // Notifiche
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  whatsappNumber: z.string().nullable().optional(),

  // Skills
  skills: z.array(z.string()).optional(),
  canWorkAlone: z.boolean().optional(),
  canHandleCash: z.boolean().optional(),
})

// GET /api/staff/[id] - Dettaglio singolo dipendente
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

    // Staff può vedere solo il proprio profilo
    if (session.user.role === 'staff' && session.user.id !== id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const staff = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,

        // Campi Fase 4
        contractType: true,
        contractHoursWeek: true,
        hireDate: true,
        terminationDate: true,
        hourlyRateBase: true,
        hourlyRateExtra: true,
        hourlyRateHoliday: true,
        hourlyRateNight: true,
        portalEnabled: true,
        portalPin: session.user.role === 'admin' ? true : false, // Solo admin vede PIN
        notifyEmail: true,
        notifyPush: true,
        notifyWhatsapp: true,
        whatsappNumber: true,
        skills: true,
        canWorkAlone: true,
        canHandleCash: true,
        createdAt: true,
        updatedAt: true,

        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        constraints: session.user.role !== 'staff' ? {
          select: {
            id: true,
            constraintType: true,
            config: true,
            validFrom: true,
            validTo: true,
            priority: true,
            isHardConstraint: true,
            notes: true,
          },
          orderBy: { priority: 'desc' },
        } : false,
      },
    })

    if (!staff) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    return NextResponse.json(staff)
  } catch (error) {
    console.error('Errore GET /api/staff/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del dipendente' },
      { status: 500 }
    )
  }
}

// PUT /api/staff/[id] - Aggiorna dipendente
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    // Solo admin può modificare altri, staff può modificare solo preferenze notifiche
    if (session.user.role === 'staff' && session.user.id !== id) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = updateStaffSchema.parse(body)

    // Staff può modificare solo le proprie preferenze notifiche
    const allowedStaffFields = ['notifyEmail', 'notifyPush', 'notifyWhatsapp', 'whatsappNumber']
    if (session.user.role === 'staff') {
      const requestedFields = Object.keys(validatedData)
      const hasDisallowedFields = requestedFields.some(f => !allowedStaffFields.includes(f))
      if (hasDisallowedFields) {
        return NextResponse.json(
          { error: 'Puoi modificare solo le preferenze di notifica' },
          { status: 403 }
        )
      }
    }

    // Prepara dati per update
    const updateData: Record<string, unknown> = {}

    // Campi base
    if (validatedData.firstName !== undefined) updateData.firstName = validatedData.firstName
    if (validatedData.lastName !== undefined) updateData.lastName = validatedData.lastName
    if (validatedData.isFixedStaff !== undefined) updateData.isFixedStaff = validatedData.isFixedStaff
    if (validatedData.hourlyRate !== undefined) updateData.hourlyRate = validatedData.hourlyRate
    if (validatedData.defaultShift !== undefined) updateData.defaultShift = validatedData.defaultShift
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive

    // Campi Fase 4
    if (validatedData.contractType !== undefined) updateData.contractType = validatedData.contractType
    if (validatedData.contractHoursWeek !== undefined) updateData.contractHoursWeek = validatedData.contractHoursWeek
    if (validatedData.hireDate !== undefined) {
      updateData.hireDate = validatedData.hireDate ? new Date(validatedData.hireDate) : null
    }
    if (validatedData.terminationDate !== undefined) {
      updateData.terminationDate = validatedData.terminationDate ? new Date(validatedData.terminationDate) : null
    }

    // Tariffe estese
    if (validatedData.hourlyRateBase !== undefined) updateData.hourlyRateBase = validatedData.hourlyRateBase
    if (validatedData.hourlyRateExtra !== undefined) updateData.hourlyRateExtra = validatedData.hourlyRateExtra
    if (validatedData.hourlyRateHoliday !== undefined) updateData.hourlyRateHoliday = validatedData.hourlyRateHoliday
    if (validatedData.hourlyRateNight !== undefined) updateData.hourlyRateNight = validatedData.hourlyRateNight

    // Accesso portale (solo admin)
    if (session.user.role === 'admin') {
      if (validatedData.portalEnabled !== undefined) updateData.portalEnabled = validatedData.portalEnabled
      if (validatedData.portalPin !== undefined) updateData.portalPin = validatedData.portalPin
    }

    // Notifiche
    if (validatedData.notifyEmail !== undefined) updateData.notifyEmail = validatedData.notifyEmail
    if (validatedData.notifyPush !== undefined) updateData.notifyPush = validatedData.notifyPush
    if (validatedData.notifyWhatsapp !== undefined) updateData.notifyWhatsapp = validatedData.notifyWhatsapp
    if (validatedData.whatsappNumber !== undefined) updateData.whatsappNumber = validatedData.whatsappNumber

    // Skills (solo admin/manager)
    if (session.user.role !== 'staff') {
      if (validatedData.skills !== undefined) updateData.skills = validatedData.skills
      if (validatedData.canWorkAlone !== undefined) updateData.canWorkAlone = validatedData.canWorkAlone
      if (validatedData.canHandleCash !== undefined) updateData.canHandleCash = validatedData.canHandleCash
    }

    const updatedStaff = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,
        contractType: true,
        contractHoursWeek: true,
        hireDate: true,
        terminationDate: true,
        hourlyRateBase: true,
        hourlyRateExtra: true,
        hourlyRateHoliday: true,
        hourlyRateNight: true,
        portalEnabled: true,
        notifyEmail: true,
        notifyPush: true,
        notifyWhatsapp: true,
        whatsappNumber: true,
        skills: true,
        canWorkAlone: true,
        canHandleCash: true,
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    return NextResponse.json(updatedStaff)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/staff/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del dipendente' },
      { status: 500 }
    )
  }
}

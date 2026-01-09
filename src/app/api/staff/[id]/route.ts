import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Mappatura nomi campi per messaggi di errore leggibili
const fieldLabels: Record<string, string> = {
  firstName: 'Nome',
  lastName: 'Cognome',
  email: 'Email',
  phoneNumber: 'Telefono',
  venueId: 'Sede',
  roleId: 'Ruolo',
  isFixedStaff: 'Tipo lavoratore (EXTRA)',
  hourlyRate: 'Compenso orario',
  defaultShift: 'Turno predefinito',
  isActive: 'Stato attivo',
  contractType: 'Tipo contratto',
  contractHoursWeek: 'Ore settimanali',
  workDaysPerWeek: 'Giorni lavorativi',
  hireDate: 'Data assunzione',
  terminationDate: 'Data cessazione',
  vatNumber: 'Partita IVA',
  fiscalCode: 'Codice Fiscale',
  birthDate: 'Data di nascita',
  address: 'Indirizzo',
  availableDays: 'Giorni disponibilità',
  availableHolidays: 'Disponibilità festivi',
  hourlyRateBase: 'Compenso base',
  hourlyRateExtra: 'Compenso straordinario',
  hourlyRateHoliday: 'Compenso festivo',
  hourlyRateNight: 'Compenso notturno',
  portalEnabled: 'Accesso portale',
  portalPin: 'PIN portale',
  notifyEmail: 'Notifiche email',
  notifyPush: 'Notifiche push',
  notifyWhatsapp: 'Notifiche WhatsApp',
  whatsappNumber: 'Numero WhatsApp',
  skills: 'Competenze',
  canWorkAlone: 'Può lavorare da solo',
  canHandleCash: 'Può gestire cassa',
}

// Formatta errori Zod in messaggi leggibili
function formatZodErrors(error: z.ZodError): string {
  const messages = error.issues.map(issue => {
    const fieldPath = issue.path.join('.')
    const fieldName = fieldLabels[fieldPath] || fieldPath
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueAny = issue as any
    const code = issue.code as string

    // Gestione per tipo di errore
    if (code === 'invalid_type') {
      if (issueAny.received === 'undefined' || issueAny.received === 'null') {
        return `"${fieldName}" è obbligatorio`
      }
      return `"${fieldName}" ha un formato non valido`
    }

    if (code === 'too_small') {
      if (issueAny.type === 'string' && issueAny.minimum === 1) {
        return `"${fieldName}" è obbligatorio`
      }
      return `"${fieldName}" deve essere almeno ${issueAny.minimum}`
    }

    if (code === 'too_big') {
      return `"${fieldName}" supera il limite massimo`
    }

    if (code === 'invalid_enum_value' || code === 'invalid_value') {
      return `"${fieldName}" ha un valore non valido`
    }

    if (code === 'invalid_string' || code === 'invalid_format') {
      if (issueAny.validation === 'email' || issueAny.format === 'email') {
        return `"${fieldName}" non è un indirizzo email valido`
      }
      return `"${fieldName}" ha un formato non valido`
    }

    // Fallback
    return `"${fieldName}": ${issue.message}`
  })

  return messages.join('. ')
}

// Schema per aggiornamento dipendente esteso
const updateStaffSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(), // Ora editabile
  phoneNumber: z.string().nullable().optional(),
  venueId: z.string().nullable().optional(),
  roleId: z.string().optional(),
  isFixedStaff: z.boolean().optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  defaultShift: z.enum(['MORNING', 'EVENING', '']).nullable().optional().transform(val => val === '' ? null : val),
  isActive: z.boolean().optional(),

  // Campi contratto con nuovi tipi
  contractType: z.enum([
    'TEMPO_DETERMINATO',
    'TEMPO_INDETERMINATO',
    'LAVORO_INTERMITTENTE',
    'LAVORATORE_OCCASIONALE',
    'LIBERO_PROFESSIONISTA',
    ''
  ]).nullable().optional().transform(val => val === '' ? null : val),
  contractHoursWeek: z.number().min(0).max(60).nullable().optional(),
  workDaysPerWeek: z.number().min(1).max(7).nullable().optional(),
  hireDate: z.string().nullable().optional(),
  terminationDate: z.string().nullable().optional(),

  // Dati fiscali (per occasionali/freelance)
  vatNumber: z.string().max(11).nullable().optional(),
  fiscalCode: z.string().max(16).nullable().optional(),

  // Dati anagrafici aggiuntivi
  birthDate: z.string().nullable().optional(),
  address: z.string().nullable().optional(),

  // Disponibilità EXTRA
  availableDays: z.array(z.number().min(0).max(6)).optional(),
  availableHolidays: z.boolean().optional(),

  // Tariffe estese
  hourlyRateBase: z.number().min(0).nullable().optional(),
  hourlyRateExtra: z.number().min(0).nullable().optional(),
  hourlyRateHoliday: z.number().min(0).nullable().optional(),
  hourlyRateNight: z.number().min(0).nullable().optional(),

  // Accesso portale
  portalEnabled: z.boolean().optional(),
  portalPin: z.string().refine(val => val === '' || val === null || val.length === 6, {
    message: 'Il PIN deve essere di 6 caratteri'
  }).nullable().optional(),

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
        phoneNumber: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,

        // Campi contratto
        contractType: true,
        contractHoursWeek: true,
        workDaysPerWeek: true,
        hireDate: true,
        terminationDate: true,

        // Dati fiscali
        vatNumber: true,
        fiscalCode: true,

        // Dati anagrafici aggiuntivi
        birthDate: true,
        address: true,

        // Disponibilità EXTRA
        availableDays: true,
        availableHolidays: true,

        // Tariffe
        hourlyRateBase: true,
        hourlyRateExtra: true,
        hourlyRateHoliday: true,
        hourlyRateNight: true,

        // Portale
        portalEnabled: true,
        portalPin: session.user.role === 'admin' ? true : false, // Solo admin vede PIN

        // Notifiche
        notifyEmail: true,
        notifyPush: true,
        notifyWhatsapp: true,
        whatsappNumber: true,

        // Skills
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
    if (validatedData.email !== undefined) updateData.email = validatedData.email
    if (validatedData.phoneNumber !== undefined) updateData.phoneNumber = validatedData.phoneNumber
    if (validatedData.isFixedStaff !== undefined) updateData.isFixedStaff = validatedData.isFixedStaff
    if (validatedData.hourlyRate !== undefined) updateData.hourlyRate = validatedData.hourlyRate
    if (validatedData.defaultShift !== undefined) updateData.defaultShift = validatedData.defaultShift
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive

    // Sede e Ruolo (solo admin)
    if (session.user.role === 'admin') {
      if (validatedData.venueId !== undefined) updateData.venueId = validatedData.venueId
      if (validatedData.roleId !== undefined) updateData.roleId = validatedData.roleId
    }

    // Campi contratto
    if (validatedData.contractType !== undefined) updateData.contractType = validatedData.contractType
    if (validatedData.contractHoursWeek !== undefined) updateData.contractHoursWeek = validatedData.contractHoursWeek
    if (validatedData.workDaysPerWeek !== undefined) updateData.workDaysPerWeek = validatedData.workDaysPerWeek
    if (validatedData.hireDate !== undefined) {
      updateData.hireDate = validatedData.hireDate ? new Date(validatedData.hireDate) : null
    }
    if (validatedData.terminationDate !== undefined) {
      updateData.terminationDate = validatedData.terminationDate ? new Date(validatedData.terminationDate) : null
    }

    // Dati fiscali
    if (validatedData.vatNumber !== undefined) updateData.vatNumber = validatedData.vatNumber
    if (validatedData.fiscalCode !== undefined) updateData.fiscalCode = validatedData.fiscalCode

    // Dati anagrafici aggiuntivi
    if (validatedData.birthDate !== undefined) {
      updateData.birthDate = validatedData.birthDate ? new Date(validatedData.birthDate) : null
    }
    if (validatedData.address !== undefined) updateData.address = validatedData.address

    // Disponibilità EXTRA
    if (validatedData.availableDays !== undefined) updateData.availableDays = validatedData.availableDays
    if (validatedData.availableHolidays !== undefined) updateData.availableHolidays = validatedData.availableHolidays

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
        phoneNumber: true,
        isFixedStaff: true,
        hourlyRate: true,
        defaultShift: true,
        isActive: true,
        contractType: true,
        contractHoursWeek: true,
        workDaysPerWeek: true,
        hireDate: true,
        terminationDate: true,
        vatNumber: true,
        fiscalCode: true,
        birthDate: true,
        address: true,
        availableDays: true,
        availableHolidays: true,
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
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(updatedStaff)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = formatZodErrors(error)
      return NextResponse.json(
        { error: errorMessage, details: error.issues },
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

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  canPerformAction,
  canEditProfileField,
  filterUserFields,
  type UserRole,
} from '@/lib/utils/permissions'

import { logger } from '@/lib/logger'
// Schema aggiornamento utente
const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  venueId: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  terminationDate: z.string().optional().nullable(),
  contractType: z.enum([
    'TEMPO_DETERMINATO',
    'TEMPO_INDETERMINATO',
    'LAVORO_INTERMITTENTE',
    'LAVORATORE_OCCASIONALE',
    'LIBERO_PROFESSIONISTA',
  ]).optional().nullable(),
  contractHoursWeek: z.number().optional().nullable(),
  workDaysPerWeek: z.number().min(1).max(7).optional().nullable(),
  hourlyRate: z.number().optional().nullable(),
  hourlyRateBase: z.number().optional().nullable(),
  hourlyRateExtra: z.number().optional().nullable(),
  hourlyRateHoliday: z.number().optional().nullable(),
  hourlyRateNight: z.number().optional().nullable(),
  fiscalCode: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  skills: z.array(z.string()).optional(),
  canWorkAlone: z.boolean().optional(),
  canHandleCash: z.boolean().optional(),
  isActive: z.boolean().optional(),
  // Notifiche
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  whatsappNumber: z.string().optional().nullable(),
})

// GET /api/users/[id] - Dettaglio utente
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
    const userRole = session.user.role as UserRole
    const isSelf = id === session.user.id

    // Staff può vedere solo se stesso
    if (userRole === 'staff' && !isSelf) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        role: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Manager può vedere solo utenti della propria sede
    if (userRole === 'manager' && !isSelf) {
      if (user.venueId !== session.user.venueId) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
    }

    return NextResponse.json(filterUserFields(user as unknown as Record<string, unknown>, userRole))
  } catch (error) {
    logger.error('Errore GET /api/users/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dell\'utente' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/[id] - Modifica utente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const userRole = session.user.role as UserRole
    const isSelf = id === session.user.id

    // Recupera utente da modificare
    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const targetRole = targetUser.role.name as UserRole

    // Verifica permessi di modifica
    if (!canPerformAction('user:update', userRole, targetRole) && !isSelf) {
      return NextResponse.json(
        { error: 'Non hai i permessi per modificare questo utente' },
        { status: 403 }
      )
    }

    // Manager può modificare solo utenti della propria sede
    if (userRole === 'manager' && !isSelf) {
      if (targetUser.venueId !== session.user.venueId) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
    }

    const body = await request.json()
    const validatedData = updateUserSchema.parse(body)

    // Costruisci dati da aggiornare, verificando permessi per ogni campo
    const updateData: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(validatedData)) {
      if (value === undefined) continue

      // Verifica se può modificare questo campo
      if (!canEditProfileField(userRole, targetRole, key, isSelf)) {
        // Se non è admin, ignora silenziosamente i campi non permessi
        if (userRole !== 'admin') continue
      }

      // Gestione campi speciali
      switch (key) {
        case 'role':
          // Cambio ruolo: solo admin
          if (userRole !== 'admin') {
            return NextResponse.json(
              { error: 'Solo admin può cambiare il ruolo' },
              { status: 403 }
            )
          }
          const newRole = await prisma.role.findUnique({
            where: { name: value as string },
          })
          if (!newRole) {
            return NextResponse.json(
              { error: 'Ruolo non trovato' },
              { status: 400 }
            )
          }
          updateData.roleId = newRole.id
          break

        case 'birthDate':
        case 'hireDate':
        case 'terminationDate':
          updateData[key] = value ? new Date(value as string) : null
          break

        case 'email':
          // Verifica unicità email
          if (value) {
            const existingEmail = await prisma.user.findFirst({
              where: {
                email: value as string,
                NOT: { id },
              },
            })
            if (existingEmail) {
              return NextResponse.json(
                { error: 'Email già in uso' },
                { status: 400 }
              )
            }
          }
          updateData[key] = value
          break

        default:
          updateData[key] = value
      }
    }

    // Aggiorna utente
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(filterUserFields(updatedUser as unknown as Record<string, unknown>, userRole))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PATCH /api/users/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella modifica dell\'utente' },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id] - Disattiva utente (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const userRole = session.user.role as UserRole

    // Non può disattivare se stesso
    if (id === session.user.id) {
      return NextResponse.json(
        { error: 'Non puoi disattivare te stesso' },
        { status: 400 }
      )
    }

    // Recupera utente da disattivare
    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const targetRole = targetUser.role.name as UserRole

    // Verifica permessi
    if (!canPerformAction('user:delete', userRole, targetRole)) {
      return NextResponse.json(
        { error: 'Non hai i permessi per disattivare questo utente' },
        { status: 403 }
      )
    }

    // Manager può disattivare solo utenti della propria sede
    if (userRole === 'manager') {
      if (targetUser.venueId !== session.user.venueId) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
    }

    // Soft delete: imposta isActive = false
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    })

    return NextResponse.json({ message: 'Utente disattivato' })
  } catch (error) {
    logger.error('Errore DELETE /api/users/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella disattivazione dell\'utente' },
      { status: 500 }
    )
  }
}

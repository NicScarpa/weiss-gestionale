import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
// Campi che l'utente può modificare del proprio profilo
const updateProfileSchema = z.object({
  phoneNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
})

// GET /api/users/me - Profilo utente corrente
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        role: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Restituisce tutti i campi del proprio profilo (tranne password)
    const { passwordHash: _passwordHash, ...userWithoutPassword } = user

    return NextResponse.json(userWithoutPassword)
  } catch (error) {
    logger.error('Errore GET /api/users/me', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del profilo' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/me - Modifica proprio profilo (campi limitati)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = updateProfileSchema.parse(body)

    // Costruisci dati da aggiornare
    const updateData: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(validatedData)) {
      if (value === undefined) continue

      // Verifica unicità email se modificata
      if (key === 'email' && value) {
        const existingEmail = await prisma.user.findFirst({
          where: {
            email: value as string,
            NOT: { id: session.user.id },
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
    }

    // Aggiorna profilo
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    const { passwordHash: _passwordHash, ...userWithoutPassword } = updatedUser

    return NextResponse.json(userWithoutPassword)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PATCH /api/users/me', error)
    return NextResponse.json(
      { error: 'Errore nella modifica del profilo' },
      { status: 500 }
    )
  }
}

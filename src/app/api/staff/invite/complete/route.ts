import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { generateUniqueUsername } from '@/lib/utils/username'
import { getVenueId } from '@/lib/venue'

// Password iniziale di default (non puo essere usata)
const DEFAULT_PASSWORD = '1234567890'

const completeSchema = z.object({
  token: z.string().min(1, 'Token obbligatorio'),
  firstName: z.string().min(1, 'Nome obbligatorio').trim(),
  lastName: z.string().min(1, 'Cognome obbligatorio').trim(),
  email: z.string().email('Email non valida').trim().toLowerCase(),
  phoneNumber: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  fiscalCode: z.string().max(16).optional().nullable(),
  password: z
    .string()
    .min(8, 'La password deve essere di almeno 8 caratteri')
    .refine(
      (pwd) => pwd !== DEFAULT_PASSWORD,
      'Non puoi usare la password iniziale'
    ),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Le password non coincidono',
    path: ['confirmPassword'],
  }
)

/**
 * GET /api/staff/invite/complete?token=xxx
 *
 * Valida un token di invito e ritorna i dati pre-compilati.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token mancante' },
        { status: 400 }
      )
    }

    const invitation = await prisma.invitationToken.findUnique({
      where: { token },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        expiresAt: true,
        usedAt: true,
        isActive: true,
      },
    })

    if (!invitation) {
      return NextResponse.json(
        { valid: false, error: 'Il link di invito non e valido.' },
        { status: 400 }
      )
    }

    if (!invitation.isActive) {
      return NextResponse.json(
        { valid: false, error: 'Questo link di invito e stato disattivato. Chiedi al tuo responsabile di generarne uno nuovo.' },
        { status: 400 }
      )
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { valid: false, error: 'Questo invito e gia stato utilizzato.' },
        { status: 400 }
      )
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'Questo invito e scaduto. Chiedi al tuo responsabile di inviarne uno nuovo.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      firstName: invitation.firstName || null,
      lastName: invitation.lastName || null,
      email: invitation.email || null,
    })
  } catch (error) {
    logger.error('Errore GET /api/staff/invite/complete', error)
    return NextResponse.json(
      { valid: false, error: 'Errore nella verifica del token' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/staff/invite/complete
 *
 * Completa la registrazione di un dipendente invitato.
 * Endpoint pubblico (validato via token).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = completeSchema.parse(body)

    // Valida token
    const invitation = await prisma.invitationToken.findUnique({
      where: { token: data.token },
      include: {
        invitedBy: {
          select: { id: true },
        },
      },
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Il link di invito non e valido.' },
        { status: 400 }
      )
    }

    if (!invitation.isActive) {
      return NextResponse.json(
        { error: 'Questo link di invito e stato disattivato.' },
        { status: 400 }
      )
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { error: 'Questo invito e gia stato utilizzato.' },
        { status: 400 }
      )
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Questo invito e scaduto.' },
        { status: 400 }
      )
    }

    // Se il token ha un'email associata, verifica che corrisponda
    if (invitation.email && invitation.email.toLowerCase() !== data.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'L\'email inserita non corrisponde a quella dell\'invito.' },
        { status: 400 }
      )
    }

    // Verifica che l'email non sia gia registrata
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un utente con questa email esiste gia nel sistema.' },
        { status: 400 }
      )
    }

    // Trova ruolo "dipendente" (default)
    const staffRole = await prisma.role.findFirst({
      where: {
        name: {
          in: ['dipendente', 'staff', 'Dipendente', 'Staff'],
        },
      },
      select: { id: true },
    })

    if (!staffRole) {
      logger.error('[InviteComplete] Ruolo dipendente non trovato')
      return NextResponse.json(
        { error: 'Configurazione del sistema non valida. Contatta l\'amministratore.' },
        { status: 500 }
      )
    }

    // Genera username unico
    const username = await generateUniqueUsername(prisma, data.firstName, data.lastName)

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12)

    // Ottieni venue di default
    const venueId = await getVenueId()

    // Crea utente in transazione
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber || null,
          birthDate: data.birthDate ? new Date(data.birthDate) : null,
          address: data.address || null,
          fiscalCode: data.fiscalCode || null,
          roleId: staffRole.id,
          venueId,
          isActive: true,
          mustChangePassword: false,
          createdById: invitation.invitedBy.id,
        },
        select: {
          id: true,
          username: true,
        },
      })

      // Marca invito come usato
      await tx.invitationToken.update({
        where: { id: invitation.id },
        data: {
          usedAt: new Date(),
          createdUserId: user.id,
        },
      })

      return user
    })

    logger.info('[InviteComplete] Utente creato da invito', {
      userId: newUser.id,
      username: newUser.username,
      invitationId: invitation.id,
    })

    return NextResponse.json({
      message: 'Registrazione completata con successo. Ora puoi accedere con le tue credenziali.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/staff/invite/complete', error)
    return NextResponse.json(
      { error: 'Si e verificato un errore. Riprova piu tardi.' },
      { status: 500 }
    )
  }
}

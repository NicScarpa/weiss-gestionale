import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import {
  canPerformAction,
  canAccessUserManagement,
  getAssignableRoles,
  filterUserFields,
  type UserRole,
} from '@/lib/utils/permissions'
import {
  generateUniqueUsername,
  generateAdminUsername,
  shouldUseEmailAsUsername,
} from '@/lib/utils/username'

import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
// Password iniziale di default
const DEFAULT_PASSWORD = '1234567890'

// Schema creazione utente
const createUserSchema = z.object({
  firstName: z.string().min(1, 'Nome obbligatorio'),
  lastName: z.string().min(1, 'Cognome obbligatorio'),
  email: z.string().email('Email non valida').optional().nullable(),
  role: z.enum(['admin', 'manager', 'staff']),
  venueId: z.string().optional().nullable(),
  // Campi opzionali profilo
  phoneNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(), // ISO date
  hireDate: z.string().optional().nullable(),
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
  fiscalCode: z.string().optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  skills: z.array(z.string()).optional(),
  canWorkAlone: z.boolean().optional(),
  canHandleCash: z.boolean().optional(),
})

// GET /api/users - Lista utenti
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const userRole = session.user.role as UserRole

    // Verifica permesso lista utenti
    if (!canAccessUserManagement(userRole)) {
      return NextResponse.json(
        { error: 'Non hai i permessi per visualizzare la lista utenti' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const venueId = searchParams.get('venueId')
    const isActive = searchParams.get('isActive')
    const search = searchParams.get('search')

    // Costruisci filtro
    const whereClause: Record<string, unknown> = {}

    // Manager vede solo la propria sede
    if (userRole === 'manager') {
      whereClause.venueId = await getVenueId()
    } else if (venueId) {
      whereClause.venueId = venueId
    }

    // Filtro ruolo
    if (role) {
      whereClause.role = { name: role }
    }

    // Filtro stato attivo
    if (isActive !== null) {
      whereClause.isActive = isActive === 'true'
    }

    // Ricerca testuale
    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ]
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        role: {
          select: { id: true, name: true },
        },
        venue: {
          select: { id: true, name: true, code: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Filtra campi in base al ruolo
    const filteredUsers = users.map((user) => filterUserFields(user as unknown as Record<string, unknown>, userRole))

    return NextResponse.json({ data: filteredUsers })
  } catch (error) {
    logger.error('Errore GET /api/users', error)
    return NextResponse.json(
      { error: 'Errore nel recupero degli utenti' },
      { status: 500 }
    )
  }
}

// POST /api/users - Crea nuovo utente
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const userRole = session.user.role as UserRole

    // Verifica permesso creazione
    if (!canPerformAction('user:create', userRole)) {
      return NextResponse.json(
        { error: 'Non hai i permessi per creare utenti' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createUserSchema.parse(body)

    // Verifica che il ruolo target sia assegnabile
    const assignableRoles = getAssignableRoles(userRole)
    if (!assignableRoles.includes(validatedData.role as UserRole)) {
      return NextResponse.json(
        { error: `Non puoi creare utenti con ruolo ${validatedData.role}` },
        { status: 403 }
      )
    }

    // Admin/Manager richiedono email obbligatoria
    if (
      (validatedData.role === 'admin' || validatedData.role === 'manager') &&
      !validatedData.email
    ) {
      return NextResponse.json(
        { error: 'Email obbligatoria per admin e manager' },
        { status: 400 }
      )
    }

    // Manager può creare solo nella propria sede
    if (userRole === 'manager') {
      const managerVenueId = await getVenueId()
      if (validatedData.venueId && validatedData.venueId !== managerVenueId) {
        return NextResponse.json(
          { error: 'Puoi creare utenti solo nella tua sede' },
          { status: 403 }
        )
      }
      validatedData.venueId = managerVenueId
    }

    // Verifica email univoca (se fornita)
    if (validatedData.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: validatedData.email },
      })
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email già in uso' },
          { status: 400 }
        )
      }
    }

    // Recupera ID ruolo
    const roleRecord = await prisma.role.findUnique({
      where: { name: validatedData.role },
    })
    if (!roleRecord) {
      return NextResponse.json(
        { error: 'Ruolo non trovato' },
        { status: 400 }
      )
    }

    // Genera username
    let username: string
    if (shouldUseEmailAsUsername(validatedData.role)) {
      username = generateAdminUsername(validatedData.email!)
    } else {
      username = await generateUniqueUsername(
        prisma,
        validatedData.firstName,
        validatedData.lastName
      )
    }

    // Hash password iniziale
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

    // Crea utente
    const newUser = await prisma.user.create({
      data: {
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email || null,
        username,
        passwordHash,
        roleId: roleRecord.id,
        venueId: validatedData.venueId || null,
        phoneNumber: validatedData.phoneNumber || null,
        address: validatedData.address || null,
        birthDate: validatedData.birthDate ? new Date(validatedData.birthDate) : null,
        hireDate: validatedData.hireDate ? new Date(validatedData.hireDate) : null,
        contractType: validatedData.contractType || null,
        contractHoursWeek: validatedData.contractHoursWeek || null,
        workDaysPerWeek: validatedData.workDaysPerWeek || null,
        hourlyRate: validatedData.hourlyRate || null,
        fiscalCode: validatedData.fiscalCode || null,
        vatNumber: validatedData.vatNumber || null,
        skills: validatedData.skills || [],
        canWorkAlone: validatedData.canWorkAlone ?? false,
        canHandleCash: validatedData.canHandleCash ?? true,
        mustChangePassword: true,
        isActive: true,
        createdById: session.user.id,
      },
      include: {
        role: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, code: true } },
      },
    })

    // Restituisci utente con credenziali (solo questa volta!)
    return NextResponse.json({
      user: filterUserFields(newUser as unknown as Record<string, unknown>, userRole),
      credentials: {
        username,
        password: DEFAULT_PASSWORD,
        mustChangePassword: true,
      },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/users', error)
    return NextResponse.json(
      { error: 'Errore nella creazione dell\'utente' },
      { status: 500 }
    )
  }
}

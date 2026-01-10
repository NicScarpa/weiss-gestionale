/**
 * Utility per gestione permessi utenti
 *
 * Matrice permessi:
 * - Admin: gestisce tutti gli utenti
 * - Manager: può creare/modificare solo Staff della propria sede
 * - Staff: può solo vedere e modificare il proprio profilo (campi limitati)
 */

export type UserRole = 'admin' | 'manager' | 'staff'

export type UserAction =
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete' // soft delete (disattiva)
  | 'user:reset-password'
  | 'user:change-role'
  | 'user:list'

/**
 * Matrice permessi per ruolo
 */
export const userPermissions: Record<UserRole, UserAction[]> = {
  admin: [
    'user:create',
    'user:read',
    'user:update',
    'user:delete',
    'user:reset-password',
    'user:change-role',
    'user:list',
  ],
  manager: [
    'user:create', // Solo Staff
    'user:read', // Solo propria sede
    'user:update', // Solo Staff propria sede
    'user:delete', // Solo Staff propria sede
    'user:reset-password', // Solo Staff propria sede
    'user:list', // Solo propria sede
  ],
  staff: [
    'user:read', // Solo se stesso
  ],
}

/**
 * Verifica se un ruolo può eseguire un'azione su un target
 *
 * @param action - Azione da verificare
 * @param currentRole - Ruolo dell'utente corrente
 * @param targetRole - Ruolo dell'utente target (opzionale)
 * @returns true se l'azione è permessa
 */
export function canPerformAction(
  action: UserAction,
  currentRole: UserRole,
  targetRole?: UserRole
): boolean {
  // Verifica se il ruolo ha il permesso base
  const allowedActions = userPermissions[currentRole]
  if (!allowedActions.includes(action)) {
    return false
  }

  // Admin può fare tutto su tutti
  if (currentRole === 'admin') {
    return true
  }

  // Manager può operare solo su Staff
  if (currentRole === 'manager') {
    // Per azioni che richiedono un target, verifica che sia Staff
    if (targetRole && targetRole !== 'staff') {
      return false
    }
    // Manager non può cambiare ruoli
    if (action === 'user:change-role') {
      return false
    }
    return true
  }

  // Staff può solo leggere se stesso (gestito a livello API)
  return action === 'user:read'
}

/**
 * Verifica se un utente può accedere alla gestione utenti
 */
export function canAccessUserManagement(role: UserRole): boolean {
  return role === 'admin' || role === 'manager'
}

/**
 * Ottieni i ruoli che un utente può assegnare
 */
export function getAssignableRoles(currentRole: UserRole): UserRole[] {
  switch (currentRole) {
    case 'admin':
      return ['admin', 'manager', 'staff']
    case 'manager':
      return ['staff'] // Manager può solo creare Staff
    default:
      return []
  }
}

/**
 * Verifica se un utente può modificare un campo specifico del profilo
 */
export function canEditProfileField(
  currentRole: UserRole,
  targetRole: UserRole,
  field: string,
  isSelf: boolean
): boolean {
  // Admin può modificare tutto
  if (currentRole === 'admin') {
    return true
  }

  // Manager può modificare Staff (non se stesso per ruolo)
  if (currentRole === 'manager') {
    if (targetRole !== 'staff') {
      return false
    }
    // Manager non può modificare ruolo di nessuno
    if (field === 'role' || field === 'roleId') {
      return false
    }
    return true
  }

  // Staff può modificare solo alcuni campi del proprio profilo
  if (currentRole === 'staff' && isSelf) {
    const editableFields = [
      'phoneNumber',
      'email',
      'address',
      'whatsappNumber',
      'notifyEmail',
      'notifyPush',
      'notifyWhatsapp',
    ]
    return editableFields.includes(field)
  }

  return false
}

/**
 * Filtra i campi restituiti in base al ruolo
 */
export function filterUserFields(user: Record<string, unknown>, viewerRole: UserRole): Record<string, unknown> {
  // Campi sempre visibili
  const publicFields = ['id', 'firstName', 'lastName', 'email', 'role', 'venue', 'isActive']

  // Campi visibili solo ad admin/manager
  const adminFields = [
    ...publicFields,
    'username',
    'phoneNumber',
    'address',
    'birthDate',
    'hireDate',
    'terminationDate',
    'contractType',
    'contractHoursWeek',
    'workDaysPerWeek',
    'hourlyRate',
    'hourlyRateBase',
    'hourlyRateExtra',
    'hourlyRateHoliday',
    'hourlyRateNight',
    'fiscalCode',
    'vatNumber',
    'skills',
    'canWorkAlone',
    'canHandleCash',
    'availableDays',
    'availableHolidays',
    'portalEnabled',
    'mustChangePassword',
    'lastLoginAt',
    'createdAt',
    'updatedAt',
    'createdBy',
  ]

  const fieldsToInclude = viewerRole === 'admin' || viewerRole === 'manager'
    ? adminFields
    : publicFields

  const filtered: Record<string, unknown> = {}
  for (const field of fieldsToInclude) {
    if (field in user) {
      filtered[field] = user[field]
    }
  }

  return filtered
}

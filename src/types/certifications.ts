/**
 * Tipi e utilità per il tracciamento certificazioni dipendenti
 */

export type CertificationType =
  | 'HACCP'
  | 'SICUREZZA'
  | 'ANTINCENDIO'
  | 'PRIMO_SOCCORSO'
  | 'PREPOSTO'

export type CertificationStatus = 'valid' | 'expiring' | 'expired'

export interface Certification {
  id: string
  userId: string
  type: CertificationType
  obtainedDate: string // ISO date
  expiryDate: string // ISO date
  documentUrl?: string | null
  documentUploadedAt?: string | null
  hasDocument?: boolean
  createdAt: string
  updatedAt: string
}

export const CERTIFICATION_TYPES: Record<
  CertificationType,
  { label: string; description: string }
> = {
  HACCP: {
    label: 'HACCP',
    description: 'Igiene alimentare',
  },
  SICUREZZA: {
    label: 'Sicurezza sul lavoro',
    description: 'D.Lgs. 81/08 - Sicurezza sul lavoro',
  },
  ANTINCENDIO: {
    label: 'Antincendio',
    description: 'Prevenzione incendi',
  },
  PRIMO_SOCCORSO: {
    label: 'Primo soccorso',
    description: 'Primo soccorso aziendale',
  },
  PREPOSTO: {
    label: 'Preposto',
    description: 'Formazione preposto',
  },
}

/**
 * Calcola lo stato di una certificazione basandosi sulla data di scadenza.
 * - expired: scaduta (< oggi)
 * - expiring: in scadenza (< 30 giorni da oggi)
 * - valid: valida
 */
export function getCertificationStatus(expiryDate: string | Date): CertificationStatus {
  const expiry = new Date(expiryDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)

  if (expiry < today) return 'expired'

  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  if (expiry <= thirtyDaysFromNow) return 'expiring'

  return 'valid'
}

/**
 * Restituisce le certificazioni obbligatorie basate sul tipo di contratto e ruolo.
 * - HACCP e Sicurezza: obbligatori per tutti i contratti dipendente
 * - Preposto: obbligatorio per manager
 */
export function getMandatoryCertifications(
  contractType?: string | null,
  roleName?: string | null
): CertificationType[] {
  const mandatory: CertificationType[] = []

  const employeeContracts = [
    'TEMPO_DETERMINATO',
    'TEMPO_INDETERMINATO',
    'LAVORO_INTERMITTENTE',
  ]

  if (contractType && employeeContracts.includes(contractType)) {
    mandatory.push('HACCP', 'SICUREZZA')
  }

  if (roleName === 'manager') {
    mandatory.push('PREPOSTO')
  }

  return mandatory
}

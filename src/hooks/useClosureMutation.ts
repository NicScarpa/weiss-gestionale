'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClosureFormData } from '@/components/chiusura/ClosureForm'
import { buildClosurePayload } from '@/lib/closure-form-utils'

type ZodIssueLike = { path?: Array<string | number>; message?: string }

class ApiMutationError extends Error {
  status: number
  details?: string[]

  constructor(message: string, status: number, details?: string[]) {
    super(message)
    this.name = 'ApiMutationError'
    this.status = status
    this.details = details
  }
}

function formatZodIssues(issues: ZodIssueLike[] | undefined): string[] {
  if (!issues?.length) return []

  return issues.map((issue) => {
    const path = issue.path ?? []
    const msg = issue.message || 'Valore non valido'

    if (path[0] === 'attendance' && typeof path[1] === 'number') {
      const row = path[1] + 1
      const field = path[2]
      if (field === 'userId') return `Presenze: riga ${row} — ${msg}`
      if (field === 'hours') return `Presenze: riga ${row} — ${msg}`
      if (field === 'shift') return `Presenze: riga ${row} — ${msg}`
      return `Presenze: riga ${row} — ${msg}`
    }

    if (path[0] === 'partials' && typeof path[1] === 'number') {
      const row = path[1] + 1
      const field = path[2]
      if (field === 'timeSlot') return `Parziali orari: riga ${row} — ${msg}`
      return `Parziali orari: riga ${row} — ${msg}`
    }

    if (path[0] === 'date') return `Data: ${msg}`
    if (path[0] === 'venueId') return `Sede: ${msg}`

    return msg
  })
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function buildApiError(status: number, data: unknown): ApiMutationError {
  const payload = (data ?? {}) as {
    error?: string
    details?: unknown
  }

  const baseMessage =
    (payload.error === 'Dati non validi' && Array.isArray(payload.details)
      ? 'Impossibile salvare: dati non validi'
      : payload.error) ||
    (status === 401
      ? 'Sessione scaduta o non autorizzato'
      : status === 403
      ? 'Accesso negato'
      : 'Errore nel salvataggio')

  const details: string[] = []
  if (Array.isArray(payload.details)) {
    if (payload.details.length > 0 && typeof payload.details[0] === 'string') {
      details.push(...(payload.details as string[]))
    } else {
      details.push(...formatZodIssues(payload.details as ZodIssueLike[]))
    }
  }

  return new ApiMutationError(baseMessage, status, details.length ? details : undefined)
}

interface UseClosureMutationOptions {
  venueId: string
  closureId?: string
  onSuccess?: (closureId: string) => void
  onError?: (error: Error) => void
}

interface UseClosureMutationReturn {
  saveDraft: (data: ClosureFormData) => Promise<string | null>
  submitForValidation: (data: ClosureFormData) => Promise<void>
  updateClosure: (data: ClosureFormData) => Promise<void>
  isLoading: boolean
  isSaving: boolean
  isSubmitting: boolean
  error: Error | null
}

/**
 * Custom hook for closure create/update/submit operations
 *
 * Centralizes all API calls for closure mutations, reducing duplication
 * between NuovaChiusuraClient and ModificaChiusuraClient
 */
export function useClosureMutation({
  venueId,
  closureId,
  onSuccess,
  onError,
}: UseClosureMutationOptions): UseClosureMutationReturn {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Creates a new closure draft
   * Returns the created closure ID or null on error
   */
  const saveDraft = useCallback(
    async (data: ClosureFormData): Promise<string | null> => {
      setIsSaving(true)
      setError(null)

      try {
        const payload = buildClosurePayload(data, venueId)

        const res = await fetch('/api/chiusure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const errorData = await safeReadJson(res)

          // Handle conflict (closure already exists for this date)
          const conflict = (errorData ?? {}) as { existingId?: string }
          if (res.status === 409 && conflict.existingId) {
            toast.error('Chiusura già presente', {
              description: 'Esiste già una chiusura per questa data. Apri la bozza esistente.',
            })
            router.push(`/chiusura-cassa/${conflict.existingId}/modifica`)
            return null
          }

          throw buildApiError(res.status, errorData)
        }

        const result = await res.json()
        onSuccess?.(result.id)
        return result.id
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Errore sconosciuto')
        setError(error)
        onError?.(error)
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [venueId, router, onSuccess, onError]
  )

  /**
   * Creates a closure and immediately submits it for validation
   */
  const submitForValidation = useCallback(
    async (data: ClosureFormData): Promise<void> => {
      setIsSubmitting(true)
      setError(null)

      try {
        // First save the draft
        const newClosureId = await saveDraft(data)

        if (!newClosureId) {
          // saveDraft handled the redirect (e.g., conflict case)
          return
        }

        // Then submit for validation
        const submitRes = await fetch(`/api/chiusure/${newClosureId}/submit`, {
          method: 'POST',
        })

        if (!submitRes.ok) {
          const errorData = await safeReadJson(submitRes)
          throw buildApiError(submitRes.status, errorData)
        }

        window.open(`/api/chiusure/${newClosureId}/pdf?view=inline`, '_blank')
        router.push('/chiusura-cassa')
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Errore sconosciuto')
        setError(error)
        onError?.(error)
        throw error
      } finally {
        setIsSubmitting(false)
      }
    },
    [saveDraft, router, onError]
  )

  /**
   * Updates an existing closure (metadata + all relational data)
   */
  const updateClosure = useCallback(
    async (data: ClosureFormData): Promise<void> => {
      if (!closureId) {
        throw new Error('closureId is required for update')
      }

      setIsSaving(true)
      setError(null)

      try {
        const payload = buildClosurePayload(data, venueId)

        const res = await fetch(`/api/chiusure/${closureId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const errorData = await safeReadJson(res)
          throw buildApiError(res.status, errorData)
        }

        onSuccess?.(closureId)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Errore sconosciuto')
        setError(error)
        onError?.(error)
        throw error
      } finally {
        setIsSaving(false)
      }
    },
    [closureId, venueId, onSuccess, onError]
  )

  return {
    saveDraft,
    submitForValidation,
    updateClosure,
    isLoading: isSaving || isSubmitting,
    isSaving,
    isSubmitting,
    error,
  }
}

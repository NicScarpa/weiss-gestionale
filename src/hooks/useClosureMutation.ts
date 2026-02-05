'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClosureFormData } from '@/components/chiusura/ClosureForm'
import { buildClosurePayload } from '@/lib/closure-form-utils'

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
          const errorData = await res.json()

          // Handle conflict (closure already exists for this date)
          if (res.status === 409 && errorData.existingId) {
            toast.error('Esiste già una chiusura per questa data')
            router.push(`/chiusura-cassa/${errorData.existingId}/modifica`)
            return null
          }

          throw new Error(errorData.error || 'Errore nel salvataggio')
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
          const errorData = await submitRes.json()
          throw new Error(errorData.error || "Errore nell'invio")
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
          const errorData = await res.json()
          throw new Error(errorData.error || "Errore nell'aggiornamento")
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

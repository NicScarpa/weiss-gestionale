'use client'

import { use, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AnagraficaForm } from '@/components/anagrafiche/AnagraficaForm'
import { ArrowLeft, Building2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Scheda cliente in modifica. Ci si arriva dalla matita nella lista, che prima
 * portava a un indirizzo senza pagina.
 */
export default function SchedaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session, status } = useSession()

  const [cliente, setCliente] = useState<Record<string, unknown> | null>(null)
  const [caricamento, setCaricamento] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || session.user.role !== 'admin') {
      router.replace('/')
    }
  }, [session, status, router])

  useEffect(() => {
    let annullato = false

    const carica = async () => {
      const risposta = await fetch(`/api/customers/${id}`)
      const esito = await risposta.json()
      if (annullato) return

      if (!risposta.ok) {
        toast.error(esito.error || 'Cliente non trovato')
        router.push('/anagrafiche/clienti')
        return
      }

      setCliente(esito.customer)
      setCaricamento(false)
    }

    void carica()
    return () => {
      annullato = true
    }
  }, [id, router])

  const salva = async (corpo: Record<string, unknown>) => {
    const risposta = await fetch('/api/customers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...corpo, id }),
    })
    const esito = await risposta.json()

    if (!risposta.ok) {
      toast.error(esito.error || 'Errore nel salvataggio')
      return
    }

    toast.success('Cliente aggiornato')
    router.push('/anagrafiche/clienti')
  }

  return (
    <div className="container mx-auto max-w-4xl py-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/anagrafiche/clienti">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6" />
          {(cliente?.denominazione as string) || 'Scheda cliente'}
        </h1>
      </div>

      {caricamento && !cliente ? (
        <p className="text-muted-foreground">Caricamento...</p>
      ) : (
        <AnagraficaForm
          variante="cliente"
          valoriIniziali={cliente ?? undefined}
          onSalva={salva}
          onAnnulla={() => router.push('/anagrafiche/clienti')}
        />
      )}
    </div>
  )
}

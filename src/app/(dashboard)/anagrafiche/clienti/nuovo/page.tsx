'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AnagraficaForm } from '@/components/anagrafiche/AnagraficaForm'
import { ArrowLeft, Building2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Nuovo cliente. Il bottone che porta qui esisteva da mesi, questa pagina no:
 * rimandava a `/anagrafiche/clienti/nuovo` e dava 404.
 */
export default function NuovoClientePage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user || session.user.role !== 'admin') {
      router.replace('/')
    }
  }, [session, status, router])

  const salva = async (corpo: Record<string, unknown>) => {
    const risposta = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const esito = await risposta.json()

    if (!risposta.ok) {
      // Il messaggio del server dice *quale* dato è già in anagrafica
      // (partita IVA, codice fiscale, denominazione): va mostrato com'è.
      toast.error(esito.error || 'Errore nella creazione del cliente')
      return
    }

    toast.success('Cliente creato')
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
          Nuovo Cliente
        </h1>
        <p className="text-muted-foreground">
          Serve solo la denominazione: il resto si completa quando lo sai
        </p>
      </div>

      <AnagraficaForm
        variante="cliente"
        onSalva={salva}
        onAnnulla={() => router.push('/anagrafiche/clienti')}
      />
    </div>
  )
}

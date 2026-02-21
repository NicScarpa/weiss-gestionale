'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AlertCircle, Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react'

interface InviteData {
  firstName: string | null
  lastName: string | null
  email: string | null
}

function InviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [isValidating, setIsValidating] = useState(true)
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [address, setAddress] = useState('')
  const [fiscalCode, setFiscalCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Valida token al mount
  useEffect(() => {
    if (!token) {
      setError('Token mancante. Il link potrebbe non essere valido.')
      setIsValidating(false)
      return
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/staff/invite/complete?token=${token}`)
        const data = await response.json()

        if (data.valid) {
          setIsTokenValid(true)
          const inviteData = data as InviteData
          setFirstName(inviteData.firstName || '')
          setLastName(inviteData.lastName || '')
          setEmail(inviteData.email || '')
        } else {
          setError(data.error || 'Il link di invito non e valido.')
        }
      } catch {
        setError('Errore nella verifica del link')
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri')
      return
    }

    if (password !== confirmPassword) {
      setError('Le password non coincidono')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/staff/invite/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          email,
          phoneNumber: phoneNumber || null,
          birthDate: birthDate || null,
          address: address || null,
          fiscalCode: fiscalCode || null,
          password,
          confirmPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Errore durante la registrazione')
      }

      setIsSuccess(true)

      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Si e verificato un errore')
    } finally {
      setIsLoading(false)
    }
  }

  // Loading
  if (isValidating) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Verifica invito in corso...</p>
      </div>
    )
  }

  // Token non valido
  if (!isTokenValid && !isSuccess) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Invito non valido</p>
            <p className="mt-1 text-red-600/80 dark:text-red-400/80">
              {error || 'Il link di invito e scaduto o non valido.'}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Contatta il tuo responsabile per ricevere un nuovo invito.
        </p>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="inline-block mr-1 h-3 w-3" />
            Vai al login
          </Link>
        </div>
      </div>
    )
  }

  // Successo
  if (isSuccess) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Registrazione completata!</p>
            <p className="mt-1 text-green-600/80 dark:text-green-400/80">
              Il tuo account e stato creato. Verrai reindirizzato al login...
            </p>
          </div>
        </div>

        <Link href="/login" className="block">
          <Button variant="outline" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Vai al login
          </Button>
        </Link>
      </div>
    )
  }

  // Form registrazione
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">Completa la registrazione</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Inserisci i tuoi dati per completare il profilo
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nome *</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Cognome *</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phoneNumber">Telefono</Label>
        <Input
          id="phoneNumber"
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Es. +39 333 1234567"
          disabled={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="birthDate">Data di nascita</Label>
          <Input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fiscalCode">Codice Fiscale</Label>
          <Input
            id="fiscalCode"
            value={fiscalCode}
            onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
            maxLength={16}
            placeholder="Es. RSSMRA85T10A562S"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Indirizzo</Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Es. Via Roma 1, 20100 Milano"
          disabled={isLoading}
        />
      </div>

      <hr className="my-2" />

      <div className="space-y-2">
        <Label htmlFor="password">Password *</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Minimo 8 caratteri"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Minimo 8 caratteri</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Conferma password *</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          placeholder="Ripeti la password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isLoading}
          autoComplete="new-password"
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || !firstName || !lastName || !email || !password || !confirmPassword}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Registrazione in corso...
          </>
        ) : (
          'Completa registrazione'
        )}
      </Button>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="inline-block mr-1 h-3 w-3" />
          Hai gia un account? Accedi
        </Link>
      </div>
    </form>
  )
}

export default function InvitoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex items-center justify-center py-6">
          <Image
            src="/images/logo.svg"
            alt="Weiss Cafe"
            width={200}
            height={80}
            priority
            className="h-auto w-auto max-w-[200px]"
          />
        </CardHeader>
        <CardContent>
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Caricamento...</p>
            </div>
          }>
            <InviteForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

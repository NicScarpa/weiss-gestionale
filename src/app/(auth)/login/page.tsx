'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'
import Image from 'next/image'

const STAFF_HOSTNAME = 'staff.weisscafe.com'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const error = searchParams.get('error')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isStaffDomain, setIsStaffDomain] = useState(false)

  // Rileva se siamo sul dominio staff
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsStaffDomain(window.location.hostname === STAFF_HOSTNAME)
    }
  }, [])

  // Se già autenticato, redirect basato su ruolo
  useEffect(() => {
    if (session?.user) {
      if (session.user.role === 'staff' || isStaffDomain) {
        router.replace('/portale')
      } else {
        router.replace('/')
      }
    }
  }, [session, isStaffDomain, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError(null)

    try {
      // Su dominio staff, forza callbackUrl a /portale
      const targetUrl = isStaffDomain ? '/portale' : callbackUrl

      const result = await signIn('credentials', {
        identifier,
        password,
        redirect: false,
        callbackUrl: targetUrl
      })

      if (result?.error) {
        setLoginError(result.error === 'CredentialsSignin'
          ? 'Username/Email o password non validi'
          : result.error)
      } else if (result?.ok) {
        // Fetch session per determinare il ruolo
        const sessionRes = await fetch('/api/auth/session')
        const sessionData = await sessionRes.json()

        if (sessionData?.user?.role === 'staff' || isStaffDomain) {
          router.push('/portale')
        } else {
          router.push(targetUrl)
        }
        router.refresh()
      }
    } catch (_err) {
      setLoginError('Si è verificato un errore durante il login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <Card
        className="w-full max-w-md border-none"
        style={{
          backgroundColor: 'white',
          '--card': 'oklch(1 0 0)',
          '--card-foreground': 'oklch(0.2 0.02 260)',
          '--input': 'oklch(0.94 0 0)',
          '--border': 'oklch(0.94 0 0)',
          '--muted-foreground': 'oklch(0.6 0.02 260)',
          '--foreground': 'oklch(0.2 0.02 260)',
          '--primary': 'oklch(0 0 0)',
          '--primary-foreground': 'oklch(0.985 0 0)',
          '--ring': 'oklch(0.708 0 0)',
        } as React.CSSProperties}
      >
        <CardHeader className="flex items-center justify-center py-6">
          {isStaffDomain ? (
            <div className="text-center">
              <Image
                src="/images/logo.svg"
                alt="Weiss Cafè"
                width={160}
                height={64}
                priority
                className="h-auto w-auto max-w-[160px] mx-auto"
              />
              <p className="mt-3 text-sm font-medium text-gray-500 uppercase tracking-wider">
                Portale Dipendenti
              </p>
            </div>
          ) : (
            <Image
              src="/images/logo.svg"
              alt="Weiss Cafè"
              width={200}
              height={80}
              priority
              className="h-auto w-auto max-w-[200px]"
            />
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {(loginError || error) && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{loginError || 'Errore di autenticazione'}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="identifier">Username</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                'Accedi'
              )}
            </Button>
          </form>

          {!isStaffDomain && (
            <div className="mt-6 text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Password dimenticata?
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

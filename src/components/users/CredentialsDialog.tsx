'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface CredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  credentials: {
    username: string
    password: string
    firstName: string
    lastName: string
  } | null
  /**
   * 'create' dopo la creazione di un utente, 'reset' dopo il reset della
   * password. Cambia solo i testi: la password mostrata è temporanea in
   * entrambi i casi e va cambiata al primo accesso.
   */
  mode?: 'create' | 'reset'
  /** Esito dell'invio email, se il percorso chiamante lo tenta. */
  emailSentTo?: string | null
}

export function CredentialsDialog({
  open,
  onOpenChange,
  credentials,
  mode = 'create',
  emailSentTo,
}: CredentialsDialogProps) {
  const [copiedField, setCopiedField] = useState<'username' | 'password' | 'both' | null>(null)

  const copyToClipboard = async (text: string, field: 'username' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      toast.success('Copiato negli appunti')
    } catch {
      toast.error('Errore durante la copia')
    }
  }

  const copyAll = () => {
    if (!credentials) return
    const text = `Username: ${credentials.username}\nPassword: ${credentials.password}`
    copyToClipboard(text, 'both')
  }

  if (!credentials) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'reset' ? 'Password reimpostata' : 'Utente creato con successo'}
          </DialogTitle>
          <DialogDescription>
            Credenziali di accesso per <strong>{credentials.firstName} {credentials.lastName}</strong>.
            <br />
            {mode === 'reset'
              ? 'La password precedente non è più valida. Comunica queste credenziali all\'utente: dovrà cambiarle al primo accesso.'
              : 'Comunica queste credenziali all\'utente. La password dovrà essere cambiata al primo accesso.'}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {emailSentTo
            ? `Le credenziali sono state inviate anche a ${emailSentTo}. Copiale comunque: questa è l'unica volta che compaiono a schermo.`
            : 'Copia le credenziali adesso: questa è l\'unica volta che compaiono a schermo. Se le perdi, va rigenerata la password.'}
        </p>

        <div className="space-y-4 py-4">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="flex gap-2">
              <Input
                id="username"
                value={credentials.username}
                readOnly
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(credentials.username, 'username')}
              >
                {copiedField === 'username' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">
              {mode === 'reset' ? 'Nuova password temporanea' : 'Password iniziale'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="password"
                value={credentials.password}
                readOnly
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(credentials.password, 'password')}
              >
                {copiedField === 'password' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={copyAll} className="flex-1">
            {copiedField === 'both' ? (
              <>
                <Check className="mr-2 h-4 w-4 text-green-600" />
                Copiato!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copia tutto
              </>
            )}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1">
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

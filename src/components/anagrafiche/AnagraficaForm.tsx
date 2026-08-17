'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { Loader2 } from 'lucide-react'

import {
  CAMPI_ANAGRAFICA,
  GRUPPI,
  TIPI_CONTO,
  versoApi,
  versoModulo,
  type CampoAnagrafica,
  type ValoriAnagrafica,
  type VarianteAnagrafica,
} from '@/lib/anagrafiche/campi'

/**
 * Il modulo dell'anagrafica: uno solo, per clienti e fornitori.
 *
 * I campi non sono scritti qui: arrivano da `CAMPI_ANAGRAFICA`. È il punto di
 * tutta la faccenda — finché il modulo è uno, le due anagrafiche non possono
 * offrire campi diversi, e la difformità che c'era prima non può tornare.
 */

interface AnagraficaFormProps {
  variante: VarianteAnagrafica
  /** Il record così com'è nel database; il modulo lo traduce da sé. */
  valoriIniziali?: Record<string, unknown>
  onSalva: (corpo: Record<string, unknown>) => Promise<void>
  onAnnulla: () => void
  inCorso?: boolean
}

function valoriDiPartenza(
  variante: VarianteAnagrafica,
  record?: Record<string, unknown>
): ValoriAnagrafica {
  const base: ValoriAnagrafica = { paese: 'IT', attivo: true }
  if (!record) return base
  const letti = versoModulo(variante, record)
  return { ...base, ...letti, paese: (letti.paese as string) || 'IT' }
}

function testoDi(valore: ValoriAnagrafica[string]): string {
  if (valore === null || valore === undefined) return ''
  return String(valore)
}

export function AnagraficaForm({
  variante,
  valoriIniziali,
  onSalva,
  onAnnulla,
  inCorso = false,
}: AnagraficaFormProps) {
  const [valori, setValori] = useState<ValoriAnagrafica>(() =>
    valoriDiPartenza(variante, valoriIniziali)
  )
  const [errori, setErrori] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const aggiorna = (campo: CampoAnagrafica, valore: string | boolean) => {
    const pulito =
      typeof valore === 'string' && campo.maiuscolo ? valore.toUpperCase() : valore
    setValori((precedenti) => ({ ...precedenti, [campo.chiave]: pulito }))
    setErrori((precedenti) => {
      if (!precedenti[campo.chiave]) return precedenti
      const { [campo.chiave]: _tolto, ...resto } = precedenti
      return resto
    })
  }

  const controlla = (): Record<string, string> => {
    const trovati: Record<string, string> = {}

    for (const campo of CAMPI_ANAGRAFICA) {
      const valore = valori[campo.chiave]
      const testo = typeof valore === 'string' ? valore.trim() : valore

      if (campo.obbligatorio && !testo) {
        trovati[campo.chiave] = `${campo.etichetta} obbligatoria`
      }
      if (campo.tipo === 'email' && typeof testo === 'string' && testo !== '') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testo)) {
          trovati[campo.chiave] = 'Email non valida'
        }
      }
    }

    return trovati
  }

  const invia = async (evento: React.FormEvent) => {
    evento.preventDefault()

    const trovati = controlla()
    setErrori(trovati)
    if (Object.keys(trovati).length > 0) return

    setSalvando(true)
    try {
      await onSalva(versoApi(variante, valori))
    } finally {
      setSalvando(false)
    }
  }

  const inAttesa = salvando || inCorso

  return (
    // `noValidate`: la validazione del browser fermerebbe l'invio prima di noi,
    // mostrando un fumetto in una lingua che non scegliamo noi e lasciando il
    // modulo senza il messaggio accanto al campo sbagliato.
    <form onSubmit={invia} className="space-y-6" noValidate>
      {GRUPPI.map((gruppo) => {
        const campi = CAMPI_ANAGRAFICA.filter((c) => c.gruppo === gruppo.chiave)
        if (campi.length === 0) return null

        return (
          <Card key={gruppo.chiave}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{gruppo.titolo}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {campi.map((campo) => (
                <div
                  key={campo.chiave}
                  className={
                    campo.tipo === 'testoLungo' || campo.tipo === 'conto'
                      ? 'space-y-2 sm:col-span-2'
                      : 'space-y-2'
                  }
                >
                  <Label htmlFor={`anagrafica-${campo.chiave}`}>
                    {campo.etichetta}
                    {campo.obbligatorio && ' *'}
                  </Label>

                  {campo.tipo === 'conto' ? (
                    <AccountCombobox
                      types={TIPI_CONTO[variante]}
                      allowNone
                      value={testoDi(valori[campo.chiave]) || undefined}
                      onChange={(scelto) =>
                        setValori((precedenti) => ({ ...precedenti, [campo.chiave]: scelto ?? null }))
                      }
                      placeholder="Nessun conto"
                      disabled={inAttesa}
                    />
                  ) : campo.tipo === 'interruttore' ? (
                    <div className="flex h-9 items-center">
                      <Switch
                        id={`anagrafica-${campo.chiave}`}
                        checked={Boolean(valori[campo.chiave])}
                        onCheckedChange={(acceso) => aggiorna(campo, acceso)}
                        disabled={inAttesa}
                      />
                    </div>
                  ) : campo.tipo === 'testoLungo' ? (
                    <Textarea
                      id={`anagrafica-${campo.chiave}`}
                      value={testoDi(valori[campo.chiave])}
                      onChange={(e) => aggiorna(campo, e.target.value)}
                      placeholder={campo.segnaposto}
                      disabled={inAttesa}
                      rows={3}
                    />
                  ) : (
                    <Input
                      id={`anagrafica-${campo.chiave}`}
                      type={
                        campo.tipo === 'numero'
                          ? 'number'
                          : campo.tipo === 'email'
                            ? 'email'
                            : campo.tipo === 'telefono'
                              ? 'tel'
                              : 'text'
                      }
                      value={testoDi(valori[campo.chiave])}
                      onChange={(e) => aggiorna(campo, e.target.value)}
                      placeholder={campo.segnaposto}
                      maxLength={campo.lunghezzaMax}
                      min={campo.tipo === 'numero' ? 0 : undefined}
                      max={campo.tipo === 'numero' ? 365 : undefined}
                      disabled={inAttesa}
                    />
                  )}

                  {errori[campo.chiave] && (
                    <p className="text-sm text-destructive">{errori[campo.chiave]}</p>
                  )}
                  {!errori[campo.chiave] && campo.aiuto && (
                    <p className="text-xs text-muted-foreground">{campo.aiuto}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onAnnulla} disabled={inAttesa}>
          Annulla
        </Button>
        <Button type="submit" disabled={inAttesa}>
          {inAttesa && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salva
        </Button>
      </div>
    </form>
  )
}

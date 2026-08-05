'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { messaggioErroreApi } from '@/lib/utils/api-error'

/**
 * Form di una regola orario, con accanto il calcolatore di prova.
 *
 * Il calcolatore non è un accessorio: senza vedere il risultato su un orario
 * concreto, parametri come "tolleranza di arrotondamento in uscita" restano
 * indistinguibili l'uno dall'altro per chi li configura.
 */

export interface PausaAggiuntiva {
  name: string
  startMinutes: number
  endMinutes: number
}

export interface PoliticaOrario {
  id?: string
  name: string
  isDefault: boolean
  isActive: boolean
  dayStartMinutes: number
  dayEndMinutes: number
  lunchStartMinutes: number | null
  lunchEndMinutes: number | null
  flexMinutes: number
  roundingMinutes: number
  roundingToleranceMinutes: number
  roundingOutMinutes: number | null
  roundingOutToleranceMinutes: number | null
  maxDailyMinutes: number | null
  contractWeeklyHours: number | null
  saturdayAsOvertime: boolean
  blockSunday: boolean
  singlePunchMode: boolean
  extraBreaks: PausaAggiuntiva[]
}

interface RisultatoProva {
  workedMinutes: number
  ordinaryMinutes: number
  overtimeMinutes: number
  nightMinutes: number
  holidayMinutes: number
  breakMinutes: number
  cappedMinutes: number
  clockIn: number | null
  clockOut: number | null
  steps: string[]
  warnings: string[]
}

export const politicaVuota: PoliticaOrario = {
  name: '',
  isDefault: false,
  isActive: true,
  dayStartMinutes: 9 * 60,
  dayEndMinutes: 18 * 60,
  lunchStartMinutes: null,
  lunchEndMinutes: null,
  flexMinutes: 0,
  roundingMinutes: 1,
  roundingToleranceMinutes: 0,
  roundingOutMinutes: null,
  roundingOutToleranceMinutes: null,
  maxDailyMinutes: null,
  contractWeeklyHours: null,
  saturdayAsOvertime: false,
  blockSunday: false,
  singlePunchMode: false,
  extraBreaks: [],
}

/** Da minuti a "HH:mm", per gli input di tipo orario. */
export function minutiToOrario(minuti: number | null): string {
  if (minuti === null) return ''
  const normalizzati = ((minuti % 1440) + 1440) % 1440
  const h = Math.floor(normalizzati / 60)
  const m = normalizzati % 60

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function orarioToMinuti(orario: string): number | null {
  if (!orario) return null
  const [h, m] = orario.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null

  return h * 60 + m
}

function formatDurata(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = minuti % 60

  return `${h}h ${String(m).padStart(2, '0')}m`
}

/**
 * Giorni provabili nel calcolatore.
 *
 * Il mercoledì rappresenta il giorno feriale qualunque; il festivo è un feriale
 * che cade in un giorno di festa. Senza questa scelta "sabato come
 * straordinario" e la domenica restano parametri di cui non si vede l'effetto.
 */
const GIORNI_PROVA = {
  feriale: { etichetta: 'Giorno feriale', weekday: 3, isHoliday: false },
  sabato: { etichetta: 'Sabato', weekday: 6, isHoliday: false },
  domenica: { etichetta: 'Domenica', weekday: 0, isHoliday: false },
  festivo: { etichetta: 'Festivo', weekday: 3, isHoliday: true },
} as const

type GiornoProva = keyof typeof GIORNI_PROVA

const ETICHETTE_AVVISI: Record<string, string> = {
  ENTRATA_MANCANTE: 'Entrata mancante',
  USCITA_MANCANTE: 'Uscita mancante',
  PAUSA_PRANZO_NON_TIMBRATA: 'Pausa pranzo dedotta dalla regola',
  FUORI_FINESTRA: 'Orario fuori dalla finestra della giornata',
  OLTRE_TETTO_GIORNALIERO: 'Ore oltre il tetto giornaliero',
}

interface Props {
  valore: PoliticaOrario
  onChange: (valore: PoliticaOrario) => void
  onSalva: () => void
  onAnnulla: () => void
  isSaving: boolean
}

export function TimekeepingPolicyForm({
  valore,
  onChange,
  onSalva,
  onAnnulla,
  isSaving,
}: Props) {
  const [provaEntrata, setProvaEntrata] = useState('09:00')
  const [provaUscita, setProvaUscita] = useState('18:00')
  const [provaGiorno, setProvaGiorno] = useState<GiornoProva>('feriale')
  const [risultato, setRisultato] = useState<RisultatoProva | null>(null)

  const aggiorna = <K extends keyof PoliticaOrario>(
    campo: K,
    nuovo: PoliticaOrario[K]
  ) => {
    onChange({ ...valore, [campo]: nuovo })
  }

  const prova = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/politiche-orario/prova-calcolo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy: valore,
          clockInMinutes: orarioToMinuti(provaEntrata) ?? 0,
          clockOutMinutes: orarioToMinuti(provaUscita) ?? 0,
          weekday: GIORNI_PROVA[provaGiorno].weekday,
          isHoliday: GIORNI_PROVA[provaGiorno].isHoliday,
        }),
      })
      const dati = await response.json()
      if (!response.ok) {
        throw new Error(messaggioErroreApi(dati, 'Errore nel calcolo di prova'))
      }

      return dati.data as RisultatoProva
    },
    onSuccess: setRisultato,
    onError: (errore: Error) => toast.error(errore.message),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome della regola</Label>
              <Input
                id="nome"
                value={valore.name}
                onChange={(e) => aggiorna('name', e.target.value)}
                placeholder="Es. Full time, Part time 4 ore"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="predefinita">Regola predefinita</Label>
                <p className="text-sm text-muted-foreground">
                  Si applica a chi non ne ha una propria
                </p>
              </div>
              <Switch
                id="predefinita"
                checked={valore.isDefault}
                onCheckedChange={(v) => aggiorna('isDefault', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="attiva">Regola attiva</Label>
                <p className="text-sm text-muted-foreground">
                  Disattivandola smette di applicarsi a tutti: chi la aveva
                  ricade sulla regola predefinita
                </p>
              </div>
              <Switch
                id="attiva"
                checked={valore.isActive}
                onCheckedChange={(v) => aggiorna('isActive', v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Giornata lavorativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inizio">Inizio</Label>
                <Input
                  id="inizio"
                  type="time"
                  value={minutiToOrario(valore.dayStartMinutes)}
                  onChange={(e) =>
                    aggiorna('dayStartMinutes', orarioToMinuti(e.target.value) ?? 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fine">Fine</Label>
                <Input
                  id="fine"
                  type="time"
                  value={minutiToOrario(valore.dayEndMinutes)}
                  onChange={(e) =>
                    aggiorna('dayEndMinutes', orarioToMinuti(e.target.value) ?? 0)
                  }
                />
              </div>
            </div>
            {valore.dayEndMinutes <= valore.dayStartMinutes && (
              <p className="text-sm text-muted-foreground">
                La giornata scavalca la mezzanotte: l&apos;uscita del mattino seguente
                appartiene a questo turno.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="flex">Tempo flessibile (minuti)</Label>
              <Input
                id="flex"
                type="number"
                min={0}
                max={240}
                value={valore.flexMinutes}
                onChange={(e) => aggiorna('flexMinutes', Number(e.target.value))}
              />
              <p className="text-sm text-muted-foreground">
                Margine prima dell&apos;inizio e dopo la fine entro cui l&apos;anticipo o
                il posticipo contano come lavoro.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pause</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pranzo-inizio">Inizio pausa pranzo</Label>
                <Input
                  id="pranzo-inizio"
                  type="time"
                  value={minutiToOrario(valore.lunchStartMinutes)}
                  onChange={(e) =>
                    aggiorna('lunchStartMinutes', orarioToMinuti(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pranzo-fine">Fine pausa pranzo</Label>
                <Input
                  id="pranzo-fine"
                  type="time"
                  value={minutiToOrario(valore.lunchEndMinutes)}
                  onChange={(e) =>
                    aggiorna('lunchEndMinutes', orarioToMinuti(e.target.value))
                  }
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Se il dipendente non timbra la pausa, questi minuti vengono comunque
              tolti dalle ore lavorate.
            </p>

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Pause aggiuntive</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  aggiorna('extraBreaks', [
                    ...valore.extraBreaks,
                    { name: '', startMinutes: 16 * 60, endMinutes: 16 * 60 + 15 },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            </div>

            {valore.extraBreaks.map((pausa, indice) => (
              <div key={indice} className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={pausa.name}
                    placeholder="Es. Merenda"
                    onChange={(e) => {
                      const pause = [...valore.extraBreaks]
                      pause[indice] = { ...pausa, name: e.target.value }
                      aggiorna('extraBreaks', pause)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Inizio</Label>
                  <Input
                    type="time"
                    value={minutiToOrario(pausa.startMinutes)}
                    onChange={(e) => {
                      const pause = [...valore.extraBreaks]
                      pause[indice] = {
                        ...pausa,
                        startMinutes: orarioToMinuti(e.target.value) ?? 0,
                      }
                      aggiorna('extraBreaks', pause)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Fine</Label>
                  <Input
                    type="time"
                    value={minutiToOrario(pausa.endMinutes)}
                    onChange={(e) => {
                      const pause = [...valore.extraBreaks]
                      pause[indice] = {
                        ...pausa,
                        endMinutes: orarioToMinuti(e.target.value) ?? 0,
                      }
                      aggiorna('extraBreaks', pause)
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    aggiorna(
                      'extraBreaks',
                      valore.extraBreaks.filter((_, i) => i !== indice)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Arrotondamenti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="arr-entrata">Intervallo entrata (min)</Label>
                <Input
                  id="arr-entrata"
                  type="number"
                  min={1}
                  max={120}
                  value={valore.roundingMinutes}
                  onChange={(e) => aggiorna('roundingMinutes', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toll-entrata">Tolleranza entrata (min)</Label>
                <Input
                  id="toll-entrata"
                  type="number"
                  min={0}
                  max={120}
                  value={valore.roundingToleranceMinutes}
                  onChange={(e) =>
                    aggiorna('roundingToleranceMinutes', Number(e.target.value))
                  }
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Con intervallo 30 e tolleranza 5, chi entra alle 9:03 resta alle 9:03;
              chi entra alle 9:06 viene registrato alle 9:30.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="arr-uscita">Intervallo uscita (min)</Label>
                <Input
                  id="arr-uscita"
                  type="number"
                  min={1}
                  max={120}
                  value={valore.roundingOutMinutes ?? ''}
                  placeholder="Come entrata"
                  onChange={(e) =>
                    aggiorna(
                      'roundingOutMinutes',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="toll-uscita">Tolleranza uscita (min)</Label>
                <Input
                  id="toll-uscita"
                  type="number"
                  min={0}
                  max={120}
                  value={valore.roundingOutToleranceMinutes ?? ''}
                  placeholder="Come entrata"
                  onChange={(e) =>
                    aggiorna(
                      'roundingOutToleranceMinutes',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limiti e classificazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tetto">Ore giornaliere massime</Label>
                <Input
                  id="tetto"
                  type="number"
                  step="0.5"
                  min={1}
                  max={24}
                  value={
                    valore.maxDailyMinutes === null ? '' : valore.maxDailyMinutes / 60
                  }
                  placeholder="Nessun limite"
                  onChange={(e) =>
                    aggiorna(
                      'maxDailyMinutes',
                      e.target.value === ''
                        ? null
                        : Math.round(Number(e.target.value) * 60)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contratto">Ore settimanali da contratto</Label>
                <Input
                  id="contratto"
                  type="number"
                  step="0.5"
                  min={1}
                  max={80}
                  value={valore.contractWeeklyHours ?? ''}
                  placeholder="Non impostate"
                  onChange={(e) =>
                    aggiorna(
                      'contractWeeklyHours',
                      e.target.value === '' ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sabato">Sabato come straordinario</Label>
                <p className="text-sm text-muted-foreground">
                  Tutte le ore del sabato contano come straordinario
                </p>
              </div>
              <Switch
                id="sabato"
                checked={valore.saturdayAsOvertime}
                onCheckedChange={(v) => aggiorna('saturdayAsOvertime', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="domenica">Blocca timbrature la domenica</Label>
                <p className="text-sm text-muted-foreground">
                  Impedisce di timbrare nel giorno di riposo
                </p>
              </div>
              <Switch
                id="domenica"
                checked={valore.blockSunday}
                onCheckedChange={(v) => aggiorna('blockSunday', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="singola">Timbratura singola</Label>
                <p className="text-sm text-muted-foreground">
                  Si timbra solo l&apos;entrata e la giornata vale le ore previste
                </p>
              </div>
              <Switch
                id="singola"
                checked={valore.singlePunchMode}
                onCheckedChange={(v) => aggiorna('singlePunchMode', v)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onAnnulla} disabled={isSaving}>
            Annulla
          </Button>
          <Button onClick={onSalva} disabled={isSaving || !valore.name}>
            {isSaving ? 'Salvataggio…' : 'Salva regola'}
          </Button>
        </div>
      </div>

      {/* Calcolatore di prova */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Prova il calcolo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Inserisci un orario di esempio e vedi quante ore verrebbero
              riconosciute con questa regola.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prova-entrata">Entrata</Label>
                <Input
                  id="prova-entrata"
                  type="time"
                  value={provaEntrata}
                  onChange={(e) => setProvaEntrata(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prova-uscita">Uscita</Label>
                <Input
                  id="prova-uscita"
                  type="time"
                  value={provaUscita}
                  onChange={(e) => setProvaUscita(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prova-giorno">Giorno</Label>
              <Select
                value={provaGiorno}
                onValueChange={(v) => setProvaGiorno(v as GiornoProva)}
              >
                <SelectTrigger id="prova-giorno">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GIORNI_PROVA).map(([chiave, giorno]) => (
                    <SelectItem key={chiave} value={chiave}>
                      {giorno.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {provaGiorno === 'domenica' && valore.blockSunday && (
              <p className="text-sm text-amber-600">
                Con questa regola la domenica non si può timbrare: le ore qui
                sotto sono solo l&apos;ipotesi di come verrebbero contate.
              </p>
            )}

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => prova.mutate()}
              disabled={prova.isPending}
            >
              {prova.isPending ? 'Calcolo…' : 'Esegui la prova'}
            </Button>

            {risultato && (
              <div className="space-y-3 pt-2">
                <Separator />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Ore riconosciute</span>
                  <span className="text-2xl font-semibold">
                    {formatDurata(risultato.workedMinutes)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ordinarie</span>
                    <span>{formatDurata(risultato.ordinaryMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Straordinario</span>
                    <span>{formatDurata(risultato.overtimeMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Notturne</span>
                    <span>{formatDurata(risultato.nightMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Festive</span>
                    <span>{formatDurata(risultato.holidayMinutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pause</span>
                    <span>{formatDurata(risultato.breakMinutes)}</span>
                  </div>
                </div>

                {risultato.warnings.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {risultato.warnings.map((avviso) => (
                      <Badge key={avviso} variant="secondary" className="text-xs">
                        {ETICHETTE_AVVISI[avviso] ?? avviso}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Come ci si è arrivati
                  </p>
                  <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                    {risultato.steps.map((passaggio, indice) => (
                      <li key={indice}>{passaggio}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

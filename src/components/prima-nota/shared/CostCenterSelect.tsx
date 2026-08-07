'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CostCenterRule } from '@/hooks/useImputableAccounts'

/** Sentinel per l'opzione "Nessuno": Radix Select non ammette value="". */
const NESSUN_CENTRO = '__nessun_centro__'

export interface CostCenterOption {
  id: string
  code: string
  name: string
  isDefault: boolean
}

async function fetchCostCenters(): Promise<CostCenterOption[]> {
  const res = await fetch('/api/cost-centers')
  if (!res.ok) throw new Error('Errore nel caricamento dei centri di costo')
  const json = await res.json()
  return json.costCenters as CostCenterOption[]
}

/**
 * Query condivisa dei centri di costo attivi: stessa chiave (['cost-centers'])
 * per ogni punto che la usa, nessuna fetch duplicata sulla stessa pagina.
 */
export function useCostCenters() {
  return useQuery({
    queryKey: ['cost-centers'],
    queryFn: fetchCostCenters,
    staleTime: 60 * 1000,
  })
}

export interface CostCenterFieldState {
  value: string | undefined
  hint: string | undefined
}

/**
 * Decide il valore da proporre nel select del centro di costo data la regola
 * del conto selezionato, senza mai sovrascrivere una scelta manuale
 * dell'utente (`hasManualSelection`): l'auto-assegnazione del centro di
 * default (regola DEFAULT_STR) vale solo finché il campo non è stato
 * toccato, anche se nel frattempo il conto — e quindi la regola — cambia di
 * nuovo. Una volta che l'utente ha scelto, la sua scelta vince sempre.
 *
 * Non decide l'obbligatorietà: quella dipende solo da `rule === 'OBBLIGATORIO'`
 * e resta a carico del chiamante (serve al submit e al `*` sulla label).
 */
export function resolveCostCenterField(params: {
  rule: CostCenterRule | undefined
  currentValue: string | undefined
  hasManualSelection: boolean
  costCenters: CostCenterOption[]
}): CostCenterFieldState {
  if (params.hasManualSelection || params.rule !== 'DEFAULT_STR') {
    return { value: params.currentValue, hint: undefined }
  }

  const defaultCenter = params.costCenters.find((c) => c.isDefault)
  if (!defaultCenter) {
    // Configurazione incompleta (nessun centro di default attivo): non è
    // compito di questa funzione segnalarlo, si limita a non inventare nulla.
    return { value: params.currentValue, hint: undefined }
  }

  return {
    value: defaultCenter.id,
    hint: `Assegnato automaticamente: ${defaultCenter.code} — ${defaultCenter.name}. Puoi cambiarlo.`,
  }
}

interface CostCenterSelectListProps {
  costCenters: CostCenterOption[]
  isLoading?: boolean
  value?: string
  onChange: (costCenterId: string | undefined) => void
  required?: boolean
  disabled?: boolean
  hint?: string
  placeholder?: string
}

/**
 * Corpo del select (stesse opzioni/sentinella "Nessuno"), a prescindere da
 * come è stato ottenuto l'elenco dei centri. Usato sia da `CostCenterSelect`
 * (fetch interno via react-query) sia direttamente da chi possiede già i
 * centri come prop — es. la chiusura di cassa (Task 14), che li riceve via
 * SSR insieme a conti e personale: quel form non deve introdurre una fetch
 * di rete nel percorso del centro di costo, perché è un campo obbligatorio e
 * la PWA deve restare compilabile offline (le route `/api/*` sono
 * NetworkOnly nel service worker, vedi `src/app/sw.ts`).
 */
export function CostCenterSelectList({
  costCenters,
  isLoading = false,
  value,
  onChange,
  required = false,
  disabled = false,
  hint,
  placeholder,
}: CostCenterSelectListProps) {
  const handleValueChange = (v: string) => {
    onChange(v === NESSUN_CENTRO ? undefined : v)
  }

  return (
    <div className="space-y-1">
      <Select value={value ?? ''} onValueChange={handleValueChange} disabled={disabled || isLoading}>
        <SelectTrigger aria-required={required}>
          <SelectValue
            placeholder={isLoading ? 'Caricamento centri...' : placeholder ?? 'Seleziona centro di costo'}
          />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value={NESSUN_CENTRO}>Nessuno</SelectItem>}
          {costCenters.map((cc) => (
            <SelectItem key={cc.id} value={cc.id}>
              <span className="font-medium">{cc.code}</span>
              <span className="ml-2 text-muted-foreground">{cc.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface CostCenterSelectProps {
  value?: string
  onChange: (costCenterId: string | undefined) => void
  required?: boolean
  disabled?: boolean
  hint?: string
}

/**
 * Select shadcn dei centri di costo attivi (`CODICE — Nome`), recuperati da
 * sé (react-query, `/api/cost-centers`). Componente "dumb": la logica di
 * preselezione/obbligatorietà (Task 13) vive fuori, in `resolveCostCenterField`
 * e nel form chiamante, che passa `value`/`hint` già decisi in base alla
 * regola del conto selezionato.
 *
 * Quando il campo non è `required` compare "Nessuno": sceglierlo equivale a
 * non inviare un centro esplicito e lasciare che il server applichi il
 * proprio default — una scelta cosciente dell'utente, non un default
 * invisibile (il valore precedente, se c'era, era comunque visibile prima).
 */
export function CostCenterSelect({
  value,
  onChange,
  required = false,
  disabled = false,
  hint,
}: CostCenterSelectProps) {
  const { data: costCenters = [], isLoading } = useCostCenters()

  return (
    <CostCenterSelectList
      costCenters={costCenters}
      isLoading={isLoading}
      value={value}
      onChange={onChange}
      required={required}
      disabled={disabled}
      hint={hint}
    />
  )
}

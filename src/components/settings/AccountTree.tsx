'use client'

import * as React from 'react'
import { ChevronRight, ChevronDown, Pencil, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { buildAccountTree, type AccountHierarchyFields } from '@/lib/accounts/build-account-tree'

const SENZA_MASTRO_LABEL = 'Altri conti'
const SENZA_MASTRO_KEY = '__senza_mastro__'
const SENZA_GRUPPO_KEY = '__senza_gruppo__'

export interface AccountTreeAccount extends AccountHierarchyFields {
  id: string
  code: string
  name: string
  costCenterRule: 'OBBLIGATORIO' | 'DEFAULT_STR'
  isActive: boolean
  _count?: {
    expenses: number
    journalEntries: number
  }
}

interface AccountTreeProps {
  accounts: AccountTreeAccount[]
  /** Ricerca attiva: la lista è già filtrata sui match, quindi ogni ramo viene mostrato espanso. */
  searchActive?: boolean
  onEdit: (account: AccountTreeAccount) => void
  onDelete: (account: AccountTreeAccount) => void
  emptyMessage: string
}

function CostCenterRuleBadge({ rule }: { rule: 'OBBLIGATORIO' | 'DEFAULT_STR' }) {
  if (rule === 'OBBLIGATORIO') {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">CdC obbligatorio</Badge>
  }
  return <Badge variant="secondary">Default STR</Badge>
}

/**
 * Righe indentate mastro → gruppo → voce, con espandi/comprimi (default:
 * tutto chiuso, tranne durante una ricerca attiva). Il gruppo sintetico
 * (voci senza gruppo, la maggior parte dei mastri del piano) non riceve una
 * riga propria: le sue voci compaiono direttamente sotto il mastro, un
 * livello di indentazione più in alto rispetto a quelle di un gruppo reale.
 */
export function AccountTree({ accounts, searchActive = false, onEdit, onDelete, emptyMessage }: AccountTreeProps) {
  const [expandedMastri, setExpandedMastri] = React.useState<Set<string>>(new Set())
  const [expandedGruppi, setExpandedGruppi] = React.useState<Set<string>>(new Set())

  const tree = React.useMemo(() => buildAccountTree(accounts), [accounts])

  if (tree.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
  }

  const toggleMastro = (key: string) => {
    setExpandedMastri((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGruppo = (key: string) => {
    setExpandedGruppi((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-1">
      {tree.map((mastro) => {
        const mastroKey = mastro.mastroCode ?? SENZA_MASTRO_KEY
        const isMastroExpanded = searchActive || expandedMastri.has(mastroKey)
        const vociCount = mastro.gruppi.reduce((s, g) => s + g.voci.length, 0)

        return (
          <div key={mastroKey}>
            <button
              type="button"
              onClick={() => toggleMastro(mastroKey)}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted transition-colors"
            >
              {isMastroExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="font-mono text-xs text-muted-foreground">{mastro.mastroCode ?? '—'}</span>
              <span className="font-semibold">{mastro.mastroNome ?? SENZA_MASTRO_LABEL}</span>
              <span className="text-xs text-muted-foreground">({vociCount})</span>
            </button>

            {isMastroExpanded &&
              mastro.gruppi.map((gruppo) => {
                const gruppoKey = `${mastroKey}::${gruppo.gruppoCode ?? SENZA_GRUPPO_KEY}`

                // Gruppo sintetico (mastro non articolato in gruppi, o voce
                // senza gruppo): niente riga intermedia, le voci scendono di
                // un solo livello rispetto al mastro.
                if (gruppo.gruppoCode === null) {
                  return (
                    <div key={gruppoKey} className="pl-6">
                      {gruppo.voci.map((voce) => (
                        <VoceRow key={voce.id} voce={voce} onEdit={onEdit} onDelete={onDelete} />
                      ))}
                    </div>
                  )
                }

                const isGruppoExpanded = searchActive || expandedGruppi.has(gruppoKey)
                return (
                  <div key={gruppoKey} className="pl-6">
                    <button
                      type="button"
                      onClick={() => toggleGruppo(gruppoKey)}
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted transition-colors"
                    >
                      {isGruppoExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-mono text-xs text-muted-foreground">{gruppo.gruppoCode}</span>
                      <span className="text-sm font-medium">{gruppo.gruppoNome}</span>
                      <span className="text-xs text-muted-foreground">({gruppo.voci.length})</span>
                    </button>
                    {isGruppoExpanded && (
                      <div className="pl-6">
                        {gruppo.voci.map((voce) => (
                          <VoceRow key={voce.id} voce={voce} onEdit={onEdit} onDelete={onDelete} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}

function VoceRow({
  voce,
  onEdit,
  onDelete,
}: {
  voce: AccountTreeAccount
  onEdit: (account: AccountTreeAccount) => void
  onDelete: (account: AccountTreeAccount) => void
}) {
  const movimenti = (voce._count?.expenses ?? 0) + (voce._count?.journalEntries ?? 0)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg p-2 pl-8 hover:bg-muted/50 transition-colors',
        !voce.isActive && 'opacity-60'
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant="outline" className="font-mono text-xs shrink-0">
          {voce.code}
        </Badge>
        <span className="font-medium truncate">{voce.name}</span>
        <CostCenterRuleBadge rule={voce.costCenterRule} />
        {!voce.isActive && <Badge variant="secondary">Inattivo</Badge>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {movimenti > 0 && <span className="text-xs text-muted-foreground">{movimenti} movimenti</span>}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(voce)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(voce)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

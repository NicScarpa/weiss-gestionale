'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Loader2, Search, TrendingUp, TrendingDown, Wallet, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
import { AccountTree } from './AccountTree'
import { erroreCoerenzaGerarchia } from '@/lib/accounts/validate-account-hierarchy'

type AccountType = 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO'
type CostCenterRule = 'OBBLIGATORIO' | 'DEFAULT_STR'

/** Sentinel per il gruppo "Nessuno": Radix Select non ammette value="". */
const NESSUN_GRUPPO = '__nessun_gruppo__'

interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  /** Campo libero ereditato dal vecchio impianto, senza uso in logica (vedi report Task 18). Sparito dal form, mostrato se già valorizzato. */
  category: string | null
  parentId: string | null
  parent: {
    id: string
    code: string
    name: string
  } | null
  // Gerarchia del piano v4 (mastro/gruppo), null sui conti patrimoniali e legacy.
  mastroCode: string | null
  mastroNome: string | null
  gruppoCode: string | null
  gruppoNome: string | null
  costCenterRule: CostCenterRule
  isActive: boolean
  _count: {
    expenses: number
    journalEntries: number
  }
}

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'RICAVO', label: 'Ricavi', icon: TrendingUp },
  { value: 'COSTO', label: 'Costi', icon: TrendingDown },
  { value: 'ATTIVO', label: 'Attivita', icon: Wallet },
  { value: 'PASSIVO', label: 'Passivita', icon: CreditCard },
]

/** Tab con l'albero mastro → gruppo → voce: solo i tipi coperti dal piano v4. Attivo/Passivo restano liste piatte. */
const TIPI_AD_ALBERO = new Set<AccountType>(['RICAVO', 'COSTO'])

const initialFormData = {
  code: '',
  name: '',
  type: 'COSTO' as AccountType,
  mastroCode: '',
  gruppoCode: '',
  costCenterRule: 'DEFAULT_STR' as CostCenterRule,
  isActive: true,
}

interface OpzioneGerarchia {
  code: string
  nome: string
}

/** Confronto codici numeric-aware: "9" prima di "10", a differenza di localeCompare puro su stringhe di lunghezza diversa. */
function confrontaCodici(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Mastri distinti (code+nome) tra i conti già caricati, per il tipo dato —
 * il "SELECT DISTINCT dei dati" richiesto dal brief del Task 18: la select
 * del form propone solo mastri già usati da almeno un conto, mai testo
 * libero, per non introdurre varianti del nome che spaccherebbero il
 * raggruppamento dell'albero e dei report (mastroNome è denormalizzato per
 * conto, non una tabella a parte).
 *
 * Esportata per essere testata come funzione pura (il progetto non ha
 * un'infrastruttura funzionante per il rendering dei componenti React, vedi
 * il report del Task 11).
 */
export function getMastroOptions(accounts: Account[], type: AccountType): OpzioneGerarchia[] {
  const map = new Map<string, string>()
  for (const account of accounts) {
    if (account.type === type && account.mastroCode) {
      map.set(account.mastroCode, account.mastroNome ?? account.mastroCode)
    }
  }
  return Array.from(map, ([code, nome]) => ({ code, nome })).sort((a, b) => confrontaCodici(a.code, b.code))
}

/** Come getMastroOptions, ma per i gruppi di un singolo mastro (select dipendente, si svuota se il mastro cambia). */
export function getGruppoOptions(accounts: Account[], mastroCode: string): OpzioneGerarchia[] {
  const map = new Map<string, string>()
  for (const account of accounts) {
    if (account.mastroCode === mastroCode && account.gruppoCode) {
      map.set(account.gruppoCode, account.gruppoNome ?? account.gruppoCode)
    }
  }
  return Array.from(map, ([code, nome]) => ({ code, nome })).sort((a, b) => confrontaCodici(a.code, b.code))
}

export function AccountManagement() {
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<AccountType>('COSTO')
  const [formData, setFormData] = useState(initialFormData)

  // Carica lista conti
  const {
    data: datiConti,
    isFetching: loading,
    error: erroreConti,
    refetch: fetchAccounts,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    // staleTime: 0 serve al cambio di `showInactive`, dove il refetch passa
    // dalla staleness e con i 60s globali si tornerebbe su dati vecchi.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['accounts', 'full', showInactive],
    queryFn: async (): Promise<{ accounts?: Account[] }> => {
      const res = await fetch(`/api/accounts?full=true&includeInactive=${showInactive}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
  })

  const accounts = datiConti?.accounts || []

  useEffect(() => {
    if (erroreConti) {
      logger.error('Errore', erroreConti)
      toast.error('Errore nel caricamento dei conti')
    }
  }, [erroreConti])

  const isTipoEconomico = formData.type === 'RICAVO' || formData.type === 'COSTO'
  const mastroOptions = useMemo(() => getMastroOptions(accounts, formData.type), [accounts, formData.type])
  const gruppoOptions = useMemo(
    () => (formData.mastroCode ? getGruppoOptions(accounts, formData.mastroCode) : []),
    [accounts, formData.mastroCode]
  )

  // Filtra conti per tipo e ricerca
  const filteredAccounts = accounts.filter(
    (a) =>
      a.type === activeTab &&
      (a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  const searchActive = searchQuery.trim().length > 0

  // Conta per tipo
  const countByType = (type: AccountType) =>
    accounts.filter((a) => a.type === type).length

  // Apri dialog per nuovo conto
  const handleNew = () => {
    setEditingAccount(null)
    setFormData({ ...initialFormData, type: activeTab })
    setIsDialogOpen(true)
  }

  // Apri dialog modifica
  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setFormData({
      code: account.code,
      name: account.name,
      type: account.type,
      mastroCode: account.mastroCode || '',
      gruppoCode: account.gruppoCode || '',
      costCenterRule: account.costCenterRule,
      isActive: account.isActive,
    })
    setIsDialogOpen(true)
  }

  // Conferma eliminazione
  const handleDeleteConfirm = (account: Account) => {
    setAccountToDelete(account)
    setIsDeleteDialogOpen(true)
  }

  // Salva conto
  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Codice e nome sono obbligatori')
      return
    }

    if (isTipoEconomico && !formData.mastroCode) {
      toast.error('Il mastro è obbligatorio per i conti di ricavo e di costo')
      return
    }

    const codeFinale = formData.code.trim()
    // Solo i conti economici (RICAVO/COSTO) appartengono al piano v4: un
    // conto patrimoniale ha sempre mastro/gruppo nulli, anche se erano
    // valorizzati prima che il tipo venisse cambiato nel form.
    const mastroCodeFinale = isTipoEconomico ? formData.mastroCode : null
    const gruppoCodeFinale = isTipoEconomico ? formData.gruppoCode || null : null

    // Specchio client della stessa validazione applicata dal server: qui
    // l'utente vede l'errore prima di inviare, ma è il server (raggiungibile
    // anche fuori da questo form) a restare l'unica difesa vera.
    const erroreGerarchia = erroreCoerenzaGerarchia({
      code: codeFinale,
      mastroCode: mastroCodeFinale,
      gruppoCode: gruppoCodeFinale,
    })
    if (erroreGerarchia) {
      toast.error(erroreGerarchia)
      return
    }

    try {
      setSaving(true)

      const mastro = mastroOptions.find((m) => m.code === formData.mastroCode)
      const gruppo = gruppoOptions.find((g) => g.code === formData.gruppoCode)

      const payload = {
        ...(editingAccount && { id: editingAccount.id }),
        code: codeFinale,
        name: formData.name.trim(),
        type: formData.type,
        isActive: formData.isActive,
        mastroCode: mastroCodeFinale,
        mastroNome: isTipoEconomico ? mastro?.nome ?? null : null,
        gruppoCode: gruppoCodeFinale,
        gruppoNome: isTipoEconomico ? gruppo?.nome ?? null : null,
        costCenterRule: formData.costCenterRule,
      }

      const res = await fetch('/api/accounts', {
        method: editingAccount ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nel salvataggio')
      }

      toast.success(editingAccount ? 'Conto aggiornato' : 'Conto creato')
      setIsDialogOpen(false)
      setEditingAccount(null)
      fetchAccounts()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  // Elimina conto
  const handleDelete = async () => {
    if (!accountToDelete) return

    try {
      setSaving(true)
      const res = await fetch(`/api/accounts?id=${accountToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nell\'eliminazione')
      }

      const result = await res.json()
      toast.success(result.message)
      setIsDeleteDialogOpen(false)
      setAccountToDelete(null)
      fetchAccounts()
    } catch (error: unknown) {
      logger.error('Errore', error)
      toast.error(error instanceof Error ? error.message : 'Errore nell\'eliminazione')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controlli */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
          <div className="relative min-w-0 flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca conto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive-accounts"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-accounts" className="text-sm">
              Mostra inattivi
            </Label>
          </div>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Conto
        </Button>
      </div>

      {/* Tabs per tipo */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountType)}>
        {/* Quattro colonne uguali in un telefono danno 70 px a testa e le
            etichette si sovrappongono: sotto sm la striscia scorre */}
        <TabsList className="flex w-full sm:grid sm:grid-cols-4">
          {ACCOUNT_TYPES.map((type) => {
            const Icon = type.icon
            return (
              <TabsTrigger key={type.value} value={type.value} className="gap-2">
                <Icon className="h-4 w-4" />
                {type.label} ({countByType(type.value)})
              </TabsTrigger>
            )
          })}
        </TabsList>

        {ACCOUNT_TYPES.map((type) => (
          <TabsContent key={type.value} value={type.value}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <type.icon className="h-5 w-5" />
                  {type.label} ({filteredAccounts.length})
                </CardTitle>
                <CardDescription>
                  {type.value === 'RICAVO' && 'Conti per ricavi e vendite'}
                  {type.value === 'COSTO' && 'Conti per costi e spese'}
                  {type.value === 'ATTIVO' && 'Conti patrimoniali attivi'}
                  {type.value === 'PASSIVO' && 'Conti patrimoniali passivi'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {TIPI_AD_ALBERO.has(type.value) ? (
                  <AccountTree
                    accounts={filteredAccounts}
                    searchActive={searchActive}
                    onEdit={handleEdit}
                    onDelete={handleDeleteConfirm}
                    emptyMessage={
                      searchQuery
                        ? 'Nessun conto trovato'
                        : `Nessun conto di tipo ${type.label.toLowerCase()} configurato`
                    }
                  />
                ) : filteredAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {searchQuery
                      ? 'Nessun conto trovato'
                      : `Nessun conto di tipo ${type.label.toLowerCase()} configurato`}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {account.code}
                            </Badge>
                            <span className="font-medium">{account.name}</span>
                            {!account.isActive && (
                              <Badge variant="secondary">Inattivo</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {account.category && (
                              <span>Categoria: {account.category}</span>
                            )}
                            {account.parent && (
                              <span>
                                Padre: {account.parent.code} - {account.parent.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">
                            {account._count.journalEntries > 0 && (
                              <span>{account._count.journalEntries} movimenti</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteConfirm(account)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog Crea/Modifica */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Modifica Conto' : 'Nuovo Conto'}
            </DialogTitle>
            <DialogDescription>
              {editingAccount
                ? 'Modifica le informazioni del conto'
                : 'Inserisci i dati del nuovo conto'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Codice e Nome */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account-code">Codice *</Label>
                <Input
                  id="account-code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder="es. 20.1.06"
                  className="font-mono"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="account-name">Nome *</Label>
                <Input
                  id="account-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="es. Acquisti Merce"
                />
              </div>
            </div>

            {/* Tipo */}
            <div className="space-y-2">
              <Label htmlFor="account-type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: AccountType) =>
                  setFormData({ ...formData, type: value, mastroCode: '', gruppoCode: '' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mastro e Gruppo: solo per i conti del piano v4 (RICAVO/COSTO) */}
            {isTipoEconomico && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="account-mastro">Mastro *</Label>
                  <Select
                    value={formData.mastroCode}
                    onValueChange={(value) =>
                      setFormData({ ...formData, mastroCode: value, gruppoCode: '' })
                    }
                  >
                    <SelectTrigger id="account-mastro">
                      <SelectValue placeholder="Seleziona mastro" />
                    </SelectTrigger>
                    <SelectContent>
                      {mastroOptions.map((m) => (
                        <SelectItem key={m.code} value={m.code}>
                          {m.code} - {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account-gruppo">Gruppo</Label>
                  <Select
                    value={formData.gruppoCode || NESSUN_GRUPPO}
                    onValueChange={(value) =>
                      setFormData({ ...formData, gruppoCode: value === NESSUN_GRUPPO ? '' : value })
                    }
                    disabled={!formData.mastroCode || gruppoOptions.length === 0}
                  >
                    <SelectTrigger id="account-gruppo">
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NESSUN_GRUPPO}>Nessuno</SelectItem>
                      {gruppoOptions.map((g) => (
                        <SelectItem key={g.code} value={g.code}>
                          {g.code} - {g.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.mastroCode && gruppoOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Questo mastro non è articolato in gruppi
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Regola centro di costo */}
            <div className="space-y-2">
              <Label htmlFor="account-cost-center-rule">Regola centro di costo</Label>
              <Select
                value={formData.costCenterRule}
                onValueChange={(value: CostCenterRule) =>
                  setFormData({ ...formData, costCenterRule: value })
                }
              >
                <SelectTrigger id="account-cost-center-rule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OBBLIGATORIO">CdC obbligatorio</SelectItem>
                  <SelectItem value="DEFAULT_STR">Default STR</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                &quot;CdC obbligatorio&quot; blocca la registrazione senza centro di costo; &quot;Default STR&quot;
                lo assegna automaticamente a Struttura/Amministrazione se non indicato
              </p>
            </div>

            {/* Stato Attivo */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Stato</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.isActive ? 'Attivo' : 'Inattivo'}
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                'Salva'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Conferma Eliminazione */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Conto</AlertDialogTitle>
            <AlertDialogDescription>
              {accountToDelete?._count.journalEntries &&
              accountToDelete._count.journalEntries > 0 ? (
                <>
                  Il conto <strong>{accountToDelete?.code} - {accountToDelete?.name}</strong> ha{' '}
                  {accountToDelete?._count.journalEntries} movimenti associati.
                  Verra disattivato invece che eliminato.
                </>
              ) : (
                <>
                  Sei sicuro di voler eliminare il conto{' '}
                  <strong>{accountToDelete?.code} - {accountToDelete?.name}</strong>?
                  Questa azione non puo essere annullata.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione...
                </>
              ) : accountToDelete?._count.journalEntries &&
                accountToDelete._count.journalEntries > 0 ? (
                'Disattiva'
              ) : (
                'Elimina'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

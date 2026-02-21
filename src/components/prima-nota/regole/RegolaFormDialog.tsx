'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, X } from 'lucide-react'
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
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  type RuleDirection,
  type CategorizationRuleFormData,
} from '@/types/prima-nota'

const REGOLA_SCHEMA = z.object({
  name: z.string().min(1, { message: 'Il nome è obbligatorio' }),
  direction: z.enum(['INFLOW', 'OUTFLOW']),
  keywords: z.array(z.string()).min(1, { message: 'Almeno una keyword è richiesta' }),
  priority: z.number().min(1).max(10),
  isActive: z.boolean(),
  budgetCategoryId: z.string().optional(),
  accountId: z.string().optional(),
  autoVerify: z.boolean(),
  autoHide: z.boolean(),
})

type RegolaFormData = z.infer<typeof REGOLA_SCHEMA>

interface RegolaFormDialogProps {
  rule?: CategorizationRuleFormData
  accounts?: Array<{ id: string; code: string; name: string }>
  budgetCategories?: Array<{ id: string; code: string; name: string; color?: string }>
  onSave: (data: RegolaFormData) => void | Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isSubmitting?: boolean
  defaultDirection?: RuleDirection
}

export function RegolaFormDialog({
  rule,
  accounts = [],
  budgetCategories = [],
  onSave,
  open = true,
  onOpenChange,
  isSubmitting = false,
  defaultDirection,
}: RegolaFormDialogProps) {
  const form = useForm<RegolaFormData>({
    resolver: zodResolver(REGOLA_SCHEMA),
    defaultValues: rule ? {
      name: rule.name,
      direction: rule.direction,
      keywords: rule.keywords || [],
      priority: rule.priority,
      isActive: rule.isActive,
      budgetCategoryId: rule.budgetCategoryId,
      accountId: rule.accountId,
      autoVerify: rule.autoVerify,
      autoHide: rule.autoHide,
    } : {
      name: '',
      direction: defaultDirection || 'INFLOW' as RuleDirection,
      keywords: [],
      priority: 5,
      isActive: true,
      autoVerify: false,
      autoHide: false,
    },
  })

  const keywords = form.watch('keywords')
  const [keywordInput, setKeywordInput] = React.useState('')
  const _direction = form.watch('direction')

  const addKeyword = () => {
    if (keywordInput.trim()) {
      const newKeywords = [...(keywords || []), keywordInput.trim()]
      if (newKeywords.length <= 10) {
        form.setValue('keywords', newKeywords)
        setKeywordInput('')
      }
    }
  }

  const removeKeyword = (index: number) => {
    const currentKeywords = form.getValues('keywords') as string[]
    const newKeywords = currentKeywords.filter((_, i) => i !== index)
    form.setValue('keywords', newKeywords)
  }

  const onSubmit = async (data: RegolaFormData) => {
    try {
      await onSave(data)
      form.reset()
      setKeywordInput('')
    } catch (error) {
      console.error('Errore salvataggio regola:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule ? 'Modifica Regola' : 'Nuova Regola'}
          </DialogTitle>
          <DialogDescription>
            {rule
              ? 'Modifica i criteri di categorizzazione automatica.'
              : 'Crea una nuova regola per categorizzare automaticamente i movimenti.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4 py-4">
            {/* Nome */}
            <FormField
              control={form.control}
              name="name"
              render={({ field: _field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Nome *</FormLabel>
                  <Input
                    placeholder="Nome regola..."
                    {...form.register('name')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Direzione */}
            <FormField
              control={form.control}
              name="direction"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Direzione</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona direzione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INFLOW">
                        <span className="flex items-center gap-2">
                          <span className="text-green-600">⬇️</span>
                          Entrata (incasso)
                        </span>
                      </SelectItem>
                      <SelectItem value="OUTFLOW">
                        <span className="flex items-center gap-2">
                          <span className="text-red-600">⬇️</span>
                          Uscita (spesa)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Keywords */}
            <FormField
              control={form.control}
              name="keywords"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Keywords</FormLabel>
                  <div className="space-y-2">
                    {field.value?.map((keyword, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md"
                      >
                        <span className="font-medium">{keyword}</span>
                        <button
                          type="button"
                          onClick={() => removeKeyword(idx)}
                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add keyword input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Aggiungi keyword..."
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && keywordInput.trim()) {
                          e.preventDefault()
                          addKeyword()
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={addKeyword}
                      disabled={(field.value?.length || 0) >= 10}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Hidden keywords list for form */}
                  {field.value?.map((keyword, idx) => (
                    <input
                      key={idx}
                      type="hidden"
                      {...form.register(`keywords.${idx}`)}
                      value={keyword}
                    />
                  ))}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priorità */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Priorità</FormLabel>
                  <div className="flex items-center gap-4">
                    <Slider
                      min={1}
                      max={10}
                      step={1}
                      value={[field.value ?? 5]}
                      onValueChange={(vals) => field.onChange(vals[0])}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground w-8 text-center">
                      {field.value ?? 5}
                    </span>
                  </div>
                  <FormDescription>
                    Le regole con priorità più alta vengono applicate per prime.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conto */}
            {accounts.length > 0 && (
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Conto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tutti i conti" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <span className="font-medium">{account.code}</span>
                            <span className="ml-2 text-muted-foreground">{account.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Categoria Budget */}
            {budgetCategories.length > 0 && (
              <FormField
                control={form.control}
                name="budgetCategoryId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Categoria Budget</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Nessuna categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              {category.color && (
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: category.color }}
                                />
                              )}
                              <span className="font-medium">{category.code}</span>
                              <span className="ml-2 text-muted-foreground">{category.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Switch per opzioni automatiche */}
            <div className="space-y-4 pt-4 border-t">
              <div className="text-sm font-medium mb-4">Opzioni Automatiche</div>

              <FormField
                control={form.control}
                name="autoVerify"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div className="space-y-1">
                      <FormLabel>Verifica Automatica</FormLabel>
                      <FormDescription>
                        Applica automaticamente lo stato &quot;Verificato&quot; ai movimenti che matchano.
                      </FormDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="autoHide"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div className="space-y-1">
                      <FormLabel>Nascondi Automaticamente</FormLabel>
                      <FormDescription>
                        Nasconde automaticamente i movimenti che matchano (es. duplicati).
                      </FormDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Salvataggio...' : rule ? 'Aggiorna' : 'Salva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

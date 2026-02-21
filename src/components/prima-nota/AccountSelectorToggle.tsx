'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Wallet, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AccountSelectorToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentRegister = searchParams.get('register') as 'CASH' | 'BANK' | null

  const handleToggle = (value: 'CASH' | 'BANK') => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('register', value)
    router.push(`?${newSearchParams.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={currentRegister === 'CASH' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleToggle('CASH')}
        className={cn(
          'flex-1 gap-2',
          currentRegister === 'CASH' && 'border-primary bg-primary/5'
        )}
      >
        <Wallet className="h-4 w-4 text-green-600" />
        <span className="text-sm">Cassa Contanti</span>
      </Button>
      <Button
        variant={currentRegister === 'BANK' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleToggle('BANK')}
        className={cn(
          'flex-1 gap-2',
          currentRegister === 'BANK' && 'border-primary bg-primary/5'
        )}
      >
        <Building2 className="h-4 w-4 text-blue-600" />
        <span className="text-sm">Conto Bancario</span>
      </Button>
    </div>
  )
}

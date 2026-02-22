'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ProfileTab } from './tabs/ProfileTab'
import { AttendanceTab } from './tabs/AttendanceTab'
import { LeaveTab } from './tabs/LeaveTab'
import { StatisticsTab } from './tabs/StatisticsTab'
import { ContractTab } from './tabs/ContractTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { ScheduleTab } from './tabs/ScheduleTab'
import { SettingsTab } from './tabs/SettingsTab'

const TABS = [
  { id: 'profilo', label: 'Profilo' },
  { id: 'timbrature', label: 'Timbrature' },
  { id: 'ferie', label: 'Ferie e Permessi' },
  { id: 'statistiche', label: 'Statistiche' },
  { id: 'contratto', label: 'Contratto' },
  { id: 'documenti', label: 'Documenti' },
  { id: 'orari', label: 'Orari' },
  { id: 'impostazioni', label: 'Impostazioni' },
] as const

type TabId = typeof TABS[number]['id']

interface EmployeeDetailTabsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any  // StaffMember data from API
  isAdmin: boolean
  userRole: string
  userId: string
  roles: Array<{ id: string; name: string }>
}

export function EmployeeDetailTabs({ employee, isAdmin, userRole, userId, roles }: EmployeeDetailTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const activeTab = (searchParams.get('tab') as TabId) || 'profilo'

  const setActiveTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'profilo' && (
          <ProfileTab key={employee.id} employee={employee} isAdmin={isAdmin} roles={roles} />
        )}
        {activeTab === 'timbrature' && (
          <AttendanceTab userId={userId} isAdmin={isAdmin} />
        )}
        {activeTab === 'ferie' && (
          <LeaveTab userId={userId} isAdmin={isAdmin} />
        )}
        {activeTab === 'statistiche' && (
          <StatisticsTab userId={userId} />
        )}
        {activeTab === 'contratto' && (
          <ContractTab key={employee.id} employee={employee} isAdmin={isAdmin} userId={userId} userRole={userRole} />
        )}
        {activeTab === 'documenti' && (
          <DocumentsTab userId={userId} isAdmin={isAdmin} />
        )}
        {activeTab === 'orari' && (
          <ScheduleTab userId={userId} />
        )}
        {activeTab === 'impostazioni' && (
          <SettingsTab key={employee.id} employee={employee} isAdmin={isAdmin} userId={userId} userRole={userRole} />
        )}
      </div>
    </div>
  )
}

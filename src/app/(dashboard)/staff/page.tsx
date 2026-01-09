'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Users,
  Search,
  Settings,
  UserPlus,
  Filter,
} from 'lucide-react'

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string | null
  isFixedStaff: boolean
  hourlyRate: number | null
  defaultShift: 'MORNING' | 'EVENING' | null
  isActive: boolean
  contractType: 'TEMPO_DETERMINATO' | 'TEMPO_INDETERMINATO' | 'LAVORO_INTERMITTENTE' | 'LAVORATORE_OCCASIONALE' | 'LIBERO_PROFESSIONISTA' | null
  venue?: {
    id: string
    name: string
    code: string
  }
  role?: {
    id: string
    name: string
  }
}

export default function StaffPage() {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [filterVenue, setFilterVenue] = useState<string>('all')
  const [filterContract, setFilterContract] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch('/api/staff')
      if (!res.ok) throw new Error('Errore nel caricamento staff')
      return res.json()
    },
  })

  const { data: venuesData } = useQuery({
    queryKey: ['venues'],
    queryFn: async () => {
      const res = await fetch('/api/venues')
      if (!res.ok) throw new Error('Errore nel caricamento sedi')
      return res.json()
    },
  })

  const staffList: StaffMember[] = staffData?.data || []
  const venues = venuesData?.venues || []

  // Filtra staff
  const filteredStaff = staffList.filter(staff => {
    // Filtro ricerca
    const searchLower = search.toLowerCase()
    const matchesSearch =
      !search ||
      staff.firstName.toLowerCase().includes(searchLower) ||
      staff.lastName.toLowerCase().includes(searchLower) ||
      staff.email.toLowerCase().includes(searchLower)

    // Filtro attivo/inattivo
    // Di default mostra solo attivi, se showInactive è true mostra solo inattivi
    const matchesActive = showInactive ? !staff.isActive : staff.isActive

    // Filtro sede
    const matchesVenue = filterVenue === 'all' || staff.venue?.id === filterVenue

    // Filtro contratto
    const matchesContract = filterContract === 'all' || staff.contractType === filterContract

    return matchesSearch && matchesActive && matchesVenue && matchesContract
  })

  // Paginazione
  const totalPages = Math.ceil(filteredStaff.length / pageSize)
  const paginatedStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize)

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const getContractBadge = (type: string | null) => {
    switch (type) {
      case 'TEMPO_DETERMINATO':
        return <Badge variant="default">T. Determinato</Badge>
      case 'TEMPO_INDETERMINATO':
        return <Badge className="bg-green-100 text-green-700">T. Indeterminato</Badge>
      case 'LAVORO_INTERMITTENTE':
        return <Badge variant="secondary">Intermittente</Badge>
      case 'LAVORATORE_OCCASIONALE':
        return <Badge variant="outline">Occasionale</Badge>
      case 'LIBERO_PROFESSIONISTA':
        return <Badge className="bg-blue-100 text-blue-700">Libero Prof.</Badge>
      default:
        return <Badge variant="outline">N/D</Badge>
    }
  }

  const getShiftBadge = (shift: string | null) => {
    switch (shift) {
      case 'MORNING':
        return <Badge className="bg-amber-100 text-amber-700">Mattina</Badge>
      case 'EVENING':
        return <Badge className="bg-purple-100 text-purple-700">Sera</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gestione Personale
          </h1>
          <p className="text-muted-foreground">
            Gestisci dipendenti, vincoli e pianificazione turni
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/vincoli-relazionali">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Vincoli Relazionali
            </Button>
          </Link>
          <Link href="/staff/nuovo">
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Nuovo Dipendente
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca dipendente..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>

            <Select value={filterVenue} onValueChange={(v) => {
              setFilterVenue(v)
              setPage(1)
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte le sedi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le sedi</SelectItem>
                {venues.map((venue: { id: string; name: string }) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterContract} onValueChange={(v) => {
              setFilterContract(v)
              setPage(1)
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i contratti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i contratti</SelectItem>
                <SelectItem value="TEMPO_DETERMINATO">T. Determinato</SelectItem>
                <SelectItem value="TEMPO_INDETERMINATO">T. Indeterminato</SelectItem>
                <SelectItem value="LAVORO_INTERMITTENTE">Intermittente</SelectItem>
                <SelectItem value="LAVORATORE_OCCASIONALE">Occasionale</SelectItem>
                <SelectItem value="LIBERO_PROFESSIONISTA">Libero Prof.</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="filter-inactive"
                checked={showInactive}
                onCheckedChange={v => {
                  setShowInactive(v)
                  setPage(1)
                }}
              />
              <Label htmlFor="filter-inactive">Inattivi</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella staff */}
      <Card>
        <CardHeader>
          <CardTitle>
            Dipendenti
            <Badge variant="secondary" className="ml-2">
              {filteredStaff.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Clicca su un dipendente per visualizzare il profilo completo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento...
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun dipendente trovato
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dipendente</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead>Contratto</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStaff.map(staff => (
                    <TableRow key={staff.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(staff.firstName, staff.lastName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {staff.firstName} {staff.lastName}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {staff.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {staff.venue ? (
                          <Badge variant="outline">{staff.venue.code}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getContractBadge(staff.contractType)}</TableCell>
                      <TableCell>
                        {getShiftBadge(staff.defaultShift) || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {staff.isActive ? (
                          <Badge className="bg-green-100 text-green-700">Attivo</Badge>
                        ) : (
                          <Badge variant="secondary">Inattivo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/staff/${staff.id}`}>
                          <Button variant="ghost" size="icon" title="Gestisci dipendente">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginazione */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Mostra</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(v) => {
                      setPageSize(parseInt(v))
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className="w-[80px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    per pagina ({filteredStaff.length} totali)
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Precedente
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Pagina {page} di {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Successiva
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

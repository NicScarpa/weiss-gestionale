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
  Eye,
  Settings,
  UserPlus,
  Filter,
} from 'lucide-react'

interface StaffMember {
  id: string
  firstName: string
  lastName: string
  email: string
  isFixedStaff: boolean
  hourlyRate: number | null
  defaultShift: 'MORNING' | 'EVENING' | null
  isActive: boolean
  contractType: 'FISSO' | 'EXTRA' | 'INTERMITTENTE' | null
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
  const [filterActive, setFilterActive] = useState<boolean | null>(true)
  const [filterVenue, setFilterVenue] = useState<string>('all')
  const [filterContract, setFilterContract] = useState<string>('all')

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

    // Filtro attivo
    const matchesActive = filterActive === null || staff.isActive === filterActive

    // Filtro sede
    const matchesVenue = filterVenue === 'all' || staff.venue?.id === filterVenue

    // Filtro contratto
    const matchesContract = filterContract === 'all' || staff.contractType === filterContract

    return matchesSearch && matchesActive && matchesVenue && matchesContract
  })

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
  }

  const getContractBadge = (type: string | null) => {
    switch (type) {
      case 'FISSO':
        return <Badge variant="default">Fisso</Badge>
      case 'EXTRA':
        return <Badge variant="secondary">Extra</Badge>
      case 'INTERMITTENTE':
        return <Badge variant="outline">Intermittente</Badge>
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
          <Link href="/impostazioni">
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
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={filterVenue} onValueChange={setFilterVenue}>
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

            <Select value={filterContract} onValueChange={setFilterContract}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti i contratti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i contratti</SelectItem>
                <SelectItem value="FISSO">Fisso</SelectItem>
                <SelectItem value="EXTRA">Extra</SelectItem>
                <SelectItem value="INTERMITTENTE">Intermittente</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="filter-active"
                checked={filterActive === true}
                onCheckedChange={v => setFilterActive(v ? true : null)}
              />
              <Label htmlFor="filter-active">Solo attivi</Label>
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
                {filteredStaff.map(staff => (
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
                      <div className="flex justify-end gap-1">
                        <Link href={`/staff/${staff.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/staff/${staff.id}/vincoli`}>
                          <Button variant="ghost" size="icon">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

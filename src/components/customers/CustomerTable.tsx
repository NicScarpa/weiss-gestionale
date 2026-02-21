'use client'

import { Building2, Mail, Phone, MapPin, FileText, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface CustomerData {
  id: string
  denominazione: string
  partitaIva: string | null
  codiceFiscale: string | null
  indirizzo: string | null
  citta: string | null
  cap: string | null
  provincia: string | null
  email: string | null
  telefono: string | null
  iban: string | null
  note: string | null
  attivo: boolean
  createdAt: Date
}

interface CustomerTableProps {
  customers: CustomerData[]
  isLoading?: boolean
  onEdit: (customer: CustomerData) => void
  onDelete: (customer: CustomerData) => void
}

export function CustomerTable({ customers, isLoading, onEdit, onDelete }: CustomerTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Caricamento...
      </div>
    )
  }

  if (customers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nessun cliente trovato
      </div>
    )
  }

  return (
    <Card>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead>IBAN</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{customer.denominazione}</span>
                        {!customer.attivo && (
                          <Badge variant="secondary">Inattivo</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        {customer.partitaIva && (
                          <span className="font-mono">P.IVA: {customer.partitaIva}</span>
                        )}
                        {customer.codiceFiscale && (
                          <span className="font-mono">CF: {customer.codiceFiscale}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-sm">
                    {customer.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span>{customer.email}</span>
                      </div>
                    )}
                    {customer.telefono && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{customer.telefono}</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {customer.indirizzo || customer.citta ? (
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {customer.indirizzo && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{customer.indirizzo}</span>
                        </div>
                      )}
                      {(customer.cap || customer.citta || customer.provincia) && (
                        <span>
                          {[customer.cap, customer.citta, customer.provincia]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {customer.iban && (
                    <div className="flex items-center gap-1 text-sm font-mono">
                      <span>IBAN:</span>
                      <span className="text-muted-foreground">{customer.iban.slice(0, 4)} *** {customer.iban.slice(-4)}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {customer.note && (
                    <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Potenzialmente mostra le note in un dialog
                    }}
                    title="Visualizza note"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(customer)}
                      title="Modifica cliente"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(customer)}
                      title="Elimina cliente"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

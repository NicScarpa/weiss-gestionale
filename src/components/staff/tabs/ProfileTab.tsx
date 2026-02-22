'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { ITALIAN_PROVINCES } from '@/lib/constants/provinces'
import { Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProfileTabProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any
  isAdmin: boolean
  roles: Array<{ id: string; name: string }>
}

export function ProfileTab({ employee, isAdmin, roles }: ProfileTabProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    gender: employee.gender || '',
    birthDate: employee.birthDate?.split('T')[0] || '',
    birthPlace: employee.birthPlace || '',
    birthProvince: employee.birthProvince || '',
    fiscalCode: employee.fiscalCode || '',
    roleId: employee.role?.id || '',
    address: employee.address || '',
    zipCode: employee.zipCode || '',
    city: employee.city || '',
    province: employee.province || '',
    email: employee.email || '',
    phoneNumber: employee.phoneNumber || '',
  })

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch(`/api/staff/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          phoneNumber: data.phoneNumber || null,
          birthDate: data.birthDate || null,
          address: data.address || null,
          fiscalCode: data.fiscalCode || null,
          birthPlace: data.birthPlace || null,
          birthProvince: data.birthProvince || null,
          zipCode: data.zipCode || null,
          city: data.city || null,
          province: data.province || null,
          gender: data.gender || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel salvataggio')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', employee.id] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      toast.success('Profilo aggiornato')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-end">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salva
        </Button>
      </div>

      {/* Card Informazioni personali */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informazioni personali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={formData.firstName}
                onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Cognome</Label>
              <Input
                value={formData.lastName}
                onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Genere</Label>
              <Select
                value={formData.gender}
                onValueChange={v => setFormData(prev => ({ ...prev, gender: v }))}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Maschio</SelectItem>
                  <SelectItem value="F">Femmina</SelectItem>
                  <SelectItem value="X">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data di nascita</Label>
              <Input
                type="date"
                value={formData.birthDate}
                onChange={e => setFormData(prev => ({ ...prev, birthDate: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Codice Fiscale</Label>
              <Input
                maxLength={16}
                value={formData.fiscalCode}
                onChange={e => setFormData(prev => ({ ...prev, fiscalCode: e.target.value.toUpperCase() }))}
                disabled={!isAdmin}
                placeholder="RSSMRA85M01H501A"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Luogo di nascita</Label>
              <Input
                value={formData.birthPlace}
                onChange={e => setFormData(prev => ({ ...prev, birthPlace: e.target.value }))}
                disabled={!isAdmin}
                placeholder="Milano"
              />
            </div>
            <div className="space-y-2">
              <Label>Provincia di nascita</Label>
              <Select
                value={formData.birthProvince}
                onValueChange={v => setFormData(prev => ({ ...prev, birthProvince: v }))}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona provincia" />
                </SelectTrigger>
                <SelectContent>
                  {ITALIAN_PROVINCES.map(p => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Select
              value={formData.roleId}
              onValueChange={v => setFormData(prev => ({ ...prev, roleId: v }))}
              disabled={!isAdmin}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona ruolo" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Card Indirizzo di residenza */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indirizzo di residenza</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Indirizzo</Label>
            <AddressAutocomplete
              value={formData.address}
              onChange={val => setFormData(prev => ({ ...prev, address: val }))}
              disabled={!isAdmin}
              placeholder="Via Roma 1"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>CAP</Label>
              <Input
                maxLength={5}
                value={formData.zipCode}
                onChange={e => setFormData(prev => ({ ...prev, zipCode: e.target.value.replace(/\D/g, '').slice(0, 5) }))}
                disabled={!isAdmin}
                placeholder="20100"
              />
            </div>
            <div className="space-y-2">
              <Label>Città</Label>
              <Input
                value={formData.city}
                onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                disabled={!isAdmin}
                placeholder="Milano"
              />
            </div>
            <div className="space-y-2">
              <Label>Provincia</Label>
              <Select
                value={formData.province}
                onValueChange={v => setFormData(prev => ({ ...prev, province: v }))}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Prov." />
                </SelectTrigger>
                <SelectContent>
                  {ITALIAN_PROVINCES.map(p => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Contatti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contatti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input
                type="tel"
                value={formData.phoneNumber}
                onChange={e => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                disabled={!isAdmin}
                placeholder="+39 123 456 7890"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}

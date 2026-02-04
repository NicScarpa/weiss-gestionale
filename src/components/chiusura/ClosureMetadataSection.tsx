'use client'

import { format } from 'date-fns'
import { Calendar as CalendarIcon, CloudSun, StickyNote } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useTypingPlaceholder } from '@/hooks/useTypingPlaceholder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Opzioni meteo
const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sole' },
  { value: 'cloudy', label: '☁️ Nuvoloso' },
  { value: 'rainy', label: '🌧️ Pioggia' },
  { value: 'stormy', label: '⛈️ Temporale' },
  { value: 'snowy', label: '❄️ Neve' },
  { value: 'foggy', label: '🌫️ Nebbia' },
]

interface ClosureMetadataSectionProps {
  date: Date
  isEvent: boolean
  eventName?: string
  weatherMorning?: string
  weatherAfternoon?: string
  weatherEvening?: string
  onDateChange: (date: Date) => void
  onIsEventChange: (isEvent: boolean) => void
  onEventNameChange: (name: string) => void
  onWeatherMorningChange: (weather: string) => void
  onWeatherAfternoonChange: (weather: string) => void
  onWeatherEveningChange: (weather: string) => void
  notes?: string
  onNotesChange: (notes: string) => void
  disabled?: boolean
}

export function ClosureMetadataSection({
  date,
  isEvent,
  eventName,
  weatherMorning,
  weatherAfternoon,
  weatherEvening,
  onDateChange,
  onIsEventChange,
  onEventNameChange,
  onWeatherMorningChange,
  onWeatherAfternoonChange,
  onWeatherEveningChange,
  notes,
  onNotesChange,
  disabled = false,
}: ClosureMetadataSectionProps) {
  const NOTES_PHRASES = [
    "C'era qualche evento in concorrenza nella zona?",
    "C'è stato qualche evento particolare in piazza?",
    "Abbiamo avuto un compleanno nella sala?",
  ]

  const typingPlaceholder = useTypingPlaceholder({
    phrases: NOTES_PHRASES,
    typingSpeed: 50,
    deletingSpeed: 25,
    pauseAfterTyping: 2500,
    pauseAfterDeleting: 400,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Informazioni Giornata
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data e Evento */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              type="date"
              value={format(date, 'yyyy-MM-dd')}
              onChange={(e) => onDateChange(new Date(e.target.value))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isEvent}
                onChange={(e) => onIsEventChange(e.target.checked)}
                disabled={disabled}
                className="h-4 w-4"
              />
              EVENTO
            </Label>
            {isEvent && (
              <Input
                value={eventName || ''}
                onChange={(e) => onEventNameChange(e.target.value)}
                disabled={disabled}
                placeholder="Nome evento..."
              />
            )}
          </div>
        </div>

        {/* Meteo */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CloudSun className="h-4 w-4" />
            Condizioni Meteo
          </Label>
          <div className="grid grid-cols-3 gap-4">
            <Select
              value={weatherMorning || ''}
              onValueChange={onWeatherMorningChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Mattina" />
              </SelectTrigger>
              <SelectContent>
                {WEATHER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={weatherAfternoon || ''}
              onValueChange={onWeatherAfternoonChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pomeriggio" />
              </SelectTrigger>
              <SelectContent>
                {WEATHER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={weatherEvening || ''}
              onValueChange={onWeatherEveningChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sera" />
              </SelectTrigger>
              <SelectContent>
                {WEATHER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Note */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Note
          </Label>
          <Textarea
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            disabled={disabled}
            placeholder={typingPlaceholder}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  )
}

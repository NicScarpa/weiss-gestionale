'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus } from 'lucide-react'

// Skill predefinite per bar/caffetteria
const PREDEFINED_SKILLS = [
  'Barista',
  'Caffetteria',
  'Cocktail Base',
  'Cocktail Avanzati',
  'Mixology',
  'Servizio Sala',
  'Cassa',
  'Aperitivi',
  'Sommelerie',
  'Cucina Base',
  'Pasticceria',
  'Gestione Magazzino',
  'Pulizie',
  'Sicurezza',
  'Eventi',
  'DJ Set',
]

interface SkillsSelectorProps {
  value: string[]
  onChange: (skills: string[]) => void
  disabled?: boolean
}

export function SkillsSelector({ value, onChange, disabled }: SkillsSelectorProps) {
  const [customSkill, setCustomSkill] = useState('')
  const [showPredefined, setShowPredefined] = useState(false)

  const addSkill = (skill: string) => {
    if (skill && !value.includes(skill)) {
      onChange([...value, skill])
    }
    setCustomSkill('')
  }

  const removeSkill = (skill: string) => {
    onChange(value.filter(s => s !== skill))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (customSkill.trim()) {
        addSkill(customSkill.trim())
      }
    }
  }

  const availablePredefined = PREDEFINED_SKILLS.filter(s => !value.includes(s))

  return (
    <div className="space-y-3">
      {/* Skills selezionate */}
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {value.length === 0 ? (
          <span className="text-sm text-muted-foreground">Nessuna competenza selezionata</span>
        ) : (
          value.map(skill => (
            <Badge
              key={skill}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              {skill}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>

      {!disabled && (
        <>
          {/* Input per skill custom */}
          <div className="flex gap-2">
            <Input
              placeholder="Aggiungi competenza..."
              value={customSkill}
              onChange={e => setCustomSkill(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => addSkill(customSkill.trim())}
              disabled={!customSkill.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Skill predefinite */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPredefined(!showPredefined)}
              className="text-xs text-muted-foreground"
            >
              {showPredefined ? 'Nascondi suggerimenti' : 'Mostra suggerimenti'}
            </Button>

            {showPredefined && availablePredefined.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {availablePredefined.map(skill => (
                  <Badge
                    key={skill}
                    variant="outline"
                    className="cursor-pointer hover:bg-secondary"
                    onClick={() => addSkill(skill)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

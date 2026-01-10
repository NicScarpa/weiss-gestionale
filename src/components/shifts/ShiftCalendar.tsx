'use client'

import { useMemo, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { format, addDays, isSameDay } from 'date-fns'
import { it } from 'date-fns/locale'

interface ShiftDefinition {
  id: string
  name: string
  code: string
  color: string | null
  startTime: string
  endTime: string
}

interface Assignment {
  id: string
  userId: string
  shiftDefinitionId: string | null
  date: string
  startTime: string
  endTime: string
  user: {
    id: string
    firstName: string
    lastName: string
  }
  shiftDefinition?: ShiftDefinition | null
}

interface DragData {
  assignmentId: string
  sourceDate: string
  sourceShiftId: string
}

interface UncoveredSlot {
  date: string
  shiftId: string
  originalAssignment: Assignment
}

interface ShiftCalendarProps {
  startDate: Date
  endDate: Date
  assignments: Assignment[]
  shiftDefinitions: ShiftDefinition[]
  onAssignmentClick?: (assignment: Assignment) => void
  onSlotClick?: (date: Date, shiftDefId: string) => void
  onAssignmentMove?: (assignmentId: string, newDate: Date, newShiftDefId: string) => Promise<void>
}

export function ShiftCalendar({
  startDate,
  endDate,
  assignments,
  shiftDefinitions,
  onAssignmentClick,
  onSlotClick,
  onAssignmentMove,
}: ShiftCalendarProps) {
  const [draggedAssignment, setDraggedAssignment] = useState<DragData | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [uncoveredSlots, setUncoveredSlots] = useState<UncoveredSlot[]>([])
  const [isMoving, setIsMoving] = useState(false)

  // Generate array of dates
  const dates = useMemo(() => {
    const result: Date[] = []
    let current = new Date(startDate)
    while (current <= endDate) {
      result.push(new Date(current))
      current = addDays(current, 1)
    }
    return result
  }, [startDate, endDate])

  // Group assignments by date and shift
  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment[]>()

    for (const assignment of assignments) {
      const date = new Date(assignment.date).toDateString()
      const shiftId = assignment.shiftDefinitionId || 'custom'
      const key = `${date}_${shiftId}`

      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(assignment)
    }

    return map
  }, [assignments])

  // Format name as "FirstName L."
  const formatEmployeeName = (firstName: string, lastName: string) => {
    return `${firstName} ${lastName.charAt(0)}.`
  }

  const isToday = (date: Date) => {
    return isSameDay(date, new Date())
  }

  const isWeekend = (date: Date) => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  // Check if a slot is uncovered
  const isUncoveredSlot = useCallback((date: Date, shiftId: string) => {
    return uncoveredSlots.some(
      slot => slot.date === date.toDateString() && slot.shiftId === shiftId
    )
  }, [uncoveredSlots])

  // Drag handlers
  const handleDragStart = useCallback((
    e: React.DragEvent,
    assignment: Assignment,
    date: Date,
    shiftId: string
  ) => {
    e.dataTransfer.effectAllowed = 'move'
    setDraggedAssignment({
      assignmentId: assignment.id,
      sourceDate: date.toDateString(),
      sourceShiftId: shiftId,
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(key)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(async (
    e: React.DragEvent,
    targetDate: Date,
    targetShiftId: string
  ) => {
    e.preventDefault()
    setDropTarget(null)

    if (!draggedAssignment || !onAssignmentMove || isMoving) return

    const sourceKey = `${draggedAssignment.sourceDate}_${draggedAssignment.sourceShiftId}`
    const targetKey = `${targetDate.toDateString()}_${targetShiftId}`

    // Don't do anything if dropping on the same slot
    if (sourceKey === targetKey) {
      setDraggedAssignment(null)
      return
    }

    // Find the original assignment
    const sourceAssignment = assignments.find(a => a.id === draggedAssignment.assignmentId)
    if (!sourceAssignment) {
      setDraggedAssignment(null)
      return
    }

    // Add uncovered slot marker for the source location
    setUncoveredSlots(prev => [
      ...prev.filter(s => !(s.date === draggedAssignment.sourceDate && s.shiftId === draggedAssignment.sourceShiftId)),
      {
        date: draggedAssignment.sourceDate,
        shiftId: draggedAssignment.sourceShiftId,
        originalAssignment: sourceAssignment,
      }
    ])

    setIsMoving(true)
    try {
      await onAssignmentMove(draggedAssignment.assignmentId, targetDate, targetShiftId)
      // If successful, remove the uncovered slot marker since data will refresh
      setUncoveredSlots(prev =>
        prev.filter(s => !(s.date === draggedAssignment.sourceDate && s.shiftId === draggedAssignment.sourceShiftId))
      )
    } catch (error) {
      // If failed, remove the uncovered slot marker
      setUncoveredSlots(prev =>
        prev.filter(s => !(s.date === draggedAssignment.sourceDate && s.shiftId === draggedAssignment.sourceShiftId))
      )
    } finally {
      setIsMoving(false)
      setDraggedAssignment(null)
    }
  }, [draggedAssignment, onAssignmentMove, isMoving, assignments])

  const handleDragEnd = useCallback(() => {
    setDraggedAssignment(null)
    setDropTarget(null)
  }, [])

  // Clear uncovered slot when clicked (to add new assignment)
  const handleUncoveredSlotClick = useCallback((date: Date, shiftId: string) => {
    setUncoveredSlots(prev =>
      prev.filter(s => !(s.date === date.toDateString() && s.shiftId === shiftId))
    )
    onSlotClick?.(date, shiftId)
  }, [onSlotClick])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header row with dates */}
        <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}>
          <div className="font-medium text-sm text-muted-foreground p-2">
            Turno
          </div>
          {dates.map(date => (
            <div
              key={date.toISOString()}
              className={cn(
                'text-center p-2 rounded-lg',
                isToday(date) && 'bg-primary text-primary-foreground',
                isWeekend(date) && !isToday(date) && 'bg-muted'
              )}
            >
              <div className="text-xs text-muted-foreground">
                {format(date, 'EEE', { locale: it })}
              </div>
              <div className="font-medium">
                {format(date, 'd')}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(date, 'MMM', { locale: it })}
              </div>
            </div>
          ))}
        </div>

        {/* Shift rows */}
        {shiftDefinitions.map(shift => (
          <div
            key={shift.id}
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}
          >
            {/* Shift label */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: shift.color || '#6B7280' }}
              />
              <div>
                <div className="font-medium text-sm">{shift.name}</div>
                <div className="text-xs text-muted-foreground">
                  {shift.startTime} - {shift.endTime}
                </div>
              </div>
            </div>

            {/* Day cells */}
            {dates.map(date => {
              const key = `${date.toDateString()}_${shift.id}`
              const dayAssignments = assignmentMap.get(key) || []
              const isUncovered = isUncoveredSlot(date, shift.id)
              const isDropTargetCell = dropTarget === key

              return (
                <Card
                  key={key}
                  className={cn(
                    'min-h-[80px] p-1 cursor-pointer transition-all',
                    'hover:border-primary/50',
                    isWeekend(date) && 'bg-muted/50',
                    isDropTargetCell && 'border-primary border-2 bg-primary/10',
                    isUncovered && 'bg-red-100 border-red-300 border-2'
                  )}
                  onClick={() => {
                    if (isUncovered) {
                      handleUncoveredSlotClick(date, shift.id)
                    } else {
                      onSlotClick?.(date, shift.id)
                    }
                  }}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, date, shift.id)}
                >
                  {isUncovered ? (
                    <div className="h-full flex flex-col items-center justify-center text-red-600">
                      <span className="text-xs font-medium">Scoperto</span>
                      <span className="text-[10px]">Clicca per coprire</span>
                    </div>
                  ) : dayAssignments.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                      +
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dayAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          draggable={!!onAssignmentMove}
                          onDragStart={(e) => handleDragStart(e, assignment, date, shift.id)}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            'flex items-center gap-1 p-1.5 rounded text-xs cursor-grab active:cursor-grabbing',
                            'bg-primary/10 hover:bg-primary/20 transition-colors',
                            draggedAssignment?.assignmentId === assignment.id && 'opacity-50'
                          )}
                          style={{
                            borderLeft: `3px solid ${shift.color || '#6B7280'}`,
                          }}
                          onClick={e => {
                            e.stopPropagation()
                            onAssignmentClick?.(assignment)
                          }}
                        >
                          <span className="truncate font-medium">
                            {formatEmployeeName(assignment.user.firstName, assignment.user.lastName)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        ))}

        {/* Custom assignments (without shift definition) */}
        {assignments.some(a => !a.shiftDefinitionId) && (
          <div
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `120px repeat(${dates.length}, 1fr)` }}
          >
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <div>
                <div className="font-medium text-sm">Personalizzato</div>
                <div className="text-xs text-muted-foreground">
                  Orari custom
                </div>
              </div>
            </div>

            {dates.map(date => {
              const key = `${date.toDateString()}_custom`
              const dayAssignments = assignments.filter(
                a =>
                  !a.shiftDefinitionId &&
                  new Date(a.date).toDateString() === date.toDateString()
              )
              const isDropTargetCell = dropTarget === key

              return (
                <Card
                  key={key}
                  className={cn(
                    'min-h-[80px] p-1',
                    isWeekend(date) && 'bg-muted/50',
                    isDropTargetCell && 'border-primary border-2 bg-primary/10'
                  )}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, date, 'custom')}
                >
                  {dayAssignments.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    <div className="space-y-1">
                      {dayAssignments.map(assignment => (
                        <div
                          key={assignment.id}
                          draggable={!!onAssignmentMove}
                          onDragStart={(e) => handleDragStart(e, assignment, date, 'custom')}
                          onDragEnd={handleDragEnd}
                          className={cn(
                            'flex items-center gap-1 p-1.5 rounded text-xs cursor-grab active:cursor-grabbing',
                            'bg-gray-100 hover:bg-gray-200 transition-colors',
                            draggedAssignment?.assignmentId === assignment.id && 'opacity-50'
                          )}
                          onClick={() => onAssignmentClick?.(assignment)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">
                              {formatEmployeeName(assignment.user.firstName, assignment.user.lastName)}
                            </div>
                            <div className="text-muted-foreground">
                              {assignment.startTime}-{assignment.endTime}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

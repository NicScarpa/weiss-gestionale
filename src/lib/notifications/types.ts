import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client'

export { NotificationType, NotificationChannel, NotificationStatus }

export interface NotificationPayload {
  type: NotificationType
  title: string
  body: string
  data?: Record<string, string>
  referenceId?: string
  referenceType?: string
  url?: string // URL da aprire quando si clicca
}

export interface SendNotificationOptions {
  userId: string
  payload: NotificationPayload
  channels?: NotificationChannel[]
}

export interface SendBulkNotificationOptions {
  userIds: string[]
  payload: NotificationPayload
  channels?: NotificationChannel[]
}

/**
 * Corpo del messaggio Web Push, così come il service worker lo legge
 * nell'evento `push` (vedi src/app/sw.ts).
 */
export interface PushPayload {
  title: string
  body: string
  /** Serve al service worker per scegliere le azioni della notifica. */
  type?: NotificationType
  icon?: string
  badge?: string
  /** Notifiche con lo stesso tag si sostituiscono invece di accumularsi. */
  tag?: string
  /** Letto al click: `url` decide dove atterra l'utente. */
  data?: Record<string, string>
  requireInteraction?: boolean
}

export interface NotificationResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface BulkNotificationResult {
  successCount: number
  failureCount: number
  results: Array<{
    userId: string
    success: boolean
    error?: string
  }>
}

// Tipi specifici per notifiche
export interface ShiftPublishedData {
  scheduleId: string
  startDate: string
  endDate: string
  venueName: string
}

export interface ShiftReminderData {
  assignmentId: string
  shiftName: string
  startTime: string
  venueName: string
}

export interface AnomalyData {
  anomalyId: string
  anomalyType: string
  date: string
  employeeName?: string
}

export interface LeaveRequestData {
  requestId: string
  leaveType: string
  startDate: string
  endDate: string
  employeeName?: string
  status?: string
}

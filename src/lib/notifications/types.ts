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

export interface FCMMessage {
  token: string
  notification: {
    title: string
    body: string
  }
  data?: Record<string, string>
  webpush?: {
    fcmOptions?: {
      link?: string
    }
    notification?: {
      icon?: string
      badge?: string
    }
  }
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

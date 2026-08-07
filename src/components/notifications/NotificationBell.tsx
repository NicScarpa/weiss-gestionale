'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'
import { Bell, CheckCheck } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const NOTIFICATIONS_LIMIT = 15
const POLL_INTERVAL_MS = 60_000

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  channel: string
  status: string
  sentAt: string
  readAt: string | null
  referenceId: string | null
  referenceType: string | null
}

interface NotificationHistoryResponse {
  notifications: NotificationItem[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  unreadCount: number
}

export const notificationsQueryKey = ['notifications', 'history', NOTIFICATIONS_LIMIT] as const

async function fetchNotifications(): Promise<NotificationHistoryResponse> {
  const res = await fetch(`/api/notifications/history?limit=${NOTIFICATIONS_LIMIT}`)
  if (!res.ok) {
    throw new Error('Errore nel recupero delle notifiche')
  }
  return res.json()
}

async function markAsRead(payload: { notificationIds: string[] } | { markAllAsRead: true }) {
  const res = await fetch('/api/notifications/history', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error('Errore nell\'aggiornamento delle notifiche')
  }
  return res.json()
}

/**
 * Estrae il link da aprire dal payload della notifica.
 * L'URL viene salvato in `data.url` al momento del logging (vedi lib/notifications/send.ts).
 */
function getNotificationUrl(notification: NotificationItem): string | null {
  const url = notification.data?.url
  return typeof url === 'string' && url.length > 0 ? url : null
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true, locale: it })
}

interface NotificationBellProps {
  /** Classi aggiuntive per il pulsante campanella (per adattarsi ai diversi header) */
  className?: string
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS / 2,
  })

  const markReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey })
    },
  })

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.readAt) {
      markReadMutation.mutate({ notificationIds: [notification.id] })
    }

    const url = getNotificationUrl(notification)
    if (url) {
      setOpen(false)
      router.push(url)
    }
  }

  const handleMarkAllAsRead = () => {
    if (unreadCount === 0) return
    markReadMutation.mutate({ markAllAsRead: true })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : 'Notifiche'
          }
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400',
            className
          )}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifiche</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted-foreground">
                {unreadCount} non lette
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0 || markReadMutation.isPending}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Segna tutte come lette
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Impossibile caricare le notifiche
            </p>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-gray-300" />
              <p className="text-sm text-muted-foreground">Nessuna notifica</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const isUnread = !notification.readAt
                const hasLink = getNotificationUrl(notification) !== null

                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                        isUnread && 'bg-blue-50/60 hover:bg-blue-50',
                        !isUnread && !hasLink && 'cursor-default'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          isUnread ? 'bg-blue-600' : 'bg-transparent'
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                          )}
                        >
                          {notification.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </span>
                        <span className="mt-1 block text-[11px] text-gray-400">
                          {formatRelativeTime(notification.sentAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

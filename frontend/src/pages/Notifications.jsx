import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronLeft, ChevronRight, BellOff } from 'lucide-react'
import client from '../api/client'

const PAGE_SIZE = 20

// ─── Relative time ────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)

  if (diffSec < 60)       return 'just now'
  if (diffSec < 3_600)    return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400)   return `${Math.floor(diffSec / 3_600)}h ago`
  if (diffSec < 172_800)  return 'Yesterday'
  if (diffSec < 604_800)  return `${Math.floor(diffSec / 86_400)} days ago`

  return new Date(isoString).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({ notif, onMarkRead }) {
  const navigate = useNavigate()

  const handleClick = async () => {
    // Mark read optimistically, fire PATCH in background
    if (!notif.read) onMarkRead(notif._id)
    if (notif.submission_id) navigate(`/submissions/${notif.submission_id}`)
  }

  return (
    <li>
      <button
        onClick={handleClick}
        className={`group w-full text-left transition-colors ${
          notif.read
            ? 'hover:bg-gray-50'
            : 'bg-blue-50 hover:bg-blue-100'
        }`}
      >
        <div className="flex items-start gap-3 px-4 py-4 sm:px-6">
          {/* Unread dot */}
          <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
            {!notif.read
              ? <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              : <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
            }
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <p className={`text-sm leading-snug ${notif.read ? 'text-gray-700' : 'font-medium text-gray-900'}`}>
              {notif.message}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-400">{timeAgo(notif.created_at)}</span>
              {notif.submission_id && (
                <span className="text-xs text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                  View submission →
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

// ─── Pagination controls ──────────────────────────────────────────────────────

function Pagination({ page, hasNext, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <span className="text-sm text-gray-500">Page {page}</span>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const { data } = await client.get(`/notifications?page=${p}&page_size=${PAGE_SIZE}`)
      const items = data.notifications ?? []
      setNotifications(items)
      setUnreadCount(data.unread_count ?? 0)
      // If the page returned fewer items than the page size, we're on the last page
      setHasNext(items.length === PAGE_SIZE)
    } catch {
      /* silently degrade */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page) }, [load, page])

  // Optimistic local mark-as-read + background PATCH
  const handleMarkRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => n._id === id ? { ...n, read: true } : n)
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await client.patch(`/notifications/${id}/read`)
    } catch {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => n._id === id ? { ...n, read: false } : n)
      )
      setUnreadCount((c) => c + 1)
    }
  }, [])

  const handleMarkAll = async () => {
    setMarkingAll(true)
    try {
      await client.patch('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      /* ignore */
    } finally {
      setMarkingAll(false)
    }
  }

  const goToPage = (p) => {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={markingAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            {markingAll
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              : <CheckCheck className="h-3.5 w-3.5 text-gray-500" />
            }
            Mark all as read
          </button>
        )}
      </div>

      {/* Card */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center gap-3 px-6 py-10 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <BellOff className="h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-500">No notifications yet</p>
            <p className="text-sm text-gray-400">You&apos;ll be notified when your submissions are reviewed.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {notifications.map((notif) => (
                <NotificationRow
                  key={notif._id}
                  notif={notif}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </ul>
            {(page > 1 || hasNext) && (
              <Pagination
                page={page}
                hasNext={hasNext}
                onPrev={() => goToPage(page - 1)}
                onNext={() => goToPage(page + 1)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

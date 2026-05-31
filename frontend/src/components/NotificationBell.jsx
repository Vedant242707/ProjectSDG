import { useState, useEffect, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const POLL_MS = 30_000

export default function NotificationBell() {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await client.get('/notifications/unread-count')
      setUnread(data.unread_count ?? 0)
    } catch {
      // silently ignore — stale count is fine
    }
  }, [])

  useEffect(() => {
    if (!user) { setUnread(0); return }
    fetchCount()
    const interval = setInterval(fetchCount, POLL_MS)
    return () => clearInterval(interval)
  }, [user, fetchCount])

  return (
    <Link
      to="/notifications"
      className="relative flex items-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
      aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

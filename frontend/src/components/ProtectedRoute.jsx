import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from './Spinner'

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
          <span className="text-2xl">🚫</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">
            Your role (<span className="font-mono font-medium">{user.role}</span>) doesn&apos;t have permission to view this page.
          </p>
        </div>
        <Link to="/" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Go home
        </Link>
      </div>
    )
  }

  return children
}

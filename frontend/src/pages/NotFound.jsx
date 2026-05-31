import { Link, useLocation } from 'react-router-dom'
import { FileQuestion, Home } from 'lucide-react'

export default function NotFound() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-200">
        <FileQuestion className="h-10 w-10 text-gray-400" />
      </div>

      <h1 className="text-7xl font-extrabold tracking-tight text-gray-300">404</h1>
      <h2 className="mt-3 text-2xl font-bold text-gray-800">Page not found</h2>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        <span className="font-mono text-gray-400">{pathname}</span> doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Home className="h-4 w-4" />
          Go home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Go back
        </button>
      </div>
    </div>
  )
}

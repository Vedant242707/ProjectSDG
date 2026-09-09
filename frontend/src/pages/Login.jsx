import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff } from 'lucide-react'
import ritLogo from '../assets/rit-logo-transparent.png'
import ritCrest from '../assets/rit-crest-transparent.png'

const ROLE_HOME = {
  ADMIN: '/admin',
  HOD: '/review',
  SDG_COMMITTEE: '/review',
}

function getRoleHome(role) {
  return ROLE_HOME[role] ?? '/submissions'
}

export default function Login() {
  const { login, loginWithTokens } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [departments, setDepartments] = useState([])
  const [googleDepartmentId, setGoogleDepartmentId] = useState('')

  useEffect(() => {
    fetch('/api/auth/departments')
      .then((response) => response.ok ? response.json() : [])
      .then(setDepartments)
      .catch(() => {})
  }, [])

  // ── Handle Google OAuth redirect back to /login ──────────────────────────────
  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const role = searchParams.get('role')
    const oauthError = searchParams.get('error')

    if (oauthError) {
      // Decode %2C etc. that came back in the URL
      setError(decodeURIComponent(oauthError))
      return
    }

    if (accessToken && refreshToken) {
      const userData = loginWithTokens(accessToken, refreshToken)
      const destination = getRoleHome(userData?.role ?? role ?? '')
      navigate(destination, { replace: true })
    }
  }, []) // run once on mount only

  // ── Email / password form ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      navigate(getRoleHome(user?.role), { replace: true })
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : (detail ?? 'Invalid email or password.')
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Google OAuth — browser redirect (NOT an AJAX call) ───────────────────────
  const handleGoogleSignIn = () => {
    if (!googleDepartmentId) {
      setError('Select your department before continuing with Google.')
      return
    }
    window.location.href = `/api/auth/google?department_id=${encodeURIComponent(googleDepartmentId)}`
  }

  return (
    <div className="premium-page login-page">
      <div className="login-layout">
        <div className="login-college-brand">
          <img className="login-rit-logo login-rit-logo-light" src={ritLogo} alt="Ramaiah Institute of Technology" />
          <div className="login-rit-logo-dark" aria-label="Ramaiah Institute of Technology">
            <div className="login-rit-crest"><img src={ritCrest} alt="" /></div>
            <div className="login-rit-wordmark">RAMAIAH<span>Institute of Technology</span></div>
          </div>
          <p className="eyebrow">MSRIT · SDG WORKFLOW</p>
        </div>

        <div className="premium-card">
          <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-white">Sign in to your account</h2>

          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@msrit.edu"
                className="form-input"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
              </div>
              <div className="relative"><input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input pr-11"
              /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="primary-button w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="mb-3">
            <label htmlFor="google-department" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-200">Department for Google sign-in</label>
            <select
              id="google-department"
              value={googleDepartmentId}
              onChange={(event) => setGoogleDepartmentId(event.target.value)}
              className="form-input"
            >
              <option value="">Select your department</option>
              {departments.map((department) => (
                <option key={department._id} value={department._id}>{department.name} ({department.code})</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">Required once for new Google accounts. Your saved department will not be changed later.</p>
          </div>

          {/* Google sign-in button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {/* Google "G" logo SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

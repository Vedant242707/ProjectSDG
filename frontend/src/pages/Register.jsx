import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const COLLEGE_DOMAIN = '@msrit.edu'

function validate({ college_id, email, password, confirm_password }, departmentId) {
  if (!college_id.trim()) return 'College ID is required.'
  if (!email.toLowerCase().endsWith(COLLEGE_DOMAIN))
    return `Email must be a college email ending in ${COLLEGE_DOMAIN}`
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm_password) return 'Passwords do not match.'
  if (!departmentId) return 'Please select your department.'
  return null
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    college_id: '',
    email: '',
    password: '',
    confirm_password: '',
  })
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load department list for the dropdown (public endpoint, no auth needed)
  useEffect(() => {
    fetch('/api/auth/departments')
      .then(r => r.ok ? r.json() : [])
      .then(setDepartments)
      .catch(() => {})
  }, [])

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validationError = validate(form, departmentId)
    if (validationError) { setError(validationError); return }

    setLoading(true)
    try {
      await register(form.college_id, form.email, form.password, form.confirm_password, departmentId || undefined)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : (detail ?? 'Registration failed. Please try again.')
      )
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-12 text-center shadow-lg ring-1 ring-gray-900/5">
          <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-500" />
          <h2 className="text-xl font-semibold text-gray-800">Account created!</h2>
          <p className="mt-2 text-sm text-gray-500">
            Redirecting you to the login page…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 text-2xl font-bold text-white shadow-lg">
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SDG Portal</h1>
          <p className="mt-1 text-sm text-gray-500">Create your account</p>
        </div>

        <div className="rounded-2xl bg-white px-8 py-9 shadow-lg ring-1 ring-gray-900/5">
          <h2 className="mb-6 text-xl font-semibold text-gray-800">Register</h2>

          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Field
              id="college_id"
              label="College ID"
              type="text"
              placeholder="e.g. 1MS21CS001"
              value={form.college_id}
              onChange={set('college_id')}
              autoComplete="username"
            />
            <div>
              <Field
                id="email"
                label="College Email"
                type="email"
                placeholder={`you${COLLEGE_DOMAIN}`}
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
              />
              {form.email && !form.email.toLowerCase().endsWith(COLLEGE_DOMAIN) && (
                <p className="mt-1.5 text-xs text-amber-600">Must end with {COLLEGE_DOMAIN}</p>
              )}
            </div>
            <Field
              id="password"
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
            >
              {form.password.length > 0 && form.password.length < 8 && (
                <p className="mt-1.5 text-xs text-amber-600">At least 8 characters required</p>
              )}
            </Field>
            <Field
              id="confirm_password"
              label="Confirm Password"
              type="password"
              placeholder="Re-enter password"
              value={form.confirm_password}
              onChange={set('confirm_password')}
              autoComplete="new-password"
            >
              {form.confirm_password && form.confirm_password !== form.password && (
                <p className="mt-1.5 text-xs text-red-600">Passwords do not match</p>
              )}
            </Field>

            {/* ── Department selection ───────────────────────────────────── */}
            <div>
              <label htmlFor="department" className="mb-1.5 block text-sm font-medium text-gray-700">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="department"
                required
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">— Select your department —</option>
                {departments.map(d => (
                  <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Your department determines which HOD receives your submissions.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating account…
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, type, placeholder, value, onChange, autoComplete, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {children}
    </div>
  )
}

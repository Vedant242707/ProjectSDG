import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ritLogo from '../assets/rit-logo-transparent.png'
import ritCrest from '../assets/rit-crest-transparent.png'

const COLLEGE_DOMAIN = '@msrit.edu'

function validate({ full_name, email, password, confirm_password }, departmentId) {
  if (full_name.trim().length < 2) return 'Full name is required.'
  if (!email.toLowerCase().endsWith(COLLEGE_DOMAIN)) return `Email must end in ${COLLEGE_DOMAIN}`
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm_password) return 'Passwords do not match.'
  if (!departmentId) return 'Please select your department.'
  return null
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm_password: '' })
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    fetch('/api/auth/departments').then((response) => response.ok ? response.json() : []).then(setDepartments).catch(() => {})
  }, [])

  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    const validationError = validate(form, departmentId)
    if (validationError) { setError(validationError); return }
    setLoading(true)
    try {
      await register(form.full_name, form.email, form.password, form.confirm_password, departmentId)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Registration failed. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  if (success) return <div className="premium-page"><div className="premium-card text-center"><CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" /><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Account created</h2><p className="mt-2 text-sm text-slate-500">Redirecting you to sign in…</p></div></div>

  return (
    <div className="premium-page py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img className="register-rit-logo register-rit-logo-light mx-auto mb-4" src={ritLogo} alt="Ramaiah Institute of Technology" />
          <div className="register-rit-logo-dark mx-auto mb-4" aria-label="Ramaiah Institute of Technology"><img src={ritCrest} alt="" /><span><strong>RAMAIAH</strong>Institute of Technology</span></div>
          <p className="eyebrow">MSRIT · SDG WORKFLOW</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Create your account</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">A focused space for meaningful work.</p>
        </div>
        <div className="premium-card">
          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Field id="full_name" label="Full Name" placeholder="e.g. Ananya Sharma" value={form.full_name} onChange={set('full_name')} autoComplete="name" />
            <div><label htmlFor="email" className="form-label">College email</label><input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder={`you${COLLEGE_DOMAIN}`} className="form-input" /></div>
            <PasswordField id="password" label="Password" value={form.password} onChange={set('password')} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" />
            <PasswordField id="confirm_password" label="Confirm password" value={form.confirm_password} onChange={set('confirm_password')} visible={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} autoComplete="new-password" />
            <div><label htmlFor="department" className="form-label">Department</label><select id="department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="form-input"><option value="">Select your department</option>{departments.map((department) => <option key={department._id} value={department._id}>{department.name} ({department.code})</option>)}</select></div>
            <button type="submit" disabled={loading} className="primary-button w-full">{loading ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-medium text-slate-900 underline underline-offset-4 dark:text-white">Sign in</Link></p>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, placeholder, value, onChange, autoComplete }) { return <div><label htmlFor={id} className="form-label">{label}</label><input id={id} required placeholder={placeholder} value={value} onChange={onChange} autoComplete={autoComplete} className="form-input" /></div> }
function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete }) { return <div><label htmlFor={id} className="form-label">{label}</label><div className="relative"><input id={id} required type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} className="form-input pr-11" /><button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div> }

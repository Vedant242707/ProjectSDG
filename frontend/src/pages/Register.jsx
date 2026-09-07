import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Check, CheckCircle2, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'

const COLLEGE_DOMAIN = '@msrit.edu'

function validate({ college_id, email, password, confirm_password }, departmentId, verificationToken) {
  if (!college_id.trim()) return 'College ID is required.'
  if (!email.toLowerCase().endsWith(COLLEGE_DOMAIN)) return `Email must end in ${COLLEGE_DOMAIN}`
  if (!verificationToken) return 'Verify your college email before creating an account.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm_password) return 'Passwords do not match.'
  if (!departmentId) return 'Please select your department.'
  return null
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ college_id: '', email: '', password: '', confirm_password: '' })
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [otp, setOtp] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    fetch('/api/auth/departments').then(r => r.ok ? r.json() : []).then(setDepartments).catch(() => {})
  }, [])

  const set = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
    if (key === 'email') { setVerificationToken(''); setOtp(''); setMessage('') }
  }

  const sendOtp = async () => {
    const email = form.email.trim().toLowerCase()
    if (!email.endsWith(COLLEGE_DOMAIN)) { setError(`Enter a valid ${COLLEGE_DOMAIN} email first.`); return }
    setError(''); setMessage(''); setSendingOtp(true)
    try {
      const { data } = await client.post('/auth/registration/send-otp', { email }, { skipAuth: true })
      setMessage(data.message)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Unable to send the verification code.')
    } finally { setSendingOtp(false) }
  }

  const verifyOtp = async () => {
    setError(''); setVerifyingOtp(true)
    try {
      const { data } = await client.post('/auth/registration/verify-otp', { email: form.email.trim().toLowerCase(), otp }, { skipAuth: true })
      setVerificationToken(data.verification_token)
      setMessage('Email verified. You can now create your account.')
    } catch (err) {
      setError(err.response?.data?.detail ?? 'The verification code could not be confirmed.')
    } finally { setVerifyingOtp(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('')
    const validationError = validate(form, departmentId, verificationToken)
    if (validationError) { setError(validationError); return }
    setLoading(true)
    try {
      await register(form.college_id, form.email, form.password, form.confirm_password, departmentId, verificationToken)
      setSuccess(true); setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  if (success) return <div className="premium-page"><div className="premium-card text-center"><CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" /><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Account created</h2><p className="mt-2 text-sm text-slate-500">Redirecting you to sign in…</p></div></div>

  return (
    <div className="premium-page py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center"><div className="brand-mark mx-auto mb-4">S</div><p className="eyebrow">MSRIT · SDG WORKFLOW</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Create your account</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">A focused space for meaningful work.</p></div>
        <div className="premium-card">
          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {message && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</div>}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Field id="college_id" label="College ID" placeholder="e.g. 1MS21CS001" value={form.college_id} onChange={set('college_id')} autoComplete="username" />
            <div><label htmlFor="email" className="form-label">College email</label><div className="flex gap-2"><input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder={`you${COLLEGE_DOMAIN}`} className="form-input min-w-0" /><button type="button" onClick={sendOtp} disabled={sendingOtp || verificationToken} className="secondary-button shrink-0">{verificationToken ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{sendingOtp ? 'Sending' : verificationToken ? 'Verified' : 'Send code'}</button></div></div>
            {!verificationToken && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60"><label htmlFor="otp" className="form-label">Verification code</label><div className="flex gap-2"><input id="otp" inputMode="numeric" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className="form-input min-w-0 tracking-[0.28em]" /><button type="button" onClick={verifyOtp} disabled={otp.length !== 6 || verifyingOtp} className="secondary-button shrink-0">{verifyingOtp ? 'Checking' : 'Verify'}</button></div><p className="mt-2 text-xs text-slate-500">We will send a code that expires in 10 minutes.</p></div>}
            <PasswordField id="password" label="Password" value={form.password} onChange={set('password')} visible={showPassword} onToggle={() => setShowPassword(v => !v)} autoComplete="new-password" />
            <PasswordField id="confirm_password" label="Confirm password" value={form.confirm_password} onChange={set('confirm_password')} visible={showConfirmation} onToggle={() => setShowConfirmation(v => !v)} autoComplete="new-password" />
            <div><label htmlFor="department" className="form-label">Department</label><select id="department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="form-input"><option value="">Select your department</option>{departments.map(d => <option key={d._id} value={d._id}>{d.name} ({d.code})</option>)}</select></div>
            <button type="submit" disabled={loading || !verificationToken} className="primary-button w-full">{loading ? 'Creating account…' : 'Create account'}</button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">Already registered? <Link to="/login" className="font-medium text-slate-900 underline underline-offset-4 dark:text-white">Sign in</Link></p>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, placeholder, value, onChange, autoComplete }) { return <div><label htmlFor={id} className="form-label">{label}</label><input id={id} required placeholder={placeholder} value={value} onChange={onChange} autoComplete={autoComplete} className="form-input" /></div> }
function PasswordField({ id, label, value, onChange, visible, onToggle, autoComplete }) { return <div><label htmlFor={id} className="form-label">{label}</label><div className="relative"><input id={id} required type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} className="form-input pr-11" /><button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div> }

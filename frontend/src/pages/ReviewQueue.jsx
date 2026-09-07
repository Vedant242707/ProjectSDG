import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, XCircle, ExternalLink, X, Inbox } from 'lucide-react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {t.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ─── Approve modal ────────────────────────────────────────────────────────────

function ApproveModal({ submission, onConfirm, onClose, loading }) {
  const [note, setNote] = useState('')
  const isCommitteeReturn = submission.status === 'REJECTED_COMM'
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        {isCommitteeReturn ? 'Resubmit to committee?' : 'Approve submission?'}
      </h2>
      <p className="mb-4 text-sm text-gray-500 truncate">
        <span className="font-medium text-gray-700">{submission.title}</span>
        {' · '}
        <span className="font-mono">{submission.submission_id}</span>
      </p>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Note <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={isCommitteeReturn ? 'Any response to the committee feedback…' : 'Any remarks for the submitter…'}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
      />
      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(note)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {isCommitteeReturn ? 'Resubmit' : 'Approve'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

const MIN_NOTE = 10

function RejectModal({ submission, onConfirm, onClose, loading }) {
  const [note, setNote] = useState('')
  const isCommitteeReturn = submission.status === 'REJECTED_COMM'
  const tooShort = note.trim().length > 0 && note.trim().length < MIN_NOTE
  const canSubmit = note.trim().length >= MIN_NOTE

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        {isCommitteeReturn ? 'Return to submitter?' : 'Reject submission?'}
      </h2>
      <p className="mb-4 text-sm text-gray-500 truncate">
        <span className="font-medium text-gray-700">{submission.title}</span>
        {' · '}
        <span className="font-mono">{submission.submission_id}</span>
      </p>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Rejection reason <span className="text-red-500">*</span>
      </label>
      <textarea
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={isCommitteeReturn
          ? 'Explain what the submitter needs to revise (min. 10 characters)…'
          : 'Explain why this submission is being rejected (min. 10 characters)…'}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
          tooShort
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
            : 'border-gray-300 focus:border-red-500 focus:ring-red-500/20'
        }`}
      />
      {tooShort && (
        <p className="mt-1.5 text-xs text-red-600">
          Reason must be at least {MIN_NOTE} characters ({note.trim().length}/{MIN_NOTE})
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(note)}
          disabled={!canSubmit || loading}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Reject
        </button>
      </div>
    </Modal>
  )
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function Modal({ children, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-900/10">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

// ─── SDG tag chips ────────────────────────────────────────────────────────────

const SDG_COLORS = Array(17).fill('#0ea5e9')

function SdgChip({ n }) {
  const color = SDG_COLORS[n - 1] ?? '#6B7280'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      SDG {n}
    </span>
  )
}

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({ sub, onApprove, onReject }) {
  const isCommitteeReturn = sub.status === 'REJECTED_COMM'
  const submitted = sub.updated_at ?? sub.created_at
  const dateStr = submitted ? new Date(submitted).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{sub.submission_id}</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {sub.type}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-gray-900 leading-snug">{sub.title}</h3>
        </div>

        {/* View link */}
        <Link
          to={`/submissions/${sub._id}`}
          className="flex shrink-0 items-center gap-1 rounded-md text-sm text-gray-400 hover:text-blue-600"
          title="Open detail"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 px-5 py-3 text-sm sm:grid-cols-4">
        <Meta label="Submitter" value={sub.submitter_email ?? sub.submitter_id ?? '—'} />
        <Meta label="Department" value={sub.department_name ?? sub.department_code ?? '—'} />
        <Meta label="Submitted" value={dateStr} />
        <div>
          <span className="block text-xs font-medium uppercase tracking-wide text-gray-400">SDG Tags</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {sub.sdg_tags?.length > 0
              ? sub.sdg_tags.map((n) => <SdgChip key={n} n={n} />)
              : <span className="text-gray-400">—</span>}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        <button
          onClick={() => onReject(sub)}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <XCircle className="h-4 w-4" />
          {isCommitteeReturn ? 'Return to Submitter' : 'Reject'}
        </button>
        <button
          onClick={() => onApprove(sub)}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
        >
          <CheckCircle className="h-4 w-4" />
          {isCommitteeReturn ? 'Resubmit to Committee' : 'Approve'}
        </button>
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <span className="block text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className="mt-0.5 block truncate text-sm text-gray-800">{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  const { user } = useAuth()

  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])

  // Modal state: { type: 'approve'|'reject', submission }
  const [modal, setModal] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  const isHod = user?.role === 'HOD'
  const heading = isHod ? 'Department Review Queue' : 'Pending Committee Review'

  const pushToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get('/submissions/pending')
      setSubmissions(Array.isArray(data) ? data : (data.submissions ?? []))
    } catch {
      pushToast('Failed to load submissions.', 'error')
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => { load() }, [load])

  const handleApprove = async (note) => {
    setActionLoading(true)
    try {
      const isCommitteeReturn = modal.submission.status === 'REJECTED_COMM'
      const action = isCommitteeReturn ? 'resubmit' : 'approve'
      await client.post(`/submissions/${modal.submission._id}/${action}`, { note: note || '' })
      setSubmissions((prev) => prev.filter((s) => s._id !== modal.submission._id))
      pushToast(isCommitteeReturn ? 'Submission resubmitted to the committee.' : 'Submission approved.')
      setModal(null)
    } catch (err) {
      pushToast(err.response?.data?.detail ?? 'Approval failed.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (note) => {
    setActionLoading(true)
    try {
      await client.post(`/submissions/${modal.submission._id}/reject`, { note })
      setSubmissions((prev) => prev.filter((s) => s._id !== modal.submission._id))
      pushToast(modal.submission.status === 'REJECTED_COMM'
        ? 'Submission returned to the submitter.'
        : 'Submission rejected and returned.')
      setModal(null)
    } catch (err) {
      pushToast(err.response?.data?.detail ?? 'Rejection failed.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Page heading */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
            {!loading && (
              <p className="mt-0.5 text-sm text-gray-500">
                {submissions.length === 0
                  ? 'Nothing pending right now.'
                  : `${submissions.length} submission${submissions.length !== 1 ? 's' : ''} awaiting action`}
              </p>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Loading submissions…
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <Inbox className="h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-500">No submissions pending your review.</p>
            <p className="text-sm text-gray-400">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {submissions.map((sub) => (
              <SubmissionCard
                key={sub._id}
                sub={sub}
                onApprove={(s) => setModal({ type: 'approve', submission: s })}
                onReject={(s) => setModal({ type: 'reject', submission: s })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal?.type === 'approve' && (
        <ApproveModal
          submission={modal.submission}
          onConfirm={handleApprove}
          onClose={() => setModal(null)}
          loading={actionLoading}
        />
      )}
      {modal?.type === 'reject' && (
        <RejectModal
          submission={modal.submission}
          onConfirm={handleReject}
          onClose={() => setModal(null)}
          loading={actionLoading}
        />
      )}

      <Toast toasts={toasts} />
    </>
  )
}

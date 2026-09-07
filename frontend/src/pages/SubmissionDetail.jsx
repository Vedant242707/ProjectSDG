import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, ArrowRight, RotateCcw, Clock,
  Upload, Trash2, Download, Wifi, WifiOff, FileText, AlertCircle, X,
} from 'lucide-react'
import client, { KEYS } from '../api/client'
import { useAuth } from '../context/AuthContext'
import SDGTagPicker from '../components/SDGTagPicker'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  DRAFT:               'bg-gray-100 text-gray-700',
  PENDING_HOD:         'bg-yellow-100 text-yellow-800',
  PENDING_COMMITTEE:   'bg-blue-100 text-blue-800',
  APPROVED:            'bg-green-100 text-green-800',
  REJECTED_HOD:        'bg-red-100 text-red-800',
  REJECTED_COMM:       'bg-red-100 text-red-800',
  WITHDRAWN:           'bg-gray-100 text-gray-600',
}

const STATUS_LABEL = {
  DRAFT:               'Draft',
  PENDING_HOD:         'Pending HOD Review',
  PENDING_COMMITTEE:   'Pending Committee Review',
  APPROVED:            'Approved',
  REJECTED_HOD:        'Rejected by HOD',
  REJECTED_COMM:       'Rejected by Committee',
  WITHDRAWN:           'Withdrawn',
}

const SDG_COLORS = Array(17).fill('#0ea5e9')

// Computed future steps to show dimmed at the bottom of the timeline
const FUTURE_STEPS = {
  DRAFT:               ['HOD Review', 'Committee Review', 'Approved & Published'],
  PENDING_HOD:         ['Committee Review', 'Approved & Published'],
  PENDING_COMMITTEE:   ['Approved & Published'],
  APPROVED:            [],
  REJECTED_HOD:        [],
  REJECTED_COMM:       [],
  WITHDRAWN:           [],
}

const EVENT_CFG = {
  SUBMIT:   { Icon: ArrowRight,   ring: 'ring-blue-500',  bg: 'bg-blue-50',   text: 'text-blue-700',  label: 'Submitted'    },
  APPROVE:  { Icon: CheckCircle2, ring: 'ring-green-500', bg: 'bg-green-50',  text: 'text-green-700', label: 'Approved'     },
  REJECT:   { Icon: XCircle,      ring: 'ring-red-500',   bg: 'bg-red-50',    text: 'text-red-700',   label: 'Rejected'     },
  RESUBMIT: { Icon: RotateCcw,    ring: 'ring-amber-500', bg: 'bg-amber-50',  text: 'text-amber-700', label: 'Resubmitted'  },
}

// ─── WebSocket hook ───────────────────────────────────────────────────────────

function useSubmissionWs(submissionId, onMessage) {
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage   // always current without re-connecting

  useEffect(() => {
    let unmounted = false
    let attempts = 0

    function connect() {
      if (unmounted) return
      const token = localStorage.getItem(KEYS.ACCESS)
      const ws = new WebSocket(`/ws/submissions/${submissionId}?token=${token}`)

      ws.onopen = () => { attempts = 0 }
      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)) } catch { /* non-JSON ping/pong */ }
      }
      ws.onclose = (ev) => {
        // 4001 = bad token, 4004 = not found — don't retry these
        if (unmounted || ev.code === 4001 || ev.code === 4004) return
        const delay = Math.min(1000 * 2 ** attempts, 30_000)
        attempts++
        setTimeout(connect, delay)
      }
      ws.onerror = () => ws.close()

      return ws
    }

    const ws = connect()
    return () => {
      unmounted = true
      ws?.close()
    }
  }, [submissionId])
}

// ─── Small shared components ──────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function SdgChip({ n }) {
  const color = SDG_COLORS[n - 1] ?? '#6B7280'
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      SDG {n}
    </span>
  )
}

function MetaItem({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

// ─── Attachments ──────────────────────────────────────────────────────────────

function AttachmentRow({ att, index, canDelete, onDelete, onPreview }) {
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      const { data } = await client.get(`/files/${att.object_name}`, { responseType: 'blob' })
      const fileUrl = URL.createObjectURL(data)
      onPreview({ url: fileUrl, name: att.original_filename, contentType: att.content_type })
    } catch {
      /* ignore — server may be unavailable */
    } finally {
      setDownloading(false)
    }
  }

  const sizeKb = att.size ? `${(att.size / 1024).toFixed(1)} KB` : null

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate text-sm text-gray-800">{att.original_filename}</span>
        {sizeKb && <span className="shrink-0 text-xs text-gray-400">{sizeKb}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={download}
          disabled={downloading}
          className={`flex items-center gap-1 rounded-md text-xs font-medium text-blue-600 transition hover:scale-105 hover:text-blue-800 disabled:opacity-50 ${downloading ? 'attachment-opening' : ''}`}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? 'Opening…' : 'View / download'}
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(index)}
            className="rounded-md p-0.5 text-red-400 hover:text-red-600"
            aria-label="Delete file"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function AttachmentPreview({ preview, onClose }) {
  if (!preview) return null
  const isImage = preview.contentType === 'image/jpeg'
  return (
    <div className="attachment-preview-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <section className="attachment-preview-window flex h-[min(82vh,760px)] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-cyan-500" /><p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{preview.name}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close attachment preview"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 bg-slate-100 p-3 dark:bg-slate-900">
          {isImage ? <img src={preview.url} alt={preview.name} className="h-full w-full object-contain" /> : <iframe title={preview.name} src={preview.url} className="h-full w-full rounded-lg bg-white" />}
        </div>
      </section>
    </div>
  )
}

function AttachmentsCard({ attachments, canUpload, onUpload, onDelete }) {
  const fileRef = useRef()
  const [preview, setPreview] = useState(null)

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }
  const openPreview = (nextPreview) => {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return nextPreview
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Attachments</h2>
        {canUpload && (
          <>
            <button
              onClick={() => fileRef.current.click()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload file
            </button>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,.pdf,.jpg,.jpeg" className="hidden" onChange={onUpload} />
          </>
        )}
      </div>
      {attachments?.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((att, i) => (
            <AttachmentRow
              key={att.object_name ?? i}
              att={att}
              index={i}
              canDelete={canUpload}
              onDelete={onDelete}
              onPreview={openPreview}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">No attachments yet.</p>
      )}
      <AttachmentPreview preview={preview} onClose={closePreview} />
    </div>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function TimelineEventNode({ event, isLast }) {
  const cfg = EVENT_CFG[event.action] ?? EVENT_CFG.SUBMIT
  const { Icon } = cfg
  const ts = new Date(event.timestamp).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="flex gap-4">
      {/* Spine */}
      <div className="flex flex-col items-center">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ${cfg.ring} ${cfg.bg}`}>
          <Icon className={`h-4 w-4 ${cfg.text}`} />
        </div>
        {!isLast && <div className="mt-1 w-0.5 flex-1 bg-gray-200" />}
      </div>

      {/* Content */}
      <div className={`pb-6 ${isLast ? '' : ''}`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
          <span className="text-xs text-gray-400">by {event.actor_role.replace('_', ' ')}</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">{ts}</p>
        {event.note && (
          <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${event.action === 'REJECT' ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'}`}>
            {event.action === 'REJECT' && (
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-red-700">
                <AlertCircle className="h-3 w-3" /> Rejection reason
              </div>
            )}
            {event.note}
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineCurrentNode({ status, isLast }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 ring-2 ring-blue-300">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
        </div>
        {!isLast && <div className="mt-1 w-0.5 flex-1 border-l-2 border-dashed border-gray-200" />}
      </div>
      <div className="pb-6">
        <span className="text-sm font-semibold text-blue-600">{STATUS_LABEL[status] ?? status}</span>
        <p className="mt-0.5 text-xs text-gray-400">Current state</p>
      </div>
    </div>
  )
}

function TimelineFutureNode({ label, isLast }) {
  return (
    <div className="flex gap-4 opacity-40">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-white">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
        </div>
        {!isLast && <div className="mt-1 w-0.5 flex-1 border-l-2 border-dashed border-gray-200" />}
      </div>
      <div className="pb-6">
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
    </div>
  )
}

function Timeline({ events, status, wsConnected }) {
  const futureSteps = FUTURE_STEPS[status] ?? []

  // Current node is shown if status is a pending/draft state, not a terminal one
  const showCurrent = !['APPROVED', 'REJECTED_HOD', 'REJECTED_COMM', 'WITHDRAWN'].includes(status)

  // Total nodes for isLast calculation
  const totalNodes = events.length + (showCurrent ? 1 : 0) + futureSteps.length

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Status Timeline</h2>
        <span
          title={wsConnected ? 'Live updates active' : 'Reconnecting…'}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            wsConnected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {wsConnected
            ? <><Wifi className="h-3 w-3" /> Live</>
            : <><WifiOff className="h-3 w-3" /> Offline</>
          }
        </span>
      </div>

      {events.length === 0 && !showCurrent && (
        <p className="text-sm text-gray-400">No history yet.</p>
      )}

      <div>
        {events.map((ev, i) => (
          <TimelineEventNode
            key={ev._id}
            event={ev}
            isLast={i === totalNodes - 1}
          />
        ))}

        {showCurrent && (
          <TimelineCurrentNode
            status={status}
            isLast={events.length === totalNodes - futureSteps.length - 1}
          />
        )}

        {futureSteps.map((label, i) => (
          <TimelineFutureNode
            key={label}
            label={label}
            isLast={events.length + (showCurrent ? 1 : 0) + i === totalNodes - 1}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Resubmit section (REJECTED_HOD → submitter edits + resubmits) ────────────

function ResubmitSection({ sub, onResubmit, busy }) {
  const [form, setForm] = useState({
    title: sub.title,
    description: sub.description,
    type: sub.type,
    sdg_tags: sub.sdg_tags ?? [],
    note: '',
  })
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-1 text-base font-semibold text-amber-900">Revise &amp; Resubmit</h2>
      <p className="mb-4 text-sm text-amber-700">
        Address the reviewer&apos;s feedback, update the fields below, then resubmit.
      </p>

      <div className="space-y-4 rounded-lg bg-white p-4 ring-1 ring-amber-200">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={form.title}
            onChange={set('title')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea
            rows={5}
            value={form.description}
            onChange={set('description')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select
            value={form.type}
            onChange={set('type')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            {['PROJECT','RESEARCH','EVENT','ACHIEVEMENT'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">SDG Tags</label>
          <SDGTagPicker
            selected={form.sdg_tags}
            onChange={(tags) => setForm((p) => ({ ...p, sdg_tags: tags }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Note to reviewer <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={form.note}
            onChange={set('note')}
            placeholder="Explain what you changed…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
      </div>

      <button
        disabled={busy || form.sdg_tags.length === 0}
        onClick={() => onResubmit(form)}
        className="mt-4 flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
        <RotateCcw className="h-4 w-4" />
        Resubmit for Review
      </button>
    </div>
  )
}

// HOD resubmitting a committee-rejected submission (no content edit, just a note)
function HodResubmitSection({ onResubmit, busy }) {
  const [note, setNote] = useState('')

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-1 text-base font-semibold text-amber-900">Resubmit to Committee</h2>
      <p className="mb-4 text-sm text-amber-700">
        This submission was rejected by the committee. As HOD you can resubmit it after addressing the concerns.
      </p>
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note to the committee…"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
      />
      <button
        disabled={busy}
        onClick={() => onResubmit({ note })}
        className="mt-3 flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
        <RotateCcw className="h-4 w-4" />
        Resubmit to Committee
      </button>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SubmissionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [sub, setSub] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState('')
  const [wsConnected, setWsConnected] = useState(false)

  const loadSubmission = useCallback(async () => {
    const { data } = await client.get(`/submissions/${id}`)
    setSub(data)
    return data
  }, [id])

  const loadTimeline = useCallback(async () => {
    const { data } = await client.get(`/submissions/${id}/timeline`)
    setTimeline(Array.isArray(data) ? data : [])
  }, [id])

  useEffect(() => {
    Promise.all([loadSubmission(), loadTimeline()])
      .catch(() => navigate('/submissions'))
      .finally(() => setLoading(false))
  }, [loadSubmission, loadTimeline, navigate])

  // WebSocket: on status_update message, update the badge and re-fetch timeline
  const handleWsMessage = useCallback((msg) => {
    if (msg.status) {
      setSub((prev) => prev ? { ...prev, status: msg.status } : prev)
      setWsConnected(true)
      // Re-fetch timeline to get the full event with actor and note
      loadTimeline()
    }
  }, [loadTimeline])

  useSubmissionWs(id, handleWsMessage)

  // Track WS connectivity via the initial message (sent on connect)
  useEffect(() => {
    setWsConnected(false)   // reset on id change until first WS message
  }, [id])

  const withAction = async (fn) => {
    setError('')
    setActionBusy(true)
    try {
      await fn()
      await Promise.all([loadSubmission(), loadTimeline()])
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Action failed. Please try again.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleSubmit = () => withAction(() => client.post(`/submissions/${id}/submit`))

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    withAction(() => client.post(`/submissions/${id}/files`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }))
    e.target.value = ''   // reset input so same file can be re-selected
  }

  const handleDeleteFile = (idx) => withAction(() => client.delete(`/submissions/${id}/files/${idx}`))

  const handleResubmit = (body) => withAction(() => client.post(`/submissions/${id}/resubmit`, body))

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        Loading submission…
      </div>
    )
  }

  if (!sub) return null

  const isOwner    = user?.id === sub.submitter_id
  const isHod      = user?.role === 'HOD'
  const canUpload  = isOwner && ['DRAFT', 'REJECTED_HOD'].includes(sub.status)
  const canSubmit  = isOwner && sub.status === 'DRAFT'
  const showOwnerResubmit = isOwner && sub.status === 'REJECTED_HOD'
  const showHodResubmit   = isHod   && sub.status === 'REJECTED_COMM'

  const createdAt = new Date(sub.created_at).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const updatedAt = new Date(sub.updated_at).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{sub.submission_id}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {sub.type}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">{sub.title}</h1>
        </div>
        <StatusBadge status={sub.status} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Two-column grid: info left, timeline right ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Description + meta */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Description</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{sub.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-4">
              <MetaItem label="Created">
                <span className="text-sm text-gray-700">{createdAt}</span>
              </MetaItem>
              <MetaItem label="Updated">
                <span className="text-sm text-gray-700">{updatedAt}</span>
              </MetaItem>
              <MetaItem label="SDG Tags">
                <div className="mt-1 flex flex-wrap gap-1">
                  {sub.sdg_tags?.map((n) => <SdgChip key={n} n={n} />)}
                </div>
              </MetaItem>
            </div>
          </div>

          {/* Attachments */}
          <AttachmentsCard
            attachments={sub.attachments}
            canUpload={canUpload}
            onUpload={handleUpload}
            onDelete={handleDeleteFile}
          />

          {/* Actions */}
          {canSubmit && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm text-gray-600">
                Ready to submit? This will send the submission to your department HOD for review.
              </p>
              <button
                disabled={actionBusy}
                onClick={handleSubmit}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                <ArrowRight className="h-4 w-4" />
                Submit for HOD Review
              </button>
            </div>
          )}

          {showOwnerResubmit && (
            <ResubmitSection sub={sub} onResubmit={handleResubmit} busy={actionBusy} />
          )}

          {showHodResubmit && (
            <HodResubmitSection onResubmit={handleResubmit} busy={actionBusy} />
          )}
        </div>

        {/* Right column: timeline */}
        <div className="lg:col-span-1">
          <Timeline events={timeline} status={sub.status} wsConnected={wsConnected} />
        </div>
      </div>
    </div>
  )
}

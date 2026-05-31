import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, FileStack, Wifi, WifiOff, LogIn } from 'lucide-react'

// ─── SDG metadata ─────────────────────────────────────────────────────────────

const SDG_COLORS = [
  '#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21',
  '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367',
  '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B',
  '#00689D', '#19486A',
]

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return '—'
  const sec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (sec < 60)     return 'just now'
  if (sec < 3_600)  return `${Math.floor(sec / 60)} min ago`
  if (sec < 86_400) return `${Math.floor(sec / 3_600)} hr ago`
  return new Date(isoString).toLocaleString()
}

// ─── Live badge ───────────────────────────────────────────────────────────────

function LiveBadge({ connected, lastUpdated }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {connected ? (
        <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-green-700 ring-1 ring-green-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live
        </span>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-gray-500">
          <WifiOff className="h-3 w-3" />
          Reconnecting…
        </span>
      )}
      {lastUpdated && (
        <span className="hidden text-gray-400 sm:block">
          Updated {timeAgo(lastUpdated)}
        </span>
      )}
    </div>
  )
}

// ─── Stat card (totals) ───────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}18` }}
        >
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </span>
      </div>
      <p
        className="text-5xl font-extrabold tracking-tight"
        style={{ color: accent }}
      >
        {value ?? '—'}
      </p>
    </div>
  )
}

// ─── SDG card ─────────────────────────────────────────────────────────────────

function SdgCard({ sdg }) {
  const color = SDG_COLORS[sdg.sdg_number - 1]
  const hasActivity = sdg.total_approved > 0 || sdg.in_review > 0

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
      style={{ borderTop: `4px solid ${color}` }}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-3" style={{ background: `${color}0f` }}>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          SDG {sdg.sdg_number}
        </span>
        <p className="mt-2 text-sm font-semibold leading-snug text-gray-900">
          {sdg.sdg_name}
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-1 flex-col justify-end px-4 py-3">
        <div className="space-y-1.5">
          <Stat label="Approved"   value={sdg.total_approved}       color="#16a34a" />
          <Stat label="In Review"  value={sdg.in_review}            color="#d97706" />
          <Stat label="This Year"  value={sdg.completed_this_year}  color="#2563eb" />
        </div>

        {/* Mini activity bar */}
        {hasActivity && (
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, ((sdg.total_approved + sdg.in_review) / Math.max(1, sdg.total_approved + sdg.in_review)) * 100)}%`,
                background: color,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold tabular-nums" style={{ color: value > 0 ? color : '#9ca3af' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Department bar chart ─────────────────────────────────────────────────────

function DeptBars({ departments }) {
  if (!departments?.length) return null
  const max = Math.max(...departments.map((d) => d.count), 1)

  return (
    <div className="space-y-3">
      {departments.map((dept) => {
        const pct = Math.round((dept.count / max) * 100)
        return (
          <div key={dept.department_code} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-right text-sm font-medium text-gray-700">
              {dept.department_code}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 flex items-center rounded-md bg-blue-600 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
                <span className="relative z-10 px-2 text-xs font-medium text-white drop-shadow">
                  {dept.department_name}
                </span>
              </div>
              <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-gray-700">
                {dept.count}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [summary, setSummary]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [sseConnected, setSseConnected] = useState(false)
  const esRef = useRef(null)

  // Initial data fetch
  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // SSE live updates — EventSource handles reconnection automatically
  useEffect(() => {
    const es = new EventSource('/api/dashboard/stream')
    esRef.current = es

    es.addEventListener('dashboard_update', (e) => {
      try {
        setSummary(JSON.parse(e.data))
        setSseConnected(true)
      } catch { /* ignore malformed */ }
    })

    es.onopen  = () => setSseConnected(true)
    es.onerror = () => setSseConnected(false)  // EventSource will auto-retry

    return () => { es.close(); setSseConnected(false) }
  }, [])

  const totals = summary?.totals
  const sdgs   = summary?.sdg_breakdown ?? []
  const depts  = summary?.department_breakdown ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Topbar ── */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              S
            </div>
            <span className="font-semibold text-gray-900">SDG Workflow</span>
            <span className="hidden text-sm text-gray-400 sm:block">· MSRIT</span>
          </div>
          <div className="flex items-center gap-4">
            <LiveBadge connected={sseConnected} lastUpdated={summary?.last_updated} />
            <Link
              to="/login"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:block">Sign in</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ── Hero ── */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            SDG Impact Dashboard
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-gray-500 sm:text-lg">
            Tracking MSRIT&apos;s contributions to the UN Sustainable Development Goals
            through research, projects, events, and initiatives.
          </p>
        </div>

        {/* ── Totals ── */}
        <section className="mb-10">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Total Submissions"
                value={totals?.total_submissions}
                icon={FileStack}
                accent="#2563eb"
              />
              <StatCard
                label="Total Approved"
                value={totals?.total_approved}
                icon={CheckCircle2}
                accent="#16a34a"
              />
              <StatCard
                label="Currently In Review"
                value={totals?.total_in_review}
                icon={Clock}
                accent="#d97706"
              />
            </div>
          )}
        </section>

        {/* ── SDG Breakdown ── */}
        <section className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">SDG Contributions</h2>
            <span className="text-sm text-gray-400">17 Goals</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 17 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sdgs.map((sdg) => <SdgCard key={sdg.sdg_number} sdg={sdg} />)}
            </div>
          )}
        </section>

        {/* ── Department breakdown ── */}
        {(loading || depts.length > 0) && (
          <section>
            <h2 className="mb-5 text-xl font-bold text-gray-900">By Department</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <DeptBars departments={depts} />
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'

// ─── SDG metadata ──────────────────────────────────────────────────────────────

const SDG_COLORS = Array(17).fill('#B85C4A')

// ─── SDG Card — just name + total count ───────────────────────────────────────

function SdgCard({ sdg }) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const total = sdg.total_approved ?? 0
  const color = SDG_COLORS[sdg.sdg_number - 1]

  const openDetail = (event) => {
    event.preventDefault()
    if (opening) return
    setOpening(true)
    window.setTimeout(() => navigate(`/sdg/${sdg.sdg_number}`), 360)
  }

  return (
    <Link
      to={`/sdg/${sdg.sdg_number}`}
      onClick={openDetail}
      className={`goal-card group relative flex flex-col overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-[0_8px_24px_rgba(184,92,74,0.16)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(184,92,74,0.28)] dark:border-cyan-900/60 dark:bg-slate-900 ${opening ? 'goal-card-opening' : ''}`}
    >
      <div className="px-4 pt-4 pb-3" style={{ background: `linear-gradient(135deg, ${color}24, ${color}08)` }}>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          SDG {sdg.sdg_number}
        </span>
        <p className="mt-2 text-sm font-semibold leading-snug text-gray-900">{sdg.sdg_name}</p>
      </div>
      <div className="flex flex-1 flex-col justify-end px-4 py-3">
        <div className="text-center text-2xl font-extrabold tracking-tight" style={{ color }}>
          {total}
        </div>
        <p className="mt-0.5 text-center text-xs text-gray-400">approved projects</p>
      </div>
    </Link>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard({ embedded = false }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sdgs = summary?.sdg_breakdown ?? []

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50 dark:bg-slate-950'}>
      {!embedded && <header className="border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-950">S</div>
            <span className="font-semibold text-slate-900 dark:text-white">SDG Workflow</span>
            <span className="hidden text-sm text-gray-400 sm:block">· MSRIT</span>
          </div>
          <Link
            to="/login"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:block">Sign in</span>
          </Link>
        </div>
      </header>}

      <main className={embedded ? 'mx-auto max-w-7xl' : 'mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8'}>
        <section className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <div><p className="eyebrow">OVERVIEW</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">SDG Contributions</h2></div>
            <span className="text-sm text-gray-400">17 Goals</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 17 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sdgs.map(sdg => <SdgCard key={sdg.sdg_number} sdg={sdg} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

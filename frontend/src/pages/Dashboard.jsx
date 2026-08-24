import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'

// ─── SDG metadata ──────────────────────────────────────────────────────────────

const SDG_COLORS = [
  '#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21',
  '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367',
  '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B',
  '#00689D', '#19486A',
]

// ─── SDG Card — just name + total count ───────────────────────────────────────

function SdgCard({ sdg }) {
  const total = sdg.total_approved ?? 0
  const color = SDG_COLORS[sdg.sdg_number - 1]

  return (
    <Link
      to={`/sdg/${sdg.sdg_number}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="px-4 pt-4 pb-3" style={{ background: `${color}0f` }}>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          SDG {sdg.sdg_number}
        </span>
        <p className="mt-2 text-sm font-semibold leading-snug text-gray-900">{sdg.sdg_name}</p>
      </div>
      <div className="flex flex-1 flex-col justify-end px-4 py-3">
        <div className="text-center text-2xl font-extrabold" style={{ color }}>
          {total}
        </div>
        <p className="mt-0.5 text-center text-xs text-gray-400">approved projects</p>
      </div>
    </Link>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">S</div>
            <span className="font-semibold text-gray-900">SDG Workflow</span>
            <span className="hidden text-sm text-gray-400 sm:block">· MSRIT</span>
          </div>
          <Link
            to="/login"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:block">Sign in</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">SDG Contributions</h2>
            <span className="text-sm text-gray-400">17 Goals</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// ─── SDG metadata ──────────────────────────────────────────────────────────────

const SDG_COLORS = [
  '#E5243B', '#DDA63A', '#4C9F38', '#C5192D', '#FF3A21',
  '#26BDE2', '#FCC30B', '#A21942', '#FD6925', '#DD1367',
  '#FD9D24', '#BF8B2E', '#3F7E44', '#0A97D9', '#56C02B',
  '#00689D', '#19486A',
]

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES = {
  ongoing:   'bg-yellow-50 text-yellow-700 border border-yellow-200',
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  approved:  'bg-green-50 text-green-700 border border-green-200',
  rejected:  'bg-red-50 text-red-700 border border-red-200',
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-700 border border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SdgDetail() {
  const { number } = useParams()
  const sdgNumber = parseInt(number, 10)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const color = SDG_COLORS[sdgNumber - 1] ?? '#26BDE2'

  useEffect(() => {
    if (!sdgNumber || sdgNumber < 1 || sdgNumber > 17) {
      setError('Invalid SDG number.')
      setLoading(false)
      return
    }
    fetch(`/api/dashboard/sdg/${sdgNumber}/details`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(setData)
      .catch(() => setError('Failed to load SDG details.'))
      .finally(() => setLoading(false))
  }, [sdgNumber])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All SDGs
        </Link>

        {loading && (
          <div className="space-y-4">
            <div className="h-20 animate-pulse rounded-xl bg-gray-200" />
            <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
            <div className="h-72 animate-pulse rounded-xl bg-gray-200" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-6">
            {/* SDG title card */}
            <div
              className="rounded-xl p-6"
              style={{ background: `${color}18`, borderLeft: `4px solid ${color}` }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="shrink-0 rounded-full px-3 py-1 text-sm font-bold text-white"
                  style={{ background: color }}
                >
                  SDG {data.sdg_number}
                </span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{data.sdg_name}</h1>
                  <p className="mt-1 text-sm text-gray-500">{data.total} total submission{data.total !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Status breakdown */}
            {Object.keys(data.status_breakdown ?? {}).length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Breakdown by Status</h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(data.status_breakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
                      <StatusBadge status={status} />
                      <span className="text-sm font-semibold text-gray-700">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Department breakdown */}
            {data.department_breakdown?.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-base font-semibold text-gray-900">Department Breakdown</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {data.department_breakdown.map(dept => (
                    <div key={dept.department_code} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{dept.department_name}</span>
                        <span className="ml-2 font-mono text-xs text-gray-400">{dept.department_code}</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color }}>
                        {dept.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submission list */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">All Submissions</h2>
              </div>

              {data.submissions?.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No submissions yet for this SDG.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                        <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Department</th>
                        <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted by</th>
                        <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.submissions.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/60">
                          <td className="px-5 py-3 text-sm font-medium text-gray-800">{sub.title}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {sub.department_name}
                            <span className="ml-1.5 font-mono text-xs text-gray-400">{sub.department_code}</span>
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">{sub.submitter_email}</td>
                          <td className="px-5 py-3">
                            <StatusBadge status={sub.status?.toLowerCase?.() ?? sub.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

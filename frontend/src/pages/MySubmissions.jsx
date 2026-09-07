import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'

const STATUS_COLORS = {
  DRAFT:              'bg-gray-100 text-gray-700',
  PENDING_HOD:        'bg-yellow-100 text-yellow-800',
  PENDING_COMMITTEE:  'bg-blue-100 text-blue-800',
  APPROVED:           'bg-green-100 text-green-800',
  REJECTED_HOD:       'bg-red-100 text-red-800',
  REJECTED_COMM:      'bg-red-100 text-red-800',
  WITHDRAWN:          'bg-gray-100 text-gray-600',
}

const STATUS_LABEL = {
  DRAFT:              'Draft',
  PENDING_HOD:        'Pending HOD',
  PENDING_COMMITTEE:  'Pending Committee',
  APPROVED:           'Approved',
  REJECTED_HOD:       'Rejected by HOD',
  REJECTED_COMM:      'Rejected by Committee',
  WITHDRAWN:          'Withdrawn',
}

export default function MySubmissions() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/submissions/my').then(({ data }) => setSubmissions(data.submissions ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Submissions</h1>
        <Link
          to="/submissions/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Submission
        </Link>
      </div>

      {submissions.length === 0 ? (
        <p className="text-gray-500">No submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <Link
              key={s._id}
              to={`/submissions/${s._id}`}
              className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{s.title}</p>
                  <p className="mt-1 text-sm text-gray-500">{s.submission_id}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.sdg_tags?.map((n) => (
                  <span key={n} className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-cyan-950/50 dark:text-cyan-300">SDG {n}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

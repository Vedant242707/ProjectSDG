import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import SDGTagPicker from '../components/SDGTagPicker'

const SUBMISSION_TYPES = ['PROJECT', 'RESEARCH', 'EVENT', 'ACHIEVEMENT']

export default function CreateSubmission() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'PROJECT',
    sdg_tags: [],
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (form.sdg_tags.length === 0) {
      setError('Please select at least one SDG tag.')
      return
    }
    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters.')
      return
    }
    if (form.description.trim().length < 10) {
      setError('Description must be at least 10 characters.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { data } = await client.post('/submissions', {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        sdg_tags: form.sdg_tags,
      })

      // API returns _id (aliased); fall back to id just in case
      const newId = data._id ?? data.id
      if (!newId) throw new Error('Server did not return a submission ID.')

      navigate(`/submissions/${newId}`)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setError(detail.map((d) => d.msg).join('. '))
      } else {
        setError(detail ?? err.message ?? 'Failed to create draft. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Submission</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a draft — you can edit it before submitting for review.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={set('title')}
            placeholder="e.g. Solar panel installation in hostel block"
            minLength={3}
            maxLength={200}
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={5}
            value={form.description}
            onChange={set('description')}
            placeholder="Describe the project, its goals, and how it contributes to the SDG…"
            minLength={10}
            maxLength={5000}
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="mt-1 text-right text-xs text-gray-400">
            {form.description.length} / 5000
          </p>
        </div>

        {/* Type */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={form.type}
            onChange={set('type')}
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {SUBMISSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {/* SDG Tags */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            SDG Tags <span className="text-red-500">*</span>
          </label>
          <SDGTagPicker
            selected={form.sdg_tags}
            onChange={(tags) => setForm((prev) => ({ ...prev, sdg_tags: tags }))}
          />
          {form.sdg_tags.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-600">Select at least one SDG goal.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {loading ? 'Saving…' : 'Create Draft'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import SDGTagPicker from '../components/SDGTagPicker'

export default function CreateSubmission() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', type: 'PROJECT', sdg_tags: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.sdg_tags.length === 0) { setError('Select at least one SDG tag.'); return }
    setError('')
    setLoading(true)
    try {
      const { data } = await client.post('/submissions', form)
      navigate(`/submissions/${data._id}`)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to create submission')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">New Submission</h1>
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={set('title')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            required
            rows={5}
            value={form.description}
            onChange={set('description')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
          <select
            value={form.type}
            onChange={set('type')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="PROJECT">Project</option>
            <option value="RESEARCH">Research</option>
            <option value="EVENT">Event</option>
            <option value="ACHIEVEMENT">Achievement</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">SDG Tags</label>
          <SDGTagPicker selected={form.sdg_tags} onChange={(tags) => setForm({ ...form, sdg_tags: tags })} />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Create Draft'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

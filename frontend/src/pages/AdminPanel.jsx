import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search, Plus, Pencil, Trash2, X, AlertTriangle, CheckCircle2, ShieldCheck, BarChart3,
} from 'lucide-react'
import client from '../api/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value, ms) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return dv
}

const ROLE_BADGE = {
  SUBMITTER:     'bg-blue-100 text-blue-800',
  HOD:           'bg-amber-100 text-amber-800',
  SDG_COMMITTEE: 'bg-purple-100 text-purple-800',
  ADMIN:         'bg-red-100 text-red-800',
}

const ASSIGNABLE_ROLES = ['SUBMITTER', 'HOD', 'SDG_COMMITTEE']

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ children, onClose, width = 'max-w-lg' }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-900/10`}>
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

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, loading, onConfirm, onClose, errorMsg }) {
  return (
    <Modal onClose={onClose} width="max-w-md">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertTriangle className={`h-5 w-5 ${danger ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="mb-2 text-sm text-gray-600">{message}</p>
      {errorMsg && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
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
          onClick={onConfirm}
          disabled={loading}
          className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
          }`}
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

// ─── Assign Role modal ────────────────────────────────────────────────────────

function AssignRoleModal({ user, departments, onSave, onClose }) {
  const [role, setRole]       = useState(user.role)
  const [deptId, setDeptId]   = useState(user.department_ids?.[0] ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // SUBMITTER and HOD both need a department; SDG_COMMITTEE does not
  const needsDept = role === 'HOD' || role === 'SUBMITTER'

  const handleSave = async () => {
    if (needsDept && !deptId) { setError('Please select a department.'); return }
    setError('')
    setLoading(true)
    try {
      await onSave(user._id, {
        role,
        department_ids: needsDept ? [deptId] : [],
      })
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to update role.')
    } finally {
      setLoading(false)
    }
  }

  const selectedDept = departments.find((d) => d._id === deptId)

  return (
    <Modal onClose={onClose}>
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">Assign Role</h2>
      </div>

      {/* User summary */}
      <div className="mb-5 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <p className="font-medium text-gray-900">{user.email}</p>
        <p className="text-gray-500">{user.college_id}</p>
        <div className="mt-1.5"><RoleBadge role={user.role} /></div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">New Role</label>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setDeptId('') }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
          {role === 'SDG_COMMITTEE' && (
            <p className="mt-1 text-xs text-gray-500">Committee members are not assigned to a specific department.</p>
          )}
        </div>

        {needsDept && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Department <span className="text-red-500">*</span>
            </label>
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">— Select department —</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Confirmation summary */}
      {(role !== user.role || deptId !== (user.department_ids?.[0] ?? '')) && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <CheckCircle2 className="mb-1 inline h-4 w-4" />
          {' '}Assign <strong>{role}</strong> to <strong>{user.email}</strong>
          {needsDept && selectedDept && <> for <strong>{selectedDept.name}</strong></>}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Save Role
        </button>
      </div>
    </Modal>
  )
}

// ─── Department form modal (add + edit) ───────────────────────────────────────

function DeptFormModal({ dept, onSave, onClose }) {
  const isEdit = Boolean(dept)
  const [name, setName] = useState(dept?.name ?? '')
  const [code, setCode] = useState(dept?.code ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!code.trim()) { setError('Code is required.'); return }
    setError('')
    setLoading(true)
    try {
      await onSave({ name: name.trim(), code: code.trim().toUpperCase() })
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to save department.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} width="max-w-md">
      <h2 className="mb-5 text-lg font-semibold text-gray-900">
        {isEdit ? 'Edit Department' : 'Add Department'}
      </h2>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Department Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Computer Science"
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. CS"
            maxLength={10}
            className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm uppercase tracking-wide focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="mt-1 text-xs text-gray-400">Short identifier — automatically uppercased.</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {isEdit ? 'Save Changes' : 'Add Department'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function Tabs({ active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 dark:border-slate-700">
      {[['dashboard', 'Dashboard'], ['users', 'User Management'], ['depts', 'Departments']].map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-5 py-3 text-sm font-medium transition-colors ${
            active === key
              ? 'border-b-2 border-sky-500 bg-sky-50/70 text-sky-700 dark:border-cyan-500 dark:bg-slate-800 dark:text-cyan-200'
              : 'text-gray-500 hover:bg-slate-50 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

const SDG_COLORS = Array(17).fill('#B85C4A')

function DashboardTab() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/dashboard/summary')
      .then(({ data }) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-200" />
        ))}
      </div>
    )
  }

  if (!summary) {
    return <p className="py-8 text-center text-sm text-gray-400">Failed to load dashboard data.</p>
  }

  const { sdg_breakdown = [], department_breakdown = [], totals = {} } = summary

  return (
    <div className="space-y-6 py-2">
      {/* Top-level totals */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Submissions', value: totals.total_submissions ?? 0 },
          { label: 'Approved', value: totals.total_approved ?? 0 },
          { label: 'In Review', value: totals.total_in_review ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-5 py-4 text-center shadow-[0_8px_20px_rgba(184,92,74,0.12)] dark:border-cyan-900/60 dark:bg-cyan-950/20">
            <div className="text-2xl font-extrabold text-sky-600 dark:text-cyan-300">{value}</div>
            <div className="mt-0.5 text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* SDG breakdown table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">SDG Breakdown</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[480px] bg-white">
            <thead className="bg-gray-50">
              <tr>
                <Th>SDG</Th>
                <Th>Name</Th>
                <Th>Approved</Th>
                <Th>In Review</Th>
                <Th>This Year</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sdg_breakdown.map(sdg => {
                const color = SDG_COLORS[sdg.sdg_number - 1]
                return (
                  <tr key={sdg.sdg_number} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <Td>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {sdg.sdg_number}
                      </span>
                    </Td>
                    <Td className="font-medium">{sdg.sdg_name}</Td>
                    <Td>
                      <span className="font-semibold text-green-700">{sdg.total_approved ?? 0}</span>
                    </Td>
                    <Td>
                      <span className="font-semibold text-blue-700">{sdg.in_review ?? 0}</span>
                    </Td>
                    <Td>{sdg.completed_this_year ?? 0}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Department breakdown */}
      {department_breakdown.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Department Breakdown (Approved)</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[360px] bg-white">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Department</Th>
                  <Th>Code</Th>
                  <Th>Approved Submissions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {department_breakdown.map(dept => (
                  <tr key={dept.department_code} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    <Td className="font-medium">{dept.department_name}</Td>
                    <Td><span className="font-mono text-xs font-semibold tracking-wide text-gray-600">{dept.department_code}</span></Td>
                    <Td><span className="font-bold text-gray-800">{dept.count}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Th({ children }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  )
}

function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-sm text-gray-800 ${className}`}>{children}</td>
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ departments }) {
  const [search, setSearch]   = useState('')
  const debouncedSearch       = useDebounce(search, 300)
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(false)
  const [roleModal, setRoleModal] = useState(null) // user object

  // Build userMap for quick ID → user lookup
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]))

  const loadUsers = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = q ? `?search=${encodeURIComponent(q)}` : ''
      const { data } = await client.get(`/admin/users${params}`)
      setUsers(data)
    } catch {
      /* silently degrade */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers(debouncedSearch) }, [loadUsers, debouncedSearch])

  const handleAssignRole = async (userId, body) => {
    await client.patch(`/admin/users/${userId}/role`, body)
    await loadUsers(debouncedSearch)
  }

  // Department names for a user's department_ids
  const deptLabels = (ids) => {
    if (!ids?.length) return '—'
    const names = ids.map((id) => departments.find((d) => d._id === id)?.code).filter(Boolean)
    return names.join(', ') || '—'
  }

  return (
    <>
      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by college ID or email…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        )}
        {!loading && (
          <span className="text-sm text-gray-400">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[640px] bg-white">
          <thead className="bg-gray-50">
            <tr>
              <Th>College ID</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Department(s)</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  {search ? 'No users match your search.' : 'No users found.'}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <Td><span className="font-mono text-xs">{u.college_id}</span></Td>
                <Td>{u.email}</Td>
                <Td><RoleBadge role={u.role} /></Td>
                <Td className="text-gray-500">{deptLabels(u.department_ids)}</Td>
                <Td>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </Td>
                <Td>
                  {u.role !== 'ADMIN' && (
                    <button
                      onClick={() => setRoleModal(u)}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Change Role
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {roleModal && (
        <AssignRoleModal
          user={roleModal}
          departments={departments}
          onSave={handleAssignRole}
          onClose={() => setRoleModal(null)}
        />
      )}
    </>
  )
}

// ─── Departments tab ──────────────────────────────────────────────────────────

function DeptsTab({ users }) {
  const [depts, setDepts]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [deptModal, setDeptModal]   = useState(null)  // null | { mode: 'add' } | { mode: 'edit', dept }
  const [deleteModal, setDeleteModal] = useState(null) // null | dept
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError]     = useState('')

  // Build userId → user lookup
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]))

  const loadDepts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get('/admin/departments')
      setDepts(data)
    } catch {
      /* silently degrade */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDepts() }, [loadDepts])

  const handleAdd = async (body) => {
    await client.post('/admin/departments', body)
    await loadDepts()
  }

  const handleEdit = async (body) => {
    await client.patch(`/admin/departments/${deptModal.dept._id}`, body)
    await loadDepts()
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await client.delete(`/admin/departments/${deleteModal._id}`)
      setDeleteModal(null)
      await loadDepts()
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? 'Failed to delete department.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const hodLabel = (hod_user_id) => {
    if (!hod_user_id) return <span className="text-gray-400">Not assigned</span>
    const u = userMap[hod_user_id]
    return u ? (
      <span className="text-gray-800">{u.email}</span>
    ) : (
      <span className="font-mono text-xs text-gray-400">{hod_user_id.slice(-8)}</span>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {loading ? 'Loading…' : `${depts.length} department${depts.length !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={() => setDeptModal({ mode: 'add' })}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Department
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[480px] bg-white">
          <thead className="bg-gray-50">
            <tr>
              <Th>Department Name</Th>
              <Th>Code</Th>
              <Th>Current HOD</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {depts.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No departments yet. Add one to get started.
                </td>
              </tr>
            )}
            {depts.map((d) => (
              <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                <Td className="font-medium">{d.name}</Td>
                <Td><span className="font-mono text-xs font-semibold tracking-wide text-gray-600">{d.code}</span></Td>
                <Td className="text-sm">{hodLabel(d.hod_user_id)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDeptModal({ mode: 'edit', dept: d })}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => { setDeleteError(''); setDeleteModal(d) }}
                      className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deptModal?.mode === 'add' && (
        <DeptFormModal
          dept={null}
          onSave={handleAdd}
          onClose={() => setDeptModal(null)}
        />
      )}

      {deptModal?.mode === 'edit' && (
        <DeptFormModal
          dept={deptModal.dept}
          onSave={handleEdit}
          onClose={() => setDeptModal(null)}
        />
      )}

      {deleteModal && (
        <ConfirmModal
          title="Delete Department"
          message={`Are you sure you want to delete "${deleteModal.name}" (${deleteModal.code})? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleteLoading}
          errorMsg={deleteError}
          onConfirm={handleDelete}
          onClose={() => { setDeleteModal(null); setDeleteError('') }}
        />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [tab, setTab] = useState('dashboard')

  // Pre-load all users so DeptsTab can resolve HOD names without a second fetch.
  // UsersTab also manages its own search-filtered subset.
  const [allUsers, setAllUsers] = useState([])
  const [allDepts, setAllDepts] = useState([])

  useEffect(() => {
    client.get('/admin/users').then(({ data }) => setAllUsers(data)).catch(() => {})
    client.get('/admin/departments').then(({ data }) => setAllDepts(data)).catch(() => {})
  }, [])

  return (
    <div className="space-y-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">Manage users, roles, departments, and view system dashboard.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Tabs active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'users' && <UsersTab departments={allDepts} />}
          {tab === 'depts' && <DeptsTab users={allUsers} />}
        </div>
      </div>
    </div>
  )
}

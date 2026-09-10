import { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  FileText,
  PlusCircle,
  ClipboardCheck,
  Shield,
  Menu,
  X,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import ritCrest from '../assets/rit-crest-transparent.png'

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_BADGE = {
  SUBMITTER:     'bg-blue-100 text-blue-800',
  HOD:           'bg-amber-100 text-amber-800',
  SDG_COMMITTEE: 'bg-purple-100 text-purple-800',
  ADMIN:         'bg-red-100 text-red-800',
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  )
}

function departmentLabel(user) {
  if (!['SUBMITTER', 'HOD'].includes(user?.role) || !user.department) return null
  return user.department.code ? `${user.department.name} (${user.department.code})` : user.department.name
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: BarChart3,
    roles: null, // public — always shown
  },
  {
    label: 'My Submissions',
    to: '/submissions',
    icon: FileText,
    roles: ['SUBMITTER', 'HOD', 'SDG_COMMITTEE', 'ADMIN'],
  },
  {
    label: 'Create New',
    to: '/submissions/new',
    icon: PlusCircle,
    roles: ['SUBMITTER'],
  },
  {
    label: 'Review Queue',
    to: '/review',
    icon: ClipboardCheck,
    roles: ['HOD', 'SDG_COMMITTEE'],
  },
  {
    label: 'Admin Panel',
    to: '/admin',
    icon: Shield,
    roles: ['ADMIN'],
  },
]

// ─── Route title map ──────────────────────────────────────────────────────────

const ROUTE_TITLES = {
  '/dashboard':        'Dashboard',
  '/submissions':      'My Submissions',
  '/submissions/new':  'Create Submission',
  '/review':           'Review Queue',
  '/notifications':    'Notifications',
  '/admin':            'Admin Panel',
}

function getPageTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]
  if (pathname.startsWith('/submissions/')) return 'Submission Detail'
  return 'SDG Workflow'
}

// ─── User dropdown ────────────────────────────────────────────────────────────

function UserDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const department = departmentLabel(user)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
          {user.email?.[0]?.toUpperCase() ?? 'U'}
        </span>
        <span className="hidden max-w-[120px] truncate sm:block">{user.full_name || user.email}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            {user.full_name && <p className="truncate text-sm font-medium text-gray-900">{user.full_name}</p>}
            <p className="truncate text-xs text-gray-500">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
            {department && <p className="mt-2 truncate text-xs text-gray-500">{department}</p>}
          </div>
          <button
            onClick={() => { setOpen(false); onLogout() }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

function NavLink({ item, collapsed, onClick }) {
  const { pathname } = useLocation()
  const active = pathname === item.to || (item.to !== '/dashboard' && pathname.startsWith(item.to))
  const Icon = item.icon

  return (
    <Link
      to={item.to}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-700 text-white shadow-sm'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
      <span className={`truncate transition-all duration-200 ${collapsed ? 'w-0 overflow-hidden opacity-0' : 'opacity-100'}`}>
        {item.label}
      </span>
    </Link>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, mobileOpen, onMobileClose, user }) {
  const visibleItems = NAV.filter(
    (item) => item.roles === null || (user && item.roles.includes(user.role))
  )
  const department = departmentLabel(user)

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900">
      {/* Logo */}
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-700 px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="sidebar-rit-crest" aria-hidden="true"><img src={ritCrest} alt="" /></div>
        {!collapsed && (
          <span className="sidebar-rit-name"><strong>RAMAIAH</strong><span>Institute of Technology</span></span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              onClick={onMobileClose}
            />
          ))}
        </div>
      </nav>

      {/* User mini card at bottom */}
      {user && !collapsed && (
        <div className="border-t border-slate-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
              {user.email?.[0]?.toUpperCase() ?? 'U'}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-200">{user.full_name || user.email}</p>
              {user.full_name && <p className="truncate text-xs text-slate-400">{user.email}</p>}
              <p className="truncate text-xs text-slate-400">{user.role}</p>
              {department && <p className="truncate text-xs text-slate-400">{department}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col transition-all duration-300 md:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="absolute inset-y-0 left-0 w-60 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}

// ─── Layout (root export) ─────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 'md:pl-16' : 'md:pl-60'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        user={user}
      />

      {/* Everything to the right of the sidebar */}
      <div className={`flex min-h-screen flex-col transition-all duration-300 ${sidebarWidth}`}>
        {/* ── Top header ── */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:block"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
            </button>

            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {getPageTitle(pathname)}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <UserDropdown user={user} onLogout={handleLogout} />
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

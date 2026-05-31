import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import MySubmissions from './pages/MySubmissions'
import CreateSubmission from './pages/CreateSubmission'
import SubmissionDetail from './pages/SubmissionDetail'
import ReviewQueue from './pages/ReviewQueue'
import Notifications from './pages/Notifications'
import AdminPanel from './pages/AdminPanel'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* ── Public — no layout ── */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── Authenticated app — inside Layout shell ── */}
            <Route element={<Layout />}>
              <Route
                path="/submissions"
                element={<ProtectedRoute><MySubmissions /></ProtectedRoute>}
              />
              <Route
                path="/submissions/new"
                element={
                  <ProtectedRoute roles={['SUBMITTER']}>
                    <CreateSubmission />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/submissions/:id"
                element={<ProtectedRoute><SubmissionDetail /></ProtectedRoute>}
              />
              <Route
                path="/review"
                element={
                  <ProtectedRoute roles={['HOD', 'SDG_COMMITTEE']}>
                    <ReviewQueue />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={<ProtectedRoute><Notifications /></ProtectedRoute>}
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* ── 404 ── */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

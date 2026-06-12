import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import api from './api/client'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
// Register and email/password login removed — Google OAuth only
import Home from './pages/Home'
import Leagues from './pages/Leagues'
import LeagueDetail from './pages/LeagueDetail'
import Fixtures from './pages/Fixtures'
import MyPredictions from './pages/MyPredictions'

function TeamNameModal() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.username || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Team name cannot be empty'); return }
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch('/auth/team_name', { team_name: trimmed })
      setUser(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-8 max-w-sm w-full shadow-xl">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Choose your team name</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This is how you'll appear on leaderboards and predictions.</p>
        <form onSubmit={handleSave}>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
            placeholder="e.g. Team Arsenal"
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
          >
            {saving ? '…' : 'Set team name'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : children
}

function Layout({ children }) {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      {user?.team_name == null && <TeamNameModal />}
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<ProtectedRoute><Layout><Home /></Layout></ProtectedRoute>} />
          <Route path="/fixtures" element={<ProtectedRoute><Layout><Fixtures /></Layout></ProtectedRoute>} />
          <Route path="/predictions" element={<ProtectedRoute><Layout><MyPredictions /></Layout></ProtectedRoute>} />
          <Route path="/leagues" element={<ProtectedRoute><Layout><Leagues /></Layout></ProtectedRoute>} />
          <Route path="/leagues/:id" element={<ProtectedRoute><Layout><LeagueDetail /></Layout></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

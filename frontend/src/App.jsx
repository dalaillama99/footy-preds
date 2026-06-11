import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
// Register and email/password login removed — Google OAuth only
import Home from './pages/Home'
import Leagues from './pages/Leagues'
import LeagueDetail from './pages/LeagueDetail'
import Fixtures from './pages/Fixtures'
import MyPredictions from './pages/MyPredictions'
import HowItWorks from './pages/HowItWorks'

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
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
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
          <Route path="/how-it-works" element={<ProtectedRoute><Layout><HowItWorks /></Layout></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

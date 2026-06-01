import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()

  const link = (to, label) => (
    <Link
      to={to}
      className={`text-sm font-medium transition ${
        pathname === to || pathname.startsWith(to + '/')
          ? 'text-green-700'
          : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-green-700">Footy Preds</Link>
          {user && (
            <>
              {link('/fixtures', 'Fixtures')}
              {link('/leaderboard', 'Leaderboard')}
              {link('/leagues', 'Leagues')}
              {link('/predictions', 'My Predictions')}
              {link('/how-it-works', 'How it works')}
            </>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:inline">{user.username}</span>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500 transition">
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

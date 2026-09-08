import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout, previewNonAdmin, togglePreviewNonAdmin } = useAuth()
  const { pathname } = useLocation()

  const link = (to, label) => (
    <Link
      to={to}
      className={`text-sm font-medium transition ${
        pathname === to || pathname.startsWith(to + '/')
          ? 'text-green-600 dark:text-green-400'
          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-bold text-green-700 dark:text-green-500">Footy Preds</Link>
          {user && (
            <>
              {link('/fixtures', 'Fixtures')}
              {link('/leagues', 'Leagues')}
              {link('/predictions', 'My Predictions')}
            </>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-3">
            {/* Gated on the RAW user.is_admin, never the effective/preview-aware
                flag — otherwise turning preview on would hide the only way to
                turn it back off. */}
            {user.is_admin && (
              <button
                onClick={togglePreviewNonAdmin}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                  previewNonAdmin
                    ? 'border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {previewNonAdmin ? 'Exit preview' : 'Preview as regular user'}
              </button>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">{user.username}</span>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition">
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

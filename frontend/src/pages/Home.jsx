import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Home() {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
        Welcome, {user?.username}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">Make your predictions before kickoff and climb the leaderboard.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/fixtures"
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition group"
        >
          <div className="text-2xl mb-2">📅</div>
          <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-400">Fixtures</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">View upcoming games and submit your scoreline predictions</p>
        </Link>

        <Link
          to="/predictions"
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition group"
        >
          <div className="text-2xl mb-2">🎯</div>
          <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-400">My Predictions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your prediction history with results and point breakdowns</p>
        </Link>

        <Link
          to="/leagues"
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition group"
        >
          <div className="text-2xl mb-2">👥</div>
          <h2 className="font-semibold text-gray-900 dark:text-white group-hover:text-green-700 dark:group-hover:text-green-400">My Leagues</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a private league or join one with an invite code</p>
        </Link>
      </div>

      {user?.is_admin && (
        <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Admin</p>
          <p className="text-sm text-amber-700 dark:text-amber-500">
            Add fixtures, sync from football-data.org, set scores, and manage fixtures from the{' '}
            <Link to="/fixtures" className="underline font-medium">Fixtures</Link> page.
          </p>
        </div>
      )}
    </div>
  )
}

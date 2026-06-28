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

      {/* How it works */}
      <div className="mt-12 space-y-8">

        {/* Section 1: Making Predictions */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Making predictions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Everything you need to know about submitting and editing your picks.</p>

          <div className="space-y-3">
            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">📝</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Submitting a prediction</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Head to Fixtures, enter a home and away score for any upcoming match, and hit Predict.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">⏰</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Deadline: kickoff time</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">You cannot submit or change a prediction once a match has kicked off.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">✏️</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Editing your pick</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Go to My Predictions and click the pencil icon next to any pending prediction to update it before kickoff.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Knockout draws — predict penalty winner</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">In knockout matches, if you predict a draw, a dropdown appears asking which team wins on penalties. This is optional — you can leave it blank.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: How Points Work */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">How points work</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Points are awarded per match based on how close your prediction is to the actual score.</p>

          <div className="space-y-3">
            <div className="flex items-start gap-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl px-5 py-4">
              <span className="text-2xl">⭐</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">3 points — Exact score</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">You predicted the exact scoreline.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">predicted 2–1, actual 2–1 → 3 pts</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">1.5 points — Correct result</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">You got the result right (home win / draw / away win).</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">predicted 2–0, actual 1–0 → 1.5 pts</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">⚖️</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">+0.5 — Correct goal difference</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">On top of a correct result, you also got the goal difference right.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">predicted 2–0, actual 3–1 → both home wins by 2 → 2 pts</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">🔢</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">+0.25 — Correct total goals</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">The total number of goals matches the actual total, regardless of result.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">predicted 2–1 (3 goals), actual 1–2 (3 goals) → +0.25</p>
              </div>
            </div>

            <div className="flex items-start gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
              <span className="text-2xl">🏆</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">+0.5 — Penalty winner (knockout games only)</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Predicting a draw in a knockout game unlocks a penalty winner pick. Getting it right adds 0.5 pts. Predict a non-draw and there's no opportunity for this bonus.</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">exact draw + correct pen winner → 4 pts total</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4 text-sm text-gray-600 dark:text-gray-400 mt-3">
            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Maximum per game: 4 pts (knockout only)</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Exact draw scoreline + correct penalty winner. In a regular game, the max is 3 pts (exact score). Without an exact score, the max is 2.5 pts — correct draw + correct goal difference + correct penalty winner.</p>
          </div>
        </section>

      </div>
    </div>
  )
}

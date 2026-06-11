import { useAuth } from '../context/AuthContext'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({ entries }) {
  const { user } = useAuth()

  if (!entries.length) return <p className="text-gray-400 dark:text-gray-500 text-sm">No predictions scored yet.</p>

  const ranks = []
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      ranks.push(1)
    } else if (entries[i].total_points === entries[i - 1].total_points) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-8">#</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Player</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Predictions</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Points</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={e.user_id}
              className={`border-b border-gray-50 dark:border-gray-700 last:border-0 ${e.user_id === user?.id ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              <td className="px-5 py-3.5 text-gray-400 dark:text-gray-500">{ranks[i] === 1 ? '🥇' : ranks[i]}</td>
              <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">
                {e.username}
                {e.user_id === user?.id && <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">(you)</span>}
              </td>
              <td className="px-5 py-3.5 text-right text-gray-500 dark:text-gray-400">
                {e.scored_count}/{e.prediction_count}
              </td>
              <td className="px-5 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                {e.total_points % 1 === 0 ? e.total_points.toFixed(0) : e.total_points.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { useAuth } from '../context/AuthContext'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({ entries }) {
  const { user } = useAuth()

  if (!entries.length) return <p className="text-gray-400 text-sm">No predictions scored yet.</p>

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
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
              className={`border-b border-gray-50 last:border-0 ${e.user_id === user?.id ? 'bg-green-50' : 'hover:bg-gray-50'}`}
            >
              <td className="px-5 py-3.5 text-gray-400">{MEDALS[i] || i + 1}</td>
              <td className="px-5 py-3.5 font-medium text-gray-900">
                {e.username}
                {e.user_id === user?.id && <span className="ml-1.5 text-xs text-green-600">(you)</span>}
              </td>
              <td className="px-5 py-3.5 text-right text-gray-500">
                {e.scored_count}/{e.prediction_count}
              </td>
              <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                {e.total_points % 1 === 0 ? e.total_points.toFixed(0) : e.total_points.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

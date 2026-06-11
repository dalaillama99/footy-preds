import { useState, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Leaderboard({ entries }) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(new Set())

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

  const toggle = (userId) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    return next
  })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 w-8">#</th>
            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Player</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Pred</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Done</th>
            <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <Fragment key={e.user_id}>
              <tr
                onClick={() => toggle(e.user_id)}
                className={`border-b border-gray-50 dark:border-gray-700 cursor-pointer ${e.user_id === user?.id ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
              >
                <td className="px-4 py-3.5 text-gray-400 dark:text-gray-500">{ranks[i] === 1 ? '🥇' : ranks[i]}</td>
                <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                  {e.username}
                  {e.user_id === user?.id && <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">(you)</span>}
                </td>
                <td className="px-3 py-3.5 text-right text-gray-500 dark:text-gray-400">{e.prediction_count}</td>
                <td className="px-3 py-3.5 text-right text-gray-500 dark:text-gray-400">{e.scored_count}</td>
                <td className="px-4 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                  {e.total_points % 1 === 0 ? e.total_points.toFixed(0) : e.total_points.toFixed(2)}
                </td>
              </tr>
              {expanded.has(e.user_id) && (
                <tr className="border-b border-gray-50 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-700/20">
                  <td />
                  <td colSpan={4} className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                    ⭐ {e.exact_count} exact &nbsp;·&nbsp; ✅ {e.correct_count} correct result
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

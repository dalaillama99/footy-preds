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
    } else {
      const prev = entries[i - 1]
      const curr = entries[i]
      const tied =
        curr.total_points === prev.total_points &&
        curr.exact_count === prev.exact_count &&
        curr.correct_gd_count === prev.correct_gd_count &&
        curr.correct_result_count === prev.correct_result_count
      ranks.push(tied ? ranks[i - 1] : i + 1)
    }
  }

  // Map a bracket_bonus point value to its subtle leaderboard annotation.
  const bracketLabel = (bonus) => {
    if (bonus === 3) return '+3 bracket'
    if (bonus === 6) return '+6 bracket'
    if (bonus === 9) return '+9 finals & semis'
    return `+${bonus}`
  }

  const toggle = (userId) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    return next
  })

  // real_name is a string only for the global admin viewer; otherwise null.
  const showRealName = entries.some(e => e.real_name != null)
  const colSpan = showRealName ? 4 : 3

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3 w-6 sm:w-8">#</th>
            <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">{showRealName ? 'Team' : 'Player'}</th>
            {showRealName && (
              <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">Name</th>
            )}
            <th className="text-right text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-1.5 sm:px-3 py-2.5 sm:py-3">Played</th>
            <th className="text-right text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <Fragment key={e.user_id}>
              <tr
                onClick={() => toggle(e.user_id)}
                className={`border-b border-gray-50 dark:border-gray-700 cursor-pointer ${e.user_id === user?.id ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
              >
                <td className="px-2 sm:px-4 py-3 sm:py-3.5 text-gray-400 dark:text-gray-500">{ranks[i] === 1 ? '🥇' : ranks[i]}{e.rank_delta < 0 ? <span className="ml-1 text-green-500 text-[10px]">▲</span> : e.rank_delta > 0 ? <span className="ml-1 text-red-500 text-[10px]">▼</span> : null}</td>
                <td className="px-2 sm:px-4 py-3 sm:py-3.5 font-medium text-gray-900 dark:text-white">
                  {e.username}
                  {e.user_id === user?.id && <span className="ml-1 sm:ml-1.5 text-[10px] sm:text-xs text-green-600 dark:text-green-400">(you)</span>}
                </td>
                {showRealName && (
                  <td className="px-2 sm:px-4 py-3 sm:py-3.5 text-gray-500 dark:text-gray-400">{e.real_name}</td>
                )}
                <td className="px-1.5 sm:px-3 py-3 sm:py-3.5 text-right text-gray-500 dark:text-gray-400">{e.scored_count}</td>
                <td className="px-2 sm:px-4 py-3 sm:py-3.5 text-right font-bold text-gray-900 dark:text-white">
                  {e.total_points % 1 === 0 ? e.total_points.toFixed(0) : e.total_points.toFixed(2)}
                  {e.bracket_bonus != null && (
                    <span className="ml-1 text-[10px] sm:text-xs font-normal text-gray-400 dark:text-gray-500">({bracketLabel(e.bracket_bonus)})</span>
                  )}
                </td>
              </tr>
              {expanded.has(e.user_id) && (
                <tr className="border-b border-gray-50 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-700/20">
                  <td />
                  <td colSpan={colSpan} className="px-2 sm:px-4 py-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">
                    ⭐ {e.exact_count} exact &nbsp;·&nbsp; 🎯 {e.correct_gd_count} correct +GD &nbsp;·&nbsp; ✅ {e.correct_result_count} correct result
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

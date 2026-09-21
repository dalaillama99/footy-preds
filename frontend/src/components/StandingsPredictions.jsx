import { useState, useEffect } from 'react'
import api from '../api/client'

// Ordered slot keys — 5 top-5 columns (labeled 1-5) then 3 relegation columns
// (labeled 18-20). Mirrors PLTableModal's TOP5_SLOTS/RELEGATION_SLOTS.
const TOP5_SLOTS = [
  { key: 'pos1', label: 1 },
  { key: 'pos2', label: 2 },
  { key: 'pos3', label: 3 },
  { key: 'pos4', label: 4 },
  { key: 'pos5', label: 5 },
]
const RELEGATION_SLOTS = [
  { key: 'rel18', label: 18 },
  { key: 'rel19', label: 19 },
  { key: 'rel20', label: 20 },
]
const ALL_SLOTS = [...TOP5_SLOTS, ...RELEGATION_SLOTS]

function PLTableSection({ members }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Premier League predictions
      </h2>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">Member</th>
              {ALL_SLOTS.map(s => (
                <th key={s.key} className="text-center text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-1.5 sm:px-3 py-2.5 sm:py-3">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.user_id} className={i < members.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}>
                <td className="px-2 sm:px-4 py-2.5 text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{m.username}</td>
                {m.has_prediction ? (
                  ALL_SLOTS.map(s => (
                    <td key={s.key} className="px-1.5 sm:px-3 py-2.5 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {m[s.key]}
                    </td>
                  ))
                ) : (
                  <td colSpan={ALL_SLOTS.length} className="px-2 sm:px-4 py-2.5 text-center text-gray-400 dark:text-gray-500 italic">
                    Hasn't predicted yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UclSection({ members }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Champions League winner predictions
      </h2>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">Member</th>
              <th className="text-left text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 sm:px-4 py-2.5 sm:py-3">Predicted winner</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.user_id} className={i < members.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}>
                <td className="px-2 sm:px-4 py-2.5 text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{m.username}</td>
                <td className="px-2 sm:px-4 py-2.5 text-gray-600 dark:text-gray-300">
                  {m.has_prediction ? (
                    m.predicted_winner
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 italic">Hasn't predicted yet</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Always-visible section (no reveal-gating) inside a league's Predictions tab:
// shows every member's global PL top-5/relegation and UCL winner picks.
// Fetches GET /leagues/{leagueId}/standings-predictions itself.
export default function StandingsPredictions({ leagueId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.get(`/leagues/${leagueId}/standings-predictions`)
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(err => { if (!cancelled) setError(err.response?.data?.detail || 'Failed to load standings predictions') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueId])

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>
  if (!data) return null

  return (
    <div>
      <PLTableSection members={data.pl_table} />
      <UclSection members={data.ucl} />
    </div>
  )
}

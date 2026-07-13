import { useState, useEffect } from 'react'
import api from '../api/client'

function TeamChip({ name, crest }) {
  if (!name) return <span className="text-gray-400 dark:text-gray-500 italic text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1">
      {crest && (
        <img
          src={crest}
          alt=""
          className="w-4 h-4 object-contain shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
      <span className="uppercase text-xs font-medium text-gray-800 dark:text-gray-200">{name}</span>
    </span>
  )
}

// Collapsible panel showing all league members' predicted SF pairings.
// Hidden entirely if backend returns no data (semis not yet kicked off).
export default function SFPredictions({ leagueId }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null) // null = loading, [] = no data / not unlocked
  const [teams, setTeams] = useState({}) // name -> { crest }

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    ;(async () => {
      try {
        const [sfRes, teamRes] = await Promise.all([
          api.get(`/leagues/${leagueId}/bracket-semis`),
          api.get('/bracket/teams'),
        ])
        if (cancelled) return
        setData(sfRes.data || [])
        // Build a lookup map for crest by team name
        const map = {}
        for (const t of (teamRes.data || [])) {
          map[t.name] = t
        }
        setTeams(map)
      } catch {
        if (!cancelled) setData([])
      }
    })()
    return () => { cancelled = true }
  }, [leagueId])

  // Don't render anything until data is loaded, and hide entirely if empty
  if (!data || data.length === 0) return null

  return (
    <div className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/60 dark:bg-gray-700/40 hover:bg-gray-100/60 dark:hover:bg-gray-700/60 transition text-left"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Semi Final Predictions</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Member</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Semi 1</th>
                <th className="text-left px-3 sm:px-4 py-2 font-medium">Semi 2</th>
              </tr>
            </thead>
            <tbody>
              {data.map((member, i) => {
                const hasPrediction = member.semi1_a || member.semi1_b || member.semi2_a || member.semi2_b
                return (
                  <tr
                    key={member.user_id}
                    className={i < data.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}
                  >
                    <td className="px-3 sm:px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {member.username}
                    </td>
                    {hasPrediction ? (
                      <>
                        <td className="px-3 sm:px-4 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <TeamChip name={member.semi1_a} crest={teams[member.semi1_a]?.crest} />
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">vs</span>
                            <TeamChip name={member.semi1_b} crest={teams[member.semi1_b]?.crest} />
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <TeamChip name={member.semi2_a} crest={teams[member.semi2_a]?.crest} />
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">vs</span>
                            <TeamChip name={member.semi2_b} crest={teams[member.semi2_b]?.crest} />
                          </div>
                        </td>
                      </>
                    ) : (
                      <td colSpan={2} className="px-3 sm:px-4 py-2.5 text-gray-400 dark:text-gray-500 italic">
                        No prediction submitted
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

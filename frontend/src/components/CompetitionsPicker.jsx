import { useState, useEffect } from 'react'
import api from '../api/client'

// Shared, CONTROLLED competitions + conditional Champions-League-team
// checklist. The parent owns `selectedCompetitions`/`selectedUclTeams` state
// and passes it down via value/onChange (this codebase's usual
// useState-everywhere convention) — that lets each caller own its own
// initial/reset logic (Leagues.jsx starts blank, LeagueDetail.jsx
// pre-populates from the fetched league, LeagueCompetitionsSetupModal.jsx
// resets per-league as it advances through its queue) without this
// component needing to know about any of those differences.
//
// This component owns: the two fetches (/fixtures/competitions, and a lazy
// /ucl/teams fetch once CL is checked), the toggle handlers, and (via the
// `isValidCompetitionsSelection` helper below) the validity rule. Everything
// else — the surrounding form, submit wiring, payload shape, endpoint,
// success handling — stays with each of the three call sites, since those
// genuinely differ between create, settings-patch, and forced setup.
export default function CompetitionsPicker({
  selectedCompetitions,
  onCompetitionsChange,
  selectedUclTeams,
  onUclTeamsChange,
}) {
  const [competitionsList, setCompetitionsList] = useState([]) // [{code, name}]
  const [uclTeamsList, setUclTeamsList] = useState([]) // [{name, crest}]

  useEffect(() => {
    api.get('/fixtures/competitions').then(r => setCompetitionsList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedCompetitions.includes('CL')) return
    if (uclTeamsList.length > 0) return
    api.get('/ucl/teams').then(r => setUclTeamsList(r.data || [])).catch(() => {})
  }, [selectedCompetitions, uclTeamsList.length])

  const toggleCompetition = (code) => {
    const next = selectedCompetitions.includes(code)
      ? selectedCompetitions.filter(c => c !== code)
      : [...selectedCompetitions, code]
    onCompetitionsChange(next)
    if (!next.includes('CL')) onUclTeamsChange([])
  }

  const toggleUclTeam = (name) => {
    const next = selectedUclTeams.includes(name)
      ? selectedUclTeams.filter(t => t !== name)
      : [...selectedUclTeams, name]
    onUclTeamsChange(next)
  }

  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Competitions</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {competitionsList.map(c => (
          <label key={c.code} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={selectedCompetitions.includes(c.code)}
              onChange={() => toggleCompetition(c.code)}
              className="accent-green-600"
            />
            {c.name}
          </label>
        ))}
      </div>

      {selectedCompetitions.includes('CL') && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Champions League teams</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Only Champions League games between two teams you select here will be shown or count for this league.</p>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            {uclTeamsList.map(t => (
              <label key={t.name} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={selectedUclTeams.includes(t.name)}
                  onChange={() => toggleUclTeam(t.name)}
                  className="accent-green-600"
                />
                {t.name}
              </label>
            ))}
          </div>
          {selectedUclTeams.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Select at least one Champions League team.</p>
          )}
        </div>
      )}
    </div>
  )
}

// Validity rule shared by every caller's submit-disabled logic: at least one
// competition chosen, and at least one CL team chosen if CL is among them.
export function isValidCompetitionsSelection(selectedCompetitions, selectedUclTeams) {
  return selectedCompetitions.length > 0 &&
    (!selectedCompetitions.includes('CL') || selectedUclTeams.length > 0)
}

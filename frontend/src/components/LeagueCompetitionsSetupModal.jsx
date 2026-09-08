import { useState, useEffect } from 'react'
import api from '../api/client'
import CompetitionsPicker, { isValidCompetitionsSelection } from './CompetitionsPicker'

// Forced, non-dismissible popup: `league` has never had its competitions
// configured (competitions: [] from the backend). Its responsible admin (or
// the site admin, for any unset league) must explicitly choose before doing
// anything else on the Leagues page — no close button, no backdrop-dismiss,
// no defer/skip. Mirrors App.jsx's TeamNameModal non-dismissible precedent,
// since this is also a must-complete-before-proceeding flow.
//
// Leagues.jsx owns the queue of leagues needing setup and always passes the
// current head of that queue as `league`; it advances/dismisses by changing
// which league is passed in (or unmounting this component once the queue is
// empty). This component just resets its local selection whenever the
// `league` it's showing changes.
export default function LeagueCompetitionsSetupModal({ league, onComplete }) {
  const [selectedCompetitions, setSelectedCompetitions] = useState([])
  const [selectedUclTeams, setSelectedUclTeams] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset the in-progress selection each time the queue advances to a new
  // league — this modal is otherwise never unmounted/remounted between
  // leagues in the queue.
  useEffect(() => {
    setSelectedCompetitions([])
    setSelectedUclTeams([])
    setError('')
  }, [league.id])

  const valid = isValidCompetitionsSelection(selectedCompetitions, selectedUclTeams)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        competitions: selectedCompetitions,
        ucl_teams: selectedCompetitions.includes('CL') ? selectedUclTeams : null,
      }
      const { data } = await api.patch(`/leagues/${league.id}/settings`, payload)
      onComplete(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-8 max-w-md w-full shadow-xl">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Choose competitions</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          "{league.name}" doesn't have its competitions set yet. Choose at least one competition (and Champions League teams, if selected) to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <CompetitionsPicker
            selectedCompetitions={selectedCompetitions}
            onCompetitionsChange={setSelectedCompetitions}
            selectedUclTeams={selectedUclTeams}
            onUclTeamsChange={setSelectedUclTeams}
          />

          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

          <button
            type="submit"
            disabled={saving || !valid}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

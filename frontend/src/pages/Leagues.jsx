import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import CompetitionsPicker, { isValidCompetitionsSelection } from '../components/CompetitionsPicker'
import LeagueCompetitionsSetupModal from '../components/LeagueCompetitionsSetupModal'

// One league row — used in both the Active and Archived sections. The
// Archive/Unarchive control sits outside the Link so it never triggers
// navigation (nesting a <button> inside an <a> would be invalid markup).
function LeagueRow({ league, onToggleArchive, archiving }) {
  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition">
      <Link to={`/leagues/${league.id}`} className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{league.name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
          {league.invite_code} · {league.max_participants != null ? `${league.member_count} / ${league.max_participants} members` : `${league.member_count} member${league.member_count !== 1 ? 's' : ''}`}
        </p>
      </Link>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <button
          type="button"
          onClick={() => onToggleArchive(league)}
          disabled={archiving}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 transition disabled:opacity-50"
        >
          {archiving ? '…' : league.archived ? 'Unarchive' : 'Archive'}
        </button>
        <Link to={`/leagues/${league.id}`} className="text-gray-300 dark:text-gray-600">›</Link>
      </div>
    </div>
  )
}

export default function Leagues() {
  const { user, isAdmin } = useAuth()
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [createName, setCreateName] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [archivingId, setArchivingId] = useState(null)

  // Competitions multi-select + conditional CL-team multi-select, admin-only
  // create form. Fetching/toggling/validity now lives in the shared,
  // controlled <CompetitionsPicker> — this page just owns the selected
  // values.
  const [selectedCompetitions, setSelectedCompetitions] = useState([])
  const [selectedUclTeams, setSelectedUclTeams] = useState([])

  // Forced competitions-setup queue: this user's own unset leagues, plus
  // (for a site admin) every unset league site-wide via GET /leagues/unset —
  // not just a filter over `leagues`, since that endpoint only returns
  // leagues the caller is a member of. Combined and deduped by league id.
  const [needsSetupQueue, setNeedsSetupQueue] = useState([])

  const fetchLeagues = async () => {
    try {
      const { data } = await api.get('/leagues')
      setLeagues(data)
      return data
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeagues() }, [])

  useEffect(() => {
    if (loading || !user) return
    let cancelled = false
    ;(async () => {
      const ownUnset = leagues.filter(l => l.admin_id === user.id && (l.competitions || []).length === 0)
      let combined = ownUnset
      if (isAdmin) {
        try {
          const { data } = await api.get('/leagues/unset')
          const extra = (data || []).filter(l => !combined.some(c => c.id === l.id))
          combined = [...combined, ...extra]
        } catch {
          // If this fails, fall back to just the admin's own unset leagues
          // rather than blocking the page.
        }
      }
      if (!cancelled) setNeedsSetupQueue(combined)
    })()
    return () => { cancelled = true }
    // Only recompute once the initial /leagues fetch settles — the queue is
    // otherwise maintained locally as each league is completed (see
    // handleSetupComplete below), so this doesn't need to re-run on every
    // `leagues` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const handleSetupComplete = (updatedLeague) => {
    setLeagues(prev => prev.map(l => (l.id === updatedLeague.id ? updatedLeague : l)))
    setNeedsSetupQueue(prev => {
      const next = prev.filter(l => l.id !== updatedLeague.id)
      if (next.length === 0) fetchLeagues() // queue now empty — refresh the page's own league list
      return next
    })
  }

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  const create = async (e) => {
    e.preventDefault()
    try {
      const payload = { name: createName, competitions: selectedCompetitions }
      if (maxParticipants !== '') payload.max_participants = Number(maxParticipants)
      if (selectedCompetitions.includes('CL')) payload.ucl_teams = selectedUclTeams
      const { data } = await api.post('/leagues', payload)
      setLeagues([...leagues, data])
      setCreateName('')
      setMaxParticipants('')
      setSelectedCompetitions([])
      setSelectedUclTeams([])
      flash('League created!')
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to create league', true)
    }
  }

  const join = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/leagues/join', { invite_code: joinCode })
      setLeagues([...leagues, data])
      setJoinCode('')
      flash(`Joined "${data.name}"!`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to join league', true)
    }
  }

  const toggleArchive = async (league) => {
    setArchivingId(league.id)
    try {
      const { data } = await api.patch(`/leagues/${league.id}/archive`, { archived: !league.archived })
      setLeagues(prev => prev.map(l => (l.id === league.id ? data : l)))
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to update league', true)
    } finally {
      setArchivingId(null)
    }
  }

  const createDisabled = !isValidCompetitionsSelection(selectedCompetitions, selectedUclTeams)

  const activeLeagues = leagues.filter(l => !l.archived)
  const archivedLeagues = leagues.filter(l => l.archived)

  return (
    <div>
      {needsSetupQueue.length > 0 && (
        <LeagueCompetitionsSetupModal league={needsSetupQueue[0]} onComplete={handleSetupComplete} />
      )}

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Leagues</h1>

      {error && <p className="text-red-500 text-sm mb-4 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-green-700 dark:text-green-400 text-sm mb-4 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">{success}</p>}

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {isAdmin && (
          <form onSubmit={create} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Create a league</h2>
            <input
              required value={createName} onChange={e => setCreateName(e.target.value)}
              placeholder="League name"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="number" min="1" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)}
              placeholder="Max participants (optional)"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <CompetitionsPicker
              selectedCompetitions={selectedCompetitions}
              onCompetitionsChange={setSelectedCompetitions}
              selectedUclTeams={selectedUclTeams}
              onUclTeamsChange={setSelectedUclTeams}
            />

            <button disabled={createDisabled} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
              Create
            </button>
          </form>
        )}

        <form onSubmit={join} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Join a league</h2>
          <input
            required value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Invite code (e.g. AB12CD34)"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase"
            maxLength={8}
          />
          <button className="w-full bg-gray-800 dark:bg-gray-600 hover:bg-gray-900 dark:hover:bg-gray-500 text-white text-sm font-medium py-2 rounded-lg transition">
            Join
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
      ) : leagues.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">You're not in any leagues yet.</p>
      ) : (
        <>
          {activeLeagues.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">No active leagues — check the archived section below.</p>
          ) : (
            <div className="space-y-3">
              {activeLeagues.map(l => (
                <LeagueRow key={l.id} league={l} onToggleArchive={toggleArchive} archiving={archivingId === l.id} />
              ))}
            </div>
          )}

          {archivedLeagues.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 select-none">
                Archived ({archivedLeagues.length})
              </summary>
              <div className="space-y-3 mt-3">
                {archivedLeagues.map(l => (
                  <LeagueRow key={l.id} league={l} onToggleArchive={toggleArchive} archiving={archivingId === l.id} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

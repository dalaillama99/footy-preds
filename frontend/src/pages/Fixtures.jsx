import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import FixtureCard from '../components/FixtureCard'
import AdminAddFixture from '../components/AdminAddFixture'
import AdminSyncFixtures from '../components/AdminSyncFixtures'

const STAGE_ORDER = ['FINAL', 'THIRD_PLACE', 'SEMI_FINALS', 'QUARTER_FINALS', 'LAST_16', 'LAST_32', 'GROUP_STAGE']
const STAGE_LABELS = {
  FINAL: 'Final',
  THIRD_PLACE: '3rd Place Play-off',
  SEMI_FINALS: 'Semi-finals',
  QUARTER_FINALS: 'Quarter-finals',
  LAST_16: 'Round of 16',
  LAST_32: 'Round of 32',
  GROUP_STAGE: 'Group Stage',
}

function stageGroupKey(f) {
  if (f.stage === 'GROUP_STAGE') return `Group Stage · ${f.group || ''}`.trim()
  if (f.stage) return STAGE_LABELS[f.stage] || f.stage
  return new Date(f.kickoff + 'Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function sortStageKeys(keys) {
  return [...keys].sort((a, b) => {
    const ai = STAGE_ORDER.findIndex(s => a.startsWith(STAGE_LABELS[s] || s))
    const bi = STAGE_ORDER.findIndex(s => b.startsWith(STAGE_LABELS[s] || s))
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function groupByStage(fixtures) {
  return fixtures.reduce((acc, f) => {
    const key = stageGroupKey(f)
    if (!acc[key]) acc[key] = []
    acc[key].push(f)
    return acc
  }, {})
}

export default function Fixtures() {
  const { user } = useAuth()
  const [fixtures, setFixtures] = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [pastOpen, setPastOpen] = useState(false)
  const [futureOpen, setFutureOpen] = useState(false)
  const [competitionFilter, setCompetitionFilter] = useState('All')
  const pollerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [fx, preds] = await Promise.all([
        api.get('/fixtures'),
        api.get('/predictions'),
      ])
      setFixtures(fx.data)
      const map = {}
      for (const p of preds.data) map[p.fixture_id] = p
      setPredictions(map)
      setLastRefresh(new Date())
      setFetchError('')
    } catch (err) {
      setFetchError(err.response?.data?.detail || 'Could not reach the server — is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    pollerRef.current = setInterval(fetchAll, 15_000)
    return () => clearInterval(pollerRef.current)
  }, [fetchAll])

  const onPredictionSaved = p => setPredictions(prev => ({ ...prev, [p.fixture_id]: p }))
  const onFixtureAdded = f => {
    setFixtures(prev => [...prev, f].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)))
    setShowAdd(false)
  }
  const onScoreSet = updatedFixture => {
    if (updatedFixture && updatedFixture.id) {
      setFixtures(prev => prev.map(f => f.id === updatedFixture.id ? updatedFixture : f))
      // Refetch predictions since points may have changed
      api.get('/predictions').then(r => {
        const map = {}
        for (const p of r.data) map[p.fixture_id] = p
        setPredictions(map)
      })
    } else {
      fetchAll()
    }
  }
  const onFixtureUpdated = f => setFixtures(prev => prev.map(x => x.id === f.id ? f : x))
  const onFixtureDeleted = id => setFixtures(prev => prev.filter(f => f.id !== id))
  const onSyncDone = () => { fetchAll(); setShowSync(false) }

  // Derived state
  const competitions = ['All', ...new Set(fixtures.map(f => f.competition).filter(Boolean))]

  const filtered = competitionFilter === 'All'
    ? fixtures
    : fixtures.filter(f => f.competition === competitionFilter)

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const tomorrowEnd = new Date(todayStart); tomorrowEnd.setDate(tomorrowEnd.getDate() + 2)

  const live = filtered.filter(f => f.status === 'LIVE')

  const upcoming = filtered
    .filter(f => new Date(f.kickoff + 'Z') >= now && new Date(f.kickoff + 'Z') < tomorrowEnd)
    .sort((a, b) => new Date(a.kickoff + 'Z') - new Date(b.kickoff + 'Z'))

  const future = filtered
    .filter(f => new Date(f.kickoff + 'Z') >= tomorrowEnd)
    .sort((a, b) => new Date(a.kickoff + 'Z') - new Date(b.kickoff + 'Z'))

  const past = filtered
    .filter(f => new Date(f.kickoff + 'Z') < now && f.status !== 'LIVE')
    .sort((a, b) => new Date(b.kickoff + 'Z') - new Date(a.kickoff + 'Z'))

  const futureGrouped = groupByStage(future)
  const futureKeys = sortStageKeys(Object.keys(futureGrouped))
  const pastGrouped = groupByStage(past)
  const pastKeys = sortStageKeys(Object.keys(pastGrouped))

  const cardProps = { isAdmin: user?.is_admin, onPredictionSaved, onScoreSet, onFixtureUpdated, onFixtureDeleted }

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading fixtures…</p>
  if (fetchError) return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5">
      <p className="text-red-700 dark:text-red-400 font-medium text-sm mb-1">Failed to load fixtures</p>
      <p className="text-red-500 dark:text-red-400 text-xs">{fetchError}</p>
      <button onClick={fetchAll} className="mt-3 text-xs text-red-600 dark:text-red-400 underline">Try again</button>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fixtures</h1>
        </div>
        {user?.is_admin && (
          <div className="flex gap-2">
            <button onClick={() => { setShowSync(!showSync); setShowAdd(false) }}
              className="border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-sm font-medium px-3 py-1.5 rounded-lg transition">
              Sync API
            </button>
            <button onClick={() => { setShowAdd(!showAdd); setShowSync(false) }}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition">
              {showAdd ? 'Cancel' : '+ Add'}
            </button>
          </div>
        )}
      </div>

      {showSync && <AdminSyncFixtures onSyncDone={onSyncDone} />}
      {showAdd && <div className="mb-6"><AdminAddFixture onAdded={onFixtureAdded} /></div>}

      {/* Competition filter tabs */}
      {competitions.length > 2 && (
        <div className="flex gap-2 flex-wrap mb-5">
          {competitions.map(c => (
            <button key={c} onClick={() => setCompetitionFilter(c)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${
                competitionFilter === c
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Refresh row */}
      <div className="flex items-center justify-between mb-5 text-xs text-gray-400 dark:text-gray-500">
        <span>{lastRefresh && `Updated ${lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}</span>
        <button onClick={fetchAll} className="hover:text-gray-600 dark:hover:text-gray-300">↻ Refresh</button>
      </div>

      {/* Live matches */}
      {live.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
            Live now
          </h2>
          <div className="space-y-3">
            {live.map(f => (
              <FixtureCard key={f.id} fixture={f} prediction={predictions[f.id]} showLineups={false} {...cardProps} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming — today + tomorrow */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Upcoming — today &amp; tomorrow
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No fixtures today or tomorrow{competitionFilter !== 'All' ? ` for ${competitionFilter}` : ''}.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(f => (
              <FixtureCard key={f.id} fixture={f} prediction={predictions[f.id]} showLineups={true} {...cardProps} />
            ))}
          </div>
        )}
      </section>

      {/* Future fixtures — beyond tomorrow, still open for predictions */}
      {future.length > 0 && (
        <section className="mb-8">
          <button
            onClick={() => setFutureOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-600 dark:hover:text-gray-300 transition w-full text-left"
          >
            <span>{futureOpen ? '▾' : '▸'}</span>
            Future fixtures ({future.length}) — predict now
          </button>

          {futureOpen && futureKeys.map(key => (
            <div key={key} className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 pl-1 border-l-2 border-green-400">{key}</h3>
              <div className="space-y-3">
                {futureGrouped[key].map(f => (
                  <FixtureCard key={f.id} fixture={f} prediction={predictions[f.id]} showLineups={false} {...cardProps} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Past matches — collapsible, grouped by round */}
      {past.length > 0 && (
        <section>
          <button
            onClick={() => setPastOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-600 dark:hover:text-gray-300 transition w-full text-left"
          >
            <span>{pastOpen ? '▾' : '▸'}</span>
            Past matches ({past.length})
          </button>

          {pastOpen && pastKeys.map(key => (
            <div key={key} className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 pl-1 border-l-2 border-green-400">{key}</h3>
              <div className="space-y-3">
                {pastGrouped[key].map(f => (
                  <FixtureCard key={f.id} fixture={f} prediction={predictions[f.id]} showLineups={false} {...cardProps} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

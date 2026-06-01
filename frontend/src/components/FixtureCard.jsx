import { useState, useEffect } from 'react'
import api from '../api/client'
import LineupModal from './LineupModal'

function isPast(kickoff) {
  return new Date(kickoff + 'Z') <= new Date()
}

function fmtKickoff(kickoff) {
  const d = new Date(kickoff + 'Z')
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
}

function toLocalDatetimeInput(kickoff) {
  const d = new Date(kickoff + 'Z')
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getPointsBreakdown(pred, fixture) {
  if (!pred || fixture.home_score == null || fixture.away_score == null) return null
  const { home_pred, away_pred } = pred
  const { home_score, away_score } = fixture
  if (home_pred === home_score && away_pred === away_score) return 'Exact score (3 pts)'
  const res = (h, a) => h > a ? 'H' : a > h ? 'A' : 'D'
  const parts = []
  if (res(home_pred, away_pred) === res(home_score, away_score)) {
    parts.push('correct result')
    if (Math.abs(home_pred - away_pred) === Math.abs(home_score - away_score)) {
      parts.push('goal diff +0.5')
    }
  }
  if (home_pred + away_pred === home_score + away_score) parts.push('total goals +0.25')
  return parts.length ? parts.join(', ') : 'No match'
}

function useCountdown(kickoff, locked) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (locked) return
    const update = () => {
      const diff = new Date(kickoff + 'Z') - new Date()
      if (diff <= 0) { setLabel(''); return }
      const days = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      if (days > 0) setLabel(`in ${days}d ${h}h`)
      else if (h > 0) setLabel(`in ${h}h ${m}m`)
      else if (m > 0) setLabel(`in ${m}m`)
      else setLabel('Starting soon')
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [kickoff, locked])
  return label
}

function PointsBadge({ pts, breakdown }) {
  if (pts === null || pts === undefined) return null
  const cls =
    pts === 3   ? 'bg-green-100 text-green-800' :
    pts >= 1.5  ? 'bg-blue-100 text-blue-800' :
    pts >= 1    ? 'bg-sky-100 text-sky-700' :
    pts > 0     ? 'bg-gray-100 text-gray-500' :
                  'bg-red-50 text-red-400'
  const label = pts === 3 ? '⭐ 3 pts' : `${pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2)} pts`
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full cursor-default ${cls}`}
      title={breakdown || undefined}
    >
      {label}
    </span>
  )
}

function TeamCrest({ src, alt }) {
  if (!src) return null
  return <img src={src} alt={alt} className="w-6 h-6 object-contain" onError={e => e.target.style.display = 'none'} />
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1 text-xs font-bold text-red-600">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
      LIVE
    </span>
  )
}

const SCORE_STATUSES = ['FINISHED', 'LIVE', 'SCHEDULED', 'POSTPONED']
const KNOCKOUT_STAGES = new Set(['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'])

export default function FixtureCard({
  fixture, prediction, isAdmin, showLineups,
  onPredictionSaved, onScoreSet, onFixtureUpdated, onFixtureDeleted,
}) {
  const locked = isPast(fixture.kickoff)
  const finished = fixture.status === 'FINISHED'
  const live = fixture.status === 'LIVE'
  const postponed = fixture.status === 'POSTPONED'

  const countdown = useCountdown(fixture.kickoff, locked)

  const isKnockout = fixture.stage && KNOCKOUT_STAGES.has(fixture.stage)

  // Prediction form
  const [homePred, setHomePred] = useState(prediction?.home_pred ?? '')
  const [awayPred, setAwayPred] = useState(prediction?.away_pred ?? '')
  const [penWinner, setPenWinner] = useState(prediction?.pen_winner ?? '')
  const [saving, setSaving] = useState(false)
  const [predError, setPredError] = useState('')

  // Score entry
  const [scoreMode, setScoreMode] = useState(false)
  const [homeScore, setHomeScore] = useState(fixture.home_score ?? '')
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? '')
  const [scoreStatus, setScoreStatus] = useState('FINISHED')
  const [scoreSaving, setScoreSaving] = useState(false)

  // Edit fixture details
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    kickoff: toLocalDatetimeInput(fixture.kickoff),
    competition: fixture.competition || '',
    matchday: fixture.matchday ?? '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Lineup modal
  const [lineupOpen, setLineupOpen] = useState(false)

  const breakdown = getPointsBreakdown(prediction, fixture)

  const savePrediction = async (e) => {
    e.preventDefault()
    setPredError('')
    setSaving(true)
    try {
      const { data } = await api.post('/predictions', {
        fixture_id: fixture.id,
        home_pred: parseInt(homePred),
        away_pred: parseInt(awayPred),
        pen_winner: isKnockout && penWinner ? penWinner : null,
      })
      onPredictionSaved(data)
    } catch (err) {
      setPredError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveScore = async (e) => {
    e.preventDefault()
    setScoreSaving(true)
    const needsScore = scoreStatus === 'FINISHED' || scoreStatus === 'LIVE'
    try {
      const { data } = await api.post(`/fixtures/${fixture.id}/score`, {
        home_score: needsScore ? parseInt(homeScore) : null,
        away_score: needsScore ? parseInt(awayScore) : null,
        status: scoreStatus,
      })
      onScoreSet(data)
      setScoreMode(false)
    } finally {
      setScoreSaving(false)
    }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    setEditSaving(true)
    setEditError('')
    try {
      const { data } = await api.patch(`/fixtures/${fixture.id}`, {
        home_team: editForm.home_team,
        away_team: editForm.away_team,
        kickoff: new Date(editForm.kickoff).toISOString(),
        competition: editForm.competition,
        matchday: editForm.matchday ? parseInt(editForm.matchday) : null,
      })
      if (onFixtureUpdated) onFixtureUpdated(data)
      setEditMode(false)
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  const deleteFixture = async () => {
    setDeleting(true)
    try {
      await api.delete(`/fixtures/${fixture.id}`)
      if (onFixtureDeleted) onFixtureDeleted(fixture.id)
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  const borderCls = live
    ? 'border-red-200 bg-red-50/30'
    : postponed ? 'border-orange-100 bg-orange-50/20'
    : finished ? 'border-gray-200 bg-gray-50/50'
    : 'border-gray-200 bg-white'

  const needsScoreInput = scoreStatus === 'FINISHED' || scoreStatus === 'LIVE'

  return (
    <>
      <div className={`border rounded-2xl px-5 py-4 ${borderCls}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400">
            {fmtKickoff(fixture.kickoff)}
            {fixture.matchday && !fixture.stage && ` · MD ${fixture.matchday}`}
            {countdown && (
              <span className="ml-2 text-green-600 font-medium">{countdown}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {live && <LiveBadge />}
            {finished && (
              <span className="text-xs text-gray-400 font-medium">
                {fixture.duration === 'PENALTY_SHOOTOUT' || fixture.duration === 'EXTRA_TIME' ? 'AET' : 'FT'}
              </span>
            )}
            {postponed && <span className="text-xs text-orange-500 font-medium">PPD</span>}
            {prediction && <PointsBadge pts={prediction.points} breakdown={breakdown} />}
          </div>
        </div>

        {/* Teams + score */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="font-semibold text-gray-900 text-right text-sm">{fixture.home_team}</span>
            <TeamCrest src={fixture.home_team_crest} alt={fixture.home_team} />
          </div>
          <div className="text-center min-w-[64px]">
            {(live || finished) ? (
              <>
                <span className={`text-xl font-bold ${live ? 'text-red-700' : 'text-gray-900'}`}>
                  {fixture.home_score ?? '–'} – {fixture.away_score ?? '–'}
                </span>
                {finished && fixture.duration === 'PENALTY_SHOOTOUT' && fixture.home_penalties != null && (
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {fixture.home_penalties}–{fixture.away_penalties} pens
                  </p>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-300 font-medium">vs</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 justify-start">
            <TeamCrest src={fixture.away_team_crest} alt={fixture.away_team} />
            <span className="font-semibold text-gray-900 text-sm">{fixture.away_team}</span>
          </div>
        </div>

        {/* Locked prediction */}
        {locked && prediction && (
          <div className="text-center text-xs text-gray-400 mb-2">
            Your prediction: <span className="font-medium text-gray-700">{prediction.home_pred} – {prediction.away_pred}</span>
            {prediction.pen_winner && (
              <span className="ml-1">· {prediction.pen_winner === 'home' ? fixture.home_team : fixture.away_team} on pens</span>
            )}
          </div>
        )}

        {/* Prediction form */}
        {!locked && (
          <form onSubmit={savePrediction} className="space-y-2">
            <div className="flex items-center gap-2 justify-center">
              <input type="number" min="0" max="20" value={homePred}
                onChange={e => setHomePred(e.target.value)} required placeholder="0"
                className="w-14 text-center border border-gray-300 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="number" min="0" max="20" value={awayPred}
                onChange={e => setAwayPred(e.target.value)} required placeholder="0"
                className="w-14 text-center border border-gray-300 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button type="submit" disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                {saving ? '…' : prediction ? 'Update' : 'Predict'}
              </button>
            </div>
            {isKnockout && (
              <div className="flex items-center gap-2 justify-center text-xs text-gray-500">
                <span>If pens:</span>
                <select value={penWinner} onChange={e => setPenWinner(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500">
                  <option value="">— don't predict —</option>
                  <option value="home">{fixture.home_team}</option>
                  <option value="away">{fixture.away_team}</option>
                </select>
              </div>
            )}
          </form>
        )}
        {predError && <p className="text-red-500 text-xs text-center mt-1">{predError}</p>}

        {/* Lineup button */}
        {showLineups && fixture.api_id && !postponed && (
          <div className="mt-2 flex justify-center">
            <button onClick={() => setLineupOpen(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              📋 View lineups
            </button>
          </div>
        )}

        {/* Admin section */}
        {isAdmin && (
          <div className="mt-3 border-t border-gray-100 pt-3">

            {/* Score entry form */}
            {scoreMode ? (
              <form onSubmit={saveScore}>
                <div className="flex items-center gap-2 justify-center flex-wrap">
                  {needsScoreInput && (
                    <>
                      <input type="number" min="0" max="20" value={homeScore}
                        onChange={e => setHomeScore(e.target.value)} required
                        className="w-14 text-center border border-amber-300 rounded-lg py-1.5 text-sm focus:outline-none" />
                      <span className="text-gray-400 text-sm">–</span>
                      <input type="number" min="0" max="20" value={awayScore}
                        onChange={e => setAwayScore(e.target.value)} required
                        className="w-14 text-center border border-amber-300 rounded-lg py-1.5 text-sm focus:outline-none" />
                    </>
                  )}
                  <select value={scoreStatus} onChange={e => setScoreStatus(e.target.value)}
                    className="border border-amber-300 rounded-lg py-1.5 text-xs focus:outline-none bg-white text-gray-700">
                    {SCORE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="submit" disabled={scoreSaving}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                    {scoreSaving ? '…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setScoreMode(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              </form>

            /* Edit fixture details form */
            ) : editMode ? (
              <form onSubmit={saveEdit} className="space-y-2">
                {editError && <p className="text-red-500 text-xs">{editError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <input value={editForm.home_team}
                    onChange={e => setEditForm(f => ({ ...f, home_team: e.target.value }))}
                    placeholder="Home team" required
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <input value={editForm.away_team}
                    onChange={e => setEditForm(f => ({ ...f, away_team: e.target.value }))}
                    placeholder="Away team" required
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <input type="datetime-local" value={editForm.kickoff}
                    onChange={e => setEditForm(f => ({ ...f, kickoff: e.target.value }))} required
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                  <input value={editForm.competition}
                    onChange={e => setEditForm(f => ({ ...f, competition: e.target.value }))}
                    placeholder="Competition"
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={editSaving}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                    {editSaving ? '…' : 'Save changes'}
                  </button>
                  <button type="button" onClick={() => setEditMode(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              </form>

            /* Delete confirmation */
            ) : deleteConfirm ? (
              <div className="flex items-center gap-3 justify-center">
                <span className="text-xs text-red-600 font-medium">Delete this fixture?</span>
                <button onClick={deleteFixture} disabled={deleting}
                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                  {deleting ? '…' : 'Yes, delete'}
                </button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>

            /* Admin action row */
            ) : (
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <button onClick={() => { setScoreMode(true); setScoreStatus(finished ? 'FINISHED' : 'FINISHED') }}
                  className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                  {finished ? 'Edit score' : 'Set score'}
                </button>
                <span className="text-gray-200">|</span>
                <button onClick={() => setEditMode(true)}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                  Edit details
                </button>
                {!postponed && (
                  <>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={async () => {
                        await api.post(`/fixtures/${fixture.id}/score`, { status: 'POSTPONED' })
                        onScoreSet({ ...fixture, status: 'POSTPONED', home_score: null, away_score: null })
                      }}
                      className="text-xs text-orange-500 hover:text-orange-700 font-medium">
                      Mark Postponed
                    </button>
                  </>
                )}
                <span className="text-gray-200">|</span>
                <button onClick={() => setDeleteConfirm(true)}
                  className="text-xs text-red-400 hover:text-red-600 font-medium">
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {lineupOpen && <LineupModal fixture={fixture} onClose={() => setLineupOpen(false)} />}
    </>
  )
}

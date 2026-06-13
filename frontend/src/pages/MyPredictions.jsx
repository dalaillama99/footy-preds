import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

const KNOCKOUT_STAGES = new Set(['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'])

function isPast(kickoff) {
  return new Date(kickoff + 'Z') <= new Date()
}

function fmtDate(kickoff) {
  return new Date(kickoff + 'Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtTime(kickoff) {
  return new Date(kickoff + 'Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function getBreakdown(homePred, awayPred, homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return null
  if (homePred === homeScore && awayPred === awayScore) return 'Exact score'
  const res = (h, a) => h > a ? 'H' : a > h ? 'A' : 'D'
  const parts = []
  if (res(homePred, awayPred) === res(homeScore, awayScore)) {
    parts.push('correct result')
    if (Math.abs(homePred - awayPred) === Math.abs(homeScore - awayScore)) {
      parts.push('goal diff')
    }
  }
  if (homePred + awayPred === homeScore + awayScore) parts.push('total goals')
  return parts.length ? parts.join(' + ') : 'No match'
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.5c-.69 0-1.25-.56-1.25-1.25v-6.5c0-.69.56-1.25 1.25-1.25H8a.75.75 0 0 0 0-1.5H4.75A2.75 2.75 0 0 0 2 5.75v6.5A2.75 2.75 0 0 0 4.75 15h6.5A2.75 2.75 0 0 0 14 12.25V9a.75.75 0 0 0-1.5 0v3.25c0 .69-.56 1.25-1.25 1.25h-6.5Z"/>
    </svg>
  )
}

function PredRow({ pred, onUpdated }) {
  const f = pred.fixture
  const editable = !isPast(f.kickoff)
  const isKnockout = KNOCKOUT_STAGES.has(f.stage)
  const scored = pred.points !== null
  const exact = pred.points === 3
  const breakdown = scored ? getBreakdown(pred.home_pred, pred.away_pred, f.home_score, f.away_score) : null

  const [editing, setEditing] = useState(false)
  const [editHome, setEditHome] = useState(String(pred.home_pred))
  const [editAway, setEditAway] = useState(String(pred.away_pred))
  const [editPenWinner, setEditPenWinner] = useState(pred.pen_winner ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const isDraw = editHome !== '' && editAway !== '' && parseInt(editHome) === parseInt(editAway)

  const startEdit = () => {
    setEditHome(String(pred.home_pred))
    setEditAway(String(pred.away_pred))
    setEditPenWinner(pred.pen_winner ?? '')
    setSaveError('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setSaveError('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    const hPred = parseInt(editHome)
    const aPred = parseInt(editAway)
    if (isNaN(hPred) || isNaN(aPred) || hPred < 0 || aPred < 0) {
      setSaveError('Scores cannot be negative')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const { data } = await api.post('/predictions', {
        fixture_id: f.id,
        home_pred: hPred,
        away_pred: aPred,
        pen_winner: isKnockout && isDraw && editPenWinner ? editPenWinner : null,
      })
      onUpdated(data)
      setEditing(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const ptsCls =
    pred.points === 3   ? 'text-green-700 dark:text-green-400 font-bold' :
    pred.points >= 2    ? 'text-blue-700 dark:text-blue-400 font-semibold' :
    pred.points >= 1.5  ? 'text-sky-600 dark:text-sky-400 font-semibold' :
    pred.points > 0     ? 'text-gray-500 dark:text-gray-400' :
    scored              ? 'text-red-400' :
                          'text-gray-400 dark:text-gray-500'

  return (
    <div className={`bg-white dark:bg-gray-800 border rounded-xl px-4 py-3 ${exact ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-center justify-between gap-3">
        {/* Match info */}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
            {f.home_team} vs {f.away_team}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {f.competition && `${f.competition} · `}{fmtDate(f.kickoff)} {fmtTime(f.kickoff)}
          </p>
        </div>

        {/* Your pick */}
        <div className="text-center shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Your pick</p>
          <div className="flex items-center gap-1 justify-center">
            <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
              {pred.home_pred}–{pred.away_pred}
            </span>
            {editable && !editing && (
              <button
                onClick={startEdit}
                className="text-gray-400 hover:text-green-600 dark:text-gray-500 dark:hover:text-green-400 transition"
                title="Edit prediction"
              >
                <PencilIcon />
              </button>
            )}
          </div>
          {pred.pen_winner && !editing && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {pred.pen_winner === 'home' ? f.home_team.split(' ')[0] : f.away_team.split(' ')[0]} pens
            </p>
          )}
        </div>

        {/* Result */}
        <div className="text-center shrink-0 min-w-[52px]">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Result</p>
          {scored ? (
            f.duration === 'PENALTY_SHOOTOUT' && f.home_penalties != null ? (
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{f.home_score}–{f.away_score}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">({f.home_penalties}–{f.away_penalties} pens)</p>
              </div>
            ) : (
              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                {f.home_score}–{f.away_score}
                {f.duration === 'EXTRA_TIME' && <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">AET</span>}
              </p>
            )
          ) : (
            <p className="text-gray-300 dark:text-gray-600 text-sm font-medium">—</p>
          )}
        </div>

        {/* Points */}
        <div className="text-center shrink-0 min-w-[40px]">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Pts</p>
          {scored ? (
            <p className={`text-sm ${ptsCls}`}>
              {exact && '⭐ '}
              {pred.points % 1 === 0 ? pred.points.toFixed(0) : pred.points.toFixed(2)}
            </p>
          ) : (
            <p className="text-gray-300 dark:text-gray-600 text-xs">TBD</p>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <form onSubmit={saveEdit} className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
          <div className="flex items-center gap-2 justify-center">
            <input
              type="number" min="0" max="20" value={editHome} required
              onChange={e => {
                const val = e.target.value
                setEditHome(val)
                if (val === '' || editAway === '' || parseInt(val) !== parseInt(editAway)) setEditPenWinner('')
              }}
              className="w-14 text-center border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-gray-400 dark:text-gray-500 text-sm">–</span>
            <input
              type="number" min="0" max="20" value={editAway} required
              onChange={e => {
                const val = e.target.value
                setEditAway(val)
                if (editHome === '' || val === '' || parseInt(editHome) !== parseInt(val)) setEditPenWinner('')
              }}
              className="w-14 text-center border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="submit" disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {saving ? '…' : 'Save'}
            </button>
            <button type="button" onClick={cancelEdit}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
              Cancel
            </button>
          </div>
          {isKnockout && isDraw && (
            <div className="flex items-center gap-2 justify-center text-xs text-gray-500 dark:text-gray-400">
              <span>If pens:</span>
              <select value={editPenWinner} onChange={e => setEditPenWinner(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500">
                <option value="">— don't predict —</option>
                <option value="home">{f.home_team}</option>
                <option value="away">{f.away_team}</option>
              </select>
            </div>
          )}
          {saveError && <p className="text-red-500 text-xs text-center">{saveError}</p>}
        </form>
      )}

      {/* Breakdown */}
      {!editing && breakdown && (
        <p className={`text-xs mt-1.5 ${pred.points > 0 ? 'text-gray-400 dark:text-gray-500' : 'text-red-300 dark:text-red-500'}`}>
          {breakdown}
        </p>
      )}
    </div>
  )
}

function BracketSection() {
  const [bracket, setBracket] = useState(undefined) // undefined = loading, null = none

  useEffect(() => {
    api.get('/bracket/me')
      .then(r => setBracket(r.data))
      .catch(() => setBracket(null))
  }, [])

  if (bracket === undefined || bracket === null) return null

  const ptsLabel = bracket.points != null
    ? (bracket.points % 1 === 0 ? bracket.points.toFixed(0) : bracket.points.toFixed(2)) + ' pts'
    : 'Pending'
  const ptsCls = bracket.points > 0
    ? 'text-green-700 dark:text-green-400 font-semibold'
    : bracket.points === 0
      ? 'text-red-400'
      : 'text-gray-400 dark:text-gray-500'

  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Bracket Prediction
      </h2>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Semi-final 1</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {bracket.semi1_a} <span className="text-gray-400 dark:text-gray-500 font-normal">vs</span> {bracket.semi1_b}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Semi-final 2</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {bracket.semi2_a} <span className="text-gray-400 dark:text-gray-500 font-normal">vs</span> {bracket.semi2_b}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">Finals</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {bracket.finalist1} <span className="text-gray-400 dark:text-gray-500 font-normal">vs</span> {bracket.finalist2}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Bonus pts</p>
            <p className={`text-sm ${ptsCls}`}>{ptsLabel}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function MyPredictions() {
  const [preds, setPreds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/predictions')
      .then(r => setPreds(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const onUpdated = (updated) => {
    setPreds(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  const pending = preds.filter(p => p.points === null)
  const results = preds.filter(p => p.points !== null)

  const totalPts = results.reduce((s, p) => s + p.points, 0)
  const exactCount = results.filter(p => p.points >= 3).length
  // Correct result but NOT exact: 1.5 ≤ pts < 3 (so the two categories never overlap)
  const correctCount = results.filter(p => p.points >= 1.5 && p.points < 3).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">My Predictions</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Your full prediction history with results</p>

      <BracketSection />

      {preds.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-gray-600 dark:text-gray-300 font-medium">No predictions yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 mb-4">Head to Fixtures to make your first prediction</p>
          <Link to="/fixtures" className="text-sm text-green-600 dark:text-green-400 font-medium hover:underline">View fixtures →</Link>
        </div>
      ) : (
        <>
          {/* Stats summary */}
          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-6">
              {[
                { label: 'Total pts', value: totalPts % 1 === 0 ? totalPts.toFixed(0) : totalPts.toFixed(2) },
                { label: 'Scored', value: results.length },
                { label: 'Correct only', value: correctCount },
                { label: 'Exact score', value: exactCount },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-2xl px-1.5 sm:px-4 py-2.5 sm:py-3 text-center">
                  <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Pending ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map(p => <PredRow key={p.id} pred={p} onUpdated={onUpdated} />)}
              </div>
            </section>
          )}

          {/* Results */}
          {results.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Results ({results.length})
              </h2>
              <div className="space-y-2">
                {results.map(p => <PredRow key={p.id} pred={p} onUpdated={onUpdated} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

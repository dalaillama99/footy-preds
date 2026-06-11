import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

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

function PredRow({ pred }) {
  const f = pred.fixture
  const scored = pred.points !== null
  const exact = pred.points === 3
  const breakdown = scored ? getBreakdown(pred.home_pred, pred.away_pred, f.home_score, f.away_score) : null

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

        {/* Prediction */}
        <div className="text-center shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Your pick</p>
          <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{pred.home_pred}–{pred.away_pred}</p>
        </div>

        {/* Result */}
        <div className="text-center shrink-0 min-w-[52px]">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Result</p>
          {scored ? (
            <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{f.home_score}–{f.away_score}</p>
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

      {/* Breakdown */}
      {breakdown && (
        <p className={`text-xs mt-1.5 ${pred.points > 0 ? 'text-gray-400 dark:text-gray-500' : 'text-red-300 dark:text-red-500'}`}>
          {breakdown}
        </p>
      )}
    </div>
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

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  const pending = preds.filter(p => p.points === null)
  const results = preds.filter(p => p.points !== null)

  const totalPts = results.reduce((s, p) => s + p.points, 0)
  const exactCount = results.filter(p => p.points === 3).length
  const correctCount = results.filter(p => p.points >= 1).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">My Predictions</h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Your full prediction history with results</p>

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
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total pts', value: totalPts % 1 === 0 ? totalPts.toFixed(0) : totalPts.toFixed(2) },
                { label: 'Scored', value: results.length },
                { label: 'Correct result', value: correctCount },
                { label: 'Exact score', value: exactCount },
              ].map(s => (
                <div key={s.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.label}</p>
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
                {pending.map(p => <PredRow key={p.id} pred={p} />)}
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
                {results.map(p => <PredRow key={p.id} pred={p} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

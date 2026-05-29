import { useState, useEffect } from 'react'
import api from '../api/client'

const STAGE_LABELS = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
}

function buildRows(players, formationStr) {
  if (!players?.length) return []
  const gk = players.find(p => p.position === 'Goalkeeper') || players[0]
  const outfield = players.filter(p => p !== gk)
  const counts = formationStr?.split('-').map(Number) || [outfield.length]
  const rows = [[gk]]
  let i = 0
  for (const n of counts) {
    rows.push(outfield.slice(i, i + n))
    i += n
  }
  return rows
}

function lastName(fullName) {
  if (!fullName) return '?'
  const parts = fullName.trim().split(' ')
  return parts[parts.length - 1]
}

function PlayerDot({ player, light }) {
  const textCls = light ? 'text-green-900' : 'text-white'
  const bgCls = light ? 'bg-white/90' : 'bg-green-900/70'
  return (
    <div className="flex flex-col items-center w-14">
      <div className={`w-8 h-8 rounded-full ${bgCls} flex items-center justify-center text-xs font-bold ${textCls} border border-white/30`}>
        {player.shirtNumber || '?'}
      </div>
      <span className={`text-xs mt-0.5 truncate max-w-[56px] text-center ${light ? 'text-green-900/80' : 'text-white/80'}`}>
        {lastName(player.name)}
      </span>
    </div>
  )
}

function Half({ rows, reverse, light }) {
  const displayed = reverse ? [...rows].reverse() : rows
  return (
    <div className="flex flex-col justify-around h-full py-3 gap-1">
      {displayed.map((row, i) => (
        <div key={i} className="flex justify-center gap-2 flex-wrap">
          {row.map((p, j) => <PlayerDot key={j} player={p} light={light} />)}
        </div>
      ))}
    </div>
  )
}

export default function LineupModal({ fixture, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('pitch') // 'pitch' | 'bench'

  useEffect(() => {
    api.get(`/fixtures/${fixture.id}/lineups`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load lineups'))
      .finally(() => setLoading(false))
  }, [fixture.id])

  const homeRows = data?.available ? buildRows(data.home.lineup, data.home.formation) : []
  const awayRows = data?.available ? buildRows(data.away.lineup, data.away.formation) : []

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900 text-sm">{fixture.home_team} vs {fixture.away_team}</p>
            <p className="text-xs text-gray-400 mt-0.5">{fixture.competition} · Lineups</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-4">
          {loading && <p className="text-gray-400 text-sm text-center py-8">Fetching lineups…</p>}
          {error && <p className="text-red-500 text-sm text-center py-8">{error}</p>}

          {data && !data.available && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-gray-600 font-medium text-sm">Lineups not yet announced</p>
              <p className="text-gray-400 text-xs mt-1">Usually released ~1 hour before kickoff</p>
            </div>
          )}

          {data?.available && (
            <>
              {/* Tabs */}
              <div className="flex gap-2 mb-4">
                {['pitch', 'bench'].map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition capitalize ${
                      tab === t ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {t === 'pitch' ? '⚽ Starting XI' : '🪑 Bench'}
                  </button>
                ))}
              </div>

              {tab === 'pitch' && (
                <>
                  {/* Formation labels */}
                  <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2 px-1">
                    <span>{data.home.name} <span className="text-green-600">{data.home.formation}</span></span>
                    <span><span className="text-green-600">{data.away.formation}</span> {data.away.name}</span>
                  </div>

                  {/* Pitch */}
                  <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(to bottom, #2d6a4f, #40916c)' }}>
                    {/* Away half — GK at top, ATT toward centre */}
                    <div className="h-52 border-b border-white/20">
                      <Half rows={awayRows} reverse={false} light={false} />
                    </div>
                    {/* Centre line marker */}
                    <div className="flex items-center justify-center py-1">
                      <div className="w-8 h-8 rounded-full border border-white/30" />
                    </div>
                    {/* Home half — ATT toward centre, GK at bottom */}
                    <div className="h-52 border-t border-white/20">
                      <Half rows={homeRows} reverse={true} light={false} />
                    </div>
                  </div>

                  {/* Coaches */}
                  <div className="flex justify-between text-xs text-gray-400 mt-2 px-1">
                    <span>Coach: {data.home.coach || '—'}</span>
                    <span>Coach: {data.away.coach || '—'}</span>
                  </div>
                </>
              )}

              {tab === 'bench' && (
                <div className="grid grid-cols-2 gap-4">
                  {[data.home, data.away].map((team, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-gray-500 mb-2">{team.name}</p>
                      <div className="space-y-1.5">
                        {team.bench.map((p, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-gray-700">
                            <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium shrink-0">
                              {p.shirtNumber}
                            </span>
                            <span className="truncate">{p.name}</span>
                            <span className="text-gray-400 shrink-0">{STAGE_LABELS[p.position] || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

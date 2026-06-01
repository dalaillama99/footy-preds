import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Leaderboard from '../components/Leaderboard'

function fmtKickoff(kickoff) {
  const d = new Date(kickoff + 'Z')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function PointsBadge({ pts }) {
  if (pts == null) return <span className="text-gray-300 text-xs">—</span>
  const cls =
    pts === 3   ? 'bg-green-100 text-green-800' :
    pts >= 1.5  ? 'bg-blue-100 text-blue-800' :
    pts >= 1    ? 'bg-sky-100 text-sky-700' :
    pts > 0     ? 'bg-gray-100 text-gray-500' :
                  'bg-red-50 text-red-400'
  const label = pts === 3 ? '⭐ 3' : (pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2))
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function PredictionsTab({ leagueId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/leagues/${leagueId}/fixture-predictions`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [leagueId])

  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>
  if (!data.length) return <p className="text-gray-400 text-sm">No predictions to show yet — check back after matches kick off.</p>

  return (
    <div className="space-y-6">
      {data.map(({ fixture, predictions }) => (
        <div key={fixture.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Fixture header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-400 mb-0.5">{fmtKickoff(fixture.kickoff)} · {fixture.competition}</p>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span>{fixture.home_team}</span>
              {fixture.home_score != null && fixture.away_score != null ? (
                <div className="text-center px-2">
                  <span className="font-bold text-base">{fixture.home_score}–{fixture.away_score}</span>
                  {(fixture.duration === 'EXTRA_TIME' || fixture.duration === 'PENALTY_SHOOTOUT') && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">AET</span>
                  )}
                  {fixture.duration === 'PENALTY_SHOOTOUT' && fixture.home_penalties != null && (
                    <p className="text-xs text-gray-500 font-normal">({fixture.home_penalties}–{fixture.away_penalties} pens)</p>
                  )}
                </div>
              ) : (
                <span className="text-gray-300 px-2">vs</span>
              )}
              <span>{fixture.away_team}</span>
            </div>
          </div>

          {/* Predictions table */}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium">Member</th>
                <th className="text-center px-4 py-2 font-medium">Prediction</th>
                <th className="text-right px-4 py-2 font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr key={p.user_id} className={i < predictions.length - 1 ? 'border-b border-gray-50' : ''}>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{p.username}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600 font-mono">
                    {p.home_pred}–{p.away_pred}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <PointsBadge pts={p.points} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

const TABS = ['Standings', 'Predictions', 'Members']

export default function LeagueDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Standings')

  const [league, setLeague] = useState(null)
  const [board, setBoard] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [kickingId, setKickingId] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        const [l, lb, mem] = await Promise.all([
          api.get(`/leagues/${id}`),
          api.get(`/leagues/${id}/leaderboard`),
          api.get(`/leagues/${id}/members`),
        ])
        setLeague(l.data)
        setBoard(lb.data)
        setMembers(mem.data)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  const copyCode = () => {
    navigator.clipboard.writeText(league.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const leaveLeague = async () => {
    setLeaving(true)
    setLeaveError('')
    try {
      await api.delete(`/leagues/${id}/leave`)
      navigate('/leagues')
    } catch (err) {
      setLeaveError(err.response?.data?.detail || 'Failed to leave')
      setLeaving(false)
      setLeaveConfirm(false)
    }
  }

  const kickMember = async (targetId) => {
    setKickingId(targetId)
    try {
      await api.delete(`/leagues/${id}/members/${targetId}`)
      setMembers(prev => prev.filter(m => m.user_id !== targetId))
      setBoard(prev => prev.filter(e => e.user_id !== targetId))
    } finally {
      setKickingId(null)
    }
  }

  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>
  if (!league) return <p className="text-red-500 text-sm">League not found.</p>

  const isLeagueAdmin = league.admin_id === user?.id

  return (
    <div>
      <Link to="/leagues" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">← Leagues</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{league.member_count} member{league.member_count !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 mb-1">Invite code</p>
          <button
            onClick={copyCode}
            className="font-mono text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition"
          >
            {copied ? 'Copied!' : league.invite_code}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Standings' && (
        <Leaderboard entries={board} />
      )}

      {tab === 'Predictions' && (
        <PredictionsTab leagueId={id} />
      )}

      {tab === 'Members' && (
        <div>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-8">
            {members.map((m, i) => (
              <div
                key={m.user_id}
                className={`flex items-center justify-between px-5 py-3.5 ${i < members.length - 1 ? 'border-b border-gray-50' : ''} ${m.user_id === user?.id ? 'bg-green-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{m.username}</span>
                  {m.user_id === user?.id && <span className="text-xs text-green-600">(you)</span>}
                  {m.is_league_admin && <span className="text-xs text-amber-600 font-medium">Admin</span>}
                </div>
                {isLeagueAdmin && m.user_id !== user?.id && (
                  <button
                    onClick={() => kickMember(m.user_id)}
                    disabled={kickingId === m.user_id}
                    className="text-xs text-red-400 hover:text-red-600 transition"
                  >
                    {kickingId === m.user_id ? '…' : 'Kick'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isLeagueAdmin && (
            <div className="border-t border-gray-100 pt-6">
              {leaveError && <p className="text-red-500 text-xs mb-2">{leaveError}</p>}
              {leaveConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-600 font-medium">Leave this league?</span>
                  <button onClick={leaveLeague} disabled={leaving}
                    className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
                    {leaving ? '…' : 'Yes, leave'}
                  </button>
                  <button onClick={() => setLeaveConfirm(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setLeaveConfirm(true)} className="text-sm text-red-400 hover:text-red-600 transition">
                  Leave league
                </button>
              )}
            </div>
          )}

          {isLeagueAdmin && (
            <p className="text-xs text-gray-400 mt-4 border-t border-gray-100 pt-4">
              You are the league admin — you cannot leave this league.
            </p>
          )}
        </div>
      )}


    </div>
  )
}

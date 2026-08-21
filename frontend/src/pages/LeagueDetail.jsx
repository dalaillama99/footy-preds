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

function toDatetimeLocal(dtStr) {
  if (!dtStr) return ''
  const d = new Date(dtStr.endsWith('Z') ? dtStr : dtStr + 'Z')
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function PointsBadge({ pts }) {
  if (pts == null) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
  const cls =
    pts === 3   ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
    pts >= 2    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
    pts >= 1.5  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' :
    pts > 0     ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                  'bg-red-50 text-red-400 dark:bg-red-900/20 dark:text-red-400'
  const label = pts === 3 ? '⭐ 3' : (pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2))
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function FixturePredictions({ fixture, predictions }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Fixture header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 py-3 bg-gray-50/60 dark:bg-gray-700/40 hover:bg-gray-100/60 dark:hover:bg-gray-700/60 transition"
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{fmtKickoff(fixture.kickoff)} · {fixture.competition}</p>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <span>{fixture.home_team}</span>
              {fixture.home_score != null && fixture.away_score != null ? (
                <div className="text-center px-2">
                  {fixture.duration === 'PENALTY_SHOOTOUT' && fixture.home_penalties != null ? (
                    <>
                      <span className="font-bold text-base">{fixture.home_score}–{fixture.away_score}</span>
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 font-normal">AET</span>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-normal">{fixture.home_penalties}–{fixture.away_penalties} pens</p>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-base">{fixture.home_score}–{fixture.away_score}</span>
                      {fixture.duration === 'EXTRA_TIME' && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500 font-normal">AET</span>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <span className="text-gray-300 dark:text-gray-600 px-2">vs</span>
              )}
              <span>{fixture.away_team}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">{predictions.length} pred{predictions.length !== 1 ? 's' : ''}</span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {/* Predictions table — only shown when expanded */}
      {open && (
        <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th className="text-left px-2 sm:px-4 py-2 font-medium">Member</th>
              <th className="text-center px-2 sm:px-4 py-2 font-medium">Prediction</th>
              <th className="text-right px-2 sm:px-4 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p, i) => (
              <tr key={p.user_id} className={i < predictions.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''}>
                <td className="px-2 sm:px-4 py-2.5 text-gray-800 dark:text-gray-200 font-medium">{p.username}</td>
                <td className="px-2 sm:px-4 py-2.5 text-center text-gray-600 dark:text-gray-300 font-mono">
                  {p.home_pred}–{p.away_pred}
                  {p.pen_winner && (
                    <span className="ml-1 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 font-sans">
                      ({p.pen_winner === 'home' ? fixture.home_team.split(' ')[0] : fixture.away_team.split(' ')[0]} pens)
                    </span>
                  )}
                </td>
                <td className="px-2 sm:px-4 py-2.5 text-right">
                  <PointsBadge pts={p.points} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

function PredictionsTab({ leagueId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/leagues/${leagueId}/fixture-predictions`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [leagueId])

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  if (!data.length) return <p className="text-gray-400 dark:text-gray-500 text-sm">No predictions to show yet — check back after matches kick off.</p>

  return (
    <div className="space-y-3">
      {data.map(({ fixture, predictions }) => (
        <FixturePredictions key={fixture.id} fixture={fixture} predictions={predictions} />
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
  const [adminCodeCopied, setAdminCodeCopied] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [kickingId, setKickingId] = useState(null)

  // Admin league settings
  const [leagueFromDate, setLeagueFromDate] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)

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
        if (l.data.created_at) {
          setLeagueFromDate(toDatetimeLocal(l.data.created_at))
        }
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

  const copyAdminCode = () => {
    navigator.clipboard.writeText(league.admin_invite_code)
    setAdminCodeCopied(true)
    setTimeout(() => setAdminCodeCopied(false), 2000)
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

  const saveSettings = async (e) => {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsError('')
    try {
      const { data } = await api.patch(`/leagues/${id}/settings`, {
        created_at: new Date(leagueFromDate).toISOString(),
      })
      setLeague(data)
      const lb = await api.get(`/leagues/${id}/leaderboard`)
      setBoard(lb.data)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (err) {
      setSettingsError(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  if (!league) return <p className="text-red-500 text-sm">League not found.</p>

  const isLeagueAdmin = league.admin_id === user?.id

  return (
    <div>
      <Link to="/leagues" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-4 inline-block">← Leagues</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{league.name}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {league.max_participants != null
              ? `${league.member_count} / ${league.max_participants} members`
              : `${league.member_count} member${league.member_count !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Invite code</p>
          <button
            onClick={copyCode}
            className="font-mono text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded-lg transition"
          >
            {copied ? 'Copied!' : league.invite_code}
          </button>
          {league.admin_invite_code != null && (
            <div className="mt-2">
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Admin override code — bypasses the cap, do not share unless you want to let someone in over the limit</p>
              <button
                onClick={copyAdminCode}
                className="font-mono text-sm bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-3 py-1.5 rounded-lg transition"
              >
                {adminCodeCopied ? 'Copied!' : league.admin_invite_code}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Standings' && (
        <Leaderboard
          entries={board}
          leagueId={id}
          semisFinished={league.semis_finished ?? false}
        />
      )}


      {tab === 'Predictions' && (
        <PredictionsTab leagueId={id} />
      )}

      {tab === 'Members' && (
        <div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden mb-8">
            {members.map((m, i) => (
              <div
                key={m.user_id}
                className={`flex items-center justify-between px-5 py-3.5 ${i < members.length - 1 ? 'border-b border-gray-50 dark:border-gray-700' : ''} ${m.user_id === user?.id ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{m.username}</span>
                  {m.user_id === user?.id && <span className="text-xs text-green-600 dark:text-green-400">(you)</span>}
                  {m.is_league_admin && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Admin</span>}
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
            <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
              {leaveError && <p className="text-red-500 text-xs mb-2">{leaveError}</p>}
              {leaveConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-600 font-medium">Leave this league?</span>
                  <button onClick={leaveLeague} disabled={leaving}
                    className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition">
                    {leaving ? '…' : 'Yes, leave'}
                  </button>
                  <button onClick={() => setLeaveConfirm(false)} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setLeaveConfirm(true)} className="text-sm text-red-400 hover:text-red-600 transition">
                  Leave league
                </button>
              )}
            </div>
          )}

          {isLeagueAdmin && (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-4">
                You are the league admin — you cannot leave this league.
              </p>

              {/* Admin: league settings */}
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">League Settings</h3>
                <form onSubmit={saveSettings} className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Count matches from:</label>
                    <input
                      type="datetime-local"
                      value={leagueFromDate}
                      onChange={e => setLeagueFromDate(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                    >
                      {savingSettings ? '…' : settingsSaved ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                  {settingsError && <p className="text-red-500 text-xs">{settingsError}</p>}
                </form>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Only fixtures after this date count toward standings. Updating refreshes the leaderboard.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

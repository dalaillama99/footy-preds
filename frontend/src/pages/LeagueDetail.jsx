import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Leaderboard from '../components/Leaderboard'

export default function LeagueDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

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

      {/* Leaderboard */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Standings</h2>
      <div className="mb-8">
        <Leaderboard entries={board} />
      </div>

      {/* Members list */}
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Members</h2>
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

      {/* Leave league */}
      {!isLeagueAdmin && (
        <div className="border-t border-gray-100 pt-6">
          {leaveError && <p className="text-red-500 text-xs mb-2">{leaveError}</p>}
          {leaveConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-600 font-medium">Leave this league?</span>
              <button
                onClick={leaveLeague}
                disabled={leaving}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
              >
                {leaving ? '…' : 'Yes, leave'}
              </button>
              <button onClick={() => setLeaveConfirm(false)} className="text-sm text-gray-400 hover:text-gray-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setLeaveConfirm(true)}
              className="text-sm text-red-400 hover:text-red-600 transition"
            >
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
  )
}

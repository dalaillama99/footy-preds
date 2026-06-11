import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

export default function Leagues() {
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [createName, setCreateName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchLeagues = async () => {
    try {
      const { data } = await api.get('/leagues')
      setLeagues(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeagues() }, [])

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  const create = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/leagues', { name: createName })
      setLeagues([...leagues, data])
      setCreateName('')
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Leagues</h1>

      {error && <p className="text-red-500 text-sm mb-4 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-green-700 dark:text-green-400 text-sm mb-4 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">{success}</p>}

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <form onSubmit={create} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Create a league</h2>
          <input
            required value={createName} onChange={e => setCreateName(e.target.value)}
            placeholder="League name"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition">
            Create
          </button>
        </form>

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
        <div className="space-y-3">
          {leagues.map(l => (
            <Link
              key={l.id} to={`/leagues/${l.id}`}
              className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4 hover:border-green-400 dark:hover:border-green-600 hover:shadow-sm transition"
            >
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{l.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{l.invite_code} · {l.member_count} member{l.member_count !== 1 ? 's' : ''}</p>
              </div>
              <span className="text-gray-300 dark:text-gray-600">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

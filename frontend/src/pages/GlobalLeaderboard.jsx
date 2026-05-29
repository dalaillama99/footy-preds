import { useState, useEffect } from 'react'
import api from '../api/client'
import Leaderboard from '../components/Leaderboard'

export default function GlobalLeaderboard() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/leaderboard')
      .then(r => setEntries(r.data))
      .catch(e => setError(e.response?.data?.detail || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>
  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Leaderboard</h1>
      <p className="text-gray-500 text-sm mb-6">Overall standings across all fixtures</p>
      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm">No scored predictions yet — check back after the first games.</p>
      ) : (
        <Leaderboard entries={entries} />
      )}
    </div>
  )
}

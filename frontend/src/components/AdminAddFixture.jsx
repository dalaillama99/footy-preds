import { useState } from 'react'
import api from '../api/client'

export default function AdminAddFixture({ onAdded }) {
  const [form, setForm] = useState({
    home_team: '', away_team: '', kickoff: '', competition: '', matchday: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        home_team: form.home_team,
        away_team: form.away_team,
        kickoff: new Date(form.kickoff).toISOString(),
        competition: form.competition,
        matchday: form.matchday ? parseInt(form.matchday) : null,
      }
      const { data } = await api.post('/fixtures', payload)
      onAdded(data)
      setForm({ home_team: '', away_team: '', kickoff: '', competition: '', matchday: '' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add fixture')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <h2 className="font-semibold text-amber-900 mb-4 text-sm">Add fixture</h2>
      {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Home team</label>
          <input name="home_team" required value={form.home_team} onChange={handle}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Away team</label>
          <input name="away_team" required value={form.away_team} onChange={handle}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kickoff (local time)</label>
          <input name="kickoff" type="datetime-local" required value={form.kickoff} onChange={handle}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Competition (optional)</label>
          <input name="competition" value={form.competition} onChange={handle}
            placeholder="e.g. Premier League"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
        {saving ? 'Adding…' : 'Add fixture'}
      </button>
    </form>
  )
}

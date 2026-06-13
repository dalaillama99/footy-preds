import { useState, useEffect } from 'react'
import api from '../api/client'

export default function AdminSyncFixtures({ onSyncDone }) {
  const [competitions, setCompetitions] = useState([])
  const [selected, setSelected] = useState('WC')
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [unsyncing, setUnsyncing] = useState(false)
  const [confirmUnsync, setConfirmUnsync] = useState(false)
  const [unsyncResult, setUnsyncResult] = useState(null)
  const [syncedCompetitions, setSyncedCompetitions] = useState([])
  const [unsyncSelected, setUnsyncSelected] = useState('')

  useEffect(() => {
    api.get('/fixtures/competitions').then(r => {
      setCompetitions(r.data)
    })
  }, [])

  useEffect(() => {
    api.get('/fixtures/synced-competitions').then(r => {
      setSyncedCompetitions(r.data || [])
      if (r.data && r.data.length > 0) setUnsyncSelected(r.data[0])
    }).catch(() => {})
  }, [])

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    setError('')
    try {
      const { data } = await api.post(`/fixtures/sync?competition=${selected}`)
      setResult(data)
      if (onSyncDone) onSyncDone()
    } catch (err) {
      setError(err.response?.data?.detail || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const unsync = async () => {
    setUnsyncing(true)
    setUnsyncResult(null)
    setError('')
    try {
      const { data } = await api.delete('/fixtures/competition', { params: { name: unsyncSelected } })
      setUnsyncResult(data)
      setConfirmUnsync(false)
      if (onSyncDone) onSyncDone()
    } catch (err) {
      setError(err.response?.data?.detail || 'Unsync failed')
      setConfirmUnsync(false)
    } finally {
      setUnsyncing(false)
    }
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 mb-6">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-3">Sync from football-data.org</p>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setConfirmUnsync(false) }}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        >
          {competitions.map(c => (
            <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
          ))}
        </select>

        <button
          onClick={sync}
          disabled={syncing}
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync fixtures'}
        </button>

        {syncedCompetitions.length > 0 && (
          !confirmUnsync ? (
            <>
              <select
                value={unsyncSelected}
                onChange={e => { setUnsyncSelected(e.target.value); setConfirmUnsync(false) }}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {syncedCompetitions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                onClick={() => { setConfirmUnsync(true); setResult(null); setUnsyncResult(null) }}
                disabled={syncing || unsyncing}
                className="border border-red-400 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                Unsync
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-red-600 dark:text-red-400">
                Delete all {unsyncSelected} fixtures + predictions?
              </span>
              <button
                onClick={unsync}
                disabled={unsyncing}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {unsyncing ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                onClick={() => setConfirmUnsync(false)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>

      {error && (
        <p className="text-red-600 dark:text-red-400 text-xs mt-3">{error}</p>
      )}

      {result && (
        <p className="text-amber-800 dark:text-amber-400 text-xs mt-3">
          Done — {result.created} new, {result.updated} updated
          {result.points_recalculated > 0 && `, ${result.points_recalculated} predictions scored`}.
        </p>
      )}

      {unsyncResult && (
        <p className="text-red-700 dark:text-red-400 text-xs mt-3">
          Removed {unsyncResult.deleted_fixtures} fixtures and {unsyncResult.deleted_predictions} predictions.
        </p>
      )}

      <p className="text-amber-700 dark:text-amber-500 text-xs mt-3 opacity-70">
        Pulls all scheduled + completed matches for the selected competition. Re-run anytime to refresh scores.
      </p>
    </div>
  )
}

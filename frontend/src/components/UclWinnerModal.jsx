import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// Typeahead field: searches the CL team list and shows each option's crest
// next to the team name in UPPERCASE. Mirrors BracketModal/PLTableModal's
// TeamTypeahead.
function TeamTypeahead({ value, onChange, options, placeholder, disabled = false }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = options.filter(t => t.name.toLowerCase().includes(q))
  const select = (team) => {
    onChange(team.name)
    setQuery(team.name)
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); onChange('') }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          {matches.map(team => (
            <li
              key={team.name}
              onClick={() => select(team)}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {team.crest && (
                <img
                  src={team.crest}
                  alt=""
                  className="w-5 h-5 object-contain shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
              <span className="uppercase">{team.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// One-shot popup (open to all users, not admin-gated): predict the Champions
// League winner. Mirrors BracketModal/PLTableModal's submit-and-lock flow
// (GET /ucl/me on mount — null means show; submit sets show=false permanently
// and never shows again).
export default function UclWinnerModal({ onClose }) {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [teams, setTeams] = useState([])
  const [winner, setWinner] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return

    let cancelled = false
    ;(async () => {
      try {
        const { data: existing } = await api.get('/ucl/me')
        if (cancelled) return
        if (existing) return // already submitted — never show again
        const { data: teamList } = await api.get('/ucl/teams')
        if (cancelled) return
        setTeams(teamList || [])
        setShow(true)
      } catch {
        // If we can't load, fail silent — don't block the app.
      }
    })()
    return () => { cancelled = true }
  }, [user])

  if (!show) return null

  const byName = (name) => teams.find(t => t.name === name) || null
  const allValid = !!byName(winner)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allValid) return
    setSaving(true)
    setError('')
    try {
      await api.post('/ucl', { predicted_winner: winner })
      setShow(false) // one-shot — locked, never shown again
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit prediction')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setShow(false)
    onClose?.()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              🏆 Champions League winner
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none ml-4 mt-0.5"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-3">
            <p>Predict which team wins the Champions League this season. Enter now and it's locked in for good. 🔒</p>
            <ul className="space-y-1">
              <li>🏅 Correct winner → <strong>+5 pts if correct</strong></li>
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Winner</p>
            <TeamTypeahead value={winner} onChange={setWinner} options={teams} placeholder="" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving || !allValid}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Submit prediction'}
          </button>
        </form>
      </div>
    </div>
  )
}

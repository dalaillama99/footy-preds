import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// Typeahead field: searches the PL team list and shows each option's crest
// next to the team name in UPPERCASE. Mirrors BracketModal's TeamTypeahead.
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

// Ordered slot keys — 5 top-5 rows (labeled 1-5) then 3 relegation rows
// (labeled 18-20, in the on-screen 18→20 downward order).
const TOP5_SLOTS = [
  { key: 'pos1', label: 1 },
  { key: 'pos2', label: 2 },
  { key: 'pos3', label: 3 },
  { key: 'pos4', label: 4 },
  { key: 'pos5', label: 5 },
]
const RELEGATION_SLOTS = [
  { key: 'rel18', label: 18 },
  { key: 'rel19', label: 19 },
  { key: 'rel20', label: 20 },
]
const ALL_SLOTS = [...TOP5_SLOTS, ...RELEGATION_SLOTS]

// One-shot admin-only popup: predict PL top-5 (positions 1-5, in order) and
// relegation bottom-3 (positions 18-20, in order) for the season. Mirrors
// BracketModal's submit-and-lock flow (GET /pl-table/me on mount — null
// means show; submit sets show=false permanently and never shows again).
export default function PLTableModal() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [teams, setTeams] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [picks, setPicks] = useState({
    pos1: '', pos2: '', pos3: '', pos4: '', pos5: '',
    rel18: '', rel19: '', rel20: '',
  })

  useEffect(() => {
    if (!user) return

    let cancelled = false
    ;(async () => {
      try {
        const { data: existing } = await api.get('/pl-table/me')
        if (cancelled) return
        if (existing) return // already submitted — never show again
        const { data: teamList } = await api.get('/pl-table/teams')
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

  // A team already picked in any of the other 7 rows must not be selectable
  // again in a given row (mirrors bracket's semiOptionsFor).
  const selectedTeams = ALL_SLOTS.map(s => picks[s.key]).filter(Boolean)
  const optionsFor = (ownValue) =>
    teams.filter(t => t.name === ownValue || !selectedTeams.includes(t.name))

  const setPick = (key) => (v) => setPicks(prev => ({ ...prev, [key]: v }))

  const allValid = ALL_SLOTS.every(s => byName(picks[s.key]))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allValid) return
    setSaving(true)
    setError('')
    try {
      await api.post('/pl-table', { ...picks })
      setShow(false) // one-shot — locked, never shown again
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit prediction')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            🏆 Premier League table prediction
          </h2>
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-3">
            <p>Predict the final Premier League top 5 and bottom 3 (relegation) for the season. Enter now and it's locked in for good. 🔒</p>
            <ul className="space-y-1">
              <li>🎯 Exact position correct → <strong>+3 pts</strong> each</li>
              <li>🏅 Perfect top-5 (all 5 in order) → <strong>+5 pts</strong> bonus</li>
              <li>⚡ Perfect relegation-3 (all 3 in order) → <strong>+3 pts</strong> bonus</li>
            </ul>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Top 5</p>
            {TOP5_SLOTS.map(s => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold text-gray-500 dark:text-gray-400 text-right">{s.label}</span>
                <div className="flex-1">
                  <TeamTypeahead
                    value={picks[s.key]}
                    onChange={setPick(s.key)}
                    options={optionsFor(picks[s.key])}
                    placeholder=""
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Relegation (bottom 3)</p>
            {RELEGATION_SLOTS.map(s => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold text-gray-500 dark:text-gray-400 text-right">{s.label}</span>
                <div className="flex-1">
                  <TeamTypeahead
                    value={picks[s.key]}
                    onChange={setPick(s.key)}
                    options={optionsFor(picks[s.key])}
                    placeholder=""
                  />
                </div>
              </div>
            ))}
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

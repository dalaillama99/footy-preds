import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// ---------------------------------------------------------------------------
// Bonus bracket prediction onboarding popup.
//
// GATING: shown only when the logged-in user is an admin AND has not yet
// submitted a bracket (GET /bracket/me returns null). Non-admins never see it.
//
// >>> TO UN-GATE FOR FULL ROLLOUT: delete the `if (!user.is_admin) return`
//     guard below (the line marked ADMIN GATE) so every user is prompted.
// ---------------------------------------------------------------------------

// Typeahead field: searches the WC team list and shows each option's flag
// (crest) next to the team name in UPPERCASE.
function TeamTypeahead({ value, onChange, options, placeholder }) {
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
  // A field is "valid" only when its text exactly matches an available team.
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
        className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-green-500"
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

export default function BracketModal() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [teams, setTeams] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [semi1A, setSemi1A] = useState('')
  const [semi1B, setSemi1B] = useState('')
  const [semi2A, setSemi2A] = useState('')
  const [semi2B, setSemi2B] = useState('')
  const [finalist1, setFinalist1] = useState('')
  const [finalist2, setFinalist2] = useState('')

  useEffect(() => {
    if (!user) return
    // ADMIN GATE — remove this line to roll out to all users.
    if (!user.is_admin) return

    let cancelled = false
    ;(async () => {
      try {
        const { data: existing } = await api.get('/bracket/me')
        if (cancelled) return
        if (existing) return // already submitted — never show again
        const { data: teamList } = await api.get('/bracket/teams')
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

  // Finalists are restricted to one team from each semi-final.
  const semi1Teams = teams.filter(t => t.name === semi1A || t.name === semi1B)
  const semi2Teams = teams.filter(t => t.name === semi2A || t.name === semi2B)

  // When a semi-final field changes, reset the dependent finalist if it's no
  // longer one of that semi's two teams (avoids stale finalist selections).
  const updateSemi1A = (v) => { setSemi1A(v); if (finalist1 && finalist1 !== v && finalist1 !== semi1B) setFinalist1('') }
  const updateSemi1B = (v) => { setSemi1B(v); if (finalist1 && finalist1 !== v && finalist1 !== semi1A) setFinalist1('') }
  const updateSemi2A = (v) => { setSemi2A(v); if (finalist2 && finalist2 !== v && finalist2 !== semi2B) setFinalist2('') }
  const updateSemi2B = (v) => { setSemi2B(v); if (finalist2 && finalist2 !== v && finalist2 !== semi2A) setFinalist2('') }

  const allValid = [semi1A, semi1B, semi2A, semi2B].every(v => byName(v)) &&
    semi1Teams.some(t => t.name === finalist1) &&
    semi2Teams.some(t => t.name === finalist2)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allValid) return
    setSaving(true)
    setError('')
    try {
      await api.post('/bracket', {
        semi1_a: semi1A,
        semi1_b: semi1B,
        semi2_a: semi2A,
        semi2_b: semi2B,
        finalist1,
        finalist2,
      })
      setShow(false) // one-shot — locked, never shown again
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit bracket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">🏆 Bonus bracket prediction</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            A bonus, long-range prediction. Nail both <strong>semi-final matchups</strong> for <strong>5 pts</strong>;
            get both <strong>finalists</strong> correct for <strong>5 pts</strong>;
            get <strong>both right</strong> for <strong>15 pts</strong> total. Order of semis doesn't matter.
            Points are added to your league standings at the end of the tournament.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Horizontal bracket layout — all screen sizes */}
          <div className="flex gap-0 items-stretch min-h-[240px]">
            {/* Left column — semi-finals */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col justify-center gap-2 pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Semi-final 1</p>
                <TeamTypeahead value={semi1A} onChange={updateSemi1A} options={teams} placeholder="" />
                <TeamTypeahead value={semi1B} onChange={updateSemi1B} options={teams} placeholder="" />
              </div>
              <div className="flex-1 flex flex-col justify-center gap-2 pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Semi-final 2</p>
                <TeamTypeahead value={semi2A} onChange={updateSemi2A} options={teams} placeholder="" />
                <TeamTypeahead value={semi2B} onChange={updateSemi2B} options={teams} placeholder="" />
              </div>
            </div>

            {/* Center SVG — bracket connector */}
            <div className="w-24 shrink-0">
              <svg width="100%" height="100%" fill="none" className="text-gray-300 dark:text-gray-600">
                <line x1="0%" y1="33%" x2="85%" y2="33%" stroke="currentColor" strokeWidth="2" />
                <line x1="0%" y1="67%" x2="85%" y2="67%" stroke="currentColor" strokeWidth="2" />
                <line x1="85%" y1="33%" x2="85%" y2="67%" stroke="currentColor" strokeWidth="2" />
                <line x1="85%" y1="50%" x2="100%" y2="50%" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>

            {/* Right column — finalists */}
            <div className="flex-1 flex flex-col justify-center gap-8 pl-6">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center mb-2">Final</p>
                <TeamTypeahead value={finalist1} onChange={setFinalist1} options={semi1Teams} placeholder="" />
              </div>
              <TeamTypeahead value={finalist2} onChange={setFinalist2} options={semi2Teams} placeholder="" />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={saving || !allValid}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '…' : 'Submit bracket'}
          </button>
        </form>
      </div>
    </div>
  )
}

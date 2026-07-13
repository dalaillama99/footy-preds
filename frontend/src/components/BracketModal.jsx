import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// Typeahead field: searches the WC team list and shows each option's flag
// (crest) next to the team name in UPPERCASE.
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

// Static display of a team name + crest for read-only mode.
function TeamDisplay({ name, teams }) {
  const team = teams.find(t => t.name === name)
  if (!name) return <div className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-400 dark:text-gray-500 italic">—</div>
  return (
    <div className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
      {team?.crest && (
        <img
          src={team.crest}
          alt=""
          className="w-5 h-5 object-contain shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
      <span className="uppercase text-gray-900 dark:text-gray-100">{name}</span>
    </div>
  )
}

// BracketModal has two modes:
//   - Default (no props): prompt the current user to submit their bracket if not yet done.
//   - readOnly + userId + leagueId: fetch and display another user's bracket without any inputs.
//   - readOnly (no userId): fetch the current user's own bracket for display.
export default function BracketModal({ readOnly = false, userId = null, leagueId = null, onClose }) {
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

  const bracketRef = useRef(null)
  const sf1ARef = useRef(null)
  const sf1BRef = useRef(null)
  const sf2ARef = useRef(null)
  const sf2BRef = useRef(null)
  const fin1Ref = useRef(null)
  const fin2Ref = useRef(null)
  const [svgLines, setSvgLines] = useState(null)

  useEffect(() => {
    if (!user) return

    let cancelled = false
    ;(async () => {
      try {
        if (readOnly) {
          // Read-only: fetch the specified user's bracket (or current user's if no userId)
          const bracketUrl = userId && leagueId
            ? `/leagues/${leagueId}/bracket/${userId}`
            : '/bracket/me'
          const [{ data: bracketData }, { data: teamList }] = await Promise.all([
            api.get(bracketUrl),
            api.get('/bracket/teams'),
          ])
          if (cancelled) return
          setTeams(teamList || [])
          if (bracketData) {
            setSemi1A(bracketData.semi1_a || '')
            setSemi1B(bracketData.semi1_b || '')
            setSemi2A(bracketData.semi2_a || '')
            setSemi2B(bracketData.semi2_b || '')
            setFinalist1(bracketData.finalist1 || '')
            setFinalist2(bracketData.finalist2 || '')
          }
          setShow(true)
        } else {
          // Default: only show if current user has not yet submitted
          const { data: existing } = await api.get('/bracket/me')
          if (cancelled) return
          if (existing) return // already submitted — never show again
          const { data: teamList } = await api.get('/bracket/teams')
          if (cancelled) return
          setTeams(teamList || [])
          setShow(true)
        }
      } catch {
        // If we can't load, fail silent — don't block the app.
        if (readOnly && !cancelled) setShow(true) // still show modal even if bracket missing
      }
    })()
    return () => { cancelled = true }
  }, [user, readOnly, userId, leagueId])

  useLayoutEffect(() => {
    if (!show || !bracketRef.current) return
    const measure = () => {
      const c = bracketRef.current.getBoundingClientRect()
      if (c.height === 0) return
      const midY = (ref) => {
        if (!ref.current) return 0
        const r = ref.current.getBoundingClientRect()
        return ((r.top + r.bottom) / 2 - c.top) / c.height * 100
      }
      const rightPct = (ref) => {
        if (!ref.current) return 0
        const r = ref.current.getBoundingClientRect()
        return (r.right - c.left) / c.width * 100
      }
      const leftPct = (ref) => {
        if (!ref.current) return 0
        const r = ref.current.getBoundingClientRect()
        return (r.left - c.left) / c.width * 100
      }
      const sf1Y = (midY(sf1ARef) + midY(sf1BRef)) / 2
      const sf2Y = (midY(sf2ARef) + midY(sf2BRef)) / 2
      const finalY = (midY(fin1Ref) + midY(fin2Ref)) / 2
      const leftEdge = rightPct(sf1BRef)
      const rightEdge = leftPct(fin1Ref)
      const bracketX = (leftEdge + rightEdge) / 2
      setSvgLines({ sf1Y, sf2Y, finalY, leftEdge, rightEdge, bracketX })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [show])

  if (!show) return null

  const byName = (name) => teams.find(t => t.name === name) || null

  // Finalists are restricted to one team from each semi-final.
  const semi1Teams = teams.filter(t => t.name === semi1A || t.name === semi1B)
  const semi2Teams = teams.filter(t => t.name === semi2A || t.name === semi2B)

  // Semi-final options exclude teams already selected in the other three semi-final fields.
  const selectedSemiTeams = [semi1A, semi1B, semi2A, semi2B].filter(Boolean)
  const semiOptionsFor = (ownValue) =>
    teams.filter(t => t.name === ownValue || !selectedSemiTeams.includes(t.name))

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

  const handleClose = () => {
    setShow(false)
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={readOnly ? handleClose : undefined}
    >
      <div
        className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {readOnly ? 'Bracket prediction' : '🏆 Bonus bracket prediction'}
            </h2>
            {readOnly && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none ml-4 mt-0.5"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
          {!readOnly && (
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-3">
              <p>A long-range prediction for some bonus points at the end of the world cup! Enter now and it's locked in for good. 🔒 Points land in your league standings at the end of the tournament.</p>
              <ul className="space-y-1">
                <li>🎯 1 correct semi-final → <strong>+1 pt</strong></li>
                <li>🎯🎯 Both correct semis → <strong>+3 pts</strong></li>
                <li>🏆 Both correct finalists → <strong>+3 pts</strong></li>
                <li>⚡ Bonus for getting both phases right → <strong>+3 pts</strong></li>
                <li className="font-semibold text-gray-600 dark:text-gray-300">Max total: <strong>9 pts</strong></li>
              </ul>
              <p>Work out the bracket before predicting with{' '}
                <a
                  href="https://www.theguardian.com/football/ng-interactive/2026/jun/04/bracketology-predict-a-path-to-world-cup-victory"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-500 hover:underline"
                >Guardian Bracketology</a>.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={readOnly ? (e) => e.preventDefault() : handleSubmit} className="px-6 py-5 space-y-5">
          {/* Horizontal bracket layout — all screen sizes */}
          <div ref={bracketRef} className="relative flex gap-8 items-stretch min-h-[240px]">
            {/* Left column — semi-finals */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col justify-center gap-2 pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Semi-final 1</p>
                {readOnly ? (
                  <>
                    <div ref={sf1ARef}><TeamDisplay name={semi1A} teams={teams} /></div>
                    <div ref={sf1BRef}><TeamDisplay name={semi1B} teams={teams} /></div>
                  </>
                ) : (
                  <>
                    <div ref={sf1ARef}><TeamTypeahead value={semi1A} onChange={updateSemi1A} options={semiOptionsFor(semi1A)} placeholder="" /></div>
                    <div ref={sf1BRef}><TeamTypeahead value={semi1B} onChange={updateSemi1B} options={semiOptionsFor(semi1B)} placeholder="" /></div>
                  </>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center gap-2 pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Semi-final 2</p>
                {readOnly ? (
                  <>
                    <div ref={sf2ARef}><TeamDisplay name={semi2A} teams={teams} /></div>
                    <div ref={sf2BRef}><TeamDisplay name={semi2B} teams={teams} /></div>
                  </>
                ) : (
                  <>
                    <div ref={sf2ARef}><TeamTypeahead value={semi2A} onChange={updateSemi2A} options={semiOptionsFor(semi2A)} placeholder="" /></div>
                    <div ref={sf2BRef}><TeamTypeahead value={semi2B} onChange={updateSemi2B} options={semiOptionsFor(semi2B)} placeholder="" /></div>
                  </>
                )}
              </div>
            </div>

            {/* Right column — finalists */}
            <div className="flex-1 flex flex-col justify-center gap-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Final</p>
              {readOnly ? (
                <>
                  <div ref={fin1Ref}><TeamDisplay name={finalist1} teams={teams} /></div>
                  <div ref={fin2Ref}><TeamDisplay name={finalist2} teams={teams} /></div>
                </>
              ) : (
                <>
                  <div ref={fin1Ref}><TeamTypeahead value={finalist1} onChange={setFinalist1} options={semi1Teams} placeholder="" disabled={!byName(semi1A) || !byName(semi1B)} /></div>
                  <div ref={fin2Ref}><TeamTypeahead value={finalist2} onChange={setFinalist2} options={semi2Teams} placeholder="" disabled={!byName(semi2A) || !byName(semi2B)} /></div>
                </>
              )}
            </div>

            {/* Absolute SVG overlay — lines drawn from measured input positions */}
            {svgLines && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" fill="none">
                <line x1={`${svgLines.leftEdge}%`} y1={`${svgLines.sf1Y}%`} x2={`${svgLines.bracketX}%`} y2={`${svgLines.sf1Y}%`} stroke="#9CA3AF" strokeWidth="2" />
                <line x1={`${svgLines.leftEdge}%`} y1={`${svgLines.sf2Y}%`} x2={`${svgLines.bracketX}%`} y2={`${svgLines.sf2Y}%`} stroke="#9CA3AF" strokeWidth="2" />
                <line x1={`${svgLines.bracketX}%`} y1={`${svgLines.sf1Y}%`} x2={`${svgLines.bracketX}%`} y2={`${svgLines.sf2Y}%`} stroke="#9CA3AF" strokeWidth="2" />
                <line x1={`${svgLines.bracketX}%`} y1={`${svgLines.finalY}%`} x2={`${svgLines.rightEdge}%`} y2={`${svgLines.finalY}%`} stroke="#9CA3AF" strokeWidth="2" />
              </svg>
            )}
          </div>

          {!readOnly && error && <p className="text-red-500 text-xs">{error}</p>}

          {!readOnly && (
            <button
              type="submit"
              disabled={saving || !allValid}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '…' : 'Submit bracket'}
            </button>
          )}

          {readOnly && (
            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-2.5 rounded-xl transition"
            >
              Close
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

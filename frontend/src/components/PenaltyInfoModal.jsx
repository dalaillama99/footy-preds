import { useState } from 'react'

export default function PenaltyInfoModal() {
  const [visible, setVisible] = useState(() => !localStorage.getItem('pen_scoring_seen'))

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem('pen_scoring_seen', '1')
    setVisible(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-8 max-w-sm w-full shadow-xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Penalty shootout scoring</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Knockout games that go to penalties are scored as follows:</p>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-6">
          <li>🏆 Exact draw scoreline + correct pen winner — <strong>4 pts</strong></li>
          <li>⚽ Exact draw scoreline (pen winner wrong/missing) — <strong>3 pts</strong></li>
          <li>✅ Correct draw result + correct pen winner — <strong>2.5 pts</strong></li>
          <li>✅ Correct draw result (pen winner wrong/missing) — <strong>2 pts</strong></li>
        </ul>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Predicting a non-draw score when the game goes to penalties earns no result credit. Use the "If pens:" dropdown on draw predictions to pick the pen winner.</p>
        <button
          onClick={dismiss}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

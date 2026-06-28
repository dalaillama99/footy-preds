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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">The existing scoring system applies as normal. But for knockout games that go to penalties, predicting a draw unlocks a bonus: correctly picking the penalty winner is worth an extra <strong>0.5 pts</strong>.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">If you also nail the exact scoreline, the whole package — exact score + pen winner — is worth <strong>4 pts</strong>.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Predicting a non-draw result means no opportunity to pick a pen winner, so make sure to predict a draw if you think the game is going to penalties.</p>
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

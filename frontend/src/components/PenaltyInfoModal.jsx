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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">In knockout games, if you predict a draw you must also pick who wins on penalties. The existing scoring system applies as normal, and correctly picking the penalty winner is worth an extra <strong>0.5 pts</strong>.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">If you predict a non-draw and that team wins on penalties, you also earn <strong>0.5 pts</strong>. Total goals always count in penalty games too.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">If you also get the exact scoreline right (as a draw), the whole package — exact score + correct pen winner — is worth <strong>4 pts</strong> in total.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Predicting a non-draw means you don't get to pick a penalty winner at all, so if you think a game is going to penalties, make sure to predict a draw.</p>
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

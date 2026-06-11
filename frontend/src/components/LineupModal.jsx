export default function LineupModal({ fixture, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm">{fixture.home_team} vs {fixture.away_team}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fixture.competition} · Lineups</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="text-center py-10 px-5">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-gray-600 dark:text-gray-300 font-medium text-sm">Lineups not yet announced</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Usually released ~1 hour before kickoff</p>
        </div>
      </div>
    </div>
  )
}

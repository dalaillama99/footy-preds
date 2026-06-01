export default function HowItWorks() {
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">How points work</h1>
      <p className="text-sm text-gray-500 mb-2">Points are awarded per match based on how close your prediction is to the actual score.</p>
      <p className="text-sm text-gray-500 mb-6">Prediction deadline is kickoff time — you cannot predict or change your prediction once a match has started.</p>

      <div className="space-y-3">
        <div className="flex items-start gap-4 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <span className="text-2xl">⭐</span>
          <div>
            <p className="font-semibold text-gray-900">3 points — Exact score</p>
            <p className="text-sm text-gray-500 mt-0.5">You predicted the exact scoreline.</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">predicted 2–1, actual 2–1 → 3 pts</p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white border border-gray-200 rounded-2xl px-5 py-4">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-gray-900">1 point — Correct result</p>
            <p className="text-sm text-gray-500 mt-0.5">You got the result right (home win / draw / away win).</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">predicted 2–0, actual 1–0 → 1 pt</p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white border border-gray-200 rounded-2xl px-5 py-4">
          <span className="text-2xl">+½</span>
          <div>
            <p className="font-semibold text-gray-900">+0.5 — Correct goal difference</p>
            <p className="text-sm text-gray-500 mt-0.5">On top of a correct result, you also got the goal difference right.</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">predicted 2–0, actual 3–1 → both home wins by 2 → 1.5 pts</p>
          </div>
        </div>

        <div className="flex items-start gap-4 bg-white border border-gray-200 rounded-2xl px-5 py-4">
          <span className="text-2xl">+¼</span>
          <div>
            <p className="font-semibold text-gray-900">+0.25 — Correct total goals</p>
            <p className="text-sm text-gray-500 mt-0.5">The total number of goals matches the actual total, regardless of result.</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">predicted 2–1 (3 goals), actual 1–2 (3 goals) → +0.25</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-sm text-gray-600 mt-5">
        <p className="font-semibold text-gray-800 mb-1">Maximum without exact score: 1.5 pts</p>
        <p className="text-xs text-gray-500">Correct result (1) + correct goal diff (+0.5). Example: predicted 2–0, actual 3–1.</p>
      </div>
    </div>
  )
}

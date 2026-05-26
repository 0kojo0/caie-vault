/**
 * Client-side fuzzy search over cached questions
 * Uses a simple but fast scoring algorithm
 */

function scoreMatch(query, text) {
  const q = query.toLowerCase().trim()
  const t = text.toLowerCase()

  if (!q || !t) return 0

  // Exact substring = highest score
  if (t.includes(q)) return 100

  // Word-level matching
  const queryWords = q.split(/\s+/).filter(w => w.length > 2)
  if (queryWords.length === 0) return 0

  let matched = 0
  for (const word of queryWords) {
    if (t.includes(word)) matched++
  }

  const wordScore = (matched / queryWords.length) * 85

  // Partial character matching for typos
  let charMatched = 0
  for (let i = 0; i < q.length; i++) {
    if (t.includes(q[i])) charMatched++
  }
  const charScore = (charMatched / q.length) * 40

  return Math.max(wordScore, charScore)
}

export function searchOffline(query, questions, opts = {}) {
  const {
    subjects  = null,   // array of subject strings to filter
    level     = null,
    threshold = 35,
    limit     = 30,
  } = opts

  if (!query.trim()) return []

  let pool = questions

  if (level && level !== 'All') {
    pool = pool.filter(q => q.level === level)
  }
  if (subjects && subjects.length > 0) {
    pool = pool.filter(q => subjects.includes(q.subject))
  }

  const results = []
  for (const q of pool) {
    const score = scoreMatch(query, q.text)
    if (score >= threshold) {
      results.push({ ...q, score: Math.round(score) })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

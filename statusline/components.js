const safe = (fn) => ($, data) => {
  try {
    const v = fn($, data)
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

const fmtTokens = (n) =>
  n >= 1000 ? parseFloat((n / 1000).toFixed(1)) + 'k' : String(n)

const fmtPercent = (n) => Math.round(n) + '%'

const findRate = (data, kinds) => {
  const list = Array.isArray(data?.rateLimits) ? data.rateLimits : []
  const hit = list.find(
    (e) => e && typeof e.kind === 'string' && kinds.includes(e.kind.toLowerCase().replace(/-/g, ''))
  )
  return hit && typeof hit.percentUsed === 'number' ? fmtPercent(hit.percentUsed) : ''
}

const mode = safe(($, data) => (data?.working ? 'WORK' : 'IDLE'))
const model = safe(($, data) => (typeof data?.model === 'string' ? data.model : ''))
const effort = safe(($, data) => (typeof data?.effort === 'string' ? data.effort : ''))
const context = safe(($, data) => {
  const c = data?.context
  const hasT = typeof c?.tokens === 'number'
  const hasP = typeof c?.percent === 'number'
  if (!hasT && !hasP) return ''
  return `${hasT ? fmtTokens(c.tokens) : '-'} (${hasP ? fmtPercent(c.percent) : '-'})`
})
const contextBar = safe(($, data) => {
  const pct = data?.context?.percent
  if (typeof pct !== 'number') return ''
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)))
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled)
})
// hyphens are stripped before matching, so 'five-hour' matches 'fivehour';
// underscore forms like 'five_hour' are listed literally
const rate5h = safe(($, data) => findRate(data, ['five_hour', 'fivehour', '5h']))
const rateWeek = safe(($, data) => findRate(data, ['seven_day', 'sevenday', '7d', 'week']))
const cost = safe(($, data) => {
  const c = data?.cost
  if (typeof c === 'number') return '$' + c.toFixed(2)
  if (c && typeof c === 'object') {
    for (const k of ['usd', 'total', 'amount', 'cost']) {
      if (typeof c[k] === 'number') return '$' + c[k].toFixed(2)
    }
  }
  return ''
})
const account = () => ''
const cwd = safe(($, data) => {
  const p = data?.cwd
  if (typeof p !== 'string' || p === '') return ''
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? p : p.slice(i + 1)
})
const branch = () => ''

export const components = { mode, model, effort, context, contextBar, rate5h, rateWeek, cost, account, cwd, branch }

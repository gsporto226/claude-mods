import { components } from '../components.js'
import { themeFor, DEFAULT_THEME } from '../theme.js'

const DEFAULT_SECTIONS = {
  a: [{ name: 'mode' }, { name: 'model' }],
  b: [{ name: 'context' }, { name: 'contextBar' }],
  c: [{ name: 'cwd' }],
  x: [{ name: 'cost' }],
  y: [{ name: 'rate5h' }, { name: 'rateWeek' }],
  z: [{ name: 'effort' }],
}

const SECTION_NAMES = ['a', 'b', 'c', 'x', 'y', 'z']
const DROP_ORDER = ['c', 'b', 'x', 'y']

// $.state.get takes plugin and key as string literals so the engine can list what
// this module reads. That means one const and one call per publisher. A new
// publisher is a new const, a new call, and a `source` entry in the config.
const LOCAL_PROXY_STATUSLINE = { plugin: 'local-proxy', key: 'statusline' }

let working = false
let effort = ''
let cache = { at: 0, data: null }
let config = null

function readConfig(options) {
  const o = options || {}
  const sections = parseJson(o.sections, DEFAULT_SECTIONS)
  return {
    theme: typeof o.theme === 'string' ? o.theme : DEFAULT_THEME,
    position: o.position === 'below' ? 'below' : 'above',
    componentSeparators: separators(o.componentSeparators),
    sectionSeparators: separators(o.sectionSeparators),
    sections: sections,
  }
}

function separators(v) {
  const s = parseJson(v, {})
  return {
    left: typeof s.left === 'string' ? s.left : '',
    right: typeof s.right === 'string' ? s.right : '',
  }
}

function parseJson(value, fallback) {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function collect($) {
  const now = Date.now()
  if (cache.data && now - cache.at < 1000) return cache.data

  const data = {
    model: null,
    effort: effort || null,
    working,
    cwd: null,
    context: { tokens: null, window: null, percent: null },
    rateLimits: [],
    cost: null,
    startedAt: null,
  }

  try {
    const u = await $.session.usage()
    if (u && typeof u === 'object') {
      data.context = u.context || data.context
      data.rateLimits = Array.isArray(u.rateLimits) ? u.rateLimits : []
      data.cost = u.cost ?? null
      data.startedAt = u.startedAt ?? null
    }
  } catch {}
  try {
    const m = await $.session.model()
    data.model = typeof m === 'string' ? m : ((m && (m.name || m.id)) ?? null)
  } catch {}
  try {
    data.cwd = (await $.session.cwd()) ?? null
  } catch {}

  cache = { at: now, data }
  return data
}

function formatSource(raw, fmt) {
  if (raw === null || raw === undefined) return ''
  if (fmt === 'percent') {
    return typeof raw === 'number' ? Math.round(raw) + '%' : ''
  }
  if (fmt === 'account') {
    if (typeof raw === 'object' && raw.provider) {
      return raw.alias ? raw.provider + '/' + raw.alias : String(raw.provider)
    }
    return ''
  }
  return typeof raw === 'string' ? raw : String(raw)
}

async function readPublished($) {
  const out = {}
  try {
    out['local-proxy.statusline'] = await $.state.get(LOCAL_PROXY_STATUSLINE)
  } catch {}
  return out
}

function resolveOverrides(published, entries) {
  const out = {}
  for (const entry of entries) {
    const src = entry && entry.source
    if (!src || !src.plugin || !src.key || !src.field) continue
    const value = published[src.plugin + '.' + src.key]
    const text = formatSource(value ? value[src.field] : null, src.fmt)
    if (text) out[entry.name] = text
  }
  return out
}

function fitSections(columns, sections) {
  let width = estimateWidth(sections)
  for (const key of DROP_ORDER) {
    if (width <= columns || !sections[key] || sections[key].length === 0) continue
    width -= estimateWidth({ [key]: sections[key] })
    sections = { ...sections, [key]: [] }
  }
  return sections
}

function estimateWidth(sections) {
  let n = 0
  for (const key of SECTION_NAMES) {
    const list = sections[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (!entry || typeof entry.name !== 'string') continue
      n += (entry.icon ? entry.icon.length + 1 : 0) + entry.name.length + 4
    }
  }
  return n + 8
}

export function register(on, options) {
  config = readConfig(options)

  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    working = true
    cache.at = 0
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    working = false
    cache.at = 0
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e && e.effort) {
      effort = String(e.effort)
      cache.at = 0
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (config.position !== 'above') return next(e)
    return draw($, e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (config.position !== 'below') return next(e)
    return draw($, e)
  })
}

async function draw($, e) {
  const { Box, Text } = $.ui.resolve(e)
  const data = await collect($)

  const columns = typeof e.props?.bodyColumns === 'number' ? e.props.bodyColumns : 80
  const sections = fitSections(columns, config.sections)
  const colours = themeFor(config.theme, working ? 'working' : 'idle')

  const all = SECTION_NAMES.flatMap((k) => (Array.isArray(sections[k]) ? sections[k] : []))
  const overrides = resolveOverrides(await readPublished($), all)

  const renderSection = (key) => {
    const list = Array.isArray(sections[key]) ? sections[key] : []
    const parts = []
    for (const entry of list) {
      if (!entry || typeof entry.name !== 'string') continue
      const fn = components[entry.name]
      let text = overrides[entry.name]
      if (text === undefined) {
        try {
          // ponytail: components get no $ . The validator only allows passing $ to
          // a function declared at the top of this file, and these are looked up by
          // name. If one ever needs $.process.run or $.fs.read, do that work here
          // and hand the component a plain value instead.
          text = typeof fn === 'function' ? fn(null, data) : ''
        } catch {
          text = ''
        }
      }
      if (typeof text !== 'string' || text === '') continue
      const pad = Number.isFinite(entry.padding) ? entry.padding : 0
      const body = (entry.icon ? entry.icon + ' ' : '') + text
      const padded = pad > 0 ? ' '.repeat(pad) + body + ' '.repeat(pad) : body
      parts.push(
        Text({
          children: [padded],
          color: typeof entry.color === 'string' ? entry.color : colours[key],
        })
      )
    }
    return parts
  }

  const join = (parts, sep) => {
    const out = []
    parts.forEach((p, i) => {
      if (i > 0 && sep) out.push(Text({ children: [sep], dimColor: true }))
      out.push(p)
    })
    return out
  }

  const left = join(
    SECTION_NAMES.slice(0, 3).flatMap((k) => renderSection(k)),
    config.componentSeparators.left
  )
  const right = join(
    SECTION_NAMES.slice(3).flatMap((k) => renderSection(k)),
    config.componentSeparators.right
  )

  return Box({
    flexDirection: 'row',
    columnGap: 0,
    children: [...left, Box({ flexGrow: 1 }), ...right],
  })
}

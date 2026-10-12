import { components } from '../components.js'
import { DEFAULT_THEME, THEME_NAMES, themeFor, mergeTheme } from '../theme.js'

const DEFAULT_SECTIONS = {
  a: [{ name: 'mode' }, { name: 'model' }],
  b: [{ name: 'context' }, { name: 'contextBar' }],
  c: [{ name: 'cwd' }],
  x: [{ name: 'cost' }],
  y: [{ name: 'rate5h' }, { name: 'rateWeek' }],
  z: [{ name: 'effort' }],
}

const DEFAULT_SEPARATORS = { left: ' ', right: ' ' }
const DROP_ORDER = ['c', 'b', 'x', 'y']
const LEFT_KEYS = ['a', 'b', 'c']
const RIGHT_KEYS = ['x', 'y', 'z']

let working = false
let effort = ''
let dirty = true
const published = new Map()
const execCache = new Map()
let cfg = null
let dataCache = { at: 0, data: null }

function publish({ id, values }) {
  published.set(id, values)
  dirty = true
}

function unwrap(result) {
  return result && typeof result === 'object' && 'value' in result ? result.value : result
}

function parseJson(value, fallback) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value == null ? fallback : value
}

function separators(value) {
  const s = parseJson(value, DEFAULT_SEPARATORS) || {}
  return {
    left: typeof s.left === 'string' ? s.left : DEFAULT_SEPARATORS.left,
    right: typeof s.right === 'string' ? s.right : DEFAULT_SEPARATORS.right,
  }
}

async function readConfig($, options) {
  const o = options || {}
  let src = {}
  try {
    const s = unwrap(await $.settings.read())
    const pc = s?.pluginConfigs ?? {}
    const key = pc['statusline@claude-mods']
      ? 'statusline@claude-mods'
      : pc['statusline']
        ? 'statusline'
        : Object.keys(pc).find((k) => k.includes('statusline'))
    const holder = key ? pc[key] : null
    src = holder && typeof holder === 'object' ? (holder.options ?? holder) : {}
  } catch {
    src = {}
  }
  return {
    theme: typeof o.theme === 'string' ? o.theme : DEFAULT_THEME,
    position: o.position === 'below' ? 'below' : 'above',
    componentSeparators: separators(src.componentSeparators),
    sectionSeparators: separators(src.sectionSeparators),
    sections: parseJson(src.sections, DEFAULT_SECTIONS),
    themes: parseJson(src.themes, undefined),
  }
}

async function collect($) {
  const now = Date.now()
  if (dataCache.data && now - dataCache.at < 1000) return dataCache.data
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
    const u = unwrap(await $.session.usage())
    if (u && typeof u === 'object') {
      data.context = u.context ?? data.context
      data.rateLimits = Array.isArray(u.rateLimits) ? u.rateLimits : []
      data.cost = u.cost ?? null
      data.startedAt = u.startedAt ?? null
    }
  } catch {}
  try {
    const m = unwrap(await $.session.model())
    data.model = typeof m === 'string' ? m : (m?.name ?? m?.id ?? null)
  } catch {}
  try {
    data.cwd = unwrap(await $.session.cwd()) ?? null
  } catch {}
  dataCache = { at: now, data }
  return data
}

function renderNamed(name, data) {
  const fn = components[name]
  if (typeof fn !== 'function') return ''
  try {
    // validator constraint: $ is never forwarded into a name lookup; components take data only
    const r = fn(data)
    return typeof r === 'string' ? r : r == null ? '' : String(r)
  } catch {
    return ''
  }
}

function formatValue(raw, fmt) {
  if (fmt === 'percent') return Number.isFinite(raw) ? Math.round(raw) + '%' : ''
  if (fmt === 'number') return Number.isFinite(raw) ? String(raw) : ''
  if (fmt === 'account') {
    return raw && raw.provider ? (raw.alias ? raw.provider + '/' + raw.alias : raw.provider) : ''
  }
  return typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
}

function entryText(entry, data) {
  let text = ''
  if (entry.from) {
    const v = published.get(entry.from.id)
    if (v === undefined) {
      if (entry.name) text = renderNamed(entry.name, data)
    } else if (typeof entry.from.fmt === 'string' && entry.from.fmt.includes('${')) {
      text = entry.from.fmt.replace(/\$\{([^}]*)\}/g, (_, k) => String(v?.[k] ?? ''))
    } else {
      text = formatValue(v?.[entry.from.field], entry.from.fmt)
    }
  } else if (entry.name) {
    text = renderNamed(entry.name, data)
  } else if (entry.exec) {
    text = execCache.get(entry.exec.command)?.text ?? ''
  }
  if (text === '' || text == null) return ''
  text = String(text)
  if (entry.icon) text = entry.icon + ' ' + text
  if (Number.isFinite(entry.padding)) {
    const p = ' '.repeat(Math.max(0, entry.padding))
    text = p + text + p
  }
  return text
}

function roughWidth(sections) {
  let n = 8
  for (const key of Object.keys(sections)) {
    const list = sections[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      if (!entry) continue
      n +=
        (entry.icon ? entry.icon.length + 1 : 0) +
        (entry.name?.length ?? entry.from?.field?.length ?? entry.exec?.command?.length ?? 4) +
        4
    }
  }
  return n
}

function fit(columns, sections) {
  const out = {}
  for (const k of Object.keys(sections)) out[k] = sections[k]
  for (const k of DROP_ORDER) {
    if (roughWidth(out) <= columns) break
    out[k] = []
  }
  return out
}

async function refreshExec($) {
  if (!cfg) return
  const now = Date.now()
  for (const key of Object.keys(cfg.sections)) {
    const list = Array.isArray(cfg.sections[key]) ? cfg.sections[key] : []
    for (const entry of list) {
      const ex = entry && entry.exec
      if (!ex || typeof ex.command !== 'string') continue
      const intervalMs = Number.isFinite(ex.intervalMs) ? ex.intervalMs : 5000
      const cur = execCache.get(ex.command)
      if (cur && now - cur.at < intervalMs) continue
      let text = ''
      try {
        const r = unwrap(await $.process.run(['sh', '-c', ex.command]))
        text = String(r?.stdout ?? '').trim().split(/\r?\n/)[0]?.trim() ?? ''
      } catch {
        text = ''
      }
      execCache.set(ex.command, { text, at: Date.now(), intervalMs })
    }
  }
}

async function draw($, e) {
  const { Box, Text } = $.ui.resolve(e)
  const data = await collect($)
  const columns = typeof e.props?.bodyColumns === 'number' ? e.props.bodyColumns : 80
  const sections = fit(columns, cfg.sections)
  const palette = mergeTheme(
    themeFor(cfg.theme, working ? 'working' : 'idle'),
    cfg.themes?.[cfg.theme]
  )

  const render = (keys, sep) => {
    const out = []
    for (const key of keys) {
      const list = Array.isArray(sections[key]) ? sections[key] : []
      for (const entry of list) {
        const text = entryText(entry, data)
        if (text === '') continue
        if (out.length > 0 && sep) out.push(Text({ children: [sep], dimColor: true }))
        const raw = entry.color ?? palette[key]
        out.push(Text({ children: [text], color: typeof raw === 'string' && raw !== '' ? raw : undefined }))
      }
    }
    return out
  }

  return Box({
    flexDirection: 'row',
    children: [
      ...render(LEFT_KEYS, cfg.componentSeparators.left),
      Box({ flexGrow: 1 }),
      ...render(RIGHT_KEYS, cfg.componentSeparators.right),
    ],
  })
}

export function register(on, options) {
  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    return { ...built, statusline: { publish } }
  })

  on('session.start', async ($, e, next) => {
    cfg = await readConfig($, options)
    $.clock.every(1000, () => {
      refreshExec($)
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    working = true
    dataCache.at = 0
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    working = false
    dataCache.at = 0
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e?.effort) {
      effort = String(e.effort)
      dataCache.at = 0
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    cfg?.position === 'below' ? next(e) : draw($, e)
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) =>
    cfg?.position === 'below' ? draw($, e) : next(e)
  )
}

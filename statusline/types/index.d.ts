/** Session snapshot a component renders. */
export type StatuslineData = {
  model: string | null
  effort: string | null
  working: boolean
  cwd: string | null
  context: { tokens: number | null; window: number | null; percent: number | null }
  rateLimits: Array<{ kind: string; percentUsed: number | null; resetsAt: string | null }>
  cost: unknown
  startedAt: string | number | null
}

/** Values a publisher drops under its id. */
export type StatuslineValues = Record<string, unknown>

/** How a sourced value becomes display text, or a `${field}` template over the values. */
export type StatuslineFormat = 'string' | 'percent' | 'number' | 'account' | string

/** Points an entry at data a publisher published under `id`. */
export type StatuslineSource = {
  id: string
  field?: string
  fmt?: StatuslineFormat
}

/** A component whose text comes from a shell command. */
export type StatuslineExec = {
  command: string
  intervalMs?: number
}

/** One component in a section. Exactly one of `name`, `from` alone, or `exec` supplies it. */
export type StatuslineEntry = {
  name?: string
  from?: StatuslineSource
  exec?: StatuslineExec
  icon?: string
  color?: string
  padding?: number
}

export type StatuslineSectionName = 'a' | 'b' | 'c' | 'x' | 'y' | 'z'

export type StatuslineSections = Record<StatuslineSectionName, StatuslineEntry[]>

export type StatuslineSeparators = { left?: string; right?: string }

export type StatuslineState = 'working' | 'idle' | 'alert'

/** Colours for the six sections in one state. */
export type StatuslineThemeState = Record<StatuslineSectionName, string>

export type StatuslineTheme = Record<StatuslineState, StatuslineThemeState>

/** Layout and appearance. Nested parts live in pluginConfigs, not userConfig. */
export type StatuslineConfig = {
  theme?: string
  position?: 'above' | 'below'
  componentSeparators?: StatuslineSeparators
  sectionSeparators?: StatuslineSeparators
  sections?: Partial<StatuslineSections>
  themes?: Record<string, Partial<StatuslineTheme>>
}

/** The noun this plugin adds to `$` in engine.create. */
export type Statusline = {
  /** Any mod becomes a publisher. `values` are plain data the config maps to entries. */
  publish: (args: { id: string; values: StatuslineValues }) => void
}

declare module 'claude-code' {
  interface EngineInterface {
    statusline: Statusline
  }
}

export const DEFAULT_THEME = 'auto'

export const themes = {
  auto: {
    working: { a: '#7d93c4', b: '#5f6b7d', c: '#8a8f98', x: '#8a8f98', y: '#5f6b7d', z: '#7d93c4' },
    idle: { a: '#6b778c', b: '#565e6b', c: '#757a83', x: '#757a83', y: '#565e6b', z: '#6b778c' },
    alert: { a: '#c46b6b', b: '#6e5656', c: '#8a7f7f', x: '#8a7f7f', y: '#6e5656', z: '#c46b6b' },
  },
  gruvbox: {
    working: { a: '#fe8019', b: '#b8bb26', c: '#ebdbb2', x: '#fabd2f', y: '#fb4934', z: '#d65d0e' },
    idle: { a: '#d65d0e', b: '#98971a', c: '#a89984', x: '#d79921', y: '#cc241d', z: '#af3a03' },
    alert: { a: '#fb4934', b: '#cc241d', c: '#fe8019', x: '#d79921', y: '#9d0006', z: '#cc241d' },
  },
  nord: {
    working: { a: '#88c0d0', b: '#81a1c1', c: '#8fbcbb', x: '#8fbcbb', y: '#81a1c1', z: '#5e81ac' },
    idle: { a: '#5e81ac', b: '#4c566a', c: '#81a1c1', x: '#81a1c1', y: '#4c566a', z: '#5e81ac' },
    alert: { a: '#bf616a', b: '#d08770', c: '#ebcb8b', x: '#d08770', y: '#bf616a', z: '#bf616a' },
  },
  'tokyo-night': {
    working: { a: '#bb9af7', b: '#7aa2f7', c: '#73daca', x: '#7dcfff', y: '#f7768e', z: '#7aa2f7' },
    idle: { a: '#565f89', b: '#787c99', c: '#a9b1d6', x: '#787c99', y: '#565f89', z: '#565f89' },
    alert: { a: '#f7768e', b: '#ff9e64', c: '#e0af68', x: '#f7768e', y: '#ff9e64', z: '#f7768e' },
  },
  mono: {
    working: { a: '#d0d0d0', b: '#a8a8a8', c: '#e4e4e4', x: '#bcbcbc', y: '#8a8a8a', z: '#d0d0d0' },
    idle: { a: '#8a8a8a', b: '#707070', c: '#9e9e9e', x: '#707070', y: '#626262', z: '#8a8a8a' },
    alert: { a: '#ffffff', b: '#e0e0e0', c: '#bdbdbd', x: '#e0e0e0', y: '#9e9e9e', z: '#ffffff' },
  },
}

export const THEME_NAMES = ['auto', 'gruvbox', 'nord', 'tokyo-night', 'mono']

const KEYS = ['a', 'b', 'c', 'x', 'y', 'z']

const str = (v) => (typeof v === 'string' && v !== '' ? v : undefined)

export function themeFor(name, state) {
  const theme = Object.hasOwn(themes, name) ? themes[name] : themes[DEFAULT_THEME]
  const src = Object.hasOwn(theme, state) ? theme[state] : theme.idle
  const out = {}
  for (const k of KEYS) out[k] = str(src?.[k])
  return out
}

export function mergeTheme(base, override) {
  const out = {}
  for (const k of KEYS) out[k] = str(override?.[k]) ?? str(base?.[k])
  return out
}

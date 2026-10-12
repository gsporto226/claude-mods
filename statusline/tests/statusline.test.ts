import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'statusline',
  component: 'AbovePrompt',
  requestId: 'statusline',
  viewport: { columns: 120, rows: 30 },
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 2,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 2 },
    view: {},
  },
} as const

const USAGE = {
  startedAt: 0,
  context: { tokens: 222400, window: 1000000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: null },
    { kind: 'seven_day', percentUsed: 12, resetsAt: null },
  ],
  cost: 1.234,
}

function stubs(on, sections) {
  const clock = mock.clock(on)
  on('settings.read', () => ({ value: { pluginConfigs: { 'statusline@claude-mods': { options: { sections } } } } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'opus' }))
  on('session.cwd', () => ({ value: '/work' }))
  return clock
}

test('draws model, context and limits from the session', async ($, on) => {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work/claude-mods' }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'opus' }))
  on('session.cwd', () => ({ value: '/work/claude-mods' }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/claude-mods' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /IDLE/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /opus/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /222\.4k \(42%\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /31%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /12%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /claude-mods/ })).toBeDefined()

  await ui.unmount()
})

test('a turn marks the line as working and drops empty components', async ($, on) => {
  mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: null, window: null, percent: null }, rateLimits: [], cost: null },
  }))
  on('session.model', () => ({ value: 'opus' }))
  on('session.cwd', () => ({ value: null }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /WORK/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /context/ })).toBeUndefined()

  await ui.unmount()
})

test('a published value renders through a from entry', {
  plugins: [
    {
      name: 'pub',
      register(on) {
        on('session.start', ($, e, next) => {
          $.statusline.publish({ id: 'local-proxy', values: { rate5h: 31 } })
          return next(e)
        })
      },
    },
  ],
}, async ($, on) => {
  stubs(on, { y: [{ from: { id: 'local-proxy', field: 'rate5h', fmt: 'percent' } }] })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /31%/ })).toBeDefined()

  await ui.unmount()
})

test('a from template substitutes multiple fields', {
  plugins: [
    {
      name: 'pub',
      register(on) {
        on('session.start', ($, e, next) => {
          $.statusline.publish({ id: 'local-proxy', values: { provider: 'anthropic', alias: 'work' } })
          return next(e)
        })
      },
    },
  ],
}, async ($, on) => {
  stubs(on, { y: [{ from: { id: 'local-proxy', fmt: '${provider}/${alias}' } }] })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /anthropic\/work/ })).toBeDefined()

  await ui.unmount()
})

test('an exec entry renders command output', async ($, on) => {
  const clock = stubs(on, { c: [{ exec: { command: 'git rev-parse --abbrev-ref HEAD', intervalMs: 0 } }] })
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /main/ })).toBeDefined()

  await ui.unmount()
})

test('a missing publisher renders nothing and does not throw', async ($, on) => {
  stubs(on, { y: [{ from: { id: 'never', field: 'x' } }] })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(ui).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /undefined/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /null/ })).toBeUndefined()

  await ui.unmount()
})

test('a number fmt renders the published value', {
  plugins: [
    {
      name: 'pub',
      register(on) {
        on('session.start', ($, e, next) => {
          $.statusline.publish({ id: 'local-proxy', values: { rate5h: 31 } })
          return next(e)
        })
      },
    },
  ],
}, async ($, on) => {
  stubs(on, { y: [{ from: { id: 'local-proxy', field: 'rate5h', fmt: 'number' } }] })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /31/ })).toBeDefined()

  await ui.unmount()
})

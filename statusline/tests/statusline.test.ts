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

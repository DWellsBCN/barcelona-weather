import { expect, test } from 'claude-code/testing'

import { buildScene, colorProblems } from '../hooks/register'

const BACKDROP = {
  plugin: 'barcelona-weather',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'barcelona', plugin: 'barcelona-weather', glass: false },
} as const

const reading = (code: number, isDay: number) =>
  JSON.stringify({ current: { temperature_2m: 22.6, weather_code: code, is_day: isDay, wind_speed_10m: 18 } })

test('the colours paint on Desktop', () => {
  expect(colorProblems.some(line => line.startsWith("Desktop won't paint"))).toBe(false)
})

test('every sky fits the Svg limit', () => {
  for (const code of [0, 2, 3, 45, 53, 63, 73, 95]) {
    for (const isDay of [true, false]) {
      const svg = buildScene({ code, isDay, tempC: 20, windKmh: 15, isLive: true })
      expect(svg.length < 131072).toBe(true)
      expect(svg.includes('href')).toBe(false)
    }
  }
})

for (const [label, code, isDay] of [['sun by day', 0, 1], ['rain by day', 63, 1], ['clear night', 0, 0], ['storm at night', 95, 0]] as const) {
  test(`the backdrop draws ${label} from the live reading`, async ($, on) => {
    let status = ''
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: reading(code, isDay) } }))
    on('theme.set', () => ({ value: { isDrawn: true, requestId: 'test' } }))
    on('command.register', () => ({ value: { command: 'bcn-weather' } }))
    on('ui.status', (_, e) => {
      status = String(e.text ?? '')
      return { value: undefined }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ran = await $.command.run({ command: 'bcn-weather', args: '' } as Parameters<typeof $.command.run>[0])
    expect(JSON.stringify(ran)).toContain('Barcelona 23°')
    expect(JSON.stringify(ran)).toContain(isDay ? 'Bon dia' : 'Bona nit')
    expect(status).toContain('km/h')

    for (const surface of ['desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...BACKDROP, surface })
      const svg = await ui.find({ type: 'Svg' })
      expect(svg).toBeDefined()
      await ui.unmount()
    }
  })
}

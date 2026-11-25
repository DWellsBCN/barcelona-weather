import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Weather } from '../types'
import { makeColors } from './make-colors.js'

const PLUGIN = 'barcelona-weather'
const SCENE = 'barcelona'
const REFRESH_MS = 15 * 60 * 1000
const LAT = 41.3874
const LON = 2.1686

const FALLBACK: Weather = { code: 1, isDay: true, tempC: 21, windKmh: 12, isLive: false }

// Change the tag when Weather's fields change: it declines an older stored value.
const weather = atom({ plugin: 'barcelona-weather', key: 'weather' } as const, FALLBACK, { shape: 'weather-1' })

// ---------------------------------------------------------------- colours

// Mediterranean blue, senyera red, palm green, saffron gold, bougainvillea magenta.
const { theme, problems } = makeColors({
  label: 'Barcelona',
  roles: { accent: '#1d6fb8', danger: '#d42f2f', success: '#4f8a2b', warning: '#e9a10a', pro: '#b8378f' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f1e8da',
        'surface-1': '#f6efe3',
        'surface-2': '#fbf7f0',
        'text-primary': '#2a1f17',
        'text-secondary': '#54443a',
        'text-muted': '#6b5a4e',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#13161f',
        'surface-1': '#1a1e29',
        'surface-2': '#212532',
        'surface-3': '#262a38',
        'text-primary': '#f2ebe0',
        'text-secondary': '#d0c6b8',
        'text-muted': '#aa9f92',
      },
    },
  },
})

export const colorProblems = problems

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE },
}

// ---------------------------------------------------------------- weather

type Sky = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

const skyOf = (code: number): Sky => {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'partly'
}

const WORDS: Record<Sky, string> = {
  clear: 'Sunny',
  partly: 'Partly cloudy',
  overcast: 'Overcast',
  fog: 'Foggy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Thunderstorms',
}

const describe = (w: Weather) =>
  `Barcelona ${Math.round(w.tempC)}° · ${WORDS[skyOf(w.code)]} · ${Math.round(w.windKmh)} km/h` +
  (w.isLive ? '' : ' (no live reading yet)')

const fetchWeather = async ($: EngineInterface): Promise<Weather | undefined> => {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=Europe%2FMadrid'
  try {
    const res = await $.http.fetch(url)
    if (!res.ok) return undefined
    const cur = JSON.parse(res.text)?.current
    if (cur === undefined || typeof cur.weather_code !== 'number') return undefined

    return {
      code: cur.weather_code,
      isDay: cur.is_day === 1,
      tempC: Number(cur.temperature_2m ?? 0),
      windKmh: Number(cur.wind_speed_10m ?? 0),
      isLive: true,
    }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- scene

// A steady pseudo-random series, so the scene draws the same way each time.
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const SKIES: Record<Sky, [string, string, string, string]> = {
  // day top, day bottom, night top, night bottom
  clear: ['#1f86e0', '#ffe2b8', '#070d26', '#3a2f5c'],
  partly: ['#3c93dc', '#f6e0c4', '#0a1129', '#352f55'],
  overcast: ['#8c9fb2', '#dcdcd8', '#151a26', '#3a3a48'],
  fog: ['#b8c2ca', '#ebe8e2', '#1d222c', '#4a4a55'],
  drizzle: ['#7f93a6', '#cfd2d2', '#131924', '#353846'],
  rain: ['#60788d', '#b0bbc3', '#0f141e', '#2d3240'],
  snow: ['#a7b8c8', '#f0f2f4', '#1a2132', '#4b5265'],
  storm: ['#3c4858', '#83909a', '#0a0e16', '#262b38'],
}

const cloudShape = (x: number, y: number, s: number, fill: string, opacity: number) =>
  `<g opacity="${opacity}" fill="${fill}">` +
  `<ellipse cx="${x}" cy="${y}" rx="${170 * s}" ry="${34 * s}"/>` +
  `<ellipse cx="${x - 70 * s}" cy="${y - 18 * s}" rx="${70 * s}" ry="${36 * s}"/>` +
  `<ellipse cx="${x + 10 * s}" cy="${y - 34 * s}" rx="${80 * s}" ry="${48 * s}"/>` +
  `<ellipse cx="${x + 90 * s}" cy="${y - 16 * s}" rx="${66 * s}" ry="${32 * s}"/>` +
  `</g>`

// A tapering spire with a rounded tip and a coloured finial, as the basilica's towers have.
const spire = (x: number, top: number, base: number, w: number, body: string, finial: string) =>
  `<path d="M${x - w} ${base} L${x - w * 0.45} ${top + w * 2.2} Q${x} ${top - w * 0.6} ${x + w * 0.45} ${top + w * 2.2} L${x + w} ${base}Z" fill="${body}"/>` +
  `<circle cx="${x}" cy="${top + w * 0.4}" r="${(w * 0.42).toFixed(1)}" fill="${finial}"/>`

const palm = (x: number, y: number, lean: number, crownX: number, crownY: number, trunk: string, frond: string, cls: string) => {
  const fronds = [-170, -140, -110, -70, -40, -10, 20]
    .map(a => {
      const r = (a * Math.PI) / 180
      const ex = crownX + Math.cos(r) * 130
      const ey = crownY + Math.sin(r) * 60 + 70
      const mx = crownX + Math.cos(r) * 70
      const my = crownY + Math.sin(r) * 70 - 10
      return `<path d="M${crownX} ${crownY} Q${mx.toFixed(0)} ${my.toFixed(0)} ${ex.toFixed(0)} ${ey.toFixed(0)}" stroke="${frond}" stroke-width="13" stroke-linecap="round" fill="none"/>`
    })
    .join('')
  return (
    `<path d="M${x} ${y} Q${x + lean} ${(y + crownY) / 2} ${crownX} ${crownY}" stroke="${trunk}" stroke-width="16" fill="none" stroke-linecap="round" stroke-dasharray="10 3"/>` +
    `<g class="frond ${cls}" style="transform-origin:${crownX}px ${crownY}px">${fronds}</g>`
  )
}

export const buildScene = (w: Weather): string => {
  const sky = skyOf(w.code)
  const day = w.isDay
  const [dt, db, nt, nb] = SKIES[sky]
  const top = day ? dt : nt
  const bottom = day ? db : nb
  const rand = seeded(11)
  const gloomy = sky !== 'clear' && sky !== 'partly'
  // Stronger wind, faster clouds.
  const drift = Math.max(70, 260 - w.windKmh * 4)

  const cloudCount = { clear: 1, partly: 4, overcast: 8, fog: 5, drizzle: 7, rain: 8, snow: 7, storm: 9 }[sky]
  const cloudFill = sky === 'storm' ? '#5a6573' : sky === 'rain' ? '#9aa8b4' : day ? '#ffffff' : '#c9cbe0'
  const cloudOpacity = day ? 0.9 : 0.5

  const parts: string[] = []

  parts.push(
    `<defs>` +
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>` +
      `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#2a8fd0' : '#16264a'}"/><stop offset="1" stop-color="${day ? '#0e4f9a' : '#0a1430'}"/></linearGradient>` +
      `<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#f1d6a2' : '#4a4038'}"/><stop offset="1" stop-color="${day ? '#ddb77a' : '#2e2822'}"/></linearGradient>` +
      `<linearGradient id="glories" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${day ? '#c0392b' : '#e0405a'}"/><stop offset="0.45" stop-color="${day ? '#3a6fb0' : '#4060e8'}"/><stop offset="1" stop-color="${day ? '#9cc4e4' : '#40d0e0'}"/></linearGradient>` +
      `<radialGradient id="sun"><stop offset="0" stop-color="#fff6c2"/><stop offset="0.5" stop-color="#ffcf4a"/><stop offset="1" stop-color="#ffcf4a" stop-opacity="0"/></radialGradient>` +
      `<clipPath id="bench"><path d="M-20 880 C180 840 360 900 560 870 C760 840 960 900 1160 866 C1340 838 1480 880 1620 860 L1620 950 C1480 970 1340 930 1160 956 C960 990 760 930 560 960 C360 990 180 930 -20 970Z"/></clipPath>` +
      `</defs>`,
  )
  parts.push(`<rect width="1600" height="1000" fill="url(#sky)"/>`)

  // sun, or moon and stars
  if (day) {
    parts.push(
      `<g class="sun" opacity="${gloomy ? 0.35 : 1}"><circle cx="1290" cy="170" r="150" fill="url(#sun)"/><circle cx="1290" cy="170" r="60" fill="#ffd95a"/></g>`,
    )
  } else {
    if (!gloomy) {
      for (let i = 0; i < 60; i++) {
        const x = Math.round(rand() * 1600)
        const y = Math.round(rand() * 380)
        const r = (rand() * 1.5 + 0.6).toFixed(1)
        parts.push(`<circle class="star s${i % 3}" cx="${x}" cy="${y}" r="${r}" fill="#fdf6e0"/>`)
      }
    }
    parts.push(
      `<g opacity="${gloomy ? 0.35 : 1}"><circle cx="1290" cy="160" r="52" fill="#f6f0dc"/><circle cx="1312" cy="146" r="48" fill="${top}" opacity="0.9"/></g>`,
    )
  }

  // Collserola ridge, Tibidabo on top with its temple, and the needle of the TV tower
  const ridge = day ? (gloomy ? '#8a97a0' : '#7d9a8e') : '#1c2234'
  parts.push(
    `<path d="M0 560 C120 520 220 470 330 430 C380 412 420 412 460 432 C560 470 640 470 760 486 C900 504 1060 470 1200 490 C1340 510 1460 500 1600 520 L1600 640 L0 640Z" fill="${ridge}"/>`,
    `<g fill="${day ? '#6e7f7a' : '#151a28'}">` +
      `<rect x="372" y="388" width="44" height="30"/><rect x="386" y="358" width="16" height="32"/><path d="M394 334 L398 358 L390 358Z"/>` +
      `<rect x="557" y="300" width="4" height="170"/><ellipse cx="559" cy="372" rx="16" ry="5"/><ellipse cx="559" cy="382" rx="12" ry="4"/>` +
      `</g>`,
  )
  if (!day) parts.push(`<circle class="beacon" cx="559" cy="298" r="3" fill="#ff5a4a"/>`)

  // Montjuïc, low on the left
  parts.push(`<path d="M0 610 C80 570 180 560 280 590 C330 604 360 620 380 640 L0 640Z" fill="${day ? (gloomy ? '#7a8a7e' : '#6c8f5e') : '#161c2a'}"/>`)

  // the Eixample: blocks of warm stone, windows lit at night
  const stones = day
    ? gloomy
      ? ['#b6a690', '#a89a88', '#c2b49e', '#9e9284']
      : ['#e3b98a', '#d9a173', '#efd2a8', '#c98f62', '#f2e0c2']
    : ['#262434', '#2c2a3a', '#22202e', '#302c3c']
  let bx = 0
  while (bx < 1600) {
    const bw = 34 + Math.round(rand() * 46)
    const bh = 34 + Math.round(rand() * 46)
    const by = 660 - bh
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh + 4}" fill="${stones[Math.floor(rand() * stones.length)]}"/>`)
    for (let wy = by + 8; wy < 652; wy += 12) {
      for (let wx = bx + 6; wx < bx + bw - 6; wx += 10) {
        const lit = !day && rand() > 0.62
        if (day && rand() > 0.5) continue
        if (!day && !lit) continue
        parts.push(`<rect x="${wx}" y="${wy}" width="4" height="6" fill="${lit ? '#ffcf73' : '#7a5a44'}" opacity="${lit ? 0.85 : 0.45}"/>`)
      }
    }
    bx += bw + 2
  }

  // the basilica, with its many spires
  const stone = day ? (gloomy ? '#a8957a' : '#cfa877') : '#2c2838'
  const finials = ['#e8402c', '#f2c12e', '#ffffff', '#3a8fd8', '#7bbd4a']
  parts.push(`<path d="M960 660 L960 560 L990 540 L1150 540 L1180 560 L1180 660Z" fill="${stone}"/>`)
  const spires: [number, number, number][] = [
    [978, 470, 10], [998, 452, 11], [1018, 452, 11], [1038, 470, 10],
    [1104, 476, 10], [1122, 458, 11], [1140, 458, 11], [1160, 476, 10],
    [1070, 330, 18], [1040, 392, 14], [1100, 400, 14], [1070, 420, 12],
  ]
  spires.forEach(([x, t, sw], i) => parts.push(spire(x, t, 600, sw, stone, finials[i % finials.length]!)))
  parts.push(
    `<path d="M1066 300 h8 v10 h10 v8 h-10 v14 h-8 v-14 h-10 v-8 h10Z" fill="${day ? '#f4f0e6' : '#fff3c4'}" class="${day ? '' : 'glow'}"/>`,
    `<circle cx="1040" cy="386" r="6" fill="${day ? '#f4f0e6' : '#cfe6ff'}" class="${day ? '' : 'glow'}"/>`,
  )
  // a crane, for the building is never quite finished
  parts.push(
    `<g stroke="${day ? '#e0a020' : '#3a3648'}" stroke-width="3" fill="none"><path d="M940 660 V380 M990 384 H840 M940 380 L990 384 M940 380 L850 384 M870 384 V430"/></g>`,
  )

  // the bullet-shaped tower, lit in colour by night
  parts.push(
    `<path d="M1222 664 L1222 470 C1222 410 1296 410 1296 470 L1296 664Z" fill="url(#glories)" opacity="${day ? (gloomy ? 0.7 : 0.95) : 1}"/>`,
  )
  if (!day) {
    parts.push(
      `<path class="led" d="M1222 664 L1222 470 C1222 410 1296 410 1296 470 L1296 664Z" fill="#b040e0" opacity="0.4"/>`,
    )
  }
  for (let gy = 452; gy < 660; gy += 9) {
    parts.push(`<rect x="1224" y="${gy}" width="70" height="1" fill="#ffffff" opacity="${day ? 0.25 : 0.12}"/>`)
  }

  // the sea, with a slow shimmer and a sailing boat
  parts.push(`<rect y="660" width="1600" height="150" fill="url(#sea)"/>`)
  for (let i = 0; i < 18; i++) {
    const x = Math.round(rand() * 1500)
    const y = 672 + Math.round(rand() * 120)
    parts.push(
      `<rect class="glint g${i % 3}" x="${x}" y="${y}" width="${40 + Math.round(rand() * 90)}" height="2" rx="1" fill="${day ? '#ffffff' : '#ffd890'}" opacity="0.3"/>`,
    )
  }
  if (!gloomy || sky === 'overcast') {
    parts.push(
      `<g class="boat"><path d="M0 724 L44 724 L36 734 L8 734Z" fill="${day ? '#ffffff' : '#8a90a8'}"/><path d="M22 722 L22 670 L46 720Z" fill="${day ? '#fdfbf4' : '#9aa0b8'}"/><path d="M20 722 L20 684 L4 720Z" fill="${day ? '#e8402c' : '#6a6a88'}"/></g>`,
    )
  }

  // Barceloneta sand
  parts.push(`<path d="M0 806 C300 790 600 812 900 800 C1200 788 1420 806 1600 796 L1600 1000 L0 1000Z" fill="url(#sand)"/>`)

  // a serpentine bench in broken-tile mosaic along the front
  const tiles = day
    ? ['#2f7fd0', '#f2c12e', '#e8402c', '#ffffff', '#4caa5a', '#f08a2a', '#8fd0e8', '#b8378f']
    : ['#1f3a6a', '#7a6420', '#6a2a2a', '#7a7a86', '#2a5a34', '#6a4420', '#3a5a6a', '#5a2450']
  const tileParts: string[] = []
  for (let i = 0; i < 520; i++) {
    const x = Math.round(rand() * 1640) - 20
    const y = 830 + Math.round(rand() * 160)
    const s = 16 + Math.round(rand() * 14)
    const r = Math.round(rand() * 60) - 30
    tileParts.push(
      `<rect x="${x}" y="${y}" width="${s}" height="${Math.round(s * 0.8)}" rx="2" transform="rotate(${r} ${x} ${y})" fill="${tiles[i % tiles.length]}"/>`,
    )
  }
  parts.push(
    `<g clip-path="url(#bench)"><rect y="820" width="1600" height="180" fill="${day ? '#f4efe4' : '#3a3a44'}"/>${tileParts.join('')}</g>`,
    `<path d="M-20 880 C180 840 360 900 560 870 C760 840 960 900 1160 866 C1340 838 1480 880 1620 860" stroke="${day ? '#fffaf0' : '#5a5a66'}" stroke-width="6" fill="none"/>`,
  )

  // palms at each side, and bougainvillea in the right corner
  const trunk = day ? '#8a6a44' : '#2c241c'
  const frond = day ? '#3f8a2e' : '#14301a'
  parts.push(palm(250, 1000, 70, 340, 600, trunk, frond, 'f0'), palm(1460, 1000, -60, 1380, 630, trunk, frond, 'f1'))
  const bloom = day ? '#c8288a' : '#5a1a44'
  for (let i = 0; i < 40; i++) {
    const cx = 1380 + Math.round(rand() * 230)
    const cy = 860 + Math.round(rand() * 140)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(rand() * 10 + 8).toFixed(1)}" fill="${i % 4 === 0 ? (day ? '#2f6a2a' : '#12281a') : bloom}" opacity="0.95"/>`)
  }

  // grey days dull the sea, sand and tiles too
  if (day && gloomy) {
    const veil = sky === 'storm' ? 0.5 : sky === 'rain' ? 0.38 : 0.28
    parts.push(
      `<defs><linearGradient id="veil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f6d7a" stop-opacity="0"/><stop offset="0.4" stop-color="#5f6d7a"/></linearGradient></defs>` +
        `<rect y="420" width="1600" height="580" fill="url(#veil)" opacity="${veil}"/>`,
    )
  }

  // gulls by day
  if (day && !gloomy) {
    parts.push(
      `<g class="gull" fill="none" stroke="#3a3a3a" stroke-width="2.5" stroke-linecap="round"><path d="M520 250 q12 -10 24 0 q12 -10 24 0"/><path d="M600 290 q9 -8 18 0 q9 -8 18 0"/></g>`,
    )
  }

  // clouds
  for (let i = 0; i < cloudCount; i++) {
    const x = Math.round(rand() * 1600)
    const y = 80 + Math.round(rand() * 330)
    const s = 0.6 + rand() * 0.9
    const dur = Math.round(drift * (0.8 + rand() * 0.8))
    const delay = Math.round(rand() * dur)
    parts.push(
      `<g class="cloud" style="animation-duration:${dur}s;animation-delay:-${delay}s">${cloudShape(x, y, s, cloudFill, cloudOpacity)}</g>`,
    )
  }

  // fog over the sea
  if (sky === 'fog') {
    parts.push(
      `<g class="mist"><rect y="500" width="1600" height="340" fill="${day ? '#ffffff' : '#9aa0aa'}" opacity="0.45"/>` +
        `<ellipse cx="500" cy="700" rx="700" ry="60" fill="#ffffff" opacity="0.35"/><ellipse cx="1200" cy="600" rx="600" ry="50" fill="#ffffff" opacity="0.3"/></g>`,
    )
  }

  // rain or drizzle: thin faint streaks, two copies stacked so the loop is seamless
  if (sky === 'rain' || sky === 'drizzle' || sky === 'storm') {
    const count = sky === 'drizzle' ? 60 : 120
    const len = sky === 'drizzle' ? 14 : 26
    const streaks: string[] = []
    for (let i = 0; i < count; i++) {
      const x = Math.round(rand() * 1700) - 50
      const y = Math.round(rand() * 1000)
      streaks.push(`M${x} ${y} l-6 ${len}`)
      streaks.push(`M${x} ${y - 1000} l-6 ${len}`)
    }
    parts.push(
      `<g class="rain"><path d="${streaks.join(' ')}" stroke="${day ? '#e8f2fa' : '#9fb3c8'}" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/></g>`,
    )
  }

  // snow, rare here, soft flakes drifting
  if (sky === 'snow') {
    const flakes: string[] = []
    for (let i = 0; i < 110; i++) {
      const x = Math.round(rand() * 1600)
      const y = Math.round(rand() * 1000)
      const r = (rand() * 3 + 2).toFixed(1)
      flakes.push(`<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y - 1000}" r="${r}"/>`)
    }
    parts.push(`<g class="snow" fill="#ffffff" opacity="0.85">${flakes.join('')}</g>`)
  }

  const style =
    `<style>` +
    `.cloud{animation-name:drift;animation-timing-function:linear;animation-iteration-count:infinite}` +
    `@keyframes drift{from{transform:translateX(-1900px)}to{transform:translateX(1900px)}}` +
    `.rain{animation:fall 2.6s linear infinite}` +
    `@keyframes fall{from{transform:translate(0,0)}to{transform:translate(-60px,1000px)}}` +
    `.snow{animation:fall 30s linear infinite}` +
    `.star{animation:twinkle 7s ease-in-out infinite}` +
    `.s1{animation-delay:-2.3s}.s2{animation-delay:-4.6s}` +
    `@keyframes twinkle{0%,100%{opacity:0.9}50%{opacity:0.45}}` +
    `.glint{animation:shimmer 9s ease-in-out infinite}` +
    `.g1{animation-delay:-3s}.g2{animation-delay:-6s}` +
    `@keyframes shimmer{0%,100%{opacity:0.12}50%{opacity:0.42}}` +
    `.sun{transform-origin:1290px 170px;animation:glow 14s ease-in-out infinite}` +
    `@keyframes glow{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}` +
    `.frond{animation:sway 9s ease-in-out infinite}` +
    `.f1{animation-delay:-4.5s}` +
    `@keyframes sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}` +
    `.boat{transform:translateX(300px);animation:sail 240s linear infinite}` +
    `@keyframes sail{from{transform:translateX(-80px)}to{transform:translateX(1680px)}}` +
    `.gull{animation:glide 60s ease-in-out infinite}` +
    `@keyframes glide{0%,100%{transform:translate(0,0)}50%{transform:translate(260px,-30px)}}` +
    `.led{animation:hue 24s ease-in-out infinite}` +
    `@keyframes hue{0%,100%{opacity:0.15}50%{opacity:0.55}}` +
    `.glow{animation:breathe2 10s ease-in-out infinite}` +
    `@keyframes breathe2{0%,100%{opacity:1}50%{opacity:0.7}}` +
    `.mist{animation:breathe 20s ease-in-out infinite}` +
    `@keyframes breathe{0%,100%{transform:translateX(-40px)}50%{transform:translateX(40px)}}` +
    `</style>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">` +
    style +
    parts.join('') +
    `</svg>`
  )
}

// ---------------------------------------------------------------- hooks

async function refresh($: EngineInterface): Promise<Weather> {
  const live = await fetchWeather($)
  const now = live ?? (await read($, weather))
  await update($, weather, () => now)
  $.ui.status(describe(now))

  return now
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) $.ui.toast(unpainted)

    await $.command.register({
      name: 'bcn-weather',
      description: 'Refresh the Barcelona sky and show the weather there now',
    })

    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) $.ui.status(set.reason)

    void refresh($)
    $.clock.every(REFRESH_MS, () => refresh($))

    return next(e)
  })

  on('command.run', { command: 'bcn-weather' }, async $ => {
    const now = await refresh($)
    const hello = now.isDay ? 'Bon dia!' : 'Bona nit!'

    return {
      text: now.isLive
        ? `${hello} ${describe(now)}. The sky is updated.`
        : `Couldn't reach Open-Meteo just now, so the sky shows a sunny default for Barcelona.`,
    }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.scene !== SCENE || e.props.plugin !== PLUGIN) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)

    const { Shader, Svg } = $.ui.resolve(e)
    const w = await read($, weather)
    const still = (
      <Svg
        source={buildScene(w)}
        alt={`Barcelona skyline and sea under ${WORDS[skyOf(w.code)].toLowerCase()} skies`}
      />
    )
    // Desktop plays the fuller scene on the GPU; the Svg stands in where it can't.
    if (e.surface !== 'desktop') return still

    return (
      <Shader module="./sky.ts" values={shaderValues(w)}>
        {still}
      </Shader>
    )
  })
}

// The weather as the shader reads it, each 0 to 1.
const LOOKS: Record<Sky, { cover: number; dark: number; rain: number; snow: number; fog: number }> = {
  clear: { cover: 0.04, dark: 0, rain: 0, snow: 0, fog: 0 },
  partly: { cover: 0.38, dark: 0.1, rain: 0, snow: 0, fog: 0 },
  overcast: { cover: 0.85, dark: 0.45, rain: 0, snow: 0, fog: 0.1 },
  fog: { cover: 0.6, dark: 0.3, rain: 0, snow: 0, fog: 0.85 },
  drizzle: { cover: 0.8, dark: 0.45, rain: 0.35, snow: 0, fog: 0.2 },
  rain: { cover: 0.9, dark: 0.6, rain: 0.85, snow: 0, fog: 0.15 },
  snow: { cover: 0.85, dark: 0.35, rain: 0, snow: 0.9, fog: 0.2 },
  storm: { cover: 0.97, dark: 0.9, rain: 1, snow: 0, fog: 0.1 },
}

function shaderValues(w: Weather) {
  return {
    ...LOOKS[skyOf(w.code)],
    day: w.isDay ? 1 : 0,
    wind: Math.min(1, w.windKmh / 60),
  }
}

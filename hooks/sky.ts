import {
  abs,
  buffer,
  clamp,
  cos,
  dot,
  exp,
  floor,
  fract,
  length,
  max,
  mix,
  picture,
  pow,
  range,
  shader,
  sin,
  size,
  smoothstep,
  step,
  time,
  values,
  vec2,
  vec3,
  vec4,
} from 'claude-code/shader'
import type { Buffer } from 'claude-code/shader'

// The weather, sent by the mod: each 0 to 1.
const v = values({
  cover: [0, 1],
  dark: [0, 1],
  rain: [0, 1],
  snow: [0, 1],
  fog: [0, 1],
  day: [0, 1],
  wind: [0, 1],
})

// y runs from 0 at the foot to 1 at the top.
const WATER = 0.33
const SHORE = 0.19
const BENCH = 0.11

// What the still land holds, as its alpha says.
const K_HILL = 0.2
const K_CITY = 0.4
const K_WINDOW = 0.47
const K_TOWER = 0.53
const K_SEA = 0.65
const K_NEAR = 0.8

function hash(p: vec2): number {
  let q = vec3(fract(vec3(p.x, p.y, p.x) * 0.1031))
  q = vec3(q + dot(q, vec3(q.y, q.z, q.x) + 33.33))

  return fract((q.x + q.y) * q.z)
}

function noise(p: vec2): number {
  const i = vec2(floor(p))
  const f = vec2(fract(p))
  const u = vec2(f * f * (3 - f * 2))
  const a = hash(i)
  const b = hash(vec2(i + vec2(1, 0)))
  const c = hash(vec2(i + vec2(0, 1)))
  const d = hash(vec2(i + vec2(1, 1)))

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
}

function fbm(p0: vec2): number {
  let p = p0
  let s = 0
  let a = 0.5
  for (const k of range(5)) {
    s += a * noise(vec2(p + k * 0.37))
    p = vec2(p * 2.03 + vec2(1.7, 9.2))
    a *= 0.5
  }

  return s
}

function fbm3(p0: vec2): number {
  let p = p0
  let s = 0
  let a = 0.5
  for (const k of range(3)) {
    s += a * noise(vec2(p + k * 0.37))
    p = vec2(p * 2.03 + vec2(1.7, 9.2))
    a *= 0.5
  }

  return s * 1.14
}

// Collserola: a soft wooded ridge, Tibidabo its high point on the left.
function ridgeH(x: number, asp: number): number {
  const tibidabo = exp(-pow((x + 0.26 * asp) / 0.14, 2))

  return 0.43 + 0.05 * fbm3(vec2(x * 1.3, 2)) + 0.07 * tibidabo - 0.03 * smoothstep(0, 0.5 * asp, x)
}

// The skyline of the Eixample, block by block.
function blockH(x: number): number {
  const cell = floor(x / 0.026)

  return WATER + 0.018 + 0.05 * hash(vec2(cell, 1)) * (0.5 + 0.5 * noise(vec2(x * 3, 4)))
}

// A spire that tapers to a rounded tip.
function inSpire(x: number, y: number, cx: number, top: number, w: number): number {
  const up = clamp((y - WATER) / (top - WATER), 0, 1)
  const half = w * pow(1 - up, 0.55)

  return step(abs(x - cx), half) * step(y, top)
}

// The still land, worked out once: rgb lit by day, alpha says what it is.
const land: Buffer = buffer({ once: true, scale: 1 }, p => {
  const asp = size.x / size.y
  const x = (p.uv.x - 0.5) * asp
  const y = p.uv.y
  const right = asp * 0.5

  // palms leaning in from each side
  for (const k of range(2)) {
    const side = k * 2 - 1
    const baseX = side * (right - 0.07)
    const crown = vec2(side * (right - 0.16 - 0.02 * k), 0.47 - 0.05 * k)
    const ty = clamp(y / crown.y, 0, 1)
    const tx = mix(baseX, crown.x, ty * ty * 0.6 + ty * 0.4)
    if (y < crown.y && abs(x - tx) < 0.0075 * (1.2 - ty * 0.5)) {
      const ring = 0.75 + 0.25 * step(0.5, fract(y * 120))

      return vec4(vec3(0.42, 0.31, 0.2) * ring, K_NEAR)
    }
    for (const f of range(8)) {
      const a = 3.3 - f * 0.48 + 0.15 * k
      const d = vec2(cos(a), sin(a))
      const rel = vec2(vec2(x, y) - crown)
      const along0 = dot(rel, d)
      const q = vec2(rel + vec2(0, 0.9 * along0 * along0))
      const along = dot(q, d)
      const perp = abs(q.x * d.y - q.y * d.x)
      const len = 0.15 + 0.03 * hash(vec2(f, k))
      const wide = 0.016 * (1 - along / len) * (0.65 + 0.35 * abs(sin(along * 260)))
      if (along > 0 && along < len && perp < wide) {
        return vec4(vec3(0.16, 0.36, 0.13) * (0.7 + 0.5 * (1 - perp / max(wide, 0.0001))), K_NEAR)
      }
    }
  }

  // a serpentine bench of broken tiles along the front
  const benchTop = BENCH + 0.018 * sin(x * 5.5 + 0.6)
  if (y < benchTop) {
    if (y > benchTop - 0.007) return vec4(vec3(0.97, 0.95, 0.9), K_NEAR)
    const wp = vec2(vec2(x, y) * 70 + vec2(noise(vec2(x * 30, y * 30)), noise(vec2(y * 30, x * 30))) * 0.9)
    const cell = vec2(floor(wp))
    const f = vec2(fract(wp))
    const grout = step(0.1, f.x) * step(f.x, 0.9) * step(0.1, f.y) * step(f.y, 0.9)
    const pick = hash(cell)
    let tile = vec3(0.18, 0.5, 0.82)
    if (pick > 0.25) tile = vec3(0.95, 0.76, 0.18)
    if (pick > 0.42) tile = vec3(0.9, 0.26, 0.17)
    if (pick > 0.56) tile = vec3(0.96, 0.95, 0.92)
    if (pick > 0.7) tile = vec3(0.3, 0.67, 0.35)
    if (pick > 0.82) tile = vec3(0.94, 0.54, 0.16)
    if (pick > 0.92) tile = vec3(0.72, 0.22, 0.56)
    const glaze = 0.85 + 0.2 * hash(vec2(cell + 5))
    const col = vec3(mix(vec3(0.82, 0.8, 0.76), tile * glaze, grout))

    return vec4(col * (0.75 + 2.5 * y), K_NEAR)
  }

  // Barceloneta sand
  const shore = SHORE + 0.008 * noise(vec2(x * 4, 3))
  if (y < shore) {
    const grain = noise(vec2(x * 400, y * 400))
    const wet = smoothstep(shore - 0.015, shore, y)
    const sand = vec3(mix(vec3(0.93, 0.8, 0.58), vec3(0.72, 0.6, 0.45), wet) * (0.9 + 0.15 * grain))

    return vec4(sand, K_NEAR)
  }

  if (y < WATER) return vec4(vec3(0.05, 0.3, 0.58), K_SEA)

  // the basilica, right of centre, a crowd of spires
  const sx = 0.17 * asp
  let inBasilica = step(abs(x - sx), 0.06) * step(y, WATER + 0.075)
  for (const k of range(4)) {
    inBasilica = max(inBasilica, inSpire(x, y, sx - 0.05 + k * 0.012, WATER + 0.14 + 0.025 * abs(sin(k * 1.7 + 1)), 0.0055))
    inBasilica = max(inBasilica, inSpire(x, y, sx + 0.014 + k * 0.012, WATER + 0.135 + 0.025 * abs(sin(k * 2.3)), 0.0055))
  }
  inBasilica = max(inBasilica, inSpire(x, y, sx - 0.016, WATER + 0.2, 0.009))
  inBasilica = max(inBasilica, inSpire(x, y, sx + 0.02, WATER + 0.19, 0.009))
  inBasilica = max(inBasilica, inSpire(x, y, sx, WATER + 0.265, 0.012))
  // the cross on the tower of Jesus
  const ct = WATER + 0.268
  const cross = step(abs(x - sx), 0.0018) * step(ct, y) * step(y, ct + 0.022) + step(abs(x - sx), 0.007) * step(abs(y - ct - 0.014), 0.0016)
  if (cross > 0) return vec4(vec3(0.96, 0.94, 0.88), K_WINDOW)
  if (inBasilica > 0) {
    const groove = 0.8 + 0.2 * sin(x * 900) * noise(vec2(x * 80, y * 140))
    const carve = 0.85 + 0.25 * fbm3(vec2(x * 120, y * 90))
    const tint = vec3(mix(vec3(0.72, 0.58, 0.42), vec3(0.85, 0.72, 0.52), smoothstep(WATER, WATER + 0.2, y)))
    // coloured mosaic finials near each tip
    const finial = step(0.86, fract(y * 46 + hash(vec2(floor(x * 160), 2)))) * step(WATER + 0.12, y)
    const fc = vec3(mix(vec3(0.92, 0.3, 0.18), vec3(0.95, 0.78, 0.2), hash(vec2(floor(x * 160), 3))))

    return vec4(mix(tint * groove * carve, fc, finial * 0.6), K_CITY)
  }

  // the bullet-shaped tower, further right
  const gx = 0.3 * asp
  const gr = 0.022
  const gtop = WATER + 0.17
  const gdy = max(y - (gtop - gr * 1.6), 0) / 1.6
  if (y < gtop && length(vec2(x - gx, gdy)) < gr) {
    const band = smoothstep(WATER, gtop, y)
    const panel = 0.85 + 0.15 * step(0.5, fract(y * 300)) * step(0.5, fract(x * 260))
    const facade = vec3(mix(vec3(0.75, 0.22, 0.17), vec3(0.4, 0.62, 0.85), band) * panel)

    return vec4(facade, K_TOWER)
  }

  // the TV needle on the ridge
  const nx = -0.11 * asp
  const nh = ridgeH(nx, asp)
  if (abs(x - nx) < 0.0016 && y < nh + 0.15 && y > nh - 0.01) return vec4(vec3(0.62, 0.64, 0.66), K_CITY)
  if (abs(x - nx) < 0.013 && abs(y - nh - 0.1) < 0.004) return vec4(vec3(0.7, 0.72, 0.74), K_CITY)

  // the Eixample
  const bh = blockH(x)
  if (y < bh) {
    const cell = floor(x / 0.026)
    const pick = hash(vec2(cell, 7))
    let stone = vec3(0.9, 0.73, 0.54)
    if (pick > 0.3) stone = vec3(0.85, 0.62, 0.45)
    if (pick > 0.55) stone = vec3(0.94, 0.84, 0.68)
    if (pick > 0.8) stone = vec3(0.78, 0.55, 0.38)
    const wx = fract(x * 260)
    const wy = fract(y * 190)
    const isWin = step(0.3, wx) * step(wx, 0.7) * step(0.25, wy) * step(wy, 0.75) * step(y, bh - 0.006)
    if (isWin > 0) {
      const lit = step(0.6, hash(vec2(floor(x * 260), floor(y * 190))))
      if (lit > 0) return vec4(vec3(0.42, 0.3, 0.22), K_WINDOW)

      return vec4(vec3(0.38, 0.27, 0.2), K_CITY)
    }
    const shade = 0.82 + 0.18 * hash(vec2(cell, 9))

    return vec4(stone * shade, K_CITY)
  }

  // Montjuïc, low on the left
  const mj = WATER + 0.07 * exp(-pow((x + 0.4 * asp) / 0.18, 2))
  if (y < mj) return vec4(vec3(0.34, 0.48, 0.3) * (0.8 + 0.3 * fbm3(vec2(x * 40, y * 40))), K_HILL)

  // Collserola, with Tibidabo's temple on top
  const rh = ridgeH(x, asp)
  const tx = -0.26 * asp
  const th = ridgeH(tx, asp)
  if (abs(x - tx) < 0.016 && y < th + 0.02) return vec4(vec3(0.7, 0.66, 0.6), K_HILL)
  if (abs(x - tx) < 0.005 && y < th + 0.05) return vec4(vec3(0.72, 0.68, 0.62), K_HILL)
  if (y < rh) {
    const trees = fbm3(vec2(x * 60, y * 60))
    const green = vec3(mix(vec3(0.24, 0.36, 0.22), vec3(0.4, 0.5, 0.32), trees))
    const haze = 0.35 + 0.25 * smoothstep(WATER + 0.05, rh, y)

    return vec4(mix(green, vec3(0.62, 0.72, 0.82), haze), K_HILL)
  }

  return vec4(0, 0, 0, 0)
})

function skyGrad(y: number): vec3 {
  const gloom = v.cover * (0.4 + 0.6 * v.dark)
  const up = smoothstep(0.32, 1.0, y)
  // a warm Mediterranean haze at the horizon, deep blue overhead
  const blue = vec3(mix(vec3(0.98, 0.86, 0.7), vec3(0.1, 0.45, 0.86), pow(up, 0.7)))
  const grey = vec3(mix(vec3(0.8, 0.8, 0.78), vec3(0.52, 0.56, 0.6), up) * (1 - 0.35 * v.dark))
  const dayCol = vec3(mix(blue, grey, clamp(gloom * 1.2, 0, 1)))
  // the city glows on the night horizon
  const nightCol = vec3(mix(vec3(0.2, 0.14, 0.22), vec3(0.01, 0.015, 0.06), smoothstep(0.32, 0.7, y)))

  return vec3(mix(nightCol, dayCol, v.day))
}

export default shader({
  fps: 30,
  passes: [
    land,
    picture(p => {
      const asp = size.x / size.y
      const x = (p.uv.x - 0.5) * asp
      const y = p.uv.y
      const t = land.sample(p.uv)
      const kind = t.a
      const gloom = v.cover * (0.4 + 0.6 * v.dark)
      const lightC = vec3(mix(vec3(0.16, 0.17, 0.28), vec3(1 - 0.45 * gloom), v.day))
      const sun = vec2(0.36 * asp, 0.82)
      let col = vec3(0)

      if (kind < 0.1) {
        col = skyGrad(y)
        const ds = length(vec2(x, y) - sun)
        const clearness = 1 - v.cover * 0.9
        // sun by day
        const glow = exp(-ds * 5) * 0.3 + exp(-ds * 35) * 0.55 + smoothstep(0.032, 0.028, ds) * 0.8
        col = vec3(col + vec3(1.0, 0.9, 0.7) * glow * clearness * v.day)
        // moon and stars by night
        const night = (1 - v.day) * clearness
        const dm = length(vec2(x, y) - vec2(0.36 * asp, 0.82))
        const moon = smoothstep(0.03, 0.027, dm) * (0.8 + 0.2 * noise(vec2(x * 90, y * 90)))
        col = vec3(col + vec3(0.92, 0.9, 0.82) * (moon + exp(-dm * 14) * 0.12) * (1 - v.day) * (1 - v.cover * 0.6))
        const sc = vec2(floor(p.point / 2.5))
        const sh = hash(sc)
        const twinkle = 0.75 + 0.25 * sin(time * 0.9 + sh * 80)
        col = vec3(col + vec3(step(0.997, sh) * twinkle * night * smoothstep(0.5, 0.7, y)))

        // clouds on a plane overhead, nearer ones bigger, lit from the sun's side
        const hgt = max(y - 0.33, 0) + 0.12
        const drift = time * (0.006 + 0.03 * v.wind)
        const cp = vec2(x * 0.5 / hgt + drift, 0.9 / hgt)
        const warp = fbm3(vec2(cp * 0.6 + 4.1))
        const d = fbm(vec2(cp + warp * 0.6))
        const lo = 0.78 - v.cover * 0.5
        const cov = smoothstep(lo, lo + 0.1, d)
        const lit = fbm3(vec2(cp + warp * 0.6 + vec2(0.12, 0.09)))
        const belly = smoothstep(lo, lo + 0.32, d)
        const shade = clamp(1.0 + (d - lit) * 2.4, 0.6, 1.15) * mix(1, 0.86 - 0.22 * v.dark, belly)
        const dayCloud = vec3(mix(vec3(1.0, 0.97, 0.93), vec3(0.34, 0.37, 0.42), v.dark) * shade)
        const nightCloud = vec3(vec3(0.16, 0.13, 0.2) * shade)
        const cloud = vec3(mix(nightCloud, dayCloud, v.day))
        col = vec3(mix(col, cloud, cov * smoothstep(0.33, 0.43, y)))
      } else if (kind > 0.6 && kind < 0.7) {
        // the sea mirrors the city, broken up by the wind
        const ripple = (noise(vec2(x * 9, y * 300 + time * 0.8)) - 0.5) * (0.004 + 0.014 * v.wind)
        const my = WATER * 2 - y
        const ruv = vec2(p.uv.x + ripple / asp, my)
        const r = land.sample(ruv)
        let mirror = vec3(skyGrad(my) * 0.85)
        if (r.a > 0.1) mirror = vec3(r.rgb * lightC)
        // lit windows and the coloured tower shine on the water at night
        if (r.a > 0.44 && r.a < 0.56) mirror = vec3(mix(mirror, vec3(1.0, 0.75, 0.4), (1 - v.day) * 0.8))
        const depth = smoothstep(WATER, SHORE, y)
        const sea = vec3(mix(vec3(0.1, 0.45, 0.7), vec3(0.04, 0.22, 0.5), depth) * lightC)
        col = vec3(mix(mirror, sea, 0.4 + 0.35 * depth + 0.2 * v.wind))
        // a sun path on the water, and the surf at the shore
        const glint = step(0.8, noise(vec2(x * 60, y * 500 + time * 0.5))) * exp(-abs(x - sun.x) * 8)
        col = vec3(col + vec3(glint * 0.55 * (1 - v.cover) * mix(0.35, 1, v.day)))
        const surf = smoothstep(0.012, 0, y - SHORE - 0.01 * sin(x * 12 + time * 0.4)) * (0.6 + 0.4 * noise(vec2(x * 30, time * 0.3)))
        col = vec3(mix(col, vec3(0.95, 0.96, 0.95) * lightC, surf * 0.6))
      } else if (kind > 0.44 && kind < 0.5) {
        // windows lit warm by night, dark by day
        col = vec3(mix(vec3(1.0, 0.8, 0.45), t.rgb * lightC, v.day))
      } else if (kind > 0.5 && kind < 0.56) {
        // the tower's facade by day, its slow colour lights by night
        const hue = time * 0.05 + y * 6
        const led = vec3(0.5 + 0.5 * sin(hue), 0.3 + 0.3 * sin(hue + 2.1), 0.6 + 0.4 * sin(hue + 4.2))
        col = vec3(mix(led * 0.9, t.rgb * lightC, v.day))
      } else {
        col = vec3(t.rgb * lightC)
        // grey days flatten colour
        const g = dot(col, vec3(0.3, 0.55, 0.15))
        col = vec3(mix(col, vec3(g), gloom * 0.35))
      }

      // sea fog rolls in over the city
      const fogCol = vec3(mix(vec3(0.07, 0.08, 0.1), vec3(0.86, 0.86, 0.85), v.day))
      const fogAmt = v.fog * smoothstep(0.65, 0.2, y) * (0.5 + 0.5 * fbm3(vec2(x * 1.4 + time * 0.012, y * 5)))
      col = vec3(mix(col, fogCol, clamp(fogAmt, 0, 0.92)))

      // rain: thin slanted streaks and a grey veil
      const q = vec2(x * 130 + y * 16, y * 2.5 + time * 1.4)
      const lane = floor(q.x)
      const lh = hash(vec2(lane, 1))
      const fall = fract(q.y + lh * 13)
      const streak = step(0.9, lh) * smoothstep(0, 0.04, fall) * smoothstep(0.3, 0.06, fall) * smoothstep(0.5, 0.15, abs(fract(q.x) - 0.5))
      col = vec3(mix(col, vec3(0.6, 0.65, 0.7) * (0.3 + 0.7 * v.day), 0.22 * v.rain))
      col = vec3(col + vec3(0.7, 0.75, 0.8) * streak * 0.22 * v.rain * (0.4 + 0.6 * v.day))

      // snow: two depths of soft flakes
      for (const k of range(2)) {
        const s = 34 + k * 26
        const sq = vec2(x * s + sin(time * 0.4 + y * 5 + k) * 0.5, y * s + time * (1.1 - k * 0.4))
        const sc2 = vec2(floor(sq))
        const sh2 = hash(vec2(sc2 + k * 17))
        const centre = vec2(sc2 + 0.5 + (vec2(hash(vec2(sc2 + 3)), hash(vec2(sc2 + 7))) - 0.5) * 0.6)
        const flake = step(0.8, sh2) * smoothstep(0.2, 0.05, length(sq - centre))
        col = vec3(mix(col, vec3(0.97, 0.98, 1.0) * (0.4 + 0.6 * v.day), flake * v.snow * (0.9 - k * 0.3)))
      }

      return vec4(clamp(col, 0, 1), 1)
    }),
  ],
})

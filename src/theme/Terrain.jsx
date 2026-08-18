const WATER_PALETTES = new Set(['sea', 'city'])

function hashSeed(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Curve di livello generate proceduralmente a partire da un seed: creste
// irregolari per montagna/natura, linee batimetriche morbide per mare/città.
// Stesso seed produce sempre lo stesso disegno.
export default function Terrain({ seed = 'wego', palette = 'mountain', lines = 5, height = 160, className = '', stroke = 'var(--line)', opacityRange = [0.3, 0.7] }) {
  const random = mulberry32(hashSeed(`${palette}:${seed}`))
  const isWater = WATER_PALETTES.has(palette)
  const width = 400
  const segments = isWater ? 6 : 9

  const polylines = Array.from({ length: lines }, (_, i) => {
    const baseY = (height / (lines + 1)) * (i + 1)
    const amplitude = isWater ? 5 + random() * 6 : 9 + random() * 16
    const phase = random() * Math.PI * 2
    const points = Array.from({ length: segments + 1 }, (_, s) => {
      const x = (width / segments) * s
      const wave = Math.sin(phase + s * (isWater ? 0.8 : 1.4)) * amplitude
      const jitter = isWater ? 0 : (random() - 0.5) * amplitude * 0.6
      return `${x.toFixed(1)},${(baseY + wave + jitter).toFixed(1)}`
    })
    return points.join(' ')
  })

  const [minOpacity, maxOpacity] = opacityRange

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {polylines.map((points, i) => (
        <polyline
          key={i}
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          opacity={minOpacity + (i / polylines.length) * (maxOpacity - minOpacity)}
        />
      ))}
    </svg>
  )
}

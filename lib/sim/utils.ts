export function clampBps(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha
}

export function formatNum(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatSigned(value: number): string {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${formatNum(value, 3)}`
}

export function formatPct(value: number): string {
  return `${formatNum(value * 100, 2)}%`
}

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export class SeededRng {
  private readonly initialSeed: number

  private state: number

  constructor(seed: number) {
    const normalized = Math.trunc(seed) || 1
    this.initialSeed = normalized >>> 0
    this.state = this.initialSeed
  }

  public reset(seed = this.initialSeed): void {
    this.state = (Math.trunc(seed) || 1) >>> 0
  }

  public next(): number {
    this.state += 0x6d2b79f5
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  public between(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  public gaussian(): number {
    let u = 0
    let v = 0

    while (u === 0) {
      u = this.next()
    }

    while (v === 0) {
      v = this.next()
    }

    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

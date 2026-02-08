import { lerp } from './utils'
import type { Snapshot, TradeEvent } from './types'

export interface ChartWindow {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface ChartGeometry {
  width: number
  height: number
  margin: { left: number; right: number; top: number; bottom: number }
}

export const DEFAULT_CHART_GEOMETRY: ChartGeometry = {
  width: 760,
  height: 280,
  margin: { left: 64, right: 20, top: 18, bottom: 44 },
}

export function buildCurvePath(
  k: number,
  xMin: number,
  xMax: number,
  xToPx: (x: number) => number,
  yToPx: (y: number) => number,
): string {
  const points: string[] = []
  const samples = 140

  for (let i = 0; i <= samples; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / samples
    const y = k / x

    if (!Number.isFinite(y)) {
      continue
    }

    points.push(`${i === 0 ? 'M' : 'L'}${xToPx(x).toFixed(2)} ${yToPx(y).toFixed(2)}`)
  }

  return points.join(' ')
}

export function buildTrailPath(points: Array<{ x: number; y: number }>, xToPx: (x: number) => number, yToPx: (y: number) => number): string {
  if (!points || points.length < 2) return ''

  const trail: string[] = []
  for (let i = 0; i < points.length; i += 1) {
    const prefix = i === 0 ? 'M' : 'L'
    trail.push(`${prefix}${xToPx(points[i].x).toFixed(2)} ${yToPx(points[i].y).toFixed(2)}`)
  }

  return trail.join(' ')
}

export function getChartViewWindow(
  snapshot: Snapshot,
  targetX: number,
  targetY: number,
  reserveTrail: Array<{ x: number; y: number }>,
  previousWindow: ChartWindow | null,
): ChartWindow {
  const recent = reserveTrail.slice(-80)
  const xVals = recent.map((point) => point.x)
  const yVals = recent.map((point) => point.y)

  xVals.push(snapshot.strategy.x, snapshot.normalizer.x, targetX)
  yVals.push(snapshot.strategy.y, snapshot.normalizer.y, targetY)

  let rawXMin = Math.min(...xVals)
  let rawXMax = Math.max(...xVals)
  let rawYMin = Math.min(...yVals)
  let rawYMax = Math.max(...yVals)

  const minXSpan = Math.max(snapshot.strategy.x * 0.12, 8)
  const minYSpan = Math.max(snapshot.strategy.y * 0.12, 900)

  if (rawXMax - rawXMin < minXSpan) {
    const centerX = (rawXMin + rawXMax) / 2
    rawXMin = centerX - minXSpan / 2
    rawXMax = centerX + minXSpan / 2
  }

  if (rawYMax - rawYMin < minYSpan) {
    const centerY = (rawYMin + rawYMax) / 2
    rawYMin = centerY - minYSpan / 2
    rawYMax = centerY + minYSpan / 2
  }

  const xPad = (rawXMax - rawXMin) * 0.28
  const yPad = (rawYMax - rawYMin) * 0.34

  let nextWindow: ChartWindow = {
    xMin: Math.max(1, rawXMin - xPad),
    xMax: rawXMax + xPad,
    yMin: Math.max(1, rawYMin - yPad),
    yMax: rawYMax + yPad,
  }

  if (previousWindow) {
    const alpha = 0.28
    nextWindow = {
      xMin: lerp(previousWindow.xMin, nextWindow.xMin, alpha),
      xMax: lerp(previousWindow.xMax, nextWindow.xMax, alpha),
      yMin: lerp(previousWindow.yMin, nextWindow.yMin, alpha),
      yMax: lerp(previousWindow.yMax, nextWindow.yMax, alpha),
    }
  }

  if (nextWindow.xMax - nextWindow.xMin < 1) {
    nextWindow.xMax = nextWindow.xMin + 1
  }

  if (nextWindow.yMax - nextWindow.yMin < 1) {
    nextWindow.yMax = nextWindow.yMin + 1
  }

  return nextWindow
}

export function trackReservePoint(
  reserveTrail: Array<{ x: number; y: number }>,
  snapshot: Snapshot,
  maxPoints = 180,
): Array<{ x: number; y: number }> {
  const point = { x: snapshot.strategy.x, y: snapshot.strategy.y }
  const last = reserveTrail[reserveTrail.length - 1]

  const changed =
    !last || Math.abs(last.x - point.x) > 1e-6 || Math.abs(last.y - point.y) > 1e-3

  if (!changed) {
    return reserveTrail
  }

  const next = reserveTrail.concat(point)
  if (next.length > maxPoints) {
    next.shift()
  }

  return next
}

export function buildArrowPath(
  event: TradeEvent | null,
  xToPx: (value: number) => number,
  yToPx: (value: number) => number,
): { fromX: number; fromY: number; toX: number; toY: number } | null {
  if (!event?.trade) return null
  return {
    fromX: xToPx(event.trade.beforeX),
    fromY: yToPx(event.trade.beforeY),
    toX: xToPx(event.trade.reserveX),
    toY: yToPx(event.trade.reserveY),
  }
}

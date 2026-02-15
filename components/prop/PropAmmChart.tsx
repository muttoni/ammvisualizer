'use client'

import { useMemo } from 'react'
import { buildCurvePath, buildTrailPath } from '../../lib/sim/chart'
import type { ThemeMode } from '../../lib/sim/types'
import type { PropTradeEvent, PropSnapshot } from '../../lib/prop-sim/types'

interface PropAmmChartProps {
  snapshot: PropSnapshot
  reserveTrail: Array<{ x: number; y: number }>
  lastEvent: PropTradeEvent | null
  theme: ThemeMode
  viewWindow: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  autoZoom: boolean
  chartSize: { width: number; height: number }
}

const PROP_CHART_PALETTE = {
  canvas: '#0b1422',
  canvasGlow: '#101f34',
  grid: '#22344f',
  axis: '#4b5f7d',
  strategyCurve: '#8ea6d5',
  normalizerCurve: '#34465d',
  trail: '#6f87b5',
  strategyDot: '#9fb4de',
  strategyRing: '#4f6285',
  normalizerDot: '#5e708d',
  targetDot: '#7f95be',
  helper: '#334b6a',
  annotation: '#617395',
  axisLabel: '#8395b1',
}

function buildFallbackWindow(snapshot: PropSnapshot): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const xMin = Math.min(snapshot.submission.x, snapshot.normalizer.x) * 0.6
  const xMax = Math.max(snapshot.submission.x, snapshot.normalizer.x) * 1.25
  const yMin = Math.min(snapshot.submission.y, snapshot.normalizer.y) * 0.55
  const yMax = Math.max(snapshot.submission.y, snapshot.normalizer.y) * 1.2

  return {
    xMin: Math.max(1e-6, xMin),
    xMax: Math.max(xMin + 1, xMax),
    yMin: Math.max(1e-6, yMin),
    yMax: Math.max(yMin + 1, yMax),
  }
}

export function PropAmmChart({
  snapshot,
  reserveTrail,
  lastEvent,
  viewWindow,
  autoZoom,
  chartSize,
}: PropAmmChartProps) {
  const geometry = useMemo(() => {
    const width = Math.max(320, Math.round(chartSize.width))
    const height = Math.max(220, Math.round(chartSize.height))
    return {
      width,
      height,
      margin: {
        left: Math.max(56, Math.min(84, width * 0.1)),
        right: Math.max(16, Math.min(34, width * 0.04)),
        top: Math.max(16, Math.min(30, height * 0.09)),
        bottom: Math.max(44, Math.min(64, height * 0.2)),
      },
    }
  }, [chartSize.height, chartSize.width])

  const chart = useMemo(() => {
    const activeWindow = viewWindow ?? buildFallbackWindow(snapshot)
    const xMin = activeWindow.xMin
    const xMax = activeWindow.xMax
    const yMin = activeWindow.yMin
    const yMax = activeWindow.yMax

    const innerW = geometry.width - geometry.margin.left - geometry.margin.right
    const innerH = geometry.height - geometry.margin.top - geometry.margin.bottom

    const xToPx = (x: number) => geometry.margin.left + ((x - xMin) / (xMax - xMin)) * innerW
    const yToPx = (y: number) => geometry.margin.top + (1 - (y - yMin) / (yMax - yMin)) * innerH

    const strategyPath = buildCurvePath(snapshot.submission.k, xMin, xMax, xToPx, yToPx)
    const normalizerPath = buildCurvePath(snapshot.normalizer.k, xMin, xMax, xToPx, yToPx)
    const trailPath = buildTrailPath(reserveTrail.slice(-120), xToPx, yToPx)

    const submissionPoint = {
      x: xToPx(snapshot.submission.x),
      y: yToPx(snapshot.submission.y),
    }

    const normalizerPoint = {
      x: xToPx(snapshot.normalizer.x),
      y: yToPx(snapshot.normalizer.y),
    }

    const targetX = Math.sqrt(snapshot.submission.k / Math.max(snapshot.fairPrice, 1e-9))
    const targetY = snapshot.submission.k / Math.max(targetX, 1e-9)

    const targetPoint = {
      x: xToPx(targetX),
      y: yToPx(targetY),
    }

    const xAxisY = geometry.height - geometry.margin.bottom
    const yAxisX = geometry.margin.left

    const tradeArrow =
      lastEvent?.trade && lastEvent.isSubmissionTrade
        ? {
            fromX: xToPx(lastEvent.trade.beforeX),
            fromY: yToPx(lastEvent.trade.beforeY),
            toX: xToPx(lastEvent.trade.reserveX),
            toY: yToPx(lastEvent.trade.reserveY),
          }
        : null

    return {
      innerW,
      innerH,
      xToPx,
      yToPx,
      xAxisY,
      yAxisX,
      strategyPath,
      normalizerPath,
      trailPath,
      submissionPoint,
      normalizerPoint,
      targetPoint,
      tradeArrow,
    }
  }, [geometry.height, geometry.margin.bottom, geometry.margin.left, geometry.margin.right, geometry.margin.top, geometry.width, lastEvent, reserveTrail, snapshot, viewWindow])

  const gridColumns = 8
  const gridRows = 6

  return (
    <svg
      id="propCurveChart"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Prop AMM compute swap graph"
      data-auto-zoom={autoZoom ? 'on' : 'off'}
    >
      <defs>
        <radialGradient id="propChartGlow" cx="40%" cy="18%" r="78%">
          <stop offset="0%" stopColor={PROP_CHART_PALETTE.canvasGlow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={PROP_CHART_PALETTE.canvas} stopOpacity="1" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width={geometry.width} height={geometry.height} fill="url(#propChartGlow)" />

      {Array.from({ length: gridColumns + 1 }).map((_, index) => {
        const x = geometry.margin.left + (chart.innerW * index) / gridColumns
        return (
          <line
            key={`grid-x-${index}`}
            x1={x}
            y1={geometry.margin.top}
            x2={x}
            y2={geometry.height - geometry.margin.bottom}
            stroke={PROP_CHART_PALETTE.grid}
            strokeWidth="0.8"
            strokeOpacity="0.52"
          />
        )
      })}

      {Array.from({ length: gridRows + 1 }).map((_, index) => {
        const y = geometry.margin.top + (chart.innerH * index) / gridRows
        return (
          <line
            key={`grid-y-${index}`}
            x1={geometry.margin.left}
            y1={y}
            x2={geometry.width - geometry.margin.right}
            y2={y}
            stroke={PROP_CHART_PALETTE.grid}
            strokeWidth="0.8"
            strokeOpacity="0.52"
          />
        )
      })}

      <line
        x1={geometry.margin.left}
        y1={geometry.height - geometry.margin.bottom}
        x2={geometry.width - geometry.margin.right}
        y2={geometry.height - geometry.margin.bottom}
        stroke={PROP_CHART_PALETTE.axis}
        strokeWidth="1.8"
      />
      <line
        x1={geometry.margin.left}
        y1={geometry.margin.top}
        x2={geometry.margin.left}
        y2={geometry.height - geometry.margin.bottom}
        stroke={PROP_CHART_PALETTE.axis}
        strokeWidth="1.8"
      />

      <path d={chart.normalizerPath} fill="none" stroke={PROP_CHART_PALETTE.normalizerCurve} strokeWidth="2.2" strokeDasharray="11 11" />
      <path d={chart.strategyPath} fill="none" stroke={PROP_CHART_PALETTE.strategyCurve} strokeWidth="4" strokeLinecap="round" />
      <path d={chart.trailPath} fill="none" stroke={PROP_CHART_PALETTE.trail} strokeWidth="1.4" strokeOpacity="0.48" />

      <line
        x1={chart.submissionPoint.x}
        y1={chart.submissionPoint.y}
        x2={chart.submissionPoint.x}
        y2={chart.xAxisY}
        stroke={PROP_CHART_PALETTE.helper}
        strokeWidth="1.3"
        strokeDasharray="6 9"
      />
      <line
        x1={chart.yAxisX}
        y1={chart.submissionPoint.y}
        x2={chart.submissionPoint.x}
        y2={chart.submissionPoint.y}
        stroke={PROP_CHART_PALETTE.helper}
        strokeWidth="1.3"
        strokeDasharray="6 9"
      />

      {chart.tradeArrow ? (
        <line
          x1={chart.tradeArrow.fromX}
          y1={chart.tradeArrow.fromY}
          x2={chart.tradeArrow.toX}
          y2={chart.tradeArrow.toY}
          stroke={PROP_CHART_PALETTE.strategyCurve}
          strokeWidth="1.35"
          strokeOpacity="0.8"
        />
      ) : null}

      <circle cx={chart.normalizerPoint.x} cy={chart.normalizerPoint.y} r="5" fill={PROP_CHART_PALETTE.normalizerDot} opacity="0.9" />
      <circle cx={chart.targetPoint.x} cy={chart.targetPoint.y} r="3.4" fill={PROP_CHART_PALETTE.targetDot} opacity="0.9" />

      <circle cx={chart.submissionPoint.x} cy={chart.submissionPoint.y} r="8.4" fill={PROP_CHART_PALETTE.strategyDot} opacity="0.95" />
      <circle cx={chart.submissionPoint.x} cy={chart.submissionPoint.y} r="15.5" fill="none" stroke={PROP_CHART_PALETTE.strategyRing} strokeWidth="1.1" opacity="0.7" />
      <circle cx={chart.submissionPoint.x} cy={chart.submissionPoint.y} r="26" fill="none" stroke={PROP_CHART_PALETTE.strategyRing} strokeWidth="0.8" opacity="0.26" />
      <circle cx={chart.submissionPoint.x} cy={chart.submissionPoint.y} r="38" fill="none" stroke={PROP_CHART_PALETTE.strategyRing} strokeWidth="0.7" opacity="0.14" />

      <line x1={chart.submissionPoint.x + 16} y1={chart.submissionPoint.y + 2} x2={chart.submissionPoint.x + 70} y2={chart.submissionPoint.y + 2} stroke={PROP_CHART_PALETTE.annotation} strokeWidth="1.5" />
      <text x={chart.submissionPoint.x + 76} y={chart.submissionPoint.y + 8} fill={PROP_CHART_PALETTE.annotation} fontSize="13" fontFamily="Space Mono">
        input
      </text>

      <line x1={chart.submissionPoint.x - 2} y1={chart.submissionPoint.y - 16} x2={chart.submissionPoint.x - 2} y2={chart.submissionPoint.y - 62} stroke={PROP_CHART_PALETTE.annotation} strokeWidth="1.5" />
      <text x={chart.submissionPoint.x + 8} y={chart.submissionPoint.y - 44} fill={PROP_CHART_PALETTE.annotation} fontSize="13" fontFamily="Space Mono">
        output
      </text>

      <text
        x={geometry.margin.left + chart.innerW * 0.47}
        y={geometry.margin.top + 48}
        fill={PROP_CHART_PALETTE.annotation}
        fontSize="24"
        fontFamily="Space Mono"
        opacity="0.9"
      >
        compute_swap()
      </text>
      <line
        x1={geometry.margin.left + chart.innerW * 0.53}
        y1={geometry.margin.top + 62}
        x2={geometry.margin.left + chart.innerW * 0.58}
        y2={geometry.margin.top + 112}
        stroke={PROP_CHART_PALETTE.annotation}
        strokeWidth="1.5"
        opacity="0.62"
      />

      <circle cx={geometry.margin.left + chart.innerW * 0.45} cy={geometry.margin.top + chart.innerH * 0.49} r="3.2" fill={PROP_CHART_PALETTE.annotation} opacity="0.7" />
      <circle cx={geometry.margin.left + chart.innerW * 0.57} cy={geometry.margin.top + chart.innerH * 0.31} r="2.9" fill={PROP_CHART_PALETTE.annotation} opacity="0.62" />

      <text
        x={geometry.margin.left + chart.innerW * 0.5 - 20}
        y={geometry.height - 13}
        fill={PROP_CHART_PALETTE.axisLabel}
        fontSize="18"
        fontFamily="Cormorant Garamond"
      >
        Input
      </text>
      <text
        x={30}
        y={geometry.margin.top + chart.innerH * 0.52}
        fill={PROP_CHART_PALETTE.axisLabel}
        fontSize="18"
        fontFamily="Cormorant Garamond"
        transform={`rotate(-90 30 ${geometry.margin.top + chart.innerH * 0.52})`}
      >
        Output
      </text>
    </svg>
  )
}

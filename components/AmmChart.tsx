'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { CHART_THEME, PROP_CHART_THEME } from '../lib/sim/constants'
import {
  buildArrowPath,
  buildCurvePath,
  buildTrailPath,
  DEFAULT_CHART_GEOMETRY,
  type ChartWindow,
  getChartViewWindow,
} from '../lib/sim/chart'
import type { Snapshot, ThemeMode, TradeEvent } from '../lib/sim/types'

interface AmmChartProps {
  snapshot: Snapshot
  reserveTrail: Array<{ x: number; y: number }>
  lastEvent: TradeEvent | null
  theme: ThemeMode
  viewWindow: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  autoZoom: boolean
  chartSize?: { width: number; height: number }
  variant?: 'classic' | 'prop'
}

export function AmmChart({ snapshot, reserveTrail, lastEvent, theme, viewWindow, autoZoom, chartSize, variant = 'classic' }: AmmChartProps) {
  const palette = variant === 'prop'
    ? theme === 'dark'
      ? PROP_CHART_THEME.dark
      : CHART_THEME.light
    : CHART_THEME[theme]
  const uid = useId().replace(/:/g, '')
  const clipId = `plotClip-${uid}`
  const markerId = `arrowHead-${uid}`
  const geometry = useMemo(() => {
    const width = Math.max(320, Math.round(chartSize?.width ?? DEFAULT_CHART_GEOMETRY.width))
    const height = Math.max(220, Math.round(chartSize?.height ?? DEFAULT_CHART_GEOMETRY.height))
    const margin = {
      left: Math.max(48, Math.min(72, width * 0.09)),
      right: Math.max(14, Math.min(28, width * 0.03)),
      top: Math.max(14, Math.min(26, height * 0.08)),
      bottom: Math.max(42, Math.min(58, height * 0.18)),
    }
    return {
      width,
      height,
      margin,
    }
  }, [chartSize?.height, chartSize?.width])
  const [frozenWindow, setFrozenWindow] = useState<ChartWindow | null>(null)

  const baseView = useMemo(() => {
    const targetX = Math.sqrt(snapshot.strategy.k / snapshot.fairPrice)
    const targetY = snapshot.strategy.k / targetX

    const liveWindow =
      viewWindow ||
      getChartViewWindow(snapshot, targetX, targetY, reserveTrail, null)
    return { targetX, targetY, liveWindow }
  }, [reserveTrail, snapshot, viewWindow])

  useEffect(() => {
    if (autoZoom) {
      setFrozenWindow(null)
      return
    }

    if (!frozenWindow) {
      setFrozenWindow(baseView.liveWindow)
    }
  }, [autoZoom, baseView.liveWindow, frozenWindow])

  const chart = useMemo(() => {
    const activeWindow = autoZoom ? baseView.liveWindow : frozenWindow ?? baseView.liveWindow
    const xMin = activeWindow.xMin
    const xMax = activeWindow.xMax
    const yMin = activeWindow.yMin
    const yMax = activeWindow.yMax
    const innerW = geometry.width - geometry.margin.left - geometry.margin.right
    const innerH = geometry.height - geometry.margin.top - geometry.margin.bottom

    const xToPx = (x: number) =>
      geometry.margin.left + ((x - xMin) / (xMax - xMin)) * innerW

    const yToPx = (y: number) =>
      geometry.margin.top + (1 - (y - yMin) / (yMax - yMin)) * innerH

    const strategyPath = buildCurvePath(snapshot.strategy.k, xMin, xMax, xToPx, yToPx)
    const normalizerPath = buildCurvePath(snapshot.normalizer.k, xMin, xMax, xToPx, yToPx)
    const trailPath = buildTrailPath(reserveTrail.slice(-90), xToPx, yToPx)

    const strategyPoint = {
      x: xToPx(snapshot.strategy.x),
      y: yToPx(snapshot.strategy.y),
    }

    const normalizerPoint = {
      x: xToPx(snapshot.normalizer.x),
      y: yToPx(snapshot.normalizer.y),
    }

    const targetPoint = {
      x: xToPx(baseView.targetX),
      y: yToPx(baseView.targetY),
    }

    const arrow = buildArrowPath(lastEvent, xToPx, yToPx)

    return {
      strategyPath,
      normalizerPath,
      trailPath,
      strategyPoint,
      normalizerPoint,
      targetPoint,
      arrow,
      innerW,
      innerH,
    }
  }, [autoZoom, baseView.liveWindow, baseView.targetX, baseView.targetY, frozenWindow, geometry.height, geometry.margin.bottom, geometry.margin.left, geometry.margin.right, geometry.margin.top, geometry.width, lastEvent, reserveTrail, snapshot])

  const titleLabel = variant === 'prop' ? 'compute_swap()' : 'x · y = k'
  const subtitleLabel = variant === 'prop' ? 'output curve' : 'Δy / Δx'
  const xAxisLabel = variant === 'prop' ? 'Input' : 'Reserve X'
  const yAxisLabel = variant === 'prop' ? 'Output' : 'Reserve Y'
  const strategyLabel = variant === 'prop' ? 'strategy curve' : 'strategy'
  const normalizerLabel = variant === 'prop' ? 'normalizer ref' : 'normalizer'
  const trailLabel =
    variant === 'prop'
      ? autoZoom
        ? 'tracked reserves (auto)'
        : 'tracked reserves (fixed)'
      : autoZoom
        ? 'recent trail (auto-zoom)'
        : 'recent trail (fixed view)'
  const titleFont = variant === 'prop' ? 'Space Mono' : 'Cormorant Garamond'
  const titleStyle = variant === 'prop' ? 'normal' : 'italic'
  const axisFont = variant === 'prop' ? 'IBM Plex Sans' : 'Cormorant Garamond'
  const labelFont = variant === 'prop' ? 'Space Mono' : 'Space Mono'

  return (
    <svg
      id="curveChart"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="AMM reserve curve chart"
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={geometry.margin.left}
            y={geometry.margin.top}
            width={chart.innerW}
            height={chart.innerH}
          />
        </clipPath>
        <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={palette.arrowHead} />
        </marker>
      </defs>

      <rect x="0" y="0" width={geometry.width} height={geometry.height} fill="transparent" />

      {Array.from({ length: 7 }).map((_, index) => {
        const gx = geometry.margin.left + (chart.innerW * index) / 6
        return (
          <line
            key={`grid-x-${index}`}
            x1={gx}
            y1={geometry.margin.top}
            x2={gx}
            y2={geometry.height - geometry.margin.bottom}
            stroke={palette.grid}
            strokeWidth="0.7"
          />
        )
      })}

      {Array.from({ length: 7 }).map((_, index) => {
        const gy = geometry.margin.top + (chart.innerH * index) / 6
        return (
          <line
            key={`grid-y-${index}`}
            x1={geometry.margin.left}
            y1={gy}
            x2={geometry.width - geometry.margin.right}
            y2={gy}
            stroke={palette.grid}
            strokeWidth="0.7"
          />
        )
      })}

      <line
        x1={geometry.margin.left}
        y1={geometry.height - geometry.margin.bottom}
        x2={geometry.width - geometry.margin.right}
        y2={geometry.height - geometry.margin.bottom}
        stroke={palette.axis}
        strokeWidth="1.2"
      />
      <line
        x1={geometry.margin.left}
        y1={geometry.margin.top}
        x2={geometry.margin.left}
        y2={geometry.height - geometry.margin.bottom}
        stroke={palette.axis}
        strokeWidth="1.2"
      />

      <g clipPath={`url(#${clipId})`}>
        <path d={chart.normalizerPath} fill="none" stroke={palette.normalizerCurve} strokeWidth="1.4" strokeDasharray="7 6" />
        <path d={chart.strategyPath} fill="none" stroke={palette.strategyCurve} strokeWidth="2.7" />
        <path d={chart.trailPath} fill="none" stroke={palette.trail} strokeWidth="1.15" strokeOpacity="0.42" />

        {chart.arrow ? (
          <line
            x1={chart.arrow.fromX}
            y1={chart.arrow.fromY}
            x2={chart.arrow.toX}
            y2={chart.arrow.toY}
            stroke={lastEvent?.isStrategyTrade ? palette.arrowStrategy : palette.arrowOther}
            strokeWidth="1.45"
            markerEnd={`url(#${markerId})`}
          />
        ) : null}

        <circle cx={chart.strategyPoint.x} cy={chart.strategyPoint.y} r="6.2" fill={palette.strategyDot} fillOpacity="0.8" />
        <circle cx={chart.strategyPoint.x} cy={chart.strategyPoint.y} r="13" fill="none" stroke={palette.strategyRing} strokeWidth="0.85" />

        <circle
          cx={chart.normalizerPoint.x}
          cy={chart.normalizerPoint.y}
          r="4.6"
          fill={palette.normalizerDotFill}
          stroke={palette.normalizerDotStroke}
          strokeWidth="1.25"
        />

        <circle cx={chart.targetPoint.x} cy={chart.targetPoint.y} r="2.8" fill={palette.targetDot} fillOpacity="0.62" />
      </g>

      <text x={geometry.width - 218} y="42" fill={palette.labelMain} fontSize={variant === 'prop' ? '20' : '28'} fontFamily={titleFont} fontStyle={titleStyle} letterSpacing={variant === 'prop' ? '0.03em' : 'normal'}>
        {titleLabel}
      </text>
      <text x={geometry.width - 188} y="61" fill={palette.labelSoft} fontSize={variant === 'prop' ? '12' : '15'} fontFamily={titleFont} fontStyle={titleStyle} letterSpacing={variant === 'prop' ? '0.06em' : 'normal'}>
        {subtitleLabel}
      </text>

      <text x={geometry.width / 2 - 38} y={geometry.height - 12} fill={palette.axisLabel} fontSize="13" fontFamily={axisFont}>
        {xAxisLabel}
      </text>
      <text
        x="27"
        y={geometry.height / 2 + 24}
        fill={palette.axisLabel}
        fontSize="13"
        fontFamily={axisFont}
        transform={`rotate(-90 27 ${geometry.height / 2 + 24})`}
      >
        {yAxisLabel}
      </text>

      <text x={geometry.margin.left + 10} y={geometry.margin.top + 14} fill={palette.legendStrategy} fontSize="10" fontFamily={labelFont}>
        {strategyLabel}
      </text>
      <text x={geometry.margin.left + 10} y={geometry.margin.top + 27} fill={palette.legendNormalizer} fontSize="10" fontFamily={labelFont}>
        {normalizerLabel}
      </text>
      <text x={geometry.margin.left + 10} y={geometry.margin.top + 40} fill={palette.legendTrail} fontSize="9" fontFamily={labelFont}>
        {trailLabel}
      </text>
    </svg>
  )
}

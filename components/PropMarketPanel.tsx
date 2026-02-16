'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { PROP_SPEED_PROFILE } from '../lib/prop-sim/constants'
import { buildPropDepthStats, fromScaledBigInt, propAmmSpot, toScaledBigInt } from '../lib/prop-sim/math'
import type { PropTradeEvent, PropWorkerUiState } from '../lib/prop-sim/types'
import type { ThemeMode } from '../lib/sim/types'
import { AmmChart } from './AmmChart'

interface PropMarketPanelProps {
  state: PropWorkerUiState
  theme: ThemeMode
  playbackSpeed: number
  autoZoom: boolean
  isInitializing?: boolean
  onPlaybackSpeedChange: (value: number) => void
  onToggleAutoZoom: () => void
  onPlayPause: () => void
  onStep: () => void
  onReset: () => void
}

function formatNum(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

function formatSigned(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

export function PropMarketPanel({
  state,
  theme,
  playbackSpeed,
  autoZoom,
  isInitializing = false,
  onPlaybackSpeedChange,
  onToggleAutoZoom,
  onPlayPause,
  onStep,
  onReset,
}: PropMarketPanelProps) {
  const snapshot = state.snapshot
  const strategySpot = snapshot.strategy.y / snapshot.strategy.x
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ width: 760, height: 320 })

  useLayoutEffect(() => {
    const host = chartHostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width))
      const height = Math.max(220, Math.round(rect.height))
      setChartSize((prev) => {
        if (prev.width === width && prev.height === height) return prev
        return { width, height }
      })
    }

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect
      if (!next) return

      const width = Math.max(320, Math.round(next.width))
      const height = Math.max(220, Math.round(next.height))

      setChartSize((prev) => {
        if (prev.width === width && prev.height === height) return prev
        return { width, height }
      })
    })

    measure()
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Create quote function for depth stats
  const strategyQuoteFn = (side: 0 | 1, input: number): number => {
    const feeBps = state.currentStrategy.feeBps
    const gamma = 1 - feeBps / 10000
    const k = snapshot.strategy.k

    if (side === 0) {
      // Buy X: input Y
      const netY = input * gamma
      const newY = snapshot.strategy.y + netY
      return Math.max(0, snapshot.strategy.x - k / newY)
    } else {
      // Sell X: input X
      const netX = input * gamma
      const newX = snapshot.strategy.x + netX
      return Math.max(0, snapshot.strategy.y - k / newX)
    }
  }

  const normalizerQuoteFn = (side: 0 | 1, input: number): number => {
    const feeBps = snapshot.normalizer.feeBps
    const gamma = 1 - feeBps / 10000
    const k = snapshot.normalizer.k

    if (side === 0) {
      const netY = input * gamma
      const newY = snapshot.normalizer.y + netY
      return Math.max(0, snapshot.normalizer.x - k / newY)
    } else {
      const netX = input * gamma
      const newX = snapshot.normalizer.x + netX
      return Math.max(0, snapshot.normalizer.y - k / newX)
    }
  }

  const strategyDepth = buildPropDepthStats(
    { name: 'Strategy', reserveX: snapshot.strategy.x, reserveY: snapshot.strategy.y, isStrategy: true },
    strategyQuoteFn,
  )

  const normalizerDepth = buildPropDepthStats(
    { name: 'Normalizer', reserveX: snapshot.normalizer.x, reserveY: snapshot.normalizer.y, isStrategy: false },
    normalizerQuoteFn,
  )

  const maxBuy5 = Math.max(strategyDepth.buyDepth5, normalizerDepth.buyDepth5, 1e-9)
  const maxSell5 = Math.max(strategyDepth.sellDepth5, normalizerDepth.sellDepth5, 1e-9)

  // Adapt snapshot for AmmChart (expects original format)
  const chartSnapshot = {
    step: snapshot.step,
    fairPrice: snapshot.fairPrice,
    strategy: {
      x: snapshot.strategy.x,
      y: snapshot.strategy.y,
      bid: snapshot.strategy.impliedBidBps,
      ask: snapshot.strategy.impliedAskBps,
      k: snapshot.strategy.k,
    },
    normalizer: {
      x: snapshot.normalizer.x,
      y: snapshot.normalizer.y,
      bid: snapshot.normalizer.feeBps,
      ask: snapshot.normalizer.feeBps,
      k: snapshot.normalizer.k,
    },
    edge: snapshot.edge,
  }

  return (
    <section className="market-panel reveal delay-2">
      <div className="panel-head market-head">
        <h2>Simulated Market (Prop AMM)</h2>
        <span id="clockLabel" className="clock">
          Step {snapshot.step} | Trade {state.tradeCount}
          {isInitializing ? ' | Loading' : ''}
        </span>
      </div>

      <div className="market-grid">
        <div className="market-main">
          <div className="market-controls">
            <div className="button-row market-button-row">
              <button id="playBtn" className="control-btn" type="button" onClick={onPlayPause} disabled={isInitializing}>
                <ControlIcon kind={state.isPlaying ? 'pause' : 'play'} />
                <span>{state.isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button id="stepBtn" className="control-btn" type="button" onClick={onStep} disabled={isInitializing}>
                <ControlIcon kind="step" />
                <span>Step</span>
              </button>
              <button id="resetBtn" className="control-btn" type="button" onClick={onReset} disabled={isInitializing}>
                <ControlIcon kind="reset" />
                <span>Reset</span>
              </button>
            </div>

            <div className="market-controls-right">
              <label className="control speed-control" htmlFor="speedRange">
                <span>Speed</span>
                <div className="speed-inner">
                  <input
                    id="speedRange"
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={playbackSpeed}
                    disabled={isInitializing}
                    onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
                  />
                  <strong id="speedLabel">{(PROP_SPEED_PROFILE[playbackSpeed] ?? PROP_SPEED_PROFILE[3]).label}</strong>
                </div>
              </label>

              <button
                type="button"
                aria-pressed={autoZoom}
                className={`small-control graph-toggle ${autoZoom ? 'active' : ''}`}
                disabled={isInitializing}
                onClick={onToggleAutoZoom}
              >
                {autoZoom ? 'Auto-Zoom On' : 'Auto-Zoom Off'}
              </button>
            </div>
          </div>

          <div className="chart-wrap terminal-surface">
            <div ref={chartHostRef} className="chart-host">
              <AmmChart
                snapshot={chartSnapshot}
                reserveTrail={state.reserveTrail}
                lastEvent={state.lastEvent as unknown as Parameters<typeof AmmChart>[0]['lastEvent']}
                theme={theme}
                viewWindow={state.viewWindow}
                autoZoom={autoZoom}
                chartSize={chartSize}
                variant="prop"
              />
            </div>
          </div>

          <div className="market-bottom">
            <section className="metrics-panel terminal-surface">
              <div className="metrics">
                <div className="metric-card">
                  <span>Fair Price</span>
                  <strong id="fairPriceMetric">{formatNum(snapshot.fairPrice, 4)} Y/X</strong>
                </div>
                <div className="metric-card">
                  <span>Strategy Spot</span>
                  <strong id="strategySpotMetric">{formatNum(strategySpot, 4)} Y/X</strong>
                </div>
                <div className="metric-card">
                  <span>Implied Fees</span>
                  <strong>
                    ~{formatNum(snapshot.strategy.impliedBidBps, 0)}/{formatNum(snapshot.strategy.impliedAskBps, 0)} bps
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Normalizer</span>
                  <strong>
                    {snapshot.normalizer.feeBps} bps @ {snapshot.normalizer.liquidityMult.toFixed(2)}x liq
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Volatility</span>
                  <strong>{(snapshot.simulationParams.volatility * 100).toFixed(3)}%/step</strong>
                </div>
                <div className="metric-card">
                  <span>Cumulative Edge</span>
                  <strong id="edgeMetric">
                    {formatSigned(snapshot.edge.total)} (retail {formatSigned(snapshot.edge.retail)}, arb {formatSigned(snapshot.edge.arb)})
                  </strong>
                </div>
              </div>
            </section>

            <section className="depth-section terminal-surface">
              <div className="depth-head">
                <h3>Per-Pool Depth</h3>
                <span id="depthLegend" className="depth-legend">
                  to 1% and 5% price impact
                </span>
              </div>

              <div id="depthView" className="depth-view">
                <DepthCard
                  poolLabel="Strategy"
                  poolClass="strategy"
                  feeLabel={`~${snapshot.strategy.impliedBidBps}/${snapshot.strategy.impliedAskBps} bps`}
                  stats={strategyDepth}
                  buyMax={maxBuy5}
                  sellMax={maxSell5}
                />
                <DepthCard
                  poolLabel="Normalizer"
                  poolClass="normalizer"
                  feeLabel={`${snapshot.normalizer.feeBps} bps @ ${snapshot.normalizer.liquidityMult.toFixed(1)}x`}
                  stats={normalizerDepth}
                  buyMax={maxBuy5}
                  sellMax={maxSell5}
                />
              </div>
            </section>
          </div>
        </div>

        <aside className="trade-column terminal-surface">
          <div className="trade-column-head">
            <h3>Trade Tape</h3>
            <span>{state.history.length} events</span>
          </div>

          <ul id="tradeTape" className={`trade-tape${state.history.length === 0 ? ' is-empty' : ''}`}>
            {state.history.length === 0 ? (
              <li className="trade-row trade-row-empty">
                {isInitializing ? 'Simulation is loading. Controls unlock in a moment.' : 'No trades yet. Press Step or Play.'}
              </li>
            ) : null}
            {state.history.map((event) => (
              <PropTradeTapeRow key={event.id} event={event} />
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}

function ControlIcon({ kind }: { kind: 'play' | 'pause' | 'step' | 'reset' }) {
  if (kind === 'pause') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="btn-icon">
        <rect x="3" y="2" width="3" height="12" rx="1" />
        <rect x="10" y="2" width="3" height="12" rx="1" />
      </svg>
    )
  }

  if (kind === 'step') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="btn-icon">
        <rect x="2" y="2" width="2" height="12" rx="1" />
        <path d="M5 2.5v11l8-5.5z" />
      </svg>
    )
  }

  if (kind === 'reset') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="btn-icon">
        <path d="M8 2a6 6 0 1 1-4.9 2.5H1.5V1.8L5 5.2H3.9A4.8 4.8 0 1 0 8 3.2z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="btn-icon">
      <path d="M4 2.5v11l8-5.5z" />
    </svg>
  )
}

function DepthCard({
  poolLabel,
  poolClass,
  feeLabel,
  stats,
  buyMax,
  sellMax,
}: {
  poolLabel: string
  poolClass: string
  feeLabel: string
  stats: { buyDepth1: number; buyDepth5: number; sellDepth1: number; sellDepth5: number; buyOneXCostY: number; sellOneXPayoutY: number }
  buyMax: number
  sellMax: number
}) {
  const buyWidth = Math.max(3, Math.min(100, (stats.buyDepth5 / buyMax) * 100))
  const sellWidth = Math.max(3, Math.min(100, (stats.sellDepth5 / sellMax) * 100))

  return (
    <article className={`depth-card depth-card-${poolClass}`}>
      <div className="depth-title-row">
        <h4>{poolLabel}</h4>
        <span className="depth-fees">{feeLabel}</span>
      </div>

      <div className="depth-stat-row">
        <span>Buy-side depth (+1% / +5%)</span>
        <strong>
          {formatNum(stats.buyDepth1, 3)} X / {formatNum(stats.buyDepth5, 3)} X
        </strong>
      </div>
      <div className="depth-bar-track">
        <div className={`depth-bar depth-bar-buy depth-bar-${poolClass}`} style={{ width: `${buyWidth.toFixed(1)}%` }} />
      </div>

      <div className="depth-stat-row">
        <span>Sell-side depth (-1% / -5%)</span>
        <strong>
          {formatNum(stats.sellDepth1, 3)} X / {formatNum(stats.sellDepth5, 3)} X
        </strong>
      </div>
      <div className="depth-bar-track">
        <div className={`depth-bar depth-bar-sell depth-bar-${poolClass}`} style={{ width: `${sellWidth.toFixed(1)}%` }} />
      </div>

      <div className="depth-micro">
        <span>Cost to buy 1 X: {formatNum(stats.buyOneXCostY, 3)} Y</span>
        <span>Payout for sell 1 X: {formatNum(stats.sellOneXPayoutY, 3)} Y</span>
      </div>
    </article>
  )
}

function PropTradeTapeRow({ event }: { event: PropTradeEvent }) {
  const flowClass = event.flow === 'arbitrage' ? 'arb' : event.flow === 'retail' ? 'retail' : 'system'
  const flowLabel = event.flow === 'arbitrage' ? 'Arb' : event.flow === 'retail' ? 'Retail' : 'System'
  const edgeClass = event.edgeDelta >= 0 ? 'good' : 'bad'

  return (
    <li className="trade-row">
      <div className="trade-top">
        <span className={`trade-pill ${flowClass}`}>{flowLabel}</span>
        <span>
          t{event.step} | {event.ammName}
        </span>
      </div>
      <p className="trade-text">{event.summary}</p>
      {event.isStrategyTrade ? (
        <div className={`trade-edge ${edgeClass}`}>strategy edge delta: {formatSigned(event.edgeDelta)}</div>
      ) : (
        <div className="trade-edge">normalizer trade</div>
      )}
    </li>
  )
}

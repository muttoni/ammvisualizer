'use client'

import { useEffect, useRef, useState } from 'react'
import { SPEED_PROFILE } from '../lib/sim/constants'
import { buildDepthStats } from '../lib/sim/math'
import type { ThemeMode, TradeEvent, WorkerUiState } from '../lib/sim/types'
import { formatNum, formatSigned } from '../lib/sim/utils'
import { AmmChart } from './AmmChart'

interface MarketPanelProps {
  state: WorkerUiState
  theme: ThemeMode
  playbackSpeed: number
  autoZoom: boolean
  onPlaybackSpeedChange: (value: number) => void
  onToggleAutoZoom: () => void
  onPlayPause: () => void
  onStep: () => void
  onReset: () => void
}

export function MarketPanel({
  state,
  theme,
  playbackSpeed,
  autoZoom,
  onPlaybackSpeedChange,
  onToggleAutoZoom,
  onPlayPause,
  onStep,
  onReset,
}: MarketPanelProps) {
  const snapshot = state.snapshot
  const strategySpot = snapshot.strategy.y / snapshot.strategy.x
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ width: 760, height: 320 })
  const latestStrategyEvent = state.history.find((event) => event.isStrategyTrade && event.trade)
  const tradeRatio = latestStrategyEvent?.trade ? latestStrategyEvent.trade.amountY / Math.max(latestStrategyEvent.trade.reserveY, 1e-9) : null
  const slotFeeBps = extractSlotFeeBps(latestStrategyEvent?.stateBadge ?? state.lastEvent.stateBadge)

  useEffect(() => {
    const host = chartHostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

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

    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const strategyDepth = buildDepthStats({
    name: 'Strategy',
    reserveX: snapshot.strategy.x,
    reserveY: snapshot.strategy.y,
    bidFeeBps: snapshot.strategy.bid,
    askFeeBps: snapshot.strategy.ask,
    feesX: 0,
    feesY: 0,
    isStrategy: true,
  })

  const normalizerDepth = buildDepthStats({
    name: 'Normalizer',
    reserveX: snapshot.normalizer.x,
    reserveY: snapshot.normalizer.y,
    bidFeeBps: snapshot.normalizer.bid,
    askFeeBps: snapshot.normalizer.ask,
    feesX: 0,
    feesY: 0,
    isStrategy: false,
  })

  const maxBuy5 = Math.max(strategyDepth.buyDepth5, normalizerDepth.buyDepth5, 1e-9)
  const maxSell5 = Math.max(strategyDepth.sellDepth5, normalizerDepth.sellDepth5, 1e-9)

  return (
    <section className="market-panel reveal delay-2">
      <div className="panel-head market-head">
        <h2>Simulated Market</h2>
        <span id="clockLabel" className="clock">
          Step {snapshot.step} | Trade {state.tradeCount}
        </span>
      </div>

      <div className="market-grid">
        <div className="market-main">
          <div className="market-controls">
            <div className="button-row market-button-row">
              <button id="playBtn" className="control-btn" type="button" onClick={onPlayPause}>
                <ControlIcon kind={state.isPlaying ? 'pause' : 'play'} />
                <span>{state.isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button id="stepBtn" className="control-btn" type="button" onClick={onStep}>
                <ControlIcon kind="step" />
                <span>Step</span>
              </button>
              <button id="resetBtn" className="control-btn" type="button" onClick={onReset}>
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
                    onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
                  />
                  <strong id="speedLabel">{(SPEED_PROFILE[playbackSpeed] ?? SPEED_PROFILE[3]).label}</strong>
                </div>
              </label>

              <button
                type="button"
                aria-pressed={autoZoom}
                className={`small-control graph-toggle ${autoZoom ? 'active' : ''}`}
                onClick={onToggleAutoZoom}
              >
                {autoZoom ? 'Auto-Zoom On' : 'Auto-Zoom Off'}
              </button>
            </div>
          </div>

          <div className="chart-wrap terminal-surface">
            <div ref={chartHostRef} className="chart-host">
              <AmmChart
                snapshot={snapshot}
                reserveTrail={state.reserveTrail}
                lastEvent={state.lastEvent}
                theme={theme}
                viewWindow={state.viewWindow}
                autoZoom={autoZoom}
                chartSize={chartSize}
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
                  <span>Strategy Fees</span>
                  <strong id="feesMetric">
                    bid {formatNum(snapshot.strategy.bid, 0)} bps | ask {formatNum(snapshot.strategy.ask, 0)} bps
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Slot[0] Fee</span>
                  <strong>{slotFeeBps === null ? 'n/a' : `${formatNum(slotFeeBps, 0)} bps`}</strong>
                </div>
                <div className="metric-card">
                  <span>Trade Ratio</span>
                  <strong>{tradeRatio === null ? 'n/a' : `${formatNum(tradeRatio * 100, 2)}%`}</strong>
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
                  feeLabel={`${snapshot.strategy.bid}/${snapshot.strategy.ask} bps`}
                  stats={strategyDepth}
                  buyMax={maxBuy5}
                  sellMax={maxSell5}
                />
                <DepthCard
                  poolLabel="Normalizer"
                  poolClass="normalizer"
                  feeLabel={`${snapshot.normalizer.bid}/${snapshot.normalizer.ask} bps`}
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

          <ul id="tradeTape" className="trade-tape">
            {state.history.length === 0 ? <li className="trade-row trade-row-empty">No trades yet. Press Step or Play.</li> : null}
            {state.history.map((event) => (
              <TradeTapeRow key={event.id} event={event} />
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

function extractSlotFeeBps(stateBadge: string): number | null {
  const match = stateBadge.match(/slot\[0\]\s*fee:\s*([0-9]+(?:\.[0-9]+)?)\s*bps/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
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
  stats: ReturnType<typeof buildDepthStats>
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

function TradeTapeRow({ event }: { event: TradeEvent }) {
  const flowClass = event.flow === 'arbitrage' ? 'arb' : 'retail'
  const flowLabel = event.flow === 'arbitrage' ? 'Arb' : 'Retail'
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
        <div className="trade-edge">normalizer trade (strategy callback skipped)</div>
      )}
    </li>
  )
}

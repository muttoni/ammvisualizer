'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { PROP_SPEED_PROFILE } from '../../lib/prop-sim/constants'
import type { PropTradeEvent, PropWorkerUiState } from '../../lib/prop-sim/types'
import type { ThemeMode } from '../../lib/sim/types'
import { formatNum, formatSigned } from '../../lib/sim/utils'
import { PropAmmChart } from './PropAmmChart'

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
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ width: 760, height: 320 })

  useLayoutEffect(() => {
    const host = chartHostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

    const measure = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width))
      const height = Math.max(220, Math.round(rect.height))
      setChartSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect
      if (!next) return

      const width = Math.max(320, Math.round(next.width))
      const height = Math.max(220, Math.round(next.height))
      setChartSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })

    measure()
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="market-panel prop-market-panel reveal delay-2">
      <div className="panel-head market-head">
        <h2>Simulated Market (Prop AMM)</h2>
        <span className="clock">
          Step {snapshot.step} | Trade {state.tradeCount}
          {isInitializing ? ' | Loading' : ''}
        </span>
      </div>

      <div className="market-grid">
        <div className="market-main">
          <div className="market-controls">
            <div className="button-row market-button-row">
              <button className="control-btn" type="button" onClick={onPlayPause} disabled={isInitializing}>
                <ControlIcon kind={state.isPlaying ? 'pause' : 'play'} />
                <span>{state.isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button className="control-btn" type="button" onClick={onStep} disabled={isInitializing}>
                <ControlIcon kind="step" />
                <span>Step</span>
              </button>
              <button className="control-btn" type="button" onClick={onReset} disabled={isInitializing}>
                <ControlIcon kind="reset" />
                <span>Reset</span>
              </button>
            </div>

            <div className="market-controls-right">
              <label className="control speed-control" htmlFor="propSpeedRange">
                <span>Speed</span>
                <div className="speed-inner">
                  <input
                    id="propSpeedRange"
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={playbackSpeed}
                    disabled={isInitializing}
                    onChange={(event) => onPlaybackSpeedChange(Number(event.target.value))}
                  />
                  <strong>{(PROP_SPEED_PROFILE[playbackSpeed] ?? PROP_SPEED_PROFILE[3]).label}</strong>
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

          <div className="chart-wrap prop-chart-wrap terminal-surface">
            <div ref={chartHostRef} className="chart-host prop-chart-host">
              <PropAmmChart
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
                <MetricCard label="Fair Price" value={`${formatNum(snapshot.fairPrice, 4)} Y/X`} />
                <MetricCard label="Submission Spot" value={`${formatNum(snapshot.submission.spot, 4)} Y/X`} />
                <MetricCard label="Normalizer Spot" value={`${formatNum(snapshot.normalizer.spot, 4)} Y/X`} />
                <MetricCard label="Sigma" value={`${formatNum(snapshot.regime.gbmSigma * 100, 3)}% / step`} />
                <MetricCard label="Retail Lambda" value={formatNum(snapshot.regime.retailArrivalRate, 3)} />
                <MetricCard label="Retail Mean Size" value={`${formatNum(snapshot.regime.retailMeanSize, 3)} Y`} />
                <MetricCard
                  label="Normalizer Regime"
                  value={`${snapshot.regime.normFeeBps} bps @ ${formatNum(snapshot.regime.normLiquidityMult, 2)}x`}
                />
                <MetricCard
                  label="Storage"
                  value={`Δ ${snapshot.storage.lastChangedBytes} bytes | last ${snapshot.storage.lastWriteStep ?? 'n/a'}`}
                />
                <MetricCard
                  label="Cumulative Edge"
                  value={`${formatSigned(snapshot.edge.total)} (retail ${formatSigned(snapshot.edge.retail)}, arb ${formatSigned(snapshot.edge.arb)})`}
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

          <ul className={`trade-tape${state.history.length === 0 ? ' is-empty' : ''}`}>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PropTradeTapeRow({ event }: { event: PropTradeEvent }) {
  const flowClass = event.flow === 'arbitrage' ? 'arb' : event.flow === 'retail' ? 'retail' : 'system'
  const flowLabel = event.flow === 'arbitrage' ? 'Arb' : event.flow === 'retail' ? 'Retail' : 'System'
  const edgeClass = event.edgeDelta >= 0 ? 'good' : 'bad'
  const alphaLabel = event.routerSplit ? `α=${formatNum(event.routerSplit.alpha, 3)}` : null

  return (
    <li className="trade-row">
      <div className="trade-top">
        <span className={`trade-pill ${flowClass}`}>{flowLabel}</span>
        <span>
          t{event.step} | {event.poolName}
        </span>
      </div>
      <p className="trade-text">{event.summary}</p>
      {alphaLabel ? <p className="trade-text">router split {alphaLabel}</p> : null}
      {event.isSubmissionTrade ? (
        <div className={`trade-edge ${edgeClass}`}>submission edge delta: {formatSigned(event.edgeDelta)}</div>
      ) : (
        <div className="trade-edge">normalizer trade</div>
      )}
    </li>
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

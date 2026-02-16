'use client'

import { useEffect, useMemo, useState } from 'react'
import { HeaderActions } from '../../components/HeaderActions'
import { FooterLinks } from '../../components/FooterLinks'
import { PropCodePanel } from '../../components/PropCodePanel'
import { PropMarketPanel } from '../../components/PropMarketPanel'
import { usePropSimulationWorker } from '../../hooks/usePropSimulationWorker'
import { useUiStore } from '../../store/useUiStore'
import type { PropStrategyRef, PropWorkerUiState } from '../../lib/prop-sim/types'
import { PROP_BUILTIN_STRATEGIES, getPropBuiltinStrategyById } from '../../lib/prop-strategies/builtins'

function buildFallbackUiState(strategyRef: PropStrategyRef, playbackSpeed: number, maxTapeRows: number): PropWorkerUiState {
  const builtin = getPropBuiltinStrategyById(strategyRef.id) ?? PROP_BUILTIN_STRATEGIES[0]

  const snapshot: PropWorkerUiState['snapshot'] = {
    step: 0,
    fairPrice: 100,
    strategy: {
      x: 100,
      y: 10_000,
      k: 1_000_000,
      impliedBidBps: builtin.feeBps,
      impliedAskBps: builtin.feeBps,
    },
    normalizer: {
      x: 100,
      y: 10_000,
      k: 1_000_000,
      feeBps: 30,
      liquidityMult: 1.0,
    },
    edge: { total: 0, retail: 0, arb: 0 },
    simulationParams: { volatility: 0.003, arrivalRate: 0.8 },
  }

  return {
    config: {
      seed: 1337,
      strategyRef: { kind: 'builtin', id: builtin.id },
      playbackSpeed,
      maxTapeRows,
    },
    currentStrategy: {
      kind: 'builtin',
      id: builtin.id,
      name: builtin.name,
      code: builtin.code,
      feeBps: builtin.feeBps,
    },
    isPlaying: false,
    tradeCount: 0,
    snapshot,
    lastEvent: {
      id: 0,
      step: 0,
      flow: 'system',
      ammName: builtin.name,
      isStrategyTrade: false,
      trade: null,
      order: null,
      arbProfit: 0,
      fairPrice: 100,
      priceMove: { from: 100, to: 100 },
      edgeDelta: 0,
      codeLines: [],
      codeExplanation: 'Initializing simulation...',
      stateBadge: `implied: ${builtin.feeBps}/${builtin.feeBps} bps`,
      summary: 'Simulation worker is initializing.',
      snapshot,
    },
    history: [],
    reserveTrail: [{ x: 100, y: 10_000 }],
    viewWindow: null,
    availableStrategies: PROP_BUILTIN_STRATEGIES.map((s) => ({
      kind: 'builtin' as const,
      id: s.id,
      name: s.name,
    })),
    normalizerConfig: { feeBps: 30, liquidityMult: 1.0 },
  }
}

export default function PropAmmPage() {
  const theme = useUiStore((state) => state.theme)
  const playbackSpeed = useUiStore((state) => state.playbackSpeed)
  const maxTapeRows = useUiStore((state) => state.maxTapeRows)
  const showCodeExplanation = useUiStore((state) => state.showCodeExplanation)
  const chartAutoZoom = useUiStore((state) => state.chartAutoZoom)

  const setTheme = useUiStore((state) => state.setTheme)
  const setPlaybackSpeed = useUiStore((state) => state.setPlaybackSpeed)
  const setShowCodeExplanation = useUiStore((state) => state.setShowCodeExplanation)
  const setChartAutoZoom = useUiStore((state) => state.setChartAutoZoom)

  // Local strategy ref state for prop-amm
  const [propStrategyRef, setPropStrategyRef] = useState<PropStrategyRef>({
    kind: 'builtin',
    id: 'starter-500bps',
  })

  const {
    ready,
    workerState,
    workerError,
    controls,
  } = usePropSimulationWorker({
    seed: 1337,
    playbackSpeed,
    maxTapeRows,
    strategyRef: propStrategyRef,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const fallbackState = useMemo(
    () => buildFallbackUiState(propStrategyRef, playbackSpeed, maxTapeRows),
    [maxTapeRows, playbackSpeed, propStrategyRef],
  )
  const effectiveState = workerState ?? fallbackState
  const simulationLoading = !ready || !workerState

  return (
    <>
      <div className="backdrop" />
      <div className="app-shell prop-amm-page">
        <HeaderActions
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          subtitle="Prop AMM Challenge"
          subtitleLink="https://ammchallenge.com/prop-amm"
        />

        {workerError ? <div className="worker-error">Worker error: {workerError}</div> : null}

        <main className="layout">
          <PropCodePanel
            availableStrategies={effectiveState.availableStrategies}
            selectedStrategy={propStrategyRef}
            code={effectiveState.currentStrategy.code}
            highlightedLines={effectiveState.lastEvent.codeLines}
            codeExplanation={effectiveState.lastEvent.codeExplanation}
            showExplanationOverlay={showCodeExplanation}
            onSelectStrategy={(next) => {
              setPropStrategyRef(next)
              controls.setStrategy(next)
            }}
            onToggleExplanationOverlay={() => setShowCodeExplanation(!showCodeExplanation)}
          />

          <PropMarketPanel
            state={effectiveState}
            theme={theme}
            playbackSpeed={playbackSpeed}
            autoZoom={chartAutoZoom}
            isInitializing={simulationLoading}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onToggleAutoZoom={() => setChartAutoZoom(!chartAutoZoom)}
            onPlayPause={() => {
              if (!workerState) return
              if (workerState.isPlaying) {
                controls.pause()
                return
              }
              controls.play()
            }}
            onStep={() => {
              if (!workerState) return
              controls.step()
            }}
            onReset={() => {
              if (!workerState) return
              controls.reset()
            }}
          />
        </main>

        <FooterLinks />
      </div>
    </>
  )
}

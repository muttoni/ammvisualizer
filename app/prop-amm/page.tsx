'use client'

import { useEffect, useMemo } from 'react'
import { HeaderActions } from '../../components/HeaderActions'
import { PropCodePanel } from '../../components/prop/PropCodePanel'
import { PropMarketPanel } from '../../components/prop/PropMarketPanel'
import { PROP_DEFAULT_STEPS } from '../../lib/prop-sim/constants'
import type { PropSimulationConfig, PropStrategyRef, PropWorkerUiState } from '../../lib/prop-sim/types'
import { PROP_BUILTIN_STRATEGIES, getPropBuiltinStrategy } from '../../lib/prop-strategies/builtins'
import { usePropSimulationWorker } from '../../hooks/usePropSimulationWorker'
import { usePropUiStore } from '../../store/usePropUiStore'
import { useUiStore } from '../../store/useUiStore'

function buildFallbackUiState(strategyRef: PropStrategyRef, config: Omit<PropSimulationConfig, 'strategyRef'>): PropWorkerUiState {
  const requested = PROP_BUILTIN_STRATEGIES.find((strategy) => strategy.id === strategyRef.id)
  const selected = requested ?? PROP_BUILTIN_STRATEGIES[0]
  const runtime = getPropBuiltinStrategy({ kind: 'builtin', id: selected.id })

  const snapshot: PropWorkerUiState['snapshot'] = {
    step: 0,
    fairPrice: 100,
    submission: {
      x: 100,
      y: 10_000,
      spot: 100,
      k: 1_000_000,
    },
    normalizer: {
      x: 100,
      y: 10_000,
      spot: 100,
      k: 1_000_000,
      feeBps: 30,
      liquidityMult: 1,
    },
    edge: {
      total: 0,
      retail: 0,
      arb: 0,
    },
    regime: {
      gbmSigma: 0.001,
      retailArrivalRate: 0.8,
      retailMeanSize: 20,
      normFeeBps: 30,
      normLiquidityMult: 1,
    },
    storage: {
      lastChangedBytes: 0,
      lastWriteStep: null,
    },
  }

  return {
    config: {
      ...config,
      strategyRef: runtime.ref,
    },
    currentStrategy: {
      kind: runtime.ref.kind,
      id: runtime.ref.id,
      name: runtime.name,
      code: runtime.code,
      modelUsed: runtime.modelUsed,
    },
    isPlaying: false,
    tradeCount: 0,
    snapshot,
    lastEvent: {
      id: 0,
      step: 0,
      flow: 'system',
      pool: 'submission',
      poolName: 'Submission',
      isSubmissionTrade: false,
      trade: null,
      order: null,
      routerSplit: null,
      arbProfit: 0,
      fairPrice: 100,
      priceMove: { from: 100, to: 100 },
      edgeDelta: 0,
      codeLines: [66, 67],
      codeExplanation: 'Simulation worker is initializing in the background.',
      stateBadge: 'storage Δ=0 bytes | last write: n/a',
      summary: 'Simulation initialized.',
      storageChangedBytes: 0,
      snapshot,
    },
    history: [],
    reserveTrail: [{ x: 100, y: 10_000 }],
    viewWindow: null,
    availableStrategies: PROP_BUILTIN_STRATEGIES,
  }
}

export default function PropAmmPage() {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)

  const playbackSpeed = usePropUiStore((state) => state.playbackSpeed)
  const maxTapeRows = usePropUiStore((state) => state.maxTapeRows)
  const nSteps = usePropUiStore((state) => state.nSteps)
  const strategyRef = usePropUiStore((state) => state.strategyRef)
  const showCodeExplanation = usePropUiStore((state) => state.showCodeExplanation)
  const chartAutoZoom = usePropUiStore((state) => state.chartAutoZoom)

  const setPlaybackSpeed = usePropUiStore((state) => state.setPlaybackSpeed)
  const setStrategyRef = usePropUiStore((state) => state.setStrategyRef)
  const setShowCodeExplanation = usePropUiStore((state) => state.setShowCodeExplanation)
  const setChartAutoZoom = usePropUiStore((state) => state.setChartAutoZoom)

  const { ready, workerState, workerError, controls } = usePropSimulationWorker({
    seed: 1337,
    playbackSpeed,
    maxTapeRows,
    nSteps,
    strategyRef,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const fallbackState = useMemo(
    () =>
      buildFallbackUiState(strategyRef, {
        seed: 1337,
        playbackSpeed,
        maxTapeRows,
        nSteps: nSteps || PROP_DEFAULT_STEPS,
      }),
    [maxTapeRows, nSteps, playbackSpeed, strategyRef],
  )

  const effectiveState = workerState ?? fallbackState
  const simulationLoading = !ready || !workerState

  return (
    <>
      <div className="backdrop prop-backdrop" />
      <div className="app-shell prop-app-shell">
        <HeaderActions
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          subtitle="Prop AMM Challenge"
          subtitleLink="https://ammchallenge.com/prop-amm"
          currentView="prop"
        />

        {workerError ? <div className="worker-error">Worker error: {workerError}</div> : null}

        <main className="layout">
          <PropCodePanel
            availableStrategies={effectiveState.availableStrategies}
            selectedStrategy={strategyRef}
            code={effectiveState.currentStrategy.code}
            modelUsed={effectiveState.currentStrategy.modelUsed}
            highlightedLines={effectiveState.lastEvent.codeLines}
            codeExplanation={effectiveState.lastEvent.codeExplanation}
            showExplanationOverlay={showCodeExplanation}
            onSelectStrategy={setStrategyRef}
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
      </div>
    </>
  )
}

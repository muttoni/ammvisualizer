'use client'

import { useEffect, useMemo, useState } from 'react'
import { CodePanel } from '../components/CodePanel'
import { HeaderActions } from '../components/HeaderActions'
import { MarketPanel } from '../components/MarketPanel'
import { clampBps } from '../lib/sim/utils'
import type { StrategyRef, WorkerUiState } from '../lib/sim/types'
import { BUILTIN_STRATEGIES, getBuiltinStrategyById } from '../lib/strategies/builtins'
import { useSimulationWorker } from '../hooks/useSimulationWorker'
import { useUiStore } from '../store/useUiStore'

function buildFallbackUiState(strategyRef: StrategyRef, playbackSpeed: number, maxTapeRows: number): WorkerUiState {
  const requestedBuiltin = strategyRef.kind === 'builtin' ? getBuiltinStrategyById(strategyRef.id) : null
  const builtin = requestedBuiltin ?? BUILTIN_STRATEGIES[0]
  const memory: Record<string, number> = {}
  const init = builtin.initialize(memory)
  const bid = clampBps(init.bidBps)
  const ask = clampBps(init.askBps)

  const snapshot: WorkerUiState['snapshot'] = {
    step: 0,
    fairPrice: 100,
    strategy: {
      x: 100,
      y: 10_000,
      bid,
      ask,
      k: 1_000_000,
    },
    normalizer: {
      x: 100,
      y: 10_000,
      bid: 30,
      ask: 30,
      k: 1_000_000,
    },
    edge: {
      total: 0,
      retail: 0,
      arb: 0,
    },
  }

  return {
    config: {
      seed: 1337,
      strategyRef: {
        kind: 'builtin',
        id: builtin.id,
      },
      playbackSpeed,
      maxTapeRows,
    },
    currentStrategy: {
      kind: 'builtin',
      id: builtin.id,
      name: builtin.name,
      code: builtin.code,
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
      feeChange: null,
      codeLines: init.lines ?? [],
      codeExplanation: init.explanation || 'Initializing simulation...',
      explanationMode: 'line-level',
      stateBadge: init.stateBadge || `fees: bid ${bid} bps | ask ${ask} bps`,
      summary: 'Simulation worker is initializing in the background.',
      snapshot,
      strategyExecution: {
        mode: 'builtin',
        bidFeeBps: bid,
        askFeeBps: ask,
        previousBidFeeBps: bid,
        previousAskFeeBps: ask,
        changedSlots: [],
      },
    },
    history: [],
    reserveTrail: [{ x: 100, y: 10_000 }],
    viewWindow: null,
    diagnostics: [],
    availableStrategies: BUILTIN_STRATEGIES.map((item) => ({
      kind: 'builtin' as const,
      id: item.id,
      name: item.name,
    })),
  }
}

export default function Page() {
  const theme = useUiStore((state) => state.theme)
  const playbackSpeed = useUiStore((state) => state.playbackSpeed)
  const maxTapeRows = useUiStore((state) => state.maxTapeRows)
  const strategyRef = useUiStore((state) => state.strategyRef)
  const showCodeExplanation = useUiStore((state) => state.showCodeExplanation)
  const chartAutoZoom = useUiStore((state) => state.chartAutoZoom)
  const [customRuntimeEnabled, setCustomRuntimeEnabled] = useState(false)

  const setTheme = useUiStore((state) => state.setTheme)
  const setPlaybackSpeed = useUiStore((state) => state.setPlaybackSpeed)
  const setStrategyRef = useUiStore((state) => state.setStrategyRef)
  const setShowCodeExplanation = useUiStore((state) => state.setShowCodeExplanation)
  const setChartAutoZoom = useUiStore((state) => state.setChartAutoZoom)

  const safeStrategyRef = useMemo(() => {
    if (customRuntimeEnabled) {
      return strategyRef
    }

    if (strategyRef.kind === 'custom') {
      return { kind: 'builtin', id: 'baseline30' } as const
    }

    return strategyRef
  }, [customRuntimeEnabled, strategyRef])

  const {
    ready,
    workerState,
    library,
    compileResult,
    compileStatus,
    workerError,
    controls,
  } = useSimulationWorker({
    seed: 1337,
    playbackSpeed,
    maxTapeRows,
    strategyRef: safeStrategyRef,
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!workerState) return
    const selectedStillAvailable = workerState.availableStrategies.some(
      (item) => item.kind === strategyRef.kind && item.id === strategyRef.id,
    )
    if (selectedStillAvailable) return
    setStrategyRef(workerState.config.strategyRef)
  }, [setStrategyRef, strategyRef.id, strategyRef.kind, workerState])

  useEffect(() => {
    if (!customRuntimeEnabled && strategyRef.kind === 'custom') {
      setStrategyRef({ kind: 'builtin', id: 'baseline30' })
    }
  }, [customRuntimeEnabled, setStrategyRef, strategyRef.kind])

  const fallbackState = useMemo(
    () => buildFallbackUiState(strategyRef, playbackSpeed, maxTapeRows),
    [maxTapeRows, playbackSpeed, strategyRef],
  )
  const effectiveState = workerState ?? fallbackState
  const simulationLoading = !ready || !workerState

  return (
    <>
      <div className="backdrop" />
      <div className="app-shell">
        <HeaderActions
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          currentView="amm"
        />

        {workerError ? <div className="worker-error">Worker error: {workerError}</div> : null}

        <main className="layout">
          <CodePanel
            availableStrategies={effectiveState.availableStrategies}
            selectedStrategy={strategyRef}
            code={effectiveState.currentStrategy.code}
            highlightedLines={effectiveState.lastEvent.codeLines}
            codeExplanation={effectiveState.lastEvent.codeExplanation}
            diagnostics={effectiveState.diagnostics}
            library={library}
            compileResult={compileResult}
            compileStatus={compileStatus}
            onSelectStrategy={(next) => {
              if (next.kind === 'custom') {
                setCustomRuntimeEnabled(true)
              }
              setStrategyRef(next)
            }}
            showExplanationOverlay={showCodeExplanation}
            onToggleExplanationOverlay={() => setShowCodeExplanation(!showCodeExplanation)}
            onCompileAndActivateCustom={(payload) => {
              controls.compileAndActivateCustom(payload)
            }}
          />

          <MarketPanel
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

'use client'

import { useEffect, useMemo, useState } from 'react'
import { CodePanel } from '../components/CodePanel'
import { HeaderActions } from '../components/HeaderActions'
import { MarketPanel } from '../components/MarketPanel'
import { useSimulationWorker } from '../hooks/useSimulationWorker'
import { useUiStore } from '../store/useUiStore'

export default function Page() {
  const theme = useUiStore((state) => state.theme)
  const playbackSpeed = useUiStore((state) => state.playbackSpeed)
  const maxTapeRows = useUiStore((state) => state.maxTapeRows)
  const strategyRef = useUiStore((state) => state.strategyRef)
  const [customRuntimeEnabled, setCustomRuntimeEnabled] = useState(false)

  const setTheme = useUiStore((state) => state.setTheme)
  const setPlaybackSpeed = useUiStore((state) => state.setPlaybackSpeed)
  const setStrategyRef = useUiStore((state) => state.setStrategyRef)

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

    const activeRef = workerState.config.strategyRef
    if (activeRef.kind !== strategyRef.kind || activeRef.id !== strategyRef.id) {
      setStrategyRef(activeRef)
    }
  }, [setStrategyRef, strategyRef.id, strategyRef.kind, workerState])

  useEffect(() => {
    if (!customRuntimeEnabled && strategyRef.kind === 'custom') {
      setStrategyRef({ kind: 'builtin', id: 'baseline30' })
    }
  }, [customRuntimeEnabled, setStrategyRef, strategyRef.kind])

  if (!ready || !workerState) {
    return (
      <>
        <div className="backdrop" />
        <div className="app-shell">
          <p>Loading simulation worker...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="backdrop" />
      <div className="app-shell">
        <HeaderActions
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />

        {workerError ? <div className="worker-error">Worker error: {workerError}</div> : null}

        <main className="layout">
          <CodePanel
            availableStrategies={workerState.availableStrategies}
            selectedStrategy={strategyRef}
            code={workerState.currentStrategy.code}
            highlightedLines={workerState.lastEvent.codeLines}
            codeExplanation={workerState.lastEvent.codeExplanation}
            stateBadge={workerState.lastEvent.stateBadge}
            diagnostics={workerState.diagnostics}
            library={library}
            compileResult={compileResult}
            onSelectStrategy={setStrategyRef}
            onCompileAndActivateCustom={(payload) => {
              setCustomRuntimeEnabled(true)
              controls.compileAndActivateCustom(payload)
            }}
            onDeleteCustom={controls.deleteCustom}
          />

          <MarketPanel
            state={workerState}
            theme={theme}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedChange={setPlaybackSpeed}
            onPlayPause={() => {
              if (workerState.isPlaying) {
                controls.pause()
                return
              }

              controls.play()
            }}
            onStep={controls.step}
            onReset={controls.reset}
          />
        </main>
      </div>
    </>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropSimulationConfig, PropStrategyRef, PropWorkerUiState } from '../lib/prop-sim/types'

interface UsePropSimulationWorkerOptions {
  seed: number
  playbackSpeed: number
  maxTapeRows: number
  strategyRef: PropStrategyRef
}

interface UsePropSimulationWorkerResult {
  ready: boolean
  workerState: PropWorkerUiState | null
  workerError: string | null
  controls: {
    play: () => void
    pause: () => void
    step: () => void
    reset: () => void
    setStrategy: (ref: PropStrategyRef) => void
  }
}

export function usePropSimulationWorker(
  options: UsePropSimulationWorkerOptions,
): UsePropSimulationWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)
  const [workerState, setWorkerState] = useState<PropWorkerUiState | null>(null)
  const [workerError, setWorkerError] = useState<string | null>(null)

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/prop-simulation.worker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'ready') {
        // Send init
        const config: PropSimulationConfig = {
          seed: options.seed,
          strategyRef: options.strategyRef,
          playbackSpeed: options.playbackSpeed,
          maxTapeRows: options.maxTapeRows,
        }
        worker.postMessage({ type: 'init', config })
      } else if (msg.type === 'state') {
        setWorkerState(msg.state)
        if (!ready) {
          setReady(true)
        }
      }
    }

    worker.onerror = (event) => {
      setWorkerError(event.message || 'Worker error')
    }

    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update config when options change
  useEffect(() => {
    if (!workerRef.current || !ready) return

    const config: PropSimulationConfig = {
      seed: options.seed,
      strategyRef: options.strategyRef,
      playbackSpeed: options.playbackSpeed,
      maxTapeRows: options.maxTapeRows,
    }
    workerRef.current.postMessage({ type: 'setConfig', config })
  }, [ready, options.seed, options.playbackSpeed, options.maxTapeRows, options.strategyRef])

  // Controls
  const play = useCallback(() => {
    workerRef.current?.postMessage({ type: 'play' })
  }, [])

  const pause = useCallback(() => {
    workerRef.current?.postMessage({ type: 'pause' })
  }, [])

  const step = useCallback(() => {
    workerRef.current?.postMessage({ type: 'step' })
  }, [])

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' })
  }, [])

  const setStrategy = useCallback((ref: PropStrategyRef) => {
    workerRef.current?.postMessage({ type: 'setStrategy', strategyRef: ref })
  }, [])

  return {
    ready,
    workerState,
    workerError,
    controls: {
      play,
      pause,
      step,
      reset,
      setStrategy,
    },
  }
}

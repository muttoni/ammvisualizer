'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropSimulationConfig, PropStrategyRef } from '../lib/prop-sim/types'
import { usePropPlaybackStore } from '../store/usePropPlaybackStore'
import type { PropWorkerInboundMessage, PropWorkerOutboundMessage } from '../workers/prop-messages'

interface UsePropSimulationWorkerArgs {
  seed: number
  playbackSpeed: number
  maxTapeRows: number
  nSteps: number
  strategyRef: PropStrategyRef
}

export function usePropSimulationWorker({
  seed,
  playbackSpeed,
  maxTapeRows,
  nSteps,
  strategyRef,
}: UsePropSimulationWorkerArgs) {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)

  const workerState = usePropPlaybackStore((state) => state.workerState)
  const workerError = usePropPlaybackStore((state) => state.workerError)
  const setWorkerState = usePropPlaybackStore((state) => state.setWorkerState)
  const setWorkerError = usePropPlaybackStore((state) => state.setWorkerError)

  const post = useCallback((message: PropWorkerInboundMessage) => {
    workerRef.current?.postMessage(message)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../workers/prop-simulation.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<PropWorkerOutboundMessage>) => {
      const message = event.data
      switch (message.type) {
        case 'PROP_STATE': {
          setWorkerState(message.payload.state)
          break
        }
        case 'PROP_ERROR': {
          setWorkerError(message.payload.message)
          break
        }
        default:
          break
      }
    }

    workerRef.current = worker
    setReady(true)

    const initConfig: Partial<PropSimulationConfig> = {
      seed,
      playbackSpeed,
      maxTapeRows,
      nSteps,
      strategyRef,
    }

    worker.postMessage({
      type: 'INIT_PROP_SIM',
      payload: {
        config: initConfig,
      },
    } satisfies PropWorkerInboundMessage)

    return () => {
      worker.terminate()
      workerRef.current = null
      setReady(false)
    }
  }, [setWorkerError, setWorkerState])

  useEffect(() => {
    if (!ready) return

    post({
      type: 'SET_PROP_CONFIG',
      payload: {
        config: {
          seed,
          playbackSpeed,
          maxTapeRows,
          nSteps,
          strategyRef,
        },
      },
    })
  }, [maxTapeRows, nSteps, playbackSpeed, post, ready, seed, strategyRef])

  const controls = useMemo(
    () => ({
      play: () => post({ type: 'PLAY_PROP' }),
      pause: () => post({ type: 'PAUSE_PROP' }),
      step: () => post({ type: 'STEP_PROP_ONE' }),
      reset: () => post({ type: 'RESET_PROP' }),
    }),
    [post],
  )

  return {
    ready,
    workerState,
    workerError,
    controls,
  }
}

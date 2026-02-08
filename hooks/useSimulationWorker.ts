'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SimulationConfig, StrategyRef } from '../lib/sim/types'
import type { WorkerInboundMessage, WorkerOutboundMessage } from '../workers/messages'
import { usePlaybackStore } from '../store/usePlaybackStore'

interface UseSimulationWorkerArgs {
  seed: number
  playbackSpeed: number
  maxTapeRows: number
  strategyRef: StrategyRef
}

export function useSimulationWorker({ seed, playbackSpeed, maxTapeRows, strategyRef }: UseSimulationWorkerArgs) {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)

  const workerState = usePlaybackStore((state) => state.workerState)
  const library = usePlaybackStore((state) => state.library)
  const compileResult = usePlaybackStore((state) => state.compileResult)
  const workerError = usePlaybackStore((state) => state.workerError)

  const setWorkerState = usePlaybackStore((state) => state.setWorkerState)
  const setLibrary = usePlaybackStore((state) => state.setLibrary)
  const setCompileResult = usePlaybackStore((state) => state.setCompileResult)
  const setWorkerError = usePlaybackStore((state) => state.setWorkerError)

  const post = useCallback((message: WorkerInboundMessage) => {
    workerRef.current?.postMessage(message)
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const message = event.data

      switch (message.type) {
        case 'STATE': {
          setWorkerState(message.payload.state)
          break
        }
        case 'LIBRARY': {
          setLibrary(message.payload.items)
          break
        }
        case 'COMPILE_RESULT': {
          setCompileResult(message.payload.result)
          break
        }
        case 'ERROR': {
          setWorkerError(message.payload.message)
          break
        }
        default:
          break
      }
    }

    workerRef.current = worker
    setReady(true)

    const initConfig: SimulationConfig = {
      seed,
      playbackSpeed,
      maxTapeRows,
      strategyRef,
    }

    worker.postMessage({
      type: 'INIT_SIM',
      payload: {
        config: initConfig,
      },
    })

    return () => {
      worker.terminate()
      workerRef.current = null
      setReady(false)
    }
  }, [setCompileResult, setLibrary, setWorkerError, setWorkerState])

  useEffect(() => {
    if (!ready) return

    post({
      type: 'SET_CONFIG',
      payload: {
        config: {
          seed,
          playbackSpeed,
          maxTapeRows,
        },
      },
    })
  }, [maxTapeRows, playbackSpeed, post, ready, seed])

  useEffect(() => {
    if (!ready) return

    post({
      type: 'SET_STRATEGY',
      payload: {
        strategyRef,
      },
    })
  }, [post, ready, strategyRef])

  const controls = useMemo(
    () => ({
      play: () => post({ type: 'PLAY' }),
      pause: () => post({ type: 'PAUSE' }),
      step: () => post({ type: 'STEP_ONE' }),
      reset: () => post({ type: 'RESET' }),
      compileCustom: (source: string, nameHint?: string) =>
        post({
          type: 'COMPILE_CUSTOM',
          payload: {
            source,
            nameHint,
          },
        }),
      saveCustom: (payload: { id?: string; name: string; source: string }) =>
        post({
          type: 'SAVE_CUSTOM',
          payload,
        }),
      deleteCustom: (id: string) =>
        post({
          type: 'DELETE_CUSTOM',
          payload: { id },
        }),
      loadLibrary: () => post({ type: 'LOAD_LIBRARY' }),
    }),
    [post],
  )

  return {
    ready,
    workerState,
    library,
    compileResult,
    workerError,
    controls,
  }
}

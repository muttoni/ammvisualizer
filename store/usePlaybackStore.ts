'use client'

import { create } from 'zustand'
import type {
  CustomCompileResult,
  StrategyLibraryItem,
  WorkerUiState,
} from '../lib/sim/types'
import type { CompileStatus } from '../workers/messages'

interface PlaybackStoreState {
  workerState: WorkerUiState | null
  library: StrategyLibraryItem[]
  compileResult: CustomCompileResult | null
  compileStatus: CompileStatus
  workerError: string | null
  setWorkerState: (state: WorkerUiState) => void
  setLibrary: (items: StrategyLibraryItem[]) => void
  setCompileResult: (result: CustomCompileResult | null) => void
  setCompileStatus: (status: CompileStatus) => void
  setWorkerError: (message: string | null) => void
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  workerState: null,
  library: [],
  compileResult: null,
  compileStatus: { phase: 'idle' },
  workerError: null,
  setWorkerState: (workerState) => set({ workerState }),
  setLibrary: (library) => set({ library }),
  setCompileResult: (compileResult) => set({ compileResult }),
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setWorkerError: (workerError) => set({ workerError }),
}))

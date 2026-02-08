'use client'

import { create } from 'zustand'
import type {
  CustomCompileResult,
  StrategyLibraryItem,
  WorkerUiState,
} from '../lib/sim/types'

interface PlaybackStoreState {
  workerState: WorkerUiState | null
  library: StrategyLibraryItem[]
  compileResult: CustomCompileResult | null
  workerError: string | null
  setWorkerState: (state: WorkerUiState) => void
  setLibrary: (items: StrategyLibraryItem[]) => void
  setCompileResult: (result: CustomCompileResult | null) => void
  setWorkerError: (message: string | null) => void
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  workerState: null,
  library: [],
  compileResult: null,
  workerError: null,
  setWorkerState: (workerState) => set({ workerState }),
  setLibrary: (library) => set({ library }),
  setCompileResult: (compileResult) => set({ compileResult }),
  setWorkerError: (workerError) => set({ workerError }),
}))

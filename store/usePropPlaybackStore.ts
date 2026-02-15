'use client'

import { create } from 'zustand'
import type { PropWorkerUiState } from '../lib/prop-sim/types'

interface PropPlaybackStoreState {
  workerState: PropWorkerUiState | null
  workerError: string | null
  setWorkerState: (state: PropWorkerUiState) => void
  setWorkerError: (message: string | null) => void
}

export const usePropPlaybackStore = create<PropPlaybackStoreState>((set) => ({
  workerState: null,
  workerError: null,
  setWorkerState: (workerState) => set({ workerState }),
  setWorkerError: (workerError) => set({ workerError }),
}))

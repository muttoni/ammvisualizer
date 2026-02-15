'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PROP_DEFAULT_STEPS } from '../lib/prop-sim/constants'
import type { PropStrategyRef } from '../lib/prop-sim/types'

interface PropUiStoreState {
  playbackSpeed: number
  maxTapeRows: number
  nSteps: number
  strategyRef: PropStrategyRef
  showCodeExplanation: boolean
  chartAutoZoom: boolean
  setPlaybackSpeed: (value: number) => void
  setMaxTapeRows: (value: number) => void
  setNSteps: (value: number) => void
  setStrategyRef: (value: PropStrategyRef) => void
  setShowCodeExplanation: (value: boolean) => void
  setChartAutoZoom: (value: boolean) => void
}

export const usePropUiStore = create<PropUiStoreState>()(
  persist(
    (set) => ({
      playbackSpeed: 3,
      maxTapeRows: 20,
      nSteps: PROP_DEFAULT_STEPS,
      strategyRef: {
        kind: 'builtin',
        id: 'starter',
      },
      showCodeExplanation: true,
      chartAutoZoom: true,
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
      setMaxTapeRows: (maxTapeRows) => set({ maxTapeRows }),
      setNSteps: (nSteps) => set({ nSteps: Math.max(1, Math.trunc(nSteps) || PROP_DEFAULT_STEPS) }),
      setStrategyRef: (strategyRef) => set({ strategyRef }),
      setShowCodeExplanation: (showCodeExplanation) => set({ showCodeExplanation }),
      setChartAutoZoom: (chartAutoZoom) => set({ chartAutoZoom }),
    }),
    {
      name: 'ammvisualizer-prop-ui-v1',
      partialize: (state) => ({
        playbackSpeed: state.playbackSpeed,
        maxTapeRows: state.maxTapeRows,
        nSteps: state.nSteps,
        strategyRef: state.strategyRef,
        showCodeExplanation: state.showCodeExplanation,
        chartAutoZoom: state.chartAutoZoom,
      }),
    },
  ),
)

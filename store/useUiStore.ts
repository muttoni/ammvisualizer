'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StrategyRef, ThemeMode } from '../lib/sim/types'

interface UiStoreState {
  theme: ThemeMode
  playbackSpeed: number
  maxTapeRows: number
  strategyRef: StrategyRef
  showCodeExplanation: boolean
  chartAutoZoom: boolean
  isEditorOpen: boolean
  setTheme: (theme: ThemeMode) => void
  setPlaybackSpeed: (speed: number) => void
  setMaxTapeRows: (rows: number) => void
  setStrategyRef: (strategyRef: StrategyRef) => void
  setShowCodeExplanation: (showCodeExplanation: boolean) => void
  setChartAutoZoom: (chartAutoZoom: boolean) => void
  setEditorOpen: (isOpen: boolean) => void
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      theme: 'light',
      playbackSpeed: 3,
      maxTapeRows: 20,
      strategyRef: {
        kind: 'builtin',
        id: 'baseline30',
      },
      showCodeExplanation: true,
      chartAutoZoom: true,
      isEditorOpen: false,
      setTheme: (theme) => set({ theme }),
      setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
      setMaxTapeRows: (maxTapeRows) => set({ maxTapeRows }),
      setStrategyRef: (strategyRef) => set({ strategyRef }),
      setShowCodeExplanation: (showCodeExplanation) => set({ showCodeExplanation }),
      setChartAutoZoom: (chartAutoZoom) => set({ chartAutoZoom }),
      setEditorOpen: (isEditorOpen) => set({ isEditorOpen }),
    }),
    {
      name: 'ammvisualizer-ui-v1',
      partialize: (state) => ({
        theme: state.theme,
        playbackSpeed: state.playbackSpeed,
        maxTapeRows: state.maxTapeRows,
        strategyRef: state.strategyRef,
        showCodeExplanation: state.showCodeExplanation,
        chartAutoZoom: state.chartAutoZoom,
      }),
    },
  ),
)

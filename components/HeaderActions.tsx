'use client'

import type { ThemeMode } from '../lib/sim/types'

interface HeaderActionsProps {
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenEditor: () => void
}

export function HeaderActions({ theme, onToggleTheme, onOpenEditor }: HeaderActionsProps) {
  const toggleLabel = theme === 'dark' ? 'Light Mode' : 'Dark Mode'

  return (
    <header className="topbar reveal">
      <div>
        <h1>AMM Starter Strategy Visualizer</h1>
        <p>Code on the left, live market on the right. Step through every trade.</p>
      </div>

      <div className="top-actions">
        <button id="themeToggleBtn" className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="Toggle dark mode">
          {toggleLabel}
        </button>
        <button className="theme-toggle secondary-toggle" type="button" onClick={onOpenEditor}>
          Custom Strategies
        </button>
      </div>
    </header>
  )
}

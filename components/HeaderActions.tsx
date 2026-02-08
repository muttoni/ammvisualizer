'use client'

import type { ThemeMode } from '../lib/sim/types'

interface HeaderActionsProps {
  theme: ThemeMode
  onToggleTheme: () => void
}

export function HeaderActions({ theme, onToggleTheme }: HeaderActionsProps) {
  const toggleLabel = theme === 'dark' ? 'Light Theme' : 'Dark Theme'

  return (
    <header className="topbar reveal">
      <div className="brand-block">
        <h1>AMM Strategy Visualizer</h1>
        <p>Research terminal for step-by-step fee strategy behavior.</p>
      </div>

      <div className="top-actions">
        <a className="terminal-link" href="https://x.com/devrelius" target="_blank" rel="noopener noreferrer">
          @devrelius
        </a>
        <a className="terminal-link" href="https://github.com/muttoni/ammvisualizer" target="_blank" rel="noopener noreferrer">
          Repo
        </a>
        <button id="themeToggleBtn" className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="Toggle dark mode">
          {toggleLabel}
        </button>
      </div>
    </header>
  )
}

'use client'

import type { ThemeMode } from '../lib/sim/types'

interface HeaderActionsProps {
  theme: ThemeMode
  onToggleTheme: () => void
  subtitle?: string
  subtitleLink?: string
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="link-icon">
      <path d="M4 3h5.2l4 5.6L18 3H20l-5.7 7.2L20.6 21h-5.1l-4.4-6.2L6 21H4l6-7.7z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="link-icon">
      <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.88-.02-1.73-2.78.62-3.37-1.37-3.37-1.37-.46-1.19-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .08 1.52 1.04 1.52 1.04.88 1.54 2.32 1.1 2.88.84.09-.65.35-1.1.63-1.36-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.93c.85 0 1.71.12 2.51.36 1.9-1.32 2.74-1.05 2.74-1.05.56 1.41.21 2.46.1 2.72.64.72 1.03 1.63 1.03 2.75 0 3.95-2.33 4.81-4.56 5.07.36.31.68.92.68 1.86 0 1.34-.01 2.42-.01 2.75 0 .27.18.59.69.49A10.2 10.2 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

export function HeaderActions({ theme, onToggleTheme, subtitle, subtitleLink }: HeaderActionsProps) {
  const toggleLabel = theme === 'dark' ? 'Light Theme' : 'Dark Theme'
  const title = subtitle ? `AMM Strategy Visualizer — ${subtitle}` : 'AMM Strategy Visualizer'
  const linkHref = subtitleLink ?? 'https://ammchallenge.com'
  const linkText = subtitle ? subtitle.toLowerCase() : 'ammchallenge.com'

  return (
    <header className="topbar reveal">
      <div className="brand-block">
        <h1>{title}</h1>
        <p>
          Step-by-step Automated Market Maker (AMM) strategy visualizer. Learn more at{' '}
          <a href={linkHref} target="_blank" rel="noopener noreferrer">
            {linkText}
          </a>
        </p>
      </div>

      <div className="top-actions">
        <a className="terminal-link" href="https://x.com/devrelius" target="_blank" rel="noopener noreferrer">
          <XIcon />
          <span>devrelius</span>
        </a>
        <a className="terminal-link" href="https://github.com/muttoni/ammvisualizer" target="_blank" rel="noopener noreferrer">
          <GitHubIcon />
          <span>Contribute</span>
        </a>
        <button id="themeToggleBtn" className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="Toggle dark mode">
          {toggleLabel}
        </button>
      </div>
    </header>
  )
}

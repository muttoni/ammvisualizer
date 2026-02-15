'use client'

import { useEffect, useMemo, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-rust'
import type { PropStrategyRef } from '../../lib/prop-sim/types'

interface PropCodePanelProps {
  availableStrategies: Array<{ kind: 'builtin'; id: string; name: string }>
  selectedStrategy: PropStrategyRef
  code: string
  modelUsed: string
  highlightedLines: number[]
  codeExplanation: string
  showExplanationOverlay: boolean
  onSelectStrategy: (strategy: PropStrategyRef) => void
  onToggleExplanationOverlay: () => void
}

function encodeStrategyRef(strategy: PropStrategyRef): string {
  return `${strategy.kind}:${strategy.id}`
}

function decodeStrategyRef(value: string): PropStrategyRef {
  const [kind, ...idParts] = value.split(':')
  return {
    kind: kind === 'builtin' ? 'builtin' : 'builtin',
    id: idParts.join(':'),
  }
}

export function PropCodePanel({
  availableStrategies,
  selectedStrategy,
  code,
  modelUsed,
  highlightedLines,
  codeExplanation,
  showExplanationOverlay,
  onSelectStrategy,
  onToggleExplanationOverlay,
}: PropCodePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lineSet = useMemo(() => new Set(highlightedLines), [highlightedLines])
  const firstHighlightedLine = highlightedLines[0] ?? null
  const lines = useMemo(() => code.replace(/\t/g, '    ').split('\n'), [code])
  const highlightedCodeLines = useMemo(
    () => lines.map((line) => Prism.highlight(line || ' ', Prism.languages.rust, 'rust')),
    [lines],
  )

  useEffect(() => {
    if (!containerRef.current || firstHighlightedLine === null) {
      return
    }

    const target = containerRef.current.querySelector<HTMLDivElement>(`.code-line[data-line='${firstHighlightedLine}']`)
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [firstHighlightedLine])

  return (
    <section className="code-panel reveal delay-1">
      <div className="panel-head">
        <div className="panel-head-stack">
          <div className="panel-head-row">
            <h2>Starter Strategy (Rust)</h2>
          </div>

          <div className="strategy-picker strategy-picker-wide">
            <select
              id="propStrategySelect"
              value={encodeStrategyRef(selectedStrategy)}
              onChange={(event) => onSelectStrategy(decodeStrategyRef(event.target.value))}
            >
              {availableStrategies.map((option) => (
                <option key={`${option.kind}-${option.id}`} value={`${option.kind}:${option.id}`}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className="prop-meta-row">
            <span>Model used: {modelUsed}</span>
            <span>Storage behavior: No-op afterSwap</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="code-view" aria-label="Prop strategy code">
        {lines.map((line, index) => {
          const lineNumber = index + 1
          const active = lineSet.has(lineNumber)

          return (
            <div key={lineNumber} className={`code-line${active ? ' active' : ''}`} data-line={lineNumber}>
              <span className="line-no">{String(lineNumber).padStart(2, '0')}</span>
              <span className="line-text" dangerouslySetInnerHTML={{ __html: highlightedCodeLines[index] }} />
            </div>
          )
        })}
      </div>

      <section className={`code-explain-section ${showExplanationOverlay ? 'expanded' : 'collapsed'}`} role="note" aria-live="polite">
        <button
          type="button"
          className="code-explain-toggle"
          onClick={onToggleExplanationOverlay}
          aria-expanded={showExplanationOverlay}
          aria-controls="propCodeExplanation"
        >
          <span>What the code is doing</span>
          <svg
            className={`code-explain-icon ${showExplanationOverlay ? 'expanded' : ''}`}
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <p id="propCodeExplanation" hidden={!showExplanationOverlay}>
          {codeExplanation || 'Step or play to inspect the latest compute_swap branch.'}
        </p>
      </section>
    </section>
  )
}

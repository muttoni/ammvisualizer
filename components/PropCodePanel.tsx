'use client'

import { useMemo } from 'react'
import type { PropStrategyRef } from '../lib/prop-sim/types'

interface PropCodePanelProps {
  availableStrategies: Array<{ kind: 'builtin'; id: string; name: string }>
  selectedStrategy: PropStrategyRef
  code: string
  highlightedLines: number[]
  codeExplanation: string
  showExplanationOverlay: boolean
  onSelectStrategy: (ref: PropStrategyRef) => void
  onToggleExplanationOverlay: () => void
}

export function PropCodePanel({
  availableStrategies,
  selectedStrategy,
  code,
  highlightedLines,
  codeExplanation,
  showExplanationOverlay,
  onSelectStrategy,
  onToggleExplanationOverlay,
}: PropCodePanelProps) {
  const lines = useMemo(() => code.split('\n'), [code])
  const highlightSet = useMemo(() => new Set(highlightedLines), [highlightedLines])

  return (
    <section className="code-panel reveal delay-1">
      <div className="panel-head code-head">
        <h2>Strategy Code (Rust)</h2>
        <div className="code-head-actions">
          <select
            id="strategySelect"
            className="strategy-select"
            value={`${selectedStrategy.kind}:${selectedStrategy.id}`}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':')
              if (kind === 'builtin') {
                onSelectStrategy({ kind: 'builtin', id })
              }
            }}
          >
            {availableStrategies.map((s) => (
              <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-pressed={showExplanationOverlay}
            className={`small-control explain-toggle ${showExplanationOverlay ? 'active' : ''}`}
            onClick={onToggleExplanationOverlay}
          >
            {showExplanationOverlay ? 'Hide Explanation' : 'Show Explanation'}
          </button>
        </div>
      </div>

      <div className="code-wrap terminal-surface">
        <pre className="code-block">
          <code className="language-rust">
            {lines.map((line, i) => {
              const lineNum = i + 1
              const isHighlighted = highlightSet.has(lineNum)
              return (
                <div
                  key={lineNum}
                  className={`code-line ${isHighlighted ? 'highlight' : ''}`}
                  data-line={lineNum}
                >
                  <span className="line-number">{lineNum}</span>
                  <span className="line-content">{line || ' '}</span>
                </div>
              )
            })}
          </code>
        </pre>
      </div>

      {showExplanationOverlay ? (
        <div className="explanation-panel terminal-surface">
          <h3>What the code is doing</h3>
          <p>{codeExplanation}</p>
          <div className="explanation-note">
            <strong>Note:</strong> Prop AMM strategies define a custom <code>compute_swap</code> function that returns{' '}
            <code>output_amount</code> directly, rather than just adjusting fees on a constant-product curve.
          </div>
        </div>
      ) : null}
    </section>
  )
}

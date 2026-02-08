'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { CompilerDiagnostic, StrategyRef } from '../lib/sim/types'

interface CodePanelProps {
  availableStrategies: Array<{ kind: 'builtin' | 'custom'; id: string; name: string }>
  selectedStrategy: StrategyRef
  code: string
  highlightedLines: number[]
  codeExplanation: string
  stateBadge: string
  diagnostics: CompilerDiagnostic[]
  onSelectStrategy: (strategy: StrategyRef) => void
  onOpenEditor: () => void
}

function encodeStrategyRef(strategy: StrategyRef): string {
  return `${strategy.kind}:${strategy.id}`
}

function decodeStrategyRef(value: string): StrategyRef {
  const [kind, ...idParts] = value.split(':')
  return {
    kind: kind === 'custom' ? 'custom' : 'builtin',
    id: idParts.join(':'),
  }
}

export function CodePanel({
  availableStrategies,
  selectedStrategy,
  code,
  highlightedLines,
  codeExplanation,
  stateBadge,
  diagnostics,
  onSelectStrategy,
  onOpenEditor,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const lineSet = useMemo(() => new Set(highlightedLines), [highlightedLines])
  const lines = useMemo(() => code.replace(/\t/g, '    ').split('\n'), [code])

  const builtinOptions = availableStrategies.filter((item) => item.kind === 'builtin')
  const customOptions = availableStrategies.filter((item) => item.kind === 'custom')

  useEffect(() => {
    if (!containerRef.current || highlightedLines.length === 0) return

    const firstLine = highlightedLines[0]
    const target = containerRef.current.querySelector<HTMLDivElement>(`.code-line[data-line='${firstLine}']`)
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightedLines])

  return (
    <section className="panel code-panel reveal delay-1">
      <div className="panel-head panel-head-stack">
        <div className="panel-head-row">
          <h2>Strategy Code</h2>
          <span id="strategyStateBadge" className="badge">
            {stateBadge}
          </span>
        </div>

        <label className="strategy-picker" htmlFor="strategySelect">
          <span>Strategy</span>
          <div className="strategy-picker-controls">
            <select
              id="strategySelect"
              value={encodeStrategyRef(selectedStrategy)}
              onChange={(event) => onSelectStrategy(decodeStrategyRef(event.target.value))}
            >
              <optgroup label="Built-in">
                {builtinOptions.map((option) => (
                  <option key={`${option.kind}-${option.id}`} value={`${option.kind}:${option.id}`}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
              {customOptions.length > 0 ? (
                <optgroup label="Custom">
                  {customOptions.map((option) => (
                    <option key={`${option.kind}-${option.id}`} value={`${option.kind}:${option.id}`}>
                      {option.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <button type="button" className="small-control" onClick={onOpenEditor}>
              Edit Custom
            </button>
          </div>
        </label>
      </div>

      <div ref={containerRef} id="codeView" className="code-view" aria-label="Strategy code">
        {lines.map((line, index) => {
          const lineNumber = index + 1
          const active = lineSet.has(lineNumber)
          return (
            <div key={lineNumber} className={`code-line${active ? ' active' : ''}`} data-line={lineNumber}>
              <span className="line-no">{String(lineNumber).padStart(2, '0')}</span>
              <span className="line-text">{line || '\u00a0'}</span>
            </div>
          )
        })}
      </div>

      <div className="explain-box">
        <h3>What the code just did</h3>
        <p>{codeExplanation}</p>

        {diagnostics.length > 0 ? (
          <div className="diagnostics-box" role="status" aria-live="polite">
            {diagnostics.slice(0, 3).map((diagnostic, index) => (
              <p key={`${diagnostic.message}-${index}`} className={diagnostic.severity === 'error' ? 'diagnostic-error' : 'diagnostic-warning'}>
                {diagnostic.severity.toUpperCase()}
                {diagnostic.line ? ` L${diagnostic.line}` : ''}: {diagnostic.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

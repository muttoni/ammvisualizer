'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_STRATEGIES } from '../lib/strategies/builtins'
import type { CompilerDiagnostic, CustomCompileResult, StrategyLibraryItem, StrategyRef } from '../lib/sim/types'

interface CodePanelProps {
  availableStrategies: Array<{ kind: 'builtin' | 'custom'; id: string; name: string }>
  selectedStrategy: StrategyRef
  code: string
  highlightedLines: number[]
  codeExplanation: string
  stateBadge: string
  diagnostics: CompilerDiagnostic[]
  library: StrategyLibraryItem[]
  compileResult: CustomCompileResult | null
  onSelectStrategy: (strategy: StrategyRef) => void
  onCompileCustom: (source: string, nameHint?: string) => void
  onSaveCustom: (payload: { id?: string; name: string; source: string }) => void
  onDeleteCustom: (id: string) => void
}

const DEFAULT_SOURCE = BUILTIN_STRATEGIES[0]?.code ?? `pragma solidity ^0.8.24;
contract Strategy {
    function afterInitialize(uint256, uint256) external pure returns (uint256, uint256) {
        return (30 * 1e14, 30 * 1e14);
    }

    function afterSwap((bool,uint256,uint256,uint256,uint256,uint256) calldata)
        external
        pure
        returns (uint256, uint256)
    {
        return (30 * 1e14, 30 * 1e14);
    }
}
`

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
  library,
  compileResult,
  onSelectStrategy,
  onCompileCustom,
  onSaveCustom,
  onDeleteCustom,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isLabOpen, setIsLabOpen] = useState(true)
  const [draftId, setDraftId] = useState<string | undefined>(undefined)
  const [draftName, setDraftName] = useState('My Strategy')
  const [draftSource, setDraftSource] = useState(DEFAULT_SOURCE)

  const lineSet = useMemo(() => new Set(highlightedLines), [highlightedLines])
  const lines = useMemo(() => code.replace(/\t/g, '    ').split('\n'), [code])

  const builtinOptions = availableStrategies.filter((item) => item.kind === 'builtin')
  const customOptions = availableStrategies.filter((item) => item.kind === 'custom')

  const selectedCustom = useMemo(
    () =>
      selectedStrategy.kind === 'custom'
        ? library.find((item) => item.id === selectedStrategy.id) || null
        : null,
    [library, selectedStrategy],
  )

  useEffect(() => {
    if (!containerRef.current || highlightedLines.length === 0) return

    const firstLine = highlightedLines[0]
    const target = containerRef.current.querySelector<HTMLDivElement>(`.code-line[data-line='${firstLine}']`)
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightedLines])

  useEffect(() => {
    if (selectedCustom) {
      setDraftId(selectedCustom.id)
      setDraftName(selectedCustom.name)
      setDraftSource(selectedCustom.source)
      setIsLabOpen(true)
      return
    }

    if (!draftId && library.length > 0) {
      const recent = library[0]
      setDraftId(recent.id)
      setDraftName(recent.name)
      setDraftSource(recent.source)
    }
  }, [draftId, library, selectedCustom])

  return (
    <section className="code-panel reveal delay-1">
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
            <button type="button" className="small-control" onClick={() => setIsLabOpen((prev) => !prev)}>
              {isLabOpen ? 'Hide Lab' : 'Open Lab'}
            </button>
          </div>
        </label>
      </div>

      {diagnostics.length > 0 ? (
        <div className="inline-diagnostics" role="status" aria-live="polite">
          {diagnostics.slice(0, 2).map((diagnostic, index) => (
            <p key={`${diagnostic.message}-${index}`} className={diagnostic.severity === 'error' ? 'diagnostic-error' : 'diagnostic-warning'}>
              {diagnostic.severity.toUpperCase()}
              {diagnostic.line ? ` L${diagnostic.line}` : ''}: {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}

      <div ref={containerRef} id="codeView" className="code-view" aria-label="Strategy code">
        {lines.map((line, index) => {
          const lineNumber = index + 1
          const active = lineSet.has(lineNumber)
          return (
            <div key={lineNumber} className={`code-line${active ? ' active' : ''}`} data-line={lineNumber}>
              <span className="line-no">{String(lineNumber).padStart(2, '0')}</span>
              <span className="line-text">{line || '\u00a0'}</span>
              {active ? (
                <div className="line-explain-popover" role="note">
                  <span className="line-explain-label">What This Line Did</span>
                  <span>{codeExplanation}</span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <section className={`strategy-lab ${isLabOpen ? 'open' : 'closed'}`}>
        <div className="strategy-lab-head">
          <h3>Custom Strategy Lab</h3>
          <span>{library.length} saved</span>
        </div>

        {isLabOpen ? (
          <div className="strategy-lab-body">
            <label className="editor-field" htmlFor="strategyNameInput">
              <span>Name</span>
              <input
                id="strategyNameInput"
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="My Strategy"
              />
            </label>

            <label className="editor-field" htmlFor="strategySourceInput">
              <span>Solidity Source (contract Strategy)</span>
              <textarea
                id="strategySourceInput"
                value={draftSource}
                onChange={(event) => setDraftSource(event.target.value)}
                spellCheck={false}
                rows={8}
              />
            </label>

            <div className="editor-actions">
              <button type="button" onClick={() => onCompileCustom(draftSource, draftName)}>
                Compile
              </button>
              <button type="button" onClick={() => onSaveCustom({ id: draftId, name: draftName, source: draftSource })}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftId(undefined)
                  setDraftName('My Strategy')
                  setDraftSource(DEFAULT_SOURCE)
                }}
              >
                New Draft
              </button>
            </div>

            {compileResult ? (
              <div className={`compile-status ${compileResult.ok ? 'ok' : 'error'}`}>
                <strong>{compileResult.ok ? 'Compile succeeded' : 'Compile failed'}</strong>
                {compileResult.diagnostics.length > 0 ? (
                  <ul>
                    {compileResult.diagnostics.slice(0, 4).map((diagnostic, index) => (
                      <li key={`${diagnostic.message}-${index}`}>
                        {diagnostic.severity.toUpperCase()}
                        {diagnostic.line ? ` L${diagnostic.line}` : ''}: {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="library-list">
              {library.length === 0 ? <p>No saved custom strategies yet.</p> : null}
              {library.map((item) => (
                <article key={item.id} className="library-item">
                  <header>
                    <strong>{item.name}</strong>
                    <span>{new Date(item.updatedAt).toLocaleString()}</span>
                  </header>
                  <div className="library-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftId(item.id)
                        setDraftName(item.name)
                        setDraftSource(item.source)
                      }}
                    >
                      Load
                    </button>
                    <button type="button" onClick={() => onSelectStrategy({ kind: 'custom', id: item.id })}>
                      Run
                    </button>
                    <button type="button" onClick={() => onDeleteCustom(item.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}

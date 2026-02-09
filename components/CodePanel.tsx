'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-solidity'
import { BUILTIN_STRATEGIES } from '../lib/strategies/builtins'
import type { CompilerDiagnostic, CustomCompileResult, StrategyLibraryItem, StrategyRef } from '../lib/sim/types'
import type { CompileStatus } from '../workers/messages'

interface CodePanelProps {
  availableStrategies: Array<{ kind: 'builtin' | 'custom'; id: string; name: string }>
  selectedStrategy: StrategyRef
  code: string
  highlightedLines: number[]
  codeExplanation: string
  diagnostics: CompilerDiagnostic[]
  library: StrategyLibraryItem[]
  compileResult: CustomCompileResult | null
  compileStatus: CompileStatus
  showExplanationOverlay: boolean
  onSelectStrategy: (strategy: StrategyRef) => void
  onToggleExplanationOverlay: () => void
  onCompileAndActivateCustom: (payload: { id?: string; name: string; source: string }) => void
}

type StrategyTab = 'builtin' | 'custom'

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
  diagnostics,
  library,
  compileResult,
  compileStatus,
  showExplanationOverlay,
  onSelectStrategy,
  onToggleExplanationOverlay,
  onCompileAndActivateCustom,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeTab, setActiveTab] = useState<StrategyTab>('builtin')
  const [draftId, setDraftId] = useState<string | undefined>(undefined)
  const [draftName, setDraftName] = useState('My Strategy')
  const [draftSource, setDraftSource] = useState(DEFAULT_SOURCE)

  const lineSet = useMemo(() => new Set(highlightedLines), [highlightedLines])
  const firstHighlightedLine = highlightedLines[0] ?? null
  const lines = useMemo(() => code.replace(/\t/g, '    ').split('\n'), [code])
  const highlightedBuiltinLines = useMemo(
    () => lines.map((line) => Prism.highlight(line || ' ', Prism.languages.solidity, 'solidity')),
    [lines],
  )

  const builtinOptions = useMemo(() => availableStrategies.filter((item) => item.kind === 'builtin'), [availableStrategies])
  const customOptions = useMemo(() => availableStrategies.filter((item) => item.kind === 'custom'), [availableStrategies])

  const selectedAvailableValue = useMemo(() => {
    const encoded = encodeStrategyRef(selectedStrategy)
    if (availableStrategies.some((item) => `${item.kind}:${item.id}` === encoded)) {
      return encoded
    }

    const fallback = builtinOptions[0]
    return fallback ? `${fallback.kind}:${fallback.id}` : ''
  }, [availableStrategies, builtinOptions, selectedStrategy])

  const compileButtonLabel =
    compileStatus.phase === 'loading_runtime'
      ? 'Loading Solc Runtime'
      : compileStatus.phase === 'compiling'
        ? 'Compiling Strategy'
        : compileStatus.phase === 'completed'
          ? 'Compile Complete'
          : compileStatus.phase === 'error'
            ? 'Compile Failed'
            : 'Compile & Save'
  const compileBusy = compileStatus.phase === 'loading_runtime' || compileStatus.phase === 'compiling'

  useEffect(() => {
    if (!containerRef.current || firstHighlightedLine === null) return

    const target = containerRef.current.querySelector<HTMLDivElement>(`.code-line[data-line='${firstHighlightedLine}']`)
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [firstHighlightedLine])

  useEffect(() => {
    if (selectedStrategy.kind !== 'custom') return
    const currentCustom = library.find((item) => item.id === selectedStrategy.id)
    if (!currentCustom) return

    setDraftId(currentCustom.id)
    setDraftName(currentCustom.name)
    setDraftSource(currentCustom.source)
  }, [library, selectedStrategy.id, selectedStrategy.kind])

  return (
    <section className={`code-panel ${activeTab === 'custom' ? 'code-panel-custom' : 'code-panel-builtin'} reveal delay-1`}>
      <div className="panel-head">
        <div className="panel-head-stack">
          <div className="panel-head-row">
            <h2>Strategy</h2>
          </div>

          <div className="strategy-tabs" role="tablist" aria-label="Strategy modes">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'builtin'}
              className={`strategy-tab ${activeTab === 'builtin' ? 'active' : ''}`}
              onClick={() => setActiveTab('builtin')}
            >
              Current Strategy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'custom'}
              className={`strategy-tab ${activeTab === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              Add New Strategy
            </button>
          </div>

          {activeTab === 'builtin' ? (
            <div className="strategy-picker strategy-picker-wide">
              <select
                id="availableStrategySelect"
                value={selectedAvailableValue}
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
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === 'builtin' && diagnostics.length > 0 ? (
        <div className="inline-diagnostics" role="status" aria-live="polite">
          {diagnostics.slice(0, 2).map((diagnostic, index) => (
            <p key={`${diagnostic.message}-${index}`} className={diagnostic.severity === 'error' ? 'diagnostic-error' : 'diagnostic-warning'}>
              {diagnostic.severity.toUpperCase()}
              {diagnostic.line ? ` L${diagnostic.line}` : ''}: {diagnostic.message}
            </p>
          ))}
        </div>
      ) : null}

      {activeTab === 'builtin' ? (
        <div ref={containerRef} id="codeView" className="code-view" aria-label="Strategy code">
          {lines.map((line, index) => {
            const lineNumber = index + 1
            const active = lineSet.has(lineNumber)

            return (
              <div key={lineNumber} className={`code-line${active ? ' active' : ''}`} data-line={lineNumber}>
                <span className="line-no">{String(lineNumber).padStart(2, '0')}</span>
                <span className="line-text" dangerouslySetInnerHTML={{ __html: highlightedBuiltinLines[index] }} />
              </div>
            )
          })}
        </div>
      ) : null}

      {activeTab === 'builtin' ? (
        <section className={`code-explain-section ${showExplanationOverlay ? 'expanded' : 'collapsed'}`} role="note" aria-live="polite">
          <button
            type="button"
            className="code-explain-toggle"
            onClick={onToggleExplanationOverlay}
            aria-expanded={showExplanationOverlay}
            aria-controls="codeExplanationBody"
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
          <p id="codeExplanationBody" hidden={!showExplanationOverlay}>
            {codeExplanation || 'Step or play to see the current strategy decision.'}
          </p>
        </section>
      ) : null}

      <section className={`strategy-lab ${activeTab === 'custom' ? 'open' : 'closed'}`}>
        <div className="strategy-lab-head">
          <h3>Custom Strategy Editor</h3>
          <span>{library.length} saved</span>
        </div>

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

          <label className="editor-field editor-field-source" htmlFor="strategySourceInput">
            <span>Solidity Source (contract Strategy)</span>
            <small className="editor-helper-note">
              See{' '}
              <a href="https://ammchallenge.com" target="_blank" rel="noopener noreferrer">
                ammchallenge.com
              </a>{' '}
              for strategy contract criteria.
            </small>
            <Editor
              id="strategySourceInput"
              value={draftSource}
              onValueChange={(value) => setDraftSource(value)}
              highlight={(input) => Prism.highlight(input, Prism.languages.solidity, 'solidity')}
              padding={12}
              textareaId="strategySourceInput"
              className="solidity-editor"
              textareaClassName="solidity-editor-textarea"
              preClassName="solidity-editor-pre"
              spellCheck={false}
            />
          </label>

          <div className="editor-actions">
            <button
              type="button"
              className={`compile-action-btn phase-${compileStatus.phase}`}
              onClick={() => {
                const cleanedName = draftName.trim() || 'Custom Strategy'
                onCompileAndActivateCustom({ id: draftId, name: cleanedName, source: draftSource })
              }}
              disabled={draftSource.trim().length === 0 || compileBusy}
            >
              <span className="compile-action-content">
                <CompilePhaseIcon phase={compileStatus.phase} />
                <span>{compileButtonLabel}</span>
              </span>
            </button>
          </div>

          {compileResult ? (
            <div className={`compile-status ${compileResult.ok ? 'ok' : 'error'}`}>
              <strong>{compileResult.ok ? 'Compiled and added to Available strategies.' : 'Compile failed'}</strong>
              {compileResult.ok ? (
                <div className="compile-status-actions">
                  <button
                    type="button"
                    className="small-control"
                    onClick={() => {
                      onSelectStrategy({
                        kind: 'custom',
                        id: compileResult.strategyId,
                      })
                      setActiveTab('builtin')
                    }}
                  >
                    Use strategy
                  </button>
                </div>
              ) : null}
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
        </div>
      </section>
    </section>
  )
}

function CompilePhaseIcon({ phase }: { phase: CompileStatus['phase'] }) {
  if (phase === 'completed') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="compile-status-icon">
        <path d="M3 8.2 6.2 11.4 13 4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (phase === 'error') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="compile-status-icon">
        <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (phase === 'loading_runtime') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="compile-status-icon">
        <path d="M3.5 11.5h9M8 2.5v6.2M5.5 6.9 8 9.4l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (phase === 'compiling') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="compile-status-icon spin">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.25" />
        <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="compile-status-icon">
      <path d="M4 3h8v10H4z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 6h4M6 8h4M6 10h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

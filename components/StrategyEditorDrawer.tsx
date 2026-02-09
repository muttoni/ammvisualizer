'use client'

import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_STRATEGIES } from '../lib/strategies/builtins'
import type { CustomCompileResult, StrategyLibraryItem, StrategyRef } from '../lib/sim/types'

interface StrategyEditorDrawerProps {
  isOpen: boolean
  compileResult: CustomCompileResult | null
  library: StrategyLibraryItem[]
  selectedStrategyRef: StrategyRef
  onClose: () => void
  onCompile: (source: string, nameHint?: string) => void
  onSave: (payload: { id?: string; name: string; source: string }) => void
  onDelete: (id: string) => void
  onSelectStrategy: (ref: StrategyRef) => void
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

export function StrategyEditorDrawer({
  isOpen,
  compileResult,
  library,
  selectedStrategyRef,
  onClose,
  onCompile,
  onSave,
  onDelete,
  onSelectStrategy,
}: StrategyEditorDrawerProps) {
  const [draftId, setDraftId] = useState<string | undefined>(undefined)
  const [name, setName] = useState('My Strategy')
  const [source, setSource] = useState(DEFAULT_SOURCE)

  const selectedCustom = useMemo(
    () =>
      selectedStrategyRef.kind === 'custom'
        ? library.find((item) => item.id === selectedStrategyRef.id) || null
        : null,
    [library, selectedStrategyRef],
  )

  useEffect(() => {
    if (!isOpen) return

    if (selectedCustom) {
      setDraftId(selectedCustom.id)
      setName(selectedCustom.name)
      setSource(selectedCustom.source)
      return
    }

    if (!draftId && library.length > 0) {
      const recent = library[0]
      setDraftId(recent.id)
      setName(recent.name)
      setSource(recent.source)
    }
  }, [draftId, isOpen, library, selectedCustom])

  if (!isOpen) return null

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Custom strategy editor">
      <div className="editor-drawer">
        <div className="editor-head">
          <h3>Custom Solidity Strategies</h3>
          <button type="button" className="small-control" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="editor-body">
          <label className="editor-field" htmlFor="strategyNameInput">
            <span>Name</span>
            <input
              id="strategyNameInput"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Strategy"
            />
          </label>

          <label className="editor-field" htmlFor="strategySourceInput">
            <span>Solidity Source (contract Strategy)</span>
            <textarea
              id="strategySourceInput"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              rows={16}
            />
          </label>

          <div className="editor-actions">
            <button type="button" onClick={() => onCompile(source, name)}>
              Compile
            </button>
            <button type="button" onClick={() => onSave({ id: draftId, name, source })}>
              Save
            </button>
          </div>

          {compileResult ? (
            <div className={`compile-status ${compileResult.ok ? 'ok' : 'error'}`}>
              <strong>{compileResult.ok ? 'Compile succeeded' : 'Compile failed'}</strong>
              {compileResult.diagnostics.length > 0 ? (
                <ul>
                  {compileResult.diagnostics.slice(0, 6).map((diagnostic, index) => (
                    <li key={`${diagnostic.message}-${index}`}>
                      {diagnostic.severity.toUpperCase()}
                      {diagnostic.line ? ` L${diagnostic.line}` : ''}: {diagnostic.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="library-section">
            <h4>Saved Strategies</h4>
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
                        setName(item.name)
                        setSource(item.source)
                      }}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStrategy({ kind: 'custom', id: item.id })
                        onClose()
                      }}
                    >
                      Run
                    </button>
                    <button type="button" onClick={() => onDelete(item.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

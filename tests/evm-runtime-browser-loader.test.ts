import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const SOLJSON_PATH = require.resolve('solc/soljson.js')

const VALID_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AMMStrategyBase} from "./AMMStrategyBase.sol";
import {TradeInfo} from "./IAMMStrategy.sol";

contract Strategy is AMMStrategyBase {
    function afterInitialize(uint256, uint256)
        external
        override
        returns (uint256, uint256)
    {
        return (bpsToWad(30), bpsToWad(30));
    }

    function afterSwap(TradeInfo calldata)
        external
        override
        returns (uint256, uint256)
    {
        return (bpsToWad(30), bpsToWad(30));
    }

    function getName() external pure override returns (string memory) {
        return "BrowserStrategy";
    }
}
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe('browser-style soljson bootstrap', () => {
  it('compiles when running without node process globals', async () => {
    vi.resetModules()

    const soljsonSource = await readFile(SOLJSON_PATH, 'utf8')
    const originalProcess = (globalThis as unknown as { process?: unknown }).process
    const originalFetch = globalThis.fetch
    const originalSelf = (globalThis as unknown as { self?: unknown }).self

    try {
      Object.defineProperty(globalThis, 'process', {
        configurable: true,
        writable: true,
        value: undefined,
      })

      Object.defineProperty(globalThis, 'self', {
        configurable: true,
        writable: true,
        value: globalThis,
      })

      globalThis.fetch = vi.fn(async () => new Response(soljsonSource, { status: 200 })) as typeof fetch

      const runtime = await import('../workers/evm/runtime')
      const compiled = await runtime.compileCustomStrategySource(VALID_SOURCE, 'Browser Strategy')

      expect(compiled.runtimeBytecode.length).toBeGreaterThan(10)
      expect(globalThis.fetch).toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, 'process', {
        configurable: true,
        writable: true,
        value: originalProcess,
      })

      Object.defineProperty(globalThis, 'self', {
        configurable: true,
        writable: true,
        value: originalSelf,
      })

      globalThis.fetch = originalFetch
    }
  })
})

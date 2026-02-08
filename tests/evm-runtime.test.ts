import { describe, expect, it } from 'vitest'
import { CompileError, compileCustomStrategySource, createCustomStrategyRuntime } from '../workers/evm/runtime'

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
        slots[0] = bpsToWad(30);
        return (slots[0], slots[0]);
    }

    function afterSwap(TradeInfo calldata trade)
        external
        override
        returns (uint256, uint256)
    {
        uint256 fee = slots[0];
        if (trade.amountY > trade.reserveY / 20) {
            fee = clampFee(fee + 5 * BPS);
        }
        slots[0] = fee;
        return (fee, fee);
    }

    function getName() external pure override returns (string memory) {
        return "Custom";
    }
}
`

describe('custom strategy compile/runtime', () => {
  it('compiles and executes callbacks in EVM runtime', async () => {
    const compiled = await compileCustomStrategySource(VALID_SOURCE, 'My Custom')

    expect(compiled.runtimeBytecode.length).toBeGreaterThan(10)
    expect(compiled.afterSwapLine).toBeGreaterThan(0)

    const runtime = await createCustomStrategyRuntime(compiled)

    const init = await runtime.initialize(100, 10_000)
    expect(init.bidBps).toBe(30)
    expect(init.askBps).toBe(30)
    expect(init.changedSlots.some((change) => change.slot === 0)).toBe(true)

    const swap = await runtime.onSwap({
      isBuy: false,
      amountX: 1,
      amountY: 700,
      timestamp: 1,
      reserveX: 100,
      reserveY: 10_000,
      flowType: 'retail',
      orderSide: 'buy',
      fairPrice: 100,
      edgeDelta: 0,
    })

    expect(swap.bidBps).toBeGreaterThanOrEqual(30)
    expect(swap.askBps).toBeGreaterThanOrEqual(30)
    expect(swap.changedSlots.length).toBeGreaterThan(0)
  })

  it('returns diagnostics for invalid code', async () => {
    const invalid = `pragma solidity ^0.8.24; contract NotStrategy {}`

    await expect(compileCustomStrategySource(invalid)).rejects.toThrowError(CompileError)
  })
})

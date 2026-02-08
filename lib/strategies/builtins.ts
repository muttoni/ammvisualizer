import type { BuiltinStrategy, StrategyCallbackContext, StrategyCallbackResult } from '../sim/types'
import { clampBps, formatPct } from '../sim/utils'

function fixedStrategyResult(bps: number, line: number, msg: string): StrategyCallbackResult {
  return {
    bidBps: bps,
    askBps: bps,
    lines: [line],
    explanation: msg,
    stateBadge: `fixed fee: ${bps}/${bps} bps`,
  }
}

export const BUILTIN_STRATEGIES: BuiltinStrategy[] = [
  {
    id: 'baseline30',
    name: 'Baseline 30 bps',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AMMStrategyBase} from "./AMMStrategyBase.sol";
import {TradeInfo} from "./IAMMStrategy.sol";

contract Strategy is AMMStrategyBase {
    function afterInitialize(uint256, uint256)
        external pure override returns (uint256 bidFee, uint256 askFee)
    {
        return (bpsToWad(30), bpsToWad(30));
    }

    function afterSwap(TradeInfo calldata)
        external pure override returns (uint256 bidFee, uint256 askFee)
    {
        return (bpsToWad(30), bpsToWad(30));
    }

    function getName() external pure override returns (string memory) {
        return "Baseline-30bps";
    }
}`,
    initialize() {
      return fixedStrategyResult(30, 11, '`afterInitialize` returns 30 bps on both sides. No persistent state is used.')
    },
    onSwap() {
      return fixedStrategyResult(30, 17, '`afterSwap` ignores trade details and keeps the fee fixed at 30 bps.')
    },
  },
  {
    id: 'starter50',
    name: 'Starter 50 bps',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AMMStrategyBase} from "./AMMStrategyBase.sol";
import {IAMMStrategy, TradeInfo} from "./IAMMStrategy.sol";

contract Strategy is AMMStrategyBase {
    uint256 public constant FEE = 50 * BPS;

    function afterInitialize(uint256, uint256)
        external pure override returns (uint256, uint256)
    {
        return (FEE, FEE);
    }

    function afterSwap(TradeInfo calldata)
        external pure override returns (uint256, uint256)
    {
        return (FEE, FEE);
    }

    function getName() external pure override returns (string memory) {
        return "StarterStrategy";
    }
}`,
    initialize() {
      return fixedStrategyResult(50, 13, '`afterInitialize` starts wider than baseline: 50 bps bid and 50 bps ask.')
    },
    onSwap() {
      return fixedStrategyResult(50, 19, '`afterSwap` returns the same constant `FEE`, so each trade keeps 50 bps.')
    },
  },
  {
    id: 'widenBigTrades',
    name: 'Widen After Big Trades',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AMMStrategyBase} from "./AMMStrategyBase.sol";
import {TradeInfo} from "./IAMMStrategy.sol";

contract Strategy is AMMStrategyBase {
    uint256 public constant BASE = 30 * BPS;

    function afterInitialize(uint256, uint256)
        external override returns (uint256, uint256)
    {
        slots[0] = BASE;
        return (BASE, BASE);
    }

    function afterSwap(TradeInfo calldata trade)
        external override returns (uint256, uint256)
    {
        uint256 fee = slots[0];
        uint256 tradeRatio = wdiv(trade.amountY, trade.reserveY);

        if (tradeRatio > WAD / 20) {
            fee = clampFee(fee + 10 * BPS);
        } else if (fee > BASE) {
            fee = fee - 1 * BPS;
        }

        slots[0] = fee;
        return (fee, fee);
    }

    function getName() external pure override returns (string memory) {
        return "Widen After Big Trades";
    }
}`,
    initialize(memory) {
      memory.feeBps = 30
      return {
        bidBps: 30,
        askBps: 30,
        lines: [12, 13],
        explanation: '`afterInitialize` stores the base fee in `slots[0]` and starts at 30 bps.',
        stateBadge: 'slot[0] fee: 30 bps',
      }
    },
    onSwap(memory: Record<string, number>, ctx: StrategyCallbackContext) {
      const base = 30
      const current = Number.isFinite(memory.feeBps) ? memory.feeBps : base
      const tradeRatio = ctx.amountY / Math.max(ctx.reserveY, 1e-9)
      let next = current
      let lines: number[] = [29, 30]
      let explanation = 'No fee change.'

      if (tradeRatio > 0.05) {
        next = clampBps(current + 10)
        lines = [22, 23, 29, 30]
        explanation = `Large trade branch fired: amountY / reserveY = ${formatPct(tradeRatio)} (> 5%), so fee widens by +10 bps to ${next} bps.`
      } else if (current > base) {
        next = clampBps(current - 1)
        lines = [24, 25, 29, 30]
        explanation = `Decay branch fired: trade size ratio is ${formatPct(tradeRatio)}, so fee decays from ${current} to ${next} bps toward the 30 bps base.`
      } else {
        lines = [24, 29, 30]
        explanation = `Trade size ratio is ${formatPct(tradeRatio)} and fee is already at base, so the code keeps 30 bps.`
      }

      memory.feeBps = next
      return {
        bidBps: next,
        askBps: next,
        lines,
        explanation,
        stateBadge: `slot[0] fee: ${next} bps | tradeRatio: ${formatPct(tradeRatio)}`,
      }
    },
  },
]

export function getBuiltinStrategyById(id: string): BuiltinStrategy | undefined {
  return BUILTIN_STRATEGIES.find((strategy) => strategy.id === id)
}

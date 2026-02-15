import { ceilDiv, clampU64, ensureStorageSize, saturatingSub } from '../prop-sim/nano'
import type { PropAfterSwapInstruction, PropStrategyRef, PropStrategyRuntime, PropSwapInstruction } from '../prop-sim/types'
import { STARTER_CODE_LINES, STARTER_STRATEGY_SOURCE } from './starterSource'

interface PropBuiltinStrategy {
  id: string
  name: string
  modelUsed: string
  code: string
  computeSwap: (instruction: PropSwapInstruction) => bigint
  afterSwap: (instruction: PropAfterSwapInstruction) => Uint8Array<ArrayBufferLike> | void
}

const STARTER_FEE_NUMERATOR = 950n
const STARTER_FEE_DENOMINATOR = 1000n

function starterComputeSwap(instruction: PropSwapInstruction): bigint {
  const reserveX = clampU64(instruction.reserveXNano)
  const reserveY = clampU64(instruction.reserveYNano)
  const inputAmount = clampU64(instruction.inputAmountNano)

  if (reserveX === 0n || reserveY === 0n) {
    return 0n
  }

  const k = reserveX * reserveY

  if (instruction.side === 0) {
    const netY = (inputAmount * STARTER_FEE_NUMERATOR) / STARTER_FEE_DENOMINATOR
    const newReserveY = reserveY + netY
    const kDiv = ceilDiv(k, newReserveY)
    return saturatingSub(reserveX, kDiv)
  }

  if (instruction.side === 1) {
    const netX = (inputAmount * STARTER_FEE_NUMERATOR) / STARTER_FEE_DENOMINATOR
    const newReserveX = reserveX + netX
    const kDiv = ceilDiv(k, newReserveX)
    return saturatingSub(reserveY, kDiv)
  }

  return 0n
}

function starterAfterSwap(instruction: PropAfterSwapInstruction): Uint8Array<ArrayBufferLike> {
  return ensureStorageSize(instruction.storage)
}

const BUILTIN_STRATEGIES: PropBuiltinStrategy[] = [
  {
    id: 'starter',
    name: 'Starter (500 bps)',
    modelUsed: 'GPT-5.3-Codex',
    code: STARTER_STRATEGY_SOURCE,
    computeSwap: starterComputeSwap,
    afterSwap: starterAfterSwap,
  },
]

export const PROP_BUILTIN_STRATEGIES = BUILTIN_STRATEGIES.map((strategy) => ({
  kind: 'builtin' as const,
  id: strategy.id,
  name: strategy.name,
}))

export function getPropBuiltinStrategy(ref: PropStrategyRef): PropStrategyRuntime {
  const strategy = BUILTIN_STRATEGIES.find((item) => item.id === ref.id)
  if (!strategy) {
    throw new Error(`Builtin strategy '${ref.id}' not found.`)
  }

  return {
    ref,
    name: strategy.name,
    code: strategy.code,
    modelUsed: strategy.modelUsed,
    computeSwap: strategy.computeSwap,
    afterSwap: strategy.afterSwap,
  }
}

export function getStarterCodeLines(side: 0 | 1): number[] {
  return side === 0 ? STARTER_CODE_LINES.buyBranch : STARTER_CODE_LINES.sellBranch
}

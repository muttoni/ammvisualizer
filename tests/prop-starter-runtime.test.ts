import { describe, expect, it } from 'vitest'
import { ceilDiv, saturatingSub } from '../lib/prop-sim/nano'
import { getPropBuiltinStrategy } from '../lib/prop-strategies/builtins'
import type { PropSwapInstruction } from '../lib/prop-sim/types'

function expectedStarterSwap(side: 0 | 1, input: bigint, reserveX: bigint, reserveY: bigint): bigint {
  if (reserveX === 0n || reserveY === 0n) {
    return 0n
  }

  const k = reserveX * reserveY

  if (side === 0) {
    const netY = (input * 950n) / 1000n
    const newReserveY = reserveY + netY
    return saturatingSub(reserveX, ceilDiv(k, newReserveY))
  }

  const netX = (input * 950n) / 1000n
  const newReserveX = reserveX + netX
  return saturatingSub(reserveY, ceilDiv(k, newReserveX))
}

describe('starter builtin strategy runtime', () => {
  const runtime = getPropBuiltinStrategy({ kind: 'builtin', id: 'starter' })

  it('matches starter buy-side compute_swap behavior', () => {
    const instruction: PropSwapInstruction = {
      side: 0,
      inputAmountNano: 10_000_000_000n,
      reserveXNano: 100_000_000_000n,
      reserveYNano: 10_000_000_000_000n,
      storage: new Uint8Array(1024),
    }

    const actual = runtime.computeSwap(instruction)
    const expected = expectedStarterSwap(0, instruction.inputAmountNano, instruction.reserveXNano, instruction.reserveYNano)
    expect(actual).toBe(expected)
  })

  it('matches starter sell-side compute_swap behavior', () => {
    const instruction: PropSwapInstruction = {
      side: 1,
      inputAmountNano: 2_500_000_000n,
      reserveXNano: 100_000_000_000n,
      reserveYNano: 10_000_000_000_000n,
      storage: new Uint8Array(1024),
    }

    const actual = runtime.computeSwap(instruction)
    const expected = expectedStarterSwap(1, instruction.inputAmountNano, instruction.reserveXNano, instruction.reserveYNano)
    expect(actual).toBe(expected)
  })

  it('keeps storage unchanged in afterSwap (starter no-op)', () => {
    const storage = new Uint8Array(1024)
    storage[0] = 45
    storage[12] = 200

    const next = runtime.afterSwap({
      side: 0,
      inputAmountNano: 1n,
      outputAmountNano: 1n,
      reserveXNano: 1n,
      reserveYNano: 1n,
      step: 1,
      storage,
    })

    const output = next ?? storage
    expect(output[0]).toBe(45)
    expect(output[12]).toBe(200)
  })
})

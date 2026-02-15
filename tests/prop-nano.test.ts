import { describe, expect, it } from 'vitest'
import { PROP_U64_MAX } from '../lib/prop-sim/constants'
import { ceilDiv, encodeU16Le, fromNano, readU16Le, saturatingSub, toNano } from '../lib/prop-sim/nano'

describe('prop nano helpers', () => {
  it('converts f64 values to nano with floor semantics', () => {
    expect(toNano(1)).toBe(1_000_000_000n)
    expect(toNano(1.2345678919)).toBe(1_234_567_891n)
    expect(toNano(0)).toBe(0n)
    expect(toNano(-5)).toBe(0n)
    expect(toNano(Number.NaN)).toBe(0n)
    expect(toNano(Number.POSITIVE_INFINITY)).toBe(PROP_U64_MAX)
  })

  it('converts nano back to f64', () => {
    expect(fromNano(1_000_000_000n)).toBeCloseTo(1, 9)
    expect(fromNano(123_456_789n)).toBeCloseTo(0.123456789, 12)
  })

  it('supports ceil division and saturating subtraction', () => {
    expect(ceilDiv(10n, 3n)).toBe(4n)
    expect(ceilDiv(9n, 3n)).toBe(3n)
    expect(saturatingSub(10n, 5n)).toBe(5n)
    expect(saturatingSub(5n, 10n)).toBe(0n)
  })

  it('encodes and decodes u16 little-endian values for storage', () => {
    const encoded = encodeU16Le(80)
    expect(encoded.length).toBe(2)

    const storage = new Uint8Array(1024)
    storage.set(encoded, 0)
    expect(readU16Le(storage, 0)).toBe(80)
  })
})

import { PROP_NANO_SCALE, PROP_NANO_SCALE_F64, PROP_STORAGE_SIZE, PROP_U64_MAX } from './constants'

export function clampU64(value: bigint): bigint {
  if (value <= 0n) return 0n
  if (value >= PROP_U64_MAX) return PROP_U64_MAX
  return value
}

export function toNano(value: number): bigint {
  if (Number.isNaN(value) || value <= 0) {
    return 0n
  }

  if (!Number.isFinite(value)) {
    return PROP_U64_MAX
  }

  const scaled = value * PROP_NANO_SCALE_F64
  if (scaled >= Number(PROP_U64_MAX)) {
    return PROP_U64_MAX
  }

  return BigInt(Math.floor(scaled))
}

export function fromNano(value: bigint): number {
  return Number(clampU64(value)) / PROP_NANO_SCALE_F64
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    return 0n
  }

  return (numerator + denominator - 1n) / denominator
}

export function saturatingSub(a: bigint, b: bigint): bigint {
  return a > b ? a - b : 0n
}

export function encodeU16Le(value: number): Uint8Array {
  const normalized = Math.max(0, Math.min(0xffff, Math.trunc(value)))
  return new Uint8Array([normalized & 0xff, (normalized >>> 8) & 0xff])
}

export function readU16Le(storage: Uint8Array, offset = 0): number {
  if (offset < 0 || offset + 1 >= storage.length) {
    return 0
  }

  return storage[offset] | (storage[offset + 1] << 8)
}

export function ensureStorageSize(storage: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  if (storage.length === PROP_STORAGE_SIZE) {
    return storage
  }

  const next = new Uint8Array(PROP_STORAGE_SIZE)
  next.set(storage.subarray(0, PROP_STORAGE_SIZE))
  return next
}

export function bigintToString(value: bigint): string {
  return clampU64(value).toString()
}

export function stringToBigint(value: string): bigint {
  try {
    return clampU64(BigInt(value))
  } catch {
    return 0n
  }
}

export { PROP_NANO_SCALE }

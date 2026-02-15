import {
  PROP_INITIAL_RESERVE_X,
  PROP_INITIAL_RESERVE_Y,
  PROP_MIN_INPUT,
  PROP_NORMALIZER_FEE_MIN,
  PROP_STORAGE_SIZE,
} from './constants'
import {
  ceilDiv,
  clampU64,
  encodeU16Le,
  ensureStorageSize,
  fromNano,
  readU16Le,
  saturatingSub,
  toNano,
} from './nano'
import type { PropAmmState, PropPool, PropSwapSide, PropTrade } from './types'

export function createAmm(
  pool: PropPool,
  reserveX: number,
  reserveY: number,
  storage?: Uint8Array,
): PropAmmState {
  return {
    pool,
    name: pool === 'submission' ? 'Submission' : 'Normalizer',
    reserveX,
    reserveY,
    storage: storage ? ensureStorageSize(storage) : new Uint8Array(PROP_STORAGE_SIZE),
  }
}

export function createInitialSubmissionAmm(): PropAmmState {
  return createAmm('submission', PROP_INITIAL_RESERVE_X, PROP_INITIAL_RESERVE_Y)
}

export function createInitialNormalizerAmm(liquidityMultiplier: number, feeBps: number): PropAmmState {
  const reserveX = PROP_INITIAL_RESERVE_X * liquidityMultiplier
  const reserveY = PROP_INITIAL_RESERVE_Y * liquidityMultiplier
  const storage = new Uint8Array(PROP_STORAGE_SIZE)
  storage.set(encodeU16Le(feeBps), 0)
  return createAmm('normalizer', reserveX, reserveY, storage)
}

export function ammSpot(amm: PropAmmState): number {
  if (!Number.isFinite(amm.reserveX) || !Number.isFinite(amm.reserveY) || amm.reserveX <= 0) {
    return Number.NaN
  }
  return amm.reserveY / amm.reserveX
}

export function ammK(amm: PropAmmState): number {
  return amm.reserveX * amm.reserveY
}

export function normalizerFeeBps(amm: PropAmmState): number {
  const raw = readU16Le(amm.storage, 0)
  return raw === 0 ? PROP_NORMALIZER_FEE_MIN : raw
}

export function quoteNormalizer(amm: PropAmmState, side: PropSwapSide, inputAmount: number): number {
  if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
    return 0
  }

  if (amm.reserveX <= 0 || amm.reserveY <= 0 || !Number.isFinite(amm.reserveX) || !Number.isFinite(amm.reserveY)) {
    return 0
  }

  const feeBps = normalizerFeeBps(amm)
  const gammaNumerator = BigInt(Math.max(0, 10_000 - feeBps))

  const inputNano = toNano(inputAmount)
  const reserveXNano = toNano(amm.reserveX)
  const reserveYNano = toNano(amm.reserveY)

  if (inputNano <= 0n || reserveXNano <= 0n || reserveYNano <= 0n) {
    return 0
  }

  const k = reserveXNano * reserveYNano

  if (side === 0) {
    const netIn = (inputNano * gammaNumerator) / 10_000n
    const newReserveY = reserveYNano + netIn
    const kDiv = ceilDiv(k, newReserveY)
    const out = saturatingSub(reserveXNano, kDiv)
    return fromNano(out)
  }

  const netIn = (inputNano * gammaNumerator) / 10_000n
  const newReserveX = reserveXNano + netIn
  const kDiv = ceilDiv(k, newReserveX)
  const out = saturatingSub(reserveYNano, kDiv)
  return fromNano(out)
}

export function quoteNormalizerBuyX(amm: PropAmmState, inputY: number): number {
  return quoteNormalizer(amm, 0, inputY)
}

export function quoteNormalizerSellX(amm: PropAmmState, inputX: number): number {
  return quoteNormalizer(amm, 1, inputX)
}

export function executeBuyX(
  amm: PropAmmState,
  quoteBuyX: (inputY: number) => number,
  inputY: number,
): PropTrade | null {
  if (!Number.isFinite(inputY) || inputY < PROP_MIN_INPUT) {
    return null
  }

  const outputX = quoteBuyX(inputY)
  if (!Number.isFinite(outputX) || outputX <= 0 || outputX >= amm.reserveX) {
    return null
  }

  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const spotBefore = beforeY / Math.max(beforeX, 1e-12)

  const nextReserveX = beforeX - outputX
  const nextReserveY = beforeY + inputY

  if (!Number.isFinite(nextReserveX) || !Number.isFinite(nextReserveY) || nextReserveX <= 0 || nextReserveY <= 0) {
    return null
  }

  amm.reserveX = nextReserveX
  amm.reserveY = nextReserveY

  return {
    side: 0,
    direction: 'buy_x',
    inputAmount: inputY,
    outputAmount: outputX,
    inputAmountNano: clampU64(toNano(inputY)).toString(),
    outputAmountNano: clampU64(toNano(outputX)).toString(),
    beforeX,
    beforeY,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    spotBefore,
    spotAfter: amm.reserveY / Math.max(amm.reserveX, 1e-12),
  }
}

export function executeSellX(
  amm: PropAmmState,
  quoteSellX: (inputX: number) => number,
  inputX: number,
): PropTrade | null {
  if (!Number.isFinite(inputX) || inputX < PROP_MIN_INPUT) {
    return null
  }

  const outputY = quoteSellX(inputX)
  if (!Number.isFinite(outputY) || outputY <= 0 || outputY >= amm.reserveY) {
    return null
  }

  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const spotBefore = beforeY / Math.max(beforeX, 1e-12)

  const nextReserveX = beforeX + inputX
  const nextReserveY = beforeY - outputY

  if (!Number.isFinite(nextReserveX) || !Number.isFinite(nextReserveY) || nextReserveX <= 0 || nextReserveY <= 0) {
    return null
  }

  amm.reserveX = nextReserveX
  amm.reserveY = nextReserveY

  return {
    side: 1,
    direction: 'sell_x',
    inputAmount: inputX,
    outputAmount: outputY,
    inputAmountNano: clampU64(toNano(inputX)).toString(),
    outputAmountNano: clampU64(toNano(outputY)).toString(),
    beforeX,
    beforeY,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    spotBefore,
    spotAfter: amm.reserveY / Math.max(amm.reserveX, 1e-12),
  }
}

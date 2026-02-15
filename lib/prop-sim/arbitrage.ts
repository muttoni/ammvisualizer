import {
  GOLDEN_RATIO_CONJUGATE,
  PROP_ARB_BRACKET_GROWTH,
  PROP_ARB_BRACKET_MAX_STEPS,
  PROP_ARB_GOLDEN_MAX_ITERS,
  PROP_ARB_INPUT_REL_TOL,
  PROP_MAX_INPUT_AMOUNT,
  PROP_MIN_ARB_NOTIONAL_Y,
  PROP_MIN_ARB_PROFIT_Y,
  PROP_MIN_INPUT,
} from './constants'
import { normalizerFeeBps } from './amm'
import type { PropAmmState, PropSwapSide } from './types'

export interface PropArbCandidate {
  side: PropSwapSide
  inputAmount: number
  expectedProfit: number
}

interface GoldenResult {
  x: number
  value: number
}

function sanitizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.NEGATIVE_INFINITY
  }

  return value
}

function bracketMaximum(
  start: number,
  minInput: number,
  maxInput: number,
  objective: (input: number) => number,
): [number, number] {
  const min = Math.max(PROP_MIN_INPUT, minInput)
  const max = Math.max(min, maxInput)

  let lo = min
  let mid = Math.min(max, Math.max(min, start))
  let midValue = sanitizeScore(objective(mid))

  if (midValue <= 0) {
    return [lo, mid]
  }

  let hi = Math.min(max, mid * PROP_ARB_BRACKET_GROWTH)
  if (hi <= mid) {
    return [lo, mid]
  }

  let hiValue = sanitizeScore(objective(hi))

  for (let index = 0; index < PROP_ARB_BRACKET_MAX_STEPS; index += 1) {
    if (hiValue <= midValue || hi >= max) {
      return [lo, hi]
    }

    lo = mid
    mid = hi
    midValue = hiValue

    const nextHi = Math.min(max, hi * PROP_ARB_BRACKET_GROWTH)
    if (nextHi <= hi) {
      return [lo, hi]
    }

    hi = nextHi
    hiValue = sanitizeScore(objective(hi))
  }

  return [lo, hi]
}

function goldenSectionMax(lo: number, hi: number, objective: (input: number) => number): GoldenResult {
  let left = Math.max(0, Math.min(lo, hi))
  let right = Math.max(PROP_MIN_INPUT, Math.max(lo, hi))

  if (right <= left) {
    return {
      x: right,
      value: sanitizeScore(objective(right)),
    }
  }

  let bestX = left
  let bestValue = sanitizeScore(objective(left))

  const rightValue = sanitizeScore(objective(right))
  if (rightValue > bestValue) {
    bestX = right
    bestValue = rightValue
  }

  let x1 = right - GOLDEN_RATIO_CONJUGATE * (right - left)
  let x2 = left + GOLDEN_RATIO_CONJUGATE * (right - left)
  let f1 = sanitizeScore(objective(x1))
  let f2 = sanitizeScore(objective(x2))

  if (f1 > bestValue) {
    bestX = x1
    bestValue = f1
  }

  if (f2 > bestValue) {
    bestX = x2
    bestValue = f2
  }

  for (let index = 0; index < PROP_ARB_GOLDEN_MAX_ITERS; index += 1) {
    if (f1 < f2) {
      left = x1
      x1 = x2
      f1 = f2
      x2 = left + GOLDEN_RATIO_CONJUGATE * (right - left)
      f2 = sanitizeScore(objective(x2))
      if (f2 > bestValue) {
        bestX = x2
        bestValue = f2
      }
    } else {
      right = x2
      x2 = x1
      f2 = f1
      x1 = right - GOLDEN_RATIO_CONJUGATE * (right - left)
      f1 = sanitizeScore(objective(x1))
      if (f1 > bestValue) {
        bestX = x1
        bestValue = f1
      }
    }

    const mid = 0.5 * (left + right)
    const scale = Math.max(PROP_MIN_INPUT, Math.abs(mid))
    if (right - left <= PROP_ARB_INPUT_REL_TOL * scale) {
      break
    }
  }

  return { x: bestX, value: bestValue }
}

function pickBestCandidate(
  buyCandidate: PropArbCandidate | null,
  sellCandidate: PropArbCandidate | null,
): PropArbCandidate | null {
  if (buyCandidate && sellCandidate) {
    return sellCandidate.expectedProfit > buyCandidate.expectedProfit ? sellCandidate : buyCandidate
  }

  return buyCandidate ?? sellCandidate
}

export function findSubmissionArbOpportunity(args: {
  fairPrice: number
  quoteBuyX: (inputY: number) => number
  quoteSellX: (inputX: number) => number
  sampleStartY: () => number
  minArbProfitY?: number
}): PropArbCandidate | null {
  const {
    fairPrice,
    quoteBuyX,
    quoteSellX,
    sampleStartY,
    minArbProfitY = PROP_MIN_ARB_PROFIT_Y,
  } = args

  if (!Number.isFinite(fairPrice) || fairPrice <= 0) {
    return null
  }

  const minBuyInput = Math.max(PROP_MIN_INPUT, PROP_MIN_ARB_NOTIONAL_Y)
  const minSellInput = Math.max(PROP_MIN_INPUT, PROP_MIN_ARB_NOTIONAL_Y / Math.max(fairPrice, 1e-9))
  const startY = Math.min(PROP_MAX_INPUT_AMOUNT, Math.max(minBuyInput, sampleStartY()))
  const startX = Math.min(PROP_MAX_INPUT_AMOUNT, Math.max(minSellInput, startY / Math.max(fairPrice, 1e-9)))

  const buyBracket = bracketMaximum(startY, minBuyInput, PROP_MAX_INPUT_AMOUNT, (inputY) => {
    const outputX = quoteBuyX(inputY)
    return outputX * fairPrice - inputY
  })

  const buyOptimal = goldenSectionMax(buyBracket[0], buyBracket[1], (inputY) => {
    const outputX = quoteBuyX(inputY)
    return outputX * fairPrice - inputY
  })

  let buyCandidate: PropArbCandidate | null = null
  if (buyOptimal.x >= minBuyInput) {
    const outputX = quoteBuyX(buyOptimal.x)
    const expectedProfit = outputX * fairPrice - buyOptimal.x
    if (outputX > 0 && expectedProfit >= minArbProfitY) {
      buyCandidate = {
        side: 0,
        inputAmount: buyOptimal.x,
        expectedProfit,
      }
    }
  }

  const sellBracket = bracketMaximum(startX, minSellInput, PROP_MAX_INPUT_AMOUNT, (inputX) => {
    const outputY = quoteSellX(inputX)
    return outputY - inputX * fairPrice
  })

  const sellOptimal = goldenSectionMax(sellBracket[0], sellBracket[1], (inputX) => {
    const outputY = quoteSellX(inputX)
    return outputY - inputX * fairPrice
  })

  let sellCandidate: PropArbCandidate | null = null
  if (sellOptimal.x >= minSellInput) {
    const outputY = quoteSellX(sellOptimal.x)
    const expectedProfit = outputY - sellOptimal.x * fairPrice
    if (outputY > 0 && expectedProfit >= minArbProfitY) {
      sellCandidate = {
        side: 1,
        inputAmount: sellOptimal.x,
        expectedProfit,
      }
    }
  }

  return pickBestCandidate(buyCandidate, sellCandidate)
}

export function findNormalizerArbOpportunity(args: {
  amm: PropAmmState
  fairPrice: number
  quoteBuyX: (inputY: number) => number
  quoteSellX: (inputX: number) => number
  minArbProfitY?: number
}): PropArbCandidate | null {
  const {
    amm,
    fairPrice,
    quoteBuyX,
    quoteSellX,
    minArbProfitY = PROP_MIN_ARB_PROFIT_Y,
  } = args

  if (!Number.isFinite(fairPrice) || fairPrice <= 0) {
    return null
  }

  const feeBps = normalizerFeeBps(amm)
  const gamma = (10_000 - feeBps) / 10_000

  if (!Number.isFinite(gamma) || gamma <= 0 || amm.reserveX <= 0 || amm.reserveY <= 0) {
    return null
  }

  const minBuyInput = Math.max(PROP_MIN_INPUT, PROP_MIN_ARB_NOTIONAL_Y)
  const minSellInput = Math.max(PROP_MIN_INPUT, PROP_MIN_ARB_NOTIONAL_Y / Math.max(fairPrice, 1e-9))

  let buyCandidate: PropArbCandidate | null = null
  const buyTarget = Math.sqrt(fairPrice * amm.reserveX * gamma * amm.reserveY)
  if (Number.isFinite(buyTarget) && buyTarget > amm.reserveY) {
    const inputY = Math.min(PROP_MAX_INPUT_AMOUNT, Math.max(minBuyInput, (buyTarget - amm.reserveY) / gamma))
    const outputX = quoteBuyX(inputY)
    const expectedProfit = outputX * fairPrice - inputY
    if (outputX > 0 && expectedProfit >= minArbProfitY) {
      buyCandidate = {
        side: 0,
        inputAmount: inputY,
        expectedProfit,
      }
    }
  }

  let sellCandidate: PropArbCandidate | null = null
  const sellTarget = Math.sqrt((amm.reserveY * amm.reserveX * gamma) / fairPrice)
  if (Number.isFinite(sellTarget) && sellTarget > amm.reserveX) {
    const inputX = Math.min(PROP_MAX_INPUT_AMOUNT, Math.max(minSellInput, (sellTarget - amm.reserveX) / gamma))
    const outputY = quoteSellX(inputX)
    const expectedProfit = outputY - inputX * fairPrice
    if (outputY > 0 && expectedProfit >= minArbProfitY) {
      sellCandidate = {
        side: 1,
        inputAmount: inputX,
        expectedProfit,
      }
    }
  }

  return pickBestCandidate(buyCandidate, sellCandidate)
}

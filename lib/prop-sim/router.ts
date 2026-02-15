import {
  GOLDEN_RATIO_CONJUGATE,
  PROP_MIN_TRADE_SIZE,
  PROP_ROUTER_ALPHA_TOL,
  PROP_ROUTER_GOLDEN_MAX_ITERS,
  PROP_ROUTER_SCORE_REL_GAP_TOL,
  PROP_ROUTER_SUBMISSION_AMOUNT_REL_TOL,
} from './constants'
import type { PropOrderSide, PropRetailOrder } from './types'

interface QuotePoint {
  alpha: number
  inSubmission: number
  inNormalizer: number
  outSubmission: number
  outNormalizer: number
}

export interface RouterDecision {
  orderSide: PropOrderSide
  alpha: number
  submissionInput: number
  normalizerInput: number
  submissionOutput: number
  normalizerOutput: number
}

function quoteScore(point: QuotePoint): number {
  const score = point.outSubmission + point.outNormalizer
  return Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
}

function bestQuote(a: QuotePoint, b: QuotePoint): QuotePoint {
  return quoteScore(b) > quoteScore(a) ? b : a
}

function withinRelGap(a: number, b: number, relTol: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false
  }

  const denominator = Math.max(1e-12, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= relTol * denominator
}

function maximizeSplit(totalInput: number, evaluate: (alpha: number) => QuotePoint): QuotePoint {
  let left = 0
  let right = 1

  const edgeLeft = evaluate(left)
  const edgeRight = evaluate(right)
  let best = bestQuote(edgeLeft, edgeRight)

  let x1 = right - GOLDEN_RATIO_CONJUGATE * (right - left)
  let x2 = left + GOLDEN_RATIO_CONJUGATE * (right - left)
  let q1 = evaluate(x1)
  let q2 = evaluate(x2)
  best = bestQuote(best, q1)
  best = bestQuote(best, q2)

  for (let index = 0; index < PROP_ROUTER_GOLDEN_MAX_ITERS; index += 1) {
    if (right - left <= PROP_ROUTER_ALPHA_TOL) {
      break
    }

    const midAlpha = 0.5 * (left + right)
    const submissionMidAmount = totalInput * midAlpha
    const amountWidth = totalInput * (right - left)
    const amountScale = Math.max(PROP_MIN_TRADE_SIZE, Math.abs(submissionMidAmount))
    if (amountWidth <= PROP_ROUTER_SUBMISSION_AMOUNT_REL_TOL * amountScale) {
      break
    }

    if (withinRelGap(quoteScore(q1), quoteScore(q2), PROP_ROUTER_SCORE_REL_GAP_TOL)) {
      break
    }

    if (quoteScore(q1) < quoteScore(q2)) {
      left = x1
      x1 = x2
      q1 = q2
      x2 = left + GOLDEN_RATIO_CONJUGATE * (right - left)
      q2 = evaluate(x2)
      best = bestQuote(best, q2)
    } else {
      right = x2
      x2 = x1
      q2 = q1
      x1 = right - GOLDEN_RATIO_CONJUGATE * (right - left)
      q1 = evaluate(x1)
      best = bestQuote(best, q1)
    }
  }

  const center = evaluate((left + right) * 0.5)
  best = bestQuote(best, center)

  return best
}

export function routeRetailOrder(args: {
  order: PropRetailOrder
  fairPrice: number
  quoteSubmissionBuyX: (inputY: number) => number
  quoteSubmissionSellX: (inputX: number) => number
  quoteNormalizerBuyX: (inputY: number) => number
  quoteNormalizerSellX: (inputX: number) => number
}): RouterDecision {
  const {
    order,
    fairPrice,
    quoteSubmissionBuyX,
    quoteSubmissionSellX,
    quoteNormalizerBuyX,
    quoteNormalizerSellX,
  } = args

  if (order.side === 'buy') {
    const totalY = Math.max(0, order.sizeY)

    const best = maximizeSplit(totalY, (alpha) => {
      const inSubmission = totalY * Math.min(1, Math.max(0, alpha))
      const inNormalizer = totalY * (1 - Math.min(1, Math.max(0, alpha)))

      const outSubmission = inSubmission > PROP_MIN_TRADE_SIZE ? quoteSubmissionBuyX(inSubmission) : 0
      const outNormalizer = inNormalizer > PROP_MIN_TRADE_SIZE ? quoteNormalizerBuyX(inNormalizer) : 0

      return {
        alpha,
        inSubmission,
        inNormalizer,
        outSubmission,
        outNormalizer,
      }
    })

    return {
      orderSide: order.side,
      alpha: best.alpha,
      submissionInput: best.inSubmission,
      normalizerInput: best.inNormalizer,
      submissionOutput: best.outSubmission,
      normalizerOutput: best.outNormalizer,
    }
  }

  const totalX = order.sizeY / Math.max(fairPrice, 1e-9)
  const best = maximizeSplit(totalX, (alpha) => {
    const inSubmission = totalX * Math.min(1, Math.max(0, alpha))
    const inNormalizer = totalX * (1 - Math.min(1, Math.max(0, alpha)))

    const outSubmission = inSubmission > PROP_MIN_TRADE_SIZE ? quoteSubmissionSellX(inSubmission) : 0
    const outNormalizer = inNormalizer > PROP_MIN_TRADE_SIZE ? quoteNormalizerSellX(inNormalizer) : 0

    return {
      alpha,
      inSubmission,
      inNormalizer,
      outSubmission,
      outNormalizer,
    }
  })

  return {
    orderSide: order.side,
    alpha: best.alpha,
    submissionInput: best.inSubmission,
    normalizerInput: best.inNormalizer,
    submissionOutput: best.outSubmission,
    normalizerOutput: best.outNormalizer,
  }
}

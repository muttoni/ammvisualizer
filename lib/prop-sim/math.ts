import type { PropAmmState, PropDepthStats, PropTrade } from './types'
import {
  GOLDEN_RATIO,
  PROP_ARB_BRACKET_TOLERANCE,
  PROP_ARB_MIN_PROFIT,
  PROP_ROUTE_BRACKET_TOLERANCE,
  PROP_SCALE,
  PROP_SCALE_NUM,
} from './constants'

// ============================================================================
// AMM State Helpers
// ============================================================================

export function createPropAmm(
  name: string,
  reserveX: number,
  reserveY: number,
  isStrategy: boolean,
): PropAmmState {
  return { name, reserveX, reserveY, isStrategy }
}

export function propAmmK(amm: PropAmmState): number {
  return amm.reserveX * amm.reserveY
}

export function propAmmSpot(amm: PropAmmState): number {
  return amm.reserveY / Math.max(amm.reserveX, 1e-12)
}

// ============================================================================
// Constant-Product Normalizer Quotes
// ============================================================================

/**
 * Quote output for buying X (input Y) from constant-product normalizer
 */
export function normalizerQuoteBuyX(
  reserveX: number,
  reserveY: number,
  feeBps: number,
  inputY: number,
): number {
  if (inputY <= 0) return 0
  const gamma = 1 - feeBps / 10000
  if (gamma <= 0) return 0
  
  const k = reserveX * reserveY
  const netY = inputY * gamma
  const newY = reserveY + netY
  const newX = k / newY
  const outputX = reserveX - newX
  
  return Math.max(0, outputX)
}

/**
 * Quote output for selling X (input X) to constant-product normalizer
 */
export function normalizerQuoteSellX(
  reserveX: number,
  reserveY: number,
  feeBps: number,
  inputX: number,
): number {
  if (inputX <= 0) return 0
  const gamma = 1 - feeBps / 10000
  if (gamma <= 0) return 0
  
  const k = reserveX * reserveY
  const netX = inputX * gamma
  const newX = reserveX + netX
  const newY = k / newX
  const outputY = reserveY - newY
  
  return Math.max(0, outputY)
}

// ============================================================================
// Trade Execution
// ============================================================================

export type PropQuoteFn = (side: 0 | 1, inputAmount: number) => number

/**
 * Execute a buy X trade (input Y, output X) using a quote function
 */
export function executePropBuyX(
  amm: PropAmmState,
  quoteFn: PropQuoteFn,
  inputY: number,
  timestamp: number,
): PropTrade | null {
  if (inputY <= 0) return null
  
  const outputX = quoteFn(0, inputY)
  if (outputX <= 0 || outputX >= amm.reserveX) return null
  
  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const spotBefore = beforeY / beforeX
  
  amm.reserveX = beforeX - outputX
  amm.reserveY = beforeY + inputY
  
  const spotAfter = amm.reserveY / amm.reserveX
  
  // Back-calculate implied fee
  const theoreticalOutputNoFee = (beforeX * inputY) / (beforeY + inputY)
  const impliedFeeBps = Math.max(0, Math.round((1 - outputX / theoreticalOutputNoFee) * 10000))
  
  return {
    side: 'sell',  // AMM sells X
    inputAmount: inputY,
    outputAmount: outputX,
    timestamp,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    beforeX,
    beforeY,
    spotBefore,
    spotAfter,
    impliedFeeBps,
  }
}

/**
 * Execute a sell X trade (input X, output Y) using a quote function
 */
export function executePropSellX(
  amm: PropAmmState,
  quoteFn: PropQuoteFn,
  inputX: number,
  timestamp: number,
): PropTrade | null {
  if (inputX <= 0) return null
  
  const outputY = quoteFn(1, inputX)
  if (outputY <= 0 || outputY >= amm.reserveY) return null
  
  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const spotBefore = beforeY / beforeX
  
  amm.reserveX = beforeX + inputX
  amm.reserveY = beforeY - outputY
  
  const spotAfter = amm.reserveY / amm.reserveX
  
  // Back-calculate implied fee
  const theoreticalOutputNoFee = (beforeY * inputX) / (beforeX + inputX)
  const impliedFeeBps = Math.max(0, Math.round((1 - outputY / theoreticalOutputNoFee) * 10000))
  
  return {
    side: 'buy',  // AMM buys X
    inputAmount: inputX,
    outputAmount: outputY,
    timestamp,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    beforeX,
    beforeY,
    spotBefore,
    spotAfter,
    impliedFeeBps,
  }
}

// ============================================================================
// Golden-Section Search
// ============================================================================

/**
 * Golden-section search to maximize a unimodal function f(x) on [lo, hi]
 */
export function goldenSectionMaximize(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tolerance: number,
  maxIter: number = 50,
): { x: number; fx: number } {
  let a = lo
  let b = hi
  
  let c = b - GOLDEN_RATIO * (b - a)
  let d = a + GOLDEN_RATIO * (b - a)
  let fc = f(c)
  let fd = f(d)
  
  for (let i = 0; i < maxIter; i++) {
    const width = b - a
    if (width < tolerance * Math.max(Math.abs(a), Math.abs(b), 1)) {
      break
    }
    
    if (fc > fd) {
      b = d
      d = c
      fd = fc
      c = b - GOLDEN_RATIO * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + GOLDEN_RATIO * (b - a)
      fd = f(d)
    }
  }
  
  const x = (a + b) / 2
  return { x, fx: f(x) }
}

// ============================================================================
// Arbitrage Solver (Golden-Section)
// ============================================================================

export interface PropArbResult {
  side: 'buy' | 'sell'
  inputAmount: number
  expectedProfit: number
}

/**
 * Find optimal arbitrage opportunity using golden-section search
 * 
 * @param amm Current AMM state
 * @param fairPrice Fair market price (Y/X)
 * @param quoteFn Strategy's quote function
 * @param minProfit Minimum profit threshold in Y
 * @param tolerance Relative bracket tolerance for early stopping
 */
export function findPropArbOpportunity(
  amm: PropAmmState,
  fairPrice: number,
  quoteFn: PropQuoteFn,
  minProfit: number = PROP_ARB_MIN_PROFIT,
  tolerance: number = PROP_ARB_BRACKET_TOLERANCE,
): PropArbResult | null {
  const spot = propAmmSpot(amm)
  
  if (Math.abs(spot - fairPrice) / fairPrice < 0.0001) {
    return null  // Spot is at fair price, no arb
  }
  
  if (spot < fairPrice) {
    // AMM underprices X: buy X from AMM (input Y), sell at fair price
    // Profit = outputX * fairPrice - inputY
    const maxInputY = amm.reserveY * 0.5  // Don't drain more than half
    
    const profitFn = (inputY: number): number => {
      if (inputY <= 0) return 0
      const outputX = quoteFn(0, inputY)
      if (outputX <= 0) return -1e9
      return outputX * fairPrice - inputY
    }
    
    const result = goldenSectionMaximize(profitFn, 0, maxInputY, tolerance)
    
    if (result.fx >= minProfit) {
      return {
        side: 'buy',  // Arb buys X from AMM
        inputAmount: result.x,
        expectedProfit: result.fx,
      }
    }
  } else {
    // AMM overprices X: sell X to AMM (input X), buy at fair price
    // Profit = outputY - inputX * fairPrice
    const maxInputX = amm.reserveX * 0.5
    
    const profitFn = (inputX: number): number => {
      if (inputX <= 0) return 0
      const outputY = quoteFn(1, inputX)
      if (outputY <= 0) return -1e9
      return outputY - inputX * fairPrice
    }
    
    const result = goldenSectionMaximize(profitFn, 0, maxInputX, tolerance)
    
    if (result.fx >= minProfit) {
      return {
        side: 'sell',  // Arb sells X to AMM
        inputAmount: result.x,
        expectedProfit: result.fx,
      }
    }
  }
  
  return null
}

// ============================================================================
// Order Routing (Golden-Section)
// ============================================================================

/**
 * Route a retail order between strategy and normalizer AMMs
 * Uses golden-section search to find optimal split
 * 
 * @returns Array of [amm, amount] pairs
 */
export function routePropRetailOrder(
  strategyAmm: PropAmmState,
  normalizerAmm: PropAmmState,
  strategyQuote: PropQuoteFn,
  normalizerQuote: PropQuoteFn,
  order: { side: 'buy' | 'sell'; sizeY: number },
  tolerance: number = PROP_ROUTE_BRACKET_TOLERANCE,
): Array<[PropAmmState, number, PropQuoteFn]> {
  const totalSize = order.sizeY
  if (totalSize <= 0) return []
  
  if (order.side === 'buy') {
    // Buying X: input is Y, split Y between AMMs, maximize total X output
    const outputFn = (alpha: number): number => {
      const strategyY = alpha * totalSize
      const normalizerY = (1 - alpha) * totalSize
      
      const strategyX = strategyY > 0.01 ? strategyQuote(0, strategyY) : 0
      const normalizerX = normalizerY > 0.01 ? normalizerQuote(0, normalizerY) : 0
      
      return strategyX + normalizerX
    }
    
    const result = goldenSectionMaximize(outputFn, 0, 1, tolerance)
    const alpha = result.x
    
    const strategyY = alpha * totalSize
    const normalizerY = (1 - alpha) * totalSize
    
    const splits: Array<[PropAmmState, number, PropQuoteFn]> = []
    if (strategyY > 0.01) splits.push([strategyAmm, strategyY, strategyQuote])
    if (normalizerY > 0.01) splits.push([normalizerAmm, normalizerY, normalizerQuote])
    
    return splits
  } else {
    // Selling X: convert sizeY to X using fair price estimate, split X
    const spotAvg = (propAmmSpot(strategyAmm) + propAmmSpot(normalizerAmm)) / 2
    const totalX = totalSize / spotAvg
    
    const outputFn = (alpha: number): number => {
      const strategyX = alpha * totalX
      const normalizerX = (1 - alpha) * totalX
      
      const strategyYOut = strategyX > 0.0001 ? strategyQuote(1, strategyX) : 0
      const normalizerYOut = normalizerX > 0.0001 ? normalizerQuote(1, normalizerX) : 0
      
      return strategyYOut + normalizerYOut
    }
    
    const result = goldenSectionMaximize(outputFn, 0, 1, tolerance)
    const alpha = result.x
    
    const strategyX = alpha * totalX
    const normalizerX = (1 - alpha) * totalX
    
    const splits: Array<[PropAmmState, number, PropQuoteFn]> = []
    if (strategyX > 0.0001) splits.push([strategyAmm, strategyX, strategyQuote])
    if (normalizerX > 0.0001) splits.push([normalizerAmm, normalizerX, normalizerQuote])
    
    return splits
  }
}

// ============================================================================
// Depth Stats
// ============================================================================

export function buildPropDepthStats(
  amm: PropAmmState,
  quoteFn: PropQuoteFn,
): PropDepthStats {
  const spot = propAmmSpot(amm)
  
  // Buy-side depth: how much X can you buy to move price up by 1%/5%?
  const buyDepth1 = findDepthForImpact(amm, quoteFn, 0.01, 'buy')
  const buyDepth5 = findDepthForImpact(amm, quoteFn, 0.05, 'buy')
  
  // Sell-side depth: how much X can you sell to move price down by 1%/5%?
  const sellDepth1 = findDepthForImpact(amm, quoteFn, 0.01, 'sell')
  const sellDepth5 = findDepthForImpact(amm, quoteFn, 0.05, 'sell')
  
  // Cost to buy/sell 1 X
  const buyOneXCostY = findInputForOutput(quoteFn, 0, 1, amm.reserveY * 0.5)
  const sellOneXPayoutY = quoteFn(1, 1)
  
  return {
    buyDepth1,
    buyDepth5,
    sellDepth1,
    sellDepth5,
    buyOneXCostY,
    sellOneXPayoutY,
  }
}

function findDepthForImpact(
  amm: PropAmmState,
  quoteFn: PropQuoteFn,
  targetImpact: number,
  direction: 'buy' | 'sell',
): number {
  const spot = propAmmSpot(amm)
  const targetSpot = direction === 'buy' 
    ? spot * (1 + targetImpact) 
    : spot * (1 - targetImpact)
  
  // Binary search for the trade size that achieves target impact
  let lo = 0
  let hi = direction === 'buy' ? amm.reserveY * 0.9 : amm.reserveX * 0.9
  
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    
    // Simulate the trade
    const testAmm = { ...amm }
    let newSpot: number
    
    if (direction === 'buy') {
      const outputX = quoteFn(0, mid)
      if (outputX <= 0 || outputX >= testAmm.reserveX) {
        hi = mid
        continue
      }
      testAmm.reserveX -= outputX
      testAmm.reserveY += mid
      newSpot = testAmm.reserveY / testAmm.reserveX
    } else {
      const outputY = quoteFn(1, mid)
      if (outputY <= 0 || outputY >= testAmm.reserveY) {
        hi = mid
        continue
      }
      testAmm.reserveX += mid
      testAmm.reserveY -= outputY
      newSpot = testAmm.reserveY / testAmm.reserveX
    }
    
    const achievedImpact = Math.abs(newSpot - spot) / spot
    
    if (Math.abs(achievedImpact - targetImpact) < 0.001) {
      return direction === 'buy' ? quoteFn(0, mid) : mid  // Return X amount
    }
    
    if (achievedImpact < targetImpact) {
      lo = mid
    } else {
      hi = mid
    }
  }
  
  // Return approximate result
  const finalSize = (lo + hi) / 2
  return direction === 'buy' ? quoteFn(0, finalSize) : finalSize
}

function findInputForOutput(
  quoteFn: PropQuoteFn,
  side: 0 | 1,
  targetOutput: number,
  maxInput: number,
): number {
  let lo = 0
  let hi = maxInput
  
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const output = quoteFn(side, mid)
    
    if (Math.abs(output - targetOutput) < 0.0001) {
      return mid
    }
    
    if (output < targetOutput) {
      lo = mid
    } else {
      hi = mid
    }
  }
  
  return (lo + hi) / 2
}

// ============================================================================
// Utility Conversions
// ============================================================================

export function toScaledBigInt(value: number): bigint {
  return BigInt(Math.round(Math.max(0, value) * PROP_SCALE_NUM))
}

export function fromScaledBigInt(value: bigint): number {
  return Number(value) / PROP_SCALE_NUM
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function formatNum(value: number, decimals: number): string {
  return value.toFixed(decimals)
}

export function formatSigned(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

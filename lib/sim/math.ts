import type { AmmState, DepthStats, Trade } from './types'
import { clamp } from './utils'

export function createAmm(
  name: string,
  reserveX: number,
  reserveY: number,
  bidFeeBps: number,
  askFeeBps: number,
  isStrategy: boolean,
): AmmState {
  return {
    name,
    reserveX,
    reserveY,
    bidFeeBps,
    askFeeBps,
    feesX: 0,
    feesY: 0,
    isStrategy,
  }
}

export function ammK(amm: AmmState): number {
  return amm.reserveX * amm.reserveY
}

export function depthToBuyImpact(amm: AmmState, impact: number): number {
  if (impact <= 0) return 0
  const k = ammK(amm)
  const spot = amm.reserveY / Math.max(amm.reserveX, 1e-9)
  const targetSpot = spot * (1 + impact)
  const targetX = Math.sqrt(k / Math.max(targetSpot, 1e-9))
  const amountXOut = amm.reserveX - targetX
  return clamp(amountXOut, 0, Math.max(0, amm.reserveX * 0.99))
}

export function depthToSellImpact(amm: AmmState, impact: number): number {
  if (impact <= 0 || impact >= 1) return 0
  const gamma = 1 - amm.bidFeeBps / 10000
  if (gamma <= 0) return 0
  const k = ammK(amm)
  const spot = amm.reserveY / Math.max(amm.reserveX, 1e-9)
  const targetSpot = spot * (1 - impact)
  const targetX = Math.sqrt(k / Math.max(targetSpot, 1e-9))
  const netXIn = targetX - amm.reserveX
  const grossXIn = netXIn / gamma
  return Math.max(0, grossXIn)
}

export function quoteYInForBuyingX(amm: AmmState, amountXOut: number): number {
  if (amountXOut <= 0 || amountXOut >= amm.reserveX) return 0
  const gamma = 1 - amm.askFeeBps / 10000
  if (gamma <= 0) return 0
  const k = ammK(amm)
  const newX = amm.reserveX - amountXOut
  const netYIn = k / newX - amm.reserveY
  if (!Number.isFinite(netYIn) || netYIn <= 0) return 0
  return netYIn / gamma
}

export function quoteYOutForSellingX(amm: AmmState, amountXIn: number): number {
  if (amountXIn <= 0) return 0
  const gamma = 1 - amm.bidFeeBps / 10000
  if (gamma <= 0) return 0
  const k = ammK(amm)
  const netXIn = amountXIn * gamma
  const newX = amm.reserveX + netXIn
  const newY = k / newX
  const amountYOut = amm.reserveY - newY
  if (!Number.isFinite(amountYOut) || amountYOut <= 0) return 0
  return amountYOut
}

export function executeBuyX(amm: AmmState, amountXIn: number, timestamp: number): Trade | null {
  if (amountXIn <= 0) return null

  const feeRate = amm.bidFeeBps / 10000
  const gamma = 1 - feeRate
  if (gamma <= 0) return null

  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const k = ammK(amm)

  const feeX = amountXIn * feeRate
  const netX = amountXIn * gamma
  const newX = beforeX + netX
  const newY = k / newX
  const amountYOut = beforeY - newY

  if (!Number.isFinite(amountYOut) || amountYOut <= 0) return null

  amm.reserveX = newX
  amm.reserveY = newY
  amm.feesX += feeX

  return {
    side: 'buy',
    amountX: amountXIn,
    amountY: amountYOut,
    timestamp,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    beforeX,
    beforeY,
    feeBpsUsed: amm.bidFeeBps,
    spotBefore: beforeY / beforeX,
    spotAfter: amm.reserveY / amm.reserveX,
  }
}

export function executeSellX(amm: AmmState, amountXOut: number, timestamp: number): Trade | null {
  if (amountXOut <= 0 || amountXOut >= amm.reserveX) return null

  const feeRate = amm.askFeeBps / 10000
  const gamma = 1 - feeRate
  if (gamma <= 0) return null

  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const k = ammK(amm)

  const newX = beforeX - amountXOut
  const newYWithoutFee = k / newX
  const netYIn = newYWithoutFee - beforeY
  if (netYIn <= 0) return null

  const amountYIn = netYIn / gamma
  const feeY = amountYIn - netYIn

  amm.reserveX = newX
  amm.reserveY = beforeY + netYIn
  amm.feesY += feeY

  return {
    side: 'sell',
    amountX: amountXOut,
    amountY: amountYIn,
    timestamp,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    beforeX,
    beforeY,
    feeBpsUsed: amm.askFeeBps,
    spotBefore: beforeY / beforeX,
    spotAfter: amm.reserveY / amm.reserveX,
  }
}

export function executeBuyXWithY(amm: AmmState, amountYIn: number, timestamp: number): Trade | null {
  if (amountYIn <= 0) return null

  const feeRate = amm.askFeeBps / 10000
  const gamma = 1 - feeRate
  if (gamma <= 0) return null

  const beforeX = amm.reserveX
  const beforeY = amm.reserveY
  const k = ammK(amm)

  const feeY = amountYIn * feeRate
  const netY = amountYIn * gamma
  const newY = beforeY + netY
  const newX = k / newY
  const amountXOut = beforeX - newX

  if (!Number.isFinite(amountXOut) || amountXOut <= 0) return null

  amm.reserveX = newX
  amm.reserveY = newY
  amm.feesY += feeY

  return {
    side: 'sell',
    amountX: amountXOut,
    amountY: amountYIn,
    timestamp,
    reserveX: amm.reserveX,
    reserveY: amm.reserveY,
    beforeX,
    beforeY,
    feeBpsUsed: amm.askFeeBps,
    spotBefore: beforeY / beforeX,
    spotAfter: amm.reserveY / amm.reserveX,
  }
}

export function findArbOpportunity(amm: AmmState, fairPrice: number): { side: 'buy' | 'sell'; amountX: number; spot: number } | null {
  const x = amm.reserveX
  const y = amm.reserveY
  const spot = y / x
  const k = x * y

  if (spot < fairPrice) {
    const gamma = 1 - amm.askFeeBps / 10000
    if (gamma <= 0) return null
    const newX = Math.sqrt(k / (gamma * fairPrice))
    let amountX = x - newX
    if (!Number.isFinite(amountX) || amountX <= 0) return null
    amountX = Math.min(amountX, x * 0.99)
    return {
      side: 'sell',
      amountX,
      spot,
    }
  }

  if (spot > fairPrice) {
    const gamma = 1 - amm.bidFeeBps / 10000
    if (gamma <= 0) return null
    const xVirtual = Math.sqrt((k * gamma) / fairPrice)
    const netX = xVirtual - x
    const amountX = netX / gamma
    if (!Number.isFinite(amountX) || amountX <= 0) return null
    return {
      side: 'buy',
      amountX,
      spot,
    }
  }

  return null
}

export function splitBuyTwoAmms(amm1: AmmState, amm2: AmmState, totalY: number): Array<[AmmState, number]> {
  if (totalY <= 0) return [[amm1, 0], [amm2, 0]]

  const x1 = amm1.reserveX
  const y1 = amm1.reserveY
  const x2 = amm2.reserveX
  const y2 = amm2.reserveY
  const gamma1 = 1 - amm1.askFeeBps / 10000
  const gamma2 = 1 - amm2.askFeeBps / 10000

  const a1 = Math.sqrt(Math.max(x1 * gamma1 * y1, 0))
  const a2 = Math.sqrt(Math.max(x2 * gamma2 * y2, 0))
  if (!Number.isFinite(a1) || !Number.isFinite(a2) || a2 <= 0) {
    return [[amm1, totalY / 2], [amm2, totalY / 2]]
  }

  const r = a1 / a2
  const numerator = r * (y2 + gamma2 * totalY) - y1
  const denominator = gamma1 + r * gamma2
  let y1Amount = denominator === 0 ? totalY / 2 : numerator / denominator
  y1Amount = clamp(y1Amount, 0, totalY)

  return [[amm1, y1Amount], [amm2, totalY - y1Amount]]
}

export function splitSellTwoAmms(amm1: AmmState, amm2: AmmState, totalX: number): Array<[AmmState, number]> {
  if (totalX <= 0) return [[amm1, 0], [amm2, 0]]

  const x1 = amm1.reserveX
  const y1 = amm1.reserveY
  const x2 = amm2.reserveX
  const y2 = amm2.reserveY
  const gamma1 = 1 - amm1.bidFeeBps / 10000
  const gamma2 = 1 - amm2.bidFeeBps / 10000

  const b1 = Math.sqrt(Math.max(y1 * gamma1 * x1, 0))
  const b2 = Math.sqrt(Math.max(y2 * gamma2 * x2, 0))
  if (!Number.isFinite(b1) || !Number.isFinite(b2) || b2 <= 0) {
    return [[amm1, totalX / 2], [amm2, totalX / 2]]
  }

  const r = b1 / b2
  const numerator = r * (x2 + gamma2 * totalX) - x1
  const denominator = gamma1 + r * gamma2
  let x1Amount = denominator === 0 ? totalX / 2 : numerator / denominator
  x1Amount = clamp(x1Amount, 0, totalX)

  return [[amm1, x1Amount], [amm2, totalX - x1Amount]]
}

export function buildDepthStats(amm: AmmState): DepthStats {
  return {
    buyDepth1: depthToBuyImpact(amm, 0.01),
    buyDepth5: depthToBuyImpact(amm, 0.05),
    sellDepth1: depthToSellImpact(amm, 0.01),
    sellDepth5: depthToSellImpact(amm, 0.05),
    buyOneXCostY: quoteYInForBuyingX(amm, 1),
    sellOneXPayoutY: quoteYOutForSellingX(amm, 1),
  }
}

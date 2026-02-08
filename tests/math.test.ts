import { describe, expect, it } from 'vitest'
import {
  ammK,
  buildDepthStats,
  createAmm,
  executeBuyX,
  executeBuyXWithY,
  executeSellX,
  findArbOpportunity,
  splitBuyTwoAmms,
  splitSellTwoAmms,
} from '../lib/sim/math'

describe('sim math', () => {
  it('preserves k approximately after swaps', () => {
    const amm = createAmm('Strategy', 100, 10_000, 30, 30, true)
    const initialK = ammK(amm)

    const buy = executeBuyX(amm, 2.5, 1)
    expect(buy).not.toBeNull()

    const sell = executeSellX(amm, 1.2, 2)
    expect(sell).not.toBeNull()

    expect(ammK(amm)).toBeCloseTo(initialK, 3)
  })

  it('splits retail flow across two pools without exceeding totals', () => {
    const amm1 = createAmm('A', 100, 10_000, 30, 30, true)
    const amm2 = createAmm('B', 100, 10_000, 30, 30, false)

    const buySplits = splitBuyTwoAmms(amm1, amm2, 50)
    const buyTotal = buySplits[0][1] + buySplits[1][1]
    expect(buyTotal).toBeCloseTo(50, 8)

    const sellSplits = splitSellTwoAmms(amm1, amm2, 4)
    const sellTotal = sellSplits[0][1] + sellSplits[1][1]
    expect(sellTotal).toBeCloseTo(4, 8)
  })

  it('produces valid depth stats', () => {
    const amm = createAmm('Strategy', 100, 10_000, 45, 55, true)
    const stats = buildDepthStats(amm)

    expect(stats.buyDepth1).toBeGreaterThan(0)
    expect(stats.buyDepth5).toBeGreaterThan(stats.buyDepth1)
    expect(stats.sellDepth1).toBeGreaterThan(0)
    expect(stats.sellDepth5).toBeGreaterThan(stats.sellDepth1)
    expect(stats.buyOneXCostY).toBeGreaterThan(0)
    expect(stats.sellOneXPayoutY).toBeGreaterThan(0)
  })

  it('finds arbitrage opportunities when spot diverges from fair', () => {
    const amm = createAmm('Strategy', 100, 10_000, 30, 30, true)

    const noArb = findArbOpportunity(amm, 100)
    expect(noArb).toBeNull()

    const higherFair = findArbOpportunity(amm, 110)
    expect(higherFair).not.toBeNull()

    const lowerFair = findArbOpportunity(amm, 90)
    expect(lowerFair).not.toBeNull()
  })

  it('supports buy-with-y execution path', () => {
    const amm = createAmm('Strategy', 100, 10_000, 30, 30, true)
    const trade = executeBuyXWithY(amm, 25, 1)
    expect(trade).not.toBeNull()
    expect(trade?.amountX ?? 0).toBeGreaterThan(0)
  })
})

import {
  PROP_MIN_INPUT,
  PROP_RETAIL_BUY_PROB,
  PROP_RETAIL_SIZE_SIGMA,
} from './constants'
import type { PropRetailOrder } from './types'

export function samplePoisson(lambda: number, randomUnit: () => number): number {
  const clamped = Math.max(0.01, lambda)
  const threshold = Math.exp(-clamped)

  let count = 0
  let product = 1

  while (product > threshold) {
    count += 1
    product *= Math.max(1e-12, randomUnit())
  }

  return count - 1
}

export function sampleLogNormal(mean: number, sigma: number, gaussianRandom: () => number): number {
  const sigmaSafe = Math.max(0.01, sigma)
  const muLn = Math.log(Math.max(0.01, mean)) - 0.5 * sigmaSafe * sigmaSafe
  const sample = Math.exp(muLn + sigmaSafe * gaussianRandom())
  return Math.max(PROP_MIN_INPUT, sample)
}

export function generateRetailOrders(
  arrivalRate: number,
  meanSizeY: number,
  randomUnit: () => number,
  gaussianRandom: () => number,
): PropRetailOrder[] {
  const count = samplePoisson(arrivalRate, randomUnit)
  if (count <= 0) {
    return []
  }

  const orders: PropRetailOrder[] = []
  for (let index = 0; index < count; index += 1) {
    const side = randomUnit() < PROP_RETAIL_BUY_PROB ? 'buy' : 'sell'
    const sizeY = sampleLogNormal(meanSizeY, PROP_RETAIL_SIZE_SIGMA, gaussianRandom)
    orders.push({ side, sizeY })
  }

  return orders
}

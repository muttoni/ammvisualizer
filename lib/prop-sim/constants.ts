/**
 * Prop AMM Challenge simulation parameters
 * Based on: https://github.com/benedictbrady/prop-amm-challenge
 */

// Initial reserves
export const PROP_INITIAL_RESERVE_X = 100
export const PROP_INITIAL_RESERVE_Y = 10_000
export const PROP_INITIAL_PRICE = 100

// Price process (geometric Brownian motion)
export const PROP_VOLATILITY_MIN = 0.0001    // 0.01% per step
export const PROP_VOLATILITY_MAX = 0.007     // 0.70% per step

// Retail flow
export const PROP_ARRIVAL_RATE_MIN = 0.4
export const PROP_ARRIVAL_RATE_MAX = 1.2
export const PROP_ORDER_SIZE_MEAN_MIN = 12
export const PROP_ORDER_SIZE_MEAN_MAX = 28
export const PROP_ORDER_SIZE_SIGMA = 1.2     // Log-normal sigma

// Normalizer parameters (sampled per simulation)
export const PROP_NORMALIZER_FEE_MIN = 30    // bps
export const PROP_NORMALIZER_FEE_MAX = 80    // bps
export const PROP_NORMALIZER_LIQ_MIN = 0.4   // multiplier
export const PROP_NORMALIZER_LIQ_MAX = 2.0   // multiplier

// Arbitrage parameters
export const PROP_ARB_MIN_PROFIT = 0.01      // Y units (1 cent)
export const PROP_ARB_BRACKET_TOLERANCE = 0.01  // 1% relative

// Order routing parameters
export const PROP_ROUTE_BRACKET_TOLERANCE = 0.01  // 1% relative
export const PROP_ROUTE_OBJECTIVE_GAP = 0.01      // 1% objective gap stop

// Golden ratio for golden-section search
export const PHI = (1 + Math.sqrt(5)) / 2
export const GOLDEN_RATIO = 1 / PHI  // ≈ 0.618

// Scale factor for bigint conversions (1e9)
export const PROP_SCALE = 1_000_000_000n
export const PROP_SCALE_NUM = 1_000_000_000

// Storage size
export const PROP_STORAGE_SIZE = 1024

// Playback speed profiles (shared with original)
export const PROP_SPEED_PROFILE: Record<number, { ms: number; label: string }> = {
  1: { ms: 1000, label: '1x' },
  2: { ms: 500, label: '2x' },
  3: { ms: 250, label: '4x' },
  4: { ms: 100, label: '10x' },
  5: { ms: 50, label: '20x' },
  6: { ms: 10, label: '100x' },
}

// Maximum steps per simulation (for guard rails)
export const PROP_MAX_STEPS = 10_000

// Chart parameters
export const PROP_CURVE_SAMPLE_POINTS = 60

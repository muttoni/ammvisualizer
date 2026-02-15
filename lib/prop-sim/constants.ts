export const PROP_STORAGE_SIZE = 1024

export const PROP_INITIAL_PRICE = 100
export const PROP_INITIAL_RESERVE_X = 100
export const PROP_INITIAL_RESERVE_Y = 10_000

export const PROP_DEFAULT_STEPS = 10_000

export const PROP_GBM_MU = 0
export const PROP_GBM_DT = 1
export const PROP_GBM_SIGMA_MIN = 0.0001
export const PROP_GBM_SIGMA_MAX = 0.007

export const PROP_RETAIL_ARRIVAL_MIN = 0.4
export const PROP_RETAIL_ARRIVAL_MAX = 1.2
export const PROP_RETAIL_MEAN_SIZE_MIN = 12
export const PROP_RETAIL_MEAN_SIZE_MAX = 28
export const PROP_RETAIL_SIZE_SIGMA = 1.2
export const PROP_RETAIL_BUY_PROB = 0.5

export const PROP_NORMALIZER_FEE_MIN = 30
export const PROP_NORMALIZER_FEE_MAX = 80
export const PROP_NORMALIZER_LIQ_MIN = 0.4
export const PROP_NORMALIZER_LIQ_MAX = 2.0

export const PROP_MIN_ARB_PROFIT_Y = 0.01
export const PROP_MIN_ARB_NOTIONAL_Y = 0.01
export const PROP_MIN_INPUT = 0.001
export const PROP_MIN_TRADE_SIZE = 0.001

export const PROP_U64_MAX = 18_446_744_073_709_551_615n
export const PROP_NANO_SCALE = 1_000_000_000n
export const PROP_NANO_SCALE_F64 = 1_000_000_000
export const PROP_MAX_INPUT_AMOUNT = (Number(PROP_U64_MAX) / PROP_NANO_SCALE_F64) * 0.999_999

export const GOLDEN_RATIO_CONJUGATE = 0.618_033_988_749_894_8

export const PROP_ARB_BRACKET_MAX_STEPS = 24
export const PROP_ARB_BRACKET_GROWTH = 2
export const PROP_ARB_GOLDEN_MAX_ITERS = 12
export const PROP_ARB_INPUT_REL_TOL = 1e-2

export const PROP_ROUTER_GOLDEN_MAX_ITERS = 14
export const PROP_ROUTER_ALPHA_TOL = 1e-3
export const PROP_ROUTER_SUBMISSION_AMOUNT_REL_TOL = 1e-2
export const PROP_ROUTER_SCORE_REL_GAP_TOL = 1e-2

export const PROP_SPEED_PROFILE: Record<number, { ms: number; label: string }> = {
  1: { ms: 1000, label: '1x' },
  2: { ms: 500, label: '2x' },
  3: { ms: 250, label: '4x' },
  4: { ms: 100, label: '10x' },
  5: { ms: 50, label: '20x' },
  6: { ms: 10, label: '100x' },
}

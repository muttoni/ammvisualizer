export type PropFlowType = 'arbitrage' | 'retail' | 'system'

export type PropStrategyKind = 'builtin'

export interface PropStrategyRef {
  kind: PropStrategyKind
  id: string
}

export interface PropSimulationConfig {
  seed: number
  strategyRef: PropStrategyRef
  playbackSpeed: number
  maxTapeRows: number
}

export interface PropAmmState {
  name: string
  reserveX: number
  reserveY: number
  isStrategy: boolean
}

export interface PropNormalizerConfig {
  feeBps: number          // Sampled per simulation: 30-80
  liquidityMult: number   // Sampled per simulation: 0.4-2.0
}

export interface PropTrade {
  side: 'buy' | 'sell'    // buy = AMM buys X (receives X, pays Y), sell = AMM sells X
  inputAmount: number
  outputAmount: number
  timestamp: number
  reserveX: number        // Post-trade
  reserveY: number
  beforeX: number
  beforeY: number
  spotBefore: number
  spotAfter: number
  impliedFeeBps: number   // Back-calculated from trade
}

export interface PropSnapshotAmm {
  x: number
  y: number
  k: number               // x * y for reference
  impliedBidBps: number   // Last trade implied fee
  impliedAskBps: number
}

export interface PropSnapshotNormalizer {
  x: number
  y: number
  k: number
  feeBps: number
  liquidityMult: number
}

export interface PropSnapshot {
  step: number
  fairPrice: number
  strategy: PropSnapshotAmm
  normalizer: PropSnapshotNormalizer
  edge: {
    total: number
    retail: number
    arb: number
  }
  simulationParams: {
    volatility: number
    arrivalRate: number
  }
}

export interface PropStorageChange {
  offset: number
  before: number
  after: number
}

export interface PropStrategyExecution {
  outputAmount: number
  storageChanges: PropStorageChange[]
}

export interface PropTradeEvent {
  id: number
  step: number
  flow: PropFlowType
  ammName: string
  isStrategyTrade: boolean
  trade: PropTrade | null
  order: { side: 'buy' | 'sell'; sizeY: number } | null
  arbProfit: number
  fairPrice: number
  priceMove: { from: number; to: number }
  edgeDelta: number
  codeLines: number[]
  codeExplanation: string
  stateBadge: string
  summary: string
  snapshot: PropSnapshot
  strategyExecution?: PropStrategyExecution
}

export interface PropComputeSwapInput {
  side: 0 | 1             // 0 = buy X (Y input), 1 = sell X (X input)
  inputAmount: bigint     // 1e9 scale
  reserveX: bigint
  reserveY: bigint
  storage: Uint8Array     // 1024 bytes
}

export interface PropAfterSwapInput {
  side: 0 | 1
  inputAmount: bigint
  outputAmount: bigint
  reserveX: bigint        // Post-trade
  reserveY: bigint
  step: bigint
  storage: Uint8Array     // 1024 bytes, mutable
}

export interface PropStrategyCallbackContext {
  side: 0 | 1
  inputAmount: number
  outputAmount: number
  reserveX: number
  reserveY: number
  step: number
  flowType: PropFlowType
  fairPrice: number
  edgeDelta: number
}

export interface PropBuiltinStrategy {
  id: string
  name: string
  code: string
  feeBps: number          // For explanation purposes
  computeSwap: (input: PropComputeSwapInput) => bigint
  afterSwap?: (input: PropAfterSwapInput, storage: Uint8Array) => Uint8Array
}

export interface PropActiveStrategyRuntime {
  ref: PropStrategyRef
  name: string
  code: string
  feeBps: number
  computeSwap: (reserveX: number, reserveY: number, side: 0 | 1, inputAmount: number, storage: Uint8Array) => number
  afterSwap: (ctx: PropStrategyCallbackContext, storage: Uint8Array) => Uint8Array
}

export interface PropWorkerUiState {
  config: PropSimulationConfig
  currentStrategy: {
    kind: PropStrategyKind
    id: string
    name: string
    code: string
    feeBps: number
  }
  isPlaying: boolean
  tradeCount: number
  snapshot: PropSnapshot
  lastEvent: PropTradeEvent
  history: PropTradeEvent[]
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  availableStrategies: Array<{ kind: PropStrategyKind; id: string; name: string }>
  normalizerConfig: PropNormalizerConfig
}

export interface PropDepthStats {
  buyDepth1: number
  buyDepth5: number
  sellDepth1: number
  sellDepth5: number
  buyOneXCostY: number
  sellOneXPayoutY: number
}

export type PropFlowType = 'system' | 'arbitrage' | 'retail'
export type PropPool = 'submission' | 'normalizer'
export type PropOrderSide = 'buy' | 'sell'
export type PropSwapSide = 0 | 1

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
  nSteps: number
}

export interface PropSampledRegime {
  gbmSigma: number
  retailArrivalRate: number
  retailMeanSize: number
  normFeeBps: number
  normLiquidityMult: number
}

export interface PropStorageSummary {
  lastChangedBytes: number
  lastWriteStep: number | null
}

export interface PropAmmState {
  pool: PropPool
  name: string
  reserveX: number
  reserveY: number
  storage: Uint8Array<ArrayBufferLike>
}

export interface PropSwapInstruction {
  side: PropSwapSide
  inputAmountNano: bigint
  reserveXNano: bigint
  reserveYNano: bigint
  storage: Uint8Array<ArrayBufferLike>
}

export interface PropAfterSwapInstruction {
  side: PropSwapSide
  inputAmountNano: bigint
  outputAmountNano: bigint
  reserveXNano: bigint
  reserveYNano: bigint
  step: number
  storage: Uint8Array<ArrayBufferLike>
}

export interface PropStrategyRuntime {
  ref: PropStrategyRef
  name: string
  code: string
  modelUsed: string
  computeSwap: (instruction: PropSwapInstruction) => bigint
  afterSwap: (instruction: PropAfterSwapInstruction) => Uint8Array<ArrayBufferLike> | void
}

export interface PropTrade {
  side: PropSwapSide
  direction: 'buy_x' | 'sell_x'
  inputAmount: number
  outputAmount: number
  inputAmountNano: string
  outputAmountNano: string
  beforeX: number
  beforeY: number
  reserveX: number
  reserveY: number
  spotBefore: number
  spotAfter: number
}

export interface PropRetailOrder {
  side: PropOrderSide
  sizeY: number
}

export interface PropSnapshotAmm {
  x: number
  y: number
  spot: number
  k: number
}

export interface PropSnapshot {
  step: number
  fairPrice: number
  submission: PropSnapshotAmm
  normalizer: PropSnapshotAmm & {
    feeBps: number
    liquidityMult: number
  }
  edge: {
    total: number
    retail: number
    arb: number
  }
  regime: PropSampledRegime
  storage: PropStorageSummary
}

export interface PropTradeEvent {
  id: number
  step: number
  flow: PropFlowType
  pool: PropPool
  poolName: string
  isSubmissionTrade: boolean
  trade: PropTrade | null
  order: PropRetailOrder | null
  routerSplit:
    | {
        alpha: number
        submissionInput: number
        normalizerInput: number
      }
    | null
  arbProfit: number
  fairPrice: number
  priceMove: { from: number; to: number }
  edgeDelta: number
  codeLines: number[]
  codeExplanation: string
  stateBadge: string
  summary: string
  storageChangedBytes: number
  snapshot: PropSnapshot
}

export interface PropWorkerUiState {
  config: PropSimulationConfig
  currentStrategy: {
    kind: PropStrategyKind
    id: string
    name: string
    code: string
    modelUsed: string
  }
  isPlaying: boolean
  tradeCount: number
  snapshot: PropSnapshot
  lastEvent: PropTradeEvent
  history: PropTradeEvent[]
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  availableStrategies: Array<{ kind: PropStrategyKind; id: string; name: string }>
}

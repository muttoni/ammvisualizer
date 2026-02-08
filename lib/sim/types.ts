export type FlowType = 'arbitrage' | 'retail' | 'system'

export type ThemeMode = 'light' | 'dark'

export type StrategyKind = 'builtin' | 'custom'

export type ExplanationMode = 'line-level' | 'runtime'

export interface StrategyRef {
  kind: StrategyKind
  id: string
}

export interface SimulationConfig {
  seed: number
  strategyRef: StrategyRef
  playbackSpeed: number
  maxTapeRows: number
}

export interface CompilerDiagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number | null
  column: number | null
  sourceFile?: string
}

export interface StrategyLibraryItem {
  id: string
  name: string
  source: string
  compilerVersion: string
  createdAt: number
  updatedAt: number
  lastCompileStatus: 'ok' | 'error'
  lastDiagnostics: CompilerDiagnostic[]
}

export interface AmmState {
  name: string
  reserveX: number
  reserveY: number
  bidFeeBps: number
  askFeeBps: number
  feesX: number
  feesY: number
  isStrategy: boolean
}

export interface Trade {
  side: 'buy' | 'sell'
  amountX: number
  amountY: number
  timestamp: number
  reserveX: number
  reserveY: number
  beforeX: number
  beforeY: number
  feeBpsUsed: number
  spotBefore: number
  spotAfter: number
}

export interface SnapshotAmm {
  x: number
  y: number
  bid: number
  ask: number
  k: number
}

export interface Snapshot {
  step: number
  fairPrice: number
  strategy: SnapshotAmm
  normalizer: SnapshotAmm
  edge: {
    total: number
    retail: number
    arb: number
  }
}

export interface SlotChange {
  slot: number
  before: string
  after: string
}

export interface StrategyExecution {
  mode: StrategyKind
  bidFeeBps: number
  askFeeBps: number
  previousBidFeeBps: number
  previousAskFeeBps: number
  changedSlots: SlotChange[]
}

export interface TradeEvent {
  id: number
  step: number
  flow: FlowType
  ammName: string
  isStrategyTrade: boolean
  trade: Trade | null
  order: { side: 'buy' | 'sell'; sizeY: number } | null
  arbProfit: number
  fairPrice: number
  priceMove: { from: number; to: number }
  edgeDelta: number
  feeChange:
    | {
        beforeBid: number
        beforeAsk: number
        afterBid: number
        afterAsk: number
      }
    | null
  codeLines: number[]
  codeExplanation: string
  explanationMode: ExplanationMode
  stateBadge: string
  summary: string
  snapshot: Snapshot
  strategyExecution?: StrategyExecution
}

export interface StrategyCallbackContext {
  isBuy: boolean
  amountX: number
  amountY: number
  timestamp: number
  reserveX: number
  reserveY: number
  flowType: FlowType
  orderSide: 'buy' | 'sell' | null
  fairPrice: number
  edgeDelta: number
}

export interface StrategyCallbackResult {
  bidBps: number
  askBps: number
  lines: number[]
  explanation: string
  stateBadge: string
}

export interface RuntimeStrategyResult {
  bidBps: number
  askBps: number
  lines: number[]
  explanation: string
  stateBadge: string
  changedSlots: SlotChange[]
}

export interface BuiltinStrategy {
  id: string
  name: string
  code: string
  initialize: (memory: Record<string, number>) => StrategyCallbackResult
  onSwap: (memory: Record<string, number>, ctx: StrategyCallbackContext) => StrategyCallbackResult
}

export interface ActiveStrategyRuntime {
  ref: StrategyRef
  name: string
  code: string
  explanationMode: ExplanationMode
  initialize: (memory: Record<string, number>, reserveX: number, reserveY: number) => Promise<RuntimeStrategyResult>
  onSwap: (memory: Record<string, number>, ctx: StrategyCallbackContext) => Promise<RuntimeStrategyResult>
}

export interface CustomCompileResult {
  ok: boolean
  diagnostics: CompilerDiagnostic[]
  strategyId: string
  strategyName?: string
}

export interface WorkerUiState {
  config: SimulationConfig
  currentStrategy: {
    kind: StrategyKind
    id: string
    name: string
    code: string
  }
  isPlaying: boolean
  tradeCount: number
  snapshot: Snapshot
  lastEvent: TradeEvent
  history: TradeEvent[]
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  diagnostics: CompilerDiagnostic[]
  availableStrategies: Array<{ kind: StrategyKind; id: string; name: string }>
}

export interface DepthStats {
  buyDepth1: number
  buyDepth5: number
  sellDepth1: number
  sellDepth5: number
  buyOneXCostY: number
  sellOneXPayoutY: number
}

export interface ChartThemePalette {
  grid: string
  axis: string
  strategyCurve: string
  normalizerCurve: string
  trail: string
  strategyDot: string
  strategyRing: string
  normalizerDotFill: string
  normalizerDotStroke: string
  targetDot: string
  arrowStrategy: string
  arrowOther: string
  arrowHead: string
  labelMain: string
  labelSoft: string
  axisLabel: string
  legendStrategy: string
  legendNormalizer: string
  legendTrail: string
}

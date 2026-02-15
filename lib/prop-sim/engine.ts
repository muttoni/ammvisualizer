import { getChartViewWindow, type ChartWindow } from '../sim/chart'
import { formatNum, formatSigned } from '../sim/utils'
import type { Snapshot as LegacySnapshot } from '../sim/types'
import {
  ammK,
  ammSpot,
  createInitialNormalizerAmm,
  createInitialSubmissionAmm,
  executeBuyX,
  executeSellX,
  quoteNormalizerBuyX,
  quoteNormalizerSellX,
} from './amm'
import { findNormalizerArbOpportunity, findSubmissionArbOpportunity } from './arbitrage'
import {
  PROP_DEFAULT_STEPS,
  PROP_GBM_DT,
  PROP_GBM_MU,
  PROP_GBM_SIGMA_MAX,
  PROP_GBM_SIGMA_MIN,
  PROP_MIN_TRADE_SIZE,
  PROP_NORMALIZER_FEE_MAX,
  PROP_NORMALIZER_FEE_MIN,
  PROP_NORMALIZER_LIQ_MAX,
  PROP_NORMALIZER_LIQ_MIN,
  PROP_RETAIL_ARRIVAL_MAX,
  PROP_RETAIL_ARRIVAL_MIN,
  PROP_RETAIL_MEAN_SIZE_MAX,
  PROP_RETAIL_MEAN_SIZE_MIN,
} from './constants'
import { bigintToString, ensureStorageSize, fromNano, stringToBigint, toNano } from './nano'
import { GbmPriceProcess } from './priceProcess'
import { generateRetailOrders, sampleLogNormal } from './retail'
import { routeRetailOrder } from './router'
import type {
  PropAmmState,
  PropFlowType,
  PropRetailOrder,
  PropSampledRegime,
  PropSimulationConfig,
  PropSnapshot,
  PropStrategyRuntime,
  PropTrade,
  PropTradeEvent,
  PropWorkerUiState,
} from './types'
import { getStarterCodeLines } from '../prop-strategies/builtins'

interface PropRandomSource {
  next: () => number
  between: (min: number, max: number) => number
  gaussian: () => number
}

interface PropEngineState {
  config: PropSimulationConfig
  strategy: PropStrategyRuntime
  step: number
  tradeCount: number
  eventSeq: number
  fairPrice: number
  prevFairPrice: number
  regime: PropSampledRegime
  submission: PropAmmState | null
  normalizer: PropAmmState | null
  edge: {
    total: number
    retail: number
    arb: number
  }
  lastStorageChangedBytes: number
  lastStorageWriteStep: number | null
  pendingEvents: PropTradeEvent[]
  history: PropTradeEvent[]
  currentSnapshot: PropSnapshot | null
  lastEvent: PropTradeEvent | null
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: ChartWindow | null
}

interface EnqueueEventInput {
  flow: PropFlowType
  pool: 'submission' | 'normalizer'
  trade: PropTrade
  priceMove: { from: number; to: number }
  order: PropRetailOrder | null
  arbProfit: number
  routerSplit: PropTradeEvent['routerSplit']
}

function clampFinite(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value
}

export class PropSimulationEngine {
  private readonly state: PropEngineState

  constructor(config: PropSimulationConfig, strategy: PropStrategyRuntime) {
    this.state = {
      config,
      strategy,
      step: 0,
      tradeCount: 0,
      eventSeq: 0,
      fairPrice: 100,
      prevFairPrice: 100,
      regime: {
        gbmSigma: 0.001,
        retailArrivalRate: 0.8,
        retailMeanSize: 20,
        normFeeBps: 30,
        normLiquidityMult: 1,
      },
      submission: null,
      normalizer: null,
      edge: {
        total: 0,
        retail: 0,
        arb: 0,
      },
      lastStorageChangedBytes: 0,
      lastStorageWriteStep: null,
      pendingEvents: [],
      history: [],
      currentSnapshot: null,
      lastEvent: null,
      reserveTrail: [],
      viewWindow: null,
    }
  }

  public setConfig(config: Partial<PropSimulationConfig>): void {
    this.state.config = {
      ...this.state.config,
      ...config,
      nSteps: config.nSteps ?? this.state.config.nSteps,
    }

    if (this.state.history.length > this.state.config.maxTapeRows) {
      this.state.history = this.state.history.slice(0, this.state.config.maxTapeRows)
    }
  }

  public setStrategy(strategy: PropStrategyRuntime): void {
    this.state.strategy = strategy
  }

  public reset(random: PropRandomSource): void {
    this.state.step = 0
    this.state.tradeCount = 0
    this.state.eventSeq = 0
    this.state.fairPrice = 100
    this.state.prevFairPrice = 100
    this.state.pendingEvents = []
    this.state.history = []
    this.state.edge = { total: 0, retail: 0, arb: 0 }
    this.state.viewWindow = null
    this.state.lastStorageChangedBytes = 0
    this.state.lastStorageWriteStep = null

    const sampledFee = Math.floor(random.between(PROP_NORMALIZER_FEE_MIN, PROP_NORMALIZER_FEE_MAX + 1))

    this.state.regime = {
      gbmSigma: random.between(PROP_GBM_SIGMA_MIN, PROP_GBM_SIGMA_MAX),
      retailArrivalRate: random.between(PROP_RETAIL_ARRIVAL_MIN, PROP_RETAIL_ARRIVAL_MAX),
      retailMeanSize: random.between(PROP_RETAIL_MEAN_SIZE_MIN, PROP_RETAIL_MEAN_SIZE_MAX),
      normFeeBps: Math.max(PROP_NORMALIZER_FEE_MIN, Math.min(PROP_NORMALIZER_FEE_MAX, sampledFee)),
      normLiquidityMult: random.between(PROP_NORMALIZER_LIQ_MIN, PROP_NORMALIZER_LIQ_MAX),
    }

    this.state.submission = createInitialSubmissionAmm()
    this.state.normalizer = createInitialNormalizerAmm(
      this.state.regime.normLiquidityMult,
      this.state.regime.normFeeBps,
    )

    const submission = this.requireAmm(this.state.submission)
    this.state.reserveTrail = [{ x: submission.reserveX, y: submission.reserveY }]

    this.state.currentSnapshot = this.snapshotState()
    this.state.lastEvent = {
      id: 0,
      step: 0,
      flow: 'system',
      pool: 'submission',
      poolName: 'Submission',
      isSubmissionTrade: false,
      trade: null,
      order: null,
      routerSplit: null,
      arbProfit: 0,
      fairPrice: this.state.fairPrice,
      priceMove: { from: this.state.fairPrice, to: this.state.fairPrice },
      edgeDelta: 0,
      codeLines: [66, 67],
      codeExplanation:
        'Simulation initialized. Starter strategy uses constant-product pricing with 500 bps fee and no storage writes.',
      stateBadge: this.buildStateBadge(),
      summary: `Regime sampled: sigma ${(this.state.regime.gbmSigma * 100).toFixed(3)}% | lambda ${this.state.regime.retailArrivalRate.toFixed(3)} | normalizer ${this.state.regime.normFeeBps} bps @ ${this.state.regime.normLiquidityMult.toFixed(2)}x`,
      storageChangedBytes: 0,
      snapshot: this.state.currentSnapshot,
    }

    this.refreshViewWindow()
  }

  public stepOne(random: PropRandomSource): boolean {
    this.ensurePendingEvents(random)
    if (!this.state.pendingEvents.length) {
      return false
    }

    const event = this.state.pendingEvents.shift()
    if (!event) {
      return false
    }

    this.state.tradeCount += 1
    this.state.lastEvent = event
    this.state.currentSnapshot = event.snapshot

    this.trackReservePoint(event.snapshot)
    this.refreshViewWindow()

    this.state.history.unshift(event)
    if (this.state.history.length > this.state.config.maxTapeRows) {
      this.state.history.pop()
    }

    return true
  }

  private ensurePendingEvents(random: PropRandomSource): void {
    let guard = 0
    while (this.state.pendingEvents.length === 0 && guard < 8) {
      this.generateNextStep(random)
      guard += 1
      if (this.state.step >= this.state.config.nSteps) {
        break
      }
    }
  }

  private generateNextStep(random: PropRandomSource): void {
    if (this.state.step >= this.state.config.nSteps) {
      return
    }

    const submission = this.requireAmm(this.state.submission)
    const normalizer = this.requireAmm(this.state.normalizer)

    this.state.step += 1

    const oldPrice = this.state.fairPrice
    const priceProcess = new GbmPriceProcess(
      oldPrice,
      PROP_GBM_MU,
      this.state.regime.gbmSigma,
      PROP_GBM_DT,
    )
    this.state.fairPrice = clampFinite(priceProcess.step(random.gaussian()), oldPrice)
    this.state.prevFairPrice = oldPrice

    const priceMove = { from: oldPrice, to: this.state.fairPrice }

    this.runSubmissionArbitrage(submission, random, priceMove)
    this.runNormalizerArbitrage(normalizer, priceMove)

    const orders = generateRetailOrders(
      this.state.regime.retailArrivalRate,
      this.state.regime.retailMeanSize,
      () => random.next(),
      () => random.gaussian(),
    )

    for (const order of orders) {
      this.processRetailOrder(order, priceMove)
    }
  }

  private runSubmissionArbitrage(
    submission: PropAmmState,
    random: PropRandomSource,
    priceMove: { from: number; to: number },
  ): void {
    const candidate = findSubmissionArbOpportunity({
      fairPrice: this.state.fairPrice,
      quoteBuyX: (inputY) => this.quoteSubmissionSwap(submission, 0, inputY),
      quoteSellX: (inputX) => this.quoteSubmissionSwap(submission, 1, inputX),
      sampleStartY: () => sampleLogNormal(this.state.regime.retailMeanSize, 1.2, () => random.gaussian()),
    })

    if (!candidate || candidate.inputAmount <= 0) {
      return
    }

    const trade =
      candidate.side === 0
        ? executeBuyX(submission, (inputY) => this.quoteSubmissionSwap(submission, 0, inputY), candidate.inputAmount)
        : executeSellX(submission, (inputX) => this.quoteSubmissionSwap(submission, 1, inputX), candidate.inputAmount)

    if (!trade) {
      return
    }

    const arbProfit = trade.side === 0
      ? trade.outputAmount * this.state.fairPrice - trade.inputAmount
      : trade.outputAmount - trade.inputAmount * this.state.fairPrice

    this.enqueueTradeEvent({
      flow: 'arbitrage',
      pool: 'submission',
      trade,
      priceMove,
      order: null,
      arbProfit,
      routerSplit: null,
    })
  }

  private runNormalizerArbitrage(
    normalizer: PropAmmState,
    priceMove: { from: number; to: number },
  ): void {
    const candidate = findNormalizerArbOpportunity({
      amm: normalizer,
      fairPrice: this.state.fairPrice,
      quoteBuyX: (inputY) => quoteNormalizerBuyX(normalizer, inputY),
      quoteSellX: (inputX) => quoteNormalizerSellX(normalizer, inputX),
    })

    if (!candidate || candidate.inputAmount <= 0) {
      return
    }

    const trade =
      candidate.side === 0
        ? executeBuyX(normalizer, (inputY) => quoteNormalizerBuyX(normalizer, inputY), candidate.inputAmount)
        : executeSellX(normalizer, (inputX) => quoteNormalizerSellX(normalizer, inputX), candidate.inputAmount)

    if (!trade) {
      return
    }

    const arbProfit = trade.side === 0
      ? trade.outputAmount * this.state.fairPrice - trade.inputAmount
      : trade.outputAmount - trade.inputAmount * this.state.fairPrice

    this.enqueueTradeEvent({
      flow: 'arbitrage',
      pool: 'normalizer',
      trade,
      priceMove,
      order: null,
      arbProfit,
      routerSplit: null,
    })
  }

  private processRetailOrder(order: PropRetailOrder, priceMove: { from: number; to: number }): void {
    const submission = this.requireAmm(this.state.submission)
    const normalizer = this.requireAmm(this.state.normalizer)

    const decision = routeRetailOrder({
      order,
      fairPrice: this.state.fairPrice,
      quoteSubmissionBuyX: (inputY) => this.quoteSubmissionSwap(submission, 0, inputY),
      quoteSubmissionSellX: (inputX) => this.quoteSubmissionSwap(submission, 1, inputX),
      quoteNormalizerBuyX: (inputY) => quoteNormalizerBuyX(normalizer, inputY),
      quoteNormalizerSellX: (inputX) => quoteNormalizerSellX(normalizer, inputX),
    })

    if (decision.submissionInput > PROP_MIN_TRADE_SIZE && decision.submissionOutput > 0) {
      const trade =
        order.side === 'buy'
          ? executeBuyX(submission, (inputY) => this.quoteSubmissionSwap(submission, 0, inputY), decision.submissionInput)
          : executeSellX(submission, (inputX) => this.quoteSubmissionSwap(submission, 1, inputX), decision.submissionInput)

      if (trade) {
        this.enqueueTradeEvent({
          flow: 'retail',
          pool: 'submission',
          trade,
          priceMove,
          order,
          arbProfit: 0,
          routerSplit: {
            alpha: decision.alpha,
            submissionInput: decision.submissionInput,
            normalizerInput: decision.normalizerInput,
          },
        })
      }
    }

    if (decision.normalizerInput > PROP_MIN_TRADE_SIZE && decision.normalizerOutput > 0) {
      const trade =
        order.side === 'buy'
          ? executeBuyX(normalizer, (inputY) => quoteNormalizerBuyX(normalizer, inputY), decision.normalizerInput)
          : executeSellX(normalizer, (inputX) => quoteNormalizerSellX(normalizer, inputX), decision.normalizerInput)

      if (trade) {
        this.enqueueTradeEvent({
          flow: 'retail',
          pool: 'normalizer',
          trade,
          priceMove,
          order,
          arbProfit: 0,
          routerSplit: {
            alpha: decision.alpha,
            submissionInput: decision.submissionInput,
            normalizerInput: decision.normalizerInput,
          },
        })
      }
    }
  }

  private enqueueTradeEvent(input: EnqueueEventInput): void {
    const { flow, pool, trade, priceMove, order, arbProfit, routerSplit } = input

    let edgeDelta = 0
    let storageChangedBytes = 0
    let codeLines: number[] = []
    let codeExplanation = 'Trade executed on normalizer. Submission strategy was not invoked.'

    if (pool === 'submission') {
      if (flow === 'arbitrage') {
        edgeDelta = -arbProfit
        this.state.edge.arb += edgeDelta
      } else {
        edgeDelta = this.computeRetailEdge(trade)
        this.state.edge.retail += edgeDelta
      }
      this.state.edge.total += edgeDelta

      storageChangedBytes = this.applyAfterSwap(trade)
      codeLines = getStarterCodeLines(trade.side)
      codeExplanation = this.describeSubmissionExecution(flow, trade, edgeDelta, storageChangedBytes)
    }

    const event: PropTradeEvent = {
      id: ++this.state.eventSeq,
      step: this.state.step,
      flow,
      pool,
      poolName: pool === 'submission' ? 'Submission' : 'Normalizer',
      isSubmissionTrade: pool === 'submission',
      trade,
      order,
      routerSplit,
      arbProfit,
      fairPrice: this.state.fairPrice,
      priceMove,
      edgeDelta,
      codeLines,
      codeExplanation,
      stateBadge: this.buildStateBadge(),
      summary: this.describeTrade(pool, flow, trade, order),
      storageChangedBytes,
      snapshot: this.snapshotState(),
    }

    this.state.pendingEvents.push(event)
  }

  private computeRetailEdge(trade: PropTrade): number {
    if (trade.side === 1) {
      return trade.inputAmount * this.state.fairPrice - trade.outputAmount
    }

    return trade.inputAmount - trade.outputAmount * this.state.fairPrice
  }

  private applyAfterSwap(trade: PropTrade): number {
    const submission = this.requireAmm(this.state.submission)
    const beforeStorage = submission.storage
    const workingStorage = beforeStorage.slice() as Uint8Array<ArrayBufferLike>

    const side = trade.side
    const instruction = {
      side,
      inputAmountNano: stringToBigint(trade.inputAmountNano),
      outputAmountNano: stringToBigint(trade.outputAmountNano),
      reserveXNano: toNano(trade.reserveX),
      reserveYNano: toNano(trade.reserveY),
      step: this.state.step,
      storage: workingStorage,
    }

    let nextStorage: Uint8Array<ArrayBufferLike> = workingStorage
    try {
      const maybeNext = this.state.strategy.afterSwap(instruction)
      if (maybeNext instanceof Uint8Array) {
        nextStorage = ensureStorageSize(maybeNext)
      } else {
        nextStorage = ensureStorageSize(workingStorage)
      }
    } catch {
      nextStorage = beforeStorage
    }

    let changedBytes = 0
    for (let index = 0; index < beforeStorage.length; index += 1) {
      if (beforeStorage[index] !== nextStorage[index]) {
        changedBytes += 1
      }
    }

    submission.storage = nextStorage
    this.state.lastStorageChangedBytes = changedBytes

    if (changedBytes > 0) {
      this.state.lastStorageWriteStep = this.state.step
    }

    return changedBytes
  }

  private quoteSubmissionSwap(amm: PropAmmState, side: 0 | 1, inputAmount: number): number {
    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      return 0
    }

    const outputNano = this.state.strategy.computeSwap({
      side,
      inputAmountNano: toNano(inputAmount),
      reserveXNano: toNano(amm.reserveX),
      reserveYNano: toNano(amm.reserveY),
      storage: amm.storage,
    })

    const output = fromNano(outputNano)

    if (!Number.isFinite(output) || output <= 0) {
      return 0
    }

    if (side === 0 && output >= amm.reserveX) {
      return 0
    }

    if (side === 1 && output >= amm.reserveY) {
      return 0
    }

    return output
  }

  private describeSubmissionExecution(
    flow: PropFlowType,
    trade: PropTrade,
    edgeDelta: number,
    storageChangedBytes: number,
  ): string {
    const branch = trade.side === 0 ? '`compute_swap` buy-X branch' : '`compute_swap` sell-X branch'
    const flowLabel = flow === 'arbitrage' ? 'arbitrage' : 'retail'
    return `${branch} executed for ${flowLabel}. input=${formatNum(trade.inputAmount, 4)}, output=${formatNum(trade.outputAmount, 4)}, edge delta=${formatSigned(edgeDelta)}, storage changed=${storageChangedBytes} bytes.`
  }

  private describeTrade(
    pool: 'submission' | 'normalizer',
    flow: PropFlowType,
    trade: PropTrade,
    order: PropRetailOrder | null,
  ): string {
    const direction = trade.side === 0 ? 'buy X (Y in)' : 'sell X (X in)'
    const base = `${pool}: ${direction} | in=${formatNum(trade.inputAmount, 4)} out=${formatNum(trade.outputAmount, 4)}`

    if (flow === 'arbitrage') {
      return `${base} | fair=${formatNum(this.state.fairPrice, 4)}`
    }

    return `${base} | retail ${order?.side ?? 'n/a'} ${formatNum(order?.sizeY ?? 0, 3)} Y`
  }

  private buildStateBadge(): string {
    const lastWrite = this.state.lastStorageWriteStep === null ? 'n/a' : `step ${this.state.lastStorageWriteStep}`
    return `storage Δ=${this.state.lastStorageChangedBytes} bytes | last write: ${lastWrite}`
  }

  private snapshotState(): PropSnapshot {
    const submission = this.requireAmm(this.state.submission)
    const normalizer = this.requireAmm(this.state.normalizer)

    return {
      step: this.state.step,
      fairPrice: this.state.fairPrice,
      submission: {
        x: submission.reserveX,
        y: submission.reserveY,
        spot: ammSpot(submission),
        k: ammK(submission),
      },
      normalizer: {
        x: normalizer.reserveX,
        y: normalizer.reserveY,
        spot: ammSpot(normalizer),
        k: ammK(normalizer),
        feeBps: this.state.regime.normFeeBps,
        liquidityMult: this.state.regime.normLiquidityMult,
      },
      edge: {
        total: this.state.edge.total,
        retail: this.state.edge.retail,
        arb: this.state.edge.arb,
      },
      regime: this.state.regime,
      storage: {
        lastChangedBytes: this.state.lastStorageChangedBytes,
        lastWriteStep: this.state.lastStorageWriteStep,
      },
    }
  }

  private toLegacySnapshot(snapshot: PropSnapshot): LegacySnapshot {
    return {
      step: snapshot.step,
      fairPrice: snapshot.fairPrice,
      strategy: {
        x: snapshot.submission.x,
        y: snapshot.submission.y,
        bid: 500,
        ask: 500,
        k: snapshot.submission.k,
      },
      normalizer: {
        x: snapshot.normalizer.x,
        y: snapshot.normalizer.y,
        bid: snapshot.normalizer.feeBps,
        ask: snapshot.normalizer.feeBps,
        k: snapshot.normalizer.k,
      },
      edge: snapshot.edge,
    }
  }

  private refreshViewWindow(): void {
    if (!this.state.currentSnapshot) {
      return
    }

    const legacy = this.toLegacySnapshot(this.state.currentSnapshot)
    const targetX = Math.sqrt(legacy.strategy.k / Math.max(legacy.fairPrice, 1e-9))
    const targetY = legacy.strategy.k / Math.max(targetX, 1e-9)

    this.state.viewWindow = getChartViewWindow(
      legacy,
      targetX,
      targetY,
      this.state.reserveTrail,
      this.state.viewWindow,
    )
  }

  private trackReservePoint(snapshot: PropSnapshot): void {
    const point = { x: snapshot.submission.x, y: snapshot.submission.y }
    const last = this.state.reserveTrail[this.state.reserveTrail.length - 1]

    if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-3) {
      return
    }

    this.state.reserveTrail.push(point)
    if (this.state.reserveTrail.length > 180) {
      this.state.reserveTrail.shift()
    }
  }

  private requireAmm(amm: PropAmmState | null): PropAmmState {
    if (!amm) {
      throw new Error('Prop AMM state is not initialized')
    }

    return amm
  }

  public toUiState(
    availableStrategies: Array<{ kind: 'builtin'; id: string; name: string }>,
    isPlaying: boolean,
  ): PropWorkerUiState {
    if (!this.state.currentSnapshot || !this.state.lastEvent) {
      throw new Error('Prop simulation is not initialized')
    }

    return {
      config: {
        ...this.state.config,
        nSteps: this.state.config.nSteps || PROP_DEFAULT_STEPS,
      },
      currentStrategy: {
        kind: this.state.strategy.ref.kind,
        id: this.state.strategy.ref.id,
        name: this.state.strategy.name,
        code: this.state.strategy.code,
        modelUsed: this.state.strategy.modelUsed,
      },
      isPlaying,
      tradeCount: this.state.tradeCount,
      snapshot: this.state.currentSnapshot,
      lastEvent: this.state.lastEvent,
      history: this.state.history,
      reserveTrail: this.state.reserveTrail,
      viewWindow: this.state.viewWindow,
      availableStrategies,
    }
  }
}

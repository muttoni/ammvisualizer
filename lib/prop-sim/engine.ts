import {
  createPropAmm,
  executePropBuyX,
  executePropSellX,
  findPropArbOpportunity,
  formatNum,
  formatSigned,
  fromScaledBigInt,
  normalizerQuoteBuyX,
  normalizerQuoteSellX,
  propAmmK,
  propAmmSpot,
  routePropRetailOrder,
  toScaledBigInt,
  type PropQuoteFn,
} from './math'
import type {
  PropActiveStrategyRuntime,
  PropAmmState,
  PropNormalizerConfig,
  PropSimulationConfig,
  PropSnapshot,
  PropStorageChange,
  PropTrade,
  PropTradeEvent,
  PropWorkerUiState,
} from './types'
import {
  PROP_INITIAL_RESERVE_X,
  PROP_INITIAL_RESERVE_Y,
  PROP_NORMALIZER_FEE_MAX,
  PROP_NORMALIZER_FEE_MIN,
  PROP_NORMALIZER_LIQ_MAX,
  PROP_NORMALIZER_LIQ_MIN,
  PROP_STORAGE_SIZE,
  PROP_VOLATILITY_MAX,
  PROP_VOLATILITY_MIN,
  PROP_ARRIVAL_RATE_MAX,
  PROP_ARRIVAL_RATE_MIN,
  PROP_ORDER_SIZE_MEAN_MAX,
  PROP_ORDER_SIZE_MEAN_MIN,
  PROP_ORDER_SIZE_SIGMA,
} from './constants'
import { getChartViewWindow, trackReservePoint, type ChartWindow } from '../sim/chart'

interface PropEngineState {
  config: PropSimulationConfig
  strategy: PropActiveStrategyRuntime
  step: number
  tradeCount: number
  eventSeq: number
  fairPrice: number
  prevFairPrice: number
  storage: Uint8Array
  strategyAmm: PropAmmState | null
  normalizerAmm: PropAmmState | null
  normalizerConfig: PropNormalizerConfig
  simulationParams: {
    volatility: number
    arrivalRate: number
    orderSizeMean: number
  }
  edge: {
    total: number
    retail: number
    arb: number
  }
  impliedFees: {
    bidBps: number
    askBps: number
  }
  pendingEvents: PropTradeEvent[]
  history: PropTradeEvent[]
  currentSnapshot: PropSnapshot | null
  lastEvent: PropTradeEvent | null
  lastBadge: string
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: ChartWindow | null
}

interface PropTradeEventInput {
  flow: PropTradeEvent['flow']
  amm: PropAmmState
  trade: PropTrade
  order: PropTradeEvent['order']
  arbProfit: number
  priceMove: { from: number; to: number }
}

export class PropSimulationEngine {
  private readonly state: PropEngineState

  constructor(config: PropSimulationConfig, strategy: PropActiveStrategyRuntime) {
    this.state = {
      config,
      strategy,
      step: 0,
      tradeCount: 0,
      eventSeq: 0,
      fairPrice: 100,
      prevFairPrice: 100,
      storage: new Uint8Array(PROP_STORAGE_SIZE),
      strategyAmm: null,
      normalizerAmm: null,
      normalizerConfig: { feeBps: 30, liquidityMult: 1.0 },
      simulationParams: {
        volatility: 0.003,
        arrivalRate: 0.8,
        orderSizeMean: 20,
      },
      edge: { total: 0, retail: 0, arb: 0 },
      impliedFees: { bidBps: 0, askBps: 0 },
      pendingEvents: [],
      history: [],
      currentSnapshot: null,
      lastEvent: null,
      lastBadge: '',
      reserveTrail: [],
      viewWindow: null,
    }
  }

  public setConfig(config: PropSimulationConfig): void {
    this.state.config = config
    if (this.state.history.length > config.maxTapeRows) {
      this.state.history = this.state.history.slice(0, config.maxTapeRows)
    }
  }

  public setStrategy(strategy: PropActiveStrategyRuntime): void {
    this.state.strategy = strategy
  }

  public reset(
    randomBetween: (min: number, max: number) => number,
  ): void {
    this.state.step = 0
    this.state.tradeCount = 0
    this.state.eventSeq = 0
    this.state.fairPrice = 100
    this.state.prevFairPrice = 100
    this.state.pendingEvents = []
    this.state.history = []
    this.state.storage = new Uint8Array(PROP_STORAGE_SIZE)
    this.state.edge = { total: 0, retail: 0, arb: 0 }
    this.state.viewWindow = null

    // Sample simulation parameters
    this.state.simulationParams = {
      volatility: randomBetween(PROP_VOLATILITY_MIN, PROP_VOLATILITY_MAX),
      arrivalRate: randomBetween(PROP_ARRIVAL_RATE_MIN, PROP_ARRIVAL_RATE_MAX),
      orderSizeMean: randomBetween(PROP_ORDER_SIZE_MEAN_MIN, PROP_ORDER_SIZE_MEAN_MAX),
    }

    // Sample normalizer config
    this.state.normalizerConfig = {
      feeBps: Math.round(randomBetween(PROP_NORMALIZER_FEE_MIN, PROP_NORMALIZER_FEE_MAX)),
      liquidityMult: randomBetween(PROP_NORMALIZER_LIQ_MIN, PROP_NORMALIZER_LIQ_MAX),
    }

    // Create AMMs
    this.state.strategyAmm = createPropAmm(
      this.state.strategy.name,
      PROP_INITIAL_RESERVE_X,
      PROP_INITIAL_RESERVE_Y,
      true,
    )

    const normX = PROP_INITIAL_RESERVE_X * this.state.normalizerConfig.liquidityMult
    const normY = PROP_INITIAL_RESERVE_Y * this.state.normalizerConfig.liquidityMult
    this.state.normalizerAmm = createPropAmm(
      `Normalizer (${this.state.normalizerConfig.feeBps} bps)`,
      normX,
      normY,
      false,
    )

    // Initialize implied fees from strategy
    this.state.impliedFees = {
      bidBps: this.state.strategy.feeBps,
      askBps: this.state.strategy.feeBps,
    }

    this.state.reserveTrail = [{ x: this.state.strategyAmm.reserveX, y: this.state.strategyAmm.reserveY }]
    this.state.lastBadge = this.formatFeeBadge()
    this.state.currentSnapshot = this.snapshotState()

    this.state.lastEvent = {
      id: 0,
      step: 0,
      flow: 'system',
      ammName: this.state.strategyAmm.name,
      isStrategyTrade: false,
      codeLines: [],
      codeExplanation: `Simulation initialized. Normalizer: ${this.state.normalizerConfig.feeBps} bps @ ${this.state.normalizerConfig.liquidityMult.toFixed(2)}x liquidity. Volatility: ${(this.state.simulationParams.volatility * 100).toFixed(3)}%/step.`,
      stateBadge: this.state.lastBadge,
      summary: 'Simulation initialized.',
      edgeDelta: 0,
      trade: null,
      order: null,
      arbProfit: 0,
      fairPrice: this.state.fairPrice,
      priceMove: { from: this.state.fairPrice, to: this.state.fairPrice },
      snapshot: this.state.currentSnapshot,
    }

    this.refreshViewWindow()
  }

  public stepOne(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): boolean {
    this.ensurePendingEvents(randomBetween, gaussianRandom)
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

    this.state.reserveTrail = trackReservePoint(this.state.reserveTrail, event.snapshot)
    this.refreshViewWindow()

    this.state.history.unshift(event)
    if (this.state.history.length > this.state.config.maxTapeRows) {
      this.state.history.pop()
    }

    return true
  }

  private refreshViewWindow(): void {
    if (!this.state.currentSnapshot) return

    const targetX = Math.sqrt(this.state.currentSnapshot.strategy.k / this.state.currentSnapshot.fairPrice)
    const targetY = this.state.currentSnapshot.strategy.k / targetX

    this.state.viewWindow = getChartViewWindow(
      this.state.currentSnapshot as unknown as Parameters<typeof getChartViewWindow>[0],
      targetX,
      targetY,
      this.state.reserveTrail,
      this.state.viewWindow,
    )
  }

  private ensurePendingEvents(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): void {
    let guard = 0
    while (this.state.pendingEvents.length === 0 && guard < 8) {
      this.generateNextStep(randomBetween, gaussianRandom)
      guard += 1
    }
  }

  private generateNextStep(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): void {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    this.state.step += 1

    // Price move (GBM)
    const oldPrice = this.state.fairPrice
    const sigma = this.state.simulationParams.volatility
    const shock = gaussianRandom()
    this.state.fairPrice = Math.max(1, oldPrice * Math.exp(-0.5 * sigma * sigma + sigma * shock))
    this.state.prevFairPrice = oldPrice

    const priceMove = { from: oldPrice, to: this.state.fairPrice }

    // Run arbitrage on both AMMs
    this.runArbitrageForAmm(strategyAmm, this.makeStrategyQuoteFn(), priceMove, true)
    this.runArbitrageForAmm(normalizerAmm, this.makeNormalizerQuoteFn(), priceMove, false)

    // Route retail order (Poisson arrival)
    if (randomBetween(0, 1) < this.state.simulationParams.arrivalRate) {
      const order = this.generateRetailOrder(randomBetween, gaussianRandom)
      this.routeRetailOrder(order, priceMove)
    }
  }

  private makeStrategyQuoteFn(): PropQuoteFn {
    const strategy = this.state.strategy
    const storage = this.state.storage
    const amm = this.requireAmm(this.state.strategyAmm)

    return (side: 0 | 1, inputAmount: number): number => {
      return strategy.computeSwap(amm.reserveX, amm.reserveY, side, inputAmount, storage)
    }
  }

  private makeNormalizerQuoteFn(): PropQuoteFn {
    const amm = this.requireAmm(this.state.normalizerAmm)
    const feeBps = this.state.normalizerConfig.feeBps

    return (side: 0 | 1, inputAmount: number): number => {
      if (side === 0) {
        return normalizerQuoteBuyX(amm.reserveX, amm.reserveY, feeBps, inputAmount)
      } else {
        return normalizerQuoteSellX(amm.reserveX, amm.reserveY, feeBps, inputAmount)
      }
    }
  }

  private runArbitrageForAmm(
    amm: PropAmmState,
    quoteFn: PropQuoteFn,
    priceMove: { from: number; to: number },
    isStrategy: boolean,
  ): void {
    const arb = findPropArbOpportunity(amm, this.state.fairPrice, quoteFn)
    if (!arb || arb.inputAmount <= 0.00000001) {
      return
    }

    let trade: PropTrade | null = null

    if (arb.side === 'buy') {
      // Arb buys X from AMM (inputs Y)
      trade = executePropBuyX(amm, quoteFn, arb.inputAmount, this.state.step)
    } else {
      // Arb sells X to AMM (inputs X)
      trade = executePropSellX(amm, quoteFn, arb.inputAmount, this.state.step)
    }

    if (!trade) {
      return
    }

    this.enqueueTradeEvent({
      flow: 'arbitrage',
      amm,
      trade,
      order: null,
      arbProfit: arb.expectedProfit,
      priceMove,
    }, isStrategy, quoteFn)
  }

  private routeRetailOrder(
    order: { side: 'buy' | 'sell'; sizeY: number },
    priceMove: { from: number; to: number },
  ): void {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    const strategyQuote = this.makeStrategyQuoteFn()
    const normalizerQuote = this.makeNormalizerQuoteFn()

    const splits = routePropRetailOrder(
      strategyAmm,
      normalizerAmm,
      strategyQuote,
      normalizerQuote,
      order,
    )

    for (const [amm, amount, quoteFn] of splits) {
      const isStrategy = amm.isStrategy
      let trade: PropTrade | null = null

      if (order.side === 'buy') {
        // Retail buys X (inputs Y)
        trade = executePropBuyX(amm, quoteFn, amount, this.state.step)
      } else {
        // Retail sells X (inputs X)
        trade = executePropSellX(amm, quoteFn, amount, this.state.step)
      }

      if (trade) {
        this.enqueueTradeEvent({
          flow: 'retail',
          amm,
          trade,
          order,
          arbProfit: 0,
          priceMove,
        }, isStrategy, quoteFn)
      }
    }
  }

  private enqueueTradeEvent(
    input: PropTradeEventInput,
    isStrategy: boolean,
    quoteFn: PropQuoteFn,
  ): void {
    const { flow, amm, trade, order, arbProfit, priceMove } = input

    let edgeDelta = 0
    if (isStrategy) {
      if (flow === 'arbitrage') {
        edgeDelta = -arbProfit
        this.state.edge.arb += edgeDelta
      } else {
        // Retail edge calculation
        if (trade.side === 'buy') {
          // AMM bought X: edge = outputY - inputX * fairPrice
          edgeDelta = trade.outputAmount - trade.inputAmount * this.state.fairPrice
        } else {
          // AMM sold X: edge = inputY - outputX * fairPrice
          edgeDelta = trade.inputAmount - trade.outputAmount * this.state.fairPrice
        }
        this.state.edge.retail += edgeDelta
      }
      this.state.edge.total += edgeDelta

      // Update implied fees from last trade
      this.state.impliedFees = {
        bidBps: trade.side === 'buy' ? trade.impliedFeeBps : this.state.impliedFees.bidBps,
        askBps: trade.side === 'sell' ? trade.impliedFeeBps : this.state.impliedFees.askBps,
      }

      // Call afterSwap
      const ctx = {
        side: (trade.side === 'buy' ? 1 : 0) as 0 | 1,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
        reserveX: trade.reserveX,
        reserveY: trade.reserveY,
        step: this.state.step,
        flowType: flow,
        fairPrice: this.state.fairPrice,
        edgeDelta,
      }
      this.state.storage = this.state.strategy.afterSwap(ctx, this.state.storage)
    }

    const codeExplanation = isStrategy
      ? this.describeStrategyExecution(trade, flow, edgeDelta)
      : 'Trade hit the normalizer AMM.'

    const stateBadge = this.formatFeeBadge()
    this.state.lastBadge = stateBadge

    const event: PropTradeEvent = {
      id: ++this.state.eventSeq,
      step: this.state.step,
      flow,
      ammName: amm.name,
      isStrategyTrade: isStrategy,
      trade,
      order,
      arbProfit,
      fairPrice: this.state.fairPrice,
      priceMove,
      edgeDelta,
      codeLines: isStrategy ? [1] : [],
      codeExplanation,
      stateBadge,
      summary: this.describeTrade(flow, amm, trade, order),
      snapshot: this.snapshotState(),
      strategyExecution: isStrategy ? {
        outputAmount: trade.outputAmount,
        storageChanges: [],
      } : undefined,
    }

    this.state.pendingEvents.push(event)
  }

  private describeStrategyExecution(
    trade: PropTrade,
    flow: PropTradeEvent['flow'],
    edgeDelta: number,
  ): string {
    const side = trade.side === 'buy' ? 'sold X' : 'bought X'
    const input = formatNum(trade.inputAmount, 4)
    const output = formatNum(trade.outputAmount, 4)
    const implied = trade.impliedFeeBps
    const edge = formatSigned(edgeDelta)

    return `compute_swap: AMM ${side}. Input: ${input}, Output: ${output}. Implied fee: ~${implied} bps. Edge delta: ${edge}.`
  }

  private describeTrade(
    flow: PropTradeEvent['flow'],
    amm: PropAmmState,
    trade: PropTrade,
    order: { side: 'buy' | 'sell'; sizeY: number } | null,
  ): string {
    const move = trade.side === 'buy' ? 'bought X (sold Y)' : 'sold X (bought Y)'
    const base = `${amm.name}: ${move} | in=${formatNum(trade.inputAmount, 4)} | out=${formatNum(trade.outputAmount, 4)}`

    if (flow === 'arbitrage') {
      return `${base} | arb vs fair ${formatNum(this.state.fairPrice, 2)}`
    }

    const orderLabel = order ? `${order.side} ${formatNum(order.sizeY, 2)} Y` : 'retail'
    return `${base} | routed from ${orderLabel}`
  }

  private generateRetailOrder(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): { side: 'buy' | 'sell'; sizeY: number } {
    const side: 'buy' | 'sell' = randomBetween(0, 1) < 0.5 ? 'buy' : 'sell'
    const mu = Math.log(this.state.simulationParams.orderSizeMean) - 0.5 * PROP_ORDER_SIZE_SIGMA * PROP_ORDER_SIZE_SIGMA
    const sample = Math.exp(mu + PROP_ORDER_SIZE_SIGMA * gaussianRandom())
    const sizeY = Math.max(4, Math.min(100, sample))
    return { side, sizeY }
  }

  private snapshotState(): PropSnapshot {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    return {
      step: this.state.step,
      fairPrice: this.state.fairPrice,
      strategy: {
        x: strategyAmm.reserveX,
        y: strategyAmm.reserveY,
        k: propAmmK(strategyAmm),
        impliedBidBps: this.state.impliedFees.bidBps,
        impliedAskBps: this.state.impliedFees.askBps,
      },
      normalizer: {
        x: normalizerAmm.reserveX,
        y: normalizerAmm.reserveY,
        k: propAmmK(normalizerAmm),
        feeBps: this.state.normalizerConfig.feeBps,
        liquidityMult: this.state.normalizerConfig.liquidityMult,
      },
      edge: { ...this.state.edge },
      simulationParams: {
        volatility: this.state.simulationParams.volatility,
        arrivalRate: this.state.simulationParams.arrivalRate,
      },
    }
  }

  private formatFeeBadge(): string {
    const bid = this.state.impliedFees.bidBps
    const ask = this.state.impliedFees.askBps
    const norm = this.state.normalizerConfig
    return `implied: ${bid}/${ask} bps | norm: ${norm.feeBps} bps @ ${norm.liquidityMult.toFixed(2)}x`
  }

  private requireAmm(amm: PropAmmState | null): PropAmmState {
    if (!amm) {
      throw new Error('AMM state not initialized')
    }
    return amm
  }

  public toUiState(
    availableStrategies: Array<{ kind: 'builtin'; id: string; name: string }>,
    isPlaying: boolean,
  ): PropWorkerUiState {
    if (!this.state.currentSnapshot || !this.state.lastEvent) {
      throw new Error('Simulation is not initialized')
    }

    return {
      config: this.state.config,
      currentStrategy: {
        kind: this.state.strategy.ref.kind,
        id: this.state.strategy.ref.id,
        name: this.state.strategy.name,
        code: this.state.strategy.code,
        feeBps: this.state.strategy.feeBps,
      },
      isPlaying,
      tradeCount: this.state.tradeCount,
      snapshot: this.state.currentSnapshot,
      lastEvent: this.state.lastEvent,
      history: this.state.history,
      reserveTrail: this.state.reserveTrail,
      viewWindow: this.state.viewWindow,
      availableStrategies,
      normalizerConfig: this.state.normalizerConfig,
    }
  }
}

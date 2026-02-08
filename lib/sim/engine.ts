import {
  ammK,
  createAmm,
  executeBuyX,
  executeBuyXWithY,
  executeSellX,
  findArbOpportunity,
  splitBuyTwoAmms,
  splitSellTwoAmms,
} from './math'
import { getChartViewWindow, trackReservePoint, type ChartWindow } from './chart'
import { clampBps, formatNum } from './utils'
import type {
  ActiveStrategyRuntime,
  AmmState,
  RuntimeStrategyResult,
  SimulationConfig,
  Snapshot,
  StrategyCallbackContext,
  Trade,
  TradeEvent,
  WorkerUiState,
} from './types'

interface EngineState {
  config: SimulationConfig
  strategy: ActiveStrategyRuntime
  step: number
  tradeCount: number
  eventSeq: number
  fairPrice: number
  prevFairPrice: number
  strategyMemory: Record<string, number>
  strategyAmm: AmmState | null
  normalizerAmm: AmmState | null
  edge: {
    total: number
    retail: number
    arb: number
  }
  pendingEvents: TradeEvent[]
  history: TradeEvent[]
  currentSnapshot: Snapshot | null
  lastEvent: TradeEvent | null
  lastBadge: string
  reserveTrail: Array<{ x: number; y: number }>
  viewWindow: ChartWindow | null
}

interface TradeEventInput {
  flow: TradeEvent['flow']
  amm: AmmState
  trade: Trade
  order: TradeEvent['order']
  arbProfit: number
  priceMove: { from: number; to: number }
}

const INITIAL_RESERVE_X = 100
const INITIAL_RESERVE_Y = 10_000

export class SimulationEngine {
  private readonly state: EngineState

  constructor(config: SimulationConfig, strategy: ActiveStrategyRuntime) {
    this.state = {
      config,
      strategy,
      step: 0,
      tradeCount: 0,
      eventSeq: 0,
      fairPrice: 100,
      prevFairPrice: 100,
      strategyMemory: {},
      strategyAmm: null,
      normalizerAmm: null,
      edge: {
        total: 0,
        retail: 0,
        arb: 0,
      },
      pendingEvents: [],
      history: [],
      currentSnapshot: null,
      lastEvent: null,
      lastBadge: '',
      reserveTrail: [],
      viewWindow: null,
    }
  }

  public setConfig(config: SimulationConfig): void {
    this.state.config = config
    if (this.state.history.length > config.maxTapeRows) {
      this.state.history = this.state.history.slice(0, config.maxTapeRows)
    }
  }

  public setStrategy(strategy: ActiveStrategyRuntime): void {
    this.state.strategy = strategy
  }

  public async reset(seedRngReset: () => void): Promise<void> {
    seedRngReset()

    this.state.step = 0
    this.state.tradeCount = 0
    this.state.eventSeq = 0
    this.state.fairPrice = 100
    this.state.prevFairPrice = 100
    this.state.pendingEvents = []
    this.state.history = []
    this.state.strategyMemory = {}
    this.state.edge = { total: 0, retail: 0, arb: 0 }
    this.state.viewWindow = null

    const initResult = await this.state.strategy.initialize(this.state.strategyMemory, INITIAL_RESERVE_X, INITIAL_RESERVE_Y)
    const initialBid = clampBps(initResult.bidBps)
    const initialAsk = clampBps(initResult.askBps)

    this.state.strategyAmm = createAmm(this.state.strategy.name, INITIAL_RESERVE_X, INITIAL_RESERVE_Y, initialBid, initialAsk, true)
    this.state.normalizerAmm = createAmm('Normalizer 30 bps', INITIAL_RESERVE_X, INITIAL_RESERVE_Y, 30, 30, false)
    this.state.reserveTrail = [{ x: this.state.strategyAmm.reserveX, y: this.state.strategyAmm.reserveY }]

    this.state.lastBadge = initResult.stateBadge || this.formatFeeBadge(this.state.strategyAmm)
    this.state.currentSnapshot = this.snapshotState()

    this.state.lastEvent = {
      id: 0,
      step: 0,
      flow: 'system',
      ammName: this.state.strategyAmm.name,
      isStrategyTrade: false,
      codeLines: initResult.lines || [],
      codeExplanation: initResult.explanation || 'Initialized.',
      explanationMode: this.state.strategy.explanationMode,
      stateBadge: this.state.lastBadge,
      summary: 'Simulation initialized.',
      edgeDelta: 0,
      trade: null,
      order: null,
      arbProfit: 0,
      fairPrice: this.state.fairPrice,
      priceMove: { from: this.state.fairPrice, to: this.state.fairPrice },
      feeChange: null,
      snapshot: this.state.currentSnapshot,
      strategyExecution: {
        mode: this.state.strategy.ref.kind,
        bidFeeBps: initialBid,
        askFeeBps: initialAsk,
        previousBidFeeBps: initialBid,
        previousAskFeeBps: initialAsk,
        changedSlots: initResult.changedSlots,
      },
    }

    this.refreshViewWindow()
  }

  public async stepOne(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): Promise<boolean> {
    await this.ensurePendingEvents(randomBetween, gaussianRandom)
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
      this.state.currentSnapshot,
      targetX,
      targetY,
      this.state.reserveTrail,
      this.state.viewWindow,
    )
  }

  private async ensurePendingEvents(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): Promise<void> {
    let guard = 0
    while (this.state.pendingEvents.length === 0 && guard < 8) {
      await this.generateNextStep(randomBetween, gaussianRandom)
      guard += 1
    }
  }

  private async generateNextStep(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): Promise<void> {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    this.state.step += 1

    const oldPrice = this.state.fairPrice
    const sigma = randomBetween(0.00088, 0.00101)
    const shock = gaussianRandom()
    this.state.fairPrice = Math.max(1, oldPrice * Math.exp(-0.5 * sigma * sigma + sigma * shock))
    this.state.prevFairPrice = oldPrice

    const priceMove = { from: oldPrice, to: this.state.fairPrice }

    await this.runArbitrageForAmm(strategyAmm, priceMove)
    await this.runArbitrageForAmm(normalizerAmm, priceMove)

    const order = this.generateRetailOrder(randomBetween, gaussianRandom)
    await this.routeRetailOrder(order, priceMove)
  }

  private async runArbitrageForAmm(amm: AmmState, priceMove: { from: number; to: number }): Promise<void> {
    const arb = findArbOpportunity(amm, this.state.fairPrice)
    if (!arb || arb.amountX <= 0.00000001) {
      return
    }

    const trade = arb.side === 'sell' ? executeSellX(amm, arb.amountX, this.state.step) : executeBuyX(amm, arb.amountX, this.state.step)

    if (!trade) {
      return
    }

    const profit =
      arb.side === 'sell'
        ? trade.amountX * this.state.fairPrice - trade.amountY
        : trade.amountY - trade.amountX * this.state.fairPrice

    await this.enqueueTradeEvent({
      flow: 'arbitrage',
      amm,
      trade,
      order: null,
      arbProfit: profit,
      priceMove,
    })
  }

  private async routeRetailOrder(order: { side: 'buy' | 'sell'; sizeY: number }, priceMove: { from: number; to: number }): Promise<void> {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    if (order.side === 'buy') {
      const splits = splitBuyTwoAmms(strategyAmm, normalizerAmm, order.sizeY)
      for (const [amm, yAmount] of splits) {
        if (yAmount <= 0.0001) continue

        const trade = executeBuyXWithY(amm, yAmount, this.state.step)
        if (!trade) continue

        await this.enqueueTradeEvent({
          flow: 'retail',
          amm,
          trade,
          order,
          arbProfit: 0,
          priceMove,
        })
      }
      return
    }

    const totalX = order.sizeY / this.state.fairPrice
    const splits = splitSellTwoAmms(strategyAmm, normalizerAmm, totalX)

    for (const [amm, xAmount] of splits) {
      if (xAmount <= 0.0001) continue

      const trade = executeBuyX(amm, xAmount, this.state.step)
      if (!trade) continue

      await this.enqueueTradeEvent({
        flow: 'retail',
        amm,
        trade,
        order,
        arbProfit: 0,
        priceMove,
      })
    }
  }

  private async enqueueTradeEvent({ flow, amm, trade, order, arbProfit, priceMove }: TradeEventInput): Promise<void> {
    const isStrategyTrade = amm.isStrategy

    let edgeDelta = 0
    if (isStrategyTrade) {
      if (flow === 'arbitrage') {
        edgeDelta = -arbProfit
        this.state.edge.arb += edgeDelta
      } else {
        edgeDelta = trade.side === 'buy' ? trade.amountX * this.state.fairPrice - trade.amountY : trade.amountY - trade.amountX * this.state.fairPrice
        this.state.edge.retail += edgeDelta
      }

      this.state.edge.total += edgeDelta
    }

    let codeLines: number[] = []
    let codeExplanation = 'Trade hit the normalizer AMM, so your strategy `afterSwap` was not called.'
    let stateBadge = this.state.lastBadge
    let feeChange: TradeEvent['feeChange'] = null
    let strategyExecution: TradeEvent['strategyExecution']

    if (isStrategyTrade) {
      const beforeBid = amm.bidFeeBps
      const beforeAsk = amm.askFeeBps

      const callbackContext: StrategyCallbackContext = {
        isBuy: trade.side === 'buy',
        amountX: trade.amountX,
        amountY: trade.amountY,
        timestamp: trade.timestamp,
        reserveX: trade.reserveX,
        reserveY: trade.reserveY,
        flowType: flow,
        orderSide: order ? order.side : null,
        fairPrice: this.state.fairPrice,
        edgeDelta,
      }

      const callback = await this.state.strategy.onSwap(this.state.strategyMemory, callbackContext)
      amm.bidFeeBps = clampBps(callback.bidBps)
      amm.askFeeBps = clampBps(callback.askBps)

      feeChange = {
        beforeBid,
        beforeAsk,
        afterBid: amm.bidFeeBps,
        afterAsk: amm.askFeeBps,
      }

      codeLines = callback.lines || []
      codeExplanation = callback.explanation || 'Strategy updated fees.'
      stateBadge = callback.stateBadge || this.formatFeeBadge(amm)
      this.state.lastBadge = stateBadge

      strategyExecution = {
        mode: this.state.strategy.ref.kind,
        bidFeeBps: amm.bidFeeBps,
        askFeeBps: amm.askFeeBps,
        previousBidFeeBps: beforeBid,
        previousAskFeeBps: beforeAsk,
        changedSlots: callback.changedSlots,
      }
    }

    const event: TradeEvent = {
      id: ++this.state.eventSeq,
      step: this.state.step,
      flow,
      ammName: amm.name,
      isStrategyTrade,
      trade,
      order,
      arbProfit,
      fairPrice: this.state.fairPrice,
      priceMove,
      edgeDelta,
      feeChange,
      codeLines,
      codeExplanation,
      explanationMode: this.state.strategy.explanationMode,
      stateBadge,
      summary: this.describeTrade(flow, amm, trade, order),
      snapshot: this.snapshotState(),
      strategyExecution,
    }

    this.state.pendingEvents.push(event)
  }

  private describeTrade(
    flow: TradeEvent['flow'],
    amm: AmmState,
    trade: Trade,
    order: { side: 'buy' | 'sell'; sizeY: number } | null,
  ): string {
    const move = trade.side === 'buy' ? 'AMM bought X' : 'AMM sold X'
    const base = `${amm.name}: ${move} | X=${formatNum(trade.amountX, 4)} | Y=${formatNum(trade.amountY, 2)}`

    if (flow === 'arbitrage') {
      return `${base} | arbitrage against fair price ${formatNum(this.state.fairPrice, 2)}`
    }

    const orderLabel = order ? `${order.side} ${formatNum(order.sizeY, 2)} Y` : 'retail'
    return `${base} | routed from retail ${orderLabel}`
  }

  private generateRetailOrder(
    randomBetween: (min: number, max: number) => number,
    gaussianRandom: () => number,
  ): { side: 'buy' | 'sell'; sizeY: number } {
    const side: 'buy' | 'sell' = randomBetween(0, 1) < 0.5 ? 'buy' : 'sell'
    const sigma = 0.8
    const mu = Math.log(20) - 0.5 * sigma * sigma
    const sample = Math.exp(mu + sigma * gaussianRandom())
    const sizeY = Math.max(4, Math.min(90, sample))
    return { side, sizeY }
  }

  private snapshotState(): Snapshot {
    const strategyAmm = this.requireAmm(this.state.strategyAmm)
    const normalizerAmm = this.requireAmm(this.state.normalizerAmm)

    return {
      step: this.state.step,
      fairPrice: this.state.fairPrice,
      strategy: {
        x: strategyAmm.reserveX,
        y: strategyAmm.reserveY,
        bid: strategyAmm.bidFeeBps,
        ask: strategyAmm.askFeeBps,
        k: ammK(strategyAmm),
      },
      normalizer: {
        x: normalizerAmm.reserveX,
        y: normalizerAmm.reserveY,
        bid: normalizerAmm.bidFeeBps,
        ask: normalizerAmm.askFeeBps,
        k: ammK(normalizerAmm),
      },
      edge: {
        total: this.state.edge.total,
        retail: this.state.edge.retail,
        arb: this.state.edge.arb,
      },
    }
  }

  private formatFeeBadge(amm: AmmState): string {
    return `fees: bid ${formatNum(amm.bidFeeBps, 0)} bps | ask ${formatNum(amm.askFeeBps, 0)} bps`
  }

  private requireAmm(amm: AmmState | null): AmmState {
    if (!amm) {
      throw new Error('AMM state not initialized')
    }

    return amm
  }

  public toUiState(
    availableStrategies: Array<{ kind: 'builtin' | 'custom'; id: string; name: string }>,
    diagnostics: WorkerUiState['diagnostics'],
    isPlaying: boolean,
  ): WorkerUiState {
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
      },
      isPlaying,
      tradeCount: this.state.tradeCount,
      snapshot: this.state.currentSnapshot,
      lastEvent: this.state.lastEvent,
      history: this.state.history,
      reserveTrail: this.state.reserveTrail,
      viewWindow: this.state.viewWindow,
      diagnostics,
      availableStrategies,
    }
  }
}

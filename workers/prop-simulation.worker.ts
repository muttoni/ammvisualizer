import { PropSimulationEngine } from '../lib/prop-sim/engine'
import { PROP_SPEED_PROFILE, PROP_STORAGE_SIZE } from '../lib/prop-sim/constants'
import { fromScaledBigInt, toScaledBigInt } from '../lib/prop-sim/math'
import type {
  PropActiveStrategyRuntime,
  PropSimulationConfig,
  PropStrategyCallbackContext,
  PropStrategyRef,
  PropWorkerUiState,
} from '../lib/prop-sim/types'
import { getPropBuiltinStrategyById, PROP_BUILTIN_STRATEGIES } from '../lib/prop-strategies/builtins'

// ============================================================================
// Worker State
// ============================================================================

let engine: PropSimulationEngine | null = null
let isPlaying = false
let playbackInterval: ReturnType<typeof setTimeout> | null = null
let rngSeed = 1337

// ============================================================================
// PRNG (mulberry32)
// ============================================================================

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let rng = mulberry32(rngSeed)

function seedRng(seed: number): void {
  rngSeed = seed
  rng = mulberry32(seed)
}

function randomBetween(min: number, max: number): number {
  return min + rng() * (max - min)
}

function gaussianRandom(): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// ============================================================================
// Strategy Runtime Factory
// ============================================================================

function createActiveStrategyRuntime(ref: PropStrategyRef): PropActiveStrategyRuntime {
  if (ref.kind !== 'builtin') {
    throw new Error('Only builtin strategies are supported')
  }

  const builtin = getPropBuiltinStrategyById(ref.id)
  if (!builtin) {
    throw new Error(`Unknown builtin strategy: ${ref.id}`)
  }

  return {
    ref,
    name: builtin.name,
    code: builtin.code,
    feeBps: builtin.feeBps,
    computeSwap: (reserveX: number, reserveY: number, side: 0 | 1, inputAmount: number, storage: Uint8Array): number => {
      const output = builtin.computeSwap({
        side,
        inputAmount: toScaledBigInt(inputAmount),
        reserveX: toScaledBigInt(reserveX),
        reserveY: toScaledBigInt(reserveY),
        storage,
      })
      return fromScaledBigInt(output)
    },
    afterSwap: (ctx: PropStrategyCallbackContext, storage: Uint8Array): Uint8Array => {
      if (!builtin.afterSwap) {
        return storage
      }
      return builtin.afterSwap({
        side: ctx.side,
        inputAmount: toScaledBigInt(ctx.inputAmount),
        outputAmount: toScaledBigInt(ctx.outputAmount),
        reserveX: toScaledBigInt(ctx.reserveX),
        reserveY: toScaledBigInt(ctx.reserveY),
        step: BigInt(ctx.step),
        storage,
      }, storage)
    },
  }
}

// ============================================================================
// Message Handlers
// ============================================================================

type WorkerMessage =
  | { type: 'init'; config: PropSimulationConfig }
  | { type: 'setConfig'; config: PropSimulationConfig }
  | { type: 'setStrategy'; strategyRef: PropStrategyRef }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'reset' }
  | { type: 'getState' }

function handleMessage(msg: WorkerMessage): void {
  switch (msg.type) {
    case 'init':
      handleInit(msg.config)
      break
    case 'setConfig':
      handleSetConfig(msg.config)
      break
    case 'setStrategy':
      handleSetStrategy(msg.strategyRef)
      break
    case 'play':
      handlePlay()
      break
    case 'pause':
      handlePause()
      break
    case 'step':
      handleStep()
      break
    case 'reset':
      handleReset()
      break
    case 'getState':
      postState()
      break
  }
}

function handleInit(config: PropSimulationConfig): void {
  seedRng(config.seed)
  const strategy = createActiveStrategyRuntime(config.strategyRef)
  engine = new PropSimulationEngine(config, strategy)
  engine.reset(randomBetween)
  postState()
}

function handleSetConfig(config: PropSimulationConfig): void {
  if (!engine) return
  engine.setConfig(config)
  
  // Update playback speed if playing
  if (isPlaying && playbackInterval) {
    clearInterval(playbackInterval)
    const speed = PROP_SPEED_PROFILE[config.playbackSpeed] ?? PROP_SPEED_PROFILE[3]
    playbackInterval = setInterval(tick, speed.ms)
  }
  
  postState()
}

function handleSetStrategy(strategyRef: PropStrategyRef): void {
  if (!engine) return
  const strategy = createActiveStrategyRuntime(strategyRef)
  engine.setStrategy(strategy)
  engine.reset(randomBetween)
  postState()
}

function handlePlay(): void {
  if (!engine || isPlaying) return
  isPlaying = true
  
  const config = engine['state'].config
  const speed = PROP_SPEED_PROFILE[config.playbackSpeed] ?? PROP_SPEED_PROFILE[3]
  playbackInterval = setInterval(tick, speed.ms)
  
  postState()
}

function handlePause(): void {
  isPlaying = false
  if (playbackInterval) {
    clearInterval(playbackInterval)
    playbackInterval = null
  }
  postState()
}

function handleStep(): void {
  if (!engine) return
  if (isPlaying) {
    handlePause()
  }
  engine.stepOne(randomBetween, gaussianRandom)
  postState()
}

function handleReset(): void {
  if (!engine) return
  handlePause()
  seedRng(engine['state'].config.seed)
  engine.reset(randomBetween)
  postState()
}

function tick(): void {
  if (!engine || !isPlaying) return
  engine.stepOne(randomBetween, gaussianRandom)
  postState()
}

function postState(): void {
  if (!engine) return
  
  const availableStrategies = PROP_BUILTIN_STRATEGIES.map((s) => ({
    kind: 'builtin' as const,
    id: s.id,
    name: s.name,
  }))
  
  const state = engine.toUiState(availableStrategies, isPlaying)
  self.postMessage({ type: 'state', state })
}

// ============================================================================
// Worker Entry
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  handleMessage(event.data)
}

// Signal ready
self.postMessage({ type: 'ready' })

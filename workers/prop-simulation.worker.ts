import { PropSimulationEngine } from '../lib/prop-sim/engine'
import { PROP_DEFAULT_STEPS, PROP_SPEED_PROFILE } from '../lib/prop-sim/constants'
import { PropRng } from '../lib/prop-sim/rng'
import type { PropSimulationConfig } from '../lib/prop-sim/types'
import { getPropBuiltinStrategy, PROP_BUILTIN_STRATEGIES } from '../lib/prop-strategies/builtins'
import type { PropWorkerInboundMessage, PropWorkerOutboundMessage } from './prop-messages'

const worker = self as unknown as {
  postMessage: (message: PropWorkerOutboundMessage) => void
  onmessage: ((event: MessageEvent<PropWorkerInboundMessage>) => void) | null
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
}

const DEFAULT_CONFIG: PropSimulationConfig = {
  seed: 1337,
  strategyRef: {
    kind: 'builtin',
    id: 'starter',
  },
  playbackSpeed: 3,
  maxTapeRows: 20,
  nSteps: PROP_DEFAULT_STEPS,
}

let config: PropSimulationConfig = { ...DEFAULT_CONFIG }
let engine: PropSimulationEngine | null = null
let rng = new PropRng(config.seed)

let isPlaying = false
let playTimer: ReturnType<typeof setInterval> | null = null
let stepping = false
let messageQueue: Promise<void> = Promise.resolve()

worker.onmessage = (event) => {
  const inbound = event.data
  messageQueue = messageQueue
    .then(async () => {
      await handleMessage(inbound)
    })
    .catch((error) => {
      emitError(error)
    })
}

async function handleMessage(message: PropWorkerInboundMessage): Promise<void> {
  switch (message.type) {
    case 'INIT_PROP_SIM': {
      config = {
        ...config,
        ...message.payload?.config,
      }
      config.nSteps = config.nSteps || PROP_DEFAULT_STEPS
      rng.reset(config.seed)
      await ensureEngineInitialized()
      await resetEngine()
      emitState()
      break
    }

    case 'SET_PROP_CONFIG': {
      const previous = config
      const next: PropSimulationConfig = {
        ...config,
        ...message.payload.config,
        nSteps: message.payload.config.nSteps ?? config.nSteps,
      }
      config = next

      const seedChanged = next.seed !== previous.seed
      const strategyChanged =
        next.strategyRef.kind !== previous.strategyRef.kind ||
        next.strategyRef.id !== previous.strategyRef.id
      const nStepsChanged = next.nSteps !== previous.nSteps

      await ensureEngineInitialized()
      engine!.setConfig(next)

      if (seedChanged) {
        rng.reset(next.seed)
      }

      if (strategyChanged || seedChanged || nStepsChanged) {
        await resetEngine()
      }

      if (isPlaying && next.playbackSpeed !== previous.playbackSpeed) {
        restartPlaybackTimer()
      }

      emitState()
      break
    }

    case 'STEP_PROP_ONE': {
      stopPlayback()
      await ensureEngineInitialized()
      engine!.stepOne(rng)
      emitState()
      break
    }

    case 'PLAY_PROP': {
      await ensureEngineInitialized()
      startPlayback()
      emitState()
      break
    }

    case 'PAUSE_PROP': {
      stopPlayback()
      emitState()
      break
    }

    case 'RESET_PROP': {
      stopPlayback()
      await ensureEngineInitialized()
      await resetEngine()
      emitState()
      break
    }

    default: {
      const unsupported: never = message
      throw new Error(`Unsupported Prop worker message: ${JSON.stringify(unsupported)}`)
    }
  }
}

async function ensureEngineInitialized(): Promise<void> {
  if (engine) {
    return
  }

  const strategy = getPropBuiltinStrategy(config.strategyRef)
  engine = new PropSimulationEngine(config, strategy)
}

async function resetEngine(): Promise<void> {
  if (!engine) {
    return
  }

  const strategy = getPropBuiltinStrategy(config.strategyRef)
  engine.setStrategy(strategy)
  engine.setConfig(config)
  rng.reset(config.seed)
  engine.reset(rng)
}

function startPlayback(): void {
  if (!engine || isPlaying) {
    return
  }

  isPlaying = true
  restartPlaybackTimer()
}

function stopPlayback(): void {
  isPlaying = false

  if (playTimer) {
    worker.clearInterval(playTimer)
    playTimer = null
  }
}

function restartPlaybackTimer(): void {
  if (!engine) {
    return
  }

  if (playTimer) {
    worker.clearInterval(playTimer)
    playTimer = null
  }

  const profile = PROP_SPEED_PROFILE[config.playbackSpeed] ?? PROP_SPEED_PROFILE[3]

  playTimer = worker.setInterval(() => {
    if (!engine || !isPlaying || stepping) {
      return
    }

    try {
      stepping = true
      const advanced = engine.stepOne(rng)
      if (!advanced) {
        stopPlayback()
      }
      emitState()
    } catch (error) {
      stopPlayback()
      emitError(error)
    } finally {
      stepping = false
    }
  }, profile.ms)
}

function emitState(): void {
  if (!engine) {
    return
  }

  worker.postMessage({
    type: 'PROP_STATE',
    payload: {
      state: engine.toUiState(PROP_BUILTIN_STRATEGIES, isPlaying),
    },
  })
}

function emitError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  worker.postMessage({
    type: 'PROP_ERROR',
    payload: {
      message,
    },
  })
}

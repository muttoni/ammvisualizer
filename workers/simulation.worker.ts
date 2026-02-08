import { BUILTIN_STRATEGIES, getBuiltinStrategyById } from '../lib/strategies/builtins'
import { SimulationEngine } from '../lib/sim/engine'
import { SPEED_PROFILE } from '../lib/sim/constants'
import { SeededRng } from '../lib/sim/utils'
import type {
  ActiveStrategyRuntime,
  CompilerDiagnostic,
  CustomCompileResult,
  RuntimeStrategyResult,
  SimulationConfig,
  StrategyLibraryItem,
  StrategyRef,
} from '../lib/sim/types'
import {
  deleteCustomStrategyItem,
  loadCustomStrategyLibrary,
  saveCustomStrategyItem,
} from '../lib/persistence/customStrategies'
import { type WorkerInboundMessage, type WorkerOutboundMessage } from './messages'

type RuntimeModule = typeof import('./evm/runtime')
type CompiledCustomStrategy = Awaited<ReturnType<RuntimeModule['compileCustomStrategySource']>>
type CustomStrategyRuntime = Awaited<ReturnType<RuntimeModule['createCustomStrategyRuntime']>>

const worker = self as unknown as {
  postMessage: (message: WorkerOutboundMessage) => void
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
}

const DEFAULT_CONFIG: SimulationConfig = {
  seed: 1337,
  strategyRef: {
    kind: 'builtin',
    id: 'baseline30',
  },
  playbackSpeed: 3,
  maxTapeRows: 20,
}

let config: SimulationConfig = { ...DEFAULT_CONFIG }
let engine: SimulationEngine | null = null
let isPlaying = false
let playTimer: ReturnType<typeof setInterval> | null = null
let stepping = false
let rng = new SeededRng(config.seed)
let diagnostics: CompilerDiagnostic[] = []
let strategyLibrary: StrategyLibraryItem[] = []
let messageQueue: Promise<void> = Promise.resolve()

const compiledCache = new Map<string, CompiledCustomStrategy>()
const runtimeCache = new Map<string, CustomStrategyRuntime>()
let runtimeModulePromise: Promise<RuntimeModule> | null = null

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

async function handleMessage(message: WorkerInboundMessage): Promise<void> {
  switch (message.type) {
    case 'INIT_SIM': {
      config = {
        ...config,
        ...message.payload?.config,
      }
      rng = new SeededRng(config.seed)

      strategyLibrary = await loadCustomStrategyLibrary()
      await ensureEngineInitialized()
      await resetEngine()
      emitLibrary()
      emitState()
      break
    }

    case 'STEP_ONE': {
      stopPlayback()
      await ensureEngineInitialized()
      await engine!.stepOne(() => rng.between(0, 1), () => rng.gaussian())
      emitState()
      break
    }

    case 'PLAY': {
      await ensureEngineInitialized()
      startPlayback()
      emitState()
      break
    }

    case 'PAUSE': {
      stopPlayback()
      emitState()
      break
    }

    case 'RESET': {
      stopPlayback()
      await ensureEngineInitialized()
      await resetEngine()
      emitState()
      break
    }

    case 'SET_STRATEGY': {
      stopPlayback()
      config = {
        ...config,
        strategyRef: message.payload.strategyRef,
      }
      await ensureEngineInitialized()
      const activeStrategy = await resolveStrategyRuntime(config.strategyRef)
      engine!.setStrategy(activeStrategy)
      engine!.setConfig(config)
      await resetEngine()
      emitState()
      break
    }

    case 'SET_CONFIG': {
      config = {
        ...config,
        ...message.payload.config,
      }

      if (message.payload.config.seed !== undefined) {
        rng = new SeededRng(config.seed)
      }

      if (engine) {
        engine.setConfig(config)
      }

      if (isPlaying && message.payload.config.playbackSpeed !== undefined) {
        restartPlaybackTimer()
      }

      emitState()
      break
    }

    case 'COMPILE_CUSTOM': {
      const result = await compileOnly(message.payload.source, message.payload.nameHint)
      worker.postMessage({
        type: 'COMPILE_RESULT',
        payload: {
          result,
        },
      })
      emitState()
      break
    }

    case 'COMPILE_AND_ACTIVATE_CUSTOM': {
      stopPlayback()
      const result = await saveCustomStrategy(message.payload)
      worker.postMessage({
        type: 'COMPILE_RESULT',
        payload: {
          result,
        },
      })

      if (result.ok) {
        config = {
          ...config,
          strategyRef: {
            kind: 'custom',
            id: result.strategyId,
          },
        }
        await ensureEngineInitialized()
        const activeStrategy = await resolveStrategyRuntime(config.strategyRef)
        engine!.setStrategy(activeStrategy)
        engine!.setConfig(config)
        await resetEngine()
      }

      emitLibrary()
      emitState()
      break
    }

    case 'SAVE_CUSTOM': {
      const result = await saveCustomStrategy(message.payload)
      worker.postMessage({
        type: 'COMPILE_RESULT',
        payload: {
          result,
        },
      })
      emitLibrary()
      emitState()
      break
    }

    case 'DELETE_CUSTOM': {
      strategyLibrary = await deleteCustomStrategyItem(message.payload.id)
      compiledCache.delete(message.payload.id)
      runtimeCache.delete(message.payload.id)

      if (config.strategyRef.kind === 'custom' && config.strategyRef.id === message.payload.id) {
        config = {
          ...config,
          strategyRef: {
            kind: 'builtin',
            id: 'baseline30',
          },
        }

        await ensureEngineInitialized()
        const activeStrategy = await resolveStrategyRuntime(config.strategyRef)
        engine!.setStrategy(activeStrategy)
        engine!.setConfig(config)
        await resetEngine()
      }

      emitLibrary()
      emitState()
      break
    }

    case 'LOAD_LIBRARY': {
      strategyLibrary = await loadCustomStrategyLibrary()
      emitLibrary()
      emitState()
      break
    }

    default: {
      const unsupported: never = message
      throw new Error(`Unsupported message: ${JSON.stringify(unsupported)}`)
    }
  }
}

async function ensureEngineInitialized(): Promise<void> {
  if (engine) return

  const strategy = await resolveStrategyRuntime(config.strategyRef)
  engine = new SimulationEngine(config, strategy)
}

async function resolveStrategyRuntime(ref: StrategyRef): Promise<ActiveStrategyRuntime> {
  if (ref.kind === 'builtin') {
    const builtin = getBuiltinStrategyById(ref.id)
    if (!builtin) {
      throw new Error(`Builtin strategy '${ref.id}' not found.`)
    }

    return {
      ref,
      name: builtin.name,
      code: builtin.code,
      explanationMode: 'line-level',
      initialize: async (memory) => withChangedSlots(builtin.initialize(memory)),
      onSwap: async (memory, ctx) => withChangedSlots(builtin.onSwap(memory, ctx)),
    }
  }

  const item = strategyLibrary.find((entry) => entry.id === ref.id)
  if (!item) {
    throw new Error(`Custom strategy '${ref.id}' not found in local library.`)
  }

  const runtimeModule = await loadRuntimeModule()

  let compiled = compiledCache.get(ref.id)
  if (!compiled) {
    compiled = await runtimeModule.compileCustomStrategySource(item.source, item.name)
    compiled = {
      ...compiled,
      id: ref.id,
      name: item.name,
      source: item.source,
    }
    compiledCache.set(ref.id, compiled)
  }

  let runtime = runtimeCache.get(ref.id)
  if (!runtime) {
    runtime = await runtimeModule.createCustomStrategyRuntime(compiled)
    runtimeCache.set(ref.id, runtime)
  }

  return {
    ref,
    name: item.name,
    code: item.source,
    explanationMode: 'runtime',
    initialize: async (_memory, reserveX, reserveY) => runtime!.initialize(reserveX, reserveY),
    onSwap: async (_memory, ctx) => runtime!.onSwap(ctx),
  }
}

function withChangedSlots(result: {
  bidBps: number
  askBps: number
  lines: number[]
  explanation: string
  stateBadge: string
}): RuntimeStrategyResult {
  return {
    ...result,
    changedSlots: [],
  }
}

async function loadRuntimeModule(): Promise<RuntimeModule> {
  if (!runtimeModulePromise) {
    runtimeModulePromise = import('./evm/runtime')
  }

  return runtimeModulePromise
}

async function resetEngine(): Promise<void> {
  if (!engine) return

  const activeStrategy = await resolveStrategyRuntime(config.strategyRef)
  engine.setStrategy(activeStrategy)
  engine.setConfig(config)
  diagnostics = []
  await engine.reset(() => rng.reset(config.seed))
}

function startPlayback(): void {
  if (isPlaying) return
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
  if (!engine) return
  if (playTimer) {
    worker.clearInterval(playTimer)
    playTimer = null
  }

  const profile = SPEED_PROFILE[config.playbackSpeed] ?? SPEED_PROFILE[3]

  playTimer = worker.setInterval(async () => {
    if (!engine || !isPlaying || stepping) return

    try {
      stepping = true
      const advanced = await engine.stepOne(() => rng.between(0, 1), () => rng.gaussian())
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

function availableStrategies(): Array<{ kind: 'builtin' | 'custom'; id: string; name: string }> {
  return [
    ...BUILTIN_STRATEGIES.map((strategy) => ({
      kind: 'builtin' as const,
      id: strategy.id,
      name: strategy.name,
    })),
    ...strategyLibrary.map((strategy) => ({
      kind: 'custom' as const,
      id: strategy.id,
      name: strategy.name,
    })),
  ]
}

function emitState(): void {
  if (!engine) return

  worker.postMessage({
    type: 'STATE',
    payload: {
      state: engine.toUiState(availableStrategies(), diagnostics, isPlaying),
    },
  })
}

function emitLibrary(): void {
  worker.postMessage({
    type: 'LIBRARY',
    payload: {
      items: strategyLibrary,
    },
  })
}

async function compileOnly(source: string, nameHint?: string): Promise<CustomCompileResult> {
  const runtimeModule = await loadRuntimeModule()

  try {
    const compiled = await runtimeModule.compileCustomStrategySource(source, nameHint)
    diagnostics = compiled.diagnostics
    return {
      ok: true,
      diagnostics,
      strategyId: compiled.id,
      strategyName: compiled.name,
    }
  } catch (error) {
    if (error instanceof runtimeModule.CompileError) {
      diagnostics = error.diagnostics
      return {
        ok: false,
        diagnostics,
        strategyId: `invalid-${Date.now()}`,
      }
    }
    diagnostics = [
      {
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        line: null,
        column: null,
      },
    ]
    return {
      ok: false,
      diagnostics,
      strategyId: `invalid-${Date.now()}`,
    }
  }
}

async function saveCustomStrategy(payload: {
  id?: string
  name: string
  source: string
}): Promise<CustomCompileResult> {
  const runtimeModule = await loadRuntimeModule()

  try {
    const compiledRaw = await runtimeModule.compileCustomStrategySource(payload.source, payload.name)
    const id = payload.id || compiledRaw.id
    const compiled: CompiledCustomStrategy = {
      ...compiledRaw,
      id,
      name: payload.name,
      source: payload.source,
    }

    diagnostics = compiled.diagnostics

    const existing = strategyLibrary.find((item) => item.id === id)
    const item = runtimeModule.toLibraryItem(compiled, existing)
    strategyLibrary = await saveCustomStrategyItem(item)

    compiledCache.set(id, compiled)
    runtimeCache.delete(id)

    return {
      ok: true,
      diagnostics,
      strategyId: id,
      strategyName: payload.name,
    }
  } catch (error) {
    if (error instanceof runtimeModule.CompileError) {
      diagnostics = error.diagnostics
      return {
        ok: false,
        diagnostics,
        strategyId: payload.id || `invalid-${Date.now()}`,
      }
    }
    diagnostics = [
      {
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        line: null,
        column: null,
      },
    ]
    return {
      ok: false,
      diagnostics,
      strategyId: payload.id || `invalid-${Date.now()}`,
    }
  }
}

function emitError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  worker.postMessage({
    type: 'ERROR',
    payload: {
      message,
    },
  })
}

import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createVM } from '@ethereumjs/vm'
import {
  bytesToHex,
  createAccount,
  createAddressFromString,
  hexToBytes,
} from '@ethereumjs/util'
import type {
  CompilerDiagnostic,
  RuntimeStrategyResult,
  StrategyCallbackContext,
  StrategyLibraryItem,
} from '../../lib/sim/types'
import { clampBps, formatNum } from '../../lib/sim/utils'
import { AMM_STRATEGY_BASE_SOURCE, IAMM_STRATEGY_SOURCE } from './baseContracts'

const CALLER_ADDRESS = createAddressFromString('0x2000000000000000000000000000000000000002')
const CONTRACT_ADDRESS = createAddressFromString('0x1000000000000000000000000000000000000001')
const SLOT_SCAN_COUNT = 16
const BPS_WAD = 100_000_000_000_000n

const AFTER_INITIALIZE_SELECTOR = '837aef47'
const AFTER_SWAP_SELECTOR = 'c2babb57'
const SOLJSON_PUBLIC_PATH = '/solc/soljson.js'
const SOLJSON_CACHE_NAME = 'ammvisualizer-soljson-v1'

interface SolcCompilerLike {
  compile: (input: string) => string
  version: () => string
}

let compilerPromise: Promise<SolcCompilerLike> | null = null

interface SolcOutputContract {
  abi: Array<{ type: string; name?: string; inputs?: Array<{ type: string }>; outputs?: Array<{ type: string }> }>
  evm: {
    deployedBytecode: {
      object: string
    }
  }
}

interface SolcOutput {
  contracts?: Record<string, Record<string, SolcOutputContract>>
  errors?: Array<{
    severity: 'error' | 'warning'
    formattedMessage: string
    message: string
    sourceLocation?: {
      file: string
      start: number
      end: number
    }
  }>
}

export interface CompiledCustomStrategy {
  id: string
  name: string
  source: string
  compilerVersion: string
  diagnostics: CompilerDiagnostic[]
  runtimeBytecode: string
  afterSwapLine: number
  afterInitializeLine: number
}

export interface CustomStrategyRuntime {
  readonly compiled: CompiledCustomStrategy
  initialize: (reserveX: number, reserveY: number) => Promise<RuntimeStrategyResult>
  onSwap: (ctx: StrategyCallbackContext) => Promise<RuntimeStrategyResult>
}

export async function compileCustomStrategySource(source: string, nameHint?: string): Promise<CompiledCustomStrategy> {
  const compiler = await getSolcCompiler()

  const compileInput = {
    language: 'Solidity',
    sources: {
      'Strategy.sol': { content: source },
      'IAMMStrategy.sol': { content: IAMM_STRATEGY_SOURCE },
      'AMMStrategyBase.sol': { content: AMM_STRATEGY_BASE_SOURCE },
    },
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.deployedBytecode.object'],
        },
      },
    },
  }

  const output: SolcOutput = JSON.parse(compiler.compile(JSON.stringify(compileInput)))
  const diagnostics = mapDiagnostics(output.errors)

  const contract = pickStrategyContract(output)
  if (!contract) {
    throw new CompileError(
      'Contract `Strategy` was not found. Define `contract Strategy` in your source.',
      diagnostics,
    )
  }

  validateRequiredCallbacks(contract)

  const runtimeBytecode = contract.evm.deployedBytecode.object || ''
  if (!runtimeBytecode || runtimeBytecode.length < 2) {
    throw new CompileError('Compiled contract produced empty runtime bytecode.', diagnostics)
  }

  const strategyName = (nameHint || 'Custom Strategy').trim() || 'Custom Strategy'

  return {
    id: `custom-${hashSource(source)}`,
    name: strategyName,
    source,
    compilerVersion: compiler.version(),
    diagnostics,
    runtimeBytecode,
    afterSwapLine: findFunctionLine(source, 'afterSwap'),
    afterInitializeLine: findFunctionLine(source, 'afterInitialize'),
  }
}

export async function createCustomStrategyRuntime(compiled: CompiledCustomStrategy): Promise<CustomStrategyRuntime> {
  const vm = await createVM({
    common: new Common({ chain: Mainnet, hardfork: Hardfork.Shanghai }),
  })

  await vm.stateManager.putAccount(
    CALLER_ADDRESS,
    createAccount({
      nonce: 0n,
      balance: 10_000_000_000_000_000_000n,
    }),
  )

  await vm.stateManager.putAccount(
    CONTRACT_ADDRESS,
    createAccount({
      nonce: 1n,
      balance: 0n,
    }),
  )

  await vm.stateManager.putCode(CONTRACT_ADDRESS, hexToBytes(`0x${compiled.runtimeBytecode}`))

  return {
    compiled,
    initialize: async (reserveX: number, reserveY: number) => {
      const before = await readSlots(vm, SLOT_SCAN_COUNT)
      const inputHex = `${AFTER_INITIALIZE_SELECTOR}${encodeUint256(BigInt(Math.max(0, Math.round(reserveX))))}${encodeUint256(BigInt(Math.max(0, Math.round(reserveY))))}`
      const result = await runCall(vm, inputHex)
      const after = await readSlots(vm, SLOT_SCAN_COUNT)
      const fees = decodeFeePair(result)
      const slotChanges = diffSlots(before, after)

      return {
        bidBps: fees.bidBps,
        askBps: fees.askBps,
        lines: [compiled.afterInitializeLine],
        explanation:
          `afterInitialize(reserveX=${formatNum(reserveX, 3)}, reserveY=${formatNum(reserveY, 3)}) ` +
          `returned bid=${fees.bidBps} bps, ask=${fees.askBps} bps.`,
        stateBadge: buildRuntimeBadge(fees.bidBps, fees.askBps, slotChanges.length),
        changedSlots: slotChanges,
      }
    },
    onSwap: async (ctx: StrategyCallbackContext) => {
      const before = await readSlots(vm, SLOT_SCAN_COUNT)

      const inputHex =
        AFTER_SWAP_SELECTOR +
        encodeBool(ctx.isBuy) +
        encodeUint256(toBigIntAmount(ctx.amountX)) +
        encodeUint256(toBigIntAmount(ctx.amountY)) +
        encodeUint256(BigInt(Math.max(0, Math.round(ctx.timestamp)))) +
        encodeUint256(toBigIntAmount(ctx.reserveX)) +
        encodeUint256(toBigIntAmount(ctx.reserveY))

      const result = await runCall(vm, inputHex)
      const after = await readSlots(vm, SLOT_SCAN_COUNT)
      const fees = decodeFeePair(result)
      const slotChanges = diffSlots(before, after)

      return {
        bidBps: fees.bidBps,
        askBps: fees.askBps,
        lines: [compiled.afterSwapLine],
        explanation:
          `afterSwap(isBuy=${ctx.isBuy}, amountX=${formatNum(ctx.amountX, 4)}, amountY=${formatNum(ctx.amountY, 3)}, ` +
          `reserveX=${formatNum(ctx.reserveX, 3)}, reserveY=${formatNum(ctx.reserveY, 3)}) ` +
          `returned bid=${fees.bidBps} bps, ask=${fees.askBps} bps. ` +
          summarizeSlotChanges(slotChanges),
        stateBadge: buildRuntimeBadge(fees.bidBps, fees.askBps, slotChanges.length),
        changedSlots: slotChanges,
      }
    },
  }
}

export function toLibraryItem(compiled: CompiledCustomStrategy, base?: Partial<StrategyLibraryItem>): StrategyLibraryItem {
  const now = Date.now()
  return {
    id: compiled.id,
    name: compiled.name,
    source: compiled.source,
    compilerVersion: compiled.compilerVersion,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    lastCompileStatus: compiled.diagnostics.some((item) => item.severity === 'error') ? 'error' : 'ok',
    lastDiagnostics: compiled.diagnostics,
  }
}

async function getSolcCompiler(): Promise<SolcCompilerLike> {
  if (!compilerPromise) {
    compilerPromise = isNodeRuntime() ? createNodeCompiler() : createBrowserWorkerCompiler()
  }

  return compilerPromise
}

async function createNodeCompiler(): Promise<SolcCompilerLike> {
  const solcModule = await import('solc')
  const candidate = (solcModule.default ?? solcModule) as Partial<SolcCompilerLike>

  if (typeof candidate.compile !== 'function' || typeof candidate.version !== 'function') {
    throw new Error('Failed to initialize solc compiler in Node runtime.')
  }

  return {
    compile: (input) => candidate.compile!(input),
    version: () => candidate.version!(),
  }
}

async function createBrowserWorkerCompiler(): Promise<SolcCompilerLike> {
  const source = await loadBrowserSoljsonSource()
  const moduleShim: { exports: unknown } = { exports: {} }
  const evaluator = new Function(
    'module',
    'exports',
    'process',
    'globalThis',
    'self',
    `${source}\nif (typeof module !== "undefined") { module.exports = Module; }\nreturn module.exports;`,
  ) as (
    module: { exports: unknown },
    exports: unknown,
    process: unknown,
    globalThisObj: typeof globalThis,
    selfObj: typeof globalThis,
  ) => unknown

  const selfObject = (globalThis as typeof globalThis & { self?: typeof globalThis }).self ?? globalThis
  const soljson = evaluator(moduleShim, moduleShim.exports, undefined, globalThis, selfObject) as Record<string, unknown>
  if (!soljson || typeof soljson.cwrap !== 'function') {
    throw new Error('Failed to initialize browser soljson runtime.')
  }

  const bindingsModule = await import('solc/bindings')
  const setupBindings = bindingsModule.default
  const { coreBindings, compileBindings } = setupBindings(soljson)

  if (typeof compileBindings.compileStandard !== 'function') {
    throw new Error('compileStandard is unavailable in browser soljson runtime.')
  }

  return {
    compile: (input) =>
      compileBindings.compileStandard(input, {
        import: () => ({ error: 'File import callback not supported' }),
        smtSolver: () => ({ error: 'SMT solver callback not supported' }),
      }),
    version: () => coreBindings.version(),
  }
}

async function loadBrowserSoljsonSource(): Promise<string> {
  const cacheApi = (globalThis as typeof globalThis & { caches?: CacheStorage }).caches
  if (cacheApi) {
    try {
      const cache = await cacheApi.open(SOLJSON_CACHE_NAME)
      const cached = await cache.match(SOLJSON_PUBLIC_PATH)
      if (cached && cached.ok) {
        return await cached.text()
      }

      const response = await fetch(SOLJSON_PUBLIC_PATH, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(
          `Unable to load ${SOLJSON_PUBLIC_PATH}. Ensure build scripts copied soljson.js into public/solc.`,
        )
      }

      await cache.put(SOLJSON_PUBLIC_PATH, response.clone())
      return await response.text()
    } catch {
      // Fall through to normal fetch if CacheStorage is unavailable or fails.
    }
  }

  const response = await fetch(SOLJSON_PUBLIC_PATH, { cache: 'force-cache' })
  if (!response.ok) {
    throw new Error(
      `Unable to load ${SOLJSON_PUBLIC_PATH}. Ensure build scripts copied soljson.js into public/solc.`,
    )
  }
  return await response.text()
}

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node)
}

function pickStrategyContract(output: SolcOutput): SolcOutputContract | null {
  if (!output.contracts) {
    return null
  }

  if (output.contracts['Strategy.sol']?.Strategy) {
    return output.contracts['Strategy.sol'].Strategy
  }

  for (const contractMap of Object.values(output.contracts)) {
    if (contractMap.Strategy) {
      return contractMap.Strategy
    }
  }

  return null
}

function validateRequiredCallbacks(contract: SolcOutputContract): void {
  const afterInitialize = contract.abi.find((item) => item.type === 'function' && item.name === 'afterInitialize')
  const afterSwap = contract.abi.find((item) => item.type === 'function' && item.name === 'afterSwap')

  if (!afterInitialize || !afterSwap) {
    throw new Error('`Strategy` must implement both `afterInitialize` and `afterSwap`.')
  }
}

function mapDiagnostics(errors: SolcOutput['errors'] | undefined): CompilerDiagnostic[] {
  if (!errors || errors.length === 0) return []

  return errors.map((item) => {
    const location = parseLocation(item)
    return {
      severity: item.severity,
      message: item.message,
      line: location?.line ?? null,
      column: location?.column ?? null,
      sourceFile: item.sourceLocation?.file,
    }
  })
}

function parseLocation(error: NonNullable<SolcOutput['errors']>[number]): { line: number; column: number } | null {
  const formatted = error.formattedMessage || ''
  const match = formatted.match(/:(\d+):(\d+):/)
  if (!match) return null
  return {
    line: Number(match[1]),
    column: Number(match[2]),
  }
}

async function runCall(vm: Awaited<ReturnType<typeof createVM>>, inputHex: string): Promise<Uint8Array> {
  const result = await vm.evm.runCall({
    to: CONTRACT_ADDRESS,
    caller: CALLER_ADDRESS,
    origin: CALLER_ADDRESS,
    data: hexToBytes(`0x${inputHex}`),
    gasLimit: 8_000_000n,
    value: 0n,
  })

  if (result.execResult.exceptionError) {
    throw new Error(`EVM callback reverted: ${result.execResult.exceptionError.error}`)
  }

  return result.execResult.returnValue
}

async function readSlots(vm: Awaited<ReturnType<typeof createVM>>, count: number): Promise<string[]> {
  const slots: string[] = []

  for (let i = 0; i < count; i += 1) {
    const slotKey = `0x${i.toString(16).padStart(64, '0')}` as `0x${string}`
    const value = await vm.stateManager.getStorage(CONTRACT_ADDRESS, hexToBytes(slotKey))
    slots.push(normalizeHex(bytesToHex(value)))
  }

  return slots
}

function diffSlots(before: string[], after: string[]): Array<{ slot: number; before: string; after: string }> {
  const changes: Array<{ slot: number; before: string; after: string }> = []

  const length = Math.max(before.length, after.length)
  for (let i = 0; i < length; i += 1) {
    const prev = before[i] ?? normalizeHex('0x0')
    const next = after[i] ?? normalizeHex('0x0')
    if (prev !== next) {
      changes.push({ slot: i, before: prev, after: next })
    }
  }

  return changes
}

function decodeFeePair(returnValue: Uint8Array): { bidBps: number; askBps: number } {
  const hex = normalizeHex(bytesToHex(returnValue)).slice(2)
  if (hex.length < 128) {
    throw new Error('afterSwap/afterInitialize did not return two uint256 values.')
  }

  const bidWad = BigInt(`0x${hex.slice(0, 64)}`)
  const askWad = BigInt(`0x${hex.slice(64, 128)}`)

  return {
    bidBps: clampBps(Number(bidWad / BPS_WAD)),
    askBps: clampBps(Number(askWad / BPS_WAD)),
  }
}

function normalizeHex(value: string): string {
  const normalized = value.startsWith('0x') ? value.slice(2) : value
  return `0x${normalized.padStart(64, '0')}`
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    return '0'.repeat(64)
  }

  return value.toString(16).padStart(64, '0')
}

function encodeBool(value: boolean): string {
  return value ? `${'0'.repeat(63)}1` : '0'.repeat(64)
}

function toBigIntAmount(value: number): bigint {
  if (!Number.isFinite(value)) return 0n
  if (value <= 0) return 0n
  return BigInt(Math.round(value * 1_000_000))
}

function summarizeSlotChanges(changes: Array<{ slot: number; before: string; after: string }>): string {
  if (changes.length === 0) {
    return 'No storage slots changed.'
  }

  const preview = changes
    .slice(0, 3)
    .map((item) => `slot[${item.slot}] ${shortHex(item.before)} -> ${shortHex(item.after)}`)
    .join(', ')

  const suffix = changes.length > 3 ? ` (+${changes.length - 3} more)` : ''
  return `Storage changed: ${preview}${suffix}.`
}

function shortHex(value: string): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  return `0x${clean.slice(0, 6)}...${clean.slice(-4)}`
}

function buildRuntimeBadge(bidBps: number, askBps: number, changedSlotCount: number): string {
  return `runtime fee: ${bidBps}/${askBps} bps | slots changed: ${changedSlotCount}`
}

function hashSource(value: string): string {
  let hash = 2166136261

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

function findFunctionLine(source: string, functionName: string): number {
  const lines = source.split('\n')
  const matcher = new RegExp(`\\bfunction\\s+${functionName}\\b`)

  for (let i = 0; i < lines.length; i += 1) {
    if (matcher.test(lines[i])) {
      return i + 1
    }
  }

  return 1
}

export class CompileError extends Error {
  public readonly diagnostics: CompilerDiagnostic[]

  constructor(message: string, diagnostics: CompilerDiagnostic[]) {
    super(message)
    this.name = 'CompileError'
    this.diagnostics = diagnostics
  }
}

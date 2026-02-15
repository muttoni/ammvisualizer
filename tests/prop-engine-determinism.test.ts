import { describe, expect, it } from 'vitest'
import { PropSimulationEngine } from '../lib/prop-sim/engine'
import { PROP_DEFAULT_STEPS } from '../lib/prop-sim/constants'
import { PropRng } from '../lib/prop-sim/rng'
import { getPropBuiltinStrategy, PROP_BUILTIN_STRATEGIES } from '../lib/prop-strategies/builtins'
import type { PropSimulationConfig } from '../lib/prop-sim/types'

const baseConfig: PropSimulationConfig = {
  seed: 1337,
  strategyRef: { kind: 'builtin', id: 'starter' },
  playbackSpeed: 3,
  maxTapeRows: 20,
  nSteps: PROP_DEFAULT_STEPS,
}

function runSeries(seed: number): Array<{ step: number; fairPrice: number; edge: number; storageDelta: number }> {
  const config = { ...baseConfig, seed }
  const runtime = getPropBuiltinStrategy(config.strategyRef)
  const engine = new PropSimulationEngine(config, runtime)
  const rng = new PropRng(seed)

  engine.reset(rng)

  const series: Array<{ step: number; fairPrice: number; edge: number; storageDelta: number }> = []
  let guard = 0

  while (series.length < 30 && guard < 400) {
    guard += 1
    const advanced = engine.stepOne(rng)
    if (!advanced) {
      break
    }

    const state = engine.toUiState(PROP_BUILTIN_STRATEGIES, false)
    series.push({
      step: state.snapshot.step,
      fairPrice: Number(state.snapshot.fairPrice.toFixed(8)),
      edge: Number(state.snapshot.edge.total.toFixed(8)),
      storageDelta: state.snapshot.storage.lastChangedBytes,
    })
  }

  return series
}

describe('prop simulation engine determinism', () => {
  it('replays same sequence for same seed', () => {
    const first = runSeries(1337)
    const second = runSeries(1337)
    expect(first).toEqual(second)
  })

  it('produces a different sequence for different seeds', () => {
    const first = runSeries(1337)
    const second = runSeries(1338)
    expect(first).not.toEqual(second)
  })

  it('maintains finite positive reserves in short runs', () => {
    const config = { ...baseConfig, seed: 42 }
    const runtime = getPropBuiltinStrategy(config.strategyRef)
    const engine = new PropSimulationEngine(config, runtime)
    const rng = new PropRng(config.seed)

    engine.reset(rng)

    for (let index = 0; index < 80; index += 1) {
      engine.stepOne(rng)
      const state = engine.toUiState(PROP_BUILTIN_STRATEGIES, false)
      expect(Number.isFinite(state.snapshot.submission.x)).toBe(true)
      expect(Number.isFinite(state.snapshot.submission.y)).toBe(true)
      expect(Number.isFinite(state.snapshot.normalizer.x)).toBe(true)
      expect(Number.isFinite(state.snapshot.normalizer.y)).toBe(true)
      expect(state.snapshot.submission.x).toBeGreaterThan(0)
      expect(state.snapshot.submission.y).toBeGreaterThan(0)
      expect(state.snapshot.normalizer.x).toBeGreaterThan(0)
      expect(state.snapshot.normalizer.y).toBeGreaterThan(0)
    }
  })
})

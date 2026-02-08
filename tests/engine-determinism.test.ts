import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../lib/sim/engine'
import { SeededRng } from '../lib/sim/utils'
import type { ActiveStrategyRuntime, SimulationConfig } from '../lib/sim/types'

const fixedRuntime: ActiveStrategyRuntime = {
  ref: {
    kind: 'builtin',
    id: 'baseline30',
  },
  name: 'Baseline 30 bps',
  code: 'contract Strategy {}',
  explanationMode: 'line-level',
  initialize: async () => ({
    bidBps: 30,
    askBps: 30,
    lines: [1],
    explanation: 'init',
    stateBadge: '30/30',
    changedSlots: [],
  }),
  onSwap: async () => ({
    bidBps: 30,
    askBps: 30,
    lines: [1],
    explanation: 'swap',
    stateBadge: '30/30',
    changedSlots: [],
  }),
}

const config: SimulationConfig = {
  seed: 1337,
  strategyRef: {
    kind: 'builtin',
    id: 'baseline30',
  },
  playbackSpeed: 3,
  maxTapeRows: 20,
}

async function runSeries(seed: number): Promise<Array<{ step: number; fairPrice: number; edge: number; fee: number }>> {
  const engine = new SimulationEngine({ ...config, seed }, fixedRuntime)
  const rng = new SeededRng(seed)

  await engine.reset(() => rng.reset(seed))

  const series: Array<{ step: number; fairPrice: number; edge: number; fee: number }> = []

  for (let index = 0; index < 24; index += 1) {
    await engine.stepOne(() => rng.between(0, 1), () => rng.gaussian())
    const state = engine.toUiState([{ kind: 'builtin', id: 'baseline30', name: 'Baseline 30 bps' }], [], false)
    series.push({
      step: state.snapshot.step,
      fairPrice: Number(state.snapshot.fairPrice.toFixed(8)),
      edge: Number(state.snapshot.edge.total.toFixed(8)),
      fee: state.snapshot.strategy.bid,
    })
  }

  return series
}

describe('simulation engine determinism', () => {
  it('replays same sequence for same seed', async () => {
    const first = await runSeries(1337)
    const second = await runSeries(1337)
    expect(first).toEqual(second)
  })

  it('produces different sequence for different seed', async () => {
    const first = await runSeries(1337)
    const second = await runSeries(1338)
    expect(first).not.toEqual(second)
  })
})

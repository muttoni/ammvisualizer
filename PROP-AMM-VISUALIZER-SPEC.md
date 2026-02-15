# Prop AMM Visualizer Spec

**Author:** Codex  
**Date:** 2026-02-15  
**Status:** Definitive implementation plan (starter strategy section)

---

## 1. Objective

Add a new section to the AMM Visualizer for the **Prop AMM Challenge** that lets users step through the **built-in starter strategy** under the real Prop AMM simulation mechanics.

Primary outcome:

- A `/prop-amm` route with side-by-side strategy code + market simulation.
- Behavior aligned with `prop-amm-challenge` runtime semantics (not approximate EVM-fee semantics).
- MVP limited to built-in starter strategy + normalizer (no custom Rust compilation in browser).

---

## 2. Source of Truth

This plan is grounded in:

- `https://github.com/benedictbrady/prop-amm-challenge` (README + runtime crates)
- `https://github.com/muttoni/ammvisualizer/blob/main/PROP-AMM-VISUALIZER-SPEC.md` (draft to sense-check and refine)

Critical mechanics from the challenge codebase:

- 10,000 simulation steps per run.
- Per simulation, sample:
  - `gbm_sigma ~ U[0.0001, 0.007]`
  - `retail_arrival_rate ~ U[0.4, 1.2]`
  - `retail_mean_size ~ U[12, 28]`
  - `norm_fee_bps ~ U{30..80}`
  - `norm_liquidity_mult ~ U[0.4, 2.0]`
- Step order:
  1. Fair price GBM update
  2. Arbitrage on submission AMM
  3. Arbitrage on normalizer AMM
  4. Poisson retail arrivals routed across both AMMs
- Starter strategy:
  - Constant product
  - 5% fee (`FEE_NUMERATOR=950`, `FEE_DENOMINATOR=1000`)
  - `after_swap` no-op
- Instruction model:
  - `compute_swap` payload includes 1024-byte read-only storage
  - `after_swap` payload includes post-trade reserves + step + mutable storage
- Arithmetic path:
  - Quotes/execution use `u64` nano units (1e9 scaling), then convert back to `f64` for simulator reserves.

---

## 3. Scope

### In scope (MVP)

- New `/prop-amm` section.
- Built-in starter strategy visualization.
- Normalizer with sampled fee/liquidity regime.
- Trade-by-trade playback controls (play/pause/step/reset).
- Trade tape with edge deltas and flow type.
- Prop-specific metrics panel.
- Read-only Rust code panel for starter strategy.
- Storage panel (1024-byte view), even if unchanged for starter.

### Out of scope (deferred)

- User-authored Rust strategy upload/compile/execute.
- Browser-side Rust toolchain/WASM compiler integration.
- Full BPF runtime emulation in browser.
- Leaderboard submission flow.

---

## 4. Sense Check vs Existing Draft Spec

The referenced draft is directionally correct. The following changes are required for parity and clarity:

1. Event order must match Rust engine exactly: `price -> submission arb -> normalizer arb -> retail`.
2. Normalizer fee handling must match native normalizer path: fee read from storage bytes `[0..2]` and initialized from sampled `norm_fee_bps`.
3. Runtime math must preserve nano-unit conversion and integer rounding behavior (`u64`, ceil-div) before reserve updates.
4. `after_swap` must run only after executed trades, never during quote search.
5. Arbitrage logic is asymmetric:
   - submission side uses bracket + golden search over quote surface
   - normalizer side uses closed-form candidate sizing then quote check
6. MVP built-ins should be starter-first. Additional synthetic curves are optional future work, not baseline requirements.
7. Storage support is still required in UI and engine even if starter does not mutate storage.

---

## 5. Product Design

### Routes and navigation

- Keep current page unchanged at `/`.
- Add new page at `/prop-amm`.
- Add explicit navigation in header between `AMM Challenge` and `Prop AMM`.

### Page layout

- Keep the same two-panel mental model:
  - left: code panel
  - right: market panel with chart, metrics, trade tape
- Reuse existing shell/theming styles where possible.

### Code panel (Prop)

- Read-only Rust source for starter strategy.
- Rust syntax highlighting.
- No compile/edit actions in MVP.
- "What this code is doing" panel with deterministic explanation templates for:
  - buy branch
  - sell branch
  - invalid side / zero reserve fallback
- Metadata strip:
  - strategy name
  - model-used string from source
  - storage usage: `No-op` for starter

### Market panel (Prop)

Displayed metrics:

- Step index and trade count
- Fair price
- Submission spot price
- Normalizer spot price
- Submission cumulative edge:
  - total
  - retail component
  - arbitrage component
- Sampled regime (fixed for simulation):
  - sigma
  - retail arrival rate
  - retail mean size
  - normalizer fee bps
  - normalizer liquidity multiplier
- Storage summary:
  - changed byte count
  - last write step

Trade tape row fields:

- Flow: `system | arbitrage | retail`
- Pool: `submission | normalizer`
- Direction: AMM buys X vs sells X
- Input/output amounts (human + nano)
- Fair price at execution
- Edge delta (submission trades only)
- Router split context for retail events (submission share)

Chart behavior:

- Show both AMM reserve states and reserve trails.
- Show fair price target point for each pool.
- Keep existing curve visuals for starter/normalizer (hyperbolic), but structure chart API to allow sampled custom curves later.

---

## 6. Technical Architecture

### New files

```text
app/prop-amm/page.tsx
hooks/usePropSimulationWorker.ts
workers/prop-simulation.worker.ts
workers/prop-messages.ts

components/prop/PropCodePanel.tsx
components/prop/PropMarketPanel.tsx
components/prop/PropAmmChart.tsx

lib/prop-sim/constants.ts
lib/prop-sim/types.ts
lib/prop-sim/nano.ts
lib/prop-sim/rng.ts
lib/prop-sim/priceProcess.ts
lib/prop-sim/amm.ts
lib/prop-sim/arbitrage.ts
lib/prop-sim/router.ts
lib/prop-sim/retail.ts
lib/prop-sim/engine.ts

lib/prop-strategies/builtins.ts
lib/prop-strategies/starterSource.ts

store/usePropUiStore.ts
store/usePropPlaybackStore.ts
```

### Existing files to modify

```text
components/HeaderActions.tsx         (add nav link)
app/globals.css                      (prop panel classes)
```

### Deliberate isolation

- Do not modify `lib/sim/*`, `workers/simulation.worker.ts`, or existing EVM strategy runtime.
- Prop simulator and worker remain independent to reduce regression risk.

---

## 7. Data Model

```ts
type PropFlowType = 'system' | 'arbitrage' | 'retail'

interface PropSimulationConfig {
  seed: number
  playbackSpeed: number
  maxTapeRows: number
  nSteps: number // default 10_000
}

interface PropSampledRegime {
  gbmSigma: number
  retailArrivalRate: number
  retailMeanSize: number
  normFeeBps: number
  normLiquidityMult: number
}

interface PropAmmState {
  name: 'submission' | 'normalizer'
  reserveX: number
  reserveY: number
  storage: Uint8Array // 1024 bytes
}

interface PropSnapshot {
  step: number
  fairPrice: number
  submission: { x: number; y: number; spot: number }
  normalizer: { x: number; y: number; spot: number }
  edge: { total: number; retail: number; arb: number }
  regime: PropSampledRegime
}

interface PropTradeEvent {
  id: number
  step: number
  flow: PropFlowType
  amm: 'submission' | 'normalizer'
  side: 'buy_x' | 'sell_x'
  inputAmount: number
  outputAmount: number
  fairPrice: number
  edgeDelta: number
  codeLines: number[]
  codeExplanation: string
  storageChangedBytes: number
  snapshot: PropSnapshot
}
```

---

## 8. Runtime Semantics (must match challenge behavior)

### Swap interface semantics

- `side=0`: buy X with Y input.
- `side=1`: sell X for Y output.
- Strategy receives reserves + storage in nano-unit instruction payload.
- Return `u64` output amount in nano units.

### Starter strategy implementation

- Implement TypeScript mirror of `programs/starter/src/lib.rs`.
- Preserve integer path:
  - `k = reserve_x * reserve_y`
  - `net = input * 950 / 1000`
  - `new reserve` via ceil division
  - saturating subtraction behavior

### Normalizer implementation

- Implement TypeScript mirror of `crates/shared/src/normalizer.rs`.
- Fee bps read from storage bytes `[0..2]`, fallback to 30 if zero.
- Initialize normalizer storage with sampled `norm_fee_bps` LE bytes.

### after_swap behavior

- Called after every executed trade on each AMM.
- Not called during arbitrage/router quote evaluations.
- Starter `after_swap` is no-op, but engine must support future storage updates.

### Arbitrage behavior

- Submission AMM:
  - evaluate both sides via quote functions
  - bracket maximum with growth 2.0 up to 24 steps
  - golden search up to 12 iterations
  - stop when input bracket width <= 1% relative
- Normalizer AMM:
  - closed-form candidate sizing per side using fee-adjusted CP formulas
  - evaluate both sides, execute better profitable candidate
- Global thresholds:
  - minimum arb profit: `0.01 Y`
  - minimum arb notional floor: `0.01 Y`

### Retail routing behavior

- Sample `n ~ Poisson(lambda)` orders per step.
- Each order size from log-normal with sampled mean and fixed sigma.
- Buy/sell side is Bernoulli `p=0.5`.
- Router split uses golden-section search over alpha in `[0,1]`:
  - max 14 iterations
  - alpha tolerance 1e-3
  - submission amount rel tolerance 1e-2
  - objective gap early-stop tolerance 1e-2

### Edge accounting

For submission trades only:

- AMM buys X (sell-X flow): `edge = amount_x * fair_price - amount_y`
- AMM sells X (buy-X flow): `edge = amount_y - amount_x * fair_price`

Total edge is cumulative sum; also track `retail` and `arb` components separately.

---

## 9. UI/Worker Contract

`workers/prop-messages.ts` should mirror current architecture with Prop-specific payloads:

- inbound:
  - `INIT_PROP_SIM`
  - `SET_PROP_CONFIG`
  - `STEP_PROP_ONE`
  - `PLAY_PROP`
  - `PAUSE_PROP`
  - `RESET_PROP`
- outbound:
  - `PROP_STATE`
  - `PROP_ERROR`

No compile/library message types in MVP.

---

## 10. Testing and Validation

### Unit tests

- Nano conversion helpers (`toNano`, `fromNano`, saturating bounds).
- Starter `computeSwap` parity cases against Rust logic.
- Normalizer dynamic fee decoding from storage.
- Arbitrage threshold behavior (`min_arb_profit`, notional floor).
- Router split behavior and early-stop criteria.

### Integration tests

- Deterministic seed replay snapshots for:
  - first N events
  - cumulative edge
  - regime sampling
- Validate invariants on each event:
  - reserves remain finite and positive
  - spot price finite
  - no negative outputs
  - after_swap called only after execution

### Manual acceptance checklist

- `/prop-amm` loads with starter code and active simulation controls.
- Initial system event displays sampled regime and initial reserves.
- Stepping produces arbitrage and retail events with sensible deltas.
- Trade tape and metrics remain consistent after reset.
- Existing `/` route remains unchanged.

---

## 11. Implementation Plan

### Phase 1: Simulation core

- Build `lib/prop-sim/*` engine and math modules.
- Implement starter and normalizer runtime mirrors.
- Implement Prop worker and hook.
- Add engine-level tests for parity-critical behavior.

### Phase 2: Prop UI

- Add `/prop-amm` page.
- Build `PropCodePanel`, `PropMarketPanel`, and chart component.
- Wire playback controls and tape rendering.
- Add header navigation and styling.

### Phase 3: QA and stabilization

- Add deterministic integration fixtures.
- Verify no regression in existing EVM visualizer path.
- Tune rendering performance for long simulations.
- Final doc pass in README and this spec.

---

## 12. Risks and Mitigations

- Risk: drift from Rust semantics due numeric differences.  
  Mitigation: enforce nano/int-first quote path + fixture-based parity tests.

- Risk: UI complexity from adding second simulator mode.  
  Mitigation: strict module isolation and route-level separation.

- Risk: storage view adds complexity without starter value.  
  Mitigation: keep minimal, read-only summary in MVP and expand later.

---

## 13. Deferred Extensions

- Built-in adaptive storage strategy for demonstrating `after_swap`.
- Upload custom `lib.rs` and run in remote sandbox.
- Optional BPF parity mode badge in UI.
- Batch score distribution panel (1,000-sim summary).

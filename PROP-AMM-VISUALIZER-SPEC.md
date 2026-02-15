# Prop AMM Visualizer Spec

**Author:** Cesare  
**Date:** 2026-02-15  
**Status:** Draft  

---

## Overview

This document specifies a new section of the AMM Visualizer to support the **Prop AMM Challenge** — a custom price function competition using Rust/Solana-style programs. Unlike the original AMM Challenge (dynamic fees on constant-product), Prop AMM lets participants define the *entire* output calculation for swaps.

**Goal:** Enable visual debugging and intuition-building for Prop AMM strategies, mirroring the same step-through experience the current visualizer provides for Solidity fee strategies.

---

## Key Differences from Original Challenge

| Aspect | Original AMM Challenge | Prop AMM Challenge |
|--------|------------------------|-------------------|
| **Language** | Solidity | Rust |
| **Core Interface** | `afterSwap() → (bidFee, askFee)` | `compute_swap() → output_amount` |
| **Pricing Model** | Constant-product + dynamic fees | Custom price function (any curve) |
| **Storage** | 32 uint256 slots | 1024-byte buffer |
| **Normalizer** | Fixed 30 bps | Variable: 30-80 bps fee, 0.4-2.0x liquidity |
| **Volatility** | σ ~ U[0.088%, 0.101%] | σ ~ U[0.01%, 0.70%] |
| **Arbitrage** | Closed-form optimal | Golden-section search |
| **Requirements** | None | Monotonic, concave, <100k CU |

---

## Architecture Changes

### 1. New Route Structure

```
/                       → Original AMM Challenge Visualizer (existing)
/prop-amm               → Prop AMM Challenge Visualizer (new)
```

Both share layout chrome (header, footer, theme) but have separate simulation engines and strategy systems.

### 2. New Module Structure

```
lib/
├── sim/                          # Original engine (unchanged)
│   ├── engine.ts
│   ├── math.ts
│   ├── types.ts
│   └── ...
└── prop-sim/                     # NEW: Prop AMM engine
    ├── engine.ts                 # PropSimulationEngine class
    ├── math.ts                   # Custom curve math, golden-section search
    ├── types.ts                  # PropAmmState, PropSnapshot, etc.
    ├── constants.ts              # Parameter ranges, defaults
    ├── normalizer.ts             # Variable normalizer logic
    └── arbitrage.ts              # Golden-section arb solver

workers/
├── simulation.worker.ts          # Original worker (unchanged)
└── prop-simulation.worker.ts     # NEW: Prop AMM worker

components/
├── MarketPanel.tsx               # Shared (parameterized)
├── CodePanel.tsx                 # Shared (language-aware)
├── PropCodePanel.tsx             # NEW: Rust-specific code display
└── PropMarketPanel.tsx           # NEW: Prop-specific metrics

lib/
└── prop-strategies/
    ├── builtins.ts               # Built-in Rust strategy definitions
    └── starter.rs                # Embedded starter strategy source
```

### 3. Simulation Engine (PropSimulationEngine)

#### State Shape

```typescript
interface PropAmmState {
  name: string
  reserveX: number          // 1e9 scale internally
  reserveY: number
  isStrategy: boolean
  // No explicit fees — pricing determined by compute_swap
}

interface PropNormalizerConfig {
  feeBps: number            // Sampled per simulation: U{30..80}
  liquidityMult: number     // Sampled per simulation: U[0.4, 2.0]
}

interface PropSnapshot {
  step: number
  fairPrice: number
  strategy: {
    x: number
    y: number
    k: number               // Effective k for reference
    impliedBid: number      // Back-calculated from last trade
    impliedAsk: number
  }
  normalizer: {
    x: number
    y: number
    k: number
    feeBps: number
    liquidityMult: number
  }
  edge: {
    total: number
    retail: number
    arb: number
  }
}
```

#### Parameter Ranges (from spec)

```typescript
const PROP_PARAMS = {
  // Price process
  volatility: { min: 0.0001, max: 0.007 },  // 0.01% to 0.70% per step
  
  // Retail flow
  arrivalRate: { min: 0.4, max: 1.2 },
  orderSizeMean: { min: 12, max: 28 },      // Y terms
  
  // Normalizer
  normalizerFee: { min: 30, max: 80 },      // bps, integer
  normalizerLiquidity: { min: 0.4, max: 2.0 },
  
  // Initial reserves
  initialX: 100,
  initialY: 10_000,
  initialPrice: 100,
  
  // Arbitrage thresholds
  arbMinProfit: 0.01,                        // Y units
  arbBracketTolerance: 0.01,                 // 1% relative
}
```

### 4. Custom Price Function Interface

Instead of returning fees, Prop AMM strategies return `output_amount` directly:

```typescript
interface PropComputeSwapInput {
  side: 0 | 1                // 0 = buy X (Y in), 1 = sell X (X in)
  inputAmount: bigint        // 1e9 scale
  reserveX: bigint
  reserveY: bigint
  storage: Uint8Array        // 1024 bytes, read-only during quote
}

interface PropComputeSwapOutput {
  outputAmount: bigint       // 1e9 scale
}

interface PropAfterSwapInput {
  tag: 2
  side: 0 | 1
  inputAmount: bigint
  outputAmount: bigint
  reserveX: bigint           // Post-trade
  reserveY: bigint
  step: bigint
  storage: Uint8Array        // 1024 bytes, read/write
}
```

### 5. Built-in Strategies

The visualizer will include TypeScript implementations that mirror the behavior of Rust starter strategies:

```typescript
// lib/prop-strategies/builtins.ts

export const PROP_BUILTIN_STRATEGIES: PropBuiltinStrategy[] = [
  {
    id: 'starter-500bps',
    name: 'Starter (500 bps)',
    code: STARTER_RUST_SOURCE,
    computeSwap: (input) => {
      // Constant-product with 5% fee (500 bps)
      const FEE_NUM = 950n
      const FEE_DENOM = 1000n
      const k = input.reserveX * input.reserveY
      
      if (input.side === 0) {
        // Buy X: input Y, output X
        const netY = (input.inputAmount * FEE_NUM) / FEE_DENOM
        const newY = input.reserveY + netY
        const newX = (k + newY - 1n) / newY  // ceil div
        return { outputAmount: input.reserveX - newX }
      } else {
        // Sell X: input X, output Y
        const netX = (input.inputAmount * FEE_NUM) / FEE_DENOM
        const newX = input.reserveX + netX
        const newY = (k + newX - 1n) / newX
        return { outputAmount: input.reserveY - newY }
      }
    },
    afterSwap: (input, storage) => {
      // No-op for starter
      return storage
    },
  },
  {
    id: 'constant-product-30bps',
    name: 'Constant Product (30 bps)',
    // ... similar implementation with 30 bps
  },
  {
    id: 'linear-invariant',
    name: 'Linear Invariant (Stable)',
    // ... x + y = k style pricing
  },
]
```

### 6. Golden-Section Arbitrage Solver

Unlike the original closed-form arb calculation, Prop AMM uses golden-section search:

```typescript
// lib/prop-sim/arbitrage.ts

interface ArbResult {
  side: 'buy' | 'sell'
  inputAmount: number
  expectedProfit: number
}

export function findPropArbOpportunity(
  amm: PropAmmState,
  fairPrice: number,
  computeSwap: (side: 0 | 1, input: bigint) => bigint,
  minProfit: number = 0.01,
  tolerance: number = 0.01,
): ArbResult | null {
  // Golden-section search for optimal trade size
  // Early-stop when bracket width < tolerance
  // Skip if expected profit < minProfit
  
  const PHI = (1 + Math.sqrt(5)) / 2
  // ... implementation
}
```

### 7. Order Routing with Golden-Section

```typescript
// lib/prop-sim/math.ts

export function routeRetailOrderProp(
  strategy: PropAmmState,
  normalizer: PropAmmState,
  strategyQuote: (side: 0 | 1, input: bigint) => bigint,
  normalizerQuote: (side: 0 | 1, input: bigint) => bigint,
  order: { side: 'buy' | 'sell'; sizeY: number },
  tolerance: number = 0.01,
): Array<[PropAmmState, number]> {
  // Golden-section search over split ratio α ∈ [0, 1]
  // Maximize total output
  // Early-stop when submission trade < 1% bracket or 1% objective gap
}
```

---

## UI Changes

### 1. New Page: `/prop-amm`

```
app/
├── page.tsx                      # Original (unchanged)
└── prop-amm/
    └── page.tsx                  # Prop AMM visualizer
```

### 2. Code Panel Differences

| Feature | Original | Prop AMM |
|---------|----------|----------|
| Language | Solidity | Rust |
| Syntax highlighting | solidity | rust |
| Line explanation | Fee return values | Output amount calculation |
| Storage display | slots[0..31] | 1024-byte hex view |
| Compiler | In-browser solc | N/A (builtins only for MVP) |

**MVP Scope:** For the initial release, only built-in strategies are supported. Custom Rust compilation would require WASM tooling and is deferred to a future iteration.

### 3. Market Panel Differences

| Metric | Original | Prop AMM |
|--------|----------|----------|
| "Strategy Fees" | bid/ask bps | Implied bid/ask (back-calculated) |
| "Slot[0] Fee" | Direct read | Storage byte view |
| Normalizer info | Fixed 30/30 bps | Variable fee + liquidity mult |
| Curve shape | Always hyperbolic | Varies by strategy |

**New Metrics for Prop AMM:**

```
┌─────────────────────────────────────────────────────────────┐
│ Fair Price: 101.234 Y/X    │ Strategy Spot: 100.891 Y/X    │
│ Implied Fees: ~47/52 bps   │ Normalizer: 45 bps @ 1.3x liq │
│ Curve Type: Concave ✓      │ Monotonic ✓                   │
│ Cumulative Edge: +12.34 (retail +45.67, arb -33.33)        │
└─────────────────────────────────────────────────────────────┘
```

### 4. Chart Adaptations

The reserve curve chart needs to handle non-hyperbolic curves:

- **Current:** Draws `xy = k` hyperbola
- **Prop AMM:** Sample the actual pricing function to draw effective curve

```typescript
function samplePriceCurve(
  computeSwap: (side: 0 | 1, input: bigint) => bigint,
  reserveX: number,
  reserveY: number,
  steps: number = 50,
): Array<{ x: number; y: number }> {
  // Sample buy/sell at various sizes to trace the effective curve
}
```

### 5. Trade Tape Differences

Add normalizer config display per simulation:

```
┌──────────────────────────────────────────────────────────────┐
│ [System] Simulation started                                   │
│ Normalizer config: 45 bps fee, 1.32x liquidity               │
│ Volatility regime: 0.34% per step                            │
├──────────────────────────────────────────────────────────────┤
│ [Arb] t=1 | Strategy: sold 0.234 X for 23.12 Y               │
│ fair=101.2, implied spread ~48 bps | edge delta: -0.12       │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Engine (Week 1)

- [ ] Create `lib/prop-sim/` module structure
- [ ] Implement `PropSimulationEngine` class
- [ ] Implement golden-section arbitrage solver
- [ ] Implement golden-section order router
- [ ] Add 3 built-in strategies (starter, 30bps, linear)
- [ ] Create `prop-simulation.worker.ts`

### Phase 2: UI Integration (Week 2)

- [ ] Create `/prop-amm/page.tsx` route
- [ ] Adapt `CodePanel` for Rust syntax
- [ ] Create `PropMarketPanel` with new metrics
- [ ] Update chart to sample custom curves
- [ ] Add normalizer config display

### Phase 3: Polish & Testing (Week 3)

- [ ] Add strategy explanation system for Prop
- [ ] Cross-check edge calculation against reference
- [ ] Add curve shape validation display
- [ ] Performance optimization
- [ ] Documentation

### Future (Deferred)

- Custom Rust strategy compilation (WASM toolchain)
- Side-by-side comparison mode
- Export simulation traces

---

## Open Questions

1. **WASM Compilation:** Should we support custom Rust strategies via in-browser compilation? This requires bundling Rust/WASM tooling and significantly increases complexity. Recommend deferring to v2.

2. **Shared vs Separate Workers:** Should Prop AMM share the simulation worker with original, or use a completely separate worker? Recommend separate for clarity.

3. **Curve Visualization:** For non-constant-product curves, how many sample points are needed for smooth visualization? Recommend 50-100 points with adaptive sampling near current reserves.

4. **Storage View:** How to display 1024 bytes usefully? Recommend collapsible hex view with "changed bytes" highlighting.

---

## References

- [Prop AMM Challenge Spec](https://github.com/benedictbrady/prop-amm-challenge)
- [Original AMM Challenge](https://github.com/benedictbrady/amm-challenge)
- [Current Visualizer Repo](https://github.com/muttoni/ammvisualizer)

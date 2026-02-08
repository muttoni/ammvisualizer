# AMM Starter Strategy Visualizer

Interactive side-by-side visualizer for starter AMM fee strategies:

- Left panel: strategy Solidity code with active line highlights
- Right panel: reserve-curve market simulation and trade tape
- Per trade: explanation of what branch ran in `afterSwap`

## Run

From this repo root:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Deploy

This is a static frontend (HTML/CSS/JS only), so it can be deployed directly to platforms like Vercel, Netlify, or Cloudflare Pages with no build step.

## Included strategies

- Baseline 30 bps
- Starter 50 bps
- Widen After Big Trades (simple adaptive starter)

Simulation behavior follows the challenge mechanics:

- Constant-product AMM with fee-on-input
- Fair price random walk each step
- Closed-form arbitrage sizing
- Retail routing split against a 30 bps normalizer

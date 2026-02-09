# AMM Strategy Visualizer

An interactive visual companion for the [AMM Fee Strategy Challenge](https://ammchallenge.com).

<img width="1507" height="817" alt="image" src="https://github.com/user-attachments/assets/1502aac5-0cfd-44f0-91c9-00ca0c949b4e" />

## Why I Built This

The [AMM Challenge](https://ammchallenge.com) is a great way to learn dynamic fee strategy design, but it can be hard to build intuition from raw simulation outputs alone.

You can write a strategy, run a simulation, and get a score, but that still leaves an important question:

**What is my code actually doing at each trade, and why?**

This tool was built to answer that question visually.

## What This Tool Does

AMM Strategy Visualizer lets you step through AMM market activity trade-by-trade while seeing strategy behavior in context:

- Strategy code on the left
- Market simulation on the right
- Explanations that connect runtime behavior back to code

It mirrors core AMMchallenge mechanics (constant product market making, fair-price evolution, arbitrage pressure, and retail routing against a normalizer pool) so you can debug strategy ideas faster.

## Key Features

- Side-by-side strategy and market view
- Step / Play / Pause / Reset simulation controls
- Trade tape with per-trade event history
- Reserve curve chart with auto-zoom support
- Per-pool depth view (Strategy vs Normalizer)
- Built-in starter strategies
- Custom Solidity strategy editor and compile flow
- Local custom strategy library (persisted in browser)
- "What the code is doing" explanation panel
- Light and dark themes

## Why You Should Use It

- Build intuition faster than reading logs
- Debug fee logic branch-by-branch
- Understand tradeoffs between retail flow capture and arbitrage loss
- Compare fixed-fee and adaptive strategies visually
- Iterate quickly before submitting to the AMMchallenge

If you're learning AMM strategy design (or teaching it), this gives a much clearer feedback loop than score-only iteration.

## Architecture (High Level)

- Next.js App Router + TypeScript frontend
- Client-side simulation worker runtime
- In-browser custom strategy compile/runtime path
- No login required
- No backend service required for core use

## Local Development (Next.js)

Clone the repo, then:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful scripts:

```bash
npm run build   # production build
npm run test    # run vitest suite
npm run lint    # lint checks
```

Note: custom strategy compilation relies on a local `soljson` asset that is synced automatically via project scripts.

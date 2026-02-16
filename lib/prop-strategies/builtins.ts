import type { PropBuiltinStrategy, PropComputeSwapInput } from '../prop-sim/types'

const STARTER_RUST_SOURCE = `use pinocchio::{account_info::AccountInfo, entrypoint, pubkey::Pubkey, ProgramResult};
use prop_amm_submission_sdk::{set_return_data_bytes, set_return_data_u64};

/// Required: displayed on the leaderboard.
const NAME: &str = "Starter (500 bps)";
const MODEL_USED: &str = "None";

const FEE_NUMERATOR: u128 = 950;
const FEE_DENOMINATOR: u128 = 1000;
const STORAGE_SIZE: usize = 1024;

#[derive(wincode::SchemaRead)]
struct ComputeSwapInstruction {
    side: u8,
    input_amount: u64,
    reserve_x: u64,
    reserve_y: u64,
    _storage: [u8; STORAGE_SIZE],
}

#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey, _accounts: &[AccountInfo], instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.is_empty() {
        return Ok(());
    }

    match instruction_data[0] {
        0 | 1 => {
            let output = compute_swap(instruction_data);
            set_return_data_u64(output);
        }
        2 => { /* afterSwap - no-op for starter */ }
        3 => set_return_data_bytes(NAME.as_bytes()),
        4 => set_return_data_bytes(get_model_used().as_bytes()),
        _ => {}
    }
    Ok(())
}

pub fn get_model_used() -> &'static str {
    MODEL_USED
}

pub fn compute_swap(data: &[u8]) -> u64 {
    let decoded: ComputeSwapInstruction = match wincode::deserialize(data) {
        Ok(decoded) => decoded,
        Err(_) => return 0,
    };

    let side = decoded.side;
    let input_amount = decoded.input_amount as u128;
    let reserve_x = decoded.reserve_x as u128;
    let reserve_y = decoded.reserve_y as u128;

    if reserve_x == 0 || reserve_y == 0 {
        return 0;
    }

    let k = reserve_x * reserve_y;

    match side {
        0 => {
            // Buy X: input is Y, output is X
            let net_y = input_amount * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_ry = reserve_y + net_y;
            let k_div = (k + new_ry - 1) / new_ry;  // ceil div
            reserve_x.saturating_sub(k_div) as u64
        }
        1 => {
            // Sell X: input is X, output is Y
            let net_x = input_amount * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_rx = reserve_x + net_x;
            let k_div = (k + new_rx - 1) / new_rx;  // ceil div
            reserve_y.saturating_sub(k_div) as u64
        }
        _ => 0,
    }
}

/// Optional native hook for local testing.
pub fn after_swap(_data: &[u8], _storage: &mut [u8]) {
    // No-op for starter
}`

const BASELINE_30BPS_SOURCE = `// Constant-product AMM with 30 basis points fee
// This matches the normalizer's behavior when fee=30bps

const NAME: &str = "Baseline (30 bps)";
const FEE_NUMERATOR: u128 = 9970;  // 100% - 0.30%
const FEE_DENOMINATOR: u128 = 10000;

pub fn compute_swap(side: u8, input: u128, rx: u128, ry: u128) -> u64 {
    if rx == 0 || ry == 0 { return 0; }
    let k = rx * ry;
    
    match side {
        0 => {  // Buy X (input Y)
            let net_y = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_ry = ry + net_y;
            rx.saturating_sub((k + new_ry - 1) / new_ry) as u64
        }
        1 => {  // Sell X (input X)
            let net_x = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_rx = rx + net_x;
            ry.saturating_sub((k + new_rx - 1) / new_rx) as u64
        }
        _ => 0,
    }
}`

const TIGHT_10BPS_SOURCE = `// Aggressive constant-product AMM with 10 basis points fee
// Tighter spread attracts more flow but more arb exposure

const NAME: &str = "Tight (10 bps)";
const FEE_NUMERATOR: u128 = 9990;  // 100% - 0.10%
const FEE_DENOMINATOR: u128 = 10000;

pub fn compute_swap(side: u8, input: u128, rx: u128, ry: u128) -> u64 {
    if rx == 0 || ry == 0 { return 0; }
    let k = rx * ry;
    
    match side {
        0 => {  // Buy X (input Y)
            let net_y = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_ry = ry + net_y;
            rx.saturating_sub((k + new_ry - 1) / new_ry) as u64
        }
        1 => {  // Sell X (input X)
            let net_x = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_rx = rx + net_x;
            ry.saturating_sub((k + new_rx - 1) / new_rx) as u64
        }
        _ => 0,
    }
}`

const WIDE_100BPS_SOURCE = `// Wide constant-product AMM with 100 basis points fee
// Wider spread = more profit per trade but less flow

const NAME: &str = "Wide (100 bps)";
const FEE_NUMERATOR: u128 = 9900;  // 100% - 1.00%
const FEE_DENOMINATOR: u128 = 10000;

pub fn compute_swap(side: u8, input: u128, rx: u128, ry: u128) -> u64 {
    if rx == 0 || ry == 0 { return 0; }
    let k = rx * ry;
    
    match side {
        0 => {  // Buy X (input Y)
            let net_y = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_ry = ry + net_y;
            rx.saturating_sub((k + new_ry - 1) / new_ry) as u64
        }
        1 => {  // Sell X (input X)
            let net_x = input * FEE_NUMERATOR / FEE_DENOMINATOR;
            let new_rx = rx + net_x;
            ry.saturating_sub((k + new_rx - 1) / new_rx) as u64
        }
        _ => 0,
    }
}`

/**
 * Helper to create a constant-product compute_swap function with given fee
 */
function makeConstantProductSwap(feeNumerator: bigint, feeDenominator: bigint) {
  return (input: PropComputeSwapInput): bigint => {
    const { side, inputAmount, reserveX, reserveY } = input
    
    if (reserveX === 0n || reserveY === 0n) return 0n
    
    const k = reserveX * reserveY
    
    if (side === 0) {
      // Buy X: input Y, output X
      const netY = (inputAmount * feeNumerator) / feeDenominator
      const newRY = reserveY + netY
      const kDiv = (k + newRY - 1n) / newRY  // ceil div
      const output = reserveX - kDiv
      return output > 0n ? output : 0n
    } else {
      // Sell X: input X, output Y
      const netX = (inputAmount * feeNumerator) / feeDenominator
      const newRX = reserveX + netX
      const kDiv = (k + newRX - 1n) / newRX  // ceil div
      const output = reserveY - kDiv
      return output > 0n ? output : 0n
    }
  }
}

export const PROP_BUILTIN_STRATEGIES: PropBuiltinStrategy[] = [
  {
    id: 'starter-500bps',
    name: 'Starter (500 bps)',
    code: STARTER_RUST_SOURCE,
    feeBps: 500,
    computeSwap: makeConstantProductSwap(950n, 1000n),  // 5% fee = 950/1000
  },
  {
    id: 'baseline-30bps',
    name: 'Baseline (30 bps)',
    code: BASELINE_30BPS_SOURCE,
    feeBps: 30,
    computeSwap: makeConstantProductSwap(9970n, 10000n),  // 0.30% fee
  },
  {
    id: 'tight-10bps',
    name: 'Tight (10 bps)',
    code: TIGHT_10BPS_SOURCE,
    feeBps: 10,
    computeSwap: makeConstantProductSwap(9990n, 10000n),  // 0.10% fee
  },
  {
    id: 'wide-100bps',
    name: 'Wide (100 bps)',
    code: WIDE_100BPS_SOURCE,
    feeBps: 100,
    computeSwap: makeConstantProductSwap(9900n, 10000n),  // 1.00% fee
  },
]

export function getPropBuiltinStrategyById(id: string): PropBuiltinStrategy | undefined {
  return PROP_BUILTIN_STRATEGIES.find((s) => s.id === id)
}

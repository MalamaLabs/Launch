//// Genesis 200 MLMA vesting validator.
////
//// Per spec (Section 5):
////   - 100,000 MLMA allocation per operator (1 node = 1 grant)
////   - 25% released at node activation
////   - 75% linear monthly over 6 months (12.5% / month)
////   - 1-year lockup on transfers (enforced off-chain via token policy rules,
////     tracked on-chain via `transferable_at = activated_at + lockup_months`)
////   - Clawback path for operators who exit without returning hardware
////
//// DRAFT: signatory rules for `Clawback` assume a governance multisig whose
//// script hash is baked into `VestingParams.governance`. Finalize in
//// open-questions.md.

use aiken/interval.{Finite}
use aiken/list
use aiken/transaction.{ScriptContext, Spend, Transaction, ValidityRange}
use aiken/transaction/value
use malama/genesis200/types.{
  Activate, Claim, Clawback, VestingDatum, VestingParams, VestingRedeemer,
}

/// Total MLMA vested at `now_ms` for an already-activated grant.
/// Returns 0 before activation.
fn vested_amount(
  params: VestingParams,
  datum: VestingDatum,
  now_ms: Int,
) -> Int {
  when datum.activated_at is {
    None -> 0
    Some(activated) -> {
      let activation_share = datum.total_allocation * params.activation_release_bps / 10000
      let linear_share = datum.total_allocation - activation_share
      let elapsed = now_ms - activated
      if elapsed <= 0 {
        activation_share
      } else {
        let months = elapsed / params.month_duration_ms
        let fully_linear_months =
          if months > params.linear_months {
            params.linear_months
          } else {
            months
          }
        activation_share + linear_share * fully_linear_months / params.linear_months
      }
    }
  }
}

fn lower_bound_ms(range: ValidityRange) -> Option<Int> {
  when range.lower_bound.bound_type is {
    Finite(ms) -> Some(ms)
    _ -> None
  }
}

validator vesting(params: VestingParams) {
  spend(
    datum: Option<VestingDatum>,
    redeemer: VestingRedeemer,
    _utxo_ref,
    self: Transaction,
  ) {
    expect Some(state) = datum
    expect !state.clawed_back

    when redeemer is {
      Activate { activation_time } -> {
        expect state.activated_at == None
        expect Some(now_ms) = lower_bound_ms(self.validity_range)
        expect activation_time <= now_ms
        // Only the operator (or their delegate) can activate.
        expect list.has(self.extra_signatories, state.operator.payment_credential)
        // TODO: verify continuing output preserves allocation but sets
        // activated_at = Some(activation_time) and records the activation
        // release in released_so_far.
        True
      }

      Claim { claim_time } -> {
        expect Some(_) = state.activated_at
        expect Some(now_ms) = lower_bound_ms(self.validity_range)
        expect claim_time <= now_ms
        let vested = vested_amount(params, state, claim_time)
        let claimable = vested - state.released_so_far
        expect claimable > 0
        expect list.has(self.extra_signatories, state.operator.payment_credential)
        // TODO: verify
        //  (a) MLMA output paid to state.operator equals `claimable`
        //  (b) continuing datum sets released_so_far = vested
        //  (c) if now_ms < (activated_at + lockup_months * month_duration_ms),
        //      the claimed MLMA is locked under a non-transferable sub-policy
        //      or sent to a time-locked script. See open-questions.md §Q6.
        True
      }

      Clawback { destination } -> {
        // Governance-authorised forfeiture. Remaining unvested MLMA is swept
        // back to `destination` (typically treasury). The operator's
        // previously-claimed MLMA is unaffected.
        expect list.has(self.extra_signatories, params.treasury)
        // TODO: require a reference input carrying a governance approval
        // token minted under params.governance. Stub signatory check for now.
        expect destination == params.treasury
        True
      }
    }
  }
}

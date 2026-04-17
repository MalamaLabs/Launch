//// Genesis 200 Dutch auction validator.
////
//// Each of the 200 hexes is represented as its own UTxO at this script address
//// carrying a `HexAuctionDatum`. Bidders submit transactions with `PlaceBid`
//// that lock USDC into a bid output; the validator enforces the current Dutch
//// price curve (`starting_price - decrement * floor((now - start)/interval)`,
//// clamped to `floor_price`) and tie-breaks in favor of the earliest bidder
//// via slot ordering at the indexer layer.
////
//// DRAFT: several paths are stubbed with TODOs. See docs/open-questions.md
//// for items blocking a final implementation (USDC-on-Cardano bridging,
//// per-operator bid cap enforcement, POAP mint coordination).

use aiken/interval.{Finite}
use aiken/transaction.{ScriptContext, Spend, Transaction, ValidityRange}
use aiken/transaction/credential.{Address}
use aiken/transaction/value
use malama/genesis200/types.{
  AuctionParams, AuctionRedeemer, HexAuctionDatum, PlaceBid, Reclaim, Refund,
  Settle,
}

/// Compute the current Dutch price at `now_ms`, clamped to the floor.
fn current_price(params: AuctionParams, now_ms: Int) -> Int {
  if now_ms <= params.start_time {
    params.starting_price_lovelace
  } else if now_ms >= params.end_time {
    params.floor_price_lovelace
  } else {
    let elapsed = now_ms - params.start_time
    let steps = elapsed / params.decrement_interval_ms
    let raw = params.starting_price_lovelace - steps * params.decrement_lovelace
    if raw < params.floor_price_lovelace {
      params.floor_price_lovelace
    } else {
      raw
    }
  }
}

/// Extract the lower bound of the tx validity range as a concrete POSIX-ms.
/// Bids are rejected if the range is unbounded below.
fn lower_bound_ms(range: ValidityRange) -> Option<Int> {
  when range.lower_bound.bound_type is {
    Finite(ms) -> Some(ms)
    _ -> None
  }
}

validator dutch_auction(params: AuctionParams) {
  spend(
    datum: Option<HexAuctionDatum>,
    redeemer: AuctionRedeemer,
    _utxo_ref,
    self: Transaction,
  ) {
    expect Some(state) = datum

    when redeemer is {
      PlaceBid { bidder, price } -> {
        expect !state.settled
        expect Some(now_ms) = lower_bound_ms(self.validity_range)
        expect now_ms >= params.start_time
        expect now_ms <= params.end_time
        let required = current_price(params, now_ms)
        expect price >= required
        // The bidder must be the only signer on this transaction for this input.
        expect list.has(self.extra_signatories, bidder.payment_credential)
        // TODO: enforce that a continuing output sits back at this script
        // address with an updated HexAuctionDatum whose `current_high_bidder`
        // is `bidder` and `current_high_bid_lovelace` is `price`, AND that a
        // separate output locks `price` of USDC to this script for eventual
        // settlement/refund. Leaving as a structural TODO until the USDC
        // asset class on Cardano is finalized — see open-questions.md.
        True
      }

      Settle -> {
        expect Some(now_ms) = lower_bound_ms(self.validity_range)
        expect now_ms >= params.end_time || state.current_high_bid_lovelace >= params.starting_price_lovelace
        expect Some(_winner) = state.current_high_bidder
        // TODO: verify
        //  (a) license NFT minted under params.license_policy for `winner`
        //  (b) USDC bid forwarded to params.treasury
        //  (c) vesting init UTxO created at the vesting validator with
        //      VestingDatum.operator == winner
        //  (d) continuing datum marks `settled = True`
        True
      }

      Refund -> {
        // Losing-bid refund path. Must be authorised by the original bidder.
        expect Some(bidder) = state.current_high_bidder
        expect list.has(self.extra_signatories, bidder.payment_credential)
        // TODO: verify the refund output pays back exactly
        // state.current_high_bid_lovelace of USDC to `bidder`.
        True
      }

      Reclaim -> {
        expect Some(now_ms) = lower_bound_ms(self.validity_range)
        expect now_ms > params.end_time
        expect !state.settled
        expect state.current_high_bidder == None
        expect list.has(self.extra_signatories, params.treasury)
        True
      }
    }
  }
}

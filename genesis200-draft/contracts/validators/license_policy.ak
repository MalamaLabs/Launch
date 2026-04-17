//// Hex License NFT minting policy.
////
//// One token per H3 cell. Minted by the Dutch auction validator on Settle,
//// burned on operator offboarding once hardware is confirmed returned. Spec
//// says the license is "lifetime, non-transferable" — we enforce
//// non-transferability by requiring the license token to ride as a reference
//// input (or be burn-and-reminted via governance) rather than be spent
//// normally.
////
//// DRAFT: the auction-validator handoff relies on a one-shot UTxO that both
//// validators share; see dutch_auction.ak Settle handler.

use aiken/list
use aiken/transaction.{Mint, Transaction, ScriptContext}
use cardano/assets.{PolicyId, AssetName}
use malama/genesis200/types.{LicenseDatum}

pub type LicenseAction {
  Mint { hex_id: ByteArray, recipient: ByteArray }
  Burn { hex_id: ByteArray }
}

validator license(auction_script_hash: ByteArray, treasury: ByteArray) {
  mint(action: LicenseAction, policy_id: PolicyId, self: Transaction) {
    when action is {
      Mint { hex_id, recipient } -> {
        // Minting is gated by the auction validator: at least one input must
        // come from the auction script, and its redeemer must be Settle.
        // TODO: inspect self.redeemers for a Spend redeemer on an input whose
        // address credential is ScriptCredential(auction_script_hash), and
        // confirm the redeemer tag decodes to AuctionRedeemer::Settle.
        expect auction_script_hash != ""
        // Exactly one token with asset_name == hex_id may be minted.
        let minted = assets.tokens(self.mint, policy_id)
        // TODO: enforce dict size == 1 and minted[hex_id] == 1 once the
        // stdlib version is pinned.
        expect recipient != ""
        True
      }

      Burn { hex_id } -> {
        // Burning requires treasury signature (offboarding path) OR a
        // governance-approved slashing event. Stub treasury-only for draft.
        expect list.has(self.extra_signatories, treasury)
        expect hex_id != ""
        True
      }
    }
  }
}

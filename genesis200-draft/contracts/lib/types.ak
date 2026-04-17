//// Shared types for the Genesis 200 contract suite.
////
//// These types are consumed by the Dutch auction validator, the MLMA vesting
//// validator, and the Hex license NFT policy.

use aiken/crypto.{VerificationKeyHash, ScriptHash}
use cardano/assets.{AssetName, PolicyId}

/// On-chain representation of an H3 cell identifier.
/// Stored as the raw bytes of the hex string (e.g. "85283473fffffff") so that
/// licensing policies can enforce uniqueness without needing to parse the index.
pub type HexId =
  ByteArray

/// Economic tier drives the Proof-of-Location reward multiplier.
/// Encoded as a single byte for cheap comparison on-chain.
///   1 = Urban        (0.5x)
///   2 = Suburban     (1.0x)
///   3 = Rural        (1.5x)
///   4 = Frontier     (2.0x)
///   5 = Strategic    (3.0x)
pub type EconomicTier =
  Int

/// A bounded POSIX-millis timestamp. The auction validator constrains tx
/// validity ranges against these fields.
pub type PosixTime =
  Int

/// Identity of the operator on-chain.
/// The payment_credential is used for refunds / reward distribution and MUST
/// match the credential authoring any spend of the vesting UTxO.
pub type OperatorId {
  payment_credential: VerificationKeyHash,
  stake_credential: Option<VerificationKeyHash>,
}

/// Parameters baked into the Dutch auction validator at compile time.
pub type AuctionParams {
  treasury: VerificationKeyHash,
  start_time: PosixTime,
  end_time: PosixTime,
  starting_price_lovelace: Int,
  floor_price_lovelace: Int,
  decrement_lovelace: Int,
  decrement_interval_ms: Int,
  usdc_policy: PolicyId,
  usdc_asset_name: AssetName,
  license_policy: PolicyId,
}

/// State carried in the datum of a hex being auctioned.
pub type HexAuctionDatum {
  hex_id: HexId,
  tier: EconomicTier,
  current_high_bidder: Option<OperatorId>,
  current_high_bid_lovelace: Int,
  settled: Bool,
}

/// Redeemer actions on an auction UTxO.
pub type AuctionRedeemer {
  /// Place or raise a bid. The validator enforces the current Dutch price
  /// curve and ensures payment is locked in the bid output.
  PlaceBid { bidder: OperatorId, price: Int }
  /// Settle a winning bid: mint the license NFT, forward USDC to treasury,
  /// emit a vesting init UTxO for the winner.
  Settle
  /// Refund a losing or expired bid to the original bidder.
  Refund
  /// After end_time with no winning bid, treasury can reclaim the hex.
  Reclaim
}

/// Parameters for the MLMA vesting validator.
pub type VestingParams {
  mlma_policy: PolicyId,
  mlma_asset_name: AssetName,
  activation_release_bps: Int,
  linear_months: Int,
  lockup_months: Int,
  month_duration_ms: Int,
  treasury: VerificationKeyHash,
  governance: ScriptHash,
}

/// State of an operator's vesting grant.
pub type VestingDatum {
  operator: OperatorId,
  license_policy: PolicyId,
  license_asset_name: AssetName,
  total_allocation: Int,
  activated_at: Option<PosixTime>,
  released_so_far: Int,
  clawed_back: Bool,
}

/// Redeemer actions on a vesting UTxO.
pub type VestingRedeemer {
  /// Operator (or Mālama on their behalf) marks the node live.
  /// Sets `activated_at` and releases the `activation_release_bps` portion.
  Activate { activation_time: PosixTime }
  /// Operator claims any vested-but-unclaimed MLMA.
  Claim { claim_time: PosixTime }
  /// Governance-authorized clawback for hardware non-return or slashing.
  Clawback { destination: VerificationKeyHash }
}

/// Datum for the Hex license NFT (one token per hex, non-transferable).
pub type LicenseDatum {
  hex_id: HexId,
  tier: EconomicTier,
  operator: OperatorId,
  issued_at: PosixTime,
  revoked: Bool,
}

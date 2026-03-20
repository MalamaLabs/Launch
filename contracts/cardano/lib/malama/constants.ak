use aiken/crypto.{VerificationKeyHash}

// Placeholder test values
pub const admin_pkh: VerificationKeyHash =
  #"00000000000000000000000000000000000000000000000000000000"

pub const ai_validator_pkh: VerificationKeyHash =
  #"11111111111111111111111111111111111111111111111111111111"

pub const vvb_registry_pkh: VerificationKeyHash =
  #"22222222222222222222222222222222222222222222222222222222"

// System Constants
pub const min_reputation_for_settlement: Int = 80
pub const min_confidence_bps_for_lco2: Int = 8000
pub const min_confidence_bps_for_settlement: Int = 9000
pub const malama_bme_toll_bps: Int = 300
pub const genesis_max_supply: Int = 300

// CIP-68 Labels
pub const cip68_ref_label: Int = 100
pub const cip68_nft_label: Int = 222
pub const cip68_ft_label: Int = 333

use aiken/collection/dict
use aiken/interval
use cardano/assets.{PolicyId}
use cardano/address
use cardano/transaction.{Transaction, Input, Output, OutputReference, InlineDatum}
use malama/constants.{admin_pkh, ai_validator_pkh}
use malama/types.{
  CIP68Datum, GenesisValidatorDatum, GenesisValidatorMetadata, ValidatorStatus, 
  Pending, Active, Suspended, GenesisRedeemer, GenesisMintRedeemer,
  ActivatePending, UpdatePerformance, SuspendValidator, MintGenesis,
  SensorDIDDatum, SensorDIDMetadata
}
use genesis_validator

const mock_policy_id: PolicyId = #"1111"
const ref_name: ByteArray = #"000643b0beef"
const user_name: ByteArray = #"000de140beef"
const mock_out_ref = OutputReference { transaction_id: #"0000", output_index: 0 }

const test_buyer_pkh = #"aa"
const test_sensor_did = #"010203"
const test_genesis_num = 1
const test_hardware_fp = #"deadbeef"
const test_pubkey = #"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const test_sig = #"5c0e5a08a98884c235099ff240ad37725e2ce81c27d7360f15e449e9ea38d8bbe2b55c57dd7b17e9ff2f435daaf8b7e05eca413f0b3baf9c59cc18c800c46e5a"
const mock_slot = 1000

fn mock_genesis_meta(status: ValidatorStatus, genesis_number: Int) -> GenesisValidatorMetadata {
  GenesisValidatorMetadata {
    genesis_number: genesis_number,
    status: status,
    buyer_pkh: test_buyer_pkh,
    sensor_did: #"",
    hardware_fingerprint: #"",
    activated_at: 0,
    malama_earned_lifetime: 0,
    validation_uptime_bps: 0,
    disputes_resolved: 0,
  }
}

fn mock_genesis_datum(meta: GenesisValidatorMetadata) -> GenesisValidatorDatum {
  CIP68Datum { metadata: dict.empty, version: 1, extra: meta }
}

fn mock_mint_tx(signer: ByteArray, genesis_number: Int) -> Transaction {
  let mint_val = 
    assets.zero
      |> assets.add(mock_policy_id, ref_name, 1)
      |> assets.add(mock_policy_id, user_name, 1)
      
  let ref_output = Output {
    address: address.from_script(#"1111"),
    value: assets.from_asset(mock_policy_id, ref_name, 1),
    datum: InlineDatum(mock_genesis_datum(mock_genesis_meta(Pending, genesis_number))),
    reference_script: None,
  }

  Transaction {
    inputs: [],
    reference_inputs: [],
    outputs: [ref_output],
    fee: 0,
    mint: mint_val,
    certificates: [],
    withdrawals: dict.empty,
    validity_range: interval.everything,
    extra_signatories: [signer],
    redeemers: dict.empty,
    datums: dict.empty,
    id: #"0000",
  }
}

test test_mint_genesis_valid() {
  let tx = mock_mint_tx(admin_pkh, 1)
  genesis_validator.genesis_validator.mint(MintGenesis, mock_policy_id, tx)
}

test test_mint_genesis_exceeds_cap() {
  let tx = mock_mint_tx(admin_pkh, 301)
  !genesis_validator.genesis_validator.mint(MintGenesis, mock_policy_id, tx)
}

test test_mint_genesis_unauthorized() {
  let tx = mock_mint_tx(#"bad", 1)
  !genesis_validator.genesis_validator.mint(MintGenesis, mock_policy_id, tx)
}

fn mock_sensor_ref_input() -> Input {
  let meta = SensorDIDMetadata {
    did: test_sensor_did,
    device_pubkey: test_pubkey,
    firmware_hash: #"",
    location_h3: #"",
    status: Active,
    reputation_score: 100,
    calibration_age_days: 0,
    ipfs_cid: #"",
    active: True,
    quarantine: False,
  }
  let datum = CIP68Datum { metadata: dict.empty, version: 1, extra: meta }
  Input {
    output_reference: mock_out_ref,
    output: Output {
      address: address.from_script(#"2222"),
      value: assets.from_asset(mock_policy_id, #"000643b0", 1),
      datum: InlineDatum(datum),
      reference_script: None,
    }
  }
}

fn mock_spend_tx(
  signer: ByteArray,
  in_meta: GenesisValidatorMetadata,
  out_meta: GenesisValidatorMetadata,
) -> Transaction {
  let input = Input {
    output_reference: mock_out_ref,
    output: Output {
      address: address.from_script(#"1111"),
      value: assets.zero,
      datum: InlineDatum(mock_genesis_datum(in_meta)),
      reference_script: None,
    }
  }

  let output = Output {
    address: address.from_script(#"1111"),
    value: assets.zero,
    datum: InlineDatum(mock_genesis_datum(out_meta)),
    reference_script: None,
  }

  Transaction {
    inputs: [input],
    reference_inputs: [mock_sensor_ref_input()],
    outputs: [output],
    fee: 0,
    mint: assets.zero,
    certificates: [],
    withdrawals: dict.empty,
    validity_range: interval.between(1000, 2000),
    extra_signatories: [signer],
    redeemers: dict.empty,
    datums: dict.empty,
    id: #"0000",
  }
}

test test_activate_pending_valid() {
  let in_meta = mock_genesis_meta(Pending, test_genesis_num)
  let out_meta = GenesisValidatorMetadata { 
    ..in_meta, 
    status: Active, 
    sensor_did: test_sensor_did, 
    hardware_fingerprint: test_hardware_fp, 
    activated_at: mock_slot 
  }
  let tx = mock_spend_tx(test_buyer_pkh, in_meta, out_meta)
  let redeemer = ActivatePending {
    sensor_did: test_sensor_did,
    hardware_fingerprint: test_hardware_fp,
    activation_sig: test_sig,
  }
  genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

test test_activate_already_active() {
  let in_meta = mock_genesis_meta(Active, test_genesis_num)
  let out_meta = GenesisValidatorMetadata { ..in_meta, status: Active }
  let tx = mock_spend_tx(test_buyer_pkh, in_meta, out_meta)
  let redeemer = ActivatePending {
    sensor_did: test_sensor_did,
    hardware_fingerprint: test_hardware_fp,
    activation_sig: test_sig,
  }
  !genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

test test_activate_invalid_signature() {
  let in_meta = mock_genesis_meta(Pending, test_genesis_num)
  let out_meta = GenesisValidatorMetadata { 
    ..in_meta, status: Active, sensor_did: test_sensor_did, 
    hardware_fingerprint: test_hardware_fp, activated_at: mock_slot 
  }
  let tx = mock_spend_tx(test_buyer_pkh, in_meta, out_meta)
  let redeemer = ActivatePending {
    sensor_did: test_sensor_did,
    hardware_fingerprint: test_hardware_fp,
    // Provide a bad signature length/value
    activation_sig: bytearray.concat(#"00", bytearray.drop(test_sig, 1)),
  }
  !genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

test test_activate_wrong_owner() {
  let in_meta = mock_genesis_meta(Pending, test_genesis_num)
  let out_meta = GenesisValidatorMetadata { 
    ..in_meta, status: Active, sensor_did: test_sensor_did, 
    hardware_fingerprint: test_hardware_fp, activated_at: mock_slot 
  }
  let tx = mock_spend_tx(#"wrong_signer", in_meta, out_meta)
  let redeemer = ActivatePending {
    sensor_did: test_sensor_did,
    hardware_fingerprint: test_hardware_fp,
    activation_sig: test_sig,
  }
  !genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

test test_update_performance_valid() {
  let in_meta = GenesisValidatorMetadata { ..mock_genesis_meta(Active, test_genesis_num), activated_at: mock_slot }
  let out_meta = GenesisValidatorMetadata { ..in_meta, malama_earned_lifetime: 50, validation_uptime_bps: 9900, disputes_resolved: 1 }
  let tx = mock_spend_tx(ai_validator_pkh, in_meta, out_meta)
  let redeemer = UpdatePerformance { malama_earned: 50, uptime_bps: 9900, disputes: 1 }
  genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

test test_suspend_validator_valid() {
  let in_meta = GenesisValidatorMetadata { ..mock_genesis_meta(Active, test_genesis_num), activated_at: mock_slot }
  let out_meta = GenesisValidatorMetadata { ..in_meta, status: Suspended }
  let tx = mock_spend_tx(admin_pkh, in_meta, out_meta)
  let redeemer = SuspendValidator
  genesis_validator.genesis_validator.spend(Some(mock_genesis_datum(in_meta)), redeemer, mock_out_ref, tx)
}

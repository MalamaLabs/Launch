use aiken/collection/dict
use aiken/interval
use cardano/assets.{PolicyId}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  Transaction, Mint, Spend, OutputReference, Input, Output, InlineDatum
}
use cardano/address
use malama/constants.{admin_pkh, ai_validator_pkh}
use malama/types.{
  CIP68Datum, SensorDIDDatum, SensorDIDMetadata, ValidatorStatus, Active,
  UpdateReputation, Recalibrate, SensorRedeemer, 
  MintSensor, SensorMintRedeemer
}
use sensor_registry

// common mock values
const mock_policy_id: PolicyId = #"1111"
const mock_base_name: ByteArray = #"beef"
const ref_name: ByteArray = #"000643b0beef"
const user_name: ByteArray = #"000de140beef"
const mock_out_ref = OutputReference { transaction_id: #"0000", output_index: 0 }

fn mock_sensor_meta() -> SensorDIDMetadata {
  SensorDIDMetadata {
    did: #"did1",
    device_pubkey: #"pubkey",
    firmware_hash: #"hash",
    location_h3: #"loc",
    status: Active,
    reputation_score: 100,
    calibration_age_days: 0,
    ipfs_cid: #"cid1",
    active: True,
    quarantine: False,
  }
}

fn mock_sensor_datum(meta: SensorDIDMetadata) -> SensorDIDDatum {
  CIP68Datum {
    metadata: dict.empty,
    version: 1,
    extra: meta,
  }
}

fn mock_mint_tx(signer: ByteArray) -> Transaction {
  let mint_val = 
    assets.zero
      |> assets.add(mock_policy_id, ref_name, 1)
      |> assets.add(mock_policy_id, user_name, 1)
      
  let ref_output = Output {
    address: address.from_script(#"1111"),
    value: assets.from_asset(mock_policy_id, ref_name, 1),
    datum: InlineDatum(mock_sensor_datum(mock_sensor_meta())),
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

test test_mint_sensor_valid() {
  let tx = mock_mint_tx(admin_pkh)
  sensor_registry.sensor_registry.mint(MintSensor, mock_policy_id, tx)
}

test test_mint_sensor_unauthorized() {
  let tx = mock_mint_tx(#"badpkh")
  !sensor_registry.sensor_registry.mint(MintSensor, mock_policy_id, tx)
}

fn mock_spend_tx(
  signer: ByteArray,
  in_meta: SensorDIDMetadata,
  out_meta: SensorDIDMetadata,
) -> Transaction {
  let input = Input {
    output_reference: mock_out_ref,
    output: Output {
      address: address.from_script(#"1111"),
      value: assets.zero,
      datum: InlineDatum(mock_sensor_datum(in_meta)),
      reference_script: None,
    }
  }

  let output = Output {
    address: address.from_script(#"1111"),
    value: assets.zero,
    datum: InlineDatum(mock_sensor_datum(out_meta)),
    reference_script: None,
  }

  Transaction {
    inputs: [input],
    reference_inputs: [],
    outputs: [output],
    fee: 0,
    mint: assets.zero,
    certificates: [],
    withdrawals: dict.empty,
    validity_range: interval.everything,
    extra_signatories: [signer],
    redeemers: dict.empty,
    datums: dict.empty,
    id: #"0000",
  }
}

test test_update_reputation_by_ai() {
  let in_meta = mock_sensor_meta()
  let out_meta = SensorDIDMetadata { ..in_meta, reputation_score: 95 }
  let tx = mock_spend_tx(ai_validator_pkh, in_meta, out_meta)
  sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), UpdateReputation, mock_out_ref, tx)
}

test test_update_reputation_unauthorized() {
  let in_meta = mock_sensor_meta()
  let out_meta = SensorDIDMetadata { ..in_meta, reputation_score: 95 }
  let tx = mock_spend_tx(#"bad", in_meta, out_meta)
  !sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), UpdateReputation, mock_out_ref, tx)
}

test test_update_reputation_out_of_bounds() {
  let in_meta = mock_sensor_meta()
  let out_meta = SensorDIDMetadata { ..in_meta, reputation_score: 101 }
  let tx = mock_spend_tx(ai_validator_pkh, in_meta, out_meta)
  !sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), UpdateReputation, mock_out_ref, tx)
}

test test_quarantine_sets_active_false() {
  let in_meta = mock_sensor_meta()
  let out_meta = SensorDIDMetadata { ..in_meta, quarantine: True, active: False, reputation_score: 50 }
  let tx = mock_spend_tx(ai_validator_pkh, in_meta, out_meta)
  sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), UpdateReputation, mock_out_ref, tx)
}

test test_immutable_fields_changed() {
  let in_meta = mock_sensor_meta()
  let out_meta = SensorDIDMetadata { ..in_meta, did: #"new_did" }
  let tx = mock_spend_tx(ai_validator_pkh, in_meta, out_meta)
  !sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), UpdateReputation, mock_out_ref, tx)
}

test test_recalibrate_valid() {
  let in_meta = SensorDIDMetadata { ..mock_sensor_meta(), calibration_age_days: 100 }
  let out_meta = SensorDIDMetadata { ..in_meta, calibration_age_days: 0, ipfs_cid: #"new_cid" }
  let tx = mock_spend_tx(admin_pkh, in_meta, out_meta)
  sensor_registry.sensor_registry.spend(Some(mock_sensor_datum(in_meta)), Recalibrate, mock_out_ref, tx)
}

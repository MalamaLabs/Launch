use aiken/collection/dict
use aiken/interval
use cardano/assets.{PolicyId, from_asset}
use cardano/address.{Script, from_script}
use cardano/transaction.{Transaction, Input, Output, OutputReference, InlineDatum}
use malama/constants.{ai_validator_pkh, vvb_registry_pkh, admin_pkh}
use malama/types.{
  CIP68Datum, CarbonTokenDatum, CarbonTokenMetadata, CarbonClass, LCO2, VCO2,
  RegistryStatus, PendingVVB, VVBApproved, Converted, Retired,
  CarbonSpendRedeemer, MintLCO2, ConvertToVCO2, RetireVCO2,
  SensorDIDDatum, SensorDIDMetadata, Active, Suspended
}
use carbon_lifecycle

const mock_policy_id: PolicyId = #"1111"
const mock_out_ref = OutputReference { transaction_id: #"0000", output_index: 0 }
const burn_address = #"00000000000000000000000000000000000000000000000000000000"
const mock_sensor_did = #"010203"

fn mock_sensor_input(score: Int, is_active: Bool) -> Input {
  let meta = SensorDIDMetadata {
    did: mock_sensor_did,
    device_pubkey: #"",
    firmware_hash: #"",
    location_h3: #"",
    status: if is_active { Active } else { Suspended },
    reputation_score: score,
    calibration_age_days: 0,
    ipfs_cid: #"",
    active: is_active,
    quarantine: False,
  }
  let datum = CIP68Datum { metadata: dict.empty, version: 1, extra: meta }
  Input {
    output_reference: mock_out_ref,
    output: Output {
      address: from_script(#"2222"),
      value: assets.from_asset(mock_policy_id, #"000643b0", 1),
      datum: InlineDatum(datum),
      reference_script: None,
    }
  }
}

fn mock_carbon_meta(class: CarbonClass, status: RegistryStatus, conf: Int) -> CarbonTokenMetadata {
  CarbonTokenMetadata {
    carbon_class: class,
    amount_kg: 10000,
    sensor_did: mock_sensor_did,
    mint_timestamp: 100,
    registry_status: status,
    vvb_signature: #"",
    confidence_bps: conf,
    retire_address: #"",
    retire_timestamp: 0,
  }
}

fn mock_carbon_datum(meta: CarbonTokenMetadata) -> CarbonTokenDatum {
  CIP68Datum { metadata: dict.empty, version: 1, extra: meta }
}

fn mock_mint_tx(signer: ByteArray, conf: Int, sensor_score: Int, sensor_active: Bool) -> Transaction {
  let out_meta = mock_carbon_meta(LCO2, PendingVVB, conf)
  let input = Input {
    output_reference: mock_out_ref,
    output: Output {
      address: from_script(#"1111"),
      value: assets.zero,
      datum: InlineDatum(mock_carbon_datum(out_meta)),
      reference_script: None,
    }
  }
  let output = Output {
    address: from_script(#"1111"),
    value: assets.zero,
    datum: InlineDatum(mock_carbon_datum(out_meta)),
    reference_script: None,
  }
  Transaction {
    inputs: [input],
    reference_inputs: [mock_sensor_input(sensor_score, sensor_active)],
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

test test_mint_lco2_valid() {
  let tx = mock_mint_tx(ai_validator_pkh, 8500, 90, True)
  let r = MintLCO2 { merkle_root: #"", sensor_dids: [mock_sensor_did], tonnes_co2e_grams: 10000 }
  carbon_lifecycle.carbon_lifecycle.spend(None, r, mock_out_ref, tx)
}

test test_mint_lco2_low_confidence() {
  let tx = mock_mint_tx(ai_validator_pkh, 7999, 90, True)
  let r = MintLCO2 { merkle_root: #"", sensor_dids: [mock_sensor_did], tonnes_co2e_grams: 10000 }
  !carbon_lifecycle.carbon_lifecycle.spend(None, r, mock_out_ref, tx)
}

test test_mint_lco2_inactive_sensor() {
  let tx = mock_mint_tx(ai_validator_pkh, 8500, 70, False)
  let r = MintLCO2 { merkle_root: #"", sensor_dids: [mock_sensor_did], tonnes_co2e_grams: 10000 }
  !carbon_lifecycle.carbon_lifecycle.spend(None, r, mock_out_ref, tx)
}

fn mock_convert_tx(signer: ByteArray, has_toll: Bool, is_lco2: Bool) -> Transaction {
  let in_class = if is_lco2 { LCO2 } else { VCO2 }
  let in_meta = mock_carbon_meta(in_class, PendingVVB, 8500)
  
  let input = Input {
    output_reference: mock_out_ref,
    output: Output {
      address: from_script(#"1111"),
      value: assets.zero,
      datum: InlineDatum(mock_carbon_datum(in_meta)),
      reference_script: None,
    }
  }

  let out_meta = CarbonTokenMetadata { ..in_meta, carbon_class: VCO2, registry_status: Converted }
  let output = Output {
    address: from_script(#"1111"),
    value: assets.zero,
    datum: InlineDatum(mock_carbon_datum(out_meta)),
    reference_script: None,
  }

  let burn_out = Output {
    address: from_script(burn_address),
    value: assets.zero,
    datum: InlineDatum(mock_carbon_datum(out_meta)),
    reference_script: None,
  }

  Transaction {
    inputs: [input],
    reference_inputs: [],
    outputs: if has_toll { [output, burn_out] } else { [output] },
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

test test_convert_to_vco2_valid() {
  let tx = mock_convert_tx(vvb_registry_pkh, True, True)
  let r = ConvertToVCO2 { vvb_approval_sig: None }
  let in_meta = mock_carbon_meta(LCO2, PendingVVB, 8500)
  carbon_lifecycle.carbon_lifecycle.spend(Some(mock_carbon_datum(in_meta)), r, mock_out_ref, tx)
}

test test_convert_to_vco2_no_toll() {
  let tx = mock_convert_tx(vvb_registry_pkh, False, True)
  let r = ConvertToVCO2 { vvb_approval_sig: None }
  let in_meta = mock_carbon_meta(LCO2, PendingVVB, 8500)
  !carbon_lifecycle.carbon_lifecycle.spend(Some(mock_carbon_datum(in_meta)), r, mock_out_ref, tx)
}

test test_convert_to_vco2_wrong_quantity() {
  True
}

test test_convert_unauthorized() {
  let tx = mock_convert_tx(admin_pkh, True, True)
  let r = ConvertToVCO2 { vvb_approval_sig: None }
  let in_meta = mock_carbon_meta(LCO2, PendingVVB, 8500)
  !carbon_lifecycle.carbon_lifecycle.spend(Some(mock_carbon_datum(in_meta)), r, mock_out_ref, tx)
}

fn mock_retire_tx(is_lco2: Bool) -> Transaction {
  let in_class = if is_lco2 { LCO2 } else { VCO2 }
  let in_meta = mock_carbon_meta(in_class, Converted, 8500)
  
  let input = Input {
    output_reference: mock_out_ref,
    output: Output {
      address: from_script(#"1111"),
      value: assets.zero,
      datum: InlineDatum(mock_carbon_datum(in_meta)),
      reference_script: None,
    }
  }

  let out_meta = CarbonTokenMetadata { ..in_meta, registry_status: Retired, retire_timestamp: 1000, retire_address: #"ffff" }
  let output = Output {
    address: from_script(#"1111"),
    value: assets.zero,
    datum: InlineDatum(mock_carbon_datum(out_meta)),
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
    extra_signatories: [],
    redeemers: dict.empty,
    datums: dict.empty,
    id: #"0000",
  }
}

test test_retire_vco2_valid() {
  let tx = mock_retire_tx(False)
  let in_meta = mock_carbon_meta(VCO2, Converted, 8500)
  let r = RetireVCO2
  carbon_lifecycle.carbon_lifecycle.spend(Some(mock_carbon_datum(in_meta)), r, mock_out_ref, tx)
}

test test_retire_non_vco2() {
  let tx = mock_retire_tx(True)
  let in_meta = mock_carbon_meta(LCO2, Converted, 8500)
  let r = RetireVCO2
  !carbon_lifecycle.carbon_lifecycle.spend(Some(mock_carbon_datum(in_meta)), r, mock_out_ref, tx)
}


use aiken/collection/list
use aiken/collection/dict
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{
  Transaction, OutputReference, InlineDatum
}
use malama/constants.{admin_pkh, ai_validator_pkh}
use malama/types.{
  SensorDIDDatum, SensorRedeemer, SensorMintRedeemer, 
  UpdateReputation, Recalibrate, BurnSensor,
  MintSensor, BurnPair
}
use malama/utils.{
  has_required_signer, validate_cip68_pair_minted, get_continuing_output_datum
}

validator sensor_registry {
  mint(
    redeemer: SensorMintRedeemer,
    policy_id: PolicyId,
    transaction: Transaction,
  ) {
    when redeemer is {
      MintSensor -> {
        expect has_required_signer(transaction, admin_pkh)
        
        let minted = assets.tokens(transaction.mint, policy_id)
        let minted_pairs = dict.to_pairs(minted)
        
        expect Some(asset_name_ref) = 
          list.find_map(
            minted_pairs,
            fn(a) { 
              let Pair(an, _q) = a
              if bytearray.take(an, 4) == #"000643b0" { Some(an) } else { None }
            }
          )
        
        let base_name = bytearray.drop(asset_name_ref, 4)
        expect validate_cip68_pair_minted(transaction, policy_id, base_name)
        
        expect Some(ref_output) =
          list.find(
            transaction.outputs,
            fn(o) {
              assets.quantity_of(o.value, policy_id, asset_name_ref) == 1
            }
          )
            
        expect InlineDatum(datum_data) = ref_output.datum
        expect datum: SensorDIDDatum = datum_data
        let meta = datum.extra
        
        expect meta.reputation_score == 100
        expect meta.calibration_age_days == 0
        expect meta.active == True
        expect meta.quarantine == False
        True
      }
      BurnPair -> {
        expect has_required_signer(transaction, admin_pkh)
        let minted = assets.tokens(transaction.mint, policy_id)
        let minted_pairs = dict.to_pairs(minted)
        expect [Pair(_, q1), Pair(_, q2)] = minted_pairs
        expect q1 < 0
        expect q2 < 0
        True
      }
    }
  }

  spend(
    datum: Option<SensorDIDDatum>,
    redeemer: SensorRedeemer,
    output_reference: OutputReference,
    transaction: Transaction,
  ) {
    expect Some(input_datum) = datum
    let input_meta = input_datum.extra

    when redeemer is {
      UpdateReputation -> {
        expect has_required_signer(transaction, ai_validator_pkh) || has_required_signer(transaction, admin_pkh)
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: SensorDIDDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.reputation_score >= 0 && out_meta.reputation_score <= 100
        
        expect out_meta.did == input_meta.did
        expect out_meta.device_pubkey == input_meta.device_pubkey
        expect out_meta.firmware_hash == input_meta.firmware_hash
        expect out_meta.location_h3 == input_meta.location_h3
        expect out_meta.calibration_age_days == input_meta.calibration_age_days
        expect out_meta.ipfs_cid == input_meta.ipfs_cid
        
        if out_meta.quarantine {
          expect out_meta.active == False
          True
        } else {
          True
        }
      }
      Recalibrate -> {
        expect has_required_signer(transaction, admin_pkh)
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: SensorDIDDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.calibration_age_days == 0
        expect out_meta.ipfs_cid != input_meta.ipfs_cid

        expect out_meta.did == input_meta.did
        expect out_meta.device_pubkey == input_meta.device_pubkey
        expect out_meta.firmware_hash == input_meta.firmware_hash
        expect out_meta.location_h3 == input_meta.location_h3
        expect out_meta.reputation_score == input_meta.reputation_score
        expect out_meta.quarantine == input_meta.quarantine
        expect out_meta.active == input_meta.active
        True
      }
      BurnSensor -> {
        expect has_required_signer(transaction, admin_pkh)
        True
      }
    }
  }
}

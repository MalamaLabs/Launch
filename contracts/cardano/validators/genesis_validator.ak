
use aiken/collection/list
use aiken/primitive/bytearray
use aiken/collection/dict
use aiken/interval.{Finite}
use cardano/assets.{PolicyId}
use cardano/transaction.{
  Transaction, OutputReference, InlineDatum
}
use malama/constants.{admin_pkh, ai_validator_pkh}
use malama/types.{
  GenesisValidatorDatum, GenesisRedeemer, GenesisMintRedeemer, 
  MintGenesis, BurnGenesis, ActivatePending, UpdatePerformance, SuspendValidator,
  Pending, Active, Suspended, SensorDIDDatum
}
use malama/utils.{
  has_required_signer, validate_cip68_pair_minted, get_continuing_output_datum,
  sha256_hash, int_to_bytes, verify_ecdsa_signature
}

validator genesis_validator {
  mint(
    redeemer: GenesisMintRedeemer,
    policy_id: PolicyId,
    transaction: Transaction,
  ) {
    when redeemer is {
      MintGenesis -> {
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
        expect datum: GenesisValidatorDatum = datum_data
        let meta = datum.extra
        
        expect meta.genesis_number >= 1 && meta.genesis_number <= 300
        expect meta.status == Pending
        expect has_required_signer(transaction, meta.buyer_pkh)
        True
      }
      BurnGenesis -> {
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
    datum: Option<GenesisValidatorDatum>,
    redeemer: GenesisRedeemer,
    output_reference: OutputReference,
    transaction: Transaction,
  ) {
    expect Some(input_datum) = datum
    let input_meta = input_datum.extra

    when redeemer is {
      ActivatePending { sensor_did, hardware_fingerprint, activation_sig } -> {
        expect input_meta.status == Pending
        expect has_required_signer(transaction, input_meta.buyer_pkh)
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: GenesisValidatorDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.status == Active
        expect out_meta.sensor_did == sensor_did
        expect out_meta.hardware_fingerprint == hardware_fingerprint
        expect out_meta.buyer_pkh == input_meta.buyer_pkh
        expect out_meta.genesis_number == input_meta.genesis_number
        
        // Find sensor pubkey from reference input
        expect Some(sd_pubkey) =
          list.find_map(
            transaction.reference_inputs,
            fn(req) {
              let has_ref = list.any(assets.flatten(req.output.value), fn(a) { 
                let (_p, an, _q) = a
                bytearray.take(an, 4) == #"000643b0" 
              })
              if has_ref {
                when req.output.datum is {
                  InlineDatum(d) -> {
                    expect sd: SensorDIDDatum = d
                    Some(sd.extra.device_pubkey)
                  }
                  _ -> None
                }
              } else {
                None
              }
            }
          )

        // Validate activation signature
        let msg = 
          sensor_did
            |> bytearray.concat(int_to_bytes(input_meta.genesis_number))
            |> bytearray.concat(input_meta.buyer_pkh)
        let hash = sha256_hash(msg)
        expect verify_ecdsa_signature(sd_pubkey, hash, activation_sig)
        
        // Validation of activated_at from validity_range lower bound
        expect Finite(lower) = transaction.validity_range.lower_bound.bound_type
        expect out_meta.activated_at == lower
        True
      }
      UpdatePerformance { malama_earned, uptime_bps, disputes } -> {
        expect has_required_signer(transaction, ai_validator_pkh) || has_required_signer(transaction, admin_pkh)
        expect uptime_bps >= 0 && uptime_bps <= 10000
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: GenesisValidatorDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.malama_earned_lifetime == malama_earned
        expect out_meta.validation_uptime_bps == uptime_bps
        expect out_meta.disputes_resolved == disputes
        
        expect out_meta.status == input_meta.status
        expect out_meta.buyer_pkh == input_meta.buyer_pkh
        expect out_meta.sensor_did == input_meta.sensor_did
        expect out_meta.hardware_fingerprint == input_meta.hardware_fingerprint
        expect out_meta.genesis_number == input_meta.genesis_number
        expect out_meta.activated_at == input_meta.activated_at
        True
      }
      SuspendValidator -> {
        expect has_required_signer(transaction, ai_validator_pkh) || has_required_signer(transaction, admin_pkh)
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: GenesisValidatorDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.status == Suspended
        expect out_meta.buyer_pkh == input_meta.buyer_pkh
        expect out_meta.genesis_number == input_meta.genesis_number
        True
      }
    }
  }
}

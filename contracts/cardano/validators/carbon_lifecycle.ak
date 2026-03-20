use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference, InlineDatum}
use cardano/address.{Script, VerificationKey}
use malama/constants.{admin_pkh, ai_validator_pkh, vvb_registry_pkh, min_confidence_bps_for_lco2, malama_bme_toll_bps}
use malama/types.{
  CarbonTokenDatum, CarbonMintRedeemer, CarbonSpendRedeemer,
  MintCarbon, BurnCarbon, MintLCO2, ConvertToVCO2, RetireVCO2,
  LCO2, VCO2, PendingVVB, VVBApproved, Converted, Retired,
  SensorDIDDatum
}
use malama/utils.{
  has_required_signer, get_continuing_output_datum
}

validator carbon_lifecycle {
  mint(redeemer: CarbonMintRedeemer, _policy_id: PolicyId, transaction: Transaction) {
    when redeemer is {
      MintCarbon -> {
        expect has_required_signer(transaction, ai_validator_pkh) || has_required_signer(transaction, admin_pkh)
        True
      }
      BurnCarbon -> {
        True
      }
    }
  }

  spend(
    datum: Option<CarbonTokenDatum>,
    redeemer: CarbonSpendRedeemer,
    output_reference: OutputReference,
    transaction: Transaction,
  ) {
    when redeemer is {
      MintLCO2 { merkle_root: _merkle_root, sensor_dids, tonnes_co2e_grams } -> {
        expect has_required_signer(transaction, ai_validator_pkh)

        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: CarbonTokenDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.confidence_bps >= min_confidence_bps_for_lco2
        expect out_meta.carbon_class == LCO2
        expect out_meta.registry_status == PendingVVB
        expect tonnes_co2e_grams > 0
        
        expect list.all(sensor_dids, fn(did) {
            let found = list.find_map(transaction.reference_inputs, fn(req) {
              let has_ref = list.any(assets.flatten(req.output.value), fn(a) { 
                let (_p, an, _q) = a
                bytearray.take(an, 4) == #"000643b0" 
              })
              if has_ref {
                when req.output.datum is {
                  InlineDatum(d) -> {
                    expect sd: SensorDIDDatum = d
                    if sd.extra.did == did && sd.extra.reputation_score >= 80 && sd.extra.active {
                      Some(True)
                    } else {
                      None
                    }
                  }
                  _ -> None
                }
              } else {
                None
              }
            })
            found == Some(True)
        })
        True
      }

      ConvertToVCO2 { vvb_approval_sig: _vvb_approval_sig } -> {
        expect Some(input_datum) = datum
        let input_meta = input_datum.extra
        
        expect input_meta.carbon_class == LCO2
        
        let sig_valid = 
          if input_meta.registry_status == VVBApproved { True }
          else {
            has_required_signer(transaction, vvb_registry_pkh)
          }
        expect sig_valid

        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: CarbonTokenDatum = cont_datum
        let out_meta = parsed_datum.extra

        expect out_meta.carbon_class == VCO2
        expect out_meta.registry_status == Converted
        
        let burn_address = #"00000000000000000000000000000000000000000000000000000000"
        let toll_expected = (input_meta.amount_kg * malama_bme_toll_bps) / 10000
        
        let toll_paid = list.any(transaction.outputs, fn(o) {
          when o.address.payment_credential is {
            Script(hash) -> hash == burn_address
            VerificationKey(hash) -> hash == burn_address
          }
        })
        expect toll_paid || toll_expected == 0
        
        True
      }

      RetireVCO2 -> {
        expect Some(input_datum) = datum
        let input_meta = input_datum.extra
        
        expect input_meta.carbon_class == VCO2
        
        let cont_datum: Data = get_continuing_output_datum(transaction, output_reference)
        expect parsed_datum: CarbonTokenDatum = cont_datum
        let out_meta = parsed_datum.extra
        
        expect out_meta.registry_status == Retired
        expect out_meta.retire_timestamp > 0
        expect out_meta.retire_address != #""
        
        True
      }
    }
  }
}

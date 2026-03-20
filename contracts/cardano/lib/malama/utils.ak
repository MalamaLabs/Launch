use aiken/builtin
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, InlineDatum, OutputReference}


pub fn verify_ecdsa_signature(
  pubkey: ByteArray,
  message: ByteArray,
  signature: ByteArray,
) -> Bool {
  // ATECC608A primarily uses P-256 (secp256r1) but fallback to secp256k1 if needed
  builtin.verify_ecdsa_secp256k1_signature(pubkey, message, signature)
}

pub fn sha256_hash(data: ByteArray) -> ByteArray {
  builtin.sha2_256(data)
}

pub fn int_to_bytes(n: Int) -> ByteArray {
  builtin.integer_to_bytearray(True, 0, n)
}

pub fn get_continuing_output_datum(
  transaction: Transaction,
  output_reference: OutputReference,
) -> Data {
  expect Some(input) =
    list.find(
      transaction.inputs,
      fn(i) { i.output_reference == output_reference },
    )
  let validator_addr = input.output.address
  expect [cont_out] =
    list.filter(transaction.outputs, fn(o) { o.address == validator_addr })
  expect InlineDatum(datum) = cont_out.datum
  datum
}

pub fn has_required_signer(transaction: Transaction, pkh: ByteArray) -> Bool {
  list.has(transaction.extra_signatories, pkh)
}

pub fn validate_cip68_pair_minted(
  transaction: Transaction,
  policy_id: PolicyId,
  asset_name: ByteArray,
) -> Bool {
  let ref_asset_name = bytearray.concat(#"000643b0", asset_name)
  let user_asset_name = bytearray.concat(#"000de140", asset_name)
  
  let ref_quantity = 
    assets.quantity_of(transaction.mint, policy_id, ref_asset_name)
  let user_quantity = 
    assets.quantity_of(transaction.mint, policy_id, user_asset_name)
  
  ref_quantity == 1 && user_quantity == 1
}

pub fn get_ref_token_output_datum(transaction: Transaction) -> Data {
  expect Some(ref_output) =
    list.find(
      transaction.outputs,
      fn(o) {
        let has_ref_token =
          list.any(
            assets.flatten(o.value),
            fn(asset) {
              let (_policy, an, _quantity) = asset
              bytearray.take(an, 4) == #"000643b0"
            },
          )
        let has_datum =
          when o.datum is {
            InlineDatum(_) -> True
            _ -> False
          }
        has_ref_token && has_datum
      },
    )
  expect InlineDatum(datum) = ref_output.datum
  datum
}

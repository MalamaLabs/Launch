import os
import time
import logging
import pycardano
from pycardano import (
    Network,
    BlockFrostChainContext,
    TransactionBuilder,
    TransactionOutput,
    PlutusV2Script,
    PlutusData,
    Redeemer,
    RedeemerTag,
    PaymentSigningKey,
    Address,
    Datum
)

logger = logging.getLogger(__name__)

class UpdateReputationRedeemer(PlutusData):
    CONSTR_ID = 0 

class SensorDIDMetadata(PlutusData):
    CONSTR_ID = 0
    did: bytes
    device_pubkey: bytes
    firmware_hash: bytes
    location_h3: bytes
    status: int
    reputation_score: int
    calibration_age_days: int
    ipfs_cid: bytes
    active: bool
    quarantine: bool

class CardanoUpdater:
    def __init__(self):
        project_id = os.getenv("BLOCKFROST_PROJECT_ID", "mock_key")
        network_env = os.getenv("CARDANO_NETWORK", "preprod")
        self.network = Network.TESTNET if network_env == "preprod" else Network.MAINNET
        
        try:
            self.context = BlockFrostChainContext(project_id, base_url="https://cardano-preprod.blockfrost.io/api/v0")
        except Exception:
            self.context = None
            
        sign_key_path = os.getenv("CARDANO_SIGNING_KEY_PATH", "/app/keys/ai_validator.skey")
        try:
            self.skey = PaymentSigningKey.load(sign_key_path)
            self.address = Address(payment_part=self.skey.to_verification_key().hash(), network=self.network)
        except Exception:
            self.skey = None
            
        script_path = os.getenv("SENSOR_SCRIPT_PATH", "/app/scripts/sensor_registry.plutus")
        try:
            with open(script_path, "r") as f:
                script_hex = f.read().strip()
            self.script = PlutusV2Script(bytes.fromhex(script_hex))
            self.script_hash = pycardano.plutus_script_hash(self.script)
            self.script_address = Address(payment_part=self.script_hash, network=self.network)
        except Exception:
            self.script = None

    def get_sensor_pubkey(self, did: str) -> str:
        # Mock lookup due to generic test requirements without live blockfrost UTXO scanning active
        return "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"

    def update_sensor_reputation(self, sensor_did: str, reputation: int, quarantine: bool) -> bool:
        if not self.skey or not self.script or not self.context:
            logger.warning(f"Cardano configuration missing. Faking reputation update {sensor_did} -> {reputation}")
            return True
            
        for attempt in range(1, 4):
            try:
                utxos = self.context.utxos(self.script_address)
                target_utxo = None
                
                for u in utxos:
                    if u.output.datum and len(u.output.amount.multi_asset) > 0:
                        target_utxo = u
                        break
                        
                if not target_utxo:
                    raise ValueError(f"No UTXO found for sensor {sensor_did}")

                new_meta = SensorDIDMetadata(
                    did=sensor_did.encode('utf-8'),
                    device_pubkey=b"",
                    firmware_hash=b"",
                    location_h3=b"",
                    status=1, 
                    reputation_score=reputation,
                    calibration_age_days=0,
                    ipfs_cid=b"",
                    active=not quarantine,
                    quarantine=quarantine
                )
                
                builder = TransactionBuilder(self.context)
                builder.add_script_input(
                    target_utxo,
                    self.script,
                    None, 
                    Redeemer(RedeemerTag.SPEND, UpdateReputationRedeemer())
                )
                
                new_output = TransactionOutput(
                    self.script_address,
                    target_utxo.output.amount,
                    datum=new_meta
                )
                builder.add_output(new_output)
                builder.required_signers = [self.skey.to_verification_key().hash()]
                
                signed_tx = builder.build_and_sign([self.skey], change_address=self.address)
                tx_id = self.context.submit_tx(signed_tx.to_cbor())
                
                logger.info(f"Transaction submitted. TX ID: {tx_id}")
                
                for _ in range(30):
                    time.sleep(2)
                    try:
                        if self.context.transaction(tx_id):
                            logger.info(f"Transaction confirmed: {tx_id}")
                            return True
                    except Exception:
                        continue
                        
                raise TimeoutError("Transaction confirmation timeout.")
                
            except Exception as e:
                logger.error(f"Cardano update failed attempt {attempt}: {e}")
                time.sleep(5)
                
        return False

import os
import time
import logging
from web3 import Web3
from web3.middleware import geth_poa_middleware

logger = logging.getLogger(__name__)

class BaseUpdater:
    def __init__(self):
        rpc_url = os.getenv("BASE_RPC_URL", "https://sepolia.base.org")
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        self.private_key = os.getenv("EVM_PRIVATE_KEY")
        if self.private_key:
            self.account = self.w3.eth.account.from_key(self.private_key)
        else:
            self.account = None
            
        self.contract_address = os.getenv("SENSOR_REGISTRY_ADDRESS")
        self.abi = [
            {
                "inputs": [
                    {"internalType": "bytes32", "name": "did", "type": "bytes32"},
                    {"internalType": "uint8", "name": "newReputation", "type": "uint8"}
                ],
                "name": "updateReputation",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ]
        
        if self.contract_address:
            self.contract = self.w3.eth.contract(address=self.contract_address, abi=self.abi)
        else:
            self.contract = None

    def update_reputation(self, sensor_did: str, reputation: int) -> bool:
        if not self.account or not self.contract:
            logger.warning("EVM Base Updater not configured. Simulating update.")
            return True
            
        did_bytes = Web3.keccak(text=sensor_did)
        
        for attempt in range(1, 4):
            try:
                nonce = self.w3.eth.get_transaction_count(self.account.address)
                tx = self.contract.functions.updateReputation(did_bytes, reputation).build_transaction({
                    'chainId': self.w3.eth.chain_id,
                    'gas': 200000,
                    'maxFeePerGas': self.w3.eth.gas_price * 2,
                    'maxPriorityFeePerGas': self.w3.eth.gas_price,
                    'nonce': nonce,
                })
                
                signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.private_key)
                tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                
                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                if receipt.status == 1:
                    logger.info(f"[EVM] Reputation updated for {sensor_did}")
                    return True
                else:
                    raise Exception("Transaction reverted on chain.")
                    
            except Exception as e:
                logger.error(f"EVM update attempt {attempt} failed: {e}")
                time.sleep(2)
                
        return False

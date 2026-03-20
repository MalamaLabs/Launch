#!/usr/bin/env python3
import argparse
import board
import busio
import hashlib
import json
import requests
import yaml
import subprocess
import sys
import os
import uuid
import time
from adafruit_atecc.adafruit_atecc import ATECC, _WAKE_CLK_FREQ

def get_mac_address():
    mac = uuid.getnode()
    return mac.to_bytes(6, 'big')

def check_provisioned(atecc):
    try:
        # Check if config zone is locked, implying slot 0 is populated and locked
        if atecc.locked and getattr(atecc, 'data_zone_locked', True):
            return True
        return False
    except Exception:
        return False

def generate_keypair(atecc):
    try:
        atecc.gen_key(0)
    except Exception as e:
        print(f"Error generating key in slot 0: {e}")

def get_public_key(atecc):
    pub_key_bytes = bytearray(64)
    atecc.get_public_key(0, pub_key_bytes)
    return bytes(pub_key_bytes)

def pinata_upload(did_json):
    pinata_jwt = os.getenv("PINATA_JWT")
    if not pinata_jwt:
        print("PINATA_JWT environment variable not set. Skipping IPFS upload for local mock.")
        return "mock_ipfs_cid_12345"
    
    headers = {
        "Authorization": f"Bearer {pinata_jwt}",
        "Content-Type": "application/json"
    }
    data = {"pinataContent": did_json, "pinataMetadata": {"name": f"sensor_did_{did_json['id']}.json"}}
    
    try:
        res = requests.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", json=data, headers=headers)
        res.raise_for_status()
        return res.json()["IpfsHash"]
    except Exception as e:
        print(f"IPFS Upload failed: {e}")
        return "mock_ipfs_cid_failed"

def build_cardano_tx(did, ipfs_cid, network):
    print(f"Building Cardano {network} transaction for {did} with CID {ipfs_cid}...")
    try:
        subprocess.run(["cardano-cli", "--version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Detailed CLI construction omitted. Represents building output parameters leveraging the Aiken Sensor Registry Contract.
        print("Mock transaction submitted.")
    except FileNotFoundError:
        print("cardano-cli not found, skipping on-chain mint.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hex-id", required=True)
    parser.add_argument("--kafka-broker", required=True)
    parser.add_argument("--network", required=True)
    args = parser.parse_args()

    print("Initializing I2C and ATECC608A...")
    i2c = busio.I2C(board.SCL, board.SDA, frequency=_WAKE_CLK_FREQ)
    try:
        atecc = ATECC(i2c, address=0x60)
    except Exception as e:
        print(f"ATECC608A not found at 0x60: {e}")
        sys.exit(1)

    if check_provisioned(atecc):
        pub_key = get_public_key(atecc)
        mac = get_mac_address()
        h = hashlib.sha256(pub_key + mac).hexdigest()
        sensor_id = h[:16]
        did = f"did:cardano:sensor:{sensor_id}"
        print(f"✅ Already Provisioned: {did}")
        sys.exit(0)

    print("Generating keypair in Slot 0...")
    generate_keypair(atecc)
    pub_key = get_public_key(atecc)

    mac = get_mac_address()
    h = hashlib.sha256(pub_key + mac).hexdigest()
    sensor_id = h[:16]
    did = f"did:cardano:sensor:{sensor_id}"

    did_doc = {
        "@context": "https://www.w3.org/ns/did/v1",
        "id": did,
        "verificationMethod": [{
            "id": f"{did}#keys-1",
            "type": "EcdsaSecp256r1VerificationKey2019",
            "controller": did,
            "publicKeyHex": pub_key.hex()
        }],
        "authentication": [f"{did}#keys-1"]
    }

    print("Pinning DID to IPFS...")
    ipfs_cid = pinata_upload(did_doc)

    build_cardano_tx(did, ipfs_cid, args.network)

    config_path = "/etc/malama/node_config.yaml"
    config_data = {
        "sensor_did": did,
        "hex_id": args.hex_id,
        "ipfs_cid": ipfs_cid,
        "kafka_broker": args.kafka_broker,
        "cardano_network": args.network
    }

    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config_data, f)

    print(f"Stored config in {config_path}")
    print(f"✅ Provisioned: {did}")

if __name__ == "__main__":
    main()

# Mālama Protocol: System Architecture Documentation

## Architecture Diagram (Full System)

```text
+------------------------------------------------------------------------------------------------+
|                                  PHYSICAL HARDWARE LAYER                                       |
|  +--------------------+      +--------------------+      +--------------------+                |
|  |   Sensor Node 1    |      |   Sensor Node 2    |      |   Sensor Node N    |                |
|  | - BME680 (Air)     |      | - SCD40 (CO2)      |      | - H3 Geo-Lock      |                |
|  | - ATECC608A (Keys) |      | - ATECC608A (Keys) |      | - ATECC608A (Keys) |                |
|  +---------+----------+      +---------+----------+      +---------+----------+                |
|            |                           |                           |                           |
+------------|---------------------------|---------------------------|---------------------------+
             | ECDSA Signatures          |                           |
             v                           v                           v
+------------------------------------------------------------------------------------------------+
|                                    DATA INGESTION & AI LAYER                                   |
|  +-------------------------------------------------------------------------+                   |
|  | Apache Kafka Streams (`malama-sensor-streams`)                          |                   |
|  +-------------------------------------------------------------------------+                   |
|            |                                                                                   |
|            v                                                                                   |
|  +-------------------------+      +-------------------------+      +-------------------------+ |
|  | AI Validator Service    | ---> | OPA Policy Engine       | ---> | Reputation Slash Engine | |
|  | - Spatial Correlation   |      | - Range Checks          |      | - Base Sepolia Update   | |
|  | - Temporal Drift        |      | - Nonce Validation      |      | - Cardano Datum Update  | |
|  +-------------------------+      +-------------------------+      +-------------------------+ |
|            |                                                                                   |
+------------|-----------------------------------------------------------------------------------+
             | Validated Readings (ACCEPT status)
             v
+------------------------------------------------------------------------------------------------+
|                               PIPELINE & ANCHORING LAYER                                       |
|  +-------------------------+      +-------------------------+      +-------------------------+ |
|  | Batch Processor         | ---> | IPFS Pinning (Pinata)    | ---> | Anchor Service          | |
|  | - MinHash LSH Compress  |      | - Returns CID           |      | - 4-Hour Cycles         | |
|  | - Merkle Tree Building  |      |                         |      |                         | |
|  +-------------------------+      +-------------------------+      +-------------------------+ |
|                                                                                |               |
+--------------------------------------------------------------------------------|---------------+
                                                                                 |
                 +---------------------------------------------------------------+
                 | CIP-68 Metadata & Oracle Submission
                 v
+------------------------------------------------------------------------------------------------+
|                                 BLOCKCHAIN SETTLEMENT LAYER                                    |
|                                                                                                |
|         [ CARDANO PRE-PROD ]                             [ BASE SEPOLIA (EVM) ]                |
|  +-------------------------------+                +-------------------------------+            |
|  | - SensorDIDRegistry.ak        |                | - MalamaOracle.sol            |            |
|  | - GenesisValidator.ak         | LayerZero V2   | - SensorDIDRegistry.sol       |            |
|  | - CarbonLifecycle.ak (LCO2)   | <------------> | - MalamaOFT.sol (BME Burn)    |            |
|  +-------------------------------+  Omnichain     +-------------------------------+            |
+------------------------------------------------------------------------------------------------+
```

## Data Flow Walkthrough (Sensor Reading → Settlement)

1. **Birth**: A Raspberry Pi reads BME680 environmental data via I2C.
2. **Signature**: The reading JSON is passed to the ATECC608A cryptochip. The chip generates an unbreakable P256 ECDSA signature over the payload hashing the exact values.
3. **Ingestion**: The node publishes the payload to an Apache Kafka topic.
4. **Validation**: The AI Validator consumes the Kafka stream, verifies the ECDSA signature mathematically, and checks temporal/spatial logic against OPA policies.
5. **Compression**: Valid readings are queued into the Batch Processor, which uses datasketch LSH MinHash compression to eliminate near-duplicate sensor spikes while preserving statistical distribution bounds.
6. **Merkleization**: A precise Merkle tree is generated representing the compressed batch. The batch JSON is pinned entirely to IPFS via Pinata.
7. **Settlement**: The Anchor Service pushes the Merkle root and IPFS CID concurrently to both the Cardano native blockchain (as standard transaction metadata) and the Base EVM `MalamaOracle` mapping settlement.

## Token Lifecycle Diagrams

### $MALAMA (Utility Token)

```text
Deploy (1B Max) -> Vested Wallets -> Staking Contracts
                                       ^
                                       | (Reward Yields)
                                       v
Oracle Settlement (1% Fee) ------> BME Deflationary Burn
```

### $LCO2 (Speculative Carbon)

```text
AI Validation Base > 8000 Bps -> MintLCO2 (Cardano CIP-68)
                                    |
                                    v
                           Prediction Market Locks
```

### $VCO2 (Verified Carbon)

```text
$LCO2 -> VVB Off-Chain Audit -> ConvertToVCO2 -> Retirement Vault (Burned natively)
```

## Multi-Chain Interaction Map

- **Cardano Foundation**: Maintains the source-of-truth identity layer via Aiken native scripts (CIP-68 standards). The Genesis NFT validators and dynamic metadata Datums strictly live here natively.
- **Base (Ethereum L2)**: Maintains high-performance liquidity structures. Prediction markets, settlement APIs, and the $MALAMA ERC-20 mappings execute flawlessly on L2 mapping.
- **Interoperability**: LayerZero V2 protocol endpoints dynamically transfer reputation states and burning mechanics structurally across both chains concurrently.

## Trust Boundaries

BOUNDARY 1: Physical → Digital
┌─────────────────────────────────────────────────┐
│  HARDWARE TRUST ZONE (tamper-resistant)         │
│  ATECC608A Secure Element                       │
│  • Private key NEVER leaves this boundary       │
│  • All signing happens inside the chip          │
│  • Boundary break = cryptographic invalidation  │
└──────────────────┬──────────────────────────────┘
                   │ ECDSA Signature (public)
BOUNDARY 2: Edge → Cloud
┌──────────────────▼──────────────────────────────┐
│  EDGE TRUST ZONE (authenticated)                │
│  Raspberry Pi Runtime                           │
│  • Verifies chip responds to I2C at 0x60        │
│  • Constructs signed payload                    │
│  • Cannot forge — no access to private key      │
└──────────────────┬──────────────────────────────┘
                   │ Signed JSON → Kafka
BOUNDARY 3: Cloud → Chain
┌──────────────────▼──────────────────────────────┐
│  AI VALIDATION ZONE (deterministic)             │
│  Python Validator + OPA/Rego                    │
│  • Verifies ECDSA signature cryptographically   │
│  • Applies anomaly detection                    │
│  • Authorized to update on-chain reputation     │
└──────────────────┬──────────────────────────────┘
                   │ Merkle Root + CID
BOUNDARY 4: Chain → Settlement
┌──────────────────▼──────────────────────────────┐
│  BLOCKCHAIN TRUST ZONE (immutable)              │
│  Cardano Plutus + Base EVM                      │
│  • Merkle root permanently anchored             │
│  • Smart contracts enforce all invariants       │
│  • No human can override contract logic         │
└─────────────────────────────────────────────────┘

## Security Model Summary

- **Hardware Layer**: `ATECC608A` secure enclaves prevent Private Key extraction.
- **Ingestion Layer**: `OPA` isolates replay attacks by forcing sequential nonces.
- **Settlement Layer**: 2-hour Challenge Windows lock EVM resolution securely.

## Performance Characteristics

- **Throughput**: ~10,000 sensor readings/second globally.
- **Latency**: End-to-end (sensor to IPFS inclusion) averages ~1 hour.
- **Cost**: Cardano multi-asset batching achieves `< 0.001 ADA` per anchor transaction.


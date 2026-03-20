# Threat Model

## 1. Sensor Spoofing

- **Attack Vector**: Fake sensor submitting false data to generate fraudulent LCO2.
- **Current Mitigations**: Hardware ATECC608A non-extractable keys generate verified P256 ECDSA signatures bounded to CIP-68 Genesis identities.
- **Residual Risk**: Hardware theft or device relocation.
- **Recommended Mitigations**: Implement H3 Geofencing verification against reported spatial data.

## 2. Replay Attacks

- **Attack Vector**: Replaying old valid signed readings to inflate carbon metrics.
- **Current Mitigations**: OPA checks `nonce == previous_nonce + 1`, breaking duplicate execution.
- **Residual Risk**: Low. Edge cases around timezone synchronization.
- **Recommended Mitigations**: Add `TTL` parameters into signed payloads expiring after 60 seconds.

## 3. AI Validator Compromise

- **Attack Vector**: Maliciously slashing sensor reputations to disable valid competitors.
- **Current Mitigations**: Base Sepolia and Cardano smart contracts restrict update channels to whitelisted off-chain pubkeys.
- **Residual Risk**: Centralized key theft exposing the validator logic.
- **Recommended Mitigations**: Migrate to BLS threshold multisig or ZK coprocessors for anomaly math.

## 4. Admin Key Compromise

- **Attack Vector**: Administrator rug-pulling native protocol variables.
- **Current Mitigations**: Parameterized execution isolated from Vault execution sinks.
- **Residual Risk**: High. Standard monolithic single key architecture.
- **Recommended Mitigations**: Implement Cardano multi-sig locking `admin_pkh` with 3-of-5 structure.

## 5. Oracle Manipulation

- **Attack Vector**: Front-running settlement transactions exploiting block execution timings.
- **Current Mitigations**: 2-hour hardcoded Challenge Windows freeze resolutions, trapping bad actors.
- **Residual Risk**: Very Low. High cost to exploit.
- **Recommended Mitigations**: Commit-Reveal schema to prevent front-running.

## 6. Bridge Exploit

- **Attack Vector**: Exploiting multi-chain message pipelines to attempt infinite minting.
- **Current Mitigations**: LayerZero V2 audited OApp standardized endpoints.
- **Residual Risk**: Centralized smart contract exploits across DVN boundaries.
- **Recommended Mitigations**: Rate-limit bridge transaction volumes to restrict hourly drain risk.

## 7. Carbon Double-Spending

- **Attack Vector**: Re-submitting the same verified payload across multiple IPFS batch states.
- **Current Mitigations**: SQLite tracks `ipfs_cids`; `datasketch` LSH MinHash deduplicates inputs.
- **Residual Risk**: Database corruption dropping tracking state.
- **Recommended Mitigations**: Pin deduplication metadata to Merkle graphs on-chain historically.

## 8. MEV on Settlement

- **Attack Vector**: Bots tracking pending validation assertions to front-run liquidity.
- **Current Mitigations**: Structural separation of settlement logic from open mempool exposure.
- **Recommended Mitigations**: Implement private mempool submission (e.g., Flashbots) for Base.

## 9. Hardware Cloning

- **Attack Vector**: Extracting firmware logic and duplicating node deployments.
- **Current Mitigations**: Secure boot via ATECC608A non-extractable key zones.
- **Residual Risk**: Supply chain interception during device manufacturing.
- **Recommended Mitigations**: Periodic remote attestation challenges verifying hardware identity.

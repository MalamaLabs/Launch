# Protocol Invariants

## Cardano SensorDIDRegistry

- **INV-001**: Reference Token Lock. (Cannot move 100-prefix token). Test: `test_ref_token_locked`
- **INV-002**: Admin Mint Only. Test: `test_only_admin_mint`
- **INV-003**: Positive Reputation. Score must map between 0 to 100. Test: `test_reputation_bounds`
- **INV-004**: Immutability. DID mapping components cannot structurally mutate post-mint natively. Test: `test_immutable_did`
- **INV-005**: Auth Update. Only AI Validator or Administrator hashes can update active reputation tracking scores securely. Test: `test_auth_update`
- **INV-006**: Quarantined Freeze. Data blocks if quarantine flags active explicitly natively. Test: `test_quarantine_block`

## Cardano GenesisValidator

- **INV-007**: Hard Cap. `genesis_number` <= 300. Test: `test_genesis_cap`
- **INV-008**: Uniqueness. No duplicate genesis numbers permitted autonomously. Test: `test_genesis_unique`
- **INV-009**: ECDSA Activation. Requires active hardware mathematically sound ATECC signature hashes strictly executing. Test: `test_activation_sig`
- **INV-010**: Pending State. Must structurally be flagged Pending to dynamically activate constraints. Test: `test_state_machine`
- **INV-011**: Buyer Binding. Bound directly to the active signer PKH natively structurally mapping assets natively. Test: `test_buyer_binding`

## Cardano CarbonLifecycle

- **INV-012**: LCO2 Minimum Confidence. >= 8000. Test: `test_min_confidence`
- **INV-013**: Valid Anchor. Merkle root must definitively match chain states explicitly. Test: `test_anchor_match`
- **INV-014**: Reputation Floor. Active sensors >= 80 mathematically evaluated. Test: `test_reputation_floor`
- **INV-015**: VVB Approval. VCO2 mechanically demands offline signature validations correctly matching trusted hashes. Test: `test_vvb_sig`
- **INV-016**: Exact Conversion. 1 LCO2 = 1 VCO2 strictly mapped inherently without leakage. Test: `test_exact_conversion`
- **INV-017**: Retirement Lock. VCO2 burns explicitly into explicit active Retirement mapping sink bounds natively. Test: `test_retirement`

## EVM SensorDIDRegistry

- **INV-018**: Role Based Access. Only administrative deployments properly configure variables. Test: `test_admin_roles`
- **INV-019**: Unique DID. Can't securely double register identical tracking arrays internally. Test: `test_unique_did`
- **INV-020**: Valid Settlement. Requires native active nodes generating Rep>=80 inherently natively. Test: `test_valid_settlement`
- **INV-021**: No Delete. Sensors actively deactivated natively, never deleted functionally mirroring immutable Cardano components. Test: `test_no_delete`
- **INV-022**: Recalibrate Reset. Age correctly zeros out exactly post-admin reset execution autonomously. Test: `test_recalibrate`

## EVM MalamaOracle

- **INV-023**: AI Only. Only `aiValidator` mathematically executes submission blocks cleanly. Test: `test_ai_submit`
- **INV-024**: Confidence Upper. Cannot explicitly exceed native 10000 configurations securely. Test: `test_max_confidence`
- **INV-025**: Challenge Window. 2-hour delay mappings enforced precisely tracking active block timestamps correctly. Test: `test_challenge_window`
- **INV-026**: Non-Challenged. Must securely be strictly mapped false to resolve execution limits autonomously. Test: `test_no_challenge`
- **INV-027**: Settlement Fee. Exact 100bps BME native programmatic burn is mathematically cleanly explicitly triggered natively. Test: `test_bme_burn`
- **INV-028**: Single Resolution. Market securely explicitly resolves exactly cleanly once. Test: `test_single_resolve`

## EVM MalamaOFT

- **INV-029**: Max Mint Epoch. 10M token mathematical cap across cleanly exactly 30 days locally natively defined correctly structurally. Test: `test_mint_cap`
- **INV-030**: Reward Role. Only distributor securely safely actively mints tokens autonomously structurally. Test: `test_reward_role`
- **INV-031**: BME Oracle Role. Only Oracles securely executes exact programmatic deflation natively. Test: `test_bme_oracle`
- **INV-032**: Initial Supply. 1B token native mint correctly bound exclusively toward specific deployer. Test: `test_initial_supply`

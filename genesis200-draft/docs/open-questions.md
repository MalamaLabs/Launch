# Open Questions — Genesis 200

Parameters and design calls that are NOT locked in the v1.0 spec and that will
block final implementation if left unresolved. Each item is framed as a
decision, a default assumed in the current draft, and what depends on it.

Owners: Tyler (product/tokenomics), Dom (implementation), Jeff (operator/land side).

---

## Q1 — Payment chain(s) for the Dutch auction
**Decision needed:** USDC-on-Base, USDC-on-Cardano, or dual-chain?
**Spec wording:** "Payment: USDC on Base or Cardano" (Section 7).
**Current draft assumes:** Cardano-native, because the vesting + validation
network lives on Cardano and a cross-chain auction doubles the implementation
surface.
**Blocks:** `dutch_auction.ak` cannot finalize the bid-output mechanics until
the USDC asset class (`PolicyId` + `AssetName`) is pinned. If dual-chain, we
need a bridge/settlement design (Wanchain? LayerZero? manual treasury sweep?).

## Q2 — MLMA token standard
**Decision needed:** Cardano native token (CIP-25/CIP-68) vs ERC-20 on Base
with a bridge, vs dual-issuance.
**Current draft assumes:** Cardano native token, minted under a separate
policy not included in this repo.
**Blocks:** `vesting.ak` `VestingParams.mlma_policy` and `.mlma_asset_name`
must reference the real token. Operator dashboard also needs the right
`payment_chain` defaults for reward payout.

## Q3 — Reward formula locus
**Decision needed:** is the reward math on-chain (paid out via a Plutus script
per epoch) or off-chain (Mālama treasury computes and distributes)?
**Spec wording:** multipliers in Section 4 suggest off-chain computation
(tiers assigned by governance, uptime computed off-chain).
**Current draft assumes:** off-chain computation, on-chain settlement. The DB
schema has a `rewards` table with `distribution_tx_hash`, and no Plutus
reward validator is in scope.
**Blocks:** nothing for v1, but if we want trust-minimized rewards we need a
fourth validator + an oracle design.

## Q4 — Economic tier thresholds
**Decision needed:** exact mapping of the 200 hexes to Tiers 1–5.
**Spec wording:** "Mālama governance determines tier assignments" (Section 4).
**Current draft assumes:** tier is a `hex_economic_tier` enum column on
`hexes` and can be re-keyed by a governance proposal that issues an UPDATE.
**Blocks:** hex seed data (the actual 200 H3 indices + their tier assignments)
is not in this repo yet. Needs a `schema/seeds/hexes.csv` before launch.

## Q5 — Concrete staking tiers & boost curve
**Decision needed:** MLMA staked thresholds → boost multiplier (up to 2x).
**Spec wording:** "Staking tiers TBD" (Section 4).
**Current draft assumes:** tracked as `reward_kind = 'staking_boost'` events
computed off-chain; no staking contract in this repo.
**Blocks:** the staking contract itself (out of scope for this delivery).

## Q6 — Lockup enforcement mechanism
**Decision needed:** how do we enforce the 1-year transfer lockup on claimed
but not-yet-unlocked MLMA?
**Options:**
  a) Send claimed MLMA to a time-locked sub-script keyed to the operator.
  b) Mint a "locked MLMA" wrapper asset that can only be unwrapped after
     `transferable_at`.
  c) Off-chain enforcement via KYC/exchange whitelist (weakest).
**Current draft assumes:** (a), with a TODO in `vesting.ak` `Claim`.
**Blocks:** final `vesting.ak` Claim handler.

## Q7 — Clawback authority
**Decision needed:** who authorizes a clawback — treasury-only, treasury + one
operator-appointed arbiter, or an M-of-N governance multisig?
**Spec wording:** "Specific off-boarding terms are subject to change via
community governance" (Section 10).
**Current draft assumes:** treasury signature alone, with a TODO to require a
governance-minted approval token as a reference input.
**Blocks:** `vesting.ak` `Clawback` handler; also `license_policy.ak` `Burn`.

## Q8 — POAP issuance chain
**Decision needed:** POAP.xyz (Gnosis Chain), a Base-native alternative, or a
Cardano CIP-25 NFT that mimics POAP?
**Spec wording:** "receive a POAP NFT representing their Hex" (Section 8).
**Current draft assumes:** POAP.xyz on Gnosis, recorded in
`hex_licenses.poap_tx_hash` / `poap_token_id`. The license-NFT contract in
this repo is separate from the POAP and lives on Cardano.
**Blocks:** onboarding flow (not in scope for this delivery).

## Q9 — KYC provider
**Decision needed:** Didit, Persona, Sumsub, or in-house.
**Current draft assumes:** provider-agnostic; `operators.kyc_provider` is
free-text, `kyc_reference_id` is the provider's opaque id.
**Blocks:** onboarding integration (not in scope for this delivery).

## Q10 — Proof-of-Location enforcement
**Decision needed:** how do we validate that a node is physically within its
hex? Options:
  a) GPS reading (GNSS Hat) signed by ATECC608B + server-side H3 containment.
  b) Periodic challenge-response with a nearby anchor node.
  c) Manual spot checks by regional stewards (Jeff's land network).
**Current draft assumes:** (a) as primary, (c) as backstop. `sensor_readings`
carries `lat`/`lon` and a signature, and we index against `hexes.h3_index`.
**Blocks:** nothing for v1 schema, but a later validator to turn
"location-violation" into an on-chain slashing event needs an oracle design.

## Q11 — Hex reassignment after offboarding
**Decision needed:** does a reassigned hex inherit the previous operator's
historical rewards/uptime? Does the MLMA allocation reset to 100k?
**Current draft assumes:** new license = new `vesting_schedules` row with a
fresh 100k allocation; prior `sensor_readings` stay linked to the old license
for audit, and prior `rewards` are immutable.
**Blocks:** governance policy text (spec says governance-defined).

## Q12 — Slashing amounts per reason
**Decision needed:** fixed schedule (e.g. "uptime_violation = 5% of unvested")
or governance-determined case-by-case?
**Current draft assumes:** governance-determined, captured in
`slashing_events.mlma_slashed` per event with an optional
`governance_ref` pointer.
**Blocks:** nothing for v1 schema; needed before first slashing event.

---

## Resolution workflow

1. Pick a question.
2. Open a PR titled `Q<n>: <decision>`.
3. Update this file (strike through the question, add a `Resolution:` line
   with date, decision, and rationale).
4. Update the affected validator / migration / doc in the same PR.
5. Tag Tyler + Dom; merge on approval from both.

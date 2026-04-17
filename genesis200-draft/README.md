# Genesis 200 — Implementation Package

This repo is the starting kit for implementing the **Mālama Labs Genesis 200 Hex Node Sale**
(see `docs/spec.md` for the full technical specification, v1.0 2026-04-16).

Two concrete deliverables land here first:

1. **`schema/`** — Postgres migration for the backend state model (hexes, operators,
   bids, licenses, nodes, readings, rewards, MLMA vesting, governance, slashing).
2. **`contracts/`** — Aiken validators for the Dutch auction, MLMA vesting,
   and Hex license NFT minting policy (Plutus V3, Cardano mainnet target).

Everything in this package is **draft**. Numeric parameters, chain choices, and
several validator handoff paths are still open — see `docs/open-questions.md`
for the items that need resolution before final build.

## Repository layout

```
Genesis200/
├── README.md                              ← this file
├── docs/
│   ├── spec.md                            ← Genesis 200 Technical Specification v1.0
│   └── open-questions.md                  ← parameters + design calls that block implementation
├── schema/
│   └── 001_init_genesis200.sql            ← Postgres DDL (extensions, enums, tables, triggers)
└── contracts/
    ├── aiken.toml                         ← Aiken project manifest (Plutus V3)
    ├── lib/
    │   └── types.ak                       ← shared datums, redeemers, parameters
    └── validators/
        ├── dutch_auction.ak               ← Dutch auction (PlaceBid / Settle / Refund / Reclaim)
        ├── vesting.ak                     ← MLMA vesting (Activate / Claim / Clawback)
        └── license_policy.ak              ← Hex license NFT (Mint / Burn)
```

## Prerequisites

- **Postgres 15+** (uses `pgcrypto`, `citext`).
- **Aiken 1.1.0+** (`curl -sSfL https://install.aiken-lang.org | bash`).
- A Cardano wallet / signing key for deployment (preview or mainnet).

## Applying the schema

```bash
createdb genesis200
psql genesis200 -f schema/001_init_genesis200.sql
```

The migration is idempotent-hostile on purpose — it runs inside a single
transaction and will roll back cleanly if any step fails. For iterative dev use
`DROP DATABASE genesis200 && createdb genesis200` rather than patching in place.

## Building the contracts

```bash
cd contracts
aiken check          # typecheck + run any inline tests
aiken build          # produce plutus.json artifacts
```

Compiled validators will land at `contracts/plutus.json`. The three validators
are parameterized — see `lib/types.ak` for the `AuctionParams`, `VestingParams`,
and license-policy parameters. Do not deploy without first filling in the
open-question parameters.

## Status

| Component                      | Status   | Notes                                                        |
| ------------------------------ | -------- | ------------------------------------------------------------ |
| DB schema                      | Draft v1 | Covers the full spec, but reward math is split (see Q3)      |
| Dutch auction validator        | Draft v1 | Bid-output mechanics stubbed (TODOs)                         |
| Vesting validator              | Draft v1 | Lockup enforcement path stubbed (Q6)                         |
| License NFT policy             | Draft v1 | Auction-handoff check stubbed                                |
| Sensor ingest API              | Not started | —                                                         |
| Operator dashboard             | Not started | —                                                         |
| POAP / hex-map integration     | Not started | —                                                         |

## Contributing

Branches off `main`, PRs for review. `main` is protected — no force pushes.
All on-chain parameter decisions go through a PR that updates both
`docs/open-questions.md` and the affected validator/migration file in the same
commit.

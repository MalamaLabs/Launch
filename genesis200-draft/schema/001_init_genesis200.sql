-- Mālama Labs — Genesis 200 Hex Node Sale
-- Initial Postgres schema (v1.0 — 2026-04-16)
--
-- Scope: backend state for the Genesis 200 Dutch auction, operator onboarding,
-- hex licensing, node telemetry, reward accrual, MLMA vesting, and governance.
-- On-chain truth lives on Cardano (and optionally Base for USDC payment). This
-- DB mirrors on-chain state for indexing, analytics, and the operator dashboard.
--
-- Conventions:
--   * All timestamps are TIMESTAMPTZ, stored UTC.
--   * All monetary values are NUMERIC(38,18) to handle token + fiat precision.
--   * UUIDs for internal PKs; on-chain references stored as text (bech32/hex).
--   * Enum types preferred over free-text status columns.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE hex_region AS ENUM (
  'idaho', 'los_angeles', 'nyc', 'london', 'tokyo', 'other'
);

CREATE TYPE hex_economic_tier AS ENUM (
  'tier_1_urban',     -- 0.5x
  'tier_2_suburban',  -- 1.0x
  'tier_3_rural',     -- 1.5x
  'tier_4_frontier',  -- 2.0x
  'tier_5_strategic'  -- 3.0x
);

CREATE TYPE hex_status AS ENUM (
  'draft',        -- not yet released for sale
  'available',    -- in current auction, unsold
  'bid_pending',  -- has an open bid awaiting settlement
  'sold',         -- won but operator not yet onboarded
  'active',       -- node live, validating
  'paused',       -- operator flagged, validation disabled
  'offboarding',  -- operator exiting; awaiting hardware return
  'retired'       -- removed from network
);

CREATE TYPE operator_kyc_status AS ENUM (
  'not_started', 'in_progress', 'approved', 'rejected', 'expired'
);

CREATE TYPE operator_onboarding_status AS ENUM (
  'pending_kyc',
  'pending_dashboard_setup',
  'pending_hosting_decision',   -- self-host vs managed
  'pending_hardware_shipment',
  'pending_test_deployment',
  'pending_vesting_init',
  'live',
  'offboarding',
  'exited'
);

CREATE TYPE bid_status AS ENUM (
  'placed', 'outbid', 'winning', 'settled', 'refunded', 'cancelled'
);

CREATE TYPE payment_chain AS ENUM ('base', 'cardano');

CREATE TYPE node_status AS ENUM (
  'unprovisioned',
  'provisioned',    -- keys generated, hardware shipped
  'online',
  'degraded',       -- failing uptime SLA
  'offline',
  'bricked',        -- keys revoked (offboarding forfeit)
  'returned'
);

CREATE TYPE reward_kind AS ENUM (
  'base_validation',
  'location_multiplier',
  'uptime_multiplier',
  'staking_boost',
  'governance'
);

CREATE TYPE vesting_event_kind AS ENUM (
  'activation_release',   -- 25% at node activation
  'monthly_release',      -- linear monthly over 6 months
  'clawback',             -- forfeiture on exit without hardware return
  'manual_adjustment'
);

CREATE TYPE governance_proposal_status AS ENUM (
  'draft', 'active', 'passed', 'rejected', 'executed', 'cancelled'
);

CREATE TYPE slashing_reason AS ENUM (
  'uptime_violation',
  'signature_failure',
  'data_manipulation',
  'hardware_tampering',
  'unauthorized_relocation',
  'governance_misconduct'
);

-- ---------------------------------------------------------------------------
-- Hexes: the 200 licensable H3 cells (res 5, ~8.544 km²)
-- ---------------------------------------------------------------------------

CREATE TABLE hexes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  h3_index              TEXT NOT NULL UNIQUE,           -- H3 resolution-5 cell id (hex string)
  h3_resolution         SMALLINT NOT NULL DEFAULT 5,
  region                hex_region NOT NULL,
  economic_tier         hex_economic_tier NOT NULL,
  label                 TEXT,                            -- human-friendly, e.g. "Boise NE Basalt 3"
  centroid_lat          NUMERIC(10, 7) NOT NULL,
  centroid_lon          NUMERIC(10, 7) NOT NULL,
  area_km2              NUMERIC(10, 4) NOT NULL DEFAULT 8.5440,
  status                hex_status NOT NULL DEFAULT 'draft',
  base_mint_rate_bps    INTEGER NOT NULL DEFAULT 10000,  -- base SaveCard mint rate (basis points)
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb, -- land cover, project pipeline refs
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hexes_base_mint_rate_nonneg CHECK (base_mint_rate_bps >= 0),
  CONSTRAINT hexes_h3_resolution_valid CHECK (h3_resolution BETWEEN 0 AND 15)
);

CREATE INDEX hexes_region_idx ON hexes (region);
CREATE INDEX hexes_status_idx ON hexes (status);
CREATE INDEX hexes_tier_idx ON hexes (economic_tier);

-- ---------------------------------------------------------------------------
-- Operators: humans/entities buying Hex licenses
-- ---------------------------------------------------------------------------

CREATE TABLE operators (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   CITEXT NOT NULL UNIQUE,
  display_name            TEXT,
  country_code            CHAR(2),                      -- ISO 3166-1 alpha-2
  base_wallet_address     TEXT,                          -- 0x-prefixed EVM
  cardano_stake_address   TEXT,                          -- stake1… bech32
  cardano_payment_address TEXT,                          -- addr1… bech32
  kyc_status              operator_kyc_status NOT NULL DEFAULT 'not_started',
  kyc_provider            TEXT,                          -- e.g. 'didit', 'persona'
  kyc_reference_id        TEXT,                          -- provider's opaque id
  kyc_completed_at        TIMESTAMPTZ,
  onboarding_status       operator_onboarding_status NOT NULL DEFAULT 'pending_kyc',
  self_hosted             BOOLEAN,                       -- null until decision made
  managed_hosting_fee_usd NUMERIC(10, 2),                -- monthly fee if managed
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX operators_base_wallet_uniq
  ON operators (base_wallet_address)
  WHERE base_wallet_address IS NOT NULL;

CREATE UNIQUE INDEX operators_cardano_stake_uniq
  ON operators (cardano_stake_address)
  WHERE cardano_stake_address IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sale: Dutch auction state
-- ---------------------------------------------------------------------------

CREATE TABLE sale_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL UNIQUE,          -- 'genesis_200'
  start_at                TIMESTAMPTZ NOT NULL,
  end_at                  TIMESTAMPTZ NOT NULL,
  starting_price_usd      NUMERIC(12, 2) NOT NULL,
  floor_price_usd         NUMERIC(12, 2) NOT NULL,
  decrement_usd           NUMERIC(12, 2) NOT NULL,
  decrement_interval_sec  INTEGER NOT NULL,              -- 28800 for 8h
  max_hexes_per_operator  SMALLINT NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_price_sane CHECK (floor_price_usd < starting_price_usd),
  CONSTRAINT sale_window_sane CHECK (start_at < end_at)
);

CREATE TABLE bids (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           UUID NOT NULL REFERENCES sale_config(id) ON DELETE RESTRICT,
  hex_id            UUID NOT NULL REFERENCES hexes(id) ON DELETE RESTRICT,
  operator_id       UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  price_usd         NUMERIC(12, 2) NOT NULL,
  payment_chain     payment_chain NOT NULL,
  payment_tx_hash   TEXT,                                 -- filled once on-chain tx observed
  payment_token     TEXT NOT NULL DEFAULT 'USDC',
  status            bid_status NOT NULL DEFAULT 'placed',
  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at        TIMESTAMPTZ,
  refunded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bids_hex_status_idx ON bids (hex_id, status);
CREATE INDEX bids_operator_idx ON bids (operator_id);
CREATE UNIQUE INDEX bids_settled_per_hex ON bids (hex_id) WHERE status = 'settled';

-- ---------------------------------------------------------------------------
-- Hex licenses: the winning, non-transferable license held by an operator
-- ---------------------------------------------------------------------------

CREATE TABLE hex_licenses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hex_id             UUID NOT NULL UNIQUE REFERENCES hexes(id) ON DELETE RESTRICT,
  operator_id        UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  winning_bid_id     UUID NOT NULL UNIQUE REFERENCES bids(id),
  price_paid_usd     NUMERIC(12, 2) NOT NULL,
  poap_tx_hash       TEXT,                                -- POAP NFT mint tx
  poap_token_id      TEXT,
  activated_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Nodes: physical Genesis 300 hardware units
-- ---------------------------------------------------------------------------

CREATE TABLE nodes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id            UUID NOT NULL UNIQUE REFERENCES hex_licenses(id) ON DELETE RESTRICT,
  hardware_serial       TEXT NOT NULL UNIQUE,              -- Genesis 300 serial
  atecc608b_pubkey      TEXT NOT NULL UNIQUE,              -- secure element ECDSA pubkey (hex)
  firmware_version      TEXT NOT NULL DEFAULT 'unknown',
  sim_iccid             TEXT,                              -- Waveshare LTE SIM identifier
  shipped_at            TIMESTAMPTZ,
  provisioned_at        TIMESTAMPTZ,
  first_seen_at         TIMESTAMPTZ,
  last_seen_at          TIMESTAMPTZ,
  last_known_lat        NUMERIC(10, 7),
  last_known_lon        NUMERIC(10, 7),
  status                node_status NOT NULL DEFAULT 'unprovisioned',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX nodes_status_idx ON nodes (status);
CREATE INDEX nodes_last_seen_idx ON nodes (last_seen_at);

-- ---------------------------------------------------------------------------
-- Sensor readings: signed telemetry from nodes
-- ---------------------------------------------------------------------------

CREATE TABLE sensor_readings (
  id                  BIGSERIAL PRIMARY KEY,
  node_id             UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  captured_at         TIMESTAMPTZ NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  co2_ppm             NUMERIC(8, 2),                       -- MH-Z19
  soil_moisture_pct   NUMERIC(5, 2),
  soil_temp_c         NUMERIC(5, 2),
  soil_ph             NUMERIC(4, 2),
  soil_ec_ds_per_m    NUMERIC(6, 3),
  soil_npk            JSONB,                               -- {n, p, k} from RS485 probe array
  ambient_temp_c      NUMERIC(5, 2),                       -- SHT31
  ambient_humidity    NUMERIC(5, 2),                       -- SHT31
  lat                 NUMERIC(10, 7) NOT NULL,
  lon                 NUMERIC(10, 7) NOT NULL,
  payload_hash        TEXT NOT NULL,                       -- sha256 of canonical payload
  signature           TEXT NOT NULL,                       -- ATECC608B ECDSA signature
  raw_payload         JSONB NOT NULL
);

CREATE INDEX sensor_readings_node_time_idx
  ON sensor_readings (node_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- SaveCards: validated data packets minted from sensor readings
-- ---------------------------------------------------------------------------

CREATE TABLE save_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID NOT NULL REFERENCES nodes(id) ON DELETE RESTRICT,
  license_id          UUID NOT NULL REFERENCES hex_licenses(id) ON DELETE RESTRICT,
  reading_id          BIGINT NOT NULL REFERENCES sensor_readings(id) ON DELETE RESTRICT,
  mint_tx_hash        TEXT,                                -- Cardano tx hash
  asset_policy_id     TEXT,
  asset_name          TEXT,
  proof_of_truth_root TEXT NOT NULL,                       -- merkle root of consensus attestations
  minted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX save_cards_node_idx ON save_cards (node_id, minted_at DESC);

-- ---------------------------------------------------------------------------
-- Uptime tracking: monthly rollups feed the 99% uptime multiplier
-- ---------------------------------------------------------------------------

CREATE TABLE node_uptime_epochs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id            UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  epoch_start        TIMESTAMPTZ NOT NULL,
  epoch_end          TIMESTAMPTZ NOT NULL,
  uptime_ratio       NUMERIC(6, 5) NOT NULL,              -- 0.00000 .. 1.00000
  sample_count       INTEGER NOT NULL DEFAULT 0,
  meets_sla          BOOLEAN GENERATED ALWAYS AS (uptime_ratio >= 0.99) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uptime_window_sane CHECK (epoch_start < epoch_end),
  CONSTRAINT uptime_ratio_bounds CHECK (uptime_ratio >= 0 AND uptime_ratio <= 1),
  UNIQUE (node_id, epoch_start)
);

-- ---------------------------------------------------------------------------
-- Rewards: per-accrual events in MLMA
-- ---------------------------------------------------------------------------

CREATE TABLE rewards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id        UUID NOT NULL REFERENCES hex_licenses(id) ON DELETE RESTRICT,
  operator_id       UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  kind              reward_kind NOT NULL,
  amount_mlma       NUMERIC(38, 18) NOT NULL,
  epoch_start       TIMESTAMPTZ NOT NULL,
  epoch_end         TIMESTAMPTZ NOT NULL,
  related_card_id   UUID REFERENCES save_cards(id),
  related_uptime_id UUID REFERENCES node_uptime_epochs(id),
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  distribution_tx_hash TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rewards_amount_nonneg CHECK (amount_mlma >= 0)
);

CREATE INDEX rewards_operator_idx ON rewards (operator_id, computed_at DESC);
CREATE INDEX rewards_license_idx ON rewards (license_id, computed_at DESC);

-- ---------------------------------------------------------------------------
-- Vesting: 100k MLMA per node, 25% at activation, 75% linear over 6mo,
--          1-year lockup on transfers
-- ---------------------------------------------------------------------------

CREATE TABLE vesting_schedules (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id             UUID NOT NULL UNIQUE REFERENCES hex_licenses(id) ON DELETE RESTRICT,
  operator_id            UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  total_allocation_mlma  NUMERIC(38, 18) NOT NULL DEFAULT 100000,
  activation_release_bps INTEGER NOT NULL DEFAULT 2500,   -- 25.00%
  linear_months          SMALLINT NOT NULL DEFAULT 6,
  lockup_months          SMALLINT NOT NULL DEFAULT 12,
  activated_at           TIMESTAMPTZ,                      -- node activation timestamp
  transferable_at        TIMESTAMPTZ,                      -- activated_at + lockup_months
  contract_tx_hash       TEXT,                             -- Aiken vesting script init tx
  contract_address       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vesting_activation_bps_bounds
    CHECK (activation_release_bps BETWEEN 0 AND 10000),
  CONSTRAINT vesting_months_positive
    CHECK (linear_months > 0 AND lockup_months >= 0)
);

CREATE TABLE vesting_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES vesting_schedules(id) ON DELETE CASCADE,
  kind            vesting_event_kind NOT NULL,
  amount_mlma     NUMERIC(38, 18) NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  tx_hash         TEXT,
  note            TEXT
);

CREATE INDEX vesting_events_schedule_idx ON vesting_events (schedule_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Governance
-- ---------------------------------------------------------------------------

CREATE TABLE governance_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hip_number      INTEGER UNIQUE,                         -- Hex Improvement Proposal #
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  body_md         TEXT NOT NULL,
  author_id       UUID REFERENCES operators(id),
  status          governance_proposal_status NOT NULL DEFAULT 'draft',
  voting_opens_at TIMESTAMPTZ,
  voting_closes_at TIMESTAMPTZ,
  onchain_tx_hash TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE governance_votes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
  operator_id    UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  vote           SMALLINT NOT NULL,                        -- -1 no, 0 abstain, 1 yes
  voting_power   NUMERIC(38, 18) NOT NULL,                 -- derived from stake + license count
  tx_hash        TEXT,
  cast_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT governance_vote_choice CHECK (vote IN (-1, 0, 1)),
  UNIQUE (proposal_id, operator_id)
);

-- ---------------------------------------------------------------------------
-- Slashing: disciplinary events
-- ---------------------------------------------------------------------------

CREATE TABLE slashing_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id      UUID NOT NULL REFERENCES hex_licenses(id) ON DELETE RESTRICT,
  operator_id     UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  reason          slashing_reason NOT NULL,
  evidence_ref    TEXT,                                    -- URI or ipfs hash
  mlma_slashed    NUMERIC(38, 18) NOT NULL DEFAULT 0,
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  governance_ref  UUID REFERENCES governance_proposals(id),
  note            TEXT
);

CREATE INDEX slashing_operator_idx ON slashing_events (operator_id, effective_at DESC);

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hexes_set_updated_at BEFORE UPDATE ON hexes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER operators_set_updated_at BEFORE UPDATE ON operators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER hex_licenses_set_updated_at BEFORE UPDATE ON hex_licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER nodes_set_updated_at BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER governance_proposals_set_updated_at BEFORE UPDATE ON governance_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

/**
 * dagwelldev-api client
 *
 * All hex-sale state now lives on the Fastify backend at api.dagwelldev.com.
 * This module is the ONE place the frontend talks to it — every call goes
 * through here so if the contract/URL ever moves, only this file changes.
 *
 * Set `NEXT_PUBLIC_DAGWELLDEV_API_BASE` to override (e.g. localhost during
 * development). Falls back to the production URL.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_DAGWELLDEV_API_BASE?.trim() || 'https://api.dagwelldev.com'
).replace(/\/$/, '')

// ─── Backend-served brand images ──────────────────────────────────────────
// Static brand assets live on dagwelldev-api under /static/images/ with a
// year-long immutable cache header. Every component that renders these
// should reference `IMAGES.*` so we get cache re-use across the site and a
// single swap-point when new art ships.
//
// The NFT artwork itself is NOT static — it's rendered per-hex by
// `nftImageUrl()` below (see routes/hexes/nft-image.js on the backend),
// matching the original Launch per-token SVG design.
export const IMAGES = {
  logo:              `${API_BASE}/static/images/brand-logo.png`,
  logoDarkBg:        `${API_BASE}/static/images/brand-logo-dark-bg.png`,
  // Marketing renders used on the landing page hardware section. Both ship
  // from the same backend whitelist so the FE never has to bundle 2-5MB of
  // PNGs and the NAS can serve them with year-long cache headers.
  hardwareExploded:  `${API_BASE}/static/images/hardware-exploded.png`,
  hardwareViews:     `${API_BASE}/static/images/hardware-views.png`,
} as const

/**
 * URL for the dynamically-rendered hex-node NFT artwork. Points at the same
 * backend endpoint that ERC-721 `tokenURI` metadata references, so the card
 * shown in the Launch UI is byte-identical to the one OpenSea renders. Works
 * for both pre-mint previews (pass only hexId) and post-mint cards (pass
 * tokenId + claimId so the SVG shows the claim label + real edition #).
 */
export function nftImageUrl(args: {
  hexId:    string
  tokenId?: number | null
  chain?:   'base' | 'cardano'
  claimId?: string | null
}): string {
  const qs = new URLSearchParams({ hexId: args.hexId })
  if (args.tokenId != null && Number.isFinite(args.tokenId) && args.tokenId > 0) {
    qs.set('tokenId', String(args.tokenId))
  }
  qs.set('chain', args.chain === 'cardano' ? 'cardano' : 'base')
  if (args.claimId) qs.set('claimId', args.claimId)
  return `${API_BASE}/hexes/nft-image?${qs.toString()}`
}

type Json = Record<string, unknown>

/** Thin fetch wrapper that throws on non-ok responses with a useful message. */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: Json | string
  try { body = text ? JSON.parse(text) : {} } catch { body = text }
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

// ─── POST /hexes/:hexId/purchase-intent  (method: onchain) ────────────────
export interface OnchainPurchaseIntent {
  ok:          true
  method:      'onchain'
  contract:    `0x${string}`
  hexId:       string
  /** Human-readable USDC price (e.g. 2000). */
  priceUsdc:   number
  /** Raw price in USDC base units (e.g. "2000000000"). Use this for approve(). */
  priceRaw:    string
  usdcAddress: `0x${string}`
  network:     'sepolia' | 'mainnet'
  buyer:       `0x${string}`
}

/**
 * Reserves a hex for an on-chain purchase. Backend validates the hex is
 * available in Mongo AND not yet claimed on-chain. Returns the exact
 * contract + USDC addresses the frontend should use for the approve + mint.
 *
 * @throws when hex is already sold / claimed / sale disabled.
 */
export async function reserveHexOnChain(
  hexId: string,
  evmAddress: string,
): Promise<OnchainPurchaseIntent> {
  return apiFetch<OnchainPurchaseIntent>(
    `/hexes/${encodeURIComponent(hexId)}/purchase-intent`,
    {
      method: 'POST',
      body: JSON.stringify({ method: 'onchain', evmAddress }),
    },
  )
}

// ─── POST /hexes/:hexId/purchase-intent  (method: stripe) ─────────────────
export interface StripePurchaseIntent {
  ok:        true
  method:    'stripe'
  sessionId: string
  url:       string
  expiresAt: number
}

/**
 * Creates a Stripe Checkout session. The backend webhook will mint on Base
 * after payment clears. `evmAddress` is where the NFT ultimately mints to —
 * for MVP we require the buyer to also connect a wallet so we have an address
 * to send to (no custody layer in v1).
 *
 * Caller passes `successUrl` + `cancelUrl` so the buyer ends up back on the
 * same origin they started on (localhost during dev, prod domain in prod).
 * Use Stripe's `{CHECKOUT_SESSION_ID}` template literal in successUrl — it's
 * substituted by Stripe at redirect time.
 */
export async function createStripeCheckout(
  hexId: string,
  evmAddress: string,
  email: string,
  redirects: { successUrl: string; cancelUrl: string },
): Promise<StripePurchaseIntent> {
  return apiFetch<StripePurchaseIntent>(
    `/hexes/${encodeURIComponent(hexId)}/purchase-intent`,
    {
      method: 'POST',
      body: JSON.stringify({
        method:     'stripe',
        evmAddress,
        email,
        successUrl: redirects.successUrl,
        cancelUrl:  redirects.cancelUrl,
      }),
    },
  )
}

// ─── POST /hexes/:hexId/purchase-intent  (method: cardano) ────────────────
export interface CardanoPurchaseIntent {
  ok:             true
  method:         'cardano'
  hexId:          string
  network:        'mainnet' | 'preprod'
  /** Treasury bech32 address — buyer pays this in ADA. */
  treasury:       string
  /** Price in lovelace (1 ADA = 1_000_000 lovelace). Send ≥ this amount. */
  priceLovelace:  number
  /** Convenience ADA value for UI display. */
  priceAda:       number
  /** Policy key hash of the CIP-68 pair that will be minted on confirmation. */
  policyKeyHash:  string
  /** CIP-68 contract address (receives the ref token). */
  contract:       string
  /** Deterministic 24-hex asset name for this hex on Cardano. */
  assetName:      string
  /** Echo of the buyer address the server recorded. */
  buyer:          string
  /** Use this as `purchaseId` when reporting the mint — matches the pending record. */
  purchaseId:     string
}

/**
 * Reserves a hex for Cardano-primary payment. Backend records a pending
 * hex_purchases row keyed by `purchaseId`; the frontend then builds a Lucid
 * transaction sending at least `priceLovelace` to `treasury`, and once the
 * tx confirms, POSTs the hash to `/hexes/events/mint-observed-cardano`.
 *
 * Independent of Base — works even when the Base contract isn't configured.
 */
export async function reserveHexCardano(
  hexId: string,
  cardanoAddress: string,
): Promise<CardanoPurchaseIntent> {
  return apiFetch<CardanoPurchaseIntent>(
    `/hexes/${encodeURIComponent(hexId)}/purchase-intent`,
    {
      method: 'POST',
      body:   JSON.stringify({ method: 'cardano', cardanoAddress }),
    },
  )
}

// ─── POST /hexes/events/mint-observed-cardano ─────────────────────────────
export interface CardanoMintObservedResponse {
  ok:       true
  hexId:    string
  mintPath: 'cardano_primary'
  cardano: {
    txHash?:      string
    explorerUrl?: string
    assetName?:   string
    hexId?:       string
    baseTokenId?: string
    action?:      'mint'
    userDelivery?: 'buyer' | 'bank'
    error?:       string
    alreadyMinted?: boolean
  }
  payment?: {
    txHash:        string
    explorerUrl:   string
    paidLovelace:  number
  }
}

/**
 * Diagnostic codes the backend returns inside a 402 body when payment
 * verification fails. Callers use these to decide whether a retry is
 * appropriate (timing) or whether to fail loudly (wrong address / underpaid).
 *
 *   not_indexed         — Kupo hasn't seen the tx yet. Retryable.
 *   no_treasury_output  — Tx exists but pays a different address. Hard fail.
 *   underpaid           — Tx pays treasury but for less than expected. Hard fail.
 *   kupo_unreachable    — Backend can't reach Kupo. Retry-after-a-moment.
 *   bad_input           — Backend rejected our payload. Hard fail.
 */
export type CardanoMintDiagnostic =
  | 'not_indexed'
  | 'no_treasury_output'
  | 'underpaid'
  | 'kupo_unreachable'
  | 'bad_input'

/**
 * Thrown by reportCardanoMintObserved when the backend returns a 402. Carries
 * the verification diagnostic so the UI can pick "retry quietly" vs.
 * "tell the user to contact ops".
 */
export class CardanoMintVerificationError extends Error {
  diagnostic?:       CardanoMintDiagnostic
  paidLovelace?:     number
  expectedLovelace?: number
  txHash?:           string
  constructor(msg: string, fields: {
    diagnostic?:       CardanoMintDiagnostic
    paidLovelace?:     number
    expectedLovelace?: number
    txHash?:           string
  } = {}) {
    super(msg)
    this.name             = 'CardanoMintVerificationError'
    this.diagnostic       = fields.diagnostic
    this.paidLovelace     = fields.paidLovelace
    this.expectedLovelace = fields.expectedLovelace
    this.txHash           = fields.txHash
  }
}

/**
 * Tells the backend the buyer's Cardano payment has confirmed on-chain.
 * Backend re-verifies via Kupo (defence against spoofing), then mints the
 * CIP-68 pair with mintPath="cardano_primary". Idempotent: safe to call
 * repeatedly — the second call returns alreadyMinted=true.
 *
 * On 402 (verification failure) this throws CardanoMintVerificationError
 * carrying the diagnostic. All other failures throw a plain Error.
 */
export async function reportCardanoMintObserved(args: {
  hexId:          string
  txHash:         string
  cardanoAddress: string
  purchaseId?:    string
}): Promise<CardanoMintObservedResponse> {
  const res = await fetch(`${API_BASE}/hexes/events/mint-observed-cardano`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(args),
  })
  const text = await res.text()
  let body: Record<string, unknown> | string
  try { body = text ? JSON.parse(text) : {} } catch { body = text }

  if (res.ok) return body as unknown as CardanoMintObservedResponse

  const errMsg = (typeof body === 'object' && body && 'error' in body)
    ? String((body as { error: unknown }).error)
    : `HTTP ${res.status}`

  if (res.status === 402 && typeof body === 'object' && body) {
    const b = body as Record<string, unknown>
    throw new CardanoMintVerificationError(errMsg, {
      diagnostic:       b.diagnostic       as CardanoMintDiagnostic | undefined,
      paidLovelace:     typeof b.paidLovelace     === 'number' ? b.paidLovelace     : undefined,
      expectedLovelace: typeof b.expectedLovelace === 'number' ? b.expectedLovelace : undefined,
      txHash:           typeof b.txHash           === 'string' ? b.txHash           : undefined,
    })
  }
  throw new Error(errMsg)
}

// ─── Atomic Cardano lane (single-tx mint) ────────────────────────────────
//
// New flow that replaces reserve-then-pay-then-mint-observed. Backend
// builds a tx that pays treasury AND mints the CIP-68 pair AND delivers
// the user token to the buyer in ONE settlement; partial-signs it with
// the policy key; FE adds buyer witness via CIP-30 signTx(cbor, true)
// and submits directly. No Kupo polling — if the tx settles, the buyer
// owns the NFT (atomic guarantee).

export interface CardanoPrepareTxResponse {
  ok:               true
  purchaseId:       string
  txCbor:           string                    // policy-signed CBOR; FE adds buyer witness
  assetName:        string
  refUnit:          string
  userUnit:         string
  contractAddress:  string
  treasuryAddress:  string
  network:          'mainnet' | 'preprod'
  priceLovelace:    number
}

export interface CardanoConfirmTxResponse {
  ok:        true
  hexId:     string
  mintPath:  'cardano_primary'
  cardano: {
    txHash:           string
    assetName:        string
    explorerUrl:      string
    alreadyConfirmed?: boolean
  }
  payment?: {
    txHash:       string
    explorerUrl:  string
    paidLovelace: number
  }
}

/**
 * POST /hexes/cardano/prepare-tx — backend returns a partial-signed atomic
 * mint tx. Buyer adds witness client-side via CIP-30 signTx(cbor, true) and
 * submits via the wallet (no second backend round-trip needed for submit).
 */
export async function prepareCardanoMintTx(args: {
  hexId:        string
  buyerAddress: string
}): Promise<CardanoPrepareTxResponse> {
  return apiFetch<CardanoPrepareTxResponse>(`/hexes/cardano/prepare-tx`, {
    method: 'POST',
    body:   JSON.stringify(args),
  })
}

/**
 * POST /hexes/cardano/confirm-tx — bookkeeping only. Tells the backend the
 * txHash so Mongo records flip (hex → sold, purchase → minted). Skipping
 * this call doesn't lose the buyer's NFT — they hold it on-chain regardless
 * — but the marketplace UI won't reflect the sale until confirm runs.
 */
export async function confirmCardanoMintTx(args: {
  purchaseId: string
  txHash:     string
}): Promise<CardanoConfirmTxResponse> {
  return apiFetch<CardanoConfirmTxResponse>(`/hexes/cardano/confirm-tx`, {
    method: 'POST',
    body:   JSON.stringify(args),
  })
}

// ─── POST /hexes/events/mint-observed ─────────────────────────────────────
export interface MintObservedResponse {
  ok:          true
  hexId:       string
  baseTokenId: number
  owner:       string
  cardano: {
    ok?:             boolean
    txHash?:         string
    assetName?:      string
    explorerUrl?:    string
    error?:          string
    alreadyMinted?:  boolean
  }
}

/**
 * Notifies the backend that an on-chain secureNode() tx has confirmed. The
 * backend re-verifies against the contract, upserts Mongo, and best-effort
 * mints the Cardano CIP-68 mirror. Safe to call repeatedly (idempotent).
 *
 * `cardanoAddress` (optional): if provided, the CIP-68 mirror token (222)
 * will be delivered to that wallet instead of the default treasury address.
 * Only set this when the buyer has connected a Cardano wallet (CIP-30).
 */
export async function reportMintObserved(args: {
  hexId:           string
  txHash?:         string
  cardanoAddress?: string
}): Promise<MintObservedResponse> {
  return apiFetch<MintObservedResponse>(`/hexes/events/mint-observed`, {
    method: 'POST',
    body:   JSON.stringify(args),
  })
}

// ─── GET /hexes ───────────────────────────────────────────────────────────
export type BackendHexStatus = 'available' | 'reserved' | 'sold' | 'bound'

/** One row in GET /hexes — enough for list/map overlay. */
export interface BackendHexSummary {
  hexId:            string
  status:           BackendHexStatus
  baseTokenId?:     number
  ownerEvmAddress?: string
  operatorDid?:     string
  mintPath?:        'onchain' | 'stripe' | 'admin' | string
  mintedAt?:        string
}

export interface BackendHexList {
  ok:    true
  count: number
  hexes: BackendHexSummary[]
}

/**
 * Lists every hex the backend knows about (Mongo-backed). Use this to overlay
 * SOLD/BOUND status onto the deterministic regions.json pool. Optional status
 * filter mirrors the backend `?status=` query param.
 */
export async function listHexes(opts?: {
  status?: BackendHexStatus
  limit?:  number
}): Promise<BackendHexList> {
  const qs = new URLSearchParams()
  if (opts?.status) qs.set('status', opts.status)
  if (opts?.limit)  qs.set('limit', String(opts.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return apiFetch<BackendHexList>(`/hexes${suffix}`)
}

// ─── GET /hexes/:hexId ────────────────────────────────────────────────────
export interface HexDetail {
  ok:                  true
  hexId:               string
  status:              'available' | 'reserved' | 'sold' | 'bound' | 'unknown'
  seeded:              boolean
  baseNetwork?:        'sepolia' | 'mainnet'
  baseTokenId?:        number
  baseTxHash?:         string
  baseExplorerUrl?:    string
  ownerEvmAddress?:    string
  cardanoMirrorStatus?: 'minted' | 'failed' | 'pending'
  cardanoTxHash?:      string
  cardanoAssetName?:   string
  cardanoExplorerUrl?: string
  mintedAt?:           string
  onChain: {
    claimed:  boolean
    tokenId?: number
    error?:   string
  }
}

/** Fetches live detail for a single hex (Mongo truth + on-chain verification). */
export async function getHexDetail(hexId: string): Promise<HexDetail> {
  return apiFetch<HexDetail>(`/hexes/${encodeURIComponent(hexId)}`)
}

// ─── GET /hexes/sale-state ────────────────────────────────────────────────
export interface SaleState {
  ok: true
  onChain: {
    enabled:      boolean
    network?:     'sepolia' | 'mainnet'
    address?:     string
    /**
     * Total ever minted on-chain (Base). Named `totalSupply` to match the
     * ERC-721 view function the backend proxies. Not the Genesis cap of 200
     * — that's a product-level constant, not an on-chain value.
     */
    totalSupply?: number
    remaining?:   number
    priceUsdc?:   number
    priceRaw?:    string
    treasury?:    string
    error?:       string
  }
  mongo: {
    available: number
    reserved:  number
    sold:      number
    bound:     number
    total:     number
  }
}

export async function getSaleState(): Promise<SaleState> {
  return apiFetch<SaleState>(`/hexes/sale-state`)
}

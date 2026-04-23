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
  logo:       `${API_BASE}/static/images/brand-logo.png`,
  logoDarkBg: `${API_BASE}/static/images/brand-logo-dark-bg.png`,
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
 */
export async function createStripeCheckout(
  hexId: string,
  evmAddress: string,
  email: string,
): Promise<StripePurchaseIntent> {
  return apiFetch<StripePurchaseIntent>(
    `/hexes/${encodeURIComponent(hexId)}/purchase-intent`,
    {
      method: 'POST',
      body: JSON.stringify({ method: 'stripe', evmAddress, email }),
    },
  )
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
    enabled:    boolean
    network?:   'sepolia' | 'mainnet'
    address?:   string
    totalCap?:  number
    totalMinted?: number
    remaining?: number
    priceUsdc?: number
    priceRaw?:  string
    error?:     string
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

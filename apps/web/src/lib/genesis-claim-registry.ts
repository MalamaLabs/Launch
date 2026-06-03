/**
 * Genesis 200 claim — shared type only.
 *
 * The authoritative claim/sold state lives in the dagwelldev-api Mongo `hexes`
 * collection and is read via GET /hexes and GET /hexes/:hexId (see
 * src/app/api/hexes/by-id/[hexId]/route.ts and the explorer overlay). The old
 * in-memory/KV claim registry that used to live here has been removed; this
 * file now exposes only the `GenesisClaim` shape consumed by the UI.
 */

export type GenesisClaim = {
  claimId: string
  editionNumber: number
  hexId: string
  chain: 'base' | 'cardano'
  buyerAddress: string
  claimedAt: string
  txHash?: string
  /** Set after Base mint — links ERC-721 tokenId to this claim */
  evmTokenId?: number
  /** KOL partner id who referred this purchase */
  referrerId?: string
}

import { NextResponse } from 'next/server'
import regionsData from '@/data/regions.json'
import { buildGenesisHexListItems, getGenesisPoolSlot } from '@/lib/genesis-hexes'
import { API_BASE } from '@/lib/api'
import type { GenesisClaim } from '@/lib/genesis-claim-registry'

/**
 * GET /api/hexes/by-id/[hexId]
 * Returns { item: GenesisHexListItem, claim: GenesisClaim | null }
 *
 * - item  — static metadata (region, score, chain) from local genesis-hexes
 * - claim — live sold state fetched from dagwelldev-api; null if available
 *
 * Called by HexMap on every hex click to populate the detail drawer and
 * the "Reserve this Hex" button link.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hexId: string }> }
) {
  const { hexId: raw } = await params
  const hexId = decodeURIComponent(raw)

  const items = buildGenesisHexListItems(regionsData)
  const item = items.find((i) => i.hexId === hexId)
  if (!item) {
    return NextResponse.json({ error: 'Hex not in Genesis pool' }, { status: 404 })
  }

  // Fetch live status from dagwelldev-api.
  // Failure → treat as unclaimed so the drawer still opens and the Reserve
  // button still works even if the backend is briefly unreachable.
  let claim: GenesisClaim | null = null
  try {
    const res = await fetch(
      `${API_BASE}/hexes/${encodeURIComponent(hexId)}`,
      { next: { revalidate: 30 } }
    )
    if (res.ok) {
      const detail = await res.json()
      const isSold = detail.status === 'sold' || detail.status === 'bound'
      if (isSold) {
        const editionNumber = getGenesisPoolSlot(hexId, regionsData) ?? 0
        claim = {
          claimId:       `G200-${String(editionNumber).padStart(3, '0')}`,
          editionNumber,
          hexId,
          chain:         detail.cardanoTxHash ? 'cardano' : 'base',
          buyerAddress:  detail.ownerEvmAddress ?? '',
          claimedAt:     detail.mintedAt ?? new Date(0).toISOString(),
          txHash:        detail.baseTxHash ?? detail.cardanoTxHash,
          evmTokenId:    detail.baseTokenId,
        }
      }
    }
  } catch {
    // dagwelldev-api unreachable — show hex as unclaimed in the drawer.
    // The backend will still reject a duplicate purchase attempt at checkout.
  }

  return NextResponse.json({ item, claim })
}

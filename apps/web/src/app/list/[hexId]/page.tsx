import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import regionsData from '@/data/regions.json'
import { buildGenesisHexListItems, getGenesisPoolSlot } from '@/lib/genesis-hexes'
import { getHexDetail, type HexDetail } from '@/lib/api'
import type { GenesisClaim } from '@/lib/genesis-claim-registry'
import GenesisHexDetail from '@/components/GenesisHexDetail'

type Props = { params: Promise<{ hexId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hexId: raw } = await params
  const hexId = decodeURIComponent(raw)
  return {
    title: `Genesis hex ${hexId.slice(0, 10)}… | Mālama Labs`,
    description: 'Genesis 200 hex node license detail, NFT preview, boundary, score, and terms.',
  }
}

/**
 * Map the dagwelldev-api `/hexes/:hexId` response into the `GenesisClaim` shape
 * the detail component was built around. Keeping the type import preserves the
 * component's contract while the actual truth now lives in the backend.
 *
 * Returns null when the hex is not yet sold (component expects null, not a
 * half-filled claim).
 */
function detailToClaim(hexId: string, detail: HexDetail): GenesisClaim | null {
  const isSold = detail.status === 'sold' || detail.status === 'bound'
  if (!isSold) return null

  const editionNumber = getGenesisPoolSlot(hexId, regionsData) ?? 0
  return {
    claimId:       `G200-${String(editionNumber).padStart(3, '0')}`,
    editionNumber,
    hexId,
    chain:         'base',
    buyerAddress:  detail.ownerEvmAddress ?? '',
    claimedAt:     detail.mintedAt ?? new Date(0).toISOString(),
    txHash:        detail.baseTxHash,
    evmTokenId:    detail.baseTokenId,
  }
}

export default async function GenesisHexDetailPage({ params }: Props) {
  const { hexId: raw } = await params
  const hexId = decodeURIComponent(raw)
  const items = buildGenesisHexListItems(regionsData)
  const item = items.find((i) => i.hexId === hexId)
  if (!item) notFound()

  // Fetch sold/available state from dagwelldev-api. Failure → render as
  // unclaimed so the page still works if the backend is briefly unreachable.
  let claim: GenesisClaim | null = null
  try {
    const detail = await getHexDetail(hexId)
    claim = detailToClaim(hexId, detail)
  } catch (err) {
    console.warn('[detail] getHexDetail failed — rendering as unclaimed', err)
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-malama-deep">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-gray-800 px-4 py-3">
        <Link href="/list" className="text-sm font-bold text-malama-teal hover:underline">
          ← Back to list
        </Link>
        <Link href="/map" className="text-sm text-gray-500 hover:text-white">
          Map
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <GenesisHexDetail variant="page" item={item} claim={claim} />
      </div>
    </div>
  )
}

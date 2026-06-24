import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import regionsData from '@/data/regions.json'
import { buildGenesisHexListItems, getGenesisPoolSlot } from '@/lib/genesis-hexes'
import { getHexDetail, type HexDetail, earlyInvestorImageUrl, cityState } from '@/lib/api'
import type { GenesisClaim } from '@/lib/genesis-claim-registry'
import GenesisHexDetail from '@/components/GenesisHexDetail'

type Props = { params: Promise<{ hexId: string }> }

// Early Investor plot ids are slugs; Genesis hexes are 15–16 hex-char H3 cells.
const isPlotId = (id: string) => !/^[0-9a-f]{15,16}$/i.test(id)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hexId: raw } = await params
  const hexId = decodeURIComponent(raw)
  if (isPlotId(hexId)) {
    return {
      title: `Early Investor plot ${hexId} | Mālama Labs`,
      description: 'Mālama Early Investor plot license detail and NFT preview.',
    }
  }
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

  // Fetch sold/available state from dagwelldev-api. Failure → render as
  // unclaimed so the page still works if the backend is briefly unreachable.
  let detail: Awaited<ReturnType<typeof getHexDetail>> | null = null
  try {
    detail = await getHexDetail(hexId)
  } catch (err) {
    console.warn('[detail] getHexDetail failed — rendering as unclaimed', err)
  }

  // Early Investor plots are a separate ERC-721 (slug ids, not H3 cells). Render
  // their own layout — never the Genesis template (which would feed the slug to
  // cellToLatLng / the hex art renderer and come out garbled).
  if (isPlotId(hexId)) {
    if (!detail) notFound()
    return <EarlyInvestorPlotPage hexId={hexId} detail={detail} />
  }

  const items = buildGenesisHexListItems(regionsData)
  const item = items.find((i) => i.hexId === hexId)
  const claim: GenesisClaim | null = detail ? detailToClaim(hexId, detail) : null

  // Only 404 if the hex is in neither the genesis list nor Mongo.
  // Minted hexes that fall outside the curated list still deserve a detail page.
  if (!item && !detail) notFound()

  // Build a minimal list item for hexes not in the genesis pool so the
  // detail component always receives a non-null item prop.
  const { cellToLatLng } = await import('h3-js')
  const resolvedItem = item ?? (() => {
    const [lat, lng] = cellToLatLng(hexId)
    return {
      hexId,
      region: 'south' as const,
      regionLabel: 'Unknown',
      lat,
      lng,
      status: 'reserved' as const,
      sold: true,
      chain: 'base' as const,
      dataScore: 0,
      startingBid: 2000,
      activeSensors: 0,
      uptime: 0,
      overlap: false,
      genesisEdition: true as const,
      genesisPriceUsd: 2000,
    }
  })()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-malama-deep">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-gray-800 px-4 py-3">
        <Link href="/list" className="text-sm font-bold text-malama-teal hover:underline">
          ← Back to list
        </Link>
        <Link href="/explorer" className="text-sm text-gray-500 hover:text-white">
          Map
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <GenesisHexDetail variant="page" item={resolvedItem} claim={claim} />
      </div>
    </div>
  )
}

// ── Early Investor plot detail ─────────────────────────────────────────────
type PlotDetail = HexDetail & {
  name?: string
  plotNumber?: number
  region?: string
  lat?: number
  lng?: number
  baseExplorerUrl?: string | null
}

function EarlyInvestorPlotPage({ hexId, detail }: { hexId: string; detail: HexDetail }) {
  const p = detail as PlotDetail
  const name = cityState(p.name || hexId) || hexId
  const numLabel = p.plotNumber != null ? `#${String(p.plotNumber).padStart(3, '0')}` : null
  const sold = p.status === 'sold' || p.status === 'bound' || Boolean(p.baseTokenId)
  const coords =
    typeof p.lat === 'number' && typeof p.lng === 'number'
      ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
      : ''
  const explorer = p.baseExplorerUrl || (p.baseTxHash ? `https://basescan.org/tx/${p.baseTxHash}` : null)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-malama-deep">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-gray-800 px-4 py-3">
        <Link href="/list" className="text-sm font-bold text-malama-teal hover:underline">← Back to list</Link>
        <Link href="/explorer" className="text-sm text-gray-500 hover:text-white">Map</Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto grid max-w-3xl gap-8 md:grid-cols-[300px_1fr]">
          {/* Artwork */}
          <div className="overflow-hidden rounded-2xl border border-[#a855f7]/30 bg-[#0d0518]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={earlyInvestorImageUrl(hexId)} alt={`Early Investor Plot ${name}`} className="block h-auto w-full" />
          </div>

          {/* Details */}
          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#c084fc]">
              Early Investor Plot
            </p>
            <h1 className="flex items-baseline gap-3 text-3xl font-black text-white">
              {name}
              {numLabel && <span className="font-mono text-base text-[#c084fc]">{numLabel}</span>}
            </h1>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
                sold ? 'border-gray-600 bg-gray-800 text-gray-300' : 'border-green-500/40 bg-green-500/10 text-green-400'
              }`}>
                {sold ? 'Owned' : (p.status || 'available')}
              </span>
              {p.region && (
                <span className="rounded-full border border-[#a855f7]/40 bg-[#a855f7]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[#c084fc]">
                  {p.region}
                </span>
              )}
            </div>

            <dl className="mt-6 space-y-2 border-t border-gray-800 pt-4 text-sm">
              <Row label="Entry" value="$2,000 USDC" />
              <Row label="MLMA / plot" value="125,000" />
              {coords && <Row label="Location" value={coords} mono />}
              {p.baseTokenId != null && <Row label="Base token" value={`#${p.baseTokenId}`} mono />}
              {p.ownerEvmAddress && <Row label="Owner" value={p.ownerEvmAddress} mono />}
              <Row label="Plot id" value={hexId} mono />
            </dl>

            {explorer && (
              <a href={explorer} target="_blank" rel="noopener noreferrer"
                 className="mt-6 inline-block font-mono text-[11px] uppercase tracking-wider text-[#c084fc] hover:underline">
                → View on Basescan
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`max-w-[60%] truncate text-right text-gray-200 ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  )
}

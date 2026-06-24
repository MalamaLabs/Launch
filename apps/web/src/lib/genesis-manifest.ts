/**
 * Shared loader for the live Genesis hex catalog → Phase1Manifest.
 *
 * Extracted from app/explorer/page.tsx so both the explorer route and the
 * in-flow reserve picker (GenesisMint) build the manifest the same way —
 * single source of truth for the catalog fetch + Mongo status overlay +
 * the catalog→Phase1Manifest mapping.
 */

import { cellToLatLng, getResolution } from 'h3-js'
import { API_BASE } from '@/lib/api'
import {
  classifyZone,
  estimateWaterCoverage,
  detectRegion,
  REGION_LABELS,
} from '@/lib/hex-geo'
import type { HexStatus } from '@/explorer/components/hex-map.constants'
import type { Phase1Hex, Phase1Manifest } from '@/explorer/components/hex-map.types'

/**
 * The 5 Mālama Labs reserved nodes (one per region, H3 Res 4).
 * These arrive pre-marked as `reserved` from /api/hexes — no override needed.
 * Kept here as a lookup so callers can label them distinctly in the panel.
 */
export const MALAMA_RESERVED_HEX_LABELS: Record<string, { operator: string; label: string }> = {
  '8429a1dffffffff': { operator: 'Mālama Labs', label: 'Los Angeles' },
  '84464b9ffffffff': { operator: 'Mālama Labs', label: 'Honolulu'    },
  '84268cdffffffff': { operator: 'Mālama Labs', label: 'Denver'      },
  '842664dffffffff': { operator: 'Mālama Labs', label: 'Chicago'     },
  '8426cb9ffffffff': { operator: 'Mālama Labs', label: 'Dallas'      },
}

const GENESIS_REGION_KEYS = new Set(['west', 'pacific', 'mountain', 'midwest', 'south'])

/**
 * Load the live Genesis catalog and build the Phase1Manifest the map + list
 * consume. Throws on hard catalog failure (caller renders an error state).
 */
export async function loadGenesisManifest(): Promise<Phase1Manifest> {
  const fc = await loadGenesisFeatureCollection()
  return buildManifestFromApi(fc)
}

async function loadGenesisFeatureCollection(): Promise<{
  features: Array<{ properties: Record<string, unknown> }>
}> {
  const fc = await loadHexCatalog()
  // The catalog endpoints (/hexes/geojson and the /api/hexes fallback) carry
  // only geometry + the 5 reserved HQ cells — they intentionally omit live
  // sold/reserved state to stay cacheable. Mongo (via dagwelldev-api /hexes)
  // is the single source of truth for status, so overlay it here before the
  // manifest is built. Without this, sold hexes render as "available" on the
  // map/list until clicked.
  await overlayMongoStatus(fc)
  return fc
}

/** Fetch the hex geometry catalog (backend geojson, local fallback). */
async function loadHexCatalog(): Promise<{
  features: Array<{ properties: Record<string, unknown> }>
}> {
  const api = await fetch(`${API_BASE}/hexes/geojson`, { cache: 'no-store' })
  if (api.ok) {
    const fc = (await api.json()) as { features: Array<{ properties: Record<string, unknown> }> }
    const hasNewRegions = fc.features?.some((f) => GENESIS_REGION_KEYS.has(String(f.properties?.region ?? '')))
    if (hasNewRegions) return fc
  }

  const local = await fetch('/api/hexes', { cache: 'no-store' })
  if (!local.ok) {
    throw new Error(`${API_BASE}/hexes/geojson returned ${api.status}; /api/hexes returned ${local.status}`)
  }
  return (await local.json()) as { features: Array<{ properties: Record<string, unknown> }> }
}

/**
 * Overlay live status from the Mongo `hexes` collection onto the catalog
 * features (mutates in place). Reads dagwelldev-api GET /hexes, which returns
 * `{ hexes: [{ hexId, status }] }` straight from Mongo. Failure is non-fatal.
 */
async function overlayMongoStatus(fc: {
  features: Array<{ properties: Record<string, unknown> }>
}): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/hexes?limit=500`, { cache: 'no-store' })
    if (!res.ok) return
    const body = (await res.json()) as { hexes?: Array<{ hexId: string; status?: string }> }
    if (!body.hexes?.length) return

    const statusByHex = new Map<string, string>()
    for (const h of body.hexes) {
      if (h.hexId && h.status) statusByHex.set(h.hexId, h.status)
    }

    for (const feat of fc.features) {
      const id = String(feat.properties?.id ?? '')
      const mongoStatus = statusByHex.get(id)
      if (!mongoStatus) continue
      feat.properties.status = mongoStatus
      feat.properties.sold = mongoStatus !== 'available'
    }
  } catch {
    // dagwelldev-api unreachable — leave catalog status untouched.
  }
}

/**
 * Convert the dagwelldev-api /hexes/geojson FeatureCollection (legacy
 * genesis-hexes properties) into the Phase1Manifest shape the explorer expects.
 */
function buildManifestFromApi(fc: {
  features: Array<{ properties: Record<string, unknown> }>
}): Phase1Manifest {
  // Deduplicate defensively in case an older API returns chain-position rows
  // instead of one row per H3 cell.
  const byH3 = new Map<string, Phase1Hex>()

  fc.features.forEach((feat, idx) => {
    const p = feat.properties as {
      id: string
      region: string
      regionLabel: string
      status: string
      sold: boolean
      chain: 'base' | 'cardano'
      isHQ: boolean
      dataScore: number
      startingBid: number
    }
    const h3Index = p.id
    if (byH3.has(h3Index)) return // already counted from the other chain

    const [lat, lng] = cellToLatLng(h3Index)
    const malamaLabel = MALAMA_RESERVED_HEX_LABELS[h3Index]
    const upstreamReserved = Boolean(p.sold) || p.status === 'reserved' || p.isHQ || Boolean((p as Record<string, unknown>).isMalamaReserved)
    const status: Phase1Hex['status'] = malamaLabel
      ? 'reserved-founding'
      : upstreamReserved
      ? 'reserved'
      : 'available'

    // All Genesis regions are US territory.
    const country = 'US'
    const res = getResolution(h3Index)

    // Auto-compute zone, water coverage, and region from centroid.
    const { zone, multiplier } = classifyZone(lat, lng)
    const waterCoveragePercent = estimateWaterCoverage(lat, lng, res)

    // Skip cells that are entirely ocean — no commercial value and not for sale.
    if (waterCoveragePercent >= 100) return

    const detectedRegionKey = detectRegion(lat, lng)
    const detectedRegionLabel = REGION_LABELS[detectedRegionKey]
    const region = p.regionLabel ?? p.region ?? detectedRegionLabel

    byH3.set(h3Index, {
      nodeNumber: idx + 1,
      h3Index,
      h3Resolution: res,
      status,
      operator: malamaLabel?.operator ?? null,
      region,
      country,
      administrativeArea: null,
      locality: malamaLabel?.label ?? null,
      postalCode: null,
      centroidLat: lat,
      centroidLng: lng,
      zoneClassification: zone,
      geographicMultiplier: multiplier,
      waterCoveragePercent,
      dataDemandScore: p.dataScore ?? null,
      listingReferenceUsd: p.startingBid ?? 2228,
      genesisReserveUsd: 2000,
      notes: undefined,
    })
  })

  const hexes = Array.from(byH3.values()).map((h, i) => ({ ...h, nodeNumber: i + 1 }))
  const reservedCount = hexes.filter((h) => h.status !== 'available').length

  return {
    schemaVersion: '1.0.0',
    manifestName: 'Phase 1 Hex Node Launchpad (live from dagwelldev-api)',
    h3Resolution: hexes[0]?.h3Resolution ?? 4,
    totalCells: hexes.length,
    soldOrReserved: reservedCount,
    externalAvailable: hexes.length - reservedCount,
    lastUpdated: new Date().toISOString().slice(0, 10),
    wavesPolicy: 'Live catalog from dagwelldev-api /hexes/geojson',
    regions: ['West Coast', 'Pacific & Alaska', 'Mountain West', 'Midwest', 'South & East'],
    statusVocabulary: {
      available: 'Open for reservation',
      upcoming: 'Held back for a future wave',
      reserved: 'Purchased by an operator or held by Mālama HQ',
      'reserved-founding': 'Held by the Mālama Labs founding team',
      'reserved-user': 'Your Genesis Hex',
      activated: 'Hardware booted and signing on-chain',
      'early-investor': 'Bespoke Early Investor plot',
      'future-phase': 'Land cell not yet in any Phase',
      restricted: 'Sales prohibited in this jurisdiction',
    },
    hexes,
  }
}

/**
 * Overlay backend hex statuses onto the deterministic Genesis 200 pool.
 *
 * The pool itself (regionId → hexId, lat/lng, data score, starting bid) is
 * generated client-side from regions.json via buildGenesisHexListItems /
 * buildGenesisHexFeatureCollection. The only thing the backend owns is the
 * per-hex SALE state: available / reserved / sold / bound.
 *
 * This module is the thin glue between those two sources.
 */

import type { BackendHexSummary } from '@/lib/api'
import type { GenesisHexListItem } from '@/lib/genesis-hexes'

/**
 * Returns a new list of items with `status` and `sold` flipped to reflect
 * the backend's canonical state. Items not present in the backend response
 * are left untouched — safe if the backend is partially seeded.
 *
 * Hexes the backend reports as `sold` or `bound` render as SOLD.
 * Hexes reported as `reserved` render as "reserved" (e.g. mid-purchase).
 */
export function overlayBackendStatus(
  items: GenesisHexListItem[],
  backendHexes: BackendHexSummary[],
): GenesisHexListItem[] {
  if (!backendHexes || backendHexes.length === 0) return items
  const byId = new Map(backendHexes.map((h) => [h.hexId, h]))

  return items.map((item) => {
    const b = byId.get(item.hexId)
    if (!b) return item

    // `sold` & `bound` both mean "no longer available" in the UI.
    if (b.status === 'sold' || b.status === 'bound') {
      return { ...item, status: 'reserved' as const, sold: true }
    }
    if (b.status === 'reserved') {
      return { ...item, status: 'reserved' as const, sold: item.sold ?? false }
    }
    // backend says available → keep frontend's view (frontend already knows
    // about the 5 Malama-wallet pre-mints via regions.json).
    return item
  })
}

/** Same overlay, but for the GeoJSON FeatureCollection fed into mapbox. */
export function overlayBackendStatusOnFeatures<
  F extends { properties: Record<string, unknown> },
>(features: F[], backendHexes: BackendHexSummary[]): F[] {
  if (!backendHexes || backendHexes.length === 0) return features
  const byId = new Map(backendHexes.map((h) => [h.hexId, h]))

  return features.map((f) => {
    const id = String(f.properties.id ?? '')
    const b = byId.get(id)
    if (!b) return f

    const next = { ...f, properties: { ...f.properties } }
    if (b.status === 'sold' || b.status === 'bound') {
      next.properties.status = 'reserved'
      next.properties.sold   = true
    } else if (b.status === 'reserved') {
      next.properties.status = 'reserved'
    }
    return next
  })
}

import { NextResponse } from 'next/server'
import regionsData from '@/data/regions.json'
import { buildGenesisHexFeatureCollection } from '@/lib/genesis-hexes'

/**
 * GET /api/hexes
 * GeoJSON FeatureCollection for the Mapbox hex layer.
 * All genesis pool hexes; status field reflects local registry only —
 * live sold state is fetched per-click via /api/hexes/by-id/[hexId].
 */
export async function GET() {
  const fc = buildGenesisHexFeatureCollection(regionsData)
  return NextResponse.json(fc)
}

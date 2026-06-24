'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { latLngToCell } from 'h3-js'
import { Loader2, MapPin } from 'lucide-react'
import { loadGenesisManifest } from '@/lib/genesis-manifest'
import { listEarlyInvestorPlots } from '@/lib/api'
import type { HexMapHandle } from '@/explorer/components/HexMap'
import type {
  EarlyInvestorPlotPin,
  LandCellSet,
  Phase1Manifest,
} from '@/explorer/components/hex-map.types'

// Canonical Genesis license size — plots snap here for grid context if the
// backend didn't already supply an h3Index.
const PLOT_H3_RESOLUTION = 4

// HexMap pulls in mapbox-gl (browser-only) — load it client-side only.
const HexMap = dynamic(
  () => import('@/explorer/components/HexMap').then((m) => m.HexMap),
  { ssr: false, loading: () => <PickerNote loading>Loading map…</PickerNote> },
)

/**
 * In-flow map picker for the reserve flow. Reuses the explorer's HexMap +
 * shared manifest loader; clicking an available hex calls onSelect(h3Index)
 * and the chosen cell is highlighted via HexMap's selectedHexId prop.
 *
 * Only available hexes are interactive on the map (HexMap filters non-
 * interactive statuses), so reserved/sold cells can't be selected. Degrades
 * gracefully to a note when the Mapbox token is missing or the catalog fails —
 * the buyer can switch to the List view, which needs neither.
 */
export default function HexPickerMap({
  selectedHexId,
  onSelect,
}: {
  selectedHexId: string | null
  onSelect: (hexId: string) => void
}) {
  const [manifest, setManifest] = useState<Phase1Manifest | null>(null)
  const [plots, setPlots] = useState<EarlyInvestorPlotPin[]>([])
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<HexMapHandle | null>(null)

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
  const isPlaceholder =
    token === 'pk.your_token_here' || token === 'pk.your_mapbox_token_here'

  useEffect(() => {
    let cancelled = false
    loadGenesisManifest()
      .then((m) => { if (!cancelled) setManifest(m) })
      .catch((e) => { if (!cancelled) setError(String(e)) })
    return () => { cancelled = true }
  }, [])

  // Early Investor plots are an optional overlay — never block the picker on them.
  useEffect(() => {
    let cancelled = false
    listEarlyInvestorPlots()
      .then((res) => {
        if (cancelled) return
        const pins = (res.plots ?? [])
          .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
          .map<EarlyInvestorPlotPin>((p) => ({
            plotId: p.plotId,
            name: p.name,
            plotNumber: p.plotNumber,
            lat: p.lat as number,
            lng: p.lng as number,
            h3Index: p.h3Index ?? latLngToCell(p.lat as number, p.lng as number, PLOT_H3_RESOLUTION),
            status: p.status,
          }))
        setPlots(pins)
      })
      .catch(() => { /* overlay is best-effort */ })
    return () => { cancelled = true }
  }, [])

  if (!token || isPlaceholder) {
    return <PickerNote>Map needs a Mapbox token — switch to the List view to pick your hex.</PickerNote>
  }
  if (error) {
    return <PickerNote>Couldn’t load the map catalog — switch to the List view to pick your hex.</PickerNote>
  }
  if (!manifest) {
    return <PickerNote loading>Loading hex catalog…</PickerNote>
  }

  return (
    <div className="relative h-full w-full">
      <HexMap
        ref={mapRef}
        accessToken={token}
        manifest={manifest}
        landCells={{} as { r1?: LandCellSet; r3?: LandCellSet; r5?: LandCellSet }}
        selectedHexId={selectedHexId}
        onHexClick={({ hex }) => onSelect(hex.h3Index)}
        earlyInvestorPlots={plots}
        onPlotClick={({ plot }) => onSelect(plot.plotId)}
      />
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-gray-700 bg-malama-deep/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-400">
        <MapPin className="mr-1 inline h-3 w-3 text-malama-accent" aria-hidden />
        Tap an available hex to select
      </div>
    </div>
  )
}

function PickerNote({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-malama-deep px-6 text-center font-mono text-sm text-gray-500">
      {loading
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-malama-teal" />
        : <MapPin className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />}
      {children}
    </div>
  )
}

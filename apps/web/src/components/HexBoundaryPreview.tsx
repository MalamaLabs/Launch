'use client'

import { useEffect, useRef, useState } from 'react'
import { cellToLatLng } from 'h3-js'
import { hexToGeoJSON } from '@/lib/h3'
import { MapPin, Loader2 } from 'lucide-react'

type Props = {
  hexId: string
  /** Shown when reverse geocode fails or is unavailable (Genesis region label). */
  genesisRegionLabel?: string
  className?: string
}

type LocationLabel = {
  /** e.g. "Brooklyn, New York" */
  primary: string
  /** e.g. full Mapbox place_name */
  detail: string
}

// Mapbox Search API v6 reverse geocode response shape
type V6Feature = {
  properties: {
    feature_type?: string
    name?: string
    full_address?: string
    context?: {
      locality?: { name?: string }
      district?: { name?: string }
      place?: { name?: string }
      region?: { name?: string }
      country?: { name?: string }
    }
  }
}

function parseV6Features(features: V6Feature[]): LocationLabel {
  if (!features?.length) return { primary: '', detail: '' }
  // v6 returns a single best-match feature for reverse geocode
  const props = features[0].properties
  const ctx = props.context || {}
  const city =
    ctx.locality?.name || ctx.district?.name || ctx.place?.name || props.name || ''
  const state = ctx.region?.name || ''
  const primary = [city, state].filter(Boolean).join(', ') || props.full_address || props.name || ''
  return {
    primary,
    detail: props.full_address || primary,
  }
}

/**
 * Mapbox map with H3 hex outline + reverse-geocoded city / state (Mapbox Search API v6).
 */
export default function HexBoundaryPreview({ hexId, genesisRegionLabel, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{ remove: () => void } | null>(null)
  const [location, setLocation] = useState<LocationLabel | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geocodeDone, setGeocodeDone] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token || !containerRef.current) return

    const [lat, lng] = cellToLatLng(hexId)
    let cancelled = false
    const el = containerRef.current

    const run = async () => {
      const { default: mapboxgl } = await import('mapbox-gl')
      await import('mapbox-gl/dist/mapbox-gl.css')

      if (cancelled || !el) return

      mapboxgl.accessToken = token
      const feature = hexToGeoJSON(hexId)

      const map = new mapboxgl.Map({
        container: el,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [lng, lat],
        zoom: 11,
        attributionControl: true,
      })
      mapRef.current = map

      map.on('load', () => {
        if (cancelled) return
        map.addSource('hex-cell', {
          type: 'geojson',
          data: feature,
        })
        map.addLayer({
          id: 'hex-fill',
          type: 'fill',
          source: 'hex-cell',
          paint: {
            'fill-color': '#44BBA4',
            'fill-opacity': 0.22,
          },
        })
        map.addLayer({
          id: 'hex-outline',
          type: 'line',
          source: 'hex-cell',
          paint: {
            'line-color': '#44BBA4',
            'line-width': 2,
          },
        })

        const ring = feature.geometry.coordinates[0] as [number, number][]
        const b = new mapboxgl.LngLatBounds(ring[0], ring[0])
        for (const c of ring) b.extend(c)
        map.fitBounds(b, { padding: 48, maxZoom: 13, duration: 0 })
        setMapReady(true)
      })

      map.on('error', (e) => {
        console.warn('HexBoundaryPreview map error', e.error)
      })
    }

    void run()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [hexId])

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      setGeoError('Map token unavailable')
      setGeocodeDone(true)
      return
    }
    setGeocodeDone(false)
    const [lat, lng] = cellToLatLng(hexId)
    let cancelled = false

    // Mapbox Search API v6 (reverse geocode) — replaces deprecated v5 mapbox.places endpoint
    const params = new URLSearchParams({
      access_token: token,
      longitude: String(lng),
      latitude: String(lat),
    })
    const url = `https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`

    fetch(url)
      .then(async (r) => {
        const data = (await r.json()) as { features?: V6Feature[]; message?: string }
        if (!r.ok) {
          throw new Error(data.message || `Geocode ${r.status}`)
        }
        return data
      })
      .then((data) => {
        if (cancelled) return
        const parsed = parseV6Features(data.features || [])
        if (parsed.primary || parsed.detail) {
          setLocation(parsed)
        } else {
          setLocation(null)
        }
        setGeoError(null)
      })
      .catch(() => {
        if (!cancelled) {
          setLocation(null)
          setGeoError(null)
        }
      })
      .finally(() => {
        if (!cancelled) setGeocodeDone(true)
      })

    return () => {
      cancelled = true
    }
  }, [hexId])

  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  if (tokenMissing) {
    return (
      <div
        className={`flex h-56 flex-col items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center text-sm text-amber-200/90 ${className}`}
      >
        <MapPin className="mb-2 h-8 w-8 opacity-70" />
        Add <span className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</span> to show the boundary map.
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-t-xl border border-b-0 border-gray-800 bg-gradient-to-b from-[#0d1829] to-[#0a121f] px-4 py-3">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-malama-teal" aria-hidden />
          <div className="min-w-0">
            {location?.primary ? (
              <>
                <p className="text-sm font-bold leading-snug text-white">{location.primary}</p>
                {location.detail && location.detail !== location.primary && (
                  <p className="mt-1 text-xs leading-relaxed text-gray-400">{location.detail}</p>
                )}
              </>
            ) : genesisRegionLabel && geocodeDone ? (
              <p className="text-sm font-bold leading-snug text-white">{genesisRegionLabel}</p>
            ) : geoError ? (
              <p className="text-xs text-gray-500">{geoError}</p>
            ) : !geocodeDone ? (
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Resolving city &amp; state…
              </p>
            ) : (
              <p className="text-xs text-gray-500">City detail unavailable for this cell center.</p>
            )}
            <p className="mt-2 font-mono text-[10px] text-gray-600">H3 cell · {hexId}</p>
          </div>
        </div>
      </div>
      <div className="relative h-56 w-full overflow-hidden rounded-b-xl border border-gray-800 bg-[#050a14]">
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <Loader2 className="h-8 w-8 animate-spin text-malama-teal" />
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" role="presentation" aria-label="Map showing hex boundary" />
      </div>
      <p className="mt-2 text-[10px] text-gray-600">
        Streets © Mapbox © OpenStreetMap. Boundary is the licensed H3 cell.
      </p>
    </div>
  )
}

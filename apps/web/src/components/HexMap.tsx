'use client'

import React, { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import HexPanel from './HexPanel'
import { Navigation } from 'lucide-react'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFsYW1hbGFicyIsImEiOiJjbHZ...mock-token'

export default function HexMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [selectedHex, setSelectedHex] = useState<any | null>(null)
  
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-112.5, 43.5], 
      zoom: 6,
      projection: 'globe' as any 
    })

    const m = map.current

    m.on('style.load', () => {
      m.setFog({
        color: 'rgb(10, 22, 40)',
        'high-color': 'rgb(17, 24, 39)',
        'horizon-blend': 0.1,
        'space-color': 'rgb(5, 10, 20)',
        'star-intensity': 0.8
      })
    })

    m.on('load', async () => {
      try {
        const res = await fetch('/api/hexes')
        const data = await res.json()

        m.addSource('hexes', {
          type: 'geojson',
          data
        })

        m.addLayer({
          id: 'hex-fill',
          type: 'fill',
          source: 'hexes',
          paint: {
            'fill-color': [
              'match',
              ['get', 'status'],
              'available', '#44BBA4', 
              'reserved', '#6B7280',  
              'active', '#22C55E',    
              'auction', '#F18F01',   
              '#374151'
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'dataScore'],
              0, 0.1,
              100, 0.7
            ]
          }
        })

        m.addLayer({
          id: 'hex-lines',
          type: 'line',
          source: 'hexes',
          paint: {
            'line-color': '#0A1628',
            'line-width': 1.5,
            'line-opacity': 0.8
          }
        })
        
        m.addLayer({
          id: 'hex-highlight',
          type: 'line',
          source: 'hexes',
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 4,
            'line-opacity': 0.9
          },
          filter: ['==', 'id', '']
        })

        let opacity = 0.5
        let direction = 0.015
        
        const animatePulse = () => {
          if (!m.isStyleLoaded()) {
            requestAnimationFrame(animatePulse)
            return
          }
          opacity += direction
          if (opacity > 0.9) direction = -0.015
          if (opacity < 0.2) direction = 0.015
          
          m.setPaintProperty('hex-fill', 'fill-opacity', [
            'case',
            ['==', ['get', 'status'], 'active'],
            opacity,
            ['interpolate', ['linear'], ['get', 'dataScore'], 0, 0.1, 100, 0.7] 
          ])
          
          requestAnimationFrame(animatePulse)
        }
        
        animatePulse()

      } catch (err) {
        console.error('Failed to load hex data', err)
      }
    })

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'malama-popup'
    })

    m.on('mousemove', 'hex-fill', (e) => {
      if (!e.features || e.features.length === 0) return
      m.getCanvas().style.cursor = 'pointer'
      const feature = e.features[0]
      const props = feature.properties as any

      const html = `
        <div class="bg-malama-deep/95 backdrop-blur-xl border border-gray-700 p-4 rounded-xl shadow-2xl text-white font-sans text-sm min-w-[180px]">
          <p class="font-mono text-xs font-black text-gray-500 tracking-widest mb-3 uppercase">${props.id}</p>
          <div class="flex justify-between items-center mb-2"><span class="text-gray-400 font-semibold">Score</span><span class="font-black text-malama-teal text-lg">${props.dataScore}</span></div>
          <div class="flex justify-between items-center"><span class="text-gray-400 font-semibold">Bid</span><span class="font-black text-malama-amber text-lg">$${props.startingBid}</span></div>
        </div>
      `
      popup.setLngLat(e.lngLat).setHTML(html).addTo(m)
    })

    m.on('mouseleave', 'hex-fill', () => {
      m.getCanvas().style.cursor = ''
      popup.remove()
    })

    m.on('click', 'hex-fill', (e) => {
      if (!e.features || e.features.length === 0) return
      const feature = e.features[0]
      const props = feature.properties
      
      m.setFilter('hex-highlight', ['==', 'id', props?.id])
      setSelectedHex(props)
    })

  }, [])

  const flyToLocation = () => {
    if (!map.current) return
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        map.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 7,
          duration: 2500,
          essential: true
        })
      })
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />
      
      <div className="absolute top-8 left-8 z-10 pointer-events-none">
        <h1 className="text-4xl font-black text-white drop-shadow-2xl">Opportunity Map</h1>
        <p className="text-malama-teal font-bold uppercase tracking-widest mt-1 drop-shadow-lg text-sm">H3 Resolution 5 DePIN Topology</p>
      </div>

      <button 
        onClick={flyToLocation}
        className="absolute bottom-12 left-8 z-10 bg-malama-deep/90 hover:bg-white backdrop-blur-md border border-gray-700 text-white hover:text-malama-deep p-4 rounded-full shadow-2xl transition-all group duration-300 pointer-events-auto"
        title="Fly to my location"
      >
        <Navigation className="w-7 h-7 transition-colors fill-current" />
      </button>

      <style jsx global>{`
        .malama-popup .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .malama-popup .mapboxgl-popup-tip {
          display: none !important;
        }
      `}</style>
      
      <HexPanel 
        data={selectedHex} 
        onClose={() => {
          setSelectedHex(null)
          if (map.current) map.current.setFilter('hex-highlight', ['==', 'id', ''])
        }} 
      />
    </div>
  )
}

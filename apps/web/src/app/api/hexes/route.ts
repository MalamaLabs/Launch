import { NextResponse } from 'next/server'
import { generateHexGrid, hexToGeoJSON, calculateDataScore, calculateBasePrice } from '@/lib/h3'
import { cellToLatLng } from 'h3-js'

export async function GET() {
  const regions = [
    { lat: 43.5, lng: -112.5, radius: 100, res: 5 }, // Idaho
    { lat: 40.71, lng: -74.0, radius: 80, res: 5 },  // NYC
    { lat: 51.50, lng: -0.12, radius: 80, res: 5 },  // London
    { lat: 35.67, lng: 139.65, radius: 80, res: 5 } // Tokyo
  ]

  const allFeatures = regions.flatMap(region => {
    const hexes = generateHexGrid(region.lat, region.lng, region.radius, region.res)
    
    return hexes.map(hex => {
      const geojson = hexToGeoJSON(hex)
      const [lat, lng] = cellToLatLng(hex)
      
      const rand = Math.random()
      let status = 'available'
      if (rand > 0.7 && rand <= 0.85) status = 'reserved'
      else if (rand > 0.85 && rand <= 0.95) status = 'active'
      else if (rand > 0.95) status = 'auction'

      const dataScore = calculateDataScore(lat, lng)
      const startingBid = calculateBasePrice(lat, lng)

      Object.assign(geojson.properties as Record<string, unknown>, {
        status,
        dataScore,
        startingBid,
        activeSensors: status === 'active' ? Math.floor(Math.random() * 5) + 1 : 0,
        uptime: status === 'active' ? +(98 + Math.random() * 2).toFixed(1) : 0,
        overlap: Math.random() > 0.8
      })

      return geojson
    })
  })

  return NextResponse.json({
    type: 'FeatureCollection',
    features: allFeatures
  })
}

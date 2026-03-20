import { NextResponse } from 'next/server'
import { generateHexGrid, hexToGeoJSON, calculateDataScore } from '@/lib/h3'
import { cellToLatLng } from 'h3-js'

export async function GET() {
  const hexes = generateHexGrid(43.5, -112.5, 100, 5)
  
  const features = hexes.map(hex => {
    const geojson = hexToGeoJSON(hex)
    const [lat, lng] = cellToLatLng(hex)
    
    const rand = Math.random()
    let status = 'available'
    if (rand > 0.6 && rand <= 0.8) status = 'reserved'
    else if (rand > 0.8 && rand <= 0.95) status = 'active'
    else if (rand > 0.95) status = 'auction'

    const dataScore = calculateDataScore(lat, lng)

    geojson.properties = {
      ...geojson.properties,
      status,
      dataScore,
      startingBid: Math.floor(Math.random() * 400) + 100,
      activeSensors: status === 'active' ? Math.floor(Math.random() * 5) + 1 : 0,
      uptime: status === 'active' ? +(98 + Math.random() * 2).toFixed(1) : 0,
      overlap: Math.random() > 0.7
    }

    return geojson
  })

  return NextResponse.json({
    type: 'FeatureCollection',
    features
  })
}

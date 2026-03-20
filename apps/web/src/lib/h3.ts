import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js'

export function generateHexGrid(lat: number, lng: number, radiusKm: number, resolution: number): string[] {
  const k = Math.max(1, Math.floor(radiusKm / 8.5))
  const centerHex = latLngToCell(lat, lng, resolution)
  return gridDisk(centerHex, k)
}

export function hexToGeoJSON(h3Index: string) {
  const boundary = cellToBoundary(h3Index, true)
  if (boundary.length > 0) {
    boundary.push(boundary[0])
  }

  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [boundary]
    },
    properties: {
      id: h3Index
    }
  }
}

export function calculateDataScore(lat: number, lng: number): number {
  let score = 50 + (Math.random() * 20)
  
  if (lat >= 43 && lat <= 44 && lng <= -111 && lng >= -114) {
    score += 25 + (Math.random() * 5)
  }
  
  return Math.min(100, Math.floor(score))
}

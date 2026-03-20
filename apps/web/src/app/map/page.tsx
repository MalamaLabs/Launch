import type { Metadata } from 'next'
import HexMap from '@/components/HexMap'

export const metadata: Metadata = {
  title: 'Opportunity Map | Mālama Labs',
  description: 'Explore the global H3 grid mapping available and active Carbon hardware nodes dynamically.',
}

export default function MapPage() {
  return (
    <div className="w-full flex-grow relative h-[calc(100vh-4rem)]">
      <HexMap />
    </div>
  )
}

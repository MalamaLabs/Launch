import type { Metadata } from 'next'
import HexMap from '@/components/HexMapDynamic'

export const metadata: Metadata = {
  title: 'Opportunity Map | Mālama Labs',
  description: 'Explore the global H3 grid mapping available and active Carbon hardware nodes dynamically.',
}

export default function MapPage() {
  return (
    <main className="flex flex-col h-[calc(100vh-4rem)] bg-malama-deep overflow-hidden">
      <div className="flex-grow relative w-full h-full">
        <HexMap />
      </div>
    </main>
  )
}

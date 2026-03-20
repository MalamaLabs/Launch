'use client'

import dynamic from 'next/dynamic'

const HexMap = dynamic(() => import('./HexMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#050a14] flex items-center justify-center">
      <div className="text-malama-teal font-mono animate-pulse">Initializing Neural Topology...</div>
    </div>
  )
})

export default HexMap

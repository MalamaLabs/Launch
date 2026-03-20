import type { Metadata } from 'next'
import GenesisMint from '@/components/GenesisMint'

export const metadata: Metadata = {
  title: 'Genesis 300 Deployment | Mālama Labs',
  description: 'Join the foundational cryptographic validators mapping carbon truths sequentially resolving native dual-chain constraints.',
}

export default function PresalePage({
  searchParams,
}: {
  searchParams: { hex?: string }
}) {
  const hexId = searchParams.hex || null

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] pt-16 pb-32 px-4 relative overflow-x-hidden flex items-center">
      <div className="absolute top-1/4 -left-1/4 w-[800px] h-[800px] bg-malama-teal/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-[800px] h-[800px] bg-malama-amber/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-6xl w-full mx-auto flex flex-col items-center relative z-10 text-center">
        <div className="inline-flex items-center px-4 py-1.5 mb-8 text-xs font-black uppercase tracking-[0.2em] text-malama-amber border border-malama-amber/30 rounded-full bg-malama-amber/10 shadow-[0_0_15px_rgba(241,143,1,0.2)]">
          <span className="w-2 h-2 rounded-full bg-malama-amber animate-pulse mr-2"></span> Limited Pre-Deploy Pipeline
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white tracking-tighter mb-8 drop-shadow-xl">
          Genesis 300 <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-malama-teal to-blue-400">DePIN Validators</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-400 max-w-4xl mx-auto leading-relaxed mb-16">
          Exactly 300 autonomous physical hardware nodes securely generating the core Truth Baseline arrays locked strictly across EVM mapping boundaries permanently. Hardware runs securely deploying environmental measurements verified automatically via embedded ATECC chips.
        </p>

        <PresaleStats />

        <div className="w-full mt-10">
          <GenesisMint hexId={hexId} />
        </div>
      </div>
    </div>
  )
}

function PresaleStats() {
  return (
    <div className="grid grid-cols-2 md:inline-flex border border-gray-800 bg-malama-deep/80 backdrop-blur-md shadow-2xl rounded-3xl p-8 md:px-16 md:py-8 gap-10 md:gap-16 items-center">
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-malama-teal drop-shadow-[0_0_10px_rgba(68,187,164,0.4)]">247</span>
        <span className="text-sm tracking-[0.2em] text-gray-500 uppercase font-black mt-3">Allocated</span>
      </div>
      <div className="hidden md:block w-px h-20 bg-gradient-to-b from-transparent via-gray-700 to-transparent" />
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-white">53</span>
        <span className="text-sm tracking-[0.2em] text-gray-500 uppercase font-black mt-3">Remaining</span>
      </div>
    </div>
  )
}

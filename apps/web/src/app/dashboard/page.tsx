'use client'

import { useWallet as useCardanoWallet } from '@meshsdk/react'
import { Server, ShieldCheck, Cpu } from 'lucide-react'
import NodeStatus from '@/components/NodeStatus'

export default function DashboardPage() {
  const { connected } = useCardanoWallet()

  const ownedNodes = [
    { did: 'did:cardano:sensor:8928308280f-3' }, 
    { did: 'did:cardano:sensor:49ab30821cc-1' }  
  ]

  if (!connected) {
    return (
      <div className="w-full min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-malama-deep px-4 relative overflow-hidden text-center">
        <div className="absolute inset-0 bg-[url('/hex-pattern.svg')] opacity-5" />
        <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-malama-teal/10 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-32 h-32 bg-gray-900 border border-gray-700 rounded-full flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <ShieldCheck className="w-16 h-16 text-gray-500" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 tracking-tighter drop-shadow-xl">Global Hardware <br/><span className="text-malama-teal">Access Denied</span></h1>
          <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-2xl leading-relaxed">
            Attach your Cardano native mesh identity to securely authenticate and access terminal diagnostic views for your active hardware validation registries.
          </p>
          <div className="px-6 py-3 bg-gray-900 border border-gray-800 rounded-xl text-gray-500 font-bold uppercase tracking-widest text-sm">
            Awaiting Mesh Wallet Synchronization
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-malama-deep px-4 py-16 md:py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-malama-teal/5 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="max-w-7xl mx-auto space-y-16 relative z-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-gray-800 pb-10">
          <div>
            <h1 className="text-6xl font-black text-white mb-4 flex items-center tracking-tight drop-shadow-lg"><Server className="w-12 h-12 mr-6 text-malama-teal"/> Command Center</h1>
            <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">Supervise, authenticate, and systematically administer your physical Genesis element networks actively verifying native Cardano hashes continuously.</p>
          </div>
          <div className="mt-8 md:mt-0 flex items-center px-6 py-4 bg-malama-teal/10 border-2 border-malama-teal/40 rounded-2xl text-malama-teal font-black tracking-widest uppercase text-sm shadow-[0_0_20px_rgba(68,187,164,0.1)]">
            <Cpu className="w-5 h-5 mr-3" /> Validator Security Clearance
          </div>
        </header>

        <div className="space-y-16">
          {ownedNodes.map((n, i) => (
            <NodeStatus key={i} initialDid={n.did} />
          ))}
        </div>
      </div>
    </div>
  )
}

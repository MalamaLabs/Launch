'use client'

import { motion } from 'framer-motion'
import { Shield, TrendingUp, Leaf, Globe } from 'lucide-react'
import MetricsTicker from '@/components/MetricsTicker'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col items-center w-full">
      {/* Hero Section */}
      <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
        {/* Abstract H3 Hex pattern background */}
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hex" width="60" height="103.92" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
                <path d="M30 0l30 17.32v34.64L30 69.28 0 51.96V17.32z" fill="none" stroke="#44BBA4" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hex)" />
          </svg>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-malama-deep z-0" />
        
        <div className="z-10 text-center max-w-5xl px-4 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="flex items-center justify-center w-28 h-28 rounded-full bg-malama-teal/10 mb-8 border border-malama-teal/30 shadow-[0_0_80px_rgba(68,187,164,0.3)] relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-malama-teal/20 animate-ping opacity-50"></div>
            <Globe className="w-14 h-14 text-malama-teal relative z-10" />
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl md:text-8xl font-black tracking-tighter mb-6 text-white drop-shadow-lg"
          >
            The Environmental <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-malama-teal to-blue-400">Trust Anchor</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl leading-relaxed"
          >
            A high-assurance DePIN validating carbon truths across ATECC608A hardware, AI anomaly engines, and decentralized settlement markets securely.
          </motion.p>
          
          <MetricsTicker />
        </div>
      </section>

      {/* Features */}
      <section id="network" className="w-full py-24 bg-malama-deep relative z-10 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<Shield className="w-10 h-10 text-malama-teal" />}
            title="Trust Anchors"
            desc="Every sensor dynamically signs immutable IPFS telemetry streams utilizing native hardware ECDSA slots preventing falsification directly at the origin."
          />
          <FeatureCard 
            icon={<TrendingUp className="w-10 h-10 text-malama-amber" />}
            title="Prediction Markets"
            desc="Arbitrage truth mathematically. Challenge sensor drift by interacting with Cardano Smart Contracts natively locking LCO2 outputs pending 2-hour validations."
          />
          <FeatureCard 
            icon={<Leaf className="w-10 h-10 text-green-400" />}
            title="Carbon MRV"
            desc="Decentralized multi-layer verification yielding 1:1 emission validation bridged securely across EVM LayerZero ecosystems instantaneously."
          />
        </div>
      </section>

      {/* Genesis 300 */}
      <section className="w-full py-32 bg-malama-card border-y border-gray-800 relative z-10 px-4 overflow-hidden">
        <div className="absolute right-0 top-0 w-1/2 h-full bg-malama-teal/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute left-0 bottom-0 w-1/2 h-full bg-malama-amber/5 blur-[150px] rounded-full pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-5xl font-extrabold mb-6 text-white drop-shadow-md">Join the Genesis 300</h2>
          <p className="text-gray-400 mb-12 text-xl max-w-2xl mx-auto leading-relaxed">
            Exactly 300 hardware validators. The foundational DePIN layer mapping global carbon baselines permanently to the Cardano ledger. Exclusively capped.
          </p>
          
          <div className="flex justify-center space-x-6 mb-16">
            <CountdownBox value="14" label="Days" />
            <CountdownBox value="08" label="Hours" />
            <CountdownBox value="45" label="Mins" />
          </div>

          <button className="group relative inline-flex items-center justify-center px-10 py-5 font-bold text-white transition-all duration-300 ease-in-out bg-malama-deep border border-gray-700 rounded-full hover:bg-gray-800 hover:scale-105 hover:shadow-[0_0_40px_rgba(68,187,164,0.3)]">
            <span className="absolute inset-0 w-full h-full rounded-full border border-malama-teal/40 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"></span>
            <span className="relative z-10 text-lg tracking-wide uppercase font-black bg-clip-text text-transparent bg-gradient-to-r from-malama-teal to-blue-300">Secure Validator NFT</span>
          </button>
        </div>
      </section>

      {/* Stack */}
      <section id="stack" className="w-full py-32 bg-malama-deep relative z-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-16 text-white">Omni-Chain Validation Stack</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 opacity-80">
            {['Cardano Aiken', 'Base LayerZero', 'Apache Kafka', 'Next.js Router', 'Mapbox GL', 'Uber H3', 'Pinata IPFS', 'OPA Engine'].map((tech) => (
              <div key={tech} className="p-6 border border-gray-800 hover:border-malama-teal/50 transition-colors rounded-2xl bg-malama-card flex items-center justify-center font-bold text-lg shadow-lg">
                {tech}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="w-full py-12 border-t border-gray-800 text-center text-gray-500 z-10 bg-malama-card">
        <div className="flex justify-center space-x-8 mb-6">
          <Link href="#" className="hover:text-malama-teal transition-colors font-medium">Twitter</Link>
          <Link href="#" className="hover:text-malama-amber transition-colors font-medium">GitHub</Link>
          <Link href="#" className="hover:text-malama-teal transition-colors font-medium">Documentation</Link>
          <Link href="#" className="hover:text-malama-amber transition-colors font-medium">Network Explorer</Link>
        </div>
        <p className="text-sm">© 2026 Mālama Labs. Environmental Intelligence Core. All rights reserved.</p>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <motion.div 
      whileHover={{ y: -10, scale: 1.02 }}
      className="bg-malama-card p-10 rounded-3xl border border-gray-800 shadow-2xl transition-all duration-300"
    >
      <div className="mb-8 p-5 bg-malama-deep inline-block rounded-2xl border border-gray-800 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4 text-white leading-tight">{title}</h3>
      <p className="text-gray-400 leading-relaxed text-base">{desc}</p>
    </motion.div>
  )
}

function CountdownBox({ value, label }: { value: string, label: string }) {
  return (
    <div className="flex flex-col items-center p-6 bg-malama-deep border border-gray-800 shadow-inner rounded-3xl w-32 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-malama-teal to-blue-500"></div>
      <span className="text-4xl md:text-5xl font-mono font-black text-white drop-shadow-[0_0_10px_rgba(68,187,164,0.5)]">{value}</span>
      <span className="text-sm text-gray-400 uppercase tracking-[0.2em] mt-3 font-semibold">{label}</span>
    </div>
  )
}

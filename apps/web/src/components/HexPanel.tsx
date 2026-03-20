'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Activity, ShieldCheck, Cpu, Coins, Map, Hexagon } from 'lucide-react'
import Link from 'next/link'

interface HexData {
  id: string
  status: 'available' | 'reserved' | 'active' | 'auction'
  dataScore: number
  startingBid: number
  activeSensors: number
  uptime: number
  overlap: boolean
}

export default function HexPanel({ 
  data, 
  onClose 
}: { 
  data: HexData | null, 
  onClose: () => void 
}) {
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'available': return 'bg-malama-teal text-malama-deep'
      case 'reserved': return 'bg-gray-500 text-white'
      case 'active': return 'bg-green-500 text-white'
      case 'auction': return 'bg-malama-amber text-white'
      default: return 'bg-gray-500 text-white'
    }
  }

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 20 }}
          className="absolute top-0 right-0 w-full md:w-[450px] h-full bg-malama-deep/95 backdrop-blur-2xl border-l border-gray-800 z-40 p-8 overflow-y-auto shadow-2xl"
        >
          <button 
            onClick={onClose}
            className="absolute top-8 right-8 p-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>

          <div className="flex items-center space-x-4 mb-10">
            <Hexagon className="w-10 h-10 text-malama-teal" />
            <div>
              <h2 className="text-sm text-gray-500 font-bold uppercase tracking-widest">H3 Index</h2>
              <p className="text-2xl font-mono font-black text-white">{data.id}</p>
            </div>
          </div>

          <div className="space-y-10">
            <div>
              <span className={`px-4 py-1.5 text-xs font-black uppercase tracking-wider rounded-full ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>

            <div className="bg-malama-card p-6 rounded-2xl border border-gray-800 shadow-inner">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-gray-400 flex items-center"><Activity className="w-5 h-5 mr-3 text-malama-teal"/> Data Demand Score</span>
                <span className="text-xl font-black text-malama-teal">{data.dataScore}<span className="text-sm text-gray-600">/100</span></span>
              </div>
              <div className="w-full bg-gray-900 rounded-full h-3">
                <div className="bg-gradient-to-r from-malama-teal to-blue-500 h-3 rounded-full shadow-[0_0_10px_rgba(68,187,164,0.5)]" style={{ width: `${data.dataScore}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <MetricBox icon={<Cpu className="w-6 h-6 text-gray-500" />} label="Active Sensors" value={data.activeSensors.toString()} />
              <MetricBox icon={<ShieldCheck className="w-6 h-6 text-green-500" />} label="Avg Node Uptime" value={data.status === 'active' ? `${data.uptime}%` : 'N/A'} />
              <MetricBox icon={<Map className="w-6 h-6 text-malama-teal" />} label="Carbon Project Overlap" value={data.overlap ? 'Verified' : 'None'} />
              <MetricBox icon={<Coins className="w-6 h-6 text-malama-amber" />} label="Starting Initial Bid" value={`$${data.startingBid} USDC`} />
            </div>

            <div className="pt-8 space-y-4">
              {(data.status === 'available' || data.status === 'auction') && (
                <Link href={`/presale?hex=${data.id}`} className="block w-full py-4 px-6 bg-gradient-to-r from-malama-amber to-orange-500 text-white text-center rounded-2xl font-black text-lg shadow-[0_0_30px_rgba(241,143,1,0.3)] hover:scale-[1.03] transition-transform">
                  Claim This Hex
                </Link>
              )}
              {data.status === 'active' && (
                <button className="w-full py-4 px-6 bg-malama-teal/10 border-2 border-malama-teal text-malama-teal text-center rounded-2xl font-black text-lg hover:bg-malama-teal/20 transition-colors shadow-[0_0_20px_rgba(68,187,164,0.1)]">
                  Access Live Data Stream
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function MetricBox({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="bg-malama-card p-5 rounded-2xl border border-gray-800 flex flex-col items-center text-center shadow-lg hover:border-gray-600 transition-colors">
      <div className="mb-3">{icon}</div>
      <span className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wide">{label}</span>
      <span className="text-xl font-black text-white">{value}</span>
    </div>
  )
}

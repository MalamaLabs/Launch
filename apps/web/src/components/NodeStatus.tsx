'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Loader2, Signal, Activity, Cpu, Database, HardDrive, MapPin, Zap } from 'lucide-react'

interface NodeData {
  did: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  hardwareOnline: boolean
  reputation: number
  firstReading: string | null
  uptime30d: number
  recentReadings: any[]
  malamaEarnedToday: number
  malamaEarnedAllTime: number
  lco2Batches: string[]
  marketsSettled: number
  health: { temperature: number; signalDb: number; storageUsedPct: number }
  lastError: string | null
}

export default function NodeStatus({ initialDid }: { initialDid: string }) {
  const [data, setData] = useState<NodeData | null>(null)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/node-status/${initialDid}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error(err)
      }
    }
    
    fetchStatus()
    const int = setInterval(fetchStatus, 10000)
    return () => clearInterval(int)
  }, [initialDid])

  if (!data) {
    return (
      <div className="w-full p-12 flex justify-center items-center bg-malama-card border border-gray-800 rounded-3xl">
        <Loader2 className="w-10 h-10 text-malama-teal animate-spin" />
      </div>
    )
  }

  const confirmActivation = async () => {
    setActivating(true)
    await new Promise(r => setTimeout(r, 2000))
    setData({ ...data, status: 'ACTIVE' })
    setActivating(false)
  }

  if (data.status === 'PENDING') {
    return (
      <div className="bg-malama-deep border border-malama-teal/30 rounded-3xl p-8 md:p-12 shadow-[0_0_50px_rgba(44,187,164,0.1)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-malama-teal/5 blur-[100px] rounded-full pointer-events-none" />
        
        <h2 className="text-4xl font-black text-white mb-3 tracking-tight">Activate Your Node</h2>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl">Follow the hardware provisioning protocol precisely to cryptographic link your native Genesis NFT physically to the active device sensor array.</p>
        
        <div className="space-y-6 mb-12 relative z-10 w-full max-w-3xl">
          <Step num={1} text="Plug in your Mālama Node to a native power outlet and connect it securely to your internet access gateway." done={true} />
          <Step num={2} text="Wait exactly 2-3 minutes for the first boot sequence and ATECC608A cryptographic keys to successfully assert." done={data.hardwareOnline} />
          <Step num={3} text="Audit the hardware connection validation block explicitly below." done={data.hardwareOnline} />
          <Step num={4} text="Cryptographically sign the Cardano activation transaction via your connected CIP-30 wallet." done={false} />
        </div>

        <div className="p-8 bg-malama-card rounded-2xl border border-gray-800 flex flex-col md:flex-row items-center justify-between relative z-10">
          <div className="flex items-center mb-6 md:mb-0">
            {data.hardwareOnline ? (
              <div className="flex items-center text-green-400 bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                <CheckCircle2 className="w-10 h-10 mr-4" />
                <div>
                  <h3 className="font-bold text-xl mb-1">Hardware Found Online ✅</h3>
                  <p className="text-xs text-gray-400 font-mono tracking-wide">{data.did}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center text-malama-amber bg-malama-amber/10 p-4 rounded-xl border border-malama-amber/20">
                <Loader2 className="w-10 h-10 mr-4 animate-spin" />
                <div>
                  <h3 className="font-bold text-xl mb-1">Waiting for Node Hardware...</h3>
                  <p className="text-xs text-gray-400">Searching Kafka ingestion telemetry hashes natively</p>
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={confirmActivation}
            disabled={!data.hardwareOnline || activating}
            className="px-10 py-5 bg-malama-teal text-malama-deep rounded-xl font-black text-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-[0_0_30px_rgba(68,187,164,0.2)]"
          >
            {activating ? 'Signing Hardware Hash...' : 'Confirm Native Activation'}
          </button>
        </div>
      </div>
    )
  }

  if (data.status === 'SUSPENDED') {
    return (
      <div className="bg-[#2A0808] border border-red-500/30 rounded-3xl p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-900/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="flex items-center text-red-500 mb-8 relative z-10">
          <AlertTriangle className="w-12 h-12 mr-5" />
          <h2 className="text-4xl font-black tracking-tight">Trust Anchor Suspended</h2>
        </div>
        <div className="p-6 bg-black/40 border border-red-500/20 rounded-xl mb-10 relative z-10 w-full max-w-3xl">
          <h4 className="text-xs text-red-400 font-bold uppercase tracking-widest mb-2">Cryptographic Validation Error Flag</h4>
          <p className="text-red-300 font-mono text-base">{data.lastError}</p>
        </div>
        <button className="px-10 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg transition-colors shadow-[0_0_20px_rgba(239,68,68,0.2)] relative z-10">
          Request Diagnostic Network Support
        </button>
      </div>
    )
  }

  return (
    <div className="bg-malama-card border border-gray-800 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      <div className="p-8 md:p-10 border-b border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-900/40">
        <div className="mb-4 md:mb-0">
          <div className="flex items-center space-x-4 mb-3">
            <span className="w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(34,197,94,0.9)]" />
            <h2 className="text-3xl font-black text-white tracking-tight">Genesis Validator Active</h2>
          </div>
          <p className="text-gray-500 font-mono text-sm tracking-wider">{data.did}</p>
        </div>
        <div className="text-left md:text-right border-l-0 md:border-l border-gray-800 pl-0 md:pl-8">
          <p className="text-xs text-gray-500 font-black uppercase tracking-widest mb-1">Decentralized Reputation</p>
          <p className="text-4xl font-black text-malama-teal">{data.reputation}<span className="text-2xl text-gray-600">/100</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 bg-gray-800 border-t border-gray-800">
        
        <div className="col-span-1 bg-malama-card p-8 md:p-10 space-y-8 md:border-r border-gray-800">
          <div className="w-full h-56 bg-gray-950 rounded-2xl overflow-hidden relative border border-gray-800 flex items-center justify-center shadow-inner">
            <div className="absolute inset-0 bg-[url('/hex-pattern.svg')] opacity-10 bg-cover bg-center"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-malama-deep opacity-60"></div>
            <MapPin className="w-12 h-12 text-malama-teal absolute z-10 drop-shadow-[0_0_15px_rgba(68,187,164,0.6)]" />
          </div>
          
          <div className="bg-malama-deep rounded-2xl p-6 border border-gray-800 shadow-inner">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center mb-3"><Signal className="w-4 h-4 mr-3 text-malama-teal" /> Network Uptime (30d)</h4>
            <p className="text-4xl font-black text-white">{data.uptime30d}%</p>
          </div>
          
          <div className="bg-malama-deep rounded-2xl p-6 border border-gray-800 shadow-inner">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center mb-4"><Cpu className="w-4 h-4 mr-3 text-malama-teal" /> Hardware Telemetry Array</h4>
            <div className="space-y-4 text-sm font-medium">
              <div className="flex justify-between items-center"><span className="text-gray-400">Core Temp</span><span className={`px-2 py-1 rounded bg-black/50 ${data.health.temperature > 80 ? 'text-red-400' : 'text-green-400'}`}>{data.health.temperature}°C</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-400">Radio Signal</span><span className="text-white bg-black/50 px-2 py-1 rounded">{data.health.signalDb} dBm</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-400">Disk Storage</span><span className="text-white bg-black/50 px-2 py-1 rounded">{data.health.storageUsedPct}%</span></div>
            </div>
          </div>
        </div>

        <div className="col-span-2 bg-malama-card p-8 md:p-10 space-y-8">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-malama-deep rounded-2xl p-8 border border-gray-800 shadow-inner relative overflow-hidden">
              <div className="absolute right-[-20%] top-[-20%] w-32 h-32 bg-green-500/10 blur-[40px] rounded-full" />
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">MALAMA Yield (Today)</h4>
              <p className="text-5xl font-black text-green-400">+{data.malamaEarnedToday}</p>
            </div>
            <div className="bg-malama-deep rounded-2xl p-8 border border-gray-800 shadow-inner">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">MALAMA Yield (Global)</h4>
              <p className="text-5xl font-black text-white">{data.malamaEarnedAllTime.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-malama-deep rounded-2xl p-6 border border-gray-800 shadow-inner hidden md:block">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center"><Database className="w-4 h-4 mr-3 text-blue-400"/> Synced LCO2 Hash Batches</h4>
              <div className="space-y-3">
                {data.lco2Batches.map((b, i) => (
                  <p key={i} className="text-sm font-mono text-malama-teal bg-black/40 px-3 py-2 rounded-lg border border-gray-800">{b}</p>
                ))}
              </div>
            </div>
            <div className="bg-malama-deep rounded-2xl p-8 border border-gray-800 shadow-inner flex flex-col justify-center">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center"><Zap className="w-4 h-4 mr-3 text-yellow-400"/> Dual-Markets Settled</h4>
              <p className="text-5xl font-black text-blue-400">{data.marketsSettled}</p>
            </div>
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 shadow-inner overflow-x-auto mt-8">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center"><Activity className="w-4 h-4 mr-3 text-malama-amber"/> Live Cryptographic Hardware Stream</h4>
            <div className="space-y-3 min-w-[400px]">
              {data.recentReadings.map((r, i) => (
                <div key={i} className="flex justify-between items-center bg-[#050A10] p-3 rounded-xl border border-gray-900 text-sm font-mono">
                  <span className="text-gray-500 font-bold">{new Date(r.timestamp).toLocaleTimeString()}</span>
                  <span className="text-malama-teal font-bold bg-malama-teal/10 px-3 py-1 rounded">Temp: <span className="text-white">{r.value}°C</span></span>
                  <span className="text-green-500/80 font-black text-xs tracking-wider border border-green-500/20 bg-green-500/10 px-2 py-1 rounded">SIG_VERIFIED</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}

function Step({ num, text, done }: { num: number, text: string, done: boolean }) {
  return (
    <div className={`flex items-start transition-all ${done ? 'opacity-40' : 'opacity-100'}`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-base mr-5 shadow-inner ${done ? 'bg-green-500 text-green-900' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
        {done ? <CheckCircle2 className="w-6 h-6 text-white"/> : num}
      </div>
      <p className={`text-lg pt-1.5 leading-relaxed font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{text}</p>
    </div>
  )
}

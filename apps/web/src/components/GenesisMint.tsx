'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CardanoWallet, useWallet as useCardanoWallet } from '@meshsdk/react'
import { useAccount as useEVMWallet, useConnect as useEVMConnect, useDisconnect as useEVMDisconnect, useSendTransaction, useBalance } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseUnits } from 'viem'
import { MapPin, Search, ChevronRight, CheckCircle2, AlertCircle, ShoppingCart, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

export default function GenesisMint({ hexId }: { hexId: string | null }) {
  const [step, setStep] = useState(1)
  
  const { connected: cardanoConnected, wallet: cardanoWallet } = useCardanoWallet()
  const { address: evmAddress, isConnected: evmConnected } = useEVMWallet()
  const { connect: connectEVM } = useEVMConnect()
  const { disconnect: disconnectEVM } = useEVMDisconnect()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState<any>(null)
  
  useEffect(() => {
    if (step === 1 && cardanoConnected && evmConnected) {
      setStep(2)
    }
  }, [cardanoConnected, evmConnected, step])

  useEffect(() => {
    if (step === 2 && hexId) {
      setStep(3)
    }
  }, [hexId, step])

  const handlePayment = async () => {
    setLoading(true)
    setError('')
    try {
      if (!evmAddress || !cardanoWallet) throw new Error("Wallets not fully connected")
      
      await new Promise(r => setTimeout(r, 2000))
      
      const cardanoAddress = await cardanoWallet.getChangeAddress()
      const res = await fetch('/api/presale', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ evmAddress, cardanoAddress, hexId })
      })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || "Failed to reserve mathematically bound constraints")
      
      setSuccessData(data)
      setStep(5)
    } catch (err: any) {
      setError(err.message || "Payment bridge verification rejected")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-malama-card border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-12">
      <div className="flex border-b border-gray-800 bg-gray-900/50">
        {[1,2,3,4,5].map((s) => (
          <div key={s} className={`flex-1 h-2 transition-colors ${s <= step ? 'bg-malama-teal' : 'bg-transparent'}`} />
        ))}
      </div>

      <div className="p-8 md:p-12 min-h-[500px] relative flex flex-col justify-center">
        <AnimatePresence mode="wait">
          
          {step === 1 && (
            <motion.div key="step1" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-8">
              <h2 className="text-3xl font-black text-white flex items-center"><ShieldCheck className="mr-3 text-malama-teal w-8 h-8"/> Connect Identities</h2>
              <p className="text-gray-400 text-lg">Mālama necessitates your EVM wallet for settlement execution streams alongside your Cardano environment accepting the primary CIP-68 NFT Genesis hardware tracking receipt.</p>
              
              <div className="grid md:grid-cols-2 gap-8 mt-8">
                <div className={`p-8 border rounded-2xl flex flex-col items-center justify-center text-center space-y-5 transition-colors ${cardanoConnected ? 'bg-green-500/10 border-green-500/30' : 'bg-malama-deep border-gray-800'}`}>
                  <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center"><img src="https://cryptologos.cc/logos/cardano-ada-logo.svg?v=029" className="w-12 h-12 opacity-80" alt="Cardano"/></div>
                  <div>
                    <h3 className="font-bold text-white text-xl">Cardano Wallet</h3>
                    <p className="text-sm text-gray-500 mt-1">Accepts CIP-68 receipt NFT bounds</p>
                  </div>
                  <CardanoWallet />
                </div>
                
                <div className={`p-8 border rounded-2xl flex flex-col items-center justify-center text-center space-y-5 transition-colors ${evmConnected ? 'bg-green-500/10 border-green-500/30' : 'bg-malama-deep border-gray-800'}`}>
                  <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center"><img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-12 h-12 opacity-90" alt="EVM"/></div>
                  <div>
                    <h3 className="font-bold text-white text-xl">Base EVM Wallet</h3>
                    <p className="text-sm text-gray-500 mt-1">Bridges Base Sepolia USDC USDC allocations</p>
                  </div>
                  {evmConnected ? (
                    <button onClick={() => disconnectEVM()} className="px-8 py-3 border border-green-500/50 bg-green-500/20 text-white rounded-xl font-bold hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-400 transition-colors w-full tracking-wide">
                      {evmAddress?.slice(0,6)}...{evmAddress?.slice(-4)}
                    </button>
                  ) : (
                    <button onClick={() => connectEVM({ connector: injected() })} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black transition-colors shadow-lg hover:shadow-blue-500/20 w-full">
                      Connect Web3 Provider
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-8 h-full flex flex-col justify-center items-center text-center">
              <MapPin className="w-24 h-24 text-malama-amber mb-4 drop-shadow-[0_0_20px_rgba(241,143,1,0.4)]" />
              <h2 className="text-4xl font-black text-white">Select Registration Territory</h2>
              <p className="text-gray-400 text-xl max-w-lg">Target an exact available H3 Hexagon analytical quadrant natively on the global Opportunity Map linking hardware origins permanently.</p>
              
              {hexId ? (
                <div className="p-8 border border-malama-teal bg-malama-teal/10 rounded-2xl w-full max-w-sm mt-4">
                  <p className="text-malama-teal font-black text-3xl uppercase tracking-widest">{hexId}</p>
                </div>
              ) : (
                <Link href="/map" className="mt-10 px-10 py-5 bg-malama-amber text-malama-deep font-black text-xl rounded-full hover:scale-105 transition-transform flex items-center shadow-[0_0_40px_rgba(241,143,1,0.4)]">
                  <Search className="mr-3 w-6 h-6" /> Open Opportunity Matrix
                </Link>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-8">
              <h2 className="text-3xl font-black text-white flex items-center"><ShoppingCart className="mr-3 text-malama-teal w-8 h-8"/> Secure Ledger Review</h2>
              
              <div className="bg-malama-deep rounded-2xl border border-gray-800 overflow-hidden text-lg shadow-inner">
                <div className="p-8 border-b border-gray-800 flex justify-between items-center text-gray-300">
                  <span className="font-semibold">Genesis Node Hardware Extractor Kit</span>
                  <span className="font-mono text-white font-bold">$1,200 USDC</span>
                </div>
                <div className="p-8 border-b border-gray-800 flex justify-between items-center text-gray-300">
                  <span className="font-semibold">Genesis Ecosystem NFT Vault (Rights)</span>
                  <span className="font-mono text-white font-bold">$300 USDC</span>
                </div>
                <div className="p-8 bg-gray-900/80 flex justify-between items-center">
                  <span className="font-black text-white text-2xl">Total Commitment Due</span>
                  <span className="font-mono font-black text-malama-teal text-3xl drop-shadow-[0_0_10px_rgba(68,187,164,0.3)]">$1,500 USDC</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pb-6">
                <div className="p-6 border border-gray-800 rounded-2xl bg-malama-deep flex flex-col justify-center">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Base Emission Rewards</h4>
                  <p className="text-3xl font-black text-green-400 mt-2">2,400 <span className="text-base text-green-600 font-bold">MALAMA/mo</span></p>
                </div>
                <div className="p-6 border border-gray-800 rounded-2xl bg-malama-deep flex flex-col justify-center">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Hardware Target</h4>
                  <p className="text-2xl font-bold text-white mt-2">3-4 Weeks</p>
                </div>
              </div>

              <button onClick={() => setStep(4)} className="w-full py-6 bg-malama-teal text-malama-deep rounded-2xl font-black text-2xl hover:scale-[1.02] transition-transform shadow-[0_0_30px_rgba(68,187,164,0.3)]">
                Proceed to Native Web3 Payment <ChevronRight className="inline w-8 h-8 ml-1" />
              </button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-8 flex flex-col items-center justify-center text-center h-full">
              <div className="w-32 h-32 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                <img src="https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=029" className="w-16 h-16" alt="USDC" />
              </div>
              
              <h2 className="text-5xl font-black text-white tracking-tight">Execute Payment</h2>
              <p className="text-xl text-gray-400 max-w-md leading-relaxed">Awaiting cryptographic signature releasing exactly $1,500 USDC onto the Base Sepolia validator engine.</p>

              {error && (
                <div className="p-5 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 flex items-center mt-4 w-full max-w-lg font-bold">
                  <AlertCircle className="mr-3 w-6 h-6 flex-shrink-0" /> {error}
                </div>
              )}

              <button 
                onClick={handlePayment} 
                disabled={loading}
                className="w-full max-w-lg mt-10 py-6 bg-blue-600 text-white rounded-2xl font-black text-2xl hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_40px_rgba(37,99,235,0.4)]"
              >
                {loading ? "Confirming on EVM..." : "Approve Inside Provider"}
              </button>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} className="space-y-8 flex flex-col items-center text-center pt-10">
              <CheckCircle2 className="w-40 h-40 text-malama-teal mb-6 drop-shadow-[0_0_40px_rgba(68,187,164,0.5)]" />
              <h2 className="text-6xl font-black text-white tracking-tighter">Genesis <span className="text-malama-teal">#{successData?.genesisNumber}</span> Secured</h2>
              <p className="text-2xl text-gray-400 max-w-2xl leading-relaxed mt-4">Your hardware node is queued! The CIP-68 Identity Receipt is executing securely directly to your native Cardano Nami structures.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-12">
                <a href="#" className="w-full py-5 bg-malama-deep border border-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-800 hover:text-white transition-colors text-lg">
                  Track Hardware Batch
                </a>
                <a href="#" className="w-full py-5 bg-[#5865F2] text-white rounded-xl font-bold hover:bg-[#4752C4] transition-colors text-lg shadow-[0_0_20px_rgba(88,101,242,0.3)]">
                  Enter Secure Discord
                </a>
                <Link href="/map" className="w-full py-5 sm:col-span-2 bg-malama-teal text-malama-deep rounded-xl font-black text-xl hover:scale-[1.02] transition-transform shadow-[0_0_30px_rgba(68,187,164,0.2)]">
                  Return To Terminal Dashboard
                </Link>
              </div>
            </motion.div>
          )}
          
        </AnimatePresence>
      </div>
    </div>
  )
}

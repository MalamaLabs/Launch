'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWallet as useCardanoWallet } from '@meshsdk/react'
import {
  useAccount as useEVMWallet,
  useConnect as useEVMConnect,
  useDisconnect as useEVMDisconnect,
  useWriteContract,
  usePublicClient,
} from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseAbi, parseUnits, decodeEventLog } from 'viem'
import {
  MapPin, ShoppingCart, Wallet, Globe,
  ChevronRight, CheckCircle2, AlertCircle, ExternalLink, Copy,
  CreditCard,
} from 'lucide-react'
import Link from 'next/link'
import regionsData from '@/data/regions.json'
import { getGenesisPoolSlot } from '@/lib/genesis-hexes'
import {
  reserveHexOnChain,
  reportMintObserved,
  createStripeCheckout,
  prepareCardanoMintTx,
  confirmCardanoMintTx,
  nftImageUrl,
} from '@/lib/api'

type PaymentLane = 'base' | 'cardano' | 'stripe'
import {
  PurchaseLegalAcknowledgement,
  LegalMintReminder,
  initialLegalAck,
  allLegalAcknowledged,
} from '@/components/legal/PurchaseLegalAcknowledgement'

// ─── Contract addresses ───────────────────────────────────────────────────────
const GENESIS_CONTRACT_FALLBACK = (process.env.NEXT_PUBLIC_GENESIS_CONTRACT_ADDRESS ?? '0x2222222222222222222222222222222222222222') as `0x${string}`
const USDC_CONTRACT_FALLBACK    = (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS         ?? '0x1111111111111111111111111111111111111111') as `0x${string}`

const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) public returns (bool)',
])
const MHNL_ABI = parseAbi([
  'function secureNode(string calldata hexId) external',
  'event NodeSecured(address indexed operator, uint256 indexed tokenId, string hexId)',
])

interface SuccessData {
  claimId: string; editionNumber: number; evmTokenId?: number; contractAddress?: `0x${string}`;
  txHash: string; chain: 'base' | 'cardano'; explorerUrl: string; nftImageUrl: string;
  openSeaUrl?: string; cnftUrl?: string; tokenName?: string; simulated?: boolean;
}

const shortHash = (h: string) => `${h.slice(0, 8)}...${h.slice(-6)}`

function NftCard({ data, hexId }: { data: SuccessData; hexId: string | null }) {
  return (
    <div className="relative w-56 h-80 mx-auto rounded-2xl overflow-hidden border border-malama-accent/30 shadow-[0_0_40px_rgba(196,240,97,0.2)]">
      <img src={data.nftImageUrl} alt={`NFT ${data.claimId}`} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-3 left-3 right-3">
        <p className="text-malama-accent font-black text-2xl">{data.claimId}</p>
        <p className="text-gray-300 text-xs font-mono truncate">{hexId}</p>
      </div>
    </div>
  )
}

export default function GenesisMint({ hexId }: { hexId: string | null }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading]       = useState(false)
  const [evmTxStatus, setEvmTxStatus] = useState<'' | 'claiming' | 'approving' | 'minting'>('')
  const [error, setError]           = useState('')
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [copied, setCopied]         = useState(false)
  const [legalAck, setLegalAck]     = useState(initialLegalAck)
  const [paymentMode, setPaymentMode] = useState<PaymentLane>('base')
  const [cardEmail, setCardEmail]   = useState('')
  const [mmImportOpen, setMmImportOpen] = useState(false)
  const [mmCopied, setMmCopied]     = useState<'address' | 'tokenId' | null>(null)

  const legalComplete = allLegalAcknowledged(legalAck)
  const cardEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cardEmail.trim())

  // ── Cardano Wallet Logic (Restored) ──────────────────────────────────────
  const { connected: cardanoConnected, wallet: cardanoWallet, name: cardanoWalletName, connect: connectCardano } = useCardanoWallet()
  const [cardanoWallets, setCardanoWallets] = useState<{ name: string; icon: string }[]>([])
  const [showCardanoPicker, setShowCardanoPicker] = useState(false)
  const [cardanoError, setCardanoError] = useState<string | null>(null)
  const [cardanoCip30Api, setCardanoCip30Api] = useState<{
    getChangeAddress: () => Promise<string>
    signData: (address: string, payload: string) => Promise<{ signature: string; key: string }>
  } | null>(null)

  const { address: evmAddress, isConnected: evmConnected } = useEVMWallet()
  const { connect: connectEVM }    = useEVMConnect()
  const { disconnect: disconnectEVM } = useEVMDisconnect()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const cardanoReady = cardanoConnected || !!cardanoCip30Api
  const isSetupComplete = !!hexId && (
    paymentMode === 'base' ? evmConnected :
    paymentMode === 'cardano' ? cardanoConnected :
    evmConnected && cardEmailOk
  )

  const syncNodeToMap = (id: string | null) => {
    if (!id) return
    const prev = JSON.parse(localStorage.getItem('malamalabs_purchased_nodes') ?? '[]')
    if (!prev.includes(id)) localStorage.setItem('malamalabs_purchased_nodes', JSON.stringify([...prev, id]))
  }

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const connectCardanoWallet = async (walletKey: string) => {
    setCardanoError(null)
    const win = window as any
    const provider = win.cardano?.[walletKey]
    if (!provider) return
    try {
      const api = await provider.enable()
      setCardanoCip30Api(api)
      await connectCardano(walletKey).catch(() => {})
    } catch (err) { setCardanoError('Connect failed') }
  }

  const addToMetaMask = async (evmTokenId: number) => {
    const eth = (window as any).ethereum
    setMmImportOpen(true)
    if (!eth) return
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] })
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC721',
          options: { address: successData?.contractAddress ?? GENESIS_CONTRACT_FALLBACK, tokenId: String(evmTokenId) },
        },
      })
    } catch (e) { console.warn(e) }
  }

  // ── Base Payment (Fixed with Auto-Fill Logic) ───────────────────────────
  const handleBasePayment = async () => {
    if (!publicClient || !evmAddress || !hexId) throw new Error('Wallet not ready')

    const eth = (window as any).ethereum
    if (eth) {
      const chainId: string = await eth.request({ method: 'eth_chainId' })
      if (chainId !== '0x14a34') {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] })
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    setEvmTxStatus('claiming')
    const intent = await reserveHexOnChain(hexId, evmAddress)
    const GENESIS_CONTRACT = intent.contract ?? GENESIS_CONTRACT_FALLBACK
    const USDC_CONTRACT    = intent.usdcAddress ?? USDC_CONTRACT_FALLBACK
    const priceRaw         = BigInt(intent.priceRaw)
    const editionNumber    = getGenesisPoolSlot(hexId, regionsData) ?? 0
    const claimId          = `G200-${String(editionNumber).padStart(3, '0')}`

    setEvmTxStatus('approving')
    const approveHash = await writeContractAsync({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [GENESIS_CONTRACT, priceRaw],
      account: evmAddress,
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    setEvmTxStatus('minting')
    const mintHash = await writeContractAsync({
      address: GENESIS_CONTRACT,
      abi: MHNL_ABI,
      functionName: 'secureNode',
      args: [hexId],
      account: evmAddress,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash })

    let evmTokenId = editionNumber
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MHNL_ABI, ...log })
        if (decoded.eventName === 'NodeSecured') evmTokenId = Number((decoded.args as any).tokenId)
      } catch {}
    }

    await reportMintObserved({ hexId, txHash: mintHash, cardanoAddress: undefined }).catch(() => null)
    syncNodeToMap(hexId)

    const explorerHost = intent.network === 'mainnet' ? 'basescan.org' : 'sepolia.basescan.org'
    return {
      claimId, editionNumber, evmTokenId, contractAddress: GENESIS_CONTRACT,
      txHash: mintHash, chain: 'base' as const,
      explorerUrl: `https://${explorerHost}/tx/${mintHash}`,
      nftImageUrl: nftImageUrl({ hexId, tokenId: evmTokenId, chain: 'base', claimId }),
    }
  }

  // ── Cardano Payment (Restored Atomic Logic) ─────────────────────────────
  const handleCardanoPayment = async () => {
    if (!hexId || !cardanoWallet) throw new Error('Connect Cardano wallet first')
    setEvmTxStatus('claiming')
    const buyerAddr = await cardanoWallet.getChangeAddress()
    const prepared = await prepareCardanoMintTx({ hexId, buyerAddress: buyerAddr })
    
    setEvmTxStatus('approving')
    const sodium = (await import('libsodium-wrappers-sumo')).default
    await sodium.ready
    const fullySignedCbor = await cardanoWallet.signTx(prepared.txCbor, true)
    const txHash = await cardanoWallet.submitTx(fullySignedCbor)

    setEvmTxStatus('minting')
    await confirmCardanoMintTx({ purchaseId: prepared.purchaseId, txHash }).catch(() => {})
    
    syncNodeToMap(hexId)
    const explorerUrl = prepared.network === 'mainnet' ? `https://cardanoscan.io/tx/${txHash}` : `https://preprod.cardanoscan.io/tx/${txHash}`

    return {
      claimId: `G200-${String(getGenesisPoolSlot(hexId, regionsData)).padStart(3, '0')}`,
      editionNumber: 0, txHash, chain: 'cardano' as const, explorerUrl, cnftUrl: explorerUrl,
      nftImageUrl: nftImageUrl({ hexId, chain: 'cardano', claimId: 'G200' }),
    }
  }

  const handlePayment = async () => {
    setLoading(true); setError('')
    try {
      const result = paymentMode === 'cardano' ? await handleCardanoPayment() : await handleBasePayment()
      setSuccessData(result); setStep(5)
    } catch (err: any) { setError(err.message || 'Payment failed') } finally { setLoading(false); setEvmTxStatus('') }
  }

  const submitLabel = () => {
    if (!loading) return `Confirm & Mint on ${paymentMode === 'base' ? 'Base' : 'Cardano'}`
    return `${evmTxStatus}...`
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-malama-card border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-12">
      <div className="flex border-b border-gray-800 bg-gray-900/50">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`flex-1 h-2 transition-colors duration-300 ${s <= step ? 'bg-malama-accent' : 'bg-transparent'}`} />
        ))}
      </div>

      <div className="p-8 md:p-12 min-h-[500px] relative flex flex-col justify-center text-left">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" className="space-y-8">
              <h2 className="text-4xl font-black text-white flex items-center gap-2"><MapPin className="text-malama-accent" /> Locate your HEX</h2>
              <div className="p-8 border border-gray-800 bg-malama-deep rounded-2xl text-center">
                <p className="font-mono text-amber-400">{hexId ?? 'None Selected'}</p>
              </div>
              <button onClick={() => setStep(2)} disabled={!hexId} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl">Continue</button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" className="space-y-8">
              <div className="mx-auto mb-8 grid grid-cols-3 gap-3">
                {(['base', 'cardano', 'stripe'] as const).map(lane => (
                  <button key={lane} onClick={() => setPaymentMode(lane)} className={`py-4 rounded-xl border font-black uppercase text-xs ${paymentMode === lane ? 'border-malama-accent text-malama-accent bg-malama-accent/10' : 'border-gray-800 text-gray-500'}`}>{lane}</button>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Cardano Wallet Card (Restored) */}
                <div className={`p-6 border rounded-2xl text-center space-y-4 ${cardanoConnected ? 'border-malama-accent bg-malama-accent/10' : 'border-gray-800'}`}>
                  <Wallet className={`mx-auto w-10 h-10 ${cardanoConnected ? 'text-malama-accent' : 'text-gray-600'}`} />
                  <h3 className="text-xs font-black text-white uppercase">Cardano Wallet</h3>
                  <button
                    onClick={() => {
                      const win = window as any;
                      const detected = Object.entries(win.cardano || {}).map(([key, w]: any) => ({ name: key, icon: w.icon }));
                      setCardanoWallets(detected); setShowCardanoPicker(true);
                    }}
                    className="w-full py-2 bg-malama-accent/10 text-malama-accent rounded-lg text-xs font-bold"
                  >
                    {cardanoConnected ? cardanoWalletName?.toUpperCase() : 'Connect Lace / Eternl'}
                  </button>
                  {showCardanoPicker && (
                    <div className="absolute bg-gray-900 border border-gray-700 rounded-xl overflow-hidden z-50">
                      {cardanoWallets.map(w => (
                        <button key={w.name} onClick={() => { setShowCardanoPicker(false); connectCardanoWallet(w.name); }} className="flex items-center gap-2 p-3 hover:bg-gray-800 w-full text-white text-xs font-bold uppercase">
                          <img src={w.icon} className="w-4 h-4" /> {w.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Base Wallet Card */}
                <div className={`p-6 border rounded-2xl text-center space-y-4 ${evmConnected ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800'}`}>
                  <Globe className={`mx-auto w-10 h-10 ${evmConnected ? 'text-blue-400' : 'text-gray-600'}`} />
                  <h3 className="text-xs font-black text-white uppercase">Base L2 Wallet</h3>
                  <button onClick={() => connectEVM({ connector: injected() })} className="w-full py-2 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold">
                    {evmConnected ? evmAddress?.slice(0, 6) + '...' : 'Connect MetaMask'}
                  </button>
                </div>
              </div>
              <button onClick={() => setStep(3)} disabled={!isSetupComplete} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl disabled:opacity-50">Review Order</button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" className="space-y-8">
              <h2 className="text-3xl font-black text-white">Review Order</h2>
              <div className="p-6 bg-malama-deep border border-gray-800 rounded-2xl">
                <p className="text-white font-bold">Genesis Node License</p>
                <p className="text-malama-accent text-2xl font-black mt-1">$2,000 {paymentMode === 'stripe' ? 'USD' : 'USDC'}</p>
              </div>
              <PurchaseLegalAcknowledgement value={legalAck} onChange={setLegalAck} />
              <button onClick={() => setStep(4)} disabled={!legalComplete} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl">Confirm & Pay</button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" className="space-y-8 text-center">
              {error && <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl">{error}</div>}
              <h2 className="text-4xl font-black text-white uppercase">{paymentMode} Payment</h2>
              <button onClick={handlePayment} disabled={loading} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl">
                {submitLabel()}
              </button>
            </motion.div>
          )}

          {step === 5 && successData && (
            <motion.div key="step5" className="text-center space-y-8">
              <CheckCircle2 className="w-20 h-20 text-malama-accent mx-auto" />
              <h2 className="text-5xl font-black text-white">{successData.claimId}</h2>
              <NftCard data={successData} hexId={hexId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
'use client'

import React, { useState, useEffect } from 'react'
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
  CreditCard, MessageCircle,
} from 'lucide-react'
import Link from 'next/link'
import regionsData from '@/data/regions.json'
import { getGenesisPoolSlot } from '@/lib/genesis-hexes'
import {
  API_BASE,
  EXPLORER_BASE,
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
import { useMagic } from '@/components/magic/MagicProvider'

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
  /** Dagwelldev explorer URL — only set for Cardano txs (queries local db-sync). */
  dagwelldevExplorerUrl?: string;
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
  const [stripeDeliveryAddress, setStripeDeliveryAddress] = useState('')
  const [mmImportOpen, setMmImportOpen] = useState(false)
  const [mmCopied, setMmCopied]     = useState<'address' | 'tokenId' | null>(null)
  // IPFS URL returned from cardano/prepare-tx — baked into the on-chain datum,
  // so showing it in the success card means the buyer sees exactly what their wallet renders.
  const [pendingNftImageUrl, setPendingNftImageUrl] = useState<string | null>(null)

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
  const { magic } = useMagic()

  // For Stripe: use the manually typed address, or fall back to connected MetaMask address.
  // MetaMask connection is NOT required — a pasted Base address is sufficient.
  const stripeEvmAddr = (stripeDeliveryAddress.trim() || evmAddress || '') as string
  const stripeEvmOk   = /^0x[0-9a-fA-F]{40}$/.test(stripeEvmAddr)
  const { connect: connectEVM }    = useEVMConnect()
  const { disconnect: disconnectEVM } = useEVMDisconnect()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const cardanoReady = cardanoConnected || !!cardanoCip30Api

  // ── Auto-reconnect the last-used Cardano wallet on fresh page load ────────
  // LACE (and other CIP-30 wallets) register their connector by origin.  If the
  // user previously authorized this origin, provider.enable() returns silently
  // without a popup — giving us back the CIP-30 API and letting the Mesh SDK
  // reconnect so `cardanoWallet` is populated when the buyer hits "Mint".
  // Without this, every fresh session requires a manual re-click.
  useEffect(() => {
    const lastWallet = localStorage.getItem('malama_last_cardano_wallet')
    if (!lastWallet || cardanoConnected) return
    const win = window as any
    const provider = win.cardano?.[lastWallet]
    if (!provider) return
    provider.enable()
      .then((api: any) => {
        setCardanoCip30Api(api)
        // Re-connect via Mesh SDK so cardanoWallet (used for signTx/submitTx) is live.
        connectCardano(lastWallet).catch(() => {/* no-op if wallet rejects */})
      })
      .catch(() => {/* wallet not yet authorized for this origin — wait for manual click */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount only
  const isSetupComplete = !!hexId && (
    paymentMode === 'base'    ? evmConnected :
    // cardanoReady = Mesh SDK connected OR raw CIP-30 API available.
    // Either gives us enough to sign/submit the mint tx.
    paymentMode === 'cardano' ? cardanoReady :
    // Stripe: only a valid email is required. Delivery address is optional —
    // the backend will hold the NFT in custody when none is provided.
    cardEmailOk
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
      // Persist so the auto-reconnect useEffect can silently re-enable on next visit.
      localStorage.setItem('malama_last_cardano_wallet', walletKey)
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
      const currentChain: string = await eth.request({ method: 'eth_chainId' })
      if (currentChain !== '0x14a34') {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x14a34' }] })
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x14a34',
                chainName: 'Base Sepolia',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia.basescan.org'],
              }],
            })
          } else {
            throw new Error('Please switch to Base Sepolia in your wallet')
          }
        }
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
    let approveHash: `0x${string}`
    try {
      approveHash = await writeContractAsync({
        address: USDC_CONTRACT,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [GENESIS_CONTRACT, priceRaw],
      })
    } catch (e: any) {
      throw new Error('USDC approval rejected — please approve in your wallet')
    }
    // Wait for approve receipt — timeout after 12s and proceed anyway.
    // Base Sepolia blocks every ~2s so 12s = 6 confirmations of headroom.
    // The NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL Alchemy transport normally resolves
    // this in ~10s; the timeout is just a safety net if the RPC is slow.
    await Promise.race([
      publicClient.waitForTransactionReceipt({ hash: approveHash }),
      new Promise<void>(resolve => setTimeout(resolve, 12_000)),
    ])

    setEvmTxStatus('minting')
    let mintHash: `0x${string}`
    try {
      mintHash = await writeContractAsync({
        address: GENESIS_CONTRACT,
        abi: MHNL_ABI,
        functionName: 'secureNode',
        args: [hexId],
      })
    } catch (e: any) {
      throw new Error('Mint transaction rejected or hex already taken on-chain')
    }
    // Same pattern for the mint receipt — timeout after 60s and still show success
    // since the txHash is on-chain and the user can verify on the block explorer.
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null
    try {
      receipt = await Promise.race([
        publicClient.waitForTransactionReceipt({ hash: mintHash }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
      ])
    } catch {
      // RPC timed out — tx is submitted, proceed to success with txHash
    }

    let evmTokenId = editionNumber
    for (const log of receipt?.logs ?? []) {
      try {
        const decoded = decodeEventLog({ abi: MHNL_ABI, ...log })
        if (decoded.eventName === 'NodeSecured') evmTokenId = Number((decoded.args as any).tokenId)
      } catch {}
    }

    // Capture the mirror response — backend mints the Cardano ref token inline
    // and returns cardano.txHash + cardano.explorerUrl in the same response.
    let cardanoMirror: { txHash?: string; explorerUrl?: string } = {}
    try {
      const mirrorRes = await reportMintObserved({ hexId, txHash: mintHash })
      cardanoMirror = mirrorRes.cardano ?? {}
    } catch {
      // Non-blocking — Base NFT is already minted on-chain; Cardano mirror will
      // be retried by the backend on the next poll, or visible on the detail page.
    }
    syncNodeToMap(hexId)

    const explorerHost = intent.network === 'mainnet' ? 'basescan.org' : 'sepolia.basescan.org'
    const dagwelldevExplorerUrl = cardanoMirror.txHash
      ? `${EXPLORER_BASE}/explorer/${cardanoMirror.explorerUrl?.includes('preprod') ? 'preprod' : 'mainnet'}/tx/${cardanoMirror.txHash}`
      : undefined

    return {
      claimId, editionNumber, evmTokenId, contractAddress: GENESIS_CONTRACT,
      txHash: mintHash, chain: 'base' as const,
      explorerUrl: `https://${explorerHost}/tx/${mintHash}`,
      dagwelldevExplorerUrl,
      nftImageUrl: nftImageUrl({ hexId, tokenId: evmTokenId, chain: 'base', claimId }),
    }
  }

  // ── Cardano Payment (Restored Atomic Logic) ─────────────────────────────
  const handleCardanoPayment = async () => {
    if (!hexId || !cardanoWallet) throw new Error('Connect Cardano wallet first')
    setEvmTxStatus('claiming')
    const buyerAddr = await cardanoWallet.getChangeAddress()
    const prepared = await prepareCardanoMintTx({ hexId, buyerAddress: buyerAddr })

    // Capture the IPFS URL the backend pinned into the datum — this is what the
    // buyer's wallet will render, so we show the same image on the success card.
    const mintImageUrl = prepared.nftImageUrl ?? null
    if (mintImageUrl) setPendingNftImageUrl(mintImageUrl)

    setEvmTxStatus('approving')
    const sodium = (await import('libsodium-wrappers-sumo')).default
    await sodium.ready
    const fullySignedCbor = await cardanoWallet.signTx(prepared.txCbor, true)
    const txHash = await cardanoWallet.submitTx(fullySignedCbor)

    setEvmTxStatus('minting')
    await confirmCardanoMintTx({ purchaseId: prepared.purchaseId, txHash }).catch(() => {})

    syncNodeToMap(hexId)
    const cardanoNet = prepared.network === 'mainnet' ? 'mainnet' : 'preprod'
    const explorerUrl = cardanoNet === 'mainnet' ? `https://cardanoscan.io/tx/${txHash}` : `https://preprod.cardanoscan.io/tx/${txHash}`
    const dagwelldevExplorerUrl = `${EXPLORER_BASE}/explorer/${cardanoNet}/tx/${txHash}`
    const editionNum = getGenesisPoolSlot(hexId, regionsData) ?? 0
    const claimId = `G200-${String(editionNum).padStart(3, '0')}`

    return {
      claimId,
      editionNumber: editionNum,
      txHash,
      chain: 'cardano' as const,
      explorerUrl,
      cnftUrl: explorerUrl,
      dagwelldevExplorerUrl,
      // Prefer the IPFS URL from the prepare response — byte-identical to what the
      // wallet renders.  Fall back to the API endpoint if Pinata was unreachable.
      nftImageUrl: mintImageUrl ?? nftImageUrl({ hexId, chain: 'cardano', claimId }),
    }
  }

  // ── Stripe Payment ──────────────────────────────────────────────────────
  const handleStripePayment = async () => {
    if (!hexId) throw new Error('No hex selected')
    if (!cardEmailOk) throw new Error('Enter a valid email address')

    const origin = window.location.origin

    // Resolve delivery address: connected Cardano → Cardano chain.
    // Connected/typed EVM → Base chain. Neither → try Magic OTP.
    let deliveryEvm: string | undefined = stripeEvmOk ? stripeEvmAddr : undefined
    const deliveryCardano = cardanoConnected
      ? await cardanoWallet?.getChangeAddress().catch(() => undefined)
      : undefined

    // No wallet connected and no address typed → prompt Magic Email OTP
    // so the buyer gets an embedded Base wallet without needing MetaMask.
    // If Magic isn't configured or the buyer dismisses the modal, fall
    // through to bank-wallet custody (same behaviour as before this patch).
    let usedMagic = false
    if (!deliveryEvm && !deliveryCardano && magic) {
      try {
        await magic.auth.loginWithEmailOTP({ email: cardEmail.trim() })
        const info = await magic.user.getInfo() as { publicAddress?: string | null }
        if (info.publicAddress) {
          deliveryEvm = info.publicAddress
          usedMagic = true
        }
      } catch {
        // User dismissed OTP modal or Magic errored — continue custodial
      }
    }

    const intent = await createStripeCheckout(
      hexId,
      deliveryEvm,
      cardEmail.trim(),
      {
        successUrl: `${origin}/presale/card-complete?session_id={CHECKOUT_SESSION_ID}&hex=${encodeURIComponent(hexId)}${usedMagic ? '&magic=1' : ''}`,
        cancelUrl:  `${origin}/presale?stripe=cancel&hex=${encodeURIComponent(hexId)}`,
      },
      deliveryCardano,
    )
    if (!intent.url) throw new Error('Stripe session creation failed')
    window.location.href = intent.url
    return null
  }

  const handlePayment = async () => {
    setLoading(true); setError('')
    try {
      if (paymentMode === 'stripe') {
        await handleStripePayment()
        // handleStripePayment redirects to Stripe — execution stops here
        return
      }
      const result = paymentMode === 'cardano' ? await handleCardanoPayment() : await handleBasePayment()
      setSuccessData(result); setStep(5)
    } catch (err: any) { setError(err.message || 'Payment failed') } finally { setLoading(false); setEvmTxStatus('') }
  }

  const submitLabel = () => {
    if (loading) return `${evmTxStatus || 'Processing'}...`
    if (paymentMode === 'stripe')  return 'Pay with Card →'
    if (paymentMode === 'cardano') return 'Confirm & Mint on Cardano'
    return 'Confirm & Mint on Base'
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
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="mb-10 text-center">
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-malama-accent">Step 1</p>
                <h2 className="flex flex-wrap items-center justify-center gap-2 text-4xl font-black text-white">
                  <MapPin className="h-10 w-10 shrink-0 text-malama-accent" />
                  Locate your HEX
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-400">
                  Choose one of the 200 Genesis hex territories on the live map. You need a hex selected before you can pay with crypto or card.
                </p>
              </div>

              <div className={`mx-auto grid max-w-xl gap-4 rounded-2xl border p-8 text-center transition-all ${hexId ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-800 bg-malama-deep'}`}>
                <div className="flex justify-center">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full ${hexId ? 'bg-amber-500/20' : 'bg-gray-800'}`}>
                    <MapPin className={`h-8 w-8 ${hexId ? 'text-amber-400' : 'text-gray-500'}`} />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Selected hex</h3>
                  <p className={`mt-2 break-all font-mono text-sm ${hexId ? 'text-amber-400' : 'text-gray-500'}`}>
                    {hexId ?? 'None yet — open the map to pick a territory'}
                  </p>
                </div>
                <Link
                  href="/map"
                  className={`flex w-full items-center justify-center rounded-xl px-4 py-3 text-xs font-black transition-all ${
                    hexId
                      ? 'border border-amber-500/50 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      : 'bg-amber-500 text-black shadow-lg hover:scale-[1.02]'
                  }`}
                >
                  {hexId ? 'Change hex on map →' : 'Open map to choose hex →'}
                </Link>
              </div>

              <div className="flex flex-col items-center pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!hexId}
                  className={`w-full max-w-lg rounded-2xl py-5 text-xl font-black shadow-xl transition-all ${
                    hexId
                      ? 'bg-malama-accent text-black shadow-malama-accent/30 hover:scale-[1.02]'
                      : 'cursor-not-allowed bg-gray-800 text-gray-600 opacity-50'
                  }`}
                >
                  Continue
                </button>
              </div>
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
              {paymentMode === 'stripe' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Email for receipt *</p>
                    <input
                      type="email"
                      value={cardEmail}
                      onChange={e => setCardEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-gray-700 bg-malama-deep px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-malama-accent focus:outline-none"
                    />
                  </div>

                  {/* Delivery address — optional */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      NFT delivery address <span className="text-gray-600 normal-case font-normal">(optional)</span>
                    </p>

                    {/* Show Cardano wallet if connected */}
                    {cardanoConnected && (
                      <div className="flex items-center gap-3 rounded-xl border border-malama-accent/30 bg-malama-accent/5 px-4 py-3">
                        <span className="text-malama-accent text-lg">₳</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-malama-accent uppercase tracking-wider">Cardano wallet connected</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">NFT will mint as CIP-68 to your {cardanoWalletName} wallet</p>
                        </div>
                      </div>
                    )}

                    {/* EVM address input */}
                    <input
                      type="text"
                      value={stripeDeliveryAddress}
                      onChange={e => setStripeDeliveryAddress(e.target.value)}
                      placeholder={evmAddress ?? '0x… Base wallet address'}
                      className="w-full rounded-xl border border-gray-700 bg-malama-deep px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-malama-accent focus:outline-none font-mono"
                    />

                    {/* Status hint */}
                    {cardanoConnected ? (
                      <p className="text-[11px] text-gray-500">
                        Leave blank to use your Cardano wallet above. Paste a Base address to override and mint on Base instead.
                      </p>
                    ) : stripeEvmOk ? (
                      <p className="text-[11px] text-malama-accent">
                        ✓ NFT mints on Base to {stripeEvmAddr.slice(0, 8)}…{stripeEvmAddr.slice(-6)}
                      </p>
                    ) : evmConnected ? (
                      <p className="text-[11px] text-malama-accent">
                        Using connected wallet: {evmAddress?.slice(0, 8)}…{evmAddress?.slice(-6)}
                      </p>
                    ) : magic ? (
                      <p className="text-[11px] text-gray-500">
                        Paste a Base address, or leave blank — we'll create a free wallet for your email when you click Pay.
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-500">
                        Paste a Base wallet address to receive the NFT directly. Leave blank and we'll hold it in custody — you can claim it later.
                      </p>
                    )}
                  </div>
                </div>
              )}
              <button onClick={() => setStep(3)} disabled={!isSetupComplete} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl disabled:opacity-50">Review Order</button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" className="space-y-8">
              <h2 className="text-3xl font-black text-white">Review Order</h2>

              {/* ── NFT preview + order summary ─────────────────────────── */}
              <div className="flex items-center gap-5 p-5 bg-malama-deep border border-gray-800 rounded-2xl">
                {hexId && (
                  <div className="shrink-0">
                    <img
                      src={nftImageUrl({ hexId, chain: paymentMode === 'cardano' ? 'cardano' : 'base' })}
                      alt={`Hex ${hexId} NFT preview`}
                      className="w-24 h-36 rounded-xl object-cover border border-malama-accent/20 shadow-[0_0_18px_rgba(196,240,97,0.12)]"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-0.5">Genesis Node License</p>
                  {hexId && (
                    <p className="font-mono text-[11px] text-gray-400 truncate mb-2">{hexId}</p>
                  )}
                  <p className="text-malama-accent text-2xl font-black">$2,000 {paymentMode === 'stripe' ? 'USD' : 'USDC'}</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {paymentMode === 'cardano' ? 'Cardano CIP-68 · hex territory rights' : paymentMode === 'base' ? 'Base ERC-721 + Cardano mirror' : 'Card payment · Base ERC-721'}
                  </p>
                </div>
              </div>

              <PurchaseLegalAcknowledgement value={legalAck} onChange={setLegalAck} />
              <button onClick={() => setStep(4)} disabled={!legalComplete} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl">Confirm & Pay</button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" className="space-y-8 text-center">
              {error && <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl">{error}</div>}
              <h2 className="text-4xl font-black text-white uppercase">{paymentMode} Payment</h2>
              {/* Keep the hex art visible so the operator confirms the right hex at signing */}
              {hexId && (
                <div className="flex justify-center">
                  <img
                    src={nftImageUrl({ hexId, chain: paymentMode === 'cardano' ? 'cardano' : 'base' })}
                    alt={`Hex ${hexId}`}
                    className="w-28 h-40 rounded-xl object-cover border border-malama-accent/20 shadow-[0_0_24px_rgba(196,240,97,0.15)] mx-auto"
                  />
                </div>
              )}
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

              {/* ── explorer + discord buttons ─────────────────────────── */}
              <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">

                {/* chain tx links */}
                <div className="flex gap-2">
                  <a
                    href={successData.explorerUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[13px] font-bold text-gray-200 transition-all hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {successData.chain === 'cardano' ? 'CardanoScan' : 'BaseScan'}
                  </a>
                  {successData.dagwelldevExplorerUrl && (
                    <a
                      href={successData.dagwelldevExplorerUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-malama-teal/40 bg-malama-teal/5 px-4 py-3 text-[13px] font-bold text-malama-teal transition-all hover:border-malama-teal/70 hover:bg-malama-teal/10"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Dagwell Explorer
                    </a>
                  )}
                </div>

                {/* discord */}
                <a
                  href={process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/malamalabs'}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-800/50 bg-indigo-950/40 px-4 py-3 text-[13px] font-bold text-indigo-300 transition-all hover:border-indigo-600 hover:bg-indigo-950/70"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Join Operator Discord
                </a>

                {/* hex detail link */}
                {hexId && (
                  <Link
                    href={`/list/${encodeURIComponent(hexId)}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-malama-accent/10 border border-malama-accent/30 px-4 py-3 font-mono text-sm font-bold text-malama-accent transition-all hover:bg-malama-accent/20"
                  >
                    View your hex →
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
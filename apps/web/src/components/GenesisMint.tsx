'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useAccount as useEVMWallet,
  useConnect as useEVMConnect,
  useDisconnect as useEVMDisconnect,
  useWriteContract,
  usePublicClient,
} from 'wagmi'
import { injected } from 'wagmi/connectors'
import { parseAbi, decodeEventLog } from 'viem'
import {
  MapPin, Wallet, Globe,
  CheckCircle2, ExternalLink,
  CreditCard, MessageCircle,
} from 'lucide-react'
import Link from 'next/link'
import regionsData from '@/data/regions.json'
import { getGenesisPoolSlot } from '@/lib/genesis-hexes'
import { BASE_CHAIN } from '@/lib/base-chain'
import {
  EXPLORER_BASE,
  reserveHexOnChain,
  reportMintObserved,
  createStripeCheckout,
  nftImageUrl,
} from '@/lib/api'

// Minting on Launch is Base-only. The buyer always receives a Base ERC-721;
// the Cardano CIP-68 ref token is minted server-side (in reportMintObserved)
// purely as a verification mirror — no Cardano wallet is involved client-side.
type PaymentLane = 'base' | 'stripe'
import {
  PurchaseLegalAcknowledgement,
  initialLegalAck,
  allLegalAcknowledged,
} from '@/components/legal/PurchaseLegalAcknowledgement'
import { useMagic } from '@/components/magic/MagicProvider'
import { getRefCookie } from '@/components/ReferralCapture'
import GenesisHexList from './GenesisHexList'
import HexPickerMap from './HexPickerMap'

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
  txHash: string; chain: 'base'; explorerUrl: string; nftImageUrl: string;
  openSeaUrl?: string; tokenName?: string; simulated?: boolean;
  /** Dagwelldev explorer URL for the Cardano CIP-68 ref-token mirror — set
   *  when the backend mints the verification mirror inline with the Base tx. */
  dagwelldevExplorerUrl?: string;
}

function NftCard({ data, hexId }: { data: SuccessData; hexId: string | null }) {
  return (
    <div className="relative w-56 aspect-[2/3] mx-auto rounded-2xl overflow-hidden border border-malama-accent/30 shadow-[0_0_40px_rgba(196,240,97,0.2)]">
      <img src={data.nftImageUrl} alt={`NFT ${data.claimId}`} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-3 left-3 right-3">
        <p className="text-malama-accent font-black text-2xl">{data.claimId}</p>
        <p className="text-gray-300 text-xs font-mono truncate">{hexId}</p>
      </div>
    </div>
  )
}

// ── Reserve-flow shell pieces ──────────────────────────────────────────────
// A single fixed shell: a labeled progress stepper on top, the swapping step
// card on the left, and a persistent order summary that stays put (sticky on
// desktop, a collapsible bar on mobile). Only the step card changes between
// steps, so the flow reads as one linear screen with no page jumps.

const STEP_LABELS = ['Pick hex', 'Pay how', 'Review', 'Confirm', 'Done']

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-800 bg-gray-900/50 px-4 py-3 sm:px-8">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const done = n < step
        const active = n === step
        return (
          <React.Fragment key={label}>
            <div className={`flex shrink-0 items-center gap-2 ${active ? 'text-white' : done ? 'text-malama-accent' : 'text-gray-600'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px] ${
                active ? 'border-malama-accent bg-malama-accent/15 text-malama-accent'
                : done ? 'border-malama-accent bg-malama-accent text-black'
                : 'border-gray-700 text-gray-500'
              }`}>
                {done ? '✓' : n}
              </span>
              <span className="hidden font-mono text-[11px] uppercase tracking-wider sm:inline">{label}</span>
            </div>
            {n < STEP_LABELS.length && (
              <div className={`h-px min-w-[10px] flex-1 ${n < step ? 'bg-malama-accent' : 'bg-gray-700'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function claimIdFor(hexId: string | null): string | null {
  if (!hexId) return null
  const editionNumber = getGenesisPoolSlot(hexId, regionsData) ?? 0
  return `G200-${String(editionNumber).padStart(3, '0')}`
}

function OrderSummary({ hexId, paymentMode }: { hexId: string | null; paymentMode: PaymentLane }) {
  const claimId = claimIdFor(hexId)
  return (
    <div>
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">Your order</p>
      {hexId ? (
        <>
          <div className="mb-3 overflow-hidden rounded-2xl border border-malama-accent/20 bg-malama-deep">
            {/* Natural ratio — no object-cover crop, so the image's own top
                margin (MĀLAMA LABS header + BASE L2 badge) isn't clipped. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nftImageUrl({ hexId, chain: 'base' })} alt={`Hex ${hexId}`} className="block h-auto w-full" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500">Hex Node License</p>
          <p className="text-lg font-black text-white">{claimId}</p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-gray-500">{hexId}</p>
        </>
      ) : (
        <div className="mb-3 rounded-2xl border border-dashed border-gray-700 bg-malama-deep/50 px-4 py-10 text-center font-mono text-[12px] leading-relaxed text-gray-600">
          No hex selected yet.<br />Pick one to begin.
        </div>
      )}
      <div className="mt-4 space-y-2 border-t border-gray-800 pt-4 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Entry</span><span className="font-bold text-white">$2,000 {paymentMode === 'stripe' ? 'USD' : 'USDC'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">MLMA / node</span><span className="font-mono text-gray-300">125,000</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="text-gray-300">{paymentMode === 'stripe' ? 'Card' : 'Crypto'}</span></div>
      </div>
      <p className="mt-3 text-[10px] text-gray-600">Genesis · 200 nodes · one mint per hex.</p>
    </div>
  )
}

function OrderSummaryBar({
  hexId, paymentMode, open, onToggle,
}: { hexId: string | null; paymentMode: PaymentLane; open: boolean; onToggle: () => void }) {
  const claimId = claimIdFor(hexId)
  return (
    <div className="border-b border-gray-800 bg-malama-deep/60 md:hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="font-mono text-[11px] uppercase tracking-wider text-gray-400">
          {hexId ? <>Hex <span className="text-malama-accent">{claimId}</span></> : 'No hex selected'}
        </span>
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          $2,000
          <span className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>
      {open && <div className="px-4 pb-4"><OrderSummary hexId={hexId} paymentMode={paymentMode} /></div>}
    </div>
  )
}

export default function GenesisMint({ hexId: initialHexId }: { hexId: string | null }) {
  // hexId is stateful so the buyer can pick / change it inside the flow (step 1
  // inline picker) without bouncing to /explorer. Seeded from the ?hex= prop so
  // deep links (e.g. the /list Reserve buttons) still jump straight to payment.
  const [hexId, setHexId] = useState<string | null>(initialHexId)
  const [step, setStep] = useState(initialHexId ? 2 : 1)
  const [pickerView, setPickerView] = useState<'map' | 'list'>('map')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [evmTxStatus, setEvmTxStatus] = useState<'' | 'claiming' | 'approving' | 'minting'>('')
  const [error, setError]           = useState('')
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [legalAck, setLegalAck]     = useState(initialLegalAck)
  // Default to card (Stripe) so non-crypto buyers feel welcomed — leading with
  // the no-wallet-needed option. Crypto stays one tap away.
  const [paymentMode, setPaymentMode] = useState<PaymentLane>('stripe')
  // uiTab drives which toggle is visible; stripeSubMode picks the delivery card under Card tab
  const [uiTab, setUiTab]           = useState<'crypto' | 'card'>('card')
  const [stripeSubMode, setStripeSubMode] = useState<'magic' | 'wallet'>('magic')
  const [magicDeliveryAddress, setMagicDeliveryAddress] = useState<string | null>(null)
  const [magicVerifying, setMagicVerifying]             = useState(false)
  const [magicVerifyError, setMagicVerifyError]         = useState('')
  const [cardEmail, setCardEmail]   = useState('')
  const [stripeDeliveryAddress, setStripeDeliveryAddress] = useState('')

  const legalComplete = allLegalAcknowledged(legalAck)
  const cardEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cardEmail.trim())

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

  const isSetupComplete = !!hexId && (
    paymentMode === 'base'
      ? evmConnected
      // Stripe: email required + delivery resolved (magic OTP, or a connected/typed Base address)
      : cardEmailOk && (
          stripeSubMode === 'magic'
            ? !!magicDeliveryAddress
            : (evmConnected || stripeEvmOk)
        )
  )

  const syncNodeToMap = (id: string | null) => {
    if (!id) return
    const prev = JSON.parse(localStorage.getItem('malamalabs_purchased_nodes') ?? '[]')
    if (!prev.includes(id)) localStorage.setItem('malamalabs_purchased_nodes', JSON.stringify([...prev, id]))
  }

  const addToMetaMask = async (evmTokenId: number) => {
    const eth = (window as any).ethereum
    if (!eth) return
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN.idHex }] })
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC721',
          options: { address: successData?.contractAddress ?? GENESIS_CONTRACT_FALLBACK, tokenId: String(evmTokenId) },
        },
      })
    } catch (e) { console.warn(e) }
  }

  // ── Base Payment ─────────────────────────────────────────────────────────
  const handleBasePayment = async () => {
    if (!publicClient || !evmAddress || !hexId) throw new Error('Wallet not ready')

    const eth = (window as any).ethereum
    if (eth) {
      const currentChain: string = await eth.request({ method: 'eth_chainId' })
      if (currentChain !== BASE_CHAIN.idHex) {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_CHAIN.idHex }] })
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: BASE_CHAIN.idHex,
                chainName: BASE_CHAIN.name,
                nativeCurrency: BASE_CHAIN.nativeCurrency,
                rpcUrls: BASE_CHAIN.rpcUrls,
                blockExplorerUrls: BASE_CHAIN.blockExplorerUrls,
              }],
            })
          } else {
            throw new Error(`Please switch to ${BASE_CHAIN.name} in your wallet`)
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
        // Explicit gas ceiling — avoids MetaMask "exceeds max transaction gas
        // limit" on first call when eth_estimateGas returns an inflated value
        // for cold storage slots. 100k is a 2× safe margin for ERC-20 approve.
        gas: BigInt(100_000),
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
        // Explicit gas ceiling — same reason as approve above. ERC-721 mint
        // with cold storage typically lands ~150-250k; 350k is a safe buffer
        // that stays well below Base's block gas limit.
        gas: BigInt(350_000),
      })
    } catch (e: any) {
      throw new Error('Mint transaction rejected or hex already taken on-chain')
    }
    // Wait for the mint receipt. CRITICAL: viem's waitForTransactionReceipt does
    // NOT throw on a reverted tx — it returns a receipt with status 'reverted'.
    // Without the status check below, a failed payment (e.g. insufficient USDC
    // balance/allowance, or the hex already taken on-chain) would advance the UI
    // to success and record the claim even though no NFT was minted.
    const mintExplorerHost = intent.network === 'mainnet' ? 'basescan.org' : 'sepolia.basescan.org'
    const mintExplorerUrl  = `https://${mintExplorerHost}/tx/${mintHash}`
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null
    try {
      receipt = await Promise.race([
        publicClient.waitForTransactionReceipt({ hash: mintHash }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
      ])
    } catch {
      // waitForTransactionReceipt timed out — do one direct receipt fetch before
      // deciding. If the tx is mined we read its true status; if it genuinely
      // isn't mined yet we surface a "still confirming" message (never a silent
      // success that would hide a reverted payment).
      receipt = await publicClient.getTransactionReceipt({ hash: mintHash }).catch(() => null)
      if (!receipt) {
        throw new Error(`Mint submitted but confirmation is taking longer than expected. It may still succeed — check ${mintExplorerUrl} and your dashboard before retrying.`)
      }
    }
    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted on-chain — no node was minted. Most common cause: insufficient USDC balance or allowance. Tx: ${mintExplorerUrl}`)
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
      const mirrorRes = await reportMintObserved({ hexId, txHash: mintHash, refKol: getRefCookie() ?? undefined })
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

  // ── Magic Email Verify (step before Stripe checkout) ───────────────────
  const handleMagicVerify = async () => {
    if (!magic || !cardEmailOk) return
    setMagicVerifying(true); setMagicVerifyError('')
    try {
      await magic.auth.loginWithEmailOTP({ email: cardEmail.trim() })
      const info = await magic.user.getInfo()
      const addr = info.wallets?.ethereum?.publicAddress
      if (!addr) throw new Error('No wallet address returned from Magic.')
      setMagicDeliveryAddress(addr)
    } catch (err: unknown) {
      setMagicVerifyError(err instanceof Error ? err.message : 'Verification failed — try again.')
    } finally {
      setMagicVerifying(false)
    }
  }

  // ── Stripe Payment ──────────────────────────────────────────────────────
  const handleStripePayment = async () => {
    if (!hexId) throw new Error('No hex selected')
    if (!cardEmailOk) throw new Error('Enter a valid email address')

    const origin = window.location.origin

    // Resolve the Base delivery address. In magic mode we use the address
    // captured during the pre-payment verify step; in wallet mode we use the
    // connected MetaMask address or a pasted Base address.
    const useMagicMode = stripeSubMode === 'magic'
    let deliveryEvm: string | undefined
    let usedMagic = false
    if (useMagicMode && magicDeliveryAddress) {
      deliveryEvm = magicDeliveryAddress
      usedMagic = true
    } else if (!useMagicMode && stripeEvmOk) {
      deliveryEvm = stripeEvmAddr
    }

    const intent = await createStripeCheckout(
      hexId,
      deliveryEvm,
      cardEmail.trim(),
      {
        successUrl: `${origin}/presale/card-complete?session_id={CHECKOUT_SESSION_ID}&hex=${encodeURIComponent(hexId)}${usedMagic ? '&magic=1' : ''}`,
        cancelUrl:  `${origin}/presale?stripe=cancel&hex=${encodeURIComponent(hexId)}`,
      },
      undefined,                  // cardanoAddress — not used on the Stripe card lane
      getRefCookie() ?? undefined, // KOL referral attribution
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
      const result = await handleBasePayment()
      setSuccessData(result); setStep(5)
    } catch (err: any) { setError(err.message || 'Payment failed') } finally { setLoading(false); setEvmTxStatus('') }
  }

  const submitLabel = () => {
    if (loading) return `${evmTxStatus || 'Processing'}...`
    if (paymentMode === 'stripe')  return 'Pay with Card →'
    return 'Confirm & Mint on Base'
  }

  return (
    <div className="w-full max-w-5xl mx-auto bg-malama-card border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-12">
      <Stepper step={step} />
      <OrderSummaryBar hexId={hexId} paymentMode={paymentMode} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)} />

      <div className="grid md:grid-cols-[1fr_320px]">
        {/* Left: the swapping step card */}
        <div className="relative flex min-h-[520px] flex-col justify-center p-6 text-left md:p-10">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="mb-6 text-center">
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-malama-accent">Step 1</p>
                <h2 className="flex flex-wrap items-center justify-center gap-2 text-4xl font-black text-white">
                  <MapPin className="h-10 w-10 shrink-0 text-malama-accent" />
                  Pick your hex
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-400">
                  Choose one of the 200 Genesis territories. Filter by region, open a hex for detail, then select to continue — all without leaving this flow.
                </p>
              </div>

              {/* Inline picker — map or list, both in-flow (no /explorer bounce).
                  Selecting sets the hex; the Continue button below advances. */}
              <div className="mb-3 flex justify-center">
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-800">
                  {(['map', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPickerView(v)}
                      className={`px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors ${
                        pickerView === v ? 'bg-malama-accent text-black' : 'bg-gray-900/60 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {v === 'map' ? '⬡ Map' : '≡ List'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[460px] overflow-hidden rounded-2xl border border-gray-800">
                {pickerView === 'map' ? (
                  <HexPickerMap
                    selectedHexId={hexId}
                    onSelect={(id) => { setHexId(id); setError('') }}
                  />
                ) : (
                  <GenesisHexList
                    selectedHexId={hexId}
                    onSelect={(id) => { setHexId(id); setError('') }}
                  />
                )}
              </div>

              {hexId && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <p className="font-mono text-sm text-malama-accent/90">
                    Selected: <span className="text-malama-accent">{hexId}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-full max-w-lg rounded-2xl bg-malama-accent py-5 text-xl font-black text-black shadow-xl shadow-malama-accent/30 transition-all hover:scale-[1.02]"
                  >
                    Continue to payment →
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="mb-10 text-center">
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-malama-accent">Step 2</p>
                <h2 className="flex flex-wrap items-center justify-center gap-2 text-4xl font-black text-white">
                  <CreditCard className="h-9 w-9 shrink-0 text-malama-accent" />
                  How would you like to pay?
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-400">
                  Most buyers pay by card — no crypto or wallet needed. We create a secure wallet for
                  you and mint your node to it automatically. Prefer crypto? Connect Base and pay in USDC.
                </p>
                {hexId && (
                  <p className="mt-2 font-mono text-sm text-malama-accent/90">
                    Hex: <span className="text-malama-accent">{hexId}</span>
                  </p>
                )}
              </div>

              {/* ── Top toggle — card first (welcomes non-crypto buyers) ── */}
              <div className="mx-auto mb-8 flex max-w-2xl flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => { setUiTab('card'); setPaymentMode('stripe') }}
                  className={`relative inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-wider transition-all ${
                    uiTab === 'card'
                      ? 'border-malama-accent bg-malama-accent/10 text-malama-accent shadow-[0_0_20px_rgba(196,240,97,0.15)]'
                      : 'border-gray-800 bg-gray-900/80 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  <span className="absolute -top-2 right-3 rounded-full bg-malama-accent px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">
                    Easiest
                  </span>
                  <CreditCard className="h-4 w-4" />
                  Pay by card
                </button>
                <button
                  type="button"
                  onClick={() => { setUiTab('crypto'); setPaymentMode('base') }}
                  className={`flex-1 rounded-2xl border px-5 py-3 text-xs font-black uppercase tracking-wider transition-all ${
                    uiTab === 'crypto'
                      ? 'border-malama-accent bg-malama-accent/10 text-malama-accent shadow-[0_0_20px_rgba(196,240,97,0.15)]'
                      : 'border-gray-800 bg-gray-900/80 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  Pay with crypto
                </button>
              </div>

              {/* ── Content area ── */}
              {uiTab === 'crypto' ? (

                /* ══ CRYPTO TAB: Base wallet tile ══ */
                <div className="mx-auto max-w-md">
                  <div
                    className={`relative flex flex-col items-center space-y-4 rounded-2xl border-2 p-6 text-center transition-all ${
                      evmConnected
                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/60 shadow-[0_0_28px_rgba(59,130,246,0.3)]'
                        : 'border-gray-800 bg-malama-deep hover:border-gray-700'
                    }`}
                  >
                    {evmConnected && (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    )}
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full ${evmConnected ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                      <Globe className={`h-7 w-7 ${evmConnected ? 'text-blue-400' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">Base L2 NFT</h3>
                      <p className={`mt-1 font-mono text-sm ${evmConnected ? 'text-blue-400' : 'text-gray-500'}`}>
                        {evmConnected ? `${evmAddress?.slice(0, 6)}…${evmAddress?.slice(-4)}` : 'DISCONNECTED'}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">ERC-721 Token · Cardano CIP-68 mirror</p>
                    </div>
                    {evmConnected ? (
                      <button
                        type="button"
                        onClick={() => disconnectEVM()}
                        className="w-full rounded-lg border border-blue-500/50 bg-blue-500/20 py-2 text-xs font-bold text-blue-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                      >
                        {evmAddress?.slice(0, 6)}…{evmAddress?.slice(-4)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => connectEVM({ connector: injected() })}
                        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg transition-all hover:bg-blue-700"
                      >
                        Connect MetaMask / CB
                      </button>
                    )}
                  </div>
                </div>

              ) : (

                /* ══ CARD TAB: two delivery sub-cards ══ */
                <div className="mx-auto max-w-2xl space-y-5">

                  {/* Shared email input */}
                  <label className="block text-left">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                      Email (receipt and wallet access)
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={cardEmail}
                      onChange={e => { setCardEmail(e.target.value); setMagicDeliveryAddress(null); setMagicVerifyError('') }}
                      placeholder="you@example.com"
                      className="mt-2 w-full rounded-xl border border-gray-800 bg-black/40 px-4 py-3 text-white placeholder:text-gray-600 focus:border-malama-accent focus:outline-none"
                    />
                  </label>

                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 text-center">Choose NFT delivery</p>

                  <div className="grid gap-4 sm:grid-cols-2">

                    {/* ── Card A: Magic wallet (no hardware wallet needed) ── */}
                    <div
                      onClick={() => setStripeSubMode('magic')}
                      className={`relative flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 p-6 text-center transition-all ${
                        stripeSubMode === 'magic'
                          ? 'border-malama-accent bg-malama-accent/10 ring-2 ring-malama-accent/60 shadow-[0_0_28px_rgba(196,240,97,0.3)]'
                          : 'border-gray-800 bg-malama-deep hover:border-gray-700'
                      }`}
                    >
                      {stripeSubMode === 'magic' && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-malama-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                          <CheckCircle2 className="h-3 w-3" /> Selected
                        </span>
                      )}
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${stripeSubMode === 'magic' ? 'bg-malama-accent/20' : 'bg-gray-800'}`}>
                        <CreditCard className={`h-7 w-7 ${stripeSubMode === 'magic' ? 'text-malama-accent' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">No wallet needed</h3>
                        <p className={`mt-1 text-sm font-mono ${stripeSubMode === 'magic' ? 'text-malama-accent' : 'text-gray-500'}`}>
                          Magic auto-wallet
                        </p>
                        <p className="mt-1 text-xs text-gray-600">Base NFT · Stripe checkout</p>
                      </div>
                      <p className="text-[11px] leading-relaxed text-gray-500">
                        Magic creates a Base wallet tied to your email.
                        You receive a transfer link to move the NFT to MetaMask later.
                      </p>
                      {stripeSubMode === 'magic' && (
                        <div className="w-full space-y-2">
                          {magicDeliveryAddress ? (
                            <div className="rounded-lg border border-malama-accent/50 bg-malama-accent/20 px-3 py-2 text-xs font-bold text-malama-accent">
                              ✓ Wallet verified · {magicDeliveryAddress.slice(0, 6)}…{magicDeliveryAddress.slice(-4)}
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!cardEmailOk || magicVerifying || !magic}
                              onClick={e => { e.stopPropagation(); void handleMagicVerify() }}
                              className="w-full rounded-lg border border-violet-500/50 bg-violet-500/10 py-2 text-xs font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-40"
                            >
                              {magicVerifying ? 'Sending code…' : 'Verify email →'}
                            </button>
                          )}
                          {magicVerifyError && (
                            <p className="text-[11px] text-red-400">{magicVerifyError}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Card B: Connected Base wallet (ERC-721) ── */}
                    <div
                      onClick={() => setStripeSubMode('wallet')}
                      className={`relative flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 p-6 text-center transition-all ${
                        stripeSubMode === 'wallet'
                          ? 'border-malama-accent bg-malama-accent/10 ring-2 ring-malama-accent/60 shadow-[0_0_28px_rgba(196,240,97,0.3)]'
                          : 'border-gray-800 bg-malama-deep hover:border-gray-700'
                      }`}
                    >
                      {stripeSubMode === 'wallet' && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-malama-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                          <CheckCircle2 className="h-3 w-3" /> Selected
                        </span>
                      )}
                      <div className={`flex h-14 w-14 items-center justify-center rounded-full ${stripeSubMode === 'wallet' ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                        <Wallet className={`h-7 w-7 ${stripeSubMode === 'wallet' ? 'text-blue-400' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Your Base wallet</h3>
                        <p className={`mt-1 font-mono text-sm ${evmConnected ? 'text-blue-400' : 'text-gray-500'}`}>
                          {evmConnected ? `${evmAddress?.slice(0, 6)}…${evmAddress?.slice(-4)}` : 'NOT CONNECTED'}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">ERC-721 · Base</p>
                      </div>

                      {/* Deliver to a connected MetaMask wallet, or paste a Base address */}
                      <div className="w-full space-y-2" onClick={e => e.stopPropagation()}>
                        {evmConnected ? (
                          <div className="rounded-lg border border-blue-500/50 bg-blue-500/15 px-3 py-2 text-center text-[11px] font-bold text-blue-400">
                            ✓ ERC-721 NFT mints to {evmAddress?.slice(0, 6)}…{evmAddress?.slice(-4)}
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setStripeSubMode('wallet'); connectEVM({ connector: injected() }) }}
                              className="w-full rounded-lg border border-blue-500/50 bg-blue-500/10 py-2 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20"
                            >
                              Connect MetaMask
                            </button>
                            <input
                              type="text"
                              value={stripeDeliveryAddress}
                              onChange={e => setStripeDeliveryAddress(e.target.value)}
                              placeholder="…or paste a Base address (0x…)"
                              className="w-full rounded-lg border border-gray-800 bg-black/40 px-3 py-2 font-mono text-[11px] text-white placeholder:text-gray-600 focus:border-blue-500/60 focus:outline-none"
                            />
                            {stripeDeliveryAddress.trim() && !stripeEvmOk && (
                              <p className="text-[10px] text-red-400">Enter a valid 0x Base address.</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Back + Continue ── */}
              <div className="flex flex-col items-center gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-bold text-gray-500 hover:text-gray-300"
                >
                  ← Back to hex picker
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!isSetupComplete}
                  className={`w-full max-w-lg rounded-2xl py-5 text-xl font-black shadow-xl transition-all ${
                    isSetupComplete
                      ? 'bg-malama-accent text-black shadow-malama-accent/30 hover:scale-[1.02]'
                      : 'cursor-not-allowed bg-gray-800 text-gray-600 opacity-50'
                  }`}
                >
                  {uiTab !== 'crypto' || isSetupComplete
                    ? 'Review Order'
                    : 'Connect MetaMask to continue'}
                </button>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                  Mālama Genesis · 200 Nodes · One mint per hex
                </p>
              </div>
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
                      src={nftImageUrl({ hexId, chain: 'base' })}
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
                    {paymentMode === 'stripe' ? 'Card payment · Base ERC-721' : 'Base ERC-721 + Cardano mirror'}
                  </p>
                </div>
              </div>

              <PurchaseLegalAcknowledgement value={legalAck} onChange={setLegalAck} />
              <div className="flex flex-col items-center gap-4">
                <button onClick={() => setStep(4)} disabled={!legalComplete} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl disabled:opacity-50 disabled:cursor-not-allowed">Confirm &amp; Pay</button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm font-bold text-gray-500 hover:text-gray-300"
                  >
                    ← Back to payment
                  </button>
                  <span className="text-gray-700">·</span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-sm font-bold text-amber-400/80 hover:text-amber-400"
                  >
                    Choose a different hex →
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" className="space-y-8 text-center">
              {error && (
                <div className="space-y-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-red-400">{error}</p>
                  {/^.*(taken|sold|already|unavailable|reserved).*/i.test(error) && (
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2 text-sm font-black text-amber-300 transition hover:bg-amber-500/25"
                    >
                      <MapPin className="h-4 w-4" /> This hex is unavailable — pick another →
                    </button>
                  )}
                </div>
              )}
              <h2 className="text-4xl font-black text-white uppercase">{paymentMode} Payment</h2>
              {/* Keep the hex art visible so the operator confirms the right hex at signing */}
              {hexId && (
                <div className="flex justify-center">
                  <img
                    src={nftImageUrl({ hexId, chain: 'base' })}
                    alt={`Hex ${hexId}`}
                    className="w-28 aspect-[2/3] rounded-xl object-cover border border-malama-accent/20 shadow-[0_0_24px_rgba(196,240,97,0.15)] mx-auto"
                  />
                </div>
              )}
              <button onClick={handlePayment} disabled={loading} className="w-full py-5 rounded-2xl bg-malama-accent text-black font-black text-xl disabled:opacity-50 disabled:cursor-not-allowed">
                {submitLabel()}
              </button>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={loading}
                  className="text-sm font-bold text-gray-500 hover:text-gray-300 disabled:opacity-40"
                >
                  ← Back to review
                </button>
                <span className="text-gray-700">·</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="text-sm font-bold text-amber-400/80 hover:text-amber-400 disabled:opacity-40"
                >
                  Choose a different hex →
                </button>
              </div>
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
                    BaseScan
                  </a>
                  {successData.dagwelldevExplorerUrl && (
                    <a
                      href={successData.dagwelldevExplorerUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-malama-teal/40 bg-malama-teal/5 px-4 py-3 text-[13px] font-bold text-malama-teal transition-all hover:border-malama-teal/70 hover:bg-malama-teal/10"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Verify CIP-68 mirror
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

                {/* Add to MetaMask — Base lane (evmTokenId is set) */}
                {successData.evmTokenId && (
                  <button
                    type="button"
                    onClick={() => addToMetaMask(successData.evmTokenId!)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-900/50 bg-orange-950/30 px-4 py-3 text-[13px] font-bold text-orange-300 transition-all hover:border-orange-700 hover:bg-orange-950/50"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Add to MetaMask
                  </button>
                )}

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

        {/* Right: persistent order summary (sticky on desktop) */}
        <aside className="hidden border-l border-gray-800 bg-malama-deep/60 p-6 md:block">
          <div className="sticky top-24">
            <OrderSummary hexId={hexId} paymentMode={paymentMode} />
          </div>
        </aside>
      </div>
    </div>
  )
}

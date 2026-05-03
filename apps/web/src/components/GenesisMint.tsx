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
import { parseAbi, decodeEventLog } from 'viem'
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

/**
 * Three mutually-exclusive purchase lanes. Lane defines which wallet(s) must
 * be connected, which chain settles the sale, and which handleXxxPayment()
 * runs at step 4.
 *
 *   base    — connect MetaMask → pay USDC → Base ERC-721 mint.
 *             CIP-68 mirror is best-effort & optional.
 *   cardano — connect Lace/Eternl/etc → pay ADA to treasury → backend
 *             mints CIP-68 pair with user token (222) to buyer.
 *   stripe  — enter email + connect MetaMask (delivery address) → Stripe
 *             checkout → webhook mints on Base.
 */
type PaymentLane = 'base' | 'cardano' | 'stripe'
import {
  PurchaseLegalAcknowledgement,
  LegalMintReminder,
  initialLegalAck,
  allLegalAcknowledged,
} from '@/components/legal/PurchaseLegalAcknowledgement'

// ─── Contract addresses ───────────────────────────────────────────────────────
// Fallbacks only. Actual contract + USDC addresses come from the dagwelldev-api
// purchase-intent response — that way the backend is the single source of truth
// for which network (sepolia/mainnet) and which contract deployment are active.
const GENESIS_CONTRACT_FALLBACK = (process.env.NEXT_PUBLIC_GENESIS_CONTRACT_ADDRESS ?? '0x2222222222222222222222222222222222222222') as `0x${string}`
const USDC_CONTRACT_FALLBACK    = (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS         ?? '0x1111111111111111111111111111111111111111') as `0x${string}`

const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) public returns (bool)',
])
const MHNL_ABI = parseAbi([
  'function secureNode(string calldata hexId) external',
  'event NodeSecured(address indexed operator, uint256 indexed tokenId, string hexId)',
])

// ─── Types ───────────────────────────────────────────────────────────────────
interface SuccessData {
  /** Canonical reservation id — e.g. G200-042 */
  claimId: string
  /** 1–200 (matches claim sequence) */
  editionNumber: number
  /** Base ERC-721 token id (on-chain); Cardano omits */
  evmTokenId?: number
  /** Contract address used for the mint — drives MetaMask import panel. */
  contractAddress?: `0x${string}`
  txHash: string
  chain: 'base' | 'cardano'
  explorerUrl: string
  nftImageUrl: string
  openSeaUrl?: string
  cnftUrl?: string
  tokenName?: string
  /** True when mint env vars were missing and a mock result was returned */
  simulated?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const shortHash = (h: string) => `${h.slice(0, 8)}...${h.slice(-6)}`

function NftCard({ data, hexId }: { data: SuccessData; hexId: string | null }) {
  return (
    <div className="relative w-56 h-80 mx-auto rounded-2xl overflow-hidden border border-malama-accent/30 shadow-[0_0_40px_rgba(196,240,97,0.2)]">
      <img
        src={data.nftImageUrl}
        alt={`Mālama Hex Node License ${data.claimId}`}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-3 left-3 right-3">
        <p className="text-malama-accent font-black text-2xl">{data.claimId}</p>
        <p className="text-gray-300 text-xs font-mono truncate">{hexId}</p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
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

  // ── Wallet hooks ────────────────────────────────────────────────────────
  const { connected: cardanoConnected, wallet: cardanoWallet, name: cardanoWalletName, connect: connectCardano } = useCardanoWallet()
  const [cardanoWallets, setCardanoWallets] = useState<{ name: string; icon: string }[]>([])
  const [showCardanoPicker, setShowCardanoPicker] = useState(false)
  const [cardanoError, setCardanoError] = useState<string | null>(null)
  // Raw CIP-30 API object — stored after window.cardano[name].enable() succeeds.
  // Used for:
  //   (a) getChangeAddress() → passed to reportMintObserved so the CIP-68
  //       mirror token (222) is delivered to the buyer's Cardano wallet
  //       instead of bank custody.
  //   (b) signData() → triggers Lace's signing popup for identity proofs.
  const [cardanoCip30Api, setCardanoCip30Api] = useState<{
    getChangeAddress: () => Promise<string>
    signData: (address: string, payload: string) => Promise<{ signature: string; key: string }>
  } | null>(null)
  const { address: evmAddress, isConnected: evmConnected } = useEVMWallet()
  const { connect: connectEVM }    = useEVMConnect()
  const { disconnect: disconnectEVM } = useEVMDisconnect()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const cardanoReady     = cardanoConnected || !!cardanoCip30Api
  // Per-lane setup gates. Each lane has exactly one required wallet/email
  // combo — no lane requires connecting wallets it doesn't settle on.
  //   base    → MetaMask/Base only.
  //   cardano → Cardano wallet only (Mesh-connected so we can build a tx).
  //             Base is NOT required — this lane is an escape hatch for
  //             buyers who don't want an EVM wallet at all.
  //   stripe  → Email (receipt) + EVM delivery address (backend mints NFT to it).
  const isSetupComplete =
    !!hexId && (
      paymentMode === 'base'    ? evmConnected :
      paymentMode === 'cardano' ? cardanoConnected :
      /* stripe */                evmConnected && cardEmailOk
    )

  // ── Sync local purchased map ─────────────────────────────────────────────
  const syncNodeToMap = (id: string | null) => {
    if (!id) return
    const prev = JSON.parse(localStorage.getItem('malamalabs_purchased_nodes') ?? '[]')
    if (!prev.includes(id)) {
      localStorage.setItem('malamalabs_purchased_nodes', JSON.stringify([...prev, id]))
    }
  }

  // ── Copy helper ──────────────────────────────────────────────────────────
  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Direct CIP-30 connect — triggers the wallet's "Connect this dApp?" popup.
  //
  // Cardano connect is OPTIONAL in this flow — the CIP-68 mirror token ships
  // to the treasury by default if we don't have a buyer Cardano address, so a
  // failure here must not blow up the purchase. Common failure modes we want
  // to swallow politely:
  //   - User has Eternl installed but no account is set ("no account set")
  //   - User rejected the connect popup (CIP-30 APIError code -3)
  //   - Wallet's internal messaging glitched ("dom:receive no data domId")
  // In all cases we surface a friendly string under the Connect button and
  // leave the rest of the UI (Base connect, checkout) fully usable.
  const readableCardanoError = (err: unknown): string => {
    const e = err as { info?: string; message?: string; code?: number } | null
    const msg = (e?.info || e?.message || '').toString().toLowerCase()
    if (msg.includes('no account')) {
      return 'Your Cardano wallet has no account selected — open the extension, create/select an account, then retry.'
    }
    if (msg.includes('user declined') || msg.includes('rejected') || e?.code === -3) {
      return 'Cardano connect was declined. Retry when you\'re ready — this wallet is optional.'
    }
    if (msg.includes('dom:receive') || msg.includes('no data')) {
      return 'The Cardano extension didn\'t respond. Try unlocking it, then retry.'
    }
    return e?.info || e?.message || 'Cardano connect failed — this wallet is optional; you can still complete your purchase.'
  }

  const connectCardanoWallet = async (walletKey: string) => {
    setCardanoError(null)
    const win = window as typeof window & {
      cardano?: Record<string, { name?: string; icon?: string; enable: () => Promise<any> }>
    }
    const provider = win.cardano?.[walletKey]
    if (!provider) {
      setCardanoError('That Cardano wallet extension isn\'t loaded — try reloading the page.')
      return
    }
    try {
      const api = await provider.enable()
      setCardanoCip30Api(api)
    } catch (err) {
      console.warn('[cardano-connect] enable() failed', err)
      setCardanoError(readableCardanoError(err))
      return // don't fall through to Mesh — nothing to connect
    }
    // Best-effort MeshSDK sync so cardanoWallet/cardanoConnected state updates.
    // The raw CIP-30 api is already stored above, so a Mesh failure is harmless.
    await connectCardano(walletKey).catch((err) => {
      console.warn('[cardano-connect] Mesh sync warning (non-fatal)', err)
    })
  }

  // ── Add NFT to MetaMask ──────────────────────────────────────────────────
  const copyMm = (text: string, field: 'address' | 'tokenId') => {
    navigator.clipboard.writeText(text).then(() => {
      setMmCopied(field)
      setTimeout(() => setMmCopied(null), 2000)
    })
  }

  const addToMetaMask = async (evmTokenId: number) => {
    const eth = (window as any).ethereum
    // Always open the manual panel so the user can copy values regardless
    setMmImportOpen(true)

    if (!eth) return // panel is open; user reads contract + tokenId manually

    try {
      // Switch to Base Sepolia first
      const chainId: string = await eth.request({ method: 'eth_chainId' })
      if (chainId !== '0x14a34') {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x14a34' }],
        }).catch(async (switchErr: any) => {
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
          }
        })
      }
      // wallet_watchAsset pops MetaMask's "Import NFT" dialog
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC721',
          options: {
            address: successData?.contractAddress ?? GENESIS_CONTRACT_FALLBACK,
            tokenId: String(evmTokenId),
          },
        },
      })
    } catch (e) {
      console.warn('wallet_watchAsset failed — manual import panel open', e)
    }
  }

  // ── Base payment flow (via dagwelldev-api) ──────────────────────────────
  const handleBasePayment = async () => {
    if (!publicClient || !evmAddress || !hexId) throw new Error('Wallet or hex not ready')

    // 1. Reserve with dagwelldev-api. Backend validates availability + returns
    //    the authoritative contract + USDC addresses to use. If the hex is
    //    already sold or claimed on-chain, this throws with a clear message.
    setEvmTxStatus('claiming')
    const intent = await reserveHexOnChain(hexId, evmAddress)

    const GENESIS_CONTRACT = intent.contract ?? GENESIS_CONTRACT_FALLBACK
    const USDC_CONTRACT    = intent.usdcAddress ?? USDC_CONTRACT_FALLBACK
    const priceRaw         = BigInt(intent.priceRaw)

    // Pool slot is deterministic from hexId + regions.json, so we can render
    // a human-readable claim id immediately without a round-trip.
    const editionNumber = getGenesisPoolSlot(hexId, regionsData) ?? 0
    const claimId       = `G200-${String(editionNumber).padStart(3, '0')}`

    // ── 2. USDC approve ────────────────────────────────────────────────
    // Pre-fetch nonce + gas + EIP-1559 fee suggestions from our public RPC
    // (Alchemy, via Providers.tsx wagmi transport) and pass them explicitly
    // into writeContractAsync. By default wagmi/viem lets MetaMask do the
    // estimation, and MM uses its OWN (often public, often flaky) RPC. On
    // Base Sepolia that surfaces as "Failed to fetch" before the second
    // popup. Pre-supplying these fields means MM only has to sign — no
    // RPC estimation round-trip on its side.
    //
    // NOTE: do NOT pass `chainId` — wagmi treats that as a switch-chain
    // hint that hits the flaky RPC again (memory:
    // feedback_wagmi_chainid_param). Step 4 already gates on evmConnected
    // so the wallet is on the right chain.
    setEvmTxStatus('approving')
    let approveHash: `0x${string}`
    try {
      const approveNonce = await publicClient.getTransactionCount({
        address:  evmAddress,
        blockTag: 'pending',
      })
      const approveGas = await publicClient.estimateContractGas({
        address: USDC_CONTRACT,
        abi:     USDC_ABI,
        functionName: 'approve',
        args:    [GENESIS_CONTRACT, priceRaw],
        account: evmAddress,
      })
      const approveFees = await publicClient.estimateFeesPerGas()

      approveHash = await writeContractAsync({
        address: USDC_CONTRACT,
        abi:     USDC_ABI,
        functionName: 'approve',
        args:    [GENESIS_CONTRACT, priceRaw],
        // 25% headroom — Sepolia estimation occasionally underbids.
        gas:                  (approveGas * 125n) / 100n,
        nonce:                approveNonce,
        maxFeePerGas:         approveFees.maxFeePerGas,
        maxPriorityFeePerGas: approveFees.maxPriorityFeePerGas,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user|reject|denied|cancel/i.test(msg)) {
        throw new Error('USDC approval rejected — please approve in your wallet')
      }
      throw new Error(`USDC approval failed: ${msg.slice(0, 200)}`)
    }
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    // ── 3. Mint NFT (secureNode on GenesisValidator) ───────────────────
    // Same pre-fetch pattern. We re-call getTransactionCount instead of
    // assuming approveNonce + 1 because MM occasionally re-orders nonces
    // on testnets, and the safe number is whatever 'pending' says now.
    setEvmTxStatus('minting')
    let mintHash: `0x${string}`
    try {
      const mintNonce = await publicClient.getTransactionCount({
        address:  evmAddress,
        blockTag: 'pending',
      })
      const mintGas = await publicClient.estimateContractGas({
        address: GENESIS_CONTRACT,
        abi:     MHNL_ABI,
        functionName: 'secureNode',
        args:    [hexId],
        account: evmAddress,
      })
      const mintFees = await publicClient.estimateFeesPerGas()

      mintHash = await writeContractAsync({
        address: GENESIS_CONTRACT,
        abi:     MHNL_ABI,
        functionName: 'secureNode',
        args:    [hexId],
        gas:                  (mintGas * 125n) / 100n,
        nonce:                mintNonce,
        maxFeePerGas:         mintFees.maxFeePerGas,
        maxPriorityFeePerGas: mintFees.maxPriorityFeePerGas,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/user|reject|denied|cancel/i.test(msg)) {
        throw new Error('Mint transaction rejected — please confirm in your wallet')
      }
      // Surface known revert classes so the operator knows where to look.
      if (/transfer|allowance|paymentToken|insufficient/i.test(msg)) {
        throw new Error(
          `Mint reverted on-chain — usually a USDC ↔ contract.paymentToken() mismatch. ` +
          `Verify USDC_ADDRESS_SEPOLIA matches GenesisValidator.paymentToken() (cast call $ADDR "paymentToken()(address)"). ` +
          `Raw: ${msg.slice(0, 160)}`,
        )
      }
      throw new Error(`Mint failed: ${msg.slice(0, 200)}`)
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash })

    // 4. Extract tokenId from NodeSecured event (fallback = edition #)
    let evmTokenId = editionNumber
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MHNL_ABI, ...log })
        if (decoded.eventName === 'NodeSecured') {
          evmTokenId = Number((decoded.args as { tokenId: bigint }).tokenId)
        }
      } catch {}
    }

    // 5. If the buyer has a Cardano wallet connected, grab their change
    //    address so the CIP-68 mirror (222 token) ships to them directly.
    //    MeshSDK's getChangeAddress() returns a bech32 address already; the
    //    backend validates network-match + bech32 shape before using it and
    //    falls back to bank custody on anything suspicious.
    let cardanoAddress: string | undefined
    if (cardanoConnected && cardanoWallet) {
      try {
        const addr = await cardanoWallet.getChangeAddress()
        if (typeof addr === 'string' && addr.length > 0) cardanoAddress = addr
      } catch (err) {
        console.warn('[mint-observed] getChangeAddress failed — mirror will go to bank custody', err)
      }
    }

    // 6. Notify backend → syncs Mongo, best-effort mints Cardano mirror.
    //    Idempotent; safe even if it fails — the user already owns the NFT.
    const observed = await reportMintObserved({
      hexId,
      txHash: mintHash,
      cardanoAddress,
    }).catch((err) => {
      console.warn('[mint-observed] backend sync failed — NFT still minted on-chain', err)
      return null
    })

    // Prefer backend's canonical tokenId if it reported one.
    if (observed?.baseTokenId != null) evmTokenId = observed.baseTokenId

    syncNodeToMap(hexId)

    const explorerHost = intent.network === 'mainnet' ? 'basescan.org' : 'sepolia.basescan.org'
    const openSeaHost  = intent.network === 'mainnet' ? 'opensea.io/assets/base' : 'testnets.opensea.io/assets/base-sepolia'

    return {
      claimId,
      editionNumber,
      evmTokenId,
      contractAddress: GENESIS_CONTRACT,
      txHash:          mintHash,
      chain:           'base' as const,
      explorerUrl:     `https://${explorerHost}/tx/${mintHash}`,
      openSeaUrl:      `https://${openSeaHost}/${GENESIS_CONTRACT}/${evmTokenId}`,
      // Per-hex SVG rendered by dagwelldev-api — same URL the ERC-721
      // tokenURI points OpenSea at, so the card we show here is byte-
      // identical to the one marketplaces render.
      nftImageUrl: nftImageUrl({
        hexId,
        tokenId: evmTokenId,
        chain:   'base',
        claimId,
      }),
    }
  }

  // ── Cardano-primary payment flow (ATOMIC) ──────────────────────────────
  // Single transaction: buyer pays treasury AND mints+receives the CIP-68
  // user token in one settlement. No Kupo polling, no two-step "pay then
  // mint-observed" race condition.
  //
  // Flow:
  //   1. Read buyer change address from CIP-30 wallet.
  //   2. POST /hexes/cardano/prepare-tx — backend builds + partial-signs
  //      the atomic mint tx with the policy key. Returns CBOR.
  //   3. cardanoWallet.signTx(cbor, /*partial*/ true) — wallet adds the
  //      buyer witness, returns fully-signed CBOR.
  //   4. cardanoWallet.submitTx(fullySigned) — broadcasts directly.
  //   5. POST /hexes/cardano/confirm-tx — bookkeeping (Mongo flip).
  //      Skipping this would still leave the buyer holding their NFT —
  //      it just means the marketplace UI lags by one cycle.
  //
  // libsodium pre-init is still needed before Mesh's signTx/submitTx
  // because @cardano-sdk/crypto's transitive use of libsodium-wrappers-sumo
  // doesn't await its own readiness. See feedback_libsodium_nested_dep_dedupe.
  const handleCardanoPayment = async () => {
    if (!hexId) throw new Error('Select a hex before paying with Cardano')
    if (!cardanoConnected || !cardanoWallet) {
      throw new Error('Connect a Cardano wallet first (Lace, Eternl, Nami, Typhon, Flint)')
    }

    // 1. Buyer change address (also the user-token recipient)
    setEvmTxStatus('claiming')
    let buyerAddr = ''
    try {
      buyerAddr = await cardanoWallet.getChangeAddress()
    } catch (err) {
      throw new Error(`Could not read your Cardano address: ${(err as Error).message}`)
    }
    if (!buyerAddr || typeof buyerAddr !== 'string') {
      throw new Error('Cardano wallet returned no change address')
    }

    // 2. Backend builds + partial-signs the atomic mint tx
    const prepared = await prepareCardanoMintTx({ hexId, buyerAddress: buyerAddr })

    // Defensive price check — the backend's price config can drift; we
    // refuse to even prompt the wallet for anything < 1 ADA.
    if (!Number.isFinite(prepared.priceLovelace) || prepared.priceLovelace < 1_000_000) {
      throw new Error(
        `Backend returned price=${prepared.priceLovelace} lovelace — below the 1 ADA floor and almost certainly a misconfig. Set HEX_PRICE_LOVELACE_${prepared.network.toUpperCase()} (or HEX_PRICE_USD + ADA_USD_RATE) on the API, then retry.`
      )
    }

    const editionNumber = getGenesisPoolSlot(hexId, regionsData) ?? 0
    const claimId       = `G200-${String(editionNumber).padStart(3, '0')}`

    // 3 + 4. Buyer wallet adds witness, then submits directly
    setEvmTxStatus('approving')
    let txHash: string
    try {
      // libsodium WASM warm-up — same reason as before. We dedupe this
      // module via webpack alias in next.config.js so this is the same
      // instance Mesh's @cardano-sdk/crypto ends up using.
      const sodium = (await import('libsodium-wrappers-sumo')).default
      await sodium.ready

      // partialSign=true tells the wallet "you're not the only required
      // signer" (the policy witness is already on the tx). Without it,
      // some wallets refuse to sign claiming the tx is malformed.
      const fullySignedCbor = await cardanoWallet.signTx(prepared.txCbor, true)
      txHash = await cardanoWallet.submitTx(fullySignedCbor)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/declined|rejected|user|cancel/i.test(msg)) {
        throw new Error('Cardano payment was declined — retry when ready.')
      }
      if (/libsodium/i.test(msg) || /sodium/i.test(msg)) {
        throw new Error(
          'Cardano crypto libs failed to initialize. Reload the page and retry — if it persists, the dev server may have stale chunks (rm -rf apps/web/.next && restart).'
        )
      }
      throw new Error(`Cardano payment failed: ${msg}`)
    }

    // 5. Tell the backend so Mongo reflects the sale. Failure here
    //    doesn't roll back the on-chain mint — the buyer already has
    //    their NFT. We surface a soft warning instead of throwing.
    setEvmTxStatus('minting')
    let confirmed: Awaited<ReturnType<typeof confirmCardanoMintTx>> | null = null
    try {
      confirmed = await confirmCardanoMintTx({ purchaseId: prepared.purchaseId, txHash })
    } catch (err) {
      console.warn('[cardano] confirm-tx failed — NFT is on-chain but Mongo not updated', err)
    }

    syncNodeToMap(hexId)

    const explorerUrl = confirmed?.cardano.explorerUrl
      || (prepared.network === 'mainnet'
          ? `https://cardanoscan.io/transaction/${txHash}`
          : `https://preprod.cardanoscan.io/transaction/${txHash}`)

    return {
      claimId,
      editionNumber,
      evmTokenId:      undefined,
      contractAddress: undefined,
      txHash,
      chain:           'cardano' as const,
      explorerUrl,
      nftImageUrl: nftImageUrl({
        hexId,
        chain:   'cardano',
        claimId,
      }),
      cnftUrl:   explorerUrl,
      tokenName: `ref ${prepared.assetName.slice(0, 16)}…`,
    }
  }

  // ── Card checkout (Stripe) via dagwelldev-api ───────────────────────────
  // MVP requires an EVM address for the NFT to ultimately mint to (no
  // custody layer in v1), so the user must also have MetaMask connected.
  const handleCardCheckout = async () => {
    if (!hexId || !cardEmailOk) return
    if (!evmAddress) {
      setError('Connect your Base wallet first — that is where your NFT will be delivered after card payment.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Build redirects from the current origin so dev (localhost), preview,
      // and prod each round-trip the buyer back to themselves. Stripe
      // substitutes {CHECKOUT_SESSION_ID} into success_url at redirect time;
      // we also include hex= so /presale/card-complete can poll the right
      // hex without re-deriving it from session metadata.
      const origin     = window.location.origin
      const successUrl = `${origin}/presale/card-complete?hex=${encodeURIComponent(hexId)}&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl  = `${origin}/presale?hex=${encodeURIComponent(hexId)}`
      const intent = await createStripeCheckout(hexId, evmAddress, cardEmail.trim(), {
        successUrl,
        cancelUrl,
      })
      if (intent.url) {
        window.location.href = intent.url
        return
      }
      throw new Error('No checkout URL returned from backend')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Main payment dispatcher ───────────────────────────────────────────────
  // Branches on paymentMode — each lane is a standalone function with its
  // own chain/wallet/backend contract. Stripe is handled separately because
  // it redirects the browser instead of returning a result in-session.
  const handlePayment = async () => {
    setLoading(true)
    setError('')
    try {
      const result =
        paymentMode === 'cardano' ? await handleCardanoPayment() :
        /* base */                  await handleBasePayment()
      setSuccessData(result)
      setStep(5)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed — please try again')
    } finally {
      setLoading(false)
      setEvmTxStatus('')
    }
  }

  const submitLabel = () => {
    if (paymentMode === 'stripe') {
      if (!loading) return 'Pay $2,000 with card (Stripe)'
      return 'Redirecting to secure checkout…'
    }
    if (paymentMode === 'cardano') {
      if (!loading) return 'Confirm & pay with ADA'
      if (evmTxStatus === 'claiming')  return '1/3 Reserving hex globally…'
      if (evmTxStatus === 'approving') return '2/3 Sign ADA payment…'
      if (evmTxStatus === 'minting')   return '3/3 Minting your CIP-68 NFT…'
      return 'Processing…'
    }
    // base
    if (!loading) return 'Confirm & Mint on Base'
    if (evmTxStatus === 'claiming')  return '1/3 Reserving hex globally…'
    if (evmTxStatus === 'approving') return '2/3 Approving USDC…'
    if (evmTxStatus === 'minting')   return '3/3 Minting your NFT…'
    return 'Processing…'
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-4xl mx-auto bg-malama-card border border-gray-800 rounded-3xl shadow-2xl overflow-hidden my-12">
      {/* Progress: 1 Locate HEX · 2 Crypto/Card · 3 Review · 4 Pay · 5 Done */}
      <div className="flex border-b border-gray-800 bg-gray-900/50">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className={`flex-1 h-2 transition-colors duration-300 ${s <= step ? 'bg-malama-accent' : 'bg-transparent'}`} />
        ))}
      </div>

      <div className="p-8 md:p-12 min-h-[500px] relative flex flex-col justify-center text-left">
        <AnimatePresence mode="wait">

          {/* ─── Step 1: Locate HEX ────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="mb-10 text-center">
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-malama-accent">Step 1</p>
                <h2 className="flex flex-wrap items-center justify-center gap-2 text-4xl font-black text-white">
                  <MapPin className="h-10 w-10 shrink-0 text-malama-accent" />
                  Locate your HEX
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-400">
                  Choose one of the 200 Genesis hex territories on the live map. You need a hex selected before you can
                  pay with crypto or card.
                </p>
              </div>

              <div
                className={`mx-auto grid max-w-xl gap-4 rounded-2xl border p-8 text-center transition-all ${
                  hexId ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-800 bg-malama-deep'
                }`}
              >
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

          {/* ─── Step 2: Pay with crypto or card ─────────────────────────── */}
          {step === 2 && (
            <motion.div key="step2-setup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="mb-10 text-center">
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-malama-accent">Step 2</p>
                <h2 className="flex flex-wrap items-center justify-center gap-2 text-4xl font-black text-white">
                  <CreditCard className="h-9 w-9 shrink-0 text-malama-accent" />
                  Pay with crypto or card
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-400">
                  Crypto: connect Cardano (Lace) and/or Base (MetaMask). Card: pay with Stripe, then open Launch App and
                  sign in with Magic using the same email — your NFT mints to your embedded wallet on Base Sepolia.
                  Entry is $2,000 USDC or card checkout.
                </p>
                {hexId && (
                  <p className="text-malama-accent/90 mt-2 font-mono text-sm">
                    Hex: <span className="text-malama-accent">{hexId}</span>
                  </p>
                )}
              </div>

              {/* Lane picker — three tabs, one row. Each tab owns exactly one
                  chain/payment surface and swaps in its own connect UI below. */}
              <div className="mx-auto mb-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
                {([
                  { id: 'base',    label: 'Base L2',  sub: 'USDC · ERC-721',       icon: <Globe      className="w-4 h-4" /> },
                  { id: 'cardano', label: 'Cardano',  sub: 'ADA · CIP-68',         icon: <Wallet     className="w-4 h-4" /> },
                  { id: 'stripe',  label: 'Card',     sub: 'Stripe · fiat',        icon: <CreditCard className="w-4 h-4" /> },
                ] as const).map(({ id, label, sub, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMode(id)}
                    className={`px-5 py-4 rounded-2xl text-left border transition-all ${
                      paymentMode === id
                        ? 'bg-malama-accent/10 border-malama-accent text-malama-accent shadow-[0_0_20px_rgba(196,240,97,0.15)]'
                        : 'bg-gray-900/80 border-gray-800 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                      {icon} {label}
                    </div>
                    <p className={`mt-1 text-[11px] font-mono ${paymentMode === id ? 'text-malama-accent/80' : 'text-gray-500'}`}>
                      {sub}
                    </p>
                  </button>
                ))}
              </div>

              {paymentMode === 'stripe' ? (
                <div className="mx-auto max-w-xl space-y-6">
                  <p className="text-center text-sm leading-relaxed text-gray-500">
                    After checkout, your Genesis NFT is minted on Base to a new wallet we generate for you.
                    You&apos;ll receive a private transfer link — treat it like a password — to send the NFT to
                    MetaMask or another address when you want.
                  </p>
                  <label className="block text-left">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                      Email (receipt and wallet access)
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={cardEmail}
                      onChange={(e) => setCardEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-2 w-full rounded-xl border border-gray-800 bg-black/40 px-4 py-3 text-white placeholder:text-gray-600 focus:border-malama-accent focus:outline-none"
                    />
                  </label>
                </div>
              ) : paymentMode === 'cardano' ? (
                /* ── Cardano lane — ADA to treasury, CIP-68 primary ──────── */
                <div className="mx-auto max-w-xl">
                  <div className={`p-6 border rounded-2xl flex flex-col items-center text-center space-y-4 transition-all ${cardanoConnected ? 'bg-malama-accent/10 border-malama-accent/40 shadow-[0_0_20px_rgba(196,240,97,0.1)]' : 'bg-malama-deep border-gray-800 hover:border-gray-700'}`}>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${cardanoConnected ? 'bg-malama-accent/20' : 'bg-gray-800'}`}>
                      <Wallet className={`w-7 h-7 ${cardanoConnected ? 'text-malama-accent' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white uppercase tracking-wider text-xs">
                        Cardano wallet <span className="text-malama-accent normal-case">(required for this lane)</span>
                      </h3>
                      <p className={`text-sm mt-1 font-mono ${cardanoConnected ? 'text-malama-accent' : 'text-gray-500'}`}>
                        {cardanoConnected ? (cardanoWalletName?.toUpperCase() ?? 'CONNECTED') : 'DISCONNECTED'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        You&apos;ll sign an ADA payment to the Mālama treasury. After it confirms on
                        Cardano, the backend mints the CIP-68 hex license to this same wallet — that
                        NFT IS your ownership receipt (no Base mint on this lane).
                      </p>
                    </div>
                    {cardanoConnected ? (
                      <div className="w-full py-2 bg-malama-accent/20 border border-malama-accent/50 text-malama-accent rounded-lg font-bold text-xs text-center">
                        ✓ READY TO PAY IN ADA
                      </div>
                    ) : (
                      <div className="relative w-full">
                        <button
                          onClick={async () => {
                            const win = window as typeof window & {
                              cardano?: Record<string, { name?: string; icon?: string; enable: () => Promise<any> }>
                            }
                            const detected = Object.entries(win.cardano ?? {}).map(([key, w]) => ({
                              name: key,
                              icon: w.icon ?? '',
                            }))
                            if (detected.length === 0) {
                              setCardanoWallets([])
                              setShowCardanoPicker(true)
                            } else if (detected.length === 1) {
                              await connectCardanoWallet(detected[0].name)
                            } else {
                              setCardanoWallets(detected)
                              setShowCardanoPicker(true)
                            }
                          }}
                          className="w-full py-2 bg-malama-accent/10 border border-malama-accent/40 text-malama-accent rounded-lg font-bold text-xs hover:bg-malama-accent/20 transition-colors"
                        >
                          Connect Lace / Eternl / Nami / Typhon / Flint
                        </button>
                        {showCardanoPicker && cardanoWallets.length > 0 && (
                          <div className="absolute bottom-full mb-2 left-0 w-full bg-gray-900 border border-gray-700 rounded-xl overflow-hidden z-50 shadow-xl">
                            {cardanoWallets.map((w) => (
                              <button
                                key={w.name}
                                onClick={async () => {
                                  setShowCardanoPicker(false)
                                  await connectCardanoWallet(w.name)
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-800 transition-colors text-left"
                              >
                                {w.icon && <img src={w.icon} alt={w.name} className="w-5 h-5 rounded" />}
                                <span className="text-white text-xs font-bold uppercase tracking-wider">{w.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {showCardanoPicker && cardanoWallets.length === 0 && (
                          <div className="absolute bottom-full mb-2 left-0 w-full bg-gray-900 border border-gray-700 rounded-xl p-4 z-50 shadow-xl text-center">
                            <p className="text-gray-400 text-xs">No Cardano wallet detected.<br />Install Lace or Eternl.</p>
                          </div>
                        )}
                        {cardanoError && (
                          <p className="mt-2 text-[11px] leading-relaxed text-amber-400/90">
                            {cardanoError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Base lane — USDC + ERC-721 on Base ──────────────────── */
                <div className="mx-auto max-w-xl">
                  <div className={`p-6 border rounded-2xl flex flex-col items-center text-center space-y-4 transition-all ${evmConnected ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'bg-malama-deep border-gray-800 hover:border-gray-700'}`}>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${evmConnected ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                      <Globe className={`w-7 h-7 ${evmConnected ? 'text-blue-400' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white uppercase tracking-wider text-xs">
                        Base L2 wallet <span className="text-malama-accent normal-case">(required for this lane)</span>
                      </h3>
                      <p className={`text-sm mt-1 font-mono ${evmConnected ? 'text-blue-400' : 'text-gray-500'}`}>
                        {evmConnected ? `${evmAddress?.slice(0, 6)}…${evmAddress?.slice(-4)}` : 'DISCONNECTED'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Pay $2,000 USDC on Base → your wallet gets the Genesis ERC-721. A CIP-68
                        mirror is auto-anchored on Cardano (custodial by default).
                      </p>
                    </div>
                    {evmConnected ? (
                      <button onClick={() => disconnectEVM()} className="w-full py-2 bg-blue-500/20 border border-blue-500/50 text-blue-400 rounded-lg font-bold text-xs hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40 transition-colors">
                        Disconnect {evmAddress?.slice(0, 6)}…{evmAddress?.slice(-4)}
                      </button>
                    ) : (
                      <button
                        onClick={() => connectEVM({ connector: injected() })}
                        className="px-4 py-3 rounded-xl text-xs font-black transition-all shadow-lg w-full bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Connect MetaMask / Coinbase Wallet
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-bold text-gray-500 hover:text-gray-300"
                >
                  ← Back to locate HEX
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
                  Complete setup to continue
                </button>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                  Genesis 200 · One mint per hex · Global cross-chain lock
                </p>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Review ────────────────────────────────────────────── */}
          {step === 3 && (
            <motion.div key="step3-review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-3xl font-black text-white flex items-center">
                  <ShoppingCart className="mr-3 text-malama-accent w-8 h-8" /> Order Review
                </h2>
                {/* Lane badge is driven purely by paymentMode — the old code
                    used evmConnected as a proxy for "Base" which broke when
                    a buyer on the Cardano lane also happened to have MetaMask
                    connected from an earlier session. */}
                <span
                  className={`px-3 py-1.5 font-bold text-xs rounded-full border ${
                    paymentMode === 'stripe'
                      ? 'bg-violet-500/10 text-violet-300 border-violet-500/30'
                      : paymentMode === 'base'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        : 'bg-malama-accent/10 text-malama-accent border-malama-accent/30'
                  }`}
                >
                  {paymentMode === 'stripe'
                    ? 'CARD → BASE ERC-721 (custodial)'
                    : paymentMode === 'base'
                      ? '⬡ BASE L2  ERC-721'
                      : '₳ CARDANO  CIP-68'}
                </span>
              </div>

              <div className="bg-malama-deep rounded-2xl border border-gray-800 overflow-hidden shadow-inner">
                <div className="p-6 border-b border-gray-800 flex justify-between items-start gap-4">
                  <div>
                    <div className="font-bold text-white text-lg">Mālama Hex Node License NFT</div>
                    <p className="text-sm text-gray-500 mt-1">Hardware + exclusive geographic license + 125K MLMA allocation + 12mo support</p>
                    <p className="text-xs text-gray-600 mt-2 font-mono">Hex: {hexId}</p>
                    {paymentMode === 'stripe' && (
                      <p className="text-xs text-violet-400/90 mt-2 font-mono">Email: {cardEmail.trim()}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-white font-bold text-lg">$2,000</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {paymentMode === 'stripe' ? 'USD' : paymentMode === 'cardano' ? 'ADA equivalent' : 'USDC'}
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-gray-900/60 flex justify-between items-center">
                  <span className="font-black text-white text-xl">Total Due</span>
                  <span className="font-mono font-black text-malama-accent text-3xl drop-shadow-[0_0_10px_rgba(196,240,97,0.3)]">
                    {paymentMode === 'stripe'
                      ? '$2,000 USD (Stripe)'
                      : paymentMode === 'cardano'
                        ? '≈ $2,000 in ADA'
                        : '$2,000 USDC'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'MLMA Allocation', value: '125K', sub: '25% at boot · 75% vested' },
                  {
                    label: 'Chain',
                    value: paymentMode === 'cardano' ? 'Cardano' : 'Base L2',
                    sub:
                      paymentMode === 'stripe'
                        ? 'Custodial ERC-721 → you transfer'
                        : paymentMode === 'cardano'
                          ? 'CIP-68 Token (primary)'
                          : 'ERC-721 NFT',
                  },
                  { label: 'Revenue Start', value: 'Oct 2026', sub: 'Hardware ships Sept' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="p-4 border border-gray-800 rounded-2xl bg-malama-deep">
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{label}</p>
                    <p className="text-xl font-black text-malama-accent mt-1">{value}</p>
                    <p className="text-xs text-gray-600 mt-1">{sub}</p>
                  </div>
                ))}
              </div>

              <PurchaseLegalAcknowledgement value={legalAck} onChange={setLegalAck} />

              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="flex-1 py-5 bg-gray-900 border border-gray-800 text-gray-400 rounded-2xl font-black text-lg hover:bg-gray-800 transition-colors">
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!legalComplete}
                  className={`flex-[2] py-5 rounded-2xl font-black text-xl transition-transform shadow-2xl ${
                    legalComplete
                      ? `${
                          paymentMode === 'stripe'
                            ? 'bg-violet-600 text-white hover:scale-[1.02] shadow-violet-500/20'
                            : paymentMode === 'base'
                              ? 'bg-blue-600 text-white hover:scale-[1.02] shadow-blue-500/20'
                              : 'bg-malama-accent text-black hover:scale-[1.02] shadow-[0_0_20px_rgba(196,240,97,0.15)]'
                        }`
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                  }`}
                >
                  Confirm Order <ChevronRight className="inline w-6 h-6 ml-1" />
                </button>
              </div>
              {!legalComplete && (
                <p className="text-center text-xs text-amber-500/90">Accept all legal documents above to continue.</p>
              )}
            </motion.div>
          )}

          {/* ─── Step 4: Payment ────────────────────────────────────────────── */}
          {step === 4 && (
            <motion.div key="step4-pay" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 flex flex-col items-center justify-center text-center">
              {/* Chain visual — strictly keyed off paymentMode. evmConnected is
                  NOT a valid proxy for "Base lane" anymore: a Cardano buyer
                  can still have MetaMask connected from a previous session. */}
              <div
                className={`w-28 h-28 rounded-full flex items-center justify-center border-2 shadow-2xl ${
                  paymentMode === 'stripe'
                    ? 'bg-violet-500/10 border-violet-500/40 shadow-violet-500/20'
                    : paymentMode === 'base'
                      ? 'bg-blue-500/10 border-blue-500/40 shadow-blue-500/20'
                      : 'bg-malama-accent/10 border-malama-accent/40 shadow-[0_0_20px_rgba(196,240,97,0.15)]'
                }`}
              >
                {paymentMode === 'stripe' ? (
                  <CreditCard className="w-14 h-14 text-violet-300" />
                ) : paymentMode === 'base' ? (
                  <Globe className="w-14 h-14 text-blue-400" />
                ) : (
                  <Wallet className="w-14 h-14 text-malama-accent" />
                )}
              </div>

              <div>
                <h2 className="text-4xl font-black text-white">
                  {paymentMode === 'stripe' ? 'Pay with card' : 'Mint Your NFT'}
                </h2>
                <p className="text-gray-400 mt-3 max-w-md mx-auto leading-relaxed">
                  {paymentMode === 'stripe'
                    ? 'You will be redirected to Stripe Checkout. After payment clears, we mint your Genesis NFT on Base to the wallet you connected — no further action needed.'
                    : paymentMode === 'base'
                      ? 'Your wallet will prompt you to approve $2,000 USDC and then sign the mint transaction on Base.'
                      : 'Your Cardano wallet will prompt for an ADA payment to the Mālama treasury. Once the tx confirms, the backend mints your CIP-68 hex license directly to the same wallet.'}
                </p>
              </div>

              {/* Progress indicators — both Base and Cardano lanes share the
                  Reserve → Sign → Mint triple; Stripe redirects out so no
                  inline progress pips needed. */}
              {loading && paymentMode !== 'stripe' && (
                <div className="flex items-center gap-3 text-sm">
                  {(['claiming', 'approving', 'minting'] as const).map((s, i) => (
                    <React.Fragment key={s}>
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${evmTxStatus === s ? 'bg-malama-accent/20 border-malama-accent/50 text-malama-accent animate-pulse' : ['claiming', 'approving', 'minting'].indexOf(evmTxStatus as any) > i ? 'bg-malama-accent/15 border-malama-accent/40 text-malama-accent-dim' : 'bg-gray-900 border-gray-800 text-gray-600'}`}>
                        {['claiming', 'approving', 'minting'].indexOf(evmTxStatus as any) > i ? '✓' : i + 1}
                        {' '}{s === 'claiming'
                                ? 'Reserve'
                                : s === 'approving'
                                  ? (paymentMode === 'cardano' ? 'Sign ADA' : 'Approve')
                                  : 'Mint'}
                      </div>
                      {i < 2 && <span className="text-gray-700">→</span>}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-red-400 flex items-start gap-3 w-full max-w-lg text-sm text-left">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <LegalMintReminder />

              <div className="flex flex-col w-full max-w-lg gap-3">
                <button
                  onClick={paymentMode === 'stripe' ? handleCardCheckout : handlePayment}
                  disabled={loading || !legalComplete || (paymentMode === 'stripe' && !cardEmailOk)}
                  className={`w-full py-5 text-white rounded-2xl font-black text-xl transition-all shadow-2xl ${
                    loading || !legalComplete || (paymentMode === 'stripe' && !cardEmailOk)
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                      : paymentMode === 'stripe'
                        ? 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/25 hover:scale-[1.02]'
                        : paymentMode === 'base'
                          ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 hover:scale-[1.02]'
                          : 'bg-malama-accent text-black hover:bg-malama-accent-dim shadow-[0_0_20px_rgba(196,240,97,0.15)] hover:scale-[1.02]'
                  }`}
                >
                  {loading && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-middle" />}
                  {submitLabel()}
                </button>
                <button
                  disabled={loading}
                  onClick={() => { setError(''); setStep(3) }}
                  className="w-full py-3 text-gray-500 hover:text-gray-300 transition-colors font-bold text-sm"
                >
                  ← Back to Review
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 4: Success ────────────────────────────────────────────── */}
          {step === 5 && successData && (
            <motion.div key="step5-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8 flex flex-col items-center text-center pt-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring' }}>
                <CheckCircle2 className="w-20 h-20 text-malama-accent drop-shadow-[0_0_30px_rgba(196,240,97,0.5)]" />
              </motion.div>

              <div>
                <p className="text-malama-accent font-black uppercase tracking-widest text-sm mb-2">Node Secured</p>
                <h2 className="text-5xl font-black text-white tracking-tight">
                  <span className="text-malama-accent">{successData.claimId}</span>
                </h2>
                <p className="text-gray-500 text-sm font-mono mt-1">
                  Edition {String(successData.editionNumber).padStart(3, '0')} / 200
                  {successData.evmTokenId != null && (
                    <span className="text-gray-600"> · Token #{successData.evmTokenId}</span>
                  )}
                </p>
                <p className="text-gray-400 mt-2 text-sm">
                  Minted on <span className="text-white font-bold">{successData.chain === 'base' ? 'Base L2' : 'Cardano'}</span>
                </p>
                {successData.simulated && (
                  <p className="mt-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 inline-block">
                    ⚠️ Dev simulation — set env vars for real on-chain mint
                  </p>
                )}
              </div>

              {/* NFT Card */}
              <NftCard data={successData} hexId={hexId} />

              {/* Tx Hash */}
              <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 max-w-sm w-full">
                <span className="text-gray-500 text-xs font-mono flex-1 truncate">{shortHash(successData.txHash)}</span>
                <button onClick={() => copyHash(successData.txHash)} className="text-gray-500 hover:text-malama-accent transition-colors flex-shrink-0">
                  <Copy className="w-4 h-4" />
                </button>
                {copied && <span className="text-malama-accent text-xs">Copied!</span>}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                <a
                  href={successData.explorerUrl}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 py-4 bg-gray-900 border border-gray-800 text-gray-300 rounded-xl font-bold hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> View Transaction
                </a>

                {successData.openSeaUrl && (
                  <a
                    href={successData.openSeaUrl}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 py-4 bg-blue-950 border border-blue-800 text-blue-300 rounded-xl font-bold hover:bg-blue-900 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View on OpenSea
                  </a>
                )}

                {successData.cnftUrl && (
                  <a
                    href={successData.cnftUrl}
                    target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 py-4 bg-blue-950 border border-blue-800 text-blue-300 rounded-xl font-bold hover:bg-blue-900 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View on Cardanoscan
                  </a>
                )}

                {successData.chain === 'base' && successData.evmTokenId != null && (
                  <div className="sm:col-span-2 flex flex-col gap-2">
                    <button
                      onClick={() => addToMetaMask(successData.evmTokenId!)}
                      className="flex items-center justify-center gap-2 py-4 bg-orange-950 border border-orange-800 text-orange-300 rounded-xl font-bold hover:bg-orange-900 transition-colors w-full"
                    >
                      🦊 Add to MetaMask
                    </button>
                    {/* Manual import panel — always shown after clicking Add to MetaMask */}
                    {mmImportOpen && (
                      <div className="bg-gray-900 border border-orange-800/40 rounded-xl p-4 text-left space-y-3">
                        <p className="text-xs font-black uppercase tracking-wider text-orange-300">
                          Import NFT manually in MetaMask
                        </p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          MetaMask → NFTs tab → Import NFT → paste the values below.
                        </p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Network</p>
                            <p className="text-xs text-orange-200 font-mono">Base Sepolia (chain 84532)</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Contract Address</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white font-mono break-all flex-1">{successData.contractAddress ?? GENESIS_CONTRACT_FALLBACK}</span>
                              <button
                                onClick={() => copyMm(successData.contractAddress ?? GENESIS_CONTRACT_FALLBACK, 'address')}
                                className="flex-shrink-0 text-gray-500 hover:text-orange-300 transition-colors"
                                title="Copy"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {mmCopied === 'address' && <span className="text-orange-300 text-[10px]">Copied!</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Token ID</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white font-mono flex-1">{successData.evmTokenId}</span>
                              <button
                                onClick={() => copyMm(String(successData.evmTokenId), 'tokenId')}
                                className="flex-shrink-0 text-gray-500 hover:text-orange-300 transition-colors"
                                title="Copy"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              {mmCopied === 'tokenId' && <span className="text-orange-300 text-[10px]">Copied!</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <a
                  href="https://discord.gg/PcKRRUcJ"
                  target="_blank" rel="noreferrer"
                  className="sm:col-span-2 flex items-center justify-center gap-2 py-4 bg-[#5865F2] text-white rounded-xl font-bold hover:bg-[#4752C4] transition-colors shadow-[0_0_20px_rgba(88,101,242,0.3)]"
                >
                  <span className="text-lg">💬</span> Join Operator Discord
                </a>

                <Link
                  href="/"
                  className="sm:col-span-2 py-4 bg-malama-accent text-black rounded-xl font-black text-lg hover:scale-[1.02] transition-transform shadow-[0_0_30px_rgba(196,240,97,0.2)] text-center"
                >
                  Return to Mālama Labs →
                </Link>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@meshsdk/react'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import {
  ShieldCheck,
  Cpu,
  MapPin,
  CheckCircle2,
  Box,
  Radio,
  AlertCircle,
  TrendingUp,
  Lock,
  Mail,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { nftImageUrl } from '@/lib/api'
import { useMagic } from '@/components/magic/MagicProvider'

function hexToAscii(hexStr: string | undefined) {
  if (!hexStr || typeof hexStr !== 'string') return ''
  let str = ''
  for (let i = 0; i < hexStr.length; i += 2) {
    str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16))
  }
  return str
}

interface HexLicense {
  id: string
  chain: 'cardano' | 'base'
  assetName?: string
  tokenId?: number
}

export default function Dashboard() {
  const {
    connected: isCardanoConnected,
    wallet: cardanoWallet,
    connect: connectCardano,
    connecting: isCardanoConnecting,
  } = useWallet()

  const { isConnected: isEvmConnected, address: evmAddress } = useAccount()
  const { connect: connectEvm, isPending: isEvmConnecting } = useConnect()
  const { magic } = useMagic()

  // Magic email sign-in state (for card buyers who have no hardware wallet)
  const [magicEmail, setMagicEmail]         = useState('')
  const [magicAddress, setMagicAddress]     = useState<string | null>(null)
  const [magicLoading, setMagicLoading]     = useState(false)
  const [magicError, setMagicError]         = useState('')
  const [showMagicInput, setShowMagicInput] = useState(false)

  // Re-hydrate Magic session on page load (Magic persists login across refreshes)
  useEffect(() => {
    if (!magic) return
    magic.user.isLoggedIn().then((loggedIn: boolean) => {
      if (loggedIn) {
        magic.user.getInfo().then((info: { publicAddress?: string | null }) => {
          if (info.publicAddress) setMagicAddress(info.publicAddress)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [magic])

  const signInWithMagic = async () => {
    if (!magic) return
    const email = magicEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMagicError('Enter a valid email address')
      return
    }
    setMagicLoading(true); setMagicError('')
    try {
      await magic.auth.loginWithEmailOTP({ email })
      const info = await magic.user.getInfo() as { publicAddress?: string | null }
      if (info.publicAddress) {
        setMagicAddress(info.publicAddress)
        setShowMagicInput(false)
      } else {
        setMagicError('Could not retrieve wallet address — try again.')
      }
    } catch {
      setMagicError('Sign-in cancelled or failed — try again.')
    } finally {
      setMagicLoading(false)
    }
  }

  const [hexLicenses, setHexLicenses] = useState<HexLicense[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)

  const isAuthenticated = isCardanoConnected || isEvmConnected || !!magicAddress
  const effectiveEvmAddress = evmAddress ?? magicAddress ?? undefined
  const activePredictionMarkets = hexLicenses.length > 0 ? 8 : 0
  const currentStatus = hexLicenses.length > 0 ? 'Hardware Pending' : 'Awaiting Genesis License'

  // ── Scan wallet for Genesis licenses on connect ───────────────────────────
  useEffect(() => {
    async function resolveAssets() {
      if (isCardanoConnected && cardanoWallet) {
        setLoadingAssets(true)
        try {
          const rawAssets = await cardanoWallet.getAssets()
          const assets = Array.isArray(rawAssets) ? rawAssets : []
          const found: HexLicense[] = []
          for (const asset of assets) {
            if (asset?.unit && typeof asset.unit === 'string') {
              const assetNameHex = asset.unit.length > 56 ? asset.unit.slice(56) : ''
              if (assetNameHex.length > 0) {
                try {
                  const decoded = hexToAscii(assetNameHex)
                  // Genesis hex assets: 24-hex sha256 asset names (hex license)
                  // Asset names are 24 chars of lowercase hex from hexIdToAssetName()
                  if (/^[0-9a-f]{24}$/.test(decoded) || decoded.startsWith('Hex')) {
                    found.push({ id: decoded, chain: 'cardano', assetName: assetNameHex })
                  }
                } catch { /* skip */ }
              }
            }
          }
          setHexLicenses(found)
        } catch (e) {
          console.error('[Dashboard] Failed to scan Cardano assets', e)
        } finally {
          setLoadingAssets(false)
        }
      } else if (effectiveEvmAddress) {
        // TODO: query GenesisValidator.balanceOf / tokensOfOwner via publicClient
        // For now show empty state with a helpful CTA to the list page
        setHexLicenses([])
        setLoadingAssets(false)
      } else {
        setHexLicenses([])
      }
    }
    resolveAssets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardanoConnected, cardanoWallet, isEvmConnected, effectiveEvmAddress])

  return (
    <div className="relative min-h-screen bg-black p-6 font-sans text-gray-200 md:p-12">
      {/* ── Header ── */}
      <header className="mx-auto mb-10 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white">Node Command Center</h1>
          <p className="mt-1 font-mono text-sm text-malama-accent">
            {loadingAssets
              ? 'Scanning Omnichain Ledger…'
              : `${hexLicenses.length} Genesis License${hexLicenses.length !== 1 ? 's' : ''} Active`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAuthenticated ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Network Status</p>
                <div className="flex items-center gap-2">
                  {(isEvmConnected || magicAddress) && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
                  {isCardanoConnected && <span className="h-2 w-2 animate-pulse rounded-full bg-malama-accent" />}
                  {magicAddress && !isEvmConnected && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />}
                  <p className="text-lg font-bold text-white">{currentStatus}</p>
                </div>
                {magicAddress && !isEvmConnected && (
                  <p className="font-mono text-[10px] text-purple-400">
                    Magic · {magicAddress.slice(0, 8)}…{magicAddress.slice(-4)}
                  </p>
                )}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-malama-accent/30 bg-malama-deep shadow-[0_0_15px_rgba(196,240,97,0.2)]">
                <Cpu className="h-6 w-6 text-malama-accent" />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => connectCardano('lace')}
                disabled={isCardanoConnecting || isEvmConnecting}
                className="rounded-lg border border-malama-accent/50 bg-malama-accent/20 px-4 py-2 font-bold text-malama-accent transition-colors hover:bg-malama-accent hover:text-black disabled:opacity-50"
              >
                Lace / Cardano
              </button>
              <button
                type="button"
                onClick={() => connectEvm({ connector: injected() })}
                disabled={isCardanoConnecting || isEvmConnecting}
                className="rounded-lg border border-blue-500/50 bg-blue-500/20 px-4 py-2 font-bold text-blue-400 transition-colors hover:bg-blue-500 hover:text-white disabled:opacity-50"
              >
                MetaMask / Base
              </button>
              {magic && (
                <button
                  type="button"
                  onClick={() => setShowMagicInput(v => !v)}
                  className="rounded-lg border border-purple-500/50 bg-purple-500/20 px-4 py-2 font-bold text-purple-400 transition-colors hover:bg-purple-500 hover:text-white"
                >
                  Card buyer
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Auth gate overlay ── */}
      {!isAuthenticated && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pt-32 backdrop-blur-md">
          <div className="mx-4 max-w-md rounded-3xl border border-gray-800 bg-malama-card p-8 text-center shadow-2xl md:p-10">
            <ShieldCheck className="mx-auto mb-6 h-20 w-20 text-malama-accent drop-shadow-[0_0_20px_rgba(196,240,97,0.3)]" />
            <h2 className="mb-2 text-2xl font-black tracking-tight text-white">Access Node Command Center</h2>
            <p className="mb-6 leading-relaxed text-gray-400">
              Connect a wallet to load your on-chain Genesis licenses, or sign in with the email you used at checkout.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => connectCardano('lace')}
                disabled={isCardanoConnecting || isEvmConnecting || magicLoading}
                className="w-full rounded-xl border-2 border-malama-accent/50 bg-malama-accent/10 py-4 font-black text-malama-accent shadow-xl transition hover:bg-malama-accent hover:text-black disabled:opacity-50"
              >
                {isCardanoConnecting ? 'Connecting…' : 'Cardano — Lace / Eternl / Nami'}
              </button>

              <button
                type="button"
                onClick={() => connectEvm({ connector: injected() })}
                disabled={isCardanoConnecting || isEvmConnecting || magicLoading}
                className="w-full rounded-xl border-2 border-blue-500/50 bg-blue-500/10 py-4 font-black text-blue-400 shadow-xl transition hover:bg-blue-500 hover:text-white disabled:opacity-50"
              >
                {isEvmConnecting ? 'Connecting…' : 'Base — MetaMask / Injected'}
              </button>

              {magic && (
                <div className="rounded-xl border-2 border-purple-500/40 bg-purple-500/5 p-4">
                  <button
                    type="button"
                    onClick={() => setShowMagicInput(v => !v)}
                    className="flex w-full items-center justify-center gap-2 font-black text-purple-400 hover:text-purple-300"
                  >
                    <Mail className="h-4 w-4" />
                    Paid with card? Sign in with email
                  </button>
                  {showMagicInput && (
                    <div className="mt-3 space-y-2">
                      <input
                        type="email"
                        value={magicEmail}
                        onChange={e => setMagicEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void signInWithMagic() }}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-purple-500/30 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/60 focus:outline-none"
                      />
                      {magicError && <p className="text-xs text-red-400">{magicError}</p>}
                      <button
                        type="button"
                        onClick={() => void signInWithMagic()}
                        disabled={magicLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 font-black text-white transition hover:bg-purple-700 disabled:opacity-50"
                      >
                        {magicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        {magicLoading ? 'Sending OTP…' : 'Send one-time code'}
                      </button>
                      <p className="text-[10px] text-gray-600">
                        Use the same email from your Stripe checkout. A 6-digit code will be sent.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div
        className={`mx-auto grid max-w-6xl grid-cols-1 gap-8 transition-opacity duration-500 lg:grid-cols-3 ${
          !isAuthenticated ? 'pointer-events-none opacity-20' : 'opacity-100'
        }`}
      >
        <div className="space-y-8 lg:col-span-2">

          {/* Node Activation Protocol */}
          <section className="relative overflow-hidden rounded-3xl border border-gray-800 bg-malama-card p-8 shadow-2xl">
            <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-malama-accent to-blue-500" />
            <h2 className="mb-6 text-xl font-bold uppercase tracking-wider text-white">Node Activation Protocol</h2>

            <div className="relative mb-8 flex flex-col justify-between gap-6 md:flex-row">
              <div className="absolute left-0 top-1/2 -z-10 hidden h-1 w-full bg-gray-800 md:block" />

              <div className={`z-10 flex w-32 flex-col items-center bg-malama-card p-2 text-center ${hexLicenses.length === 0 ? 'opacity-40' : ''}`}>
                <CheckCircle2 className={`mb-2 h-10 w-10 rounded-full bg-malama-card ${hexLicenses.length > 0 ? 'text-malama-accent shadow-[0_0_20px_rgba(196,240,97,0.3)]' : 'text-gray-600'}`} />
                <span className={`font-bold ${hexLicenses.length > 0 ? 'text-white' : 'text-gray-400'}`}>License Ownership</span>
                <span className="mt-1 text-xs text-gray-500">{hexLicenses.length > 0 ? 'Genesis Deed Secured' : 'No License Found'}</span>
              </div>

              <div className={`z-10 flex w-32 flex-col items-center bg-malama-card p-2 text-center ${hexLicenses.length === 0 ? 'opacity-20 grayscale' : ''}`}>
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full border-4 ${hexLicenses.length > 0 ? 'border-malama-accent bg-malama-accent/20' : 'border-gray-700 bg-gray-800'}`}>
                  <Box className={`h-4 w-4 ${hexLicenses.length > 0 ? 'text-malama-accent' : 'text-gray-500'}`} />
                </div>
                <span className={`font-bold ${hexLicenses.length > 0 ? 'text-malama-accent' : 'text-gray-500'}`}>Hardware Shipped</span>
                <span className="mt-1 text-xs text-malama-accent/80">{hexLicenses.length > 0 ? 'Expected Oct 2026' : 'Pending Verification'}</span>
              </div>

              <div className="z-10 flex w-32 flex-col items-center bg-malama-card p-2 text-center opacity-40">
                <Radio className="mb-2 h-10 w-10 bg-malama-card text-gray-600" />
                <span className="font-bold text-gray-400">Data Uplink</span>
                <span className="mt-1 text-xs text-gray-500">Awaiting Sensor Boot</span>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
              <div className="flex items-start gap-4">
                <AlertCircle className="mt-1 h-6 w-6 flex-shrink-0 text-blue-400" />
                <div>
                  <h3 className="text-lg font-bold text-blue-400">Next Step: Plug &amp; Play Validation</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-300">
                    Once your sensor arrives, connect it to a standard power source within your Hex territory.
                    It will immediately begin broadcasting cryptographically-signed spatial data to the network
                    — no technical setup required. Revenue starts October 2026.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Your Licenses */}
          <section className="rounded-3xl border border-gray-800 bg-malama-card p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Your Genesis Licenses</h2>
              {isEvmConnected && (
                <Link
                  href="/list"
                  className="text-xs font-bold text-malama-accent hover:underline"
                >
                  View all on-chain →
                </Link>
              )}
            </div>

            {loadingAssets ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 p-10 text-center">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-t-2 border-malama-accent" />
                <p className="font-bold text-gray-400">Scanning Omnichain Ledger…</p>
              </div>
            ) : hexLicenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 p-10 text-center">
                <Lock className="mb-4 h-10 w-10 text-gray-600" />
                <p className="mb-2 text-xl font-bold text-gray-400">No Genesis Licenses Discovered</p>
                <p className="mb-6 max-w-md text-gray-500">
                  {isCardanoConnected || isEvmConnected
                    ? 'Your connected wallet holds 0 verified Genesis Node NFTs. Reserve one below.'
                    : 'Connect a wallet above to scan for on-chain licenses.'}
                </p>
                <Link
                  href="/presale"
                  className="rounded-xl border border-malama-accent/40 bg-malama-accent/10 px-6 py-3 font-black text-malama-accent hover:bg-malama-accent/20"
                >
                  Reserve a Genesis Node →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {hexLicenses.map((lic, i) => (
                  <div
                    key={`${lic.id}-${i}`}
                    className="group relative overflow-hidden rounded-xl border border-gray-700 bg-malama-deep p-5"
                  >
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-malama-accent/5 blur-2xl" />
                    <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <img
                          src={nftImageUrl({ hexId: lic.id, chain: lic.chain })}
                          alt={lic.id}
                          className="w-14 h-20 rounded-lg object-cover border border-malama-accent/20 shrink-0"
                        />
                        <div>
                          <span className={`rounded px-2 py-1 text-[10px] font-bold ${lic.chain === 'cardano' ? 'bg-malama-accent/20 text-malama-accent' : 'bg-blue-500/20 text-blue-400'}`}>
                            {lic.chain === 'cardano' ? 'CARDANO · CIP-68' : 'BASE · ERC-721'} · GENESIS
                          </span>
                          <p className="mt-2 font-mono text-sm font-bold text-white break-all">{lic.id}</p>
                          <p className="mt-1 text-xs text-gray-500">Active Data Markets: {activePredictionMarkets}</p>
                        </div>
                      </div>
                      <Link
                        href={`/map`}
                        className="inline-flex items-center rounded-lg border border-malama-accent/20 bg-malama-accent/10 px-3 py-1.5 text-xs font-bold text-malama-accent transition-colors hover:border-malama-accent hover:text-white"
                      >
                        <MapPin className="mr-1 h-3 w-3" /> View on Map
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Link
              href="/presale"
              className="mt-8 block w-full rounded-xl border border-gray-800 bg-gray-900 py-4 text-center text-lg font-black text-white transition-colors hover:bg-gray-800"
            >
              Acquire Additional Territory
            </Link>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <section className="rounded-3xl border border-gray-800 bg-malama-card p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-malama-accent" />
              <h2 className="text-xl font-bold uppercase tracking-wider text-white">Validator Fee Accruals</h2>
            </div>

            <div className="space-y-6">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">Prediction Market Yields</p>
                <div className="flex items-baseline gap-2">
                  <p className={`font-mono text-4xl font-black ${hexLicenses.length > 0 ? 'text-white' : 'text-gray-600'}`}>$0.00</p>
                  <p className="text-sm font-bold text-gray-500">USDC</p>
                </div>
              </div>
              <div className="h-px w-full bg-gray-800" />
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">MLMA Vesting</p>
                <div className="flex items-baseline gap-2">
                  <p className={`font-mono text-3xl font-bold ${hexLicenses.length > 0 ? 'text-gray-300' : 'text-gray-600'}`}>125,000</p>
                  <p className="text-sm font-bold text-malama-accent">MLMA</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">Vests at first sensor boot · Oct 2026</p>
              </div>
            </div>

            <div className="mt-8 w-full">
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-gray-700 bg-gray-900/50 py-3 text-sm font-bold text-gray-500"
              >
                Claim Yields — Awaiting Uplink
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-malama-accent/30 bg-malama-accent/10 p-4">
              <p className="text-xs font-bold leading-relaxed text-malama-accent/90">
                Once your hardware establishes a secure uplink, Prediction Markets resolving inside your Hex automatically
                pay validation fees directly to this ledger.
              </p>
            </div>
          </section>

          {/* Quick links */}
          <section className="rounded-3xl border border-gray-800 bg-malama-card p-6 shadow-xl space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Quick Links</h2>
            <Link href="/map" className="flex items-center gap-2 rounded-xl border border-gray-800 bg-malama-deep px-4 py-3 text-sm font-bold text-gray-300 hover:border-malama-accent/40 hover:text-malama-accent transition-colors">
              <MapPin className="h-4 w-4" /> Hex Territory Map
            </Link>
            <Link href="/docs" className="flex items-center gap-2 rounded-xl border border-gray-800 bg-malama-deep px-4 py-3 text-sm font-bold text-gray-300 hover:border-malama-accent/40 hover:text-malama-accent transition-colors">
              <Box className="h-4 w-4" /> Operator Docs
            </Link>
            <Link href="/presale" className="flex items-center gap-2 rounded-xl border border-malama-accent/30 bg-malama-accent/10 px-4 py-3 text-sm font-black text-malama-accent hover:bg-malama-accent/20 transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Reserve a Node
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}

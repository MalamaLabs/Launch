'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@meshsdk/react'
import { useAccount, useConnect, useDisconnect, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { injected } from 'wagmi/connectors'
import {
  ShieldCheck, Cpu, MapPin, CheckCircle2, Box, Radio,
  AlertCircle, TrendingUp, Lock, Mail, Loader2, LogOut, KeyRound, Package,
} from 'lucide-react'
import Link from 'next/link'
import { API_BASE, nftImageUrl } from '@/lib/api'
import { useMagic } from '@/components/magic/MagicProvider'

type AuthMethod = 'cardano' | 'evm' | 'magic' | null

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
    disconnect: disconnectCardano,
    connecting: isCardanoConnecting,
  } = useWallet()

  const { isConnected: isEvmConnected, address: evmAddress } = useAccount()
  const { connect: connectEvm, isPending: isEvmConnecting } = useConnect()
  const { disconnect: disconnectEvm } = useDisconnect()
  const publicClient = usePublicClient()
  const { magic } = useMagic()

  // Prevents the auto-detect effect from re-connecting immediately after an
  // intentional logout (wagmi / Mesh disconnect is async; isConnected stays
  // true for one render cycle while the provider unwinds).
  const loggedOutRef = useRef(false)

  const [authMethod, setAuthMethod]         = useState<AuthMethod>(null)
  const [magicEmail, setMagicEmail]         = useState('')
  const [magicAddress, setMagicAddress]     = useState<string | null>(null)
  const [loggedInEmail, setLoggedInEmail]   = useState<string | null>(null)
  const [magicLoading, setMagicLoading]     = useState(false)
  const [magicError, setMagicError]         = useState('')
  const [showMagicInput, setShowMagicInput] = useState(false)

  // Restore authMethod from sessionStorage on first render
  useEffect(() => {
    const saved = sessionStorage.getItem('dashboardAuthMethod') as AuthMethod
    if (saved) setAuthMethod(saved)
  }, [])

  // Keep sessionStorage in sync
  useEffect(() => {
    if (authMethod) {
      sessionStorage.setItem('dashboardAuthMethod', authMethod)
    } else {
      sessionStorage.removeItem('dashboardAuthMethod')
    }
  }, [authMethod])

  // Auto-detect an existing wallet connection when no sessionStorage entry
  // exists — handles the case where the user arrives from an external link or
  // browser-session recovery (wagmi/Mesh persist their state independently).
  useEffect(() => {
    if (authMethod !== null) return          // already set — don't override
    if (loggedOutRef.current) return         // don't re-detect while wagmi/Mesh are still unwinding
    if (isEvmConnected) setAuthMethod('evm')
    else if (isCardanoConnected) setAuthMethod('cardano')
    // Magic session is handled by its own effect below
  }, [authMethod, isEvmConnected, isCardanoConnected])

  // Once both providers have actually disconnected, clear the logout guard so
  // future page visits / wallet auto-reconnects work normally.
  useEffect(() => {
    if (!isEvmConnected && !isCardanoConnected) {
      loggedOutRef.current = false
    }
  }, [isEvmConnected, isCardanoConnected])

  // Re-hydrate a persisted Magic session after page refresh
  useEffect(() => {
    if (!magic) return
    magic.user.isLoggedIn().then((loggedIn: boolean) => {
      if (!loggedIn) return
      magic.user.getInfo().then((info: any) => {
        const addr = info.wallets?.ethereum?.publicAddress
        if (addr) setMagicAddress(addr)
        if (info.email) {
          setLoggedInEmail(info.email)
          setAuthMethod(prev => prev ?? 'magic')
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [magic])

  // Load existing shipping profile once auth is known
  useEffect(() => {
    if (!authMethod) return
    const wallet = authMethod === 'evm' ? evmAddress : authMethod === 'magic' ? (magicAddress ?? undefined) : undefined
    const email  = authMethod === 'magic' ? loggedInEmail ?? '' : ''
    const param  = wallet ? `wallet=${encodeURIComponent(wallet)}` : email ? `email=${encodeURIComponent(email)}` : null
    if (!param) return

    fetch(`/api/shipping?${param}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data) return
        if (data.notificationEmail) setNotifEmail(data.notificationEmail)
        if (data.shipping) {
          setShipName(data.shipping.name ?? '')
          setShipLine1(data.shipping.line1 ?? '')
          setShipLine2(data.shipping.line2 ?? '')
          setShipCity(data.shipping.city ?? '')
          setShipState(data.shipping.state ?? '')
          setShipPostal(data.shipping.postalCode ?? '')
          setShipCountry(data.shipping.country ?? 'US')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod, evmAddress, magicAddress, loggedInEmail])

  // Pre-fill notification email from Magic session
  useEffect(() => {
    if (loggedInEmail && !notifEmail) setNotifEmail(loggedInEmail)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInEmail])

  async function saveShipping() {
    setShipSaving(true)
    setShipError('')
    setShipSaved(false)
    try {
      const wallet = authMethod === 'evm' ? evmAddress : authMethod === 'magic' ? (magicAddress ?? undefined) : undefined
      const body: Record<string, unknown> = {
        email: notifEmail.trim() || undefined,
        wallet,
        shipping: {
          name:       shipName,
          line1:      shipLine1,
          line2:      shipLine2,
          city:       shipCity,
          state:      shipState,
          postalCode: shipPostal,
          country:    shipCountry,
        },
      }
      const res = await fetch('/api/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(typeof d.error === 'string' ? d.error : 'Save failed')
      }
      setShipSaved(true)
      setTimeout(() => setShipSaved(false), 3000)
    } catch (e) {
      setShipError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setShipSaving(false)
    }
  }

  async function handleCardanoConnect() {
    const win = window as any
    const detected = Object.keys(win.cardano ?? {})
    if (detected.length === 0) return
    loggedOutRef.current = false
    await connectCardano(detected[0])
    setAuthMethod('cardano')
  }

  function handleEvmConnect() {
    loggedOutRef.current = false
    connectEvm({ connector: injected() })
    setAuthMethod('evm')
  }

  const signInWithMagic = async () => {
    if (!magic) return
    const email = magicEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMagicError('Enter a valid email address')
      return
    }
    setMagicLoading(true)
    setMagicError('')
    try {
      await magic.auth.loginWithEmailOTP({ email })
      const info = await magic.user.getInfo()
      const addr = info.wallets?.ethereum?.publicAddress
      if (addr) {
        setMagicAddress(addr)
        setLoggedInEmail(email)
        setAuthMethod('magic')
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

  const handleLogout = async () => {
    // Raise the guard BEFORE calling disconnect so the auto-detect effect
    // can't re-connect during the async unwind period.
    loggedOutRef.current = true
    if (authMethod === 'magic' && magic) {
      try { await magic.user.logout() } catch { /* ignore */ }
      setMagicAddress(null)
      setLoggedInEmail(null)
    } else if (authMethod === 'evm') {
      disconnectEvm()
    } else if (authMethod === 'cardano') {
      disconnectCardano()
    }
    setAuthMethod(null)
    setHexLicenses([])
    setShowMagicInput(false)
    setMagicEmail('')
    setMagicError('')
  }

  // ── Shipping + notification email ────────────────────────────────────────
  const [shipName,    setShipName]    = useState('')
  const [shipLine1,   setShipLine1]   = useState('')
  const [shipLine2,   setShipLine2]   = useState('')
  const [shipCity,    setShipCity]    = useState('')
  const [shipState,   setShipState]   = useState('')
  const [shipPostal,  setShipPostal]  = useState('')
  const [shipCountry, setShipCountry] = useState('US')
  const [notifEmail,  setNotifEmail]  = useState('')
  const [shipSaving,  setShipSaving]  = useState(false)
  const [shipSaved,   setShipSaved]   = useState(false)
  const [shipError,   setShipError]   = useState('')

  const [hexLicenses, setHexLicenses] = useState<HexLicense[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  // Incremented to retry resolveAssets when the Cardano wallet is connected
  // but not yet fully initialised (getChangeAddress returns null on first call).
  const [walletRetryTick, setWalletRetryTick] = useState(0)

  const isAuthenticated = authMethod !== null

  const activeEvmAddress: string | undefined =
    authMethod === 'evm'   ? evmAddress :
    authMethod === 'magic' ? (magicAddress ?? undefined) :
    undefined

  const activePredictionMarkets = hexLicenses.length > 0 ? 8 : 0
  const currentStatus = hexLicenses.length > 0 ? 'Hardware Pending' : 'Awaiting Genesis License'

  useEffect(() => {
    async function resolveAssets() {
      if (!authMethod) { setHexLicenses([]); return }
      setLoadingAssets(true)
      try {
        if (authMethod === 'cardano') {
          if (!isCardanoConnected || !cardanoWallet) { setHexLicenses([]); return }

          // Step 1 — get the change address first (most reliable Mesh call).
          // This is the address the DB records at purchase time for Cardano buys.
          const changeAddr = await cardanoWallet.getChangeAddress().catch(() => null as string | null)

          if (!changeAddr) {
            // Wallet connected but can't vend an address yet — Mesh is still
            // initialising internally. Schedule a retry so the effect re-runs
            // once the wallet is ready rather than silently giving up.
            setHexLicenses([])
            setTimeout(() => setWalletRetryTick(t => t + 1), 400)
            return
          }

          const found: HexLicense[] = []

          // Step 2 — DB lookup on change address immediately (primary path).
          try {
            const r = await fetch(`${API_BASE}/hexes/by-owner?cardanoAddress=${encodeURIComponent(changeAddr)}`, { cache: 'no-store' })
            if (r.ok) {
              const data = await r.json() as { hexes?: Array<{ hexId: string }> }
              for (const h of data.hexes ?? []) {
                if (!found.some(f => f.id === h.hexId)) found.push({ id: h.hexId, chain: 'cardano' })
              }
            }
          } catch { /* non-fatal */ }

          // Step 3 — also check any previously-used addresses (change address
          // rotates on each tx; DB stores whichever was current at purchase time).
          const usedAddrs = await cardanoWallet.getUsedAddresses().catch(() => [] as string[])
          const extraAddrs = usedAddrs.filter(a => a !== changeAddr)
          await Promise.all(
            extraAddrs.map(async addr => {
              try {
                const r = await fetch(`${API_BASE}/hexes/by-owner?cardanoAddress=${encodeURIComponent(addr)}`, { cache: 'no-store' })
                if (!r.ok) return
                const data = await r.json() as { hexes?: Array<{ hexId: string }> }
                for (const h of data.hexes ?? []) {
                  if (!found.some(f => f.id === h.hexId)) found.push({ id: h.hexId, chain: 'cardano' })
                }
              } catch { /* non-fatal */ }
            })
          )

          // Step 4 — on-chain CIP-68 label-222 scan (secondary; may not match
          // DB records for freshly-minted tokens, but catches direct transfers).
          // CIP-68 user token unit: 56-char policyId + "000de140" + 48-char name
          const rawAssets = await cardanoWallet.getAssets().catch(() => [] as Awaited<ReturnType<typeof cardanoWallet.getAssets>>)
          const assets = Array.isArray(rawAssets) ? rawAssets : []
          for (const asset of assets) {
            if (asset?.unit && typeof asset.unit === 'string' && asset.unit.length >= 64) {
              if (asset.unit.slice(56, 64) !== '000de140') continue
              const assetNameHex = asset.unit.slice(64)
              try {
                const decoded = hexToAscii(assetNameHex)
                if (/^[0-9a-f]{24}$/.test(decoded) && !found.some(f => f.id === decoded)) {
                  found.push({ id: decoded, chain: 'cardano', assetName: assetNameHex })
                }
              } catch { /* skip malformed */ }
            }
          }

          setHexLicenses(found)

        } else if (authMethod === 'magic') {
          if (!loggedInEmail) { setHexLicenses([]); return }

          // Primary: look up by email (direct Stripe purchase stores email)
          const emailResp = await fetch(`${API_BASE}/hexes/by-owner?email=${encodeURIComponent(loggedInEmail)}`, { cache: 'no-store' })
          if (!emailResp.ok) throw new Error(`/hexes/by-owner returned ${emailResp.status}`)
          const emailData = await emailResp.json() as { hexes?: Array<{ hexId: string; baseTokenId?: number }> }
          const emailHexes = emailData.hexes ?? []

          // Fallback: Stripe webhook mints to the Magic custodial EVM address via
          // adminSecureNode — look that up too and merge results.
          let evmHexes: Array<{ hexId: string; baseTokenId?: number }> = []
          if (magic) {
            try {
              const info = await magic.user.getInfo()
              const evmAddr = info.wallets?.ethereum?.publicAddress
              if (evmAddr) {
                const evmResp = await fetch(`${API_BASE}/hexes/by-owner?evmAddress=${encodeURIComponent(evmAddr)}`, { cache: 'no-store' })
                if (evmResp.ok) {
                  const evmData = await evmResp.json() as { hexes?: Array<{ hexId: string; baseTokenId?: number }> }
                  evmHexes = evmData.hexes ?? []
                }
              }
            } catch { /* non-fatal */ }
          }

          // Merge, deduplicate by hexId
          const merged = [...emailHexes]
          for (const h of evmHexes) {
            if (!merged.some(m => m.hexId === h.hexId)) merged.push(h)
          }
          setHexLicenses(merged.map(h => ({ id: h.hexId, chain: 'base' as const, tokenId: h.baseTokenId })))

        } else if (authMethod === 'evm') {
          if (!activeEvmAddress) { setHexLicenses([]); return }
          const contractAddr = (
            process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_SEPOLIA ??
            process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_MAINNET ?? ''
          ) as `0x${string}`
          const NODE_SECURED_EVENT = parseAbiItem('event NodeSecured(address indexed operator, uint256 indexed tokenId, string hexId)')
          const [dbResult, onChainLogs] = await Promise.allSettled([
            fetch(`${API_BASE}/hexes/by-owner?evmAddress=${encodeURIComponent(activeEvmAddress)}`, { cache: 'no-store' })
              .then(r => r.ok
                ? (r.json() as Promise<{ hexes?: Array<{ hexId: string; baseTokenId?: number }> }>)
                : Promise.resolve({ hexes: [] as Array<{ hexId: string; baseTokenId?: number }> })),
            publicClient && contractAddr
              ? publicClient.getLogs({ address: contractAddr, event: NODE_SECURED_EVENT, args: { operator: activeEvmAddress as `0x${string}` }, fromBlock: BigInt(0) })
              : Promise.resolve([]),
          ])
          const merged: HexLicense[] = (dbResult.status === 'fulfilled' ? dbResult.value.hexes ?? [] : [])
            .map(h => ({ id: h.hexId, chain: 'base' as const, tokenId: h.baseTokenId }))
          if (onChainLogs.status === 'fulfilled') {
            for (const log of onChainLogs.value) {
              const hexId   = (log.args as { hexId?: string }).hexId ?? ''
              const tokenId = Number((log.args as { tokenId?: bigint }).tokenId ?? 0)
              if (hexId && !merged.some(m => m.id === hexId)) merged.push({ id: hexId, chain: 'base' as const, tokenId })
            }
          }
          setHexLicenses(merged)
        }
      } catch (e) {
        console.error('[Dashboard] resolveAssets error', e)
        setHexLicenses([])
      } finally {
        setLoadingAssets(false)
      }
    }
    resolveAssets()
  }, [authMethod, isCardanoConnected, cardanoWallet, loggedInEmail, activeEvmAddress, publicClient, walletRetryTick])

  return (
    <div className="relative min-h-screen bg-black p-6 font-sans text-gray-200 md:p-12">
      <header className="mx-auto mb-10 flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-white">Node Command Center</h1>
          <p className="mt-1 font-mono text-sm text-malama-accent">
            {loadingAssets ? 'Scanning Omnichain Ledger…' : `${hexLicenses.length} Genesis License${hexLicenses.length !== 1 ? 's' : ''} Active`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAuthenticated ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Network Status</p>
                <div className="flex items-center gap-2">
                  {authMethod === 'evm'     && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
                  {authMethod === 'cardano' && <span className="h-2 w-2 animate-pulse rounded-full bg-malama-accent" />}
                  {authMethod === 'magic'   && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />}
                  <p className="text-lg font-bold text-white">{currentStatus}</p>
                </div>
                {loggedInEmail && <p className="font-mono text-[10px] text-purple-400">{loggedInEmail}</p>}
                {authMethod === 'cardano' && <p className="font-mono text-[10px] text-malama-accent">Cardano wallet</p>}
                {authMethod === 'evm' && evmAddress && (
                  <p className="font-mono text-[10px] text-blue-400">{evmAddress.slice(0,6)}…{evmAddress.slice(-4)}</p>
                )}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-malama-accent/30 bg-malama-deep shadow-[0_0_15px_rgba(196,240,97,0.2)]">
                <Cpu className="h-6 w-6 text-malama-accent" />
              </div>
              <button type="button" onClick={() => void handleLogout()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-bold text-gray-400 transition-colors hover:border-red-500/40 hover:text-red-400">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleCardanoConnect()} disabled={isCardanoConnecting || isEvmConnecting}
                className="rounded-lg border border-malama-accent/50 bg-malama-accent/20 px-4 py-2 font-bold text-malama-accent transition-colors hover:bg-malama-accent hover:text-black disabled:opacity-50">
                Lace / Cardano
              </button>
              <button type="button" onClick={handleEvmConnect} disabled={isCardanoConnecting || isEvmConnecting}
                className="rounded-lg border border-blue-500/50 bg-blue-500/20 px-4 py-2 font-bold text-blue-400 transition-colors hover:bg-blue-500 hover:text-white disabled:opacity-50">
                MetaMask / Base
              </button>
              {magic && (
                <button type="button" onClick={() => setShowMagicInput(v => !v)}
                  className="rounded-lg border border-purple-500/50 bg-purple-500/20 px-4 py-2 font-bold text-purple-400 transition-colors hover:bg-purple-500 hover:text-white">
                  Card buyer
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {!isAuthenticated && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 pt-32 backdrop-blur-md">
          <div className="mx-4 max-w-md rounded-3xl border border-gray-800 bg-malama-card p-8 text-center shadow-2xl md:p-10">
            <ShieldCheck className="mx-auto mb-6 h-20 w-20 text-malama-accent drop-shadow-[0_0_20px_rgba(196,240,97,0.3)]" />
            <h2 className="mb-2 text-2xl font-black tracking-tight text-white">Access Node Command Center</h2>
            <p className="mb-6 leading-relaxed text-gray-400">
              Connect a wallet to load your on-chain Genesis licenses, or sign in with the email you used at checkout.
            </p>
            <div className="space-y-3">
              <button type="button" onClick={() => void handleCardanoConnect()} disabled={isCardanoConnecting || isEvmConnecting || magicLoading}
                className="w-full rounded-xl border-2 border-malama-accent/50 bg-malama-accent/10 py-4 font-black text-malama-accent shadow-xl transition hover:bg-malama-accent hover:text-black disabled:opacity-50">
                {isCardanoConnecting ? 'Connecting…' : 'Cardano — Lace / Eternl / Nami'}
              </button>
              <button type="button" onClick={handleEvmConnect} disabled={isCardanoConnecting || isEvmConnecting || magicLoading}
                className="w-full rounded-xl border-2 border-blue-500/50 bg-blue-500/10 py-4 font-black text-blue-400 shadow-xl transition hover:bg-blue-500 hover:text-white disabled:opacity-50">
                {isEvmConnecting ? 'Connecting…' : 'Base — MetaMask / Injected'}
              </button>
              {magic ? (
                <div className="rounded-xl border-2 border-purple-500/40 bg-purple-500/5 p-4">
                  <button type="button" onClick={() => setShowMagicInput(v => !v)}
                    className="flex w-full items-center justify-center gap-2 font-black text-purple-400 hover:text-purple-300">
                    <Mail className="h-4 w-4" /> Paid with card? Sign in with email
                  </button>
                  {showMagicInput && (
                    <div className="mt-3 space-y-2">
                      <input type="email" value={magicEmail}
                        onChange={e => setMagicEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void signInWithMagic() }}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-purple-500/30 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-purple-500/60 focus:outline-none" />
                      {magicError && <p className="text-xs text-red-400">{magicError}</p>}
                      <button type="button" onClick={() => void signInWithMagic()} disabled={magicLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 font-black text-white transition hover:bg-purple-700 disabled:opacity-50">
                        {magicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        {magicLoading ? 'Sending OTP…' : 'Send one-time code'}
                      </button>
                      <p className="text-[10px] text-gray-600">Use the same email from your Stripe checkout. A 6-digit code will be sent.</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-xs text-yellow-500/80">Email sign-in requires <code>NEXT_PUBLIC_MAGIC_API_KEY</code> to be configured.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`mx-auto grid max-w-6xl grid-cols-1 gap-8 transition-opacity duration-500 lg:grid-cols-3 ${!isAuthenticated ? 'pointer-events-none opacity-20' : 'opacity-100'}`}>
        <div className="space-y-8 lg:col-span-2">
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
                  <p className="mt-1 text-sm leading-relaxed text-gray-300">Once your sensor arrives, connect it to a standard power source within your Hex territory. It will immediately begin broadcasting cryptographically-signed spatial data to the network — no technical setup required. Revenue starts October 2026.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-800 bg-malama-card p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Your Genesis Licenses</h2>
              {authMethod === 'evm' && <Link href="/list" className="text-xs font-bold text-malama-accent hover:underline">View all on-chain →</Link>}
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
                  {authMethod === 'cardano' && isCardanoConnected ? 'Your Cardano wallet holds 0 verified Genesis Node NFTs.'
                    : authMethod === 'evm' ? 'Your EVM wallet holds 0 verified Genesis Node NFTs.'
                    : authMethod === 'magic' && loggedInEmail ? `No purchases found for ${loggedInEmail}.`
                    : 'Connect a wallet above to scan for on-chain licenses.'} Reserve one below.
                </p>
                <Link href="/presale" className="rounded-xl border border-malama-accent/40 bg-malama-accent/10 px-6 py-3 font-black text-malama-accent hover:bg-malama-accent/20">
                  Reserve a Genesis Node →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {hexLicenses.map((lic, i) => (
                  <div key={`${lic.id}-${i}`} className="group relative overflow-hidden rounded-xl border border-gray-700 bg-malama-deep p-5">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-malama-accent/5 blur-2xl" />
                    <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <img src={nftImageUrl({ hexId: lic.id, chain: lic.chain })} alt={lic.id}
                          className="h-20 w-14 shrink-0 rounded-lg border border-malama-accent/20 object-cover" />
                        <div>
                          <span className={`rounded px-2 py-1 text-[10px] font-bold ${lic.chain === 'cardano' ? 'bg-malama-accent/20 text-malama-accent' : 'bg-blue-500/20 text-blue-400'}`}>
                            {lic.chain === 'cardano' ? 'CARDANO · CIP-68' : 'BASE · ERC-721'} · GENESIS
                          </span>
                          <p className="mt-2 break-all font-mono text-sm font-bold text-white">{lic.id}</p>
                          <p className="mt-1 text-xs text-gray-500">Active Data Markets: {activePredictionMarkets}</p>
                        </div>
                      </div>
                      <Link href="/explorer"
                        className="inline-flex items-center rounded-lg border border-malama-accent/20 bg-malama-accent/10 px-3 py-1.5 text-xs font-bold text-malama-accent transition-colors hover:border-malama-accent hover:text-white">
                        <MapPin className="mr-1 h-3 w-3" /> View on Map
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/presale" className="mt-8 block w-full rounded-xl border border-gray-800 bg-gray-900 py-4 text-center text-lg font-black text-white transition-colors hover:bg-gray-800">
              Acquire Additional Territory
            </Link>
          </section>
        </div>

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
              <button type="button" disabled
                className="w-full cursor-not-allowed rounded-lg border border-gray-700 bg-gray-900/50 py-3 text-sm font-bold text-gray-500">
                Claim Yields — Awaiting Uplink
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-malama-accent/30 bg-malama-accent/10 p-4">
              <p className="text-xs font-bold leading-relaxed text-malama-accent/90">
                Once your hardware establishes a secure uplink, Prediction Markets resolving inside your Hex automatically pay validation fees directly to this ledger.
              </p>
            </div>
          </section>
          <section className="space-y-3 rounded-3xl border border-gray-800 bg-malama-card p-6 shadow-xl">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">Quick Links</h2>
            <Link href="/explorer" className="flex items-center gap-2 rounded-xl border border-gray-800 bg-malama-deep px-4 py-3 text-sm font-bold text-gray-300 transition-colors hover:border-malama-accent/40 hover:text-malama-accent">
              <MapPin className="h-4 w-4" /> Hex Territory Map
            </Link>
            <Link href="/docs" className="flex items-center gap-2 rounded-xl border border-gray-800 bg-malama-deep px-4 py-3 text-sm font-bold text-gray-300 transition-colors hover:border-malama-accent/40 hover:text-malama-accent">
              <Box className="h-4 w-4" /> Operator Docs
            </Link>
            <Link href="/presale" className="flex items-center gap-2 rounded-xl border border-malama-accent/30 bg-malama-accent/10 px-4 py-3 text-sm font-black text-malama-accent transition-colors hover:bg-malama-accent/20">
              <CheckCircle2 className="h-4 w-4" /> Reserve a Node
            </Link>
          </section>

          {authMethod === 'magic' && (
            <section className="rounded-3xl border border-gray-800 bg-malama-card p-6 shadow-xl">
              <div className="mb-4 flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-purple-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Magic Wallet</h2>
              </div>
              {loggedInEmail && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Email</p>
                  <p className="mt-0.5 font-mono text-xs text-purple-300 break-all">{loggedInEmail}</p>
                </div>
              )}
              {magicAddress && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">EVM Address</p>
                  <p className="mt-0.5 font-mono text-xs text-gray-300 break-all">{magicAddress}</p>
                </div>
              )}
              <p className="mb-4 text-xs text-gray-500 leading-relaxed">
                Export your private key to import into MetaMask or any other wallet. Only you can see this.
              </p>
              <button
                type="button"
                onClick={() => void magic?.user.revealEVMPrivateKey()}
                disabled={!magic}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/10 py-3 text-sm font-bold text-purple-400 transition hover:bg-purple-500/20 disabled:opacity-40"
              >
                <KeyRound className="h-4 w-4" /> Export Private Key
              </button>
            </section>
          )}

          {/* Shipping & Updates — visible for all auth methods */}
          <section className="rounded-3xl border border-gray-800 bg-malama-card p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <Package className="h-5 w-5 text-malama-accent" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Shipping &amp; Updates</h2>
            </div>
            <p className="mb-4 text-xs text-gray-500 leading-relaxed">
              We&apos;ll ship your sensor here and send order updates to the email below.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Notification email</label>
                <input type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Full name</label>
                <input type="text" value={shipName} onChange={e => setShipName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Address line 1</label>
                <input type="text" value={shipLine1} onChange={e => setShipLine1(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Address line 2 <span className="text-gray-700 font-normal">(optional)</span></label>
                <input type="text" value={shipLine2} onChange={e => setShipLine2(e.target.value)}
                  placeholder="Apt 4B"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">City</label>
                  <input type="text" value={shipCity} onChange={e => setShipCity(e.target.value)}
                    placeholder="San Francisco"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">State</label>
                  <input type="text" value={shipState} onChange={e => setShipState(e.target.value)}
                    placeholder="CA"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">ZIP / Postal</label>
                  <input type="text" value={shipPostal} onChange={e => setShipPostal(e.target.value)}
                    placeholder="94105"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1">Country</label>
                  <input type="text" value={shipCountry} onChange={e => setShipCountry(e.target.value)}
                    placeholder="US"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
              </div>
            </div>
            {shipError && <p className="mt-3 text-xs text-red-400">{shipError}</p>}
            <button type="button" onClick={() => void saveShipping()} disabled={shipSaving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-malama-accent/50 bg-malama-accent/10 py-3 text-sm font-bold text-malama-accent transition hover:bg-malama-accent/20 disabled:opacity-50">
              {shipSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {shipSaving ? 'Saving…' : shipSaved ? '✓ Saved' : 'Save shipping info'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import {
  Cpu, MapPin, CheckCircle2, Box, Radio,
  AlertCircle, TrendingUp, Lock, Loader2, KeyRound, Package,
  User, Link2, AtSign,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { API_BASE, nftImageUrl, getShipping, saveShipping as saveShippingProfile } from '@/lib/api'
import { useMagic } from '@/components/magic/MagicProvider'

// 'email' = email-session cookie only (no wallet, no Magic SDK required)
type AuthMethod = 'evm' | 'magic' | 'email' | null

interface HexLicense {
  id: string
  chain: 'cardano' | 'base'
  assetName?: string
  tokenId?: number
}

type UserAccountData = {
  userId: string
  email?: string
  evmAddresses: string[]
  cardanoAddresses: string[]
  hexIds: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Dashboard() {
  const { isConnected: isEvmConnected, address: evmAddress } = useAccount()
  const publicClient = usePublicClient()
  const { magic } = useMagic()

  const loggedOutRef = useRef(false)
  const router = useRouter()

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authMethod, setAuthMethod]       = useState<AuthMethod>(null)
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null)
  const [magicAddress, setMagicAddress]   = useState<string | null>(null)

  // Email-capture banner (shown after wallet connect when no email on file)
  const [bannerEmail, setBannerEmail]       = useState('')
  const [bannerSaving, setBannerSaving]     = useState(false)
  const [bannerSaved, setBannerSaved]       = useState(false)
  const [bannerError, setBannerError]       = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // ── MongoDB account ───────────────────────────────────────────────────────
  const [userAccount, setUserAccount]     = useState<UserAccountData | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)

  // ── Hex licenses + shipping ───────────────────────────────────────────────
  const [hexLicenses, setHexLicenses]     = useState<HexLicense[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)

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

  const isAuthenticated = authMethod !== null

  const activeEvmAddress: string | undefined =
    authMethod === 'evm'   ? evmAddress :
    authMethod === 'magic' ? (magicAddress ?? undefined) :
    undefined

  const activePredictionMarkets = hexLicenses.length > 0 ? 8 : 0
  const currentStatus = hexLicenses.length > 0 ? 'Hardware Pending' : 'Awaiting Genesis License'

  // ── Show email-capture banner when no email on file ───────────────────────
  const needsEmail = isAuthenticated && !bannerDismissed && userAccount && !userAccount.email && !loggedInEmail

  // ── On mount: check for existing email session before wallet auto-detect ──
  useEffect(() => {
    const saved = sessionStorage.getItem('dashboardAuthMethod') as AuthMethod
    if (saved) {
      sessionStorage.removeItem('malama:logged_out')
      if (saved === 'email') {
        // Re-hydrate email session from cookie
        fetch('/api/user', { credentials: 'include' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.account?.email) {
              setLoggedInEmail(data.account.email)
              setUserAccount(data.account)
              setAuthMethod('email')
            } else {
              // Cookie expired — clear saved state
              sessionStorage.removeItem('dashboardAuthMethod')
            }
          })
          .catch(() => { sessionStorage.removeItem('dashboardAuthMethod') })
      } else {
        setAuthMethod(saved)
      }
      return
    }
    // No saved method and not logged out — check for a live email session cookie
    if (sessionStorage.getItem('malama:logged_out') === '1') return
    fetch('/api/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.account?.email) {
          setLoggedInEmail(data.account.email)
          setUserAccount(data.account)
          setAuthMethod('email')
          sessionStorage.setItem('dashboardAuthMethod', 'email')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep sessionStorage in sync
  useEffect(() => {
    if (authMethod) sessionStorage.setItem('dashboardAuthMethod', authMethod)
    else            sessionStorage.removeItem('dashboardAuthMethod')
  }, [authMethod])

  // Auto-detect wallet connection (only when no auth is set yet)
  useEffect(() => {
    if (authMethod !== null) return
    if (loggedOutRef.current) return
    if (sessionStorage.getItem('malama:logged_out') === '1') return
    if (isEvmConnected) setAuthMethod('evm')
  }, [authMethod, isEvmConnected])

  // Clear logout guard once the wallet has fully disconnected
  useEffect(() => {
    if (!isEvmConnected) loggedOutRef.current = false
  }, [isEvmConnected])

  // Re-hydrate Magic session on refresh
  useEffect(() => {
    if (!magic) return
    if (sessionStorage.getItem('malama:logged_out') === '1') return
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

  // ── Load MongoDB user account ─────────────────────────────────────────────
  useEffect(() => {
    if (!authMethod || authMethod === 'email') return // email handled at mount
    setAccountLoading(true)
    const params = new URLSearchParams()
    if (activeEvmAddress) params.set('evmAddress', activeEvmAddress)
    fetch(`/api/user${params.toString() ? `?${params}` : ''}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.account) setUserAccount(data.account) })
      .catch(() => {})
      .finally(() => setAccountLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod, activeEvmAddress])

  // Pre-fill notification email from known email
  useEffect(() => {
    if (loggedInEmail && !notifEmail) setNotifEmail(loggedInEmail)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInEmail])

  // Pre-fill notification email from MongoDB account
  useEffect(() => {
    if (userAccount?.email && !notifEmail) setNotifEmail(userAccount.email)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAccount?.email])

  // Load shipping profile once auth is known
  useEffect(() => {
    if (!authMethod) return
    const wallet = activeEvmAddress
    const emailParam = loggedInEmail ?? userAccount?.email ?? ''
    if (!wallet && !emailParam) return
    getShipping(wallet ? { wallet } : { email: emailParam })
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
  }, [authMethod, activeEvmAddress, loggedInEmail])

  // ── Resolve on-chain hex licenses ─────────────────────────────────────────
  useEffect(() => {
    async function resolveAssets() {
      if (!authMethod) { setHexLicenses([]); return }
      setLoadingAssets(true)
      try {
        if (authMethod === 'email') {
          const email = loggedInEmail ?? userAccount?.email
          if (!email) { setHexLicenses([]); return }

          // Pull assets across every identity linked to this email account so a
          // buyer sees their hex regardless of which lane they purchased through
          // (email/Stripe, a Base wallet, or a Cardano wallet). The linked
          // wallet addresses come from the MongoDB UserAccount record.
          type OwnedHex = { hexId: string; baseTokenId?: number; chain?: 'cardano' | 'base' }
          const queries: Array<{ q: string; chain: 'cardano' | 'base' }> = [
            { q: `email=${encodeURIComponent(email)}`, chain: 'base' },
          ]
          for (const a of userAccount?.evmAddresses ?? [])
            queries.push({ q: `evmAddress=${encodeURIComponent(a)}`, chain: 'base' })
          for (const a of userAccount?.cardanoAddresses ?? [])
            queries.push({ q: `cardanoAddress=${encodeURIComponent(a)}`, chain: 'cardano' })

          const found: HexLicense[] = []
          await Promise.all(queries.map(async ({ q, chain: srcChain }) => {
            try {
              const r = await fetch(`${API_BASE}/hexes/by-owner?${q}`, { cache: 'no-store' })
              if (!r.ok) return
              const d = await r.json() as { hexes?: OwnedHex[] }
              for (const h of d.hexes ?? []) {
                if (found.some(f => f.id === h.hexId)) continue
                // Prefer the chain the backend records for the hex; fall back to
                // the chain implied by the lookup key.
                const chain = h.chain === 'cardano' || h.chain === 'base' ? h.chain : srcChain
                found.push({ id: h.hexId, chain, tokenId: h.baseTokenId })
              }
            } catch { /* non-fatal */ }
          }))
          setHexLicenses(found)

        } else if (authMethod === 'magic' || authMethod === 'evm') {
          const emailToUse = loggedInEmail ?? userAccount?.email
          const evmAddr = activeEvmAddress

          // For magic: check email + EVM address; for evm: EVM address only
          const emailHexes: Array<{ hexId: string; baseTokenId?: number }> = []
          if (emailToUse) {
            try {
              const r = await fetch(`${API_BASE}/hexes/by-owner?email=${encodeURIComponent(emailToUse)}`, { cache: 'no-store' })
              if (r.ok) {
                const d = await r.json() as { hexes?: Array<{ hexId: string; baseTokenId?: number }> }
                emailHexes.push(...(d.hexes ?? []))
              }
            } catch { /* non-fatal */ }
          }

          let evmHexes: Array<{ hexId: string; baseTokenId?: number }> = []
          const contractAddr = (
            process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_SEPOLIA ??
            process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_MAINNET ?? ''
          ) as `0x${string}`
          if (evmAddr) {
            const NODE_SECURED_EVENT = parseAbiItem('event NodeSecured(address indexed operator, uint256 indexed tokenId, string hexId)')
            const [dbResult, onChainLogs] = await Promise.allSettled([
              fetch(`${API_BASE}/hexes/by-owner?evmAddress=${encodeURIComponent(evmAddr)}`, { cache: 'no-store' })
                .then(r => r.ok ? (r.json() as Promise<{ hexes?: Array<{ hexId: string; baseTokenId?: number }> }>) : { hexes: [] }),
              publicClient && contractAddr
                ? publicClient.getLogs({ address: contractAddr, event: NODE_SECURED_EVENT, args: { operator: evmAddr as `0x${string}` }, fromBlock: BigInt(0) })
                : Promise.resolve([]),
            ])
            evmHexes = dbResult.status === 'fulfilled' ? (dbResult.value.hexes ?? []) : []
            if (onChainLogs.status === 'fulfilled') {
              for (const log of onChainLogs.value) {
                const hexId   = (log.args as { hexId?: string }).hexId ?? ''
                const tokenId = Number((log.args as { tokenId?: bigint }).tokenId ?? 0)
                if (hexId && !evmHexes.some(m => m.hexId === hexId)) evmHexes.push({ hexId, baseTokenId: tokenId })
              }
            }
          }

          // Merge email + EVM results, deduplicate
          const merged = [...emailHexes]
          for (const h of evmHexes) {
            if (!merged.some(m => m.hexId === h.hexId)) merged.push(h)
          }
          setHexLicenses(merged.map(h => ({ id: h.hexId, chain: 'base' as const, tokenId: h.baseTokenId })))
        }
      } catch (e) {
        console.error('[Dashboard] resolveAssets error', e)
        setHexLicenses([])
      } finally {
        setLoadingAssets(false)
      }
    }
    resolveAssets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod, loggedInEmail, activeEvmAddress, publicClient, userAccount?.email, userAccount?.evmAddresses?.length, userAccount?.cardanoAddresses?.length])

  // ── Redirect to /auth when not authenticated ─────────────────────────────
  // Wait 600 ms for wallet auto-detect effects to settle before redirecting.
  useEffect(() => {
    if (authMethod !== null) return
    const t = setTimeout(() => {
      // Re-check inside the timeout — authMethod may have been set since
      setAuthMethod(prev => {
        if (prev === null) router.replace('/auth')
        return prev
      })
    }, 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod])

  // ── Save email to UserAccount (from banner or shipping form) ─────────────
  const saveEmailToAccount = async (email: string) => {
    const params = new URLSearchParams()
    if (activeEvmAddress) params.set('evmAddress', activeEvmAddress)
    const res = await fetch(`/api/user${params.toString() ? `?${params}` : ''}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) { const d = await res.json(); setUserAccount(d.account ?? null) }
    return res.ok
  }

  const saveBannerEmail = async () => {
    if (!EMAIL_RE.test(bannerEmail.trim())) { setBannerError('Enter a valid email address'); return }
    setBannerSaving(true); setBannerError(''); setBannerSaved(false)
    const ok = await saveEmailToAccount(bannerEmail.trim()).catch(() => false)
    setBannerSaving(false)
    if (ok) { setLoggedInEmail(bannerEmail.trim()); setBannerSaved(true); setTimeout(() => setBannerDismissed(true), 1500) }
    else { setBannerError('Could not save — try again.') }
  }

  // ── Save shipping ─────────────────────────────────────────────────────────
  async function saveShipping() {
    setShipSaving(true); setShipError(''); setShipSaved(false)
    try {
      const wallet = activeEvmAddress
      await saveShippingProfile({
        email: notifEmail.trim() || undefined,
        wallet: wallet || undefined,
        shipping: { name: shipName, line1: shipLine1, line2: shipLine2, city: shipCity, state: shipState, postalCode: shipPostal, country: shipCountry },
      })

      // Also persist email to UserAccount so it shows in the Profile card
      if (notifEmail.trim() && (!userAccount?.email || userAccount.email !== notifEmail.trim())) {
        await saveEmailToAccount(notifEmail.trim()).catch(() => {})
      }
      setShipSaved(true)
      setTimeout(() => setShipSaved(false), 3000)
    } catch (e) { setShipError(e instanceof Error ? e.message : 'Save failed') }
    finally { setShipSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-black p-6 font-sans text-gray-200 md:p-12">

      {/* ── Email-capture banner (wallet users who haven't given email yet) ── */}
      {needsEmail && (
        <div className="mx-auto mb-6 max-w-6xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <AtSign className="h-4 w-4 flex-shrink-0 text-amber-400" />
            <p className="flex-1 text-sm text-amber-200">
              Add your email to receive shipping updates and product news.
            </p>
            <div className="flex flex-1 min-w-[260px] items-center gap-2">
              <input
                type="email"
                value={bannerEmail}
                onChange={e => { setBannerEmail(e.target.value); setBannerError('') }}
                onKeyDown={e => { if (e.key === 'Enter') void saveBannerEmail() }}
                placeholder="you@example.com"
                className="flex-1 rounded-lg border border-amber-500/30 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-amber-500/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void saveBannerEmail()}
                disabled={bannerSaving}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                {bannerSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : bannerSaved ? '✓' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="text-xs text-gray-600 hover:text-gray-400"
              >
                Later
              </button>
            </div>
            {bannerError && <p className="w-full text-xs text-red-400">{bannerError}</p>}
          </div>
        </div>
      )}

      {/* ── Header ── */}
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
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Signed in</p>
                <div className="flex items-center gap-2">
                  {authMethod === 'evm'     && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
                  {authMethod === 'magic'   && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />}
                  {authMethod === 'email'   && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
                  <p className="text-sm font-bold text-white">
                    {authMethod === 'evm' && evmAddress && `${evmAddress.slice(0,6)}…${evmAddress.slice(-4)}`}
                    {(authMethod === 'magic' || authMethod === 'email') && (loggedInEmail ?? 'Email')}
                  </p>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-malama-accent/30 bg-malama-deep shadow-[0_0_15px_rgba(196,240,97,0.2)]">
                <Cpu className="h-6 w-6 text-malama-accent" />
              </div>
            </div>
          ) : (
            <Link href="/auth"
              className="rounded-lg border border-malama-accent/50 bg-malama-accent/10 px-4 py-2 font-bold text-malama-accent transition hover:bg-malama-accent hover:text-black">
              Sign in →
            </Link>
          )}
        </div>
      </header>

      {/* ── Main grid ── */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-3">
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
                  <p className="mt-1 text-sm leading-relaxed text-gray-300">Once your sensor arrives, connect it to a standard power source within your Hex territory. It will immediately begin broadcasting cryptographically-signed spatial data to the network — no technical setup required. Revenue starts October 2026.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Hex Licenses */}
          <section className="rounded-3xl border border-gray-800 bg-malama-card p-8 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Your Genesis Licenses</h2>
              {(authMethod === 'evm' || authMethod === 'magic') && (
                <Link href="/list" className="text-xs font-bold text-malama-accent hover:underline">View all on-chain →</Link>
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
                  {authMethod === 'evm' ? 'Your EVM wallet holds 0 verified Genesis Node NFTs.'
                    : (authMethod === 'magic' || authMethod === 'email') && loggedInEmail ? `No purchases found for ${loggedInEmail}.`
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

        {/* ── Sidebar ── */}
        <div className="space-y-8">
          {/* Validator fees */}
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

          {/* Quick links */}
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

          {/* MongoDB Account / Profile card */}
          {isAuthenticated && (
            <section className="rounded-3xl border border-gray-800 bg-malama-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-malama-accent" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Account</h2>
                </div>
                {accountLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" />}
              </div>
              {userAccount ? (
                <div className="space-y-3">
                  {userAccount.email && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Email</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-300 break-all">{userAccount.email}</p>
                    </div>
                  )}
                  {userAccount.evmAddresses.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Base wallets</p>
                      {userAccount.evmAddresses.map(a => (
                        <p key={a} className="mt-0.5 font-mono text-[11px] text-blue-400 break-all">{a.slice(0,8)}…{a.slice(-6)}</p>
                      ))}
                    </div>
                  )}
                  {userAccount.cardanoAddresses.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Cardano wallets</p>
                      {userAccount.cardanoAddresses.map(a => (
                        <p key={a} className="mt-0.5 font-mono text-[11px] text-malama-accent break-all">{a.slice(0,12)}…{a.slice(-8)}</p>
                      ))}
                    </div>
                  )}
                  {userAccount.hexIds.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Hex records <span className="font-normal text-gray-700">(DB)</span></p>
                      {userAccount.hexIds.map(h => (
                        <p key={h} className="mt-0.5 font-mono text-[11px] text-amber-400 truncate">{h}</p>
                      ))}
                    </div>
                  )}
                  {/* Link MetaMask to an email-session account */}
                  {(authMethod === 'magic' || authMethod === 'email') && isEvmConnected && evmAddress &&
                    !userAccount.evmAddresses.includes(evmAddress.toLowerCase()) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch('/api/user', {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ evmAddress }),
                        })
                        if (res.ok) { const d = await res.json(); setUserAccount(d.account ?? null) }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 py-2 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Link MetaMask wallet
                    </button>
                  )}
                </div>
              ) : !accountLoading ? (
                <p className="text-xs text-gray-600">No account record found.</p>
              ) : null}
            </section>
          )}

          {/* Magic wallet section */}
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
                Export your private key to import into MetaMask or any other wallet.
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

          {/* Shipping & Updates */}
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
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  Notification email <span className="font-normal text-malama-accent/80">*required</span>
                </label>
                <input type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">Full name</label>
                <input type="text" value={shipName} onChange={e => setShipName(e.target.value)} placeholder="Jane Smith"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">Address line 1</label>
                <input type="text" value={shipLine1} onChange={e => setShipLine1(e.target.value)} placeholder="123 Main St"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">Address line 2 <span className="font-normal text-gray-700">(optional)</span></label>
                <input type="text" value={shipLine2} onChange={e => setShipLine2(e.target.value)} placeholder="Apt 4B"
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">City</label>
                  <input type="text" value={shipCity} onChange={e => setShipCity(e.target.value)} placeholder="San Francisco"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">State</label>
                  <input type="text" value={shipState} onChange={e => setShipState(e.target.value)} placeholder="CA"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">ZIP / Postal</label>
                  <input type="text" value={shipPostal} onChange={e => setShipPostal(e.target.value)} placeholder="94105"
                    className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-malama-accent/60 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-600">Country</label>
                  <input type="text" value={shipCountry} onChange={e => setShipCountry(e.target.value)} placeholder="US"
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

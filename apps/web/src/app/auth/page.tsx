'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useWallet } from '@meshsdk/react'
import Link from 'next/link'
import { Mail, Loader2, Wallet, Globe, AtSign } from 'lucide-react'
import { useMagic } from '@/components/magic/MagicProvider'

type CardanoWallet = { name: string; icon: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthPage() {
  const router = useRouter()
  const { isConnected: evmConnected } = useAccount()
  const { connect: connectEvm, isPending: isEvmConnecting } = useConnect()
  const { connect: meshConnect } = useWallet()
  const { magic } = useMagic()

  // Magic OTP state
  const [magicEmail, setMagicEmail]       = useState('')
  const [magicSubmitting, setMagicSubmitting] = useState(false)
  const [magicError, setMagicError]       = useState<string | null>(null)

  // Email-session lookup state (no Magic, no wallet)
  const [lookupEmail, setLookupEmail]     = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError]     = useState<string | null>(null)

  const [cardanoConnecting, setCardanoConnecting] = useState(false)
  const [cardanoError, setCardanoError]           = useState<string | null>(null)
  const [cardanoWallets, setCardanoWallets]       = useState<CardanoWallet[]>([])
  const [showPicker, setShowPicker]               = useState(false)

  // Already signed in? Skip to dashboard.
  useEffect(() => {
    if (sessionStorage.getItem('malama:logged_out') === '1') return

    // Active Magic session
    if (magic) {
      magic.user.isLoggedIn().then((loggedIn: boolean) => {
        if (loggedIn) {
          sessionStorage.setItem('dashboardAuthMethod', 'magic')
          router.replace('/dashboard')
        }
      }).catch(() => {})
    }

    // Active email-session cookie
    fetch('/api/user', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.account?.email) {
          sessionStorage.setItem('dashboardAuthMethod', 'email')
          router.replace('/dashboard')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magic])

  // EVM wallet just connected → dashboard
  useEffect(() => {
    if (evmConnected) {
      sessionStorage.removeItem('malama:logged_out')
      sessionStorage.setItem('dashboardAuthMethod', 'evm')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    }
  }, [evmConnected, router])

  // ── Magic OTP sign-in ─────────────────────────────────────────────────────
  async function handleMagicEmail(e: FormEvent) {
    e.preventDefault()
    setMagicError(null)
    const trimmed = magicEmail.trim()
    if (!trimmed) { setMagicError('Email address is required'); return }
    if (!magic)   { setMagicError('Email sign-in is not configured — connect a wallet instead.'); return }
    setMagicSubmitting(true)
    try {
      await magic.auth.loginWithEmailOTP({ email: trimmed })
      const info = await magic.user.getInfo()
      if (!info.wallets?.ethereum?.publicAddress) throw new Error('No wallet address returned.')
      sessionStorage.removeItem('malama:logged_out')
      sessionStorage.setItem('dashboardAuthMethod', 'magic')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    } catch (err: unknown) {
      setMagicError(err instanceof Error ? err.message : 'Sign-in failed — try again.')
    } finally {
      setMagicSubmitting(false)
    }
  }

  // ── Email-session lookup (no Magic, no wallet) ────────────────────────────
  // Creates a signed cookie anchored to the email. Works for any buyer who
  // used that email at checkout (Stripe, Cardano, Base). No OTP required —
  // the dashboard will show whatever purchases are linked to that address.
  async function handleEmailLookup(e: FormEvent) {
    e.preventDefault()
    setLookupError(null)
    const trimmed = lookupEmail.trim()
    if (!EMAIL_RE.test(trimmed)) { setLookupError('Enter a valid email address'); return }
    setLookupLoading(true)
    try {
      const res = await fetch('/api/auth/email-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) throw new Error('Could not sign in — try again.')
      sessionStorage.removeItem('malama:logged_out')
      sessionStorage.setItem('dashboardAuthMethod', 'email')
      router.push('/dashboard')
    } catch (err: unknown) {
      setLookupError(err instanceof Error ? err.message : 'Could not sign in — try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  // ── Cardano connect ───────────────────────────────────────────────────────
  async function connectCardanoWallet(walletKey: string) {
    setCardanoError(null)
    setCardanoConnecting(true)
    try {
      const win = window as typeof window & {
        cardano?: Record<string, { enable: () => Promise<unknown> }>
      }
      if (!win.cardano?.[walletKey]) throw new Error('not_found')
      await Promise.race([
        win.cardano[walletKey].enable(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12_000)),
      ])
      await meshConnect(walletKey).catch(() => {})
      sessionStorage.removeItem('malama:logged_out')
      sessionStorage.setItem('dashboardAuthMethod', 'cardano')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection rejected'
      if (msg === 'timeout')   setCardanoError('Lace is still starting up — click Connect again in a moment.')
      else if (msg === 'not_found') setCardanoError('Cardano wallet not detected. Install Lace at lace.io')
      else if (/declined|rejected|cancelled|user denied/i.test(msg)) setCardanoError('Connection cancelled — please approve in your wallet.')
      else setCardanoError(`Wallet error: ${msg}`)
    } finally {
      setCardanoConnecting(false)
    }
  }

  function handleCardanoClick() {
    setCardanoError(null); setShowPicker(false)
    const win = window as typeof window & {
      cardano?: Record<string, { name?: string; icon?: string; enable: () => Promise<unknown> }>
    }
    const detected: CardanoWallet[] = Object.entries(win.cardano ?? {}).map(([key, w]) => ({
      name: key,
      icon: (w as { icon?: string }).icon ?? '',
    }))
    if (detected.length === 0) { setCardanoError('No Cardano wallet detected. Install Lace at lace.io to continue.'); return }
    if (detected.length === 1) { connectCardanoWallet(detected[0].name); return }
    setCardanoWallets(detected); setShowPicker(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-malama-bg px-6 py-12">
      <div className="w-full max-w-[440px] space-y-6">

        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Mālama Labs" width={52} height={52}
            className="drop-shadow-[0_0_20px_rgba(101,217,165,0.45)]" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Sign in to Mālama Labs</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-malama-ink-dim">
              Connect a wallet or sign in with email to access your Node Command Center.
            </p>
          </div>
        </div>

        {/* ── Wallet buttons ── */}
        <div className="space-y-3">
          {/* Cardano */}
          <div>
            <button type="button" onClick={handleCardanoClick} disabled={cardanoConnecting}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-malama-accent/40 bg-malama-accent/10 py-4 font-black text-malama-accent transition hover:bg-malama-accent/20 disabled:opacity-50">
              {cardanoConnecting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                : <><Wallet className="h-4 w-4" /> Cardano (Lace / Eternl)</>}
            </button>
            {showPicker && cardanoWallets.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
                <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Choose wallet</p>
                {cardanoWallets.map(w => (
                  <button key={w.name} onClick={() => { setShowPicker(false); connectCardanoWallet(w.name) }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-800">
                    {w.icon && <img src={w.icon} alt={w.name} className="h-5 w-5 rounded" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-white">{w.name}</span>
                  </button>
                ))}
              </div>
            )}
            {cardanoError && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                {cardanoError}
                {cardanoError.includes('lace.io') && (
                  <a href="https://lace.io" target="_blank" rel="noopener noreferrer"
                    className="ml-2 font-bold text-malama-accent underline underline-offset-2">
                    Install Lace →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Base / EVM */}
          <button type="button" onClick={() => connectEvm({ connector: injected() })} disabled={isEvmConnecting}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-500/40 bg-blue-500/10 py-4 font-black text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50">
            {isEvmConnecting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
              : <><Globe className="h-4 w-4" /> Base / EVM (MetaMask)</>}
          </button>
        </div>

        {/* ── Divider ── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-malama-line" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
            <span className="bg-malama-bg px-4 text-malama-ink-faint">Or sign in with email</span>
          </div>
        </div>

        {/* ── Email-session lookup (no wallet, no Magic) ── */}
        <div className="rounded-2xl border border-malama-line bg-malama-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <AtSign className="h-4 w-4 text-malama-accent" />
            <p className="text-sm font-black text-white">Look up by order email</p>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-malama-ink-dim">
            Enter the email you used at checkout (Stripe, Cardano, or Base purchase).
            No wallet or OTP needed — we&apos;ll load your purchases directly.
          </p>
          <form onSubmit={handleEmailLookup} className="space-y-3">
            <input type="email" autoComplete="email" value={lookupEmail}
              onChange={e => { setLookupEmail(e.target.value); setLookupError(null) }}
              placeholder="you@example.com" disabled={lookupLoading}
              className="w-full rounded-xl border border-malama-line bg-malama-elev px-4 py-3 text-white placeholder:text-malama-ink-faint focus:border-malama-accent focus:outline-none disabled:opacity-50" />
            {lookupError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                {lookupError}
              </p>
            )}
            <button type="submit" disabled={lookupLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-malama-accent/50 bg-malama-accent/10 py-3.5 font-black text-malama-accent transition hover:bg-malama-accent/20 disabled:opacity-50">
              {lookupLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Looking up…</>
                : <><AtSign className="h-4 w-4" /> Find my account</>}
            </button>
          </form>
        </div>

        {/* ── Magic OTP (card buyers with custodial wallet) ── */}
        {magic ? (
          <div className="rounded-2xl border border-malama-line bg-malama-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-400" />
              <p className="text-sm font-black text-white">Card buyer — Magic wallet</p>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-malama-ink-dim">
              Used a credit card? Sign in with Magic to access your custodial Base wallet and export your private key.
            </p>
            <form onSubmit={handleMagicEmail} className="space-y-3">
              <input type="email" autoComplete="email" value={magicEmail}
                onChange={e => { setMagicEmail(e.target.value); setMagicError(null) }}
                placeholder="you@example.com" disabled={magicSubmitting}
                className="w-full rounded-xl border border-malama-line bg-malama-elev px-4 py-3 text-white placeholder:text-malama-ink-faint focus:border-purple-500/60 focus:outline-none disabled:opacity-50" />
              {magicError && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                  {magicError}
                </p>
              )}
              <button type="submit" disabled={magicSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/10 py-3.5 font-black text-purple-400 transition hover:bg-purple-500/20 disabled:opacity-50">
                {magicSubmitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending OTP…</>
                  : <><Mail className="h-4 w-4" /> Continue with Magic</>}
              </button>
            </form>
          </div>
        ) : (
          <p className="text-center text-xs text-yellow-500/80">
            Magic card-buyer sign-in requires <code>NEXT_PUBLIC_MAGIC_API_KEY</code>.
          </p>
        )}

        {/* Footer */}
        <p className="text-center text-xs leading-relaxed text-malama-ink-faint">
          By continuing you agree to the{' '}
          <Link href="/legal" className="text-malama-accent hover:underline">Terms &amp; Conditions</Link>
          {' '}and{' '}
          <Link href="/legal" className="text-malama-accent hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useWallet } from '@meshsdk/react'
import Link from 'next/link'
import { Mail, Loader2, Wallet, Globe } from 'lucide-react'
import { useMagic } from '@/components/magic/MagicProvider'

type CardanoWallet = { name: string; icon: string }

export default function AuthPage() {
  const router = useRouter()
  const { isConnected: evmConnected } = useAccount()
  const { connect: connectEvm, isPending: isEvmConnecting } = useConnect()
  const { connect: meshConnect } = useWallet()
  const { magic } = useMagic()

  const [email, setEmail]               = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [emailError, setEmailError]     = useState<string | null>(null)

  const [cardanoConnecting, setCardanoConnecting] = useState(false)
  const [cardanoError, setCardanoError]           = useState<string | null>(null)
  const [cardanoWallets, setCardanoWallets]       = useState<CardanoWallet[]>([])
  const [showPicker, setShowPicker]               = useState(false)

  // Already authenticated via Magic? Go straight to dashboard.
  useEffect(() => {
    if (!magic) return
    magic.user.isLoggedIn().then((loggedIn: boolean) => {
      if (loggedIn) {
        sessionStorage.setItem('dashboardAuthMethod', 'magic')
        router.replace('/dashboard')
      }
    }).catch(() => {})
  }, [magic, router])

  // EVM wallet just connected → go to dashboard
  useEffect(() => {
    if (evmConnected) {
      sessionStorage.setItem('dashboardAuthMethod', 'evm')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    }
  }, [evmConnected, router])

  // ── Email sign-in (Magic OTP) ─────────────────────────────────────────────
  async function handleEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError(null)
    const trimmed = email.trim()
    if (!trimmed) { setEmailError('Email address is required'); return }
    if (!magic) { setEmailError('Email sign-in is not configured — connect a wallet instead.'); return }

    setSubmitting(true)
    try {
      await magic.auth.loginWithEmailOTP({ email: trimmed })
      const info = await magic.user.getInfo()
      if (!info.wallets?.ethereum?.publicAddress) throw new Error('No wallet address returned.')
      sessionStorage.setItem('dashboardAuthMethod', 'magic')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Sign-in failed — try again.')
    } finally {
      setSubmitting(false)
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

      // Lace MV3 service worker restarts periodically — race with a 12 s timeout
      await Promise.race([
        win.cardano[walletKey].enable(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 12_000)
        ),
      ])

      // Also connect via MeshSDK so dashboard's isCardanoConnected stays true
      await meshConnect(walletKey).catch(() => {})

      sessionStorage.setItem('dashboardAuthMethod', 'cardano')
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection rejected'
      if (msg === 'timeout') {
        setCardanoError('Lace is still starting up — click Connect again in a moment.')
      } else if (msg === 'not_found') {
        setCardanoError('Cardano wallet not detected. Install Lace at lace.io')
      } else if (/declined|rejected|cancelled|user denied/i.test(msg)) {
        setCardanoError('Connection cancelled — please approve in your wallet.')
      } else {
        setCardanoError(`Wallet error: ${msg}`)
      }
    } finally {
      setCardanoConnecting(false)
    }
  }

  function handleCardanoClick() {
    setCardanoError(null)
    setShowPicker(false)

    const win = window as typeof window & {
      cardano?: Record<string, { name?: string; icon?: string; enable: () => Promise<unknown> }>
    }
    const detected: CardanoWallet[] = Object.entries(win.cardano ?? {}).map(([key, w]) => ({
      name: key,
      icon: (w as { icon?: string }).icon ?? '',
    }))

    if (detected.length === 0) {
      setCardanoError('No Cardano wallet detected. Install Lace at lace.io to continue.')
      return
    }
    if (detected.length === 1) {
      connectCardanoWallet(detected[0].name)
      return
    }
    setCardanoWallets(detected)
    setShowPicker(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-malama-bg px-6 py-12">
      <div className="w-full max-w-[420px]">

        {/* Logo + heading */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="Mālama Labs"
            width={52}
            height={52}
            className="drop-shadow-[0_0_20px_rgba(101,217,165,0.45)]"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Sign in to Mālama Labs</h1>
            <p className="mt-1.5 text-sm text-malama-ink-dim leading-relaxed">
              Enter your email to access your Node Command Center.<br />
              New here? We'll create your account automatically.
            </p>
          </div>
        </div>

        {/* ── Email form ── */}
        <form onSubmit={handleEmail} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-malama-ink-dim">
              Email address
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
              className="w-full rounded-xl border border-malama-line bg-malama-card px-4 py-3.5 text-white placeholder:text-malama-ink-faint focus:border-malama-accent focus:outline-none disabled:opacity-50"
            />
          </div>

          {emailError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {emailError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !magic}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-malama-accent py-4 font-black text-malama-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
            ) : (
              <><Mail className="h-4 w-4" /> Continue with Email</>
            )}
          </button>
          {!magic && (
            <p className="text-center text-xs text-yellow-500/80">
              Email sign-in requires <code>NEXT_PUBLIC_MAGIC_API_KEY</code> to be configured.
            </p>
          )}
        </form>

        {/* ── Divider ── */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-malama-line" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
            <span className="bg-malama-bg px-4 text-malama-ink-faint">Or connect a wallet</span>
          </div>
        </div>

        {/* ── Wallet buttons ── */}
        <div className="space-y-3">

          {/* Cardano */}
          <div>
            <button
              type="button"
              onClick={handleCardanoClick}
              disabled={cardanoConnecting}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-malama-accent/40 bg-malama-accent/10 py-4 font-black text-malama-accent transition hover:bg-malama-accent/20 disabled:opacity-50"
            >
              {cardanoConnecting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
              ) : (
                <><Wallet className="h-4 w-4" /> Cardano (Lace / Eternl)</>
              )}
            </button>

            {/* Wallet picker — shown when multiple wallets detected */}
            {showPicker && cardanoWallets.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
                <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Choose wallet
                </p>
                {cardanoWallets.map((w) => (
                  <button
                    key={w.name}
                    onClick={() => { setShowPicker(false); connectCardanoWallet(w.name) }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-800"
                  >
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
                  <a
                    href="https://lace.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 font-bold text-malama-accent underline underline-offset-2"
                  >
                    Install Lace →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* EVM / MetaMask */}
          <button
            type="button"
            onClick={() => connectEvm({ connector: injected() })}
            disabled={isEvmConnecting}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-blue-500/40 bg-blue-500/10 py-4 font-black text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
          >
            {isEvmConnecting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
            ) : (
              <><Globe className="h-4 w-4" /> Base / EVM (MetaMask)</>
            )}
          </button>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs leading-relaxed text-malama-ink-faint">
          By continuing you agree to the{' '}
          <Link href="/legal" className="text-malama-accent hover:underline">
            Terms & Conditions
          </Link>{' '}
          and{' '}
          <Link href="/legal" className="text-malama-accent hover:underline">
            Privacy Policy
          </Link>.
        </p>
      </div>
    </div>
  )
}

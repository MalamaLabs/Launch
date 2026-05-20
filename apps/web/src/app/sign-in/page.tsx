'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useWallet } from '@meshsdk/react'
import { Mail, Loader2, Wallet, Globe } from 'lucide-react'
import { useMagic } from '@/components/magic/MagicProvider'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('from') ?? '/dashboard'

  const { magic } = useMagic()
  const { connect } = useConnect()
  const { connect: connectCardano, connecting: cardanoConnecting } = useWallet()

  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sent, setSent]         = useState(false)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function handleMagicSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!magic || !emailOk) return
    setLoading(true); setError('')
    try {
      await magic.auth.loginWithEmailOTP({ email: email.trim() })
      setSent(true)
      // getInfo() to confirm wallet exists before redirecting
      const info = await magic.user.getInfo()
      const addr = info.wallets?.ethereum?.publicAddress
      if (!addr) throw new Error('No wallet address returned — try again.')
      router.push(redirectTo)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      // User dismissing the OTP modal throws a MagicSDK error — treat as cancel
      if (msg.toLowerCase().includes('modal')) {
        setError('OTP window closed — re-enter your email to try again.')
      } else {
        setError(msg)
      }
      setSent(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleCardanoConnect() {
    try {
      const win = window as any
      const detected = Object.entries(win.cardano ?? {})
      if (detected.length === 1) {
        await connectCardano((detected[0] as any)[0])
      } else if (detected.length > 1) {
        // Pick the first available — user can change in the dashboard
        await connectCardano((detected[0] as any)[0])
      } else {
        setError('No Cardano wallet detected — install Lace or Eternl.')
        return
      }
      router.push(redirectTo)
    } catch {
      setError('Cardano connection failed.')
    }
  }

  function handleBaseConnect() {
    connect({ connector: injected() })
    // wagmi fires isConnected async — poll or rely on dashboard to detect
    setTimeout(() => router.push(redirectTo), 800)
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-10">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 4L44 15V33L24 44L4 33V15L24 4Z" fill="#0A1628" stroke="#c4f061" strokeWidth="2" />
            <path d="M14 32V18L24 24L34 18V32" stroke="#c4f061" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        <h1 className="text-center text-white text-2xl font-black tracking-tight mb-1">
          Node Command Center
        </h1>
        <p className="text-center text-gray-500 text-sm mb-10">
          Sign in to manage your Genesis hex licenses
        </p>

        {/* ── Magic email sign-in ── */}
        {magic ? (
          <form onSubmit={handleMagicSignIn} className="space-y-3 mb-6">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={loading}
              className="w-full bg-[#111f35] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-[#c4f061] focus:ring-1 focus:ring-[#c4f061] transition-colors disabled:opacity-50"
            />

            {error && <p className="text-red-400 text-xs">{error}</p>}

            {sent && !error && (
              <p className="text-[#c4f061] text-xs">
                Check your inbox — enter the 6-digit code in the Magic popup.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !emailOk}
              className="w-full flex items-center justify-center gap-2 bg-[#c4f061] hover:bg-[#b3e050] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A1628] font-black text-sm py-3 rounded-lg transition-colors"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code…</>
                : <><Mail className="h-4 w-4" /> Continue with email</>}
            </button>
          </form>
        ) : (
          /* Magic API key not configured — show a placeholder */
          <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center text-xs text-yellow-400">
            Email sign-in is not configured.<br />Set <code>NEXT_PUBLIC_MAGIC_API_KEY</code> to enable it.
          </div>
        )}

        {/* ── Divider ── */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-[#0A1628] px-3 text-xs text-gray-600">or connect a wallet</span>
          </div>
        </div>

        {/* ── Wallet options ── */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleCardanoConnect()}
            disabled={cardanoConnecting}
            className="w-full flex items-center gap-3 border border-[#c4f061]/30 bg-[#c4f061]/5 hover:bg-[#c4f061]/10 rounded-lg px-4 py-3 text-[#c4f061] font-bold text-sm transition-colors disabled:opacity-50"
          >
            <Wallet className="h-4 w-4 shrink-0" />
            {cardanoConnecting ? 'Connecting…' : 'Cardano — Lace / Eternl / Nami'}
          </button>

          <button
            type="button"
            onClick={handleBaseConnect}
            className="w-full flex items-center gap-3 border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 rounded-lg px-4 py-3 text-blue-400 font-bold text-sm transition-colors"
          >
            <Globe className="h-4 w-4 shrink-0" />
            Base — MetaMask / Injected
          </button>
        </div>

        <p className="text-center text-gray-700 text-xs mt-10">
          © {new Date().getFullYear()} Mālama Labs Inc.
        </p>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#c4f061]" />
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}

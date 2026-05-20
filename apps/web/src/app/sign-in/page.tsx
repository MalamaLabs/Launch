'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useWallet } from '@meshsdk/react'
import { ShieldCheck, Mail, Loader2 } from 'lucide-react'
import { useMagic } from '@/components/magic/MagicProvider'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('from') ?? '/dashboard'

  const { magic } = useMagic()
  const { connect: connectEvm, isPending: isEvmConnecting } = useConnect()
  const { connect: connectCardano, connecting: isCardanoConnecting } = useWallet()

  const [email, setEmail]             = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailError, setEmailError]   = useState('')

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!magic || !emailOk) return
    setEmailSubmitting(true); setEmailError('')
    try {
      await magic.auth.loginWithEmailOTP({ email: email.trim() })
      const info = await magic.user.getInfo()
      if (!info.wallets?.ethereum?.publicAddress) throw new Error('No wallet address returned.')
      router.push(redirectTo)
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Sign-in failed — try again.')
    } finally {
      setEmailSubmitting(false)
    }
  }

  async function handleCardanoConnect() {
    try {
      const win = window as any
      const detected = Object.keys(win.cardano ?? {})
      if (detected.length === 0) { setEmailError('No Cardano wallet detected — install Lace or Eternl.'); return }
      await connectCardano(detected[0])
      router.push(redirectTo)
    } catch {
      setEmailError('Cardano connection failed.')
    }
  }

  function handleEvmConnect() {
    connectEvm({ connector: injected() })
    setTimeout(() => router.push(redirectTo), 800)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 py-12">
      <div className="mx-4 w-full max-w-md rounded-3xl border border-gray-800 bg-malama-card p-8 text-center shadow-2xl md:p-10">

        <ShieldCheck className="mx-auto mb-6 h-20 w-20 text-malama-accent drop-shadow-[0_0_20px_rgba(196,240,97,0.3)]" />
        <h2 className="mb-2 text-2xl font-black tracking-tight text-white">Sign in to the app</h2>
        <p className="mb-8 leading-relaxed text-gray-400">
          Sign in with your email, or connect{' '}
          <strong className="text-gray-300">Cardano</strong> (Lace) /{' '}
          <strong className="text-gray-300">Base</strong> (MetaMask) to load your on-chain licenses.
        </p>

        {/* ── Email sign-in ── */}
        <form onSubmit={signInWithEmail} className="mb-6 space-y-3 text-left">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError('') }}
              placeholder="you@example.com"
              disabled={emailSubmitting}
              className="w-full rounded-xl border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder:text-gray-600 focus:border-malama-accent focus:outline-none disabled:opacity-50"
            />
          </label>
          {emailError && <p className="text-sm text-red-400">{emailError}</p>}
          <button
            type="submit"
            disabled={emailSubmitting || !emailOk || !magic}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-violet-500/50 bg-violet-500/10 py-4 font-black text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-50"
          >
            {emailSubmitting
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Signing in…</>
              : <><Mail className="h-5 w-5" /> Continue with email</>}
          </button>
          {!magic && (
            <p className="text-center text-xs text-yellow-500/80">
              Email sign-in requires <code>NEXT_PUBLIC_MAGIC_API_KEY</code> to be set.
            </p>
          )}
        </form>

        {/* ── Divider ── */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-malama-card px-4 text-gray-500">Or connect a wallet</span>
          </div>
        </div>

        {/* ── Wallet buttons ── */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleCardanoConnect()}
            disabled={isCardanoConnecting || isEvmConnecting}
            className="w-full rounded-xl border-2 border-malama-accent/50 bg-malama-accent/10 py-4 font-black text-malama-accent shadow-xl transition hover:bg-malama-accent hover:text-black disabled:opacity-50"
          >
            {isCardanoConnecting ? 'Connecting…' : 'Cardano — Lace / Eternl / Nami'}
          </button>

          <button
            type="button"
            onClick={handleEvmConnect}
            disabled={isCardanoConnecting || isEvmConnecting}
            className="w-full rounded-xl border-2 border-blue-500/50 bg-blue-500/10 py-4 font-black text-blue-400 shadow-xl transition hover:bg-blue-500 hover:text-white disabled:opacity-50"
          >
            {isEvmConnecting ? 'Connecting…' : 'Base — MetaMask / Injected'}
          </button>
        </div>

      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-malama-accent" />
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}

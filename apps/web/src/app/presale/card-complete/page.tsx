'use client'

// Post-Stripe landing page.
//
// In the new architecture, dagwelldev-api owns the Stripe webhook and the
// admin-mint path — once Stripe posts checkout.session.completed, the
// backend mints the Base NFT to the buyer's address and flips the hex
// status to 'sold' in Mongo. This page's only job is to confirm to the
// buyer that their hex is now theirs.
//
// We poll `GET /hexes/:hexId` until status === 'sold' (up to ~90s), then
// deep-link to /list/[hexId] where the full NFT card + Cardano mirror
// status lives. No more /api/checkout/sync-session juggling; the backend
// is the single source of truth.

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { getHexDetail } from '@/lib/api'

type Phase =
  | { kind: 'loading' }
  | { kind: 'confirmed'; hexId: string }
  | { kind: 'pending'; hexId: string; attempts: number }
  | { kind: 'error'; message: string }

function CardCompleteInner() {
  const params = useSearchParams()
  const hexId = params.get('hex')
  const sessionId = params.get('session_id')
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    if (!hexId) {
      setPhase({
        kind: 'error',
        message:
          'This link is missing its hex id. Check your email for the Stripe receipt — it contains your reservation link.',
      })
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 30 // 30 × 3s = ~90s

    const poll = async () => {
      if (cancelled) return
      try {
        const detail = await getHexDetail(hexId)
        if (cancelled) return
        if (detail.status === 'sold' || detail.status === 'bound') {
          setPhase({ kind: 'confirmed', hexId })
          return
        }
        attempts++
        if (attempts >= maxAttempts) {
          setPhase({
            kind: 'error',
            message:
              'Payment received — still waiting on the backend to finalize your mint. Refresh this page, or check /list/' +
              hexId +
              ' in a minute.',
          })
          return
        }
        setPhase({ kind: 'pending', hexId, attempts })
        setTimeout(poll, 3000)
      } catch (err) {
        if (cancelled) return
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load hex status',
        })
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [hexId])

  if (phase.kind === 'loading' || phase.kind === 'pending') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-24 text-center">
        <Loader2 className="w-12 h-12 text-malama-accent animate-spin mb-6" />
        <h1 className="text-2xl font-black text-white mb-2">Finalizing your reservation</h1>
        <p className="text-gray-400 max-w-md">
          {phase.kind === 'pending'
            ? `Payment confirmed — waiting on the on-chain mint to settle. (${phase.attempts}/30)`
            : 'Confirming payment with the backend…'}
        </p>
        {sessionId && (
          <p className="mt-4 font-mono text-[10px] text-gray-700">Stripe session: {sessionId.slice(0, 16)}…</p>
        )}
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-24 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-6" />
        <h1 className="text-2xl font-black text-white mb-2">Hang tight</h1>
        <p className="text-gray-400 max-w-md mb-8">{phase.message}</p>
        {hexId && (
          <Link
            href={`/list/${encodeURIComponent(hexId)}`}
            className="text-malama-accent font-bold hover:underline"
          >
            View hex {hexId} →
          </Link>
        )}
        <Link href="/presale" className="mt-4 text-gray-500 hover:text-gray-300 text-sm">
          ← Back to presale
        </Link>
      </div>
    )
  }

  // confirmed
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center px-4 py-16 max-w-lg mx-auto text-center">
      <CheckCircle2 className="w-16 h-16 text-malama-accent mb-6" />
      <p className="text-malama-accent font-black uppercase tracking-widest text-sm mb-2">
        Reservation confirmed
      </p>
      <h1 className="text-3xl font-black text-white mb-3 break-all">{phase.hexId}</h1>
      <p className="text-gray-400 text-sm mb-8 max-w-md">
        Your Genesis hex is now reserved on Base and mirrored to Cardano. The full NFT card, metadata link, and
        delivery status live on the detail page.
      </p>
      <Link
        href={`/list/${encodeURIComponent(phase.hexId)}`}
        className="inline-flex items-center justify-center rounded-xl bg-malama-accent px-8 py-4 font-black text-black shadow-[0_0_30px_rgba(196,240,97,0.3)] hover:scale-[1.02] transition-transform"
      >
        View your hex →
      </Link>
      <Link href="/" className="mt-10 text-gray-500 hover:text-gray-300 text-sm">
        Return home
      </Link>
    </div>
  )
}

export default function CardCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-malama-accent animate-spin" />
        </div>
      }
    >
      <CardCompleteInner />
    </Suspense>
  )
}

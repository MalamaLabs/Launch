'use client'

import React from 'react'
import dynamic from 'next/dynamic'

// ── GenesisMint error boundary ────────────────────────────────────────────────
// GenesisMint is loaded via next/dynamic (ssr:false) and pulls in the wagmi /
// viem wallet stack. If that chunk ever fails to load, next/dynamic propagates
// the error to React's nearest error boundary; without one, it would crash the
// entire presale page tree.
//
// This class-component boundary catches the failure and renders a recoverable
// fallback so the page stays alive.
interface BoundaryState { error: Error | null }
class GenesisMintBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GenesisMintBoundary] checkout module failed to load:', error, info)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 px-8 py-12 text-center">
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-red-400">
            Checkout unavailable
          </p>
          <p className="mb-6 max-w-md text-sm text-gray-400">
            The payment module failed to load — this is usually a temporary
            bundler issue. Try a hard refresh (Cmd/Ctrl + Shift + R) or come
            back in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-malama-accent/50 px-5 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-malama-accent hover:bg-malama-accent/10"
          >
            Reload page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-6 max-w-lg overflow-x-auto rounded bg-black/40 px-4 py-3 text-left font-mono text-[10px] text-red-400">
              {this.state.error.message}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

const GenesisMint = dynamic(() => import('./GenesisMint'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-malama-accent border-t-transparent" />
    </div>
  ),
})

export default function GenesisMintDynamic(props: { hexId: string | null }) {
  return (
    <GenesisMintBoundary>
      <GenesisMint {...props} />
    </GenesisMintBoundary>
  )
}

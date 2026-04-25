import type { Metadata } from 'next'
import GenesisMint from '@/components/GenesisMintDynamic'
import { getSaleState } from '@/lib/api'

export const metadata: Metadata = {
  title: 'Reserve with Crypto or Card | Genesis 200 | Mālama Labs',
  description:
    'Connect your wallet, pick your hex on the map, and reserve a Genesis validator node. $2,000 entry. 125K MLMA per node. 200 Genesis nodes (195 remaining). Oct 2026 revenue.',
}

export default async function PresalePage({
  searchParams,
}: {
  searchParams: Promise<{ hex?: string }>
}) {
  const { hex: hexId } = await searchParams
  const resolvedHexId = hexId || null

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] pt-16 pb-32 px-4 relative overflow-x-hidden flex items-center">
      <div className="absolute top-1/4 -left-1/4 w-[800px] h-[800px] bg-malama-accent/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-[800px] h-[800px] bg-malama-accent-dim/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-6xl w-full mx-auto flex flex-col items-center relative z-10 text-center">
        <div className="inline-flex items-center px-4 py-1.5 mb-8 text-xs font-black uppercase tracking-[0.2em] text-malama-accent border border-malama-accent/30 rounded-full bg-malama-accent/10 shadow-[0_0_15px_rgba(196,240,97,0.2)]">
          <span className="w-2 h-2 rounded-full bg-malama-accent animate-pulse mr-2" />
          Genesis 200 — Scarcity Edition
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white tracking-tighter mb-8 drop-shadow-xl">
          Reserve with <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-malama-accent to-malama-accent-dim">
            Crypto or Card
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-400 max-w-4xl mx-auto leading-relaxed mb-6">
          Choose a hex from the 200 Genesis licenses for early supporters, connect an EVM or Cardano wallet (or custodial
          with email), then reserve with crypto or fiat via credit/debit card. $2,000 entry. 125K MLMA vests at first boot.
          Revenue starts October 2026.
        </p>
        <p className="text-sm text-gray-500 mb-10">
          <a
            href="/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-malama-accent/90 hover:text-malama-accent underline underline-offset-2 font-semibold"
          >
            Terms, Privacy, Hex Node Agreement, and Token Risk Disclosure
          </a>{' '}
          apply to this purchase — you will confirm each at checkout.
        </p>

        <PresaleStats />

        {/* Step indicators — matches checkout wizard */}
        <div className="mt-12 mb-8 grid max-w-4xl grid-cols-2 gap-3 text-sm text-gray-500 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
          {[
            { n: '1', label: 'Locate HEX' },
            { n: '2', label: 'Crypto or card' },
            { n: '3', label: 'Review' },
            { n: '4', label: 'Pay' },
            { n: '5', label: 'Reserved ✓' },
          ].map((s) => (
            <div key={s.n} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-malama-accent/50 bg-malama-accent/20 font-black text-xs text-malama-accent">
                {s.n}
              </span>
              <span className="leading-tight text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="w-full mt-4">
          <GenesisMint hexId={resolvedHexId} />
        </div>
      </div>
    </div>
  )
}

async function PresaleStats() {
  // Defaults match the sale plan: 200 hexes, ~5 internal allocations taken.
  // These render when either (a) the backend is unreachable, (b) the backend
  // is up but Mongo hasn't been seeded AND the Base contract isn't deployed
  // yet, or (c) the Base contract is reachable but in a degenerate state
  // (remaining=0 with nothing sold in Mongo — e.g. contract address points
  // to a mis-deployed/zero-cap contract). We specifically want to avoid the
  // old "200/200 reserved" failure mode that tripped at launch.
  const DEFAULT_TOTAL = 200
  const DEFAULT_RESERVED = 5
  let total = DEFAULT_TOTAL
  let remaining = DEFAULT_TOTAL - DEFAULT_RESERVED
  let reserved = DEFAULT_RESERVED
  try {
    const state = await getSaleState()
    const onChainEnabled = state.onChain.enabled === true
    const mongoSeeded = (state.mongo.total ?? 0) > 0
    // Note: `state.onChain.remaining` is a *number*, so `?? fallback` only
    // fires on null/undefined — a contract returning 0 is taken at face
    // value. That's the trap; see `onChainLooksBroken` below.
    const onChainRemaining =
      onChainEnabled && typeof state.onChain.remaining === 'number'
        ? state.onChain.remaining
        : null
    const mongoTaken = mongoSeeded
      ? state.mongo.reserved + state.mongo.sold + state.mongo.bound
      : 0

    // A contract claiming "0 remaining" when Mongo has nothing sold is almost
    // certainly a mis-configured contract address, not an actual sell-out —
    // render marketing numbers instead of scaring buyers off with 200/200.
    const onChainLooksBroken =
      onChainRemaining === 0 && mongoTaken === 0

    if (onChainRemaining != null && !onChainLooksBroken) {
      // Contract is live + plausible → use the on-chain remaining as truth.
      // Base contract caps at 200 by construction, so treat that as total.
      total = DEFAULT_TOTAL
      remaining = onChainRemaining
      reserved = Math.max(0, total - remaining)
    } else if (mongoSeeded) {
      // No contract (or contract looks broken), but the pool has been seeded
      // — Mongo is the source of truth for reservations made via Stripe,
      // admin, or Cardano-primary lanes.
      total = state.mongo.total
      reserved = Math.max(DEFAULT_RESERVED, mongoTaken)
      remaining = Math.max(0, total - reserved)
    }
    // else: pre-seed, pre-contract → keep marketing defaults.
  } catch {
    // Backend unreachable — keep defaults. Never block the public page.
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border border-malama-line bg-malama-elev/80 backdrop-blur-md shadow-2xl rounded-3xl p-8 md:px-10 md:py-8 gap-8 md:gap-10 items-center">
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-white">{total}</span>
        <span className="text-xs tracking-[0.15em] text-gray-500 uppercase font-black mt-2 text-center leading-snug max-w-[9rem]">
          Genesis Nodes Available
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-white">{reserved}</span>
        <span className="text-xs tracking-[0.2em] text-gray-500 uppercase font-black mt-2">Reserved</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-malama-accent drop-shadow-[0_0_10px_rgba(196,240,97,0.4)]">
          {remaining}
        </span>
        <span className="text-xs tracking-[0.2em] text-gray-500 uppercase font-black mt-2">Remaining</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-5xl md:text-6xl font-mono font-black text-white">$2K</span>
        <span className="text-xs tracking-[0.2em] text-gray-500 uppercase font-black mt-2">Entry Price</span>
      </div>
      <div className="flex flex-col items-center col-span-2 justify-self-center sm:col-span-1 max-sm:w-full max-sm:max-w-[12rem]">
        <span className="text-4xl md:text-5xl font-mono font-black text-malama-accent">125K</span>
        <span className="text-xs tracking-[0.2em] text-gray-500 uppercase font-black mt-2">MLMA / Node</span>
      </div>
    </div>
  )
}

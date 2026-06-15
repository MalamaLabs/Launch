import type { Metadata } from 'next'
import GenesisMint from '@/components/GenesisMintDynamic'
import { getSaleState, deriveSaleCounts, SALE_DEFAULT_TOTAL, SALE_DEFAULT_RESERVED } from '@/lib/api'

export const metadata: Metadata = {
  title: 'Reserve with Crypto or Card | Genesis 200 | Mālama Labs',
  description:
    'Connect your wallet, pick your hex on the map, and reserve a Genesis validator node. $2,000 entry. 125K MLMA per node. 200 Genesis nodes (195 remaining). Public Hex Launch June 1, 2026 · mainnet live Q4 2026 ahead of TGE.',
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
          Choose a hex from the 200 Genesis licenses for early supporters, connect an EVM wallet (or custodial
          with email), then reserve with crypto or fiat via credit/debit card. $2,000 entry. 125K MLMA vests at first boot.
          Mainnet live Q4 2026, ahead of TGE.
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
        <div className="mt-12 mb-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-gray-500">
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

        <div id="reserve" className="w-full mt-4 scroll-mt-24">
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
  // Shared with the homepage banner/stats via deriveSaleCounts so every public
  // surface shows the same live number. Falls back to marketing defaults on any
  // backend error — never blocks the public page.
  let total = SALE_DEFAULT_TOTAL
  let remaining = SALE_DEFAULT_TOTAL - SALE_DEFAULT_RESERVED
  let reserved = SALE_DEFAULT_RESERVED
  try {
    ;({ total, reserved, remaining } = deriveSaleCounts(await getSaleState()))
  } catch {
    // Backend unreachable — keep defaults.
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

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
// surface the full set of action links. No more /api/checkout/sync-session
// juggling; the backend is the single source of truth.

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  Sparkles,
  Wallet,
  ArrowLeft,
} from 'lucide-react'
import { EXPLORER_BASE, getHexDetail, HexDetail, nftImageUrl } from '@/lib/api'

// ─── NftCard ─────────────────────────────────────────────────────────────────

function NftCard({ detail }: { detail: HexDetail }) {
  const tokenId = detail.baseTokenId ?? detail.onChain.tokenId ?? null
  const chain   = detail.cardanoMirrorStatus === 'minted' && !detail.baseTokenId ? 'cardano' : 'base'
  const edition = tokenId != null ? String(tokenId).padStart(3, '0') : '???'
  const claimId = tokenId != null ? `G200-${edition}` : null
  const imgSrc  = nftImageUrl({ hexId: detail.hexId, tokenId: tokenId ?? undefined, chain, claimId: claimId ?? undefined })

  return (
    <div className="relative w-44 h-64 mx-auto rounded-2xl overflow-hidden border border-malama-accent/30 shadow-[0_0_40px_rgba(196,240,97,0.18)]">
      <img src={imgSrc} alt={`NFT ${detail.hexId}`} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute bottom-3 left-3 right-3">
        {claimId && <p className="text-malama-accent font-black text-xl">{claimId}</p>}
        <p className="text-gray-300 text-[10px] font-mono truncate">{detail.hexId}</p>
      </div>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getContractAddress(network: string | undefined): string | undefined {
  if (network === 'mainnet') return process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_MAINNET
  return process.env.NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_SEPOLIA
}

/**
 * Infer Cardano network. Prefer the stored cardanoExplorerUrl (contains "preprod"
 * for testnet). Fall back to baseNetwork: sepolia → preprod, mainnet → mainnet.
 */
function cardanoNetFromDetail(detail: HexDetail): 'preprod' | 'mainnet' {
  if (detail.cardanoExplorerUrl) {
    return detail.cardanoExplorerUrl.includes('preprod') ? 'preprod' : 'mainnet'
  }
  return detail.baseNetwork === 'mainnet' ? 'mainnet' : 'preprod'
}

/** CardanoScan URL — stored value preferred, derived from txHash when absent. */
function buildCardanoScanUrl(detail: HexDetail): string | null {
  if (detail.cardanoExplorerUrl) return detail.cardanoExplorerUrl
  if (!detail.cardanoTxHash) return null
  const net = cardanoNetFromDetail(detail)
  return net === 'mainnet'
    ? `https://cardanoscan.io/tx/${detail.cardanoTxHash}`
    : `https://preprod.cardanoscan.io/tx/${detail.cardanoTxHash}`
}

/** Dagwelldev explorer URL for the Cardano mint tx. Null when no Cardano tx yet. */
function buildDagwelldevUrl(detail: HexDetail): string | null {
  if (!detail.cardanoTxHash) return null
  const net = cardanoNetFromDetail(detail)
  return `${EXPLORER_BASE}/explorer/${net}/tx/${detail.cardanoTxHash}`
}

function buildOpenSeaUrl(detail: HexDetail): string | null {
  const { baseNetwork, baseTokenId } = detail
  if (baseTokenId == null) return null
  const contract = getContractAddress(baseNetwork)
  if (!contract) return null
  if (baseNetwork === 'mainnet') {
    return `https://opensea.io/assets/base/${contract}/${baseTokenId}`
  }
  return `https://testnets.opensea.io/assets/base-sepolia/${contract}/${baseTokenId}`
}

async function addToMetaMask(detail: HexDetail): Promise<void> {
  const provider = (window as any).ethereum
  if (!provider) {
    alert('MetaMask not detected — open this page in a browser with MetaMask installed.')
    return
  }
  const contract = getContractAddress(detail.baseNetwork)
  if (!contract || detail.baseTokenId == null) {
    alert('Contract details not available yet — try again once the mint finalises.')
    return
  }
  try {
    await provider.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC721',
        options: {
          address: contract,
          tokenId: String(detail.baseTokenId),
        },
      },
    })
  } catch (err: any) {
    if (err?.code !== 4001) {
      // 4001 = user rejected — silent. Anything else, surface it.
      alert(`MetaMask error: ${err?.message ?? String(err)}`)
    }
  }
}

// ─── phase type ──────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'loading' }
  | { kind: 'pending'; hexId: string; attempts: number }
  | { kind: 'confirmed'; detail: HexDetail }
  | { kind: 'error'; message: string; hexId?: string }

// ─── action button components ────────────────────────────────────────────────

function ExternalButton({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[13px] font-bold transition-all hover:-translate-y-px ${className}`}
    >
      {children}
    </a>
  )
}

// ─── confirmed state ─────────────────────────────────────────────────────────

function ConfirmedView({
  detail,
  sessionId,
  isMagic,
}: {
  detail: HexDetail
  sessionId: string | null
  isMagic: boolean
}) {
  const openSeaUrl = buildOpenSeaUrl(detail)
  const cardanoScanUrl = buildCardanoScanUrl(detail)
  const dagwelldevUrl = buildDagwelldevUrl(detail)
  const hasBase = !!detail.baseExplorerUrl
  const hasCardano = !!cardanoScanUrl
  const hasMetaMask = !!(getContractAddress(detail.baseNetwork) && detail.baseTokenId != null)
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE || 'https://discord.gg/malamalabs'

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-[480px] flex flex-col items-center text-center">

        {/* ── icon ── */}
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-full bg-malama-accent/20 blur-2xl scale-150" />
          <CheckCircle2 className="relative w-16 h-16 text-malama-accent" strokeWidth={1.5} />
        </div>

        {/* ── header ── */}
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-malama-accent mb-2">
          Reservation confirmed
        </p>
        {detail.baseTokenId != null && (
          <h1 className="font-mono text-4xl font-black text-white mb-1">
            G200-{String(detail.baseTokenId).padStart(3, '0')}
          </h1>
        )}

        {/* ── NFT card ── */}
        <div className="my-5">
          <NftCard detail={detail} />
        </div>

        {/* ── metadata chips ── */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-3 mb-6">
          {detail.baseNetwork && (
            <span className="rounded-full border border-malama-line bg-malama-bg px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-400">
              Base · {detail.baseNetwork === 'mainnet' ? 'Mainnet' : 'Sepolia'}
            </span>
          )}
          {detail.baseTokenId != null && (
            <span className="rounded-full border border-malama-line bg-malama-bg px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-400">
              Token #{detail.baseTokenId}
            </span>
          )}
          {detail.cardanoMirrorStatus === 'minted' && (
            <span className="rounded-full border border-emerald-800/50 bg-emerald-950/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              Cardano mirrored
            </span>
          )}
          {detail.cardanoMirrorStatus === 'pending' && (
            <span className="rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-400">
              Cardano · pending
            </span>
          )}
        </div>

        {/* ── description ── */}
        <p className="text-sm text-gray-400 leading-relaxed mb-8 max-w-[380px]">
          Your Genesis hex is now secured on Base
          {detail.cardanoMirrorStatus === 'minted' ? ' and anchored to Cardano' : ''}.
          The full NFT card and metadata live on the detail page.
        </p>

        {/* ── Magic wallet notice ── */}
        {isMagic && (
          <div className="w-full flex items-start gap-3 rounded-xl border border-violet-700/40 bg-violet-950/30 px-4 py-3.5 mb-6 text-left">
            <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-bold text-violet-300 mb-0.5">NFT is in your Magic wallet</p>
              <p className="text-[11px] text-violet-400/80 leading-relaxed">
                Sign in at{' '}
                <a
                  href="https://wallet.magic.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-violet-300"
                >
                  wallet.magic.link
                </a>{' '}
                with the same email address to access your NFT, or import the private key into MetaMask.
              </p>
            </div>
          </div>
        )}

        {/* ── Add to MetaMask — prominent, right after the NFT card ── */}
        {hasMetaMask && (
          <button
            onClick={() => addToMetaMask(detail)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-orange-700/60 bg-orange-950/50 px-8 py-4 text-[15px] font-black text-orange-300 transition-all hover:border-orange-600 hover:bg-orange-950/70 mb-3"
          >
            <Wallet className="w-4 h-4" />
            Add NFT to MetaMask
          </button>
        )}

        {/* ── primary CTA ── */}
        <Link
          href={`/list/${encodeURIComponent(detail.hexId)}`}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-malama-accent px-8 py-4 font-mono text-sm font-black text-black shadow-[0_0_32px_rgba(196,240,97,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_0_42px_rgba(196,240,97,0.38)] mb-4"
        >
          View your hex →
        </Link>

        {/* ── transaction links row ── */}
        {(hasBase || hasCardano || dagwelldevUrl) && (
          <div className="w-full flex gap-3 mb-3">
            {hasBase && (
              <ExternalButton
                href={detail.baseExplorerUrl!}
                className="flex-1 border border-zinc-700 bg-zinc-900 text-gray-200 hover:border-zinc-500 hover:bg-zinc-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Base tx
              </ExternalButton>
            )}
            {hasCardano && (
              <ExternalButton
                href={cardanoScanUrl!}
                className="flex-1 border border-zinc-700 bg-zinc-900 text-gray-200 hover:border-zinc-500 hover:bg-zinc-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                CardanoScan
              </ExternalButton>
            )}
            {dagwelldevUrl && (
              <ExternalButton
                href={dagwelldevUrl}
                className="flex-1 border border-malama-teal/40 bg-malama-teal/5 text-malama-teal hover:border-malama-teal/70 hover:bg-malama-teal/10"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Dagwell
              </ExternalButton>
            )}
          </div>
        )}

        {/* ── secondary actions row (OpenSea only — MetaMask moved above) ── */}
        {openSeaUrl && (
          <div className="w-full flex gap-3 mb-3">
            <ExternalButton
              href={openSeaUrl}
              className="flex-1 border border-blue-900/60 bg-blue-950/50 text-blue-300 hover:border-blue-700 hover:bg-blue-950"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              OpenSea
            </ExternalButton>
          </div>
        )}

        {/* ── discord ── */}
        <ExternalButton
          href={discordUrl}
          className="w-full border border-indigo-800/50 bg-indigo-950/40 text-indigo-300 hover:border-indigo-600 hover:bg-indigo-950/70 mb-10"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Join Operator Discord
        </ExternalButton>

        {/* ── footer links ── */}
        {sessionId && (
          <p className="font-mono text-[10px] text-gray-700 mb-4">
            Stripe session: {sessionId.slice(0, 24)}…
          </p>
        )}
        <Link
          href="/presale"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-300"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to presale
        </Link>
      </div>
    </div>
  )
}

// ─── inner (needs useSearchParams) ───────────────────────────────────────────

function CardCompleteInner() {
  const params = useSearchParams()
  const hexId = params.get('hex')
  const sessionId = params.get('session_id')
  const isMagic = params.get('magic') === '1'
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
          setPhase({ kind: 'confirmed', detail })
          return
        }
        attempts++
        if (attempts >= maxAttempts) {
          setPhase({
            kind: 'error',
            message:
              'Payment received — still waiting on the backend to finalize your mint. Refresh this page, or check your hex detail page in a minute.',
            hexId,
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
          hexId: hexId ?? undefined,
        })
      }
    }

    void poll()
    return () => { cancelled = true }
  }, [hexId])

  // ── loading / pending ──
  if (phase.kind === 'loading' || phase.kind === 'pending') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-malama-accent/10 blur-2xl scale-150" />
          <Loader2 className="relative w-14 h-14 text-malama-accent animate-spin" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-black text-white mb-3">Finalizing your reservation</h1>
        <p className="text-gray-400 max-w-sm leading-relaxed">
          {phase.kind === 'pending'
            ? `Payment confirmed — waiting for the on-chain mint to settle. (${phase.attempts}/30)`
            : 'Confirming payment with the backend…'}
        </p>
        {sessionId && (
          <p className="mt-6 font-mono text-[10px] text-gray-700">
            Stripe session: {sessionId.slice(0, 24)}…
          </p>
        )}
      </div>
    )
  }

  // ── error ──
  if (phase.kind === 'error') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-24 text-center">
        <AlertCircle className="w-12 h-12 text-amber-400 mb-6" strokeWidth={1.5} />
        <h1 className="text-2xl font-black text-white mb-3">Hang tight</h1>
        <p className="text-gray-400 max-w-md leading-relaxed mb-8">{phase.message}</p>
        {phase.hexId && (
          <Link
            href={`/list/${encodeURIComponent(phase.hexId)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-malama-accent/10 border border-malama-accent/30 px-6 py-3 font-mono text-sm font-bold text-malama-accent transition-all hover:bg-malama-accent/20 mb-4"
          >
            <ExternalLink className="w-4 h-4" />
            Check hex {phase.hexId} →
          </Link>
        )}
        <Link href="/presale" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to presale
        </Link>
      </div>
    )
  }

  // ── confirmed ──
  return <ConfirmedView detail={phase.detail} sessionId={sessionId} isMagic={isMagic} />
}

// ─── page export ─────────────────────────────────────────────────────────────

export default function CardCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-malama-accent animate-spin" strokeWidth={1.5} />
        </div>
      }
    >
      <CardCompleteInner />
    </Suspense>
  )
}

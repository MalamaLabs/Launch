'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAccount, useDisconnect } from 'wagmi'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMagic } from '@/components/magic/MagicProvider'

type SessionData = { auth: 'email' | null; email?: string | null }

type NavItem = {
  href?: string
  label: string
  active: (p: string) => boolean
  authOnly?: boolean
  children?: { href: string; label: string }[]
}

// Sub-pages of the Sensor Systems landing (section anchors on /sensors).
const SENSORS_LINKS = [
  { href: '/sensors',             label: 'Sensor Systems' },
  { href: '/sensors#use-cases',   label: 'Use Cases' },
  { href: '/sensors#specs',       label: 'Specifications' },
  { href: '/sensors#deployments', label: 'Deployments' },
]

// Top nav: 5 primary items shown on desktop (parity with malamalabs.com).
// Secondary items live in the mobile hamburger menu + the footer.
const primaryNavLinks: NavItem[] = [
  { label: 'Sensors',        active: (p) => p.startsWith('/sensors'), children: SENSORS_LINKS },
  { href: '/presale',        label: 'Reserve',     active: (p) => p.startsWith('/presale') },
  { href: '/explorer',       label: 'Explore',     active: (p) => p === '/explorer' || p.startsWith('/explorer/') },
  { href: '/docs',           label: 'Docs',        active: (p) => p.startsWith('/docs') || p === '/whitepaper' },
  { href: '/data-solutions', label: 'Data Buyers', active: (p) => p.startsWith('/data-solutions') },
]
const secondaryNavLinks: NavItem[] = [
  { href: '/timeline',  label: 'Timeline',  active: (p) => p.startsWith('/timeline') },
  { href: '/partners',  label: 'Partners',  active: (p) => p.startsWith('/partners') },
  { href: '/dashboard', label: 'Dashboard', active: (p) => p.startsWith('/dashboard'), authOnly: true },
]

const CORPORATE_URL = process.env.NEXT_PUBLIC_CORPORATE_URL || 'https://malamalabs.com'

const NAV_BTN =
  'shrink-0 whitespace-nowrap rounded-malama-sm px-[18px] py-[11px] text-center font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-all hover:-translate-y-px'

// Small dot colored by auth method
function AuthDot({ method }: { method: 'evm' | 'email' }) {
  const color = method === 'evm' ? 'bg-blue-400' : 'bg-emerald-400'
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color} shrink-0`} />
}

export default function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()

  // ── Wallet state (client-side) ────────────────────────────────────────────
  const { address: evmAddress, isConnected: evmConnected } = useAccount()
  const { disconnect: disconnectEvm } = useDisconnect()
  const { magic } = useMagic()

  // ── Server session state ──────────────────────────────────────────────────
  const [session, setSession]       = useState<SessionData | undefined>(undefined)
  const [signingOut, setSigningOut] = useState(false)
  const [magicEmail, setMagicEmail] = useState<string | null>(null)
  const [sensorsOpen, setSensorsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the Sensors dropdown + mobile menu whenever the route changes.
  useEffect(() => { setSensorsOpen(false); setMenuOpen(false) }, [pathname])

  const fetchSession = useCallback(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { auth: null }))
      .then((d: SessionData) => setSession(d))
      .catch(() => setSession({ auth: null }))
  }, [])

  // Re-fetch on mount and whenever the route changes
  useEffect(() => { fetchSession() }, [fetchSession, pathname])

  // Re-fetch whenever any part of the app signals an auth state change
  useEffect(() => {
    const handler = () => fetchSession()
    window.addEventListener('malama:auth', handler)
    return () => window.removeEventListener('malama:auth', handler)
  }, [fetchSession])

  // ── Magic session check ───────────────────────────────────────────────────
  // Magic manages its own session independently of wagmi/Mesh, so we probe it
  // here so the nav shows the right state for email/Magic-authenticated users.
  useEffect(() => {
    if (!magic) return
    magic.user.isLoggedIn()
      .then((ok: boolean) => {
        if (!ok) { setMagicEmail(null); return }
        return magic.user.getInfo().then((info: any) => {
          setMagicEmail(info.email ?? null)
        })
      })
      .catch(() => setMagicEmail(null))
  }, [magic, pathname])

  // ── Combine all auth sources ──────────────────────────────────────────────
  const isAuthed  = session?.auth != null || evmConnected || magicEmail != null
  const isLoading = session === undefined

  const authMethod: 'evm' | 'email' | null =
    evmConnected      ? 'evm'     :
    magicEmail != null ? 'email'  :
    session?.auth === 'email' ? 'email' :
    null

  let authIdentity: string | null = null
  if (evmConnected && evmAddress) {
    authIdentity = `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}`
  } else if (magicEmail) {
    authIdentity = magicEmail.length > 22 ? `${magicEmail.slice(0, 20)}…` : magicEmail
  } else if (session?.email) {
    authIdentity = session.email.length > 22
      ? `${session.email.slice(0, 20)}…`
      : session.email
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function handleSignOut() {
    setSigningOut(true)
    try {
      if (evmConnected) disconnectEvm()
      if (magic) {
        try { await magic.user.logout() } catch { /* ignore */ }
        setMagicEmail(null)
      }
      // Clear dashboard auth state so the dashboard doesn't auto-restore the
      // previous session on next visit, and set a guard that prevents the
      // wallet auto-detect effect from immediately re-connecting.
      sessionStorage.removeItem('dashboardAuthMethod')
      sessionStorage.setItem('malama:logged_out', '1')
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      setSession({ auth: null })
      window.dispatchEvent(new Event('malama:auth'))
      router.push('/')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-malama-line bg-malama-bg/80 backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-[14px] sm:px-10">

        {/* ── Logo ── */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-malama-accent/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="Mālama Labs"
            width={32}
            height={32}
            className="shrink-0 drop-shadow-[0_0_10px_rgba(101,217,165,0.3)] transition-[filter] duration-300 hover:drop-shadow-[0_0_18px_rgba(101,217,165,0.5)]"
          />
          <span className="hidden xs:inline font-black tracking-tight text-white text-[1.05rem] leading-none drop-shadow-[0_0_18px_rgba(101,217,165,0.18)] transition-[filter] duration-300 hover:drop-shadow-[0_0_26px_rgba(101,217,165,0.35)]">
            Mālama Labs
          </span>
        </Link>

        {/* ── Right side ── */}
        <div className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-2">
          {/* Desktop nav links (5 primary) — hidden on mobile, replaced by the hamburger */}
          <div className="hidden lg:flex items-center gap-0.5">
          {primaryNavLinks
            .filter(({ authOnly }) => !authOnly || isAuthed)
            .map((item) => {
              const linkCls = `shrink-0 whitespace-nowrap rounded-sm px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] transition-colors sm:px-4 ${
                item.active(pathname) ? 'text-malama-accent' : 'text-malama-ink-dim hover:text-malama-accent'
              }`

              // Dropdown item (e.g. Sensors)
              if (item.children) {
                return (
                  <div key={item.label} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setSensorsOpen((o) => !o)}
                      aria-expanded={sensorsOpen}
                      className={`${linkCls} inline-flex items-center gap-1`}
                    >
                      {item.label}
                      <ChevronDown className={`h-3 w-3 transition-transform ${sensorsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {/* click-away catcher (instant) */}
                    {sensorsOpen && (
                      <div className="fixed inset-0 z-40" onClick={() => setSensorsOpen(false)} />
                    )}
                    {/* animated panel */}
                    <AnimatePresence>
                      {sensorsOpen && (
                        <motion.div
                          key="sensors-menu"
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.96 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute left-0 top-full z-50 mt-2 min-w-[210px] origin-top overflow-hidden rounded-xl border border-malama-line bg-malama-card/95 py-1.5 shadow-2xl backdrop-blur-xl"
                        >
                          {item.children.map((c, i) => (
                            <motion.div
                              key={c.href}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.03 + i * 0.035, duration: 0.2 }}
                            >
                              <Link
                                href={c.href}
                                onClick={() => setSensorsOpen(false)}
                                className="block whitespace-nowrap px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-malama-ink-dim transition-colors hover:bg-malama-accent/10 hover:text-malama-accent"
                              >
                                {c.label}
                              </Link>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }

              // Standard link
              return item.href ? (
                <Link key={item.href} href={item.href} className={linkCls}>
                  {item.label}
                </Link>
              ) : null
            })}
          </div>

          {/* Corporate link */}
          <a
            href={CORPORATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-malama-ink-faint hover:text-malama-accent transition-colors sm:px-4"
          >
            malamalabs.com
            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 9L9 1M9 1H3M9 1V7"/>
            </svg>
          </a>

          {/* ── Auth section — don't render until session resolves ── */}
          {!isLoading && (
            isAuthed ? (
              <div className="ml-1 sm:ml-2 flex items-center gap-1.5">
                {/* Identity chip */}
                {authIdentity && authMethod && (
                  <span className="hidden md:inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-malama-sm border border-malama-line bg-malama-card px-3 py-[11px] font-mono text-[10px] text-malama-ink-dim tracking-wide">
                    <AuthDot method={authMethod} />
                    {authIdentity}
                  </span>
                )}

                {/* Log Out */}
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className={`${NAV_BTN} border border-malama-line text-malama-ink-dim hover:border-red-500/50 hover:text-red-400 disabled:opacity-40`}
                >
                  {signingOut ? 'Signing out…' : 'Log Out'}
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                className={`ml-1 sm:ml-2 ${NAV_BTN} bg-malama-accent text-malama-bg hover:shadow-[0_8px_24px_rgba(196,240,97,0.2)]`}
              >
                Log In / Register
              </Link>
            )
          )}

          {/* Hamburger — mobile only */}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-malama-sm border border-malama-line text-malama-ink-dim transition-colors hover:border-malama-accent/50 hover:text-malama-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="lg:hidden border-t border-malama-line bg-malama-bg/95 px-5 py-3 backdrop-blur-[14px] sm:px-10">
          <div className="flex flex-col">
            {[...primaryNavLinks, ...secondaryNavLinks]
              .filter(({ authOnly }) => !authOnly || isAuthed)
              .map((item) => {
                const itemCls = (isActive: boolean) =>
                  `rounded-sm px-2 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.1em] transition-colors ${
                    isActive ? 'text-malama-accent' : 'text-malama-ink-dim hover:text-malama-accent'
                  }`

                // Dropdown parent (Sensors): link to the landing + list its anchors.
                if (item.children) {
                  return (
                    <div key={item.label} className="flex flex-col">
                      <Link
                        href="/sensors"
                        onClick={() => setMenuOpen(false)}
                        className={itemCls(item.active(pathname))}
                      >
                        {item.label}
                      </Link>
                      {item.children.slice(1).map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setMenuOpen(false)}
                          className="rounded-sm pl-5 pr-2 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-malama-ink-faint transition-colors hover:text-malama-accent"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )
                }

                return item.href ? (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={itemCls(item.active(pathname))}
                  >
                    {item.label}
                  </Link>
                ) : null
              })}
            <a
              href={CORPORATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="rounded-sm px-2 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-malama-ink-faint transition-colors hover:text-malama-accent"
            >
              malamalabs.com ↗
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}

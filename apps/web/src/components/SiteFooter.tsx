import Link from 'next/link'

const DISCORD_URL = 'https://discord.gg/PcKRRUcJ'

const bottomNav: { href: string; label: string; external?: boolean }[] = [
  { href: '/docs', label: 'Documentation Hub' },
  { href: '/docs/tokenomics', label: 'White Paper' },
  { href: '/docs/pricing-roi', label: 'Pricing and ROI' },
  { href: '/docs/phase-1-timeline', label: 'Phase 1 Timeline' },
  { href: '/docs/operators', label: 'Operator Documentation' },
  { href: DISCORD_URL, label: 'Discord Community', external: true },
  { href: '/legal', label: 'Legal' },
]

export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-gray-800 bg-[#0A1628]/95 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <nav
          aria-label="Site"
          className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm"
        >
          {bottomNav.map((item) =>
            item.external === true ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-emerald-400 transition-colors font-medium"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="text-gray-400 hover:text-emerald-400 transition-colors font-medium"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
        <p className="text-center text-gray-600 text-xs mt-8">
          © 2026 Mālama Labs. Environmental Intelligence Core. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

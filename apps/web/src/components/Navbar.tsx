'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const topNavLinks = [
  { href: '/presale', label: 'Reserve', active: (p: string) => p.startsWith('/presale') },
  { href: '/docs', label: 'Docs', active: (p: string) => p.startsWith('/docs') },
  { href: '/timeline', label: 'Timeline', active: (p: string) => p.startsWith('/timeline') },
  { href: '/map', label: 'Explorer', active: (p: string) => p === '/map' || p.startsWith('/map/') },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="w-full bg-black border-b border-gray-900 z-50 sticky top-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center min-h-[4.5rem] py-2.5 sm:min-h-20 sm:py-3 gap-4 min-w-0">
          <Link
            href="/"
            className="flex items-center shrink-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/50"
          >
            <Image
              src="/brand-logo.png"
              alt="Mālama Labs Logo"
              width={700}
              height={300}
              priority
              className="h-10 w-auto max-w-[min(100%,16rem)] sm:h-12 sm:max-w-[22rem] md:h-14 md:max-w-[26rem] object-contain object-left
                drop-shadow-[0_0_14px_rgba(16,185,129,0.22)]
                hover:drop-shadow-[0_0_22px_rgba(52,211,153,0.4)]
                transition-[filter] duration-300"
            />
          </Link>

          <div className="flex items-center justify-end gap-1 sm:gap-3 min-w-0 py-1 -mr-1">
            {topNavLinks.map(({ href, label, active }) => (
              <Link
                key={href}
                href={href}
                className={`shrink-0 whitespace-nowrap transition-colors text-xs sm:text-sm font-medium px-2 py-1 rounded-md ${
                  active(pathname) ? 'text-emerald-400' : 'text-gray-400 hover:text-emerald-400'
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className={`shrink-0 whitespace-nowrap text-xs sm:text-sm font-bold px-3 sm:px-5 py-2 rounded-full shadow-lg shadow-emerald-400/20 hover:scale-105 transition-transform duration-300 ease-out ml-1 sm:ml-2 ${
                pathname.startsWith('/dashboard')
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              Launch App
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

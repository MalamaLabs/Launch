'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Hexagon } from 'lucide-react'

export default function Navbar() {
  const pathname = usePathname()
  const isHome = pathname === '/'

  return (
    <nav className="w-full bg-malama-deep/80 backdrop-blur-md border-b border-gray-800 z-50 sticky top-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <Hexagon className="w-8 h-8 text-malama-teal" />
            <span className="text-xl font-bold tracking-tight text-white">Mālama<span className="text-malama-teal">Labs</span></span>
          </Link>
          <div className="flex items-center space-x-6">
            {isHome && (
              <>
                <Link href="#network" className="text-gray-300 hover:text-white transition-colors text-sm font-medium">Network</Link>
                <Link href="#stack" className="text-gray-300 hover:text-white transition-colors text-sm font-medium">Stack</Link>
              </>
            )}
            <Link href="/dashboard" className="bg-malama-teal text-malama-deep px-5 py-2 rounded-full font-bold text-sm shadow-lg shadow-malama-teal/20 hover:scale-105 transition-transform duration-300 ease-out">
              Launch App
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

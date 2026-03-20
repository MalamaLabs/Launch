'use client'

import Link from 'next/link'
import { Hexagon } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="w-full bg-malama-deep/80 backdrop-blur-md border-b border-gray-800 z-50 sticky top-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <Hexagon className="w-8 h-8 text-malama-teal" />
            <span className="text-xl font-bold tracking-tight text-white">Mālama<span className="text-malama-teal">Labs</span></span>
          </div>
          <div className="flex items-center space-x-6">
            <Link href="#network" className="text-gray-300 hover:text-white transition-colors text-sm font-medium">Network</Link>
            <Link href="#stack" className="text-gray-300 hover:text-white transition-colors text-sm font-medium">Stack</Link>
            <button className="bg-malama-teal text-malama-deep px-5 py-2 rounded-full font-bold text-sm shadow-lg shadow-malama-teal/20 hover:scale-105 transition-transform duration-300 ease-out">
              Launch App
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

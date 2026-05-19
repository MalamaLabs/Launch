'use client'

import React from 'react'
import Link from 'next/link'
import { List } from 'lucide-react'
import HexMapDynamic from './HexMapDynamic'

export default function MapPageClient() {
  // Scroll lock removed (2026-05-19).
  // The GenesisHexDetail drawer is `fixed top-0 right-0 h-[100dvh]` — fixed
  // elements are unaffected by page scroll, so locking html/body overflow is
  // unnecessary. Removing the lock lets the global SiteFooter be reached by
  // scrolling a short distance past the map canvas, restoring site navigation
  // for operators arriving via the "Hex Map Explorer" CTA.
  // The map canvas itself stays `overflow-hidden` at the container level so
  // hexes never clip outside the tile boundary.

  return (
    <div className="relative h-full w-full min-h-0 bg-malama-deep">
      <HexMapDynamic />
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="pointer-events-auto absolute right-4 top-4 max-w-[min(100%,20rem)] sm:right-8 sm:top-24">
          <Link
            href="/list"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-700 bg-malama-deep/95 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-xl backdrop-blur-md transition-colors hover:border-malama-teal hover:text-malama-teal"
          >
            <List className="h-4 w-4 shrink-0" aria-hidden />
            See list view
          </Link>
        </div>
      </div>
    </div>
  )
}

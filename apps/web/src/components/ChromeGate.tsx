'use client'

/**
 * Wrapper for global site chrome (Navbar / SiteFooter). Currently a passthrough —
 * every route, including /sensors, now shares the global nav + footer so the site
 * feels like one product. Kept as a seam in case a future route ever needs a
 * standalone (chrome-less) layout.
 */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

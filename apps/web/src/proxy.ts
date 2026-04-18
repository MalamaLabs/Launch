import { auth0 } from './lib/auth0'
import { NextResponse } from 'next/server'

const ACCESS_COOKIE = 'malama_access'
const ACCESS_VALUE  = 'ml-launch-2026-authorized'

// Paths that bypass the password gate entirely
function isPublicPath(pathname: string) {
  return (
    pathname === '/password' ||
    pathname.startsWith('/api/auth/password') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  )
}

export async function proxy(request: Request) {
  const url = new URL(request.url)
  const { pathname } = url

  // ── Password gate ────────────────────────────────────────────────────────
  if (!isPublicPath(pathname)) {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const hasAccess = cookieHeader
      .split(';')
      .some(c => c.trim() === `${ACCESS_COOKIE}=${ACCESS_VALUE}`)

    if (!hasAccess) {
      const dest = new URL('/password', request.url)
      dest.searchParams.set('from', pathname)
      return NextResponse.redirect(dest)
    }
  }

  // ── Auth0 middleware (runs after password gate passes) ───────────────────
  return auth0.middleware(request)
}

export const config = {
  matcher: [
    // Do not run on /api — JSON handlers (Stripe, Magic, custodial) must not be intercepted.
    // Password gate API route (/api/auth/password) is handled by isPublicPath() above.
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}

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

/**
 * Password gate only. Auth0 middleware was previously chained here but the
 * Genesis-200 hex sale flow does not use Auth0 — loading it on every request
 * was adding ~10s to dev-mode compiles without affecting the buy path.
 */
export async function proxy(request: Request) {
  const url = new URL(request.url)
  const { pathname } = url

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const hasAccess = cookieHeader
    .split(';')
    .some(c => c.trim() === `${ACCESS_COOKIE}=${ACCESS_VALUE}`)

  if (!hasAccess) {
    const dest = new URL('/password', request.url)
    dest.searchParams.set('from', pathname)
    return NextResponse.redirect(dest)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Do not run on /api — JSON handlers (Stripe, purchase-intent, etc.) must not be intercepted.
    // Password gate API route (/api/auth/password) is handled by isPublicPath() above.
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}

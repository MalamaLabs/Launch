import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'malama_access'
const COOKIE_VALUE = 'ml-launch-2026-authorized'

// Paths that are always public (no password gate)
const PUBLIC_PATHS = [
  '/password',
  '/api/auth/password',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/auth/password') ||
    pathname === '/password'
  ) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE_NAME)
  if (cookie?.value === COOKIE_VALUE) {
    return NextResponse.next()
  }

  // Not authorized — redirect to password gate
  const url = request.nextUrl.clone()
  url.pathname = '/password'
  url.searchParams.set('from', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

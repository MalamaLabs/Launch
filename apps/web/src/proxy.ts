import { auth0 } from './lib/auth0'

export async function proxy(request: Request) {
  return auth0.middleware(request)
}

export const config = {
  matcher: [
    // Do not run Auth0 on /api — JSON handlers (Stripe, Magic, custodial) must not be intercepted (would 404).
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}

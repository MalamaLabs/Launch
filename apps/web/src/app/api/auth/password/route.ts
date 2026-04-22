import { NextResponse } from 'next/server'

const PASSWORD = 'ML-TokenLaunch-2026!'
const COOKIE_NAME = 'malama_access'
const COOKIE_VALUE = 'ml-launch-2026-authorized'
// 7 days
const MAX_AGE = 60 * 60 * 24 * 7

export async function POST(req: Request) {
  // Guard against empty/malformed bodies (prefetches, HEAD probes, etc.)
  // throwing SyntaxError on req.json() and blowing up the middleware stack.
  let body: { password?: unknown; from?: unknown } = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { password, from } = body as { password?: string; from?: string }

  if (password !== PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const redirectTo = (typeof from === 'string' && from.startsWith('/') && !from.startsWith('/password'))
    ? from
    : '/'

  const res = NextResponse.json({ ok: true, redirectTo })
  res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    // secure: true in production (Vercel sets this automatically via HTTPS)
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

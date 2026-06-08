import { NextResponse } from 'next/server'
import { createEmailSessionToken } from '@/lib/email-session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Auth is phased: the session cookie is still signed here on the FE, but the
// user account now lives in Mongo behind the backend. We upsert via the BE so
// the FE holds no database connection.
const API_BASE = (
  process.env.NEXT_PUBLIC_DAGWELLDEV_API_BASE?.trim() || 'https://api.dagwelldev.com'
).replace(/\/$/, '')

export async function POST(req: Request) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  // Create account on first sign-in; no-op (merge) on subsequent logins.
  // Delegated to the backend (single source of truth in Mongo).
  await fetch(`${API_BASE}/users/me?email=${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase() }),
  }).catch((err) => console.error('[email-session] BE account upsert failed:', err))

  const token = createEmailSessionToken(email)
  const res = NextResponse.json({ ok: true, email: email.toLowerCase() })
  res.cookies.set('malama_email_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}

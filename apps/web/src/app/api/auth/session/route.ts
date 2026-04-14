import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth0 } from '@/lib/auth0'
import { parseEmailSessionToken } from '@/lib/email-session'

export async function GET() {
  const session = await auth0.getSession()
  if (session?.user) {
    const u = session.user
    const email = typeof u.email === 'string' ? u.email : null
    const sub = typeof u.sub === 'string' ? u.sub : null
    return NextResponse.json({
      email,
      sub,
      auth: 'auth0' as const,
      user: u,
    })
  }

  const jar = await cookies()
  const raw = jar.get('malama_email_session')?.value
  if (!raw) {
    return NextResponse.json({ email: null, sub: null, auth: null, user: null })
  }
  const parsed = parseEmailSessionToken(raw)
  return NextResponse.json({
    email: parsed?.email ?? null,
    sub: null,
    auth: parsed ? ('email' as const) : null,
    user: null,
  })
}

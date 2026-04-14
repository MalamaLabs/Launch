import { createHmac, timingSafeEqual } from 'crypto'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function getEmailSessionSecret(): string {
  return (
    process.env.EMAIL_SESSION_SECRET ||
    process.env.CUSTODIAL_ENCRYPTION_KEY ||
    'malama-dev-email-session-secret'
  )
}

/** Signed opaque token stored in httpOnly cookie (server-only). */
export function createEmailSessionToken(email: string): string {
  const norm = email.toLowerCase().trim()
  const exp = Date.now() + MAX_AGE_MS
  const payload = JSON.stringify({ email: norm, exp })
  const sig = createHmac('sha256', getEmailSessionSecret()).update(payload).digest('hex')
  return Buffer.from(JSON.stringify({ payload, sig }), 'utf8').toString('base64url')
}

export function parseEmailSessionToken(token: string): { email: string } | null {
  try {
    const raw = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      payload: string
      sig: string
    }
    const expected = createHmac('sha256', getEmailSessionSecret()).update(raw.payload).digest('hex')
    const a = Buffer.from(raw.sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const data = JSON.parse(raw.payload) as { email: string; exp: number }
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    if (typeof data.email !== 'string' || !data.email.includes('@')) return null
    return { email: data.email }
  } catch {
    return null
  }
}

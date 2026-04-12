import { NextResponse } from 'next/server'
import {
  getMagicSecretKey,
  magicCreateIdentityProvider,
  magicListIdentityProviders,
} from '@/lib/magic-express'

/**
 * Ops-only: register / list Magic Express identity providers (OIDC → Magic JWT verification).
 * Requires MALAMA_OPS_KEY and x-malama-ops-key header (or Authorization: Bearer).
 *
 * POST body (optional if env MAGIC_IDP_ISSUER / MAGIC_IDP_AUDIENCE / MAGIC_IDP_JWKS_URI are set):
 * { "issuer": "...", "audience": "...", "jwks_uri": "..." }
 *
 * Response includes `id` — store as MAGIC_OIDC_PROVIDER_ID for Express wallet API calls.
 */

function authorize(req: Request): boolean {
  const key = process.env.MALAMA_OPS_KEY?.trim()
  if (!key) return false
  const h = req.headers.get('x-malama-ops-key')
  if (h === key) return true
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7) === key
  }
  return false
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const secret = getMagicSecretKey()
  if (!secret) {
    return NextResponse.json(
      { error: 'MAGIC_SECRET_KEY not configured on server' },
      { status: 503 }
    )
  }
  try {
    const providers = await magicListIdentityProviders(secret)
    return NextResponse.json({ providers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Magic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const secret = getMagicSecretKey()
  if (!secret) {
    return NextResponse.json(
      { error: 'MAGIC_SECRET_KEY not configured on server' },
      { status: 503 }
    )
  }

  let issuer: string | undefined
  let audience: string | undefined
  let jwks_uri: string | undefined

  try {
    const json = (await req.json()) as {
      issuer?: string
      audience?: string
      jwks_uri?: string
    }
    issuer = json.issuer?.trim()
    audience = json.audience?.trim()
    jwks_uri = json.jwks_uri?.trim()
  } catch {
    /* body optional */
  }

  issuer = issuer || process.env.MAGIC_IDP_ISSUER?.trim()
  audience = audience || process.env.MAGIC_IDP_AUDIENCE?.trim()
  jwks_uri = jwks_uri || process.env.MAGIC_IDP_JWKS_URI?.trim()

  if (!issuer || !audience || !jwks_uri) {
    return NextResponse.json(
      {
        error:
          'Missing issuer, audience, jwks_uri — pass JSON body or set MAGIC_IDP_ISSUER, MAGIC_IDP_AUDIENCE, MAGIC_IDP_JWKS_URI',
      },
      { status: 400 }
    )
  }

  try {
    const created = await magicCreateIdentityProvider(secret, { issuer, audience, jwks_uri })
    return NextResponse.json({
      ...created,
      hint: 'Save `id` as MAGIC_OIDC_PROVIDER_ID for Express wallet API requests with user JWTs.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Magic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

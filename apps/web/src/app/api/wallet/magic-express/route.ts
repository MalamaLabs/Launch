import { NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { magicExpressGetOrCreateWallet } from '@/lib/magic-express'

export const runtime = 'nodejs'

/**
 * Server-only: calls Magic Express `POST /v1/wallet` using the logged-in user's Auth0 access token.
 * Requires Auth0 session + access token (configure API audience / scopes as needed).
 * Does not expose Magic keys to the client.
 */
export async function POST() {
  try {
    const session = await auth0.getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Sign in with Auth0 first' }, { status: 401 })
    }

    const { token } = await auth0.getAccessToken()
    if (!token) {
      return NextResponse.json(
        {
          error:
            'No OAuth access token. Ensure AUTH0_AUDIENCE matches your Magic IDP API identifier and the user granted scopes.',
        },
        { status: 403 }
      )
    }

    const { publicAddress, raw } = await magicExpressGetOrCreateWallet(token)
    return NextResponse.json({ publicAddress, express: raw })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Magic Express wallet error'
    console.error('[magic-express wallet]', e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

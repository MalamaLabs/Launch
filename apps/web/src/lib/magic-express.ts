/**
 * Magic Express API (TEE) — identity provider + wallet operations.
 * @see https://docs.magic.link/api-wallets/express-api/identity-provider
 *
 * Flow for fiat / non-custodial-server-wallet users:
 * 1. Configure an OIDC issuer (Auth0, Firebase, Clerk, or custom) with JWKS.
 * 2. POST /v1/identity/provider with issuer, audience, jwks_uri — save returned `id` as MAGIC_OIDC_PROVIDER_ID.
 * 3. Authenticate users; pass their JWT + X-Magic-Secret-Key + X-OIDC-Provider-ID to Express wallet APIs.
 */

const MAGIC_EXPRESS_V1 = 'https://tee.express.magiclabs.com/v1'

export type MagicIdentityProvider = {
  id: string
  issuer: string
  audience: string
  jwks_uri: string
}

function secretHeaders(secretKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Magic-Secret-Key': secretKey,
  }
}

export async function magicCreateIdentityProvider(
  secretKey: string,
  body: Pick<MagicIdentityProvider, 'issuer' | 'audience' | 'jwks_uri'>
): Promise<MagicIdentityProvider> {
  const res = await fetch(`${MAGIC_EXPRESS_V1}/identity/provider`, {
    method: 'POST',
    headers: secretHeaders(secretKey),
    body: JSON.stringify({
      issuer: body.issuer,
      audience: body.audience,
      jwks_uri: body.jwks_uri,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Magic identity provider create failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as MagicIdentityProvider
}

export async function magicListIdentityProviders(secretKey: string): Promise<MagicIdentityProvider[]> {
  const res = await fetch(`${MAGIC_EXPRESS_V1}/identity/provider`, {
    method: 'GET',
    headers: secretHeaders(secretKey),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Magic identity provider list failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as MagicIdentityProvider[]
}

export async function magicUpdateIdentityProvider(
  secretKey: string,
  id: string,
  body: Partial<Pick<MagicIdentityProvider, 'issuer' | 'audience' | 'jwks_uri'>>
): Promise<MagicIdentityProvider> {
  const res = await fetch(`${MAGIC_EXPRESS_V1}/identity/provider/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: secretHeaders(secretKey),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Magic identity provider update failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as MagicIdentityProvider
}

export async function magicDeleteIdentityProvider(secretKey: string, id: string): Promise<void> {
  const res = await fetch(`${MAGIC_EXPRESS_V1}/identity/provider/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: secretHeaders(secretKey),
  })
  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    throw new Error(`Magic identity provider delete failed (${res.status}): ${text}`)
  }
}

export function getMagicSecretKey(): string | undefined {
  return process.env.MAGIC_SECRET_KEY?.trim() || process.env.X_MAGIC_SECRET_KEY?.trim()
}

/** Publishable key for Express wallet API (`X-Magic-API-Key`). */
export function getMagicPublishableApiKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_MAGIC_API_KEY?.trim() ||
    process.env.MAGIC_PUBLISHABLE_API_KEY?.trim()
  )
}

export type MagicExpressWalletResponse = {
  public_address?: string
  publicAddress?: string
  [key: string]: unknown
}

/**
 * Magic Express API — create or fetch TEE wallet for the authenticated OIDC user.
 * Pass the **Auth0 (or other IdP) access token** JWT — must match the identity provider registered in Magic.
 * @see https://docs.magic.link/api-wallets/express-api/wallet
 */
export async function magicExpressGetOrCreateWallet(userJwt: string): Promise<{
  publicAddress: `0x${string}`
  raw: MagicExpressWalletResponse
}> {
  const pk = getMagicPublishableApiKey()
  const providerId = process.env.MAGIC_OIDC_PROVIDER_ID?.trim()
  const chain = process.env.MAGIC_EXPRESS_CHAIN?.trim() || 'ETH'
  if (!pk) {
    throw new Error('Set NEXT_PUBLIC_MAGIC_API_KEY (or MAGIC_PUBLISHABLE_API_KEY) for Express wallet API')
  }
  if (!providerId) {
    throw new Error('Set MAGIC_OIDC_PROVIDER_ID (from identity provider registration in Magic)')
  }

  const res = await fetch(`${MAGIC_EXPRESS_V1}/wallet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userJwt}`,
      'X-Magic-API-Key': pk,
      'X-OIDC-Provider-ID': providerId,
      'X-Magic-Chain': chain,
    },
  })
  const text = await res.text()
  let data: MagicExpressWalletResponse
  try {
    data = JSON.parse(text) as MagicExpressWalletResponse
  } catch {
    throw new Error(`Magic Express wallet: invalid JSON (${res.status}): ${text}`)
  }
  if (!res.ok) {
    throw new Error(`Magic Express wallet failed (${res.status}): ${text}`)
  }
  const addr = data.public_address ?? data.publicAddress
  if (typeof addr !== 'string' || !addr.startsWith('0x')) {
    throw new Error('Magic Express wallet response missing public_address')
  }
  return { publicAddress: addr as `0x${string}`, raw: data }
}

/**
 * Browser helper: Magic Express wallet via same-origin API (Auth0 session + server-side Express call).
 * For embedded Magic SDK (Email OTP) without Express, use `/launch` + `magic-sdk` instead.
 */
export async function getOrCreateWalletExpress(): Promise<{ publicAddress: string }> {
  const res = await fetch('/api/wallet/magic-express', {
    method: 'POST',
    credentials: 'include',
  })
  const data = (await res.json()) as { error?: string; publicAddress?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  if (!data.publicAddress) {
    throw new Error('Missing publicAddress in response')
  }
  return { publicAddress: data.publicAddress }
}

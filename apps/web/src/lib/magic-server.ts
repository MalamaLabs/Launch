import { Magic } from '@magic-sdk/admin'

let magicAdminPromise: Promise<Magic> | null = null

function getSecretKey(): string {
  const s = process.env.MAGIC_SECRET_KEY?.trim() || process.env.MAGIC_SECRET?.trim()
  if (!s) {
    throw new Error('MAGIC_SECRET_KEY (Magic Secret API key) is not configured')
  }
  return s
}

export async function getMagicAdmin(): Promise<Magic> {
  if (!magicAdminPromise) {
    magicAdminPromise = Magic.init(getSecretKey())
  }
  return magicAdminPromise
}

export async function verifyMagicDidToken(didToken: string): Promise<{
  email: string
  publicAddress: `0x${string}`
}> {
  const m = await getMagicAdmin()
  m.token.validate(didToken)
  const meta = await m.users.getMetadataByToken(didToken)
  const email = meta.email?.toLowerCase().trim()
  const publicAddress = meta.publicAddress as `0x${string}` | undefined
  if (!email || !publicAddress) {
    throw new Error('Magic session missing email or wallet address')
  }
  return { email, publicAddress }
}

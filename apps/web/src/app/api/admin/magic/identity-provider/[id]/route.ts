import { NextResponse } from 'next/server'
import {
  getMagicSecretKey,
  magicDeleteIdentityProvider,
  magicUpdateIdentityProvider,
} from '@/lib/magic-express'

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params
  let body: Partial<{ issuer: string; audience: string; jwks_uri: string }>
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  try {
    const updated = await magicUpdateIdentityProvider(secret, id, body)
    return NextResponse.json(updated)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Magic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params
  try {
    await magicDeleteIdentityProvider(secret, id)
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Magic API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

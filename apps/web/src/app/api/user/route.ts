/**
 * /api/user
 *
 * GET   — return the current user's account.
 *   Priority: email-session cookie → ?evmAddress=0x… → ?cardanoAddress=addr…
 *   Creates a bare account record on first call if none exists.
 *
 * PATCH — link an EVM or Cardano wallet address to the account.
 *   Requires email-session cookie OR ?evmAddress / ?cardanoAddress to identify the record.
 *   Body: { evmAddress?: string; cardanoAddress?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { parseEmailSessionToken } from '@/lib/email-session'
import {
  getUserByEmail,
  getUserByEvmAddress,
  getUserByCardanoAddress,
  upsertUserAccount,
  type UserAccount,
} from '@/lib/user-account'

async function getSessionEmail(): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get('malama_email_session')?.value
  if (!raw) return null
  const parsed = parseEmailSessionToken(raw)
  return parsed?.email?.toLowerCase() ?? null
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Email session (highest trust — httpOnly cookie)
  const email = await getSessionEmail()
  if (email) {
    const account = await getUserByEmail(email)
    const resolved: UserAccount = account ?? await upsertUserAccount({ email })
    return NextResponse.json({ account: resolved })
  }

  // 2. Wallet address query params (no session — read-only identity hint)
  const evmAddress     = req.nextUrl.searchParams.get('evmAddress')?.toLowerCase()
  const cardanoAddress = req.nextUrl.searchParams.get('cardanoAddress')?.toLowerCase()

  if (evmAddress) {
    const account = await getUserByEvmAddress(evmAddress)
    if (account) return NextResponse.json({ account })
    // No record yet — create a bare wallet-anchored account
    const created = await upsertUserAccount({ evmAddress })
    return NextResponse.json({ account: created })
  }

  if (cardanoAddress) {
    const account = await getUserByCardanoAddress(cardanoAddress)
    if (account) return NextResponse.json({ account })
    const created = await upsertUserAccount({ cardanoAddress })
    return NextResponse.json({ account: created })
  }

  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const email          = await getSessionEmail()
  const evmParam       = req.nextUrl.searchParams.get('evmAddress')?.toLowerCase()
  const cardanoParam   = req.nextUrl.searchParams.get('cardanoAddress')?.toLowerCase()

  // Require at least one identity signal
  if (!email && !evmParam && !cardanoParam) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { evmAddress?: string; cardanoAddress?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { evmAddress, cardanoAddress } = body
  if (!evmAddress && !cardanoAddress) {
    return NextResponse.json({ error: 'evmAddress or cardanoAddress required' }, { status: 400 })
  }

  // Resolve the anchor to find the existing account
  let existing = null
  if (email)        existing = await getUserByEmail(email)
  if (!existing && evmParam)     existing = await getUserByEvmAddress(evmParam)
  if (!existing && cardanoParam) existing = await getUserByCardanoAddress(cardanoParam)

  const account = await upsertUserAccount({
    email:          existing?.email ?? email ?? undefined,
    evmAddress:     evmAddress     ?? evmParam     ?? undefined,
    cardanoAddress: cardanoAddress ?? cardanoParam ?? undefined,
  })
  return NextResponse.json({ account })
}

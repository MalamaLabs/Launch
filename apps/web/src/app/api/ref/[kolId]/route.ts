/**
 * /api/ref/[kolId]
 *
 * GET  → vanity redirect: tracks click + 302 to /?ref=<kolId>
 * POST → background click ping from ReferralCapture component
 */

import { NextResponse } from 'next/server'
import { trackKOLClick, getKOL } from '@/lib/kol-registry'

export const runtime = 'nodejs'

const KOL_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/

async function handleTrack(kolId: string): Promise<boolean> {
  if (!KOL_ID_RE.test(kolId)) return false
  const partner = await getKOL(kolId)
  if (!partner || !partner.approved) return false
  await trackKOLClick(kolId)
  return true
}

// GET /api/ref/[kolId] — vanity redirect
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kolId: string }> }
) {
  const { kolId } = await params
  const home = new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://launch.malamalabs.com')

  if (!KOL_ID_RE.test(kolId)) {
    return NextResponse.redirect(home)
  }

  await handleTrack(kolId).catch(() => {})

  const dest = new URL('/', process.env.NEXT_PUBLIC_APP_URL ?? 'https://launch.malamalabs.com')
  dest.searchParams.set('ref', kolId)
  return NextResponse.redirect(dest, { status: 302 })
}

// POST /api/ref/[kolId]/track — background click ping
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ kolId: string }> }
) {
  const { kolId } = await params
  await handleTrack(kolId).catch(() => {})
  return NextResponse.json({ ok: true })
}

/**
 * GET  /api/shipping?wallet=0x…   — fetch profile by wallet address
 * GET  /api/shipping?email=…      — fetch profile by notification email
 * POST /api/shipping              — upsert shipping + notification email
 *
 * Body: { wallet?: string; email: string; shipping?: IShipping }
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserProfile } from '@/lib/models/UserProfile'

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase()
  const email  = req.nextUrl.searchParams.get('email')?.toLowerCase()

  if (!wallet && !email) {
    return NextResponse.json({ error: 'Provide wallet or email query param' }, { status: 400 })
  }

  try {
    await connectDB()
    const query = wallet
      ? { walletAddresses: wallet }
      : { notificationEmail: email }

    const profile = await UserProfile.findOne(query).lean()
    return NextResponse.json(profile ?? {})
  } catch (err) {
    console.error('[api/shipping GET]', err)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: {
    wallet?: string
    email?: string
    shipping?: {
      name?: string
      line1?: string
      line2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { wallet, email, shipping } = body

  if (!wallet && !email) {
    return NextResponse.json({ error: 'Provide wallet or email' }, { status: 400 })
  }

  try {
    await connectDB()

    // Build the $set payload
    const $set: Record<string, unknown> = {}
    if (email)    $set['notificationEmail'] = email.toLowerCase().trim()
    if (shipping) $set['shipping']          = shipping

    // Build $addToSet to register wallet address without duplicates
    const $addToSet: Record<string, unknown> = {}
    if (wallet) $addToSet['walletAddresses'] = wallet.toLowerCase().trim()

    // Find existing profile — try wallet first, then email
    const filter = wallet
      ? { walletAddresses: wallet.toLowerCase().trim() }
      : { notificationEmail: email!.toLowerCase().trim() }

    const profile = await UserProfile.findOneAndUpdate(
      filter,
      {
        ...($set && Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($addToSet).length ? { $addToSet } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    return NextResponse.json({ ok: true, id: profile._id })
  } catch (err) {
    console.error('[api/shipping POST]', err)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}

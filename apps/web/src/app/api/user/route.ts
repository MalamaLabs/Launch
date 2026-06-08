/**
 * /api/user — thin proxy to the backend `/users/me`.
 *
 * Auth is phased: the email-session cookie is still validated here on the FE
 * (httpOnly, same-origin) and the resolved identity is forwarded to the backend,
 * which owns the user account record in Mongo. No database access in the FE.
 *
 *   GET   — resolve the current account (session email → ?evmAddress → ?cardanoAddress)
 *   POST  — link an EVM/Cardano address or email to the account
 *           (POST, not PATCH — the Apache proxy in front of the API blocks PATCH/PUT)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { parseEmailSessionToken } from '@/lib/email-session'

const API_BASE = (
  process.env.NEXT_PUBLIC_DAGWELLDEV_API_BASE?.trim() || 'https://api.dagwelldev.com'
).replace(/\/$/, '')

async function getSessionEmail(): Promise<string | null> {
  const jar = await cookies()
  const raw = jar.get('malama_email_session')?.value
  if (!raw) return null
  return parseEmailSessionToken(raw)?.email?.toLowerCase() ?? null
}

function buildQuery(email: string | null, evm?: string | null, cardano?: string | null): string {
  const qs = new URLSearchParams()
  if (email)   qs.set('email', email)
  if (evm)     qs.set('evmAddress', evm)
  if (cardano) qs.set('cardanoAddress', cardano)
  return qs.toString()
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const email   = await getSessionEmail()
  const evm     = req.nextUrl.searchParams.get('evmAddress')?.toLowerCase() ?? null
  const cardano = req.nextUrl.searchParams.get('cardanoAddress')?.toLowerCase() ?? null

  if (!email && !evm && !cardano) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const res = await fetch(`${API_BASE}/users/me?${buildQuery(email, evm, cardano)}`, {
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const email        = await getSessionEmail()
  const evmParam     = req.nextUrl.searchParams.get('evmAddress')?.toLowerCase() ?? null
  const cardanoParam = req.nextUrl.searchParams.get('cardanoAddress')?.toLowerCase() ?? null

  if (!email && !evmParam && !cardanoParam) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is allowed */ }

  // POST (not PATCH) — the Apache proxy in front of the backend blocks PATCH/PUT.
  const res = await fetch(`${API_BASE}/users/me?${buildQuery(email, evmParam, cardanoParam)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

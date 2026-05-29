/**
 * KOL (Key Opinion Leader) / Partner referral registry — MongoDB-backed.
 */

import { connectDB } from '@/lib/db'
import { KOLPartnerModel, KOLCommissionModel } from '@/lib/models/KOLPartner'

// ── Types (re-exported for callers) ─────────────────────────────────────────

export type KOLPartner = {
  id:             string
  walletAddress:  string
  email?:         string
  displayName:    string
  bio?:           string
  twitterHandle?: string
  commissionBps:  number
  approved:       boolean
  createdAt:      number
  updatedAt:      number
}

export type ReferralCommission = {
  id:               string
  kolId:            string
  claimId:          string
  hexId:            string
  buyerEmail:       string
  chain:            'base' | 'cardano'
  saleAmountUsd:    number
  commissionUsd:    number
  commissionBps:    number
  status:           'pending' | 'paid' | 'cancelled'
  txHash?:          string
  stripeSessionId?: string
  createdAt:        number
  paidAt?:          number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function docToPartner(doc: InstanceType<typeof KOLPartnerModel>): KOLPartner {
  return {
    id:            doc.id,
    walletAddress: doc.walletAddress,
    email:         doc.email,
    displayName:   doc.displayName,
    bio:           doc.bio,
    twitterHandle: doc.twitterHandle,
    commissionBps: doc.commissionBps,
    approved:      doc.approved,
    createdAt:     (doc.createdAt as Date).getTime(),
    updatedAt:     (doc.updatedAt as Date).getTime(),
  }
}

function docToCommission(doc: InstanceType<typeof KOLCommissionModel>): ReferralCommission {
  return {
    id:              (doc._id as object).toString(),
    kolId:           doc.kolId,
    claimId:         doc.claimId,
    hexId:           doc.hexId,
    buyerEmail:      doc.buyerEmail,
    chain:           doc.chain,
    saleAmountUsd:   doc.saleAmountUsd,
    commissionUsd:   doc.commissionUsd,
    commissionBps:   doc.commissionBps,
    status:          doc.status,
    txHash:          doc.txHash,
    stripeSessionId: doc.stripeSessionId,
    createdAt:       (doc.createdAt as Date).getTime(),
    paidAt:          doc.paidAt ? (doc.paidAt as Date).getTime() : undefined,
  }
}

// ── Partner CRUD ─────────────────────────────────────────────────────────────

export async function registerKOL(
  input: Omit<KOLPartner, 'createdAt' | 'updatedAt'>
): Promise<KOLPartner> {
  await connectDB()
  const id = input.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const doc = await KOLPartnerModel.create({
    ...input,
    id,
    commissionBps: input.commissionBps ?? 1000,
    approved: input.approved ?? false,
  })
  return docToPartner(doc)
}

export async function getKOL(id: string): Promise<KOLPartner | null> {
  await connectDB()
  const doc = await KOLPartnerModel.findOne({ id: id.toLowerCase() })
  return doc ? docToPartner(doc) : null
}

export async function getKOLByWallet(address: string): Promise<KOLPartner | null> {
  await connectDB()
  const doc = await KOLPartnerModel.findOne({ walletAddress: address.toLowerCase() })
  return doc ? docToPartner(doc) : null
}

export async function updateKOL(
  id: string,
  patch: Partial<Omit<KOLPartner, 'id' | 'createdAt'>>
): Promise<KOLPartner | null> {
  await connectDB()
  const doc = await KOLPartnerModel.findOneAndUpdate(
    { id: id.toLowerCase() },
    { $set: patch },
    { new: true },
  )
  return doc ? docToPartner(doc) : null
}

export async function listKOLs(): Promise<KOLPartner[]> {
  await connectDB()
  const docs = await KOLPartnerModel.find().sort({ createdAt: -1 })
  return docs.map(docToPartner)
}

// ── Commissions ──────────────────────────────────────────────────────────────

export async function issueKOLCommission(input: {
  kolId:           string
  claimId:         string
  hexId:           string
  buyerEmail:      string
  chain:           'base' | 'cardano'
  saleAmountUsd:   number
  stripeSessionId?: string
}): Promise<ReferralCommission | null> {
  await connectDB()

  const partner = await getKOL(input.kolId)
  if (!partner) {
    console.warn(`[kol] Commission skipped — unknown KOL: ${input.kolId}`)
    return null
  }
  if (!partner.approved) {
    console.warn(`[kol] Commission skipped — KOL not approved: ${input.kolId}`)
    return null
  }

  const commissionBps = partner.commissionBps
  const commissionUsd = Math.round((input.saleAmountUsd * commissionBps) / 10_000 * 100) / 100

  const doc = await KOLCommissionModel.create({
    kolId:           input.kolId,
    claimId:         input.claimId,
    hexId:           input.hexId,
    buyerEmail:      input.buyerEmail,
    chain:           input.chain,
    saleAmountUsd:   input.saleAmountUsd,
    commissionUsd,
    commissionBps,
    status:          'pending',
    stripeSessionId: input.stripeSessionId,
  })

  console.log(`[kol] Commission issued ${doc._id}: $${commissionUsd} to ${input.kolId} (${input.hexId})`)
  return docToCommission(doc)
}

export async function getKOLCommissions(kolId: string): Promise<ReferralCommission[]> {
  await connectDB()
  const docs = await KOLCommissionModel.find({ kolId }).sort({ createdAt: -1 })
  return docs.map(docToCommission)
}

export async function listAllCommissions(): Promise<ReferralCommission[]> {
  await connectDB()
  const docs = await KOLCommissionModel.find().sort({ createdAt: -1 })
  return docs.map(docToCommission)
}

export async function markCommissionPaid(id: string, txHash: string): Promise<ReferralCommission | null> {
  await connectDB()
  const doc = await KOLCommissionModel.findByIdAndUpdate(
    id,
    { $set: { status: 'paid', txHash, paidAt: new Date() } },
    { new: true },
  )
  return doc ? docToCommission(doc) : null
}

export async function cancelCommission(id: string): Promise<ReferralCommission | null> {
  await connectDB()
  const doc = await KOLCommissionModel.findByIdAndUpdate(
    id,
    { $set: { status: 'cancelled' } },
    { new: true },
  )
  return doc ? docToCommission(doc) : null
}

// ── Click tracking ────────────────────────────────────────────────────────────
// Stored as a field on the KOLPartner document rather than a separate key.

export async function trackKOLClick(kolId: string): Promise<number> {
  await connectDB()
  const doc = await KOLPartnerModel.findOneAndUpdate(
    { id: kolId.toLowerCase() },
    { $inc: { clickCount: 1 } },
    { new: true },
  )
  return (doc as unknown as { clickCount?: number })?.clickCount ?? 0
}

export async function getKOLClickCount(kolId: string): Promise<number> {
  await connectDB()
  const doc = await KOLPartnerModel.findOne({ id: kolId.toLowerCase() }).select('clickCount').lean()
  return (doc as unknown as { clickCount?: number } | null)?.clickCount ?? 0
}

export async function getKOLStats(kolId: string) {
  const [partner, commissions, clicks] = await Promise.all([
    getKOL(kolId),
    getKOLCommissions(kolId),
    getKOLClickCount(kolId),
  ])
  if (!partner) return null

  const totalEarned   = commissions.reduce((s, c) => s + c.commissionUsd, 0)
  const pendingEarned = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.commissionUsd, 0)
  const paidEarned    = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commissionUsd, 0)

  return { partner, clicks, conversions: commissions.length, totalEarned, pendingEarned, paidEarned, commissions }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function buildReferralUrl(kolId: string, baseUrl?: string): string {
  const base = baseUrl ?? (process.env.NEXT_PUBLIC_APP_URL ?? 'https://launch.malamalabs.com')
  return `${base}?ref=${encodeURIComponent(kolId)}`
}

export function buildVanityUrl(kolId: string, baseUrl?: string): string {
  const base = baseUrl ?? (process.env.NEXT_PUBLIC_APP_URL ?? 'https://launch.malamalabs.com')
  return `${base}/ref/${encodeURIComponent(kolId)}`
}

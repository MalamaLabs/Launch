/**
 * User account — persistent identity record in MongoDB.
 *
 * userId  = sha256(email)          when email is the anchor
 *         = sha256(evmAddress)     for wallet-only users (no email yet)
 *
 * Lookup paths:
 *   by userId       → direct _id query
 *   by email        → index on `email`
 *   by EVM address  → index on `evmAddresses` array field
 *   by Cardano addr → index on `cardanoAddresses` array field
 */

import { createHash } from 'crypto'
import { connectDB } from '@/lib/db'
import { UserAccountModel } from '@/lib/models/UserAccount'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserAccount = {
  userId:           string
  email?:           string
  evmAddresses:     string[]
  cardanoAddresses: string[]
  hexIds:           string[]
  createdAt:        string
  updatedAt:        string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function makeUserId(identifier: string): string {
  return createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex')
}

function docToAccount(doc: InstanceType<typeof UserAccountModel>): UserAccount {
  return {
    userId:           doc.userId,
    email:            doc.email,
    evmAddresses:     doc.evmAddresses,
    cardanoAddresses: doc.cardanoAddresses,
    hexIds:           doc.hexIds,
    createdAt:        (doc.createdAt as Date).toISOString(),
    updatedAt:        (doc.updatedAt as Date).toISOString(),
  }
}

// ── Core ops ──────────────────────────────────────────────────────────────────

export async function getUserById(userId: string): Promise<UserAccount | null> {
  await connectDB()
  const doc = await UserAccountModel.findOne({ userId }).lean()
  if (!doc) return null
  return {
    userId:           doc.userId,
    email:            doc.email,
    evmAddresses:     doc.evmAddresses,
    cardanoAddresses: doc.cardanoAddresses,
    hexIds:           doc.hexIds,
    createdAt:        (doc.createdAt as Date).toISOString(),
    updatedAt:        (doc.updatedAt as Date).toISOString(),
  }
}

export async function getUserByEmail(email: string): Promise<UserAccount | null> {
  await connectDB()
  const doc = await UserAccountModel.findOne({ email: email.toLowerCase().trim() }).lean()
  if (!doc) return null
  return {
    userId:           doc.userId,
    email:            doc.email,
    evmAddresses:     doc.evmAddresses,
    cardanoAddresses: doc.cardanoAddresses,
    hexIds:           doc.hexIds,
    createdAt:        (doc.createdAt as Date).toISOString(),
    updatedAt:        (doc.updatedAt as Date).toISOString(),
  }
}

export async function getUserByEvmAddress(address: string): Promise<UserAccount | null> {
  await connectDB()
  const doc = await UserAccountModel.findOne({ evmAddresses: address.toLowerCase() }).lean()
  if (!doc) return null
  return {
    userId:           doc.userId,
    email:            doc.email,
    evmAddresses:     doc.evmAddresses,
    cardanoAddresses: doc.cardanoAddresses,
    hexIds:           doc.hexIds,
    createdAt:        (doc.createdAt as Date).toISOString(),
    updatedAt:        (doc.updatedAt as Date).toISOString(),
  }
}

export async function getUserByCardanoAddress(address: string): Promise<UserAccount | null> {
  await connectDB()
  const doc = await UserAccountModel.findOne({ cardanoAddresses: address.toLowerCase() }).lean()
  if (!doc) return null
  return {
    userId:           doc.userId,
    email:            doc.email,
    evmAddresses:     doc.evmAddresses,
    cardanoAddresses: doc.cardanoAddresses,
    hexIds:           doc.hexIds,
    createdAt:        (doc.createdAt as Date).toISOString(),
    updatedAt:        (doc.updatedAt as Date).toISOString(),
  }
}

/**
 * Create or update a user account.
 * Finds the existing record by email, EVM address, or Cardano address (in that
 * priority order) and merges any new identifiers and hexIds into it.
 */
export async function upsertUserAccount(opts: {
  email?:          string
  evmAddress?:     string
  cardanoAddress?: string
  hexId?:          string
}): Promise<UserAccount> {
  await connectDB()

  const email         = opts.email?.toLowerCase().trim()
  const evmAddress    = opts.evmAddress?.toLowerCase()
  const cardanoAddress = opts.cardanoAddress?.toLowerCase()
  const { hexId }     = opts

  const anchor = email ?? evmAddress ?? cardanoAddress
  if (!anchor) throw new Error('upsertUserAccount: at least one identifier required')

  // Find existing record by any of the provided identifiers
  const orClauses: object[] = []
  if (email)         orClauses.push({ email })
  if (evmAddress)    orClauses.push({ evmAddresses: evmAddress })
  if (cardanoAddress) orClauses.push({ cardanoAddresses: cardanoAddress })

  const existing = await UserAccountModel.findOne({ $or: orClauses })

  if (existing) {
    // Merge new values in — MongoDB $addToSet keeps arrays deduplicated
    const update: Record<string, unknown> = {}
    if (email && existing.email !== email)             update['email'] = email
    if (evmAddress)    update['$addToSet'] = { ...(update['$addToSet'] as object ?? {}), evmAddresses: evmAddress }
    if (cardanoAddress) update['$addToSet'] = { ...(update['$addToSet'] as object ?? {}), cardanoAddresses: cardanoAddress }
    if (hexId)         update['$addToSet'] = { ...(update['$addToSet'] as object ?? {}), hexIds: hexId }

    const updated = await UserAccountModel.findByIdAndUpdate(
      existing._id,
      update,
      { new: true, runValidators: true },
    )
    return docToAccount(updated!)
  }

  // Create new account
  const userId = makeUserId(anchor)
  const created = await UserAccountModel.create({
    userId,
    email,
    evmAddresses:     evmAddress    ? [evmAddress]    : [],
    cardanoAddresses: cardanoAddress ? [cardanoAddress] : [],
    hexIds:           hexId          ? [hexId]          : [],
  })
  return docToAccount(created)
}

/**
 * Append a hex to an existing account's owned inventory.
 * No-op if the account doesn't exist or already has the hex.
 */
export async function addHexToAccount(userId: string, hexId: string): Promise<void> {
  await connectDB()
  await UserAccountModel.updateOne({ userId }, { $addToSet: { hexIds: hexId } })
}

/**
 * Link a wallet address to an existing email-anchored account.
 */
export async function linkWalletToAccount(
  userId: string,
  opts: { evmAddress?: string; cardanoAddress?: string },
): Promise<UserAccount | null> {
  await connectDB()
  const update: Record<string, unknown> = {}
  if (opts.evmAddress)    update['$addToSet'] = { evmAddresses: opts.evmAddress.toLowerCase() }
  if (opts.cardanoAddress) {
    update['$addToSet'] = {
      ...(update['$addToSet'] as object ?? {}),
      cardanoAddresses: opts.cardanoAddress.toLowerCase(),
    }
  }
  if (!Object.keys(update).length) return getUserById(userId)
  const doc = await UserAccountModel.findOneAndUpdate({ userId }, update, { new: true })
  if (!doc) return null
  return docToAccount(doc)
}

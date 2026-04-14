/**
 * Card checkout custody: Magic embedded wallet (default) or legacy server-generated key.
 */
export type CardCustodyMode = 'magic' | 'server'

export function getCardCustodyMode(): CardCustodyMode {
  const v = process.env.MALAMA_CARD_CUSTODY?.trim().toLowerCase()
  if (v === 'server') return 'server'
  return 'magic'
}

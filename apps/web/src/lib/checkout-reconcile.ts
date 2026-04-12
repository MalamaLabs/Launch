import Stripe from 'stripe'
import { fulfillCardPurchase } from '@/lib/fulfill-card-purchase'
import { getStripeSecretKey } from '@/lib/stripe-server'

/**
 * Idempotently runs card fulfillment from Stripe Checkout metadata (paid sessions only).
 * Safe to call from polling — fulfillCardPurchase dedupes per session.
 */
export async function reconcilePaidCheckoutSession(sessionId: string): Promise<void> {
  const secret = getStripeSecretKey()
  if (!secret) return

  const stripe = new Stripe(secret)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return
  }

  if (session.payment_status !== 'paid') return

  const hexId = session.metadata?.hexId
  const email = session.metadata?.email
  const transferToken = session.metadata?.transferToken
  if (!hexId || !email || !transferToken) return

  await fulfillCardPurchase({
    stripeSessionId: sessionId,
    hexId,
    email,
    transferToken,
  })
}

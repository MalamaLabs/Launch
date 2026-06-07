'use client'

/**
 * MagicProvider — wraps the app with a Magic.link Email OTP context.
 *
 * Usage:
 *   const { magic } = useMagic()
 *   await magic.auth.loginWithEmailOTP({ email })
 *   const { publicAddress } = await magic.user.getInfo()
 *
 * This gives Stripe-lane buyers a custodial EVM wallet without MetaMask.
 * Requires NEXT_PUBLIC_MAGIC_API_KEY in the environment.
 */

import { Magic } from 'magic-sdk'
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { BASE_CHAIN } from '@/lib/base-chain'

type MagicContextType = { magic: InstanceType<typeof Magic> | null }

const MagicContext = createContext<MagicContextType>({ magic: null })

export function useMagic() {
  return useContext(MagicContext)
}

// Active Base chain (8453 mainnet / 84532 sepolia), driven by
// NEXT_PUBLIC_BASE_NETWORK. Single source of truth shared with the mint flow so
// the Magic custodial wallet can never end up on a different chain than the mint.
const CHAIN_ID = BASE_CHAIN.idDecimal

type Props = {
  children: ReactNode
  publishableKey?: string
  rpcUrl?: string
}

export function MagicProvider({ children, publishableKey, rpcUrl }: Props) {
  const [magic, setMagic] = useState<InstanceType<typeof Magic> | null>(null)

  useEffect(() => {
    const key =
      publishableKey?.trim() ||
      process.env.NEXT_PUBLIC_MAGIC_API_KEY?.trim()
    const rpc =
      rpcUrl?.trim() ||
      BASE_CHAIN.rpcUrls[0]

    // Magic is optional — if no API key is configured the Stripe lane
    // falls back to bank-wallet custody (same as before).
    if (!key) return

    const instance = new Magic(key, {
      network: {
        rpcUrl: rpc,
        chainId: CHAIN_ID,
      },
    })
    setMagic(instance)
  }, [publishableKey, rpcUrl])

  const value = useMemo(() => ({ magic }), [magic])
  return (
    <MagicContext.Provider value={value}>{children}</MagicContext.Provider>
  )
}

'use client'

import { Magic } from 'magic-sdk'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'

type MagicContextType = { magic: InstanceType<typeof Magic> | null }

const MagicContext = createContext<MagicContextType>({ magic: null })

export function useMagic() {
  return useContext(MagicContext)
}

const BASE_SEPOLIA_CHAIN_ID = 84532

type Props = {
  children: ReactNode
  /** Prefer passing from a Server Component so the key is read from apps/web/.env.local at request time. */
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
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim() ||
      process.env.BASE_SEPOLIA_RPC_URL?.trim() ||
      'https://sepolia.base.org'
    if (!key) return

    const instance = new Magic(key, {
      network: {
        rpcUrl: rpc,
        chainId: BASE_SEPOLIA_CHAIN_ID,
      },
    })
    setMagic(instance)
  }, [publishableKey, rpcUrl])

  const value = useMemo(() => ({ magic }), [magic])
  return <MagicContext.Provider value={value}>{children}</MagicContext.Provider>
}

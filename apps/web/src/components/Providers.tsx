"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
const baseRpc        = process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL;

const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [injected(), coinbaseWallet({ appName: "Mālama Labs" })],
  transports: {
    [base.id]:        http(baseRpc        || 'https://mainnet.base.org'),
    [baseSepolia.id]: http(baseSepoliaRpc || 'https://base-sepolia-rpc.publicnode.com'),
  },
});

const queryClient = new QueryClient();

// ── Cardano / Mesh ─────────────────────────────────────────────────────────
// Lazy-load @meshsdk/react via useEffect so the WASM/libsodium chain is never
// part of the initial server render.  next/dynamic with ssr:false is NOT used
// here because a failed dynamic import propagates as an unhandled error that
// crashes the React tree.  With useEffect + import() a rejection is caught
// explicitly and the app continues to render without Cardano support.
//
// Turbopack build support:
//   1. scripts/patch-libsodium.js creates a bridge file before each build so
//      Turbopack can resolve the cross-package `./libsodium-sumo.mjs` import
//      inside libsodium-wrappers-sumo's ESM build.
//   2. turbopack.resolveAlias in next.config.js uses module-specifier values
//      (NOT absolute paths — Turbopack treats "/" as a server-relative URL).
function CardanoProvider({ children }: { children: React.ReactNode }) {
  const [MeshProvider, setMeshProvider] =
    useState<React.ComponentType<{ children: React.ReactNode }> | null>(null)
  const [meshError, setMeshError] = useState<string | null>(null)

  useEffect(() => {
    import("@meshsdk/react")
      .then((m) => {
        if (!m.MeshProvider) {
          const msg = `@meshsdk/react loaded but MeshProvider is ${typeof m.MeshProvider}. Keys: ${Object.keys(m).join(', ')}`
          console.error('[CardanoProvider]', msg)
          setMeshError(msg)
          return
        }
        setMeshProvider(
          () => m.MeshProvider as React.ComponentType<{ children: React.ReactNode }>
        )
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[CardanoProvider] Failed to load @meshsdk/react:', err)
        setMeshError(msg)
      })
  }, [])

  // Import failed — render children without Cardano provider so the rest of
  // the app (EVM / Stripe lanes) still works.  Cardano wallet buttons will
  // be unavailable but the page won't be stuck on the spinner forever.
  if (meshError) {
    return <>{children}</>
  }

  // Still loading
  if (!MeshProvider) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center space-y-6 bg-malama-bg">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-malama-accent border-t-transparent shadow-[0_0_30px_rgba(196,240,97,0.2)]" />
        <div className="text-center">
          <p className="animate-pulse font-black uppercase tracking-[0.3em] text-malama-accent text-xs">
            Initializing Bridge
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-malama-ink-faint">
            Hydrating Cardano WASM Context
          </p>
        </div>
      </div>
    )
  }

  return <MeshProvider>{children}</MeshProvider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CardanoProvider>{children}</CardanoProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

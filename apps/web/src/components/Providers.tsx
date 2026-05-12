"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import dynamic from "next/dynamic";

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
// Use next/dynamic with ssr:false — same pattern as dagwelldev-frontend's
// confirmed-working MeshProvider.tsx.  This creates a proper async chunk
// boundary so @meshsdk/react (and the @cardano-sdk/core chain) is never
// evaluated during SSR or initial server render.
//
// The @cardano-sdk/core CJS alias in next.config.js turbopack.resolveAlias
// fixes the "Cannot read properties of undefined (reading 'RequireAllOf')"
// circular-dep error at module evaluation time.
const MeshProviderDynamic = dynamic(
  () => import("@meshsdk/react").then((m) => m.MeshProvider),
  {
    ssr: false,
    loading: () => (
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
    ),
  }
)

function CardanoProvider({ children }: { children: React.ReactNode }) {
  return <MeshProviderDynamic>{children}</MeshProviderDynamic>
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

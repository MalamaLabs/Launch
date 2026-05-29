"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
import dynamic from "next/dynamic";
import { MagicProvider } from "@/components/magic/MagicProvider";

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
    // Non-blocking: render a slim top-bar while WASM loads.
    // The page is fully usable during this time — wallet connect buttons
    // just won't fire until MeshProvider mounts.
    loading: () => (
      <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 overflow-hidden bg-gray-900">
        <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-malama-accent/60" />
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
        <MagicProvider>
          <CardanoProvider>{children}</CardanoProvider>
        </MagicProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

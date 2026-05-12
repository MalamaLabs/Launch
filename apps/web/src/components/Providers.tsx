"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

// Use a reliable RPC for the publicClient transport so waitForTransactionReceipt /
// estimateContractGas / getTransactionCount hit the correct chain.
// MetaMask uses ITS OWN configured RPC for eth_sendTransaction — these URLs
// only control our read calls (polling for receipts, etc).
// IMPORTANT: env var must point to BASE Sepolia, not ETH Sepolia — wrong chain
// = result:null on every eth_getTransactionByHash = receipt never resolves.
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
// ssr:false keeps libsodium / WASM out of the server bundler entirely.
// This is what allows `next dev --turbopack` to work alongside the webpack
// config — Turbopack never touches the WASM chunks.
// The loading spinner is shown while the dynamic import resolves on the client.
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
  },
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MeshProviderDynamic>{children}</MeshProviderDynamic>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

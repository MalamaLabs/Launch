"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";
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

// ── Wallet / auth providers ─────────────────────────────────────────────────
// Minting on Launch is Base-only (MetaMask / Magic / Stripe). The Cardano
// CIP-68 ref token is still minted server-side as a verification mirror, but
// the buyer never signs a Cardano tx — so no Mesh/Cardano wallet provider is
// loaded in the browser anymore.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MagicProvider>{children}</MagicProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

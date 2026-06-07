/**
 * Single source of truth for which Base network the buyer mint targets.
 *
 * Driven by NEXT_PUBLIC_BASE_NETWORK (the same signal MagicProvider uses and the
 * mirror of the backend's BASE_NETWORK). Every place that switches or adds the
 * wallet's chain reads from here, so we can't ship a half-Sepolia / half-mainnet
 * build — set NEXT_PUBLIC_BASE_NETWORK=mainnet and the whole buyer flow follows.
 *
 *   wallet_switchEthereumChain / wallet_addEthereumChain expect the chainId as a
 *   0x-prefixed hex string: 8453 → 0x2105 (mainnet), 84532 → 0x14a34 (sepolia).
 */

export const BASE_IS_MAINNET = process.env.NEXT_PUBLIC_BASE_NETWORK === 'mainnet'

export const BASE_CHAIN = BASE_IS_MAINNET
  ? {
      idDecimal: 8453,
      idHex: '0x2105',
      name: 'Base',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    }
  : {
      idDecimal: 84532,
      idHex: '0x14a34',
      name: 'Base Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: [process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'],
      blockExplorerUrls: ['https://sepolia.basescan.org'],
    }

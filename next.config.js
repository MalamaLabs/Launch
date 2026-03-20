/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      'mapbox-gl': 'mapbox-gl',
    },
  },
  allowedDevOrigins: ['192.168.1.126'],
  serverExternalPackages: [
    '@meshsdk/react',
    '@meshsdk/core',
    '@meshsdk/core-cst',
    '@meshsdk/wallet',
    '@cardano-sdk/crypto',
    'libsodium-wrappers-sumo',
    'libsodium-wrappers',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

module.exports = nextConfig;

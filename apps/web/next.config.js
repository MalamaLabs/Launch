const path = require('path')
const fs = require('fs')

/**
 * Next.js only auto-loads `.env*` from `apps/web/`. Many monorepo setups keep secrets in the repo root.
 * Merge root `.env.local` / `.env` into process.env when a key is still unset (apps/web wins if both define it).
 */
function mergeRootEnv() {
  const repoRoot = path.join(__dirname, '..', '..')
  for (const name of ['.env.local', '.env']) {
    const full = path.join(repoRoot, name)
    if (!fs.existsSync(full)) continue
    const content = fs.readFileSync(full, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!key) continue
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val
      }
    }
  }
}

mergeRootEnv()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Mapbox GL JS requires 'unsafe-eval' (uses new Function() for GLSL shader
  // compilation). Scoped tightly to /explorer only — all other routes unaffected.
  async headers() {
    return [
      {
        source: '/explorer/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' blob: https://api.mapbox.com",
              "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com",
              "img-src 'self' data: blob: https://*.mapbox.com",
              "worker-src blob:",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
            ].join('; '),
          },
        ],
      },
    ]
  },

  allowedDevOrigins: ['192.168.1.126', 'dev.dagwelldev.com'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN:                        process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_APP_URL:                             process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:              process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_MAGIC_API_KEY:                       process.env.NEXT_PUBLIC_MAGIC_API_KEY,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL:                process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
    NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_SEPOLIA:   process.env.GENESIS_VALIDATOR_ADDRESS_SEPOLIA,
    NEXT_PUBLIC_GENESIS_VALIDATOR_ADDRESS_MAINNET:   process.env.GENESIS_VALIDATOR_ADDRESS_MAINNET,
    NEXT_PUBLIC_DISCORD_INVITE:                      process.env.NEXT_PUBLIC_DISCORD_INVITE,
  },
}

module.exports = nextConfig

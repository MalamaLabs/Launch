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

const rootNm = path.resolve(__dirname, '../../node_modules')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@meshsdk/core', '@sidan-lab/sidan-csl-rs-nodejs', '@magic-sdk/admin'],
  reactStrictMode: true,

  // ── Turbopack ─────────────────────────────────────────────────────────────
  // turbopack: {} is required by Next.js 16 to acknowledge that a webpack hook
  // exists alongside Turbopack.  No resolveAlias or transpilePackages needed —
  // adding transpilePackages for the mesh/libsodium chain causes Turbopack to
  // trace into package internals and trip over the cross-package relative import
  // inside libsodium-wrappers-sumo's ESM build.  Without transpilePackages,
  // Turbopack uses each package's declared exports entry and doesn't dig deeper.
  turbopack: {},

  allowedDevOrigins: ['192.168.1.126', 'dev.dagwelldev.com'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN:          process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_APP_URL:               process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_MAGIC_API_KEY:         process.env.NEXT_PUBLIC_MAGIC_API_KEY,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL:  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  },

  // ── webpack (used for `next dev --webpack` only) ───────────────────────────
  // Ghost hook required: Next.js 16 throws "Turbopack does not support custom
  // webpack config" unless turbopack:{} is also present.  The aliases below are
  // only active when running with --webpack (local dev).  They dedupe libsodium
  // to a single ESM copy so the nested UMD v0.7.10 inside @meshsdk/core doesn't
  // shadow the root v0.7.16 and break wallet signing under strict-mode chunks.
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
      layers: true,
    }
    config.output = {
      ...config.output,
      environment: {
        ...config.output.environment,
        asyncFunction: true,
        dynamicImport: true,
        module: true,
      },
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-wrappers-sumo$': path.join(rootNm, 'libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs'),
      'libsodium-sumo$':          path.join(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
      './libsodium-sumo.mjs':     path.join(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/lib/stubs/async-storage-stub.js'),
    }
    return config
  },
}

module.exports = nextConfig

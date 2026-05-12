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
  // @meshsdk/react and @meshsdk/core contain WASM and Node-specific paths;
  // keep them out of the server bundle so Next.js loads them via native
  // require() on the server side.  The client bundle is unaffected —
  // Providers.tsx lazy-loads @meshsdk/react via useEffect so it only ever
  // runs in the browser.
  serverExternalPackages: [
    '@meshsdk/core',
    '@meshsdk/react',
    '@sidan-lab/sidan-csl-rs-nodejs',
    '@magic-sdk/admin',
  ],

  reactStrictMode: true,

  // ── Turbopack ──────────────────────────────────────────────────────────────
  //
  // turbopack:{} is required by Next.js 16 when a webpack hook also exists.
  //
  // resolveAlias fixes:
  //
  // 1. @cardano-sdk/core — ESM circular dependency.
  //    The ESM entry (dist/esm/index.js) has an internal circular dep:
  //      index → Serialization → Scripts/NativeScript → Cardano → types/Script
  //    Under Turbopack's strict ESM evaluation, this leaves Cardano.NativeScriptKind
  //    undefined when @meshsdk/core-cst accesses it at module-evaluation time,
  //    throwing "Cannot read properties of undefined (reading 'RequireAllOf')".
  //    The CJS entry (dist/cjs/index.js) evaluates exports.Cardano at line 31
  //    *before* exports.Serialization at line 38, so require() returns a fully-
  //    populated exports object.  Turbopack's CJS-ESM interop exposes
  //    exports.Cardano as a named export, so `import { Cardano } from
  //    "@cardano-sdk/core"` continues to work correctly.
  //
  // 2. @react-native-async-storage/async-storage — MetaMask SDK browser bundle
  //    has a transitive import for the RN async-storage module.  Stub it with a
  //    no-op shim so the import resolves without pulling in React Native.
  //
  // NOTE: resolveAlias values must be module specifiers or relative paths —
  // NOT absolute filesystem paths.  Turbopack treats a leading "/" as a
  // server-relative URL and will throw "server relative imports are not
  // implemented yet".
  turbopack: {
    resolveAlias: {
      // MetaMask SDK's browser bundle has a transitive import for the React Native
      // async-storage module.  Stub it so the import resolves without error.
      '@react-native-async-storage/async-storage': './src/lib/stubs/async-storage-stub.js',
    },
  },

  // ── webpack (ghost hook) ───────────────────────────────────────────────────
  // Next.js 16 requires a webpack hook to be present when turbopack:{} is
  // declared, even though Turbopack is used for both dev and build.
  // The hook is never invoked in normal operation — it exists solely to
  // satisfy the Next.js 16 coexistence guard.
  webpack: (config) => config,

  allowedDevOrigins: ['192.168.1.126', 'dev.dagwelldev.com'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN:           process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_APP_URL:                process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_MAGIC_API_KEY:          process.env.NEXT_PUBLIC_MAGIC_API_KEY,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL:   process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  },
}

module.exports = nextConfig

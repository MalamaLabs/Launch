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

// ── libsodium paths shared by both webpack and Turbopack configs ──────────────
// Must be at module level so both config sections can reference rootNm.
const rootNm = path.resolve(__dirname, '../../node_modules')
const libsodiumWrappersEsm = path.join(rootNm, 'libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs')
const libsodiumSumoEsm     = path.join(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@meshsdk/core', '@sidan-lab/sidan-csl-rs-nodejs', '@magic-sdk/admin'],
  reactStrictMode: true,
  transpilePackages: ['@meshsdk/react', '@meshsdk/core-cst', '@cardano-sdk/crypto', 'libsodium-wrappers-sumo', 'libsodium-sumo'],
  // ── Turbopack config ──────────────────────────────────────────────────────
  // `turbopack: {}` acknowledges Turbopack so Next.js 16 doesn't throw its
  // "Turbopack does not support custom webpack config" guard.
  //
  // `resolveAlias` dedupes libsodium to the root ESM builds for the BROWSER
  // bundle (same role as the webpack resolve.alias below).
  //
  // NOTE: Turbopack's resolveAlias does NOT support relative-path keys for
  // imports originating from inside node_modules (unlike webpack's global
  // resolve.alias). The cross-package `import "./libsodium-sumo.mjs"` inside
  // libsodium-wrappers.mjs is fixed instead by scripts/patch-libsodium.js,
  // which creates a re-export bridge file at the missing path before each
  // turbopack build. See the "build" script in package.json.
  turbopack: {
    // resolveAlias values must be MODULE SPECIFIERS, not absolute filesystem paths.
    // Turbopack treats a leading "/" as a server-relative URL — passing path.join()
    // absolute paths triggers "server relative imports are not implemented yet".
    //
    // These specifiers point to the same root ESM builds as the webpack alias below,
    // but use the package-name/subpath form that Turbopack can resolve via node_modules.
    //
    // The cross-package "./libsodium-sumo.mjs" relative import inside
    // libsodium-wrappers.mjs is handled separately by scripts/patch-libsodium.js
    // (creates a bridge file at the expected path before each turbopack build).
    resolveAlias: {
      'libsodium-wrappers-sumo': 'libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs',
      'libsodium-sumo':          'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
    },
  },
  allowedDevOrigins: ['192.168.1.126','dev.dagwelldev.com'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
    ],
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_MAGIC_API_KEY: process.env.NEXT_PUBLIC_MAGIC_API_KEY,
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  },
  webpack: (config) => {
    // Mesh SDK / libsodium / WASM use async/await + top-level await; tell webpack the client supports them
    // (avoids noisy "target environment does not appear to support async/await" warnings).
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
    // ── Dedupe libsodium to a single copy ─────────────────────────────────────
    // npm leaves a NESTED libsodium-wrappers-sumo at
    //   node_modules/@meshsdk/core/node_modules/libsodium-wrappers-sumo (v0.7.10)
    // alongside the top-level v0.7.16. The nested 0.7.10 ships only an ES5 UMD
    // CJS file that starts with `!function(e){...}(this)`. Under webpack 5's
    // strict-mode chunks `this === undefined`, so the very first reference
    // `e.sodium.onload` throws "Cannot read properties of undefined (reading
    // 'sodium')" — that's the error the user sees AFTER the wallet pops, when
    // Mesh's transitive @cardano-sdk/crypto require()s the broken nested copy.
    //
    // Forcing the bare specifier (with $ = exact-match) to the root v0.7.16
    // ESM build dedupes everything: one libsodium instance, one ready promise,
    // no UMD `this` issue. Same for libsodium-sumo so we don't accidentally
    // load two WASM modules.
    // rootNm / libsodiumWrappersEsm / libsodiumSumoEsm are defined at module level
    // (above nextConfig) so the Turbopack resolveAlias section can share the same paths.
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-wrappers-sumo$': libsodiumWrappersEsm,
      'libsodium-sumo$':          libsodiumSumoEsm,
      // Relative-path alias for the `import './libsodium-sumo.mjs'` line
      // inside libsodium-wrappers.mjs (cross-package relative import).
      './libsodium-sumo.mjs':     libsodiumSumoEsm,
      // MetaMask SDK references React Native async-storage in browser bundle; not needed on web.
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/lib/stubs/async-storage-stub.js'),
    };
    return config;
  },
};

module.exports = nextConfig;

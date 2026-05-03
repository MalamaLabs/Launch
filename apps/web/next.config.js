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
  serverExternalPackages: ['@meshsdk/core', '@sidan-lab/sidan-csl-rs-nodejs', '@magic-sdk/admin'],
  reactStrictMode: true,
  transpilePackages: ['@meshsdk/react', '@meshsdk/core-cst', '@cardano-sdk/crypto', 'libsodium-wrappers-sumo', 'libsodium-sumo'],
  turbopack: {
    // NOTE: dev/build scripts MUST pass --webpack so we use the webpack alias
    // block below. Turbopack ignores webpack:(config) and that's where the
    // libsodium dedupe (the .sodium UMD bug fix) lives. Keeping these aliases
    // here only as a safety net if someone runs Turbopack accidentally.
    resolveAlias: {
      'mapbox-gl': 'mapbox-gl',
      'libsodium-wrappers-sumo': '../../node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs',
      'libsodium-sumo': '../../node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
      './libsodium-sumo.mjs': '../../node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs',
      '@react-native-async-storage/async-storage': './src/lib/stubs/async-storage-stub.js',
    },
  },
  allowedDevOrigins: ['192.168.1.126'],
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
    const path = require('path')
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
    const rootNm = path.resolve(__dirname, '../../node_modules')
    config.resolve.alias = {
      ...config.resolve.alias,
      'libsodium-wrappers-sumo$': path.join(rootNm, 'libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs'),
      'libsodium-sumo$':          path.join(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
      // Existing relative-path alias kept as belt-and-suspenders for the
      // `import './libsodium-sumo.mjs'` line inside libsodium-wrappers.mjs.
      './libsodium-sumo.mjs':     path.join(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs'),
      // MetaMask SDK references React Native async-storage in browser bundle; not needed on web.
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/lib/stubs/async-storage-stub.js'),
    };
    return config;
  },
};

module.exports = nextConfig;

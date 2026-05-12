#!/usr/bin/env node
/**
 * patch-libsodium.js
 *
 * Run before `next build --turbopack` (see package.json "build" script).
 *
 * Problem:
 *   libsodium-wrappers-sumo's ESM build at
 *     node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-wrappers.mjs
 *   does `import e from "./libsodium-sumo.mjs"` — a cross-package relative import.
 *   The actual file lives in the *separate* `libsodium-sumo` package, not inside
 *   libsodium-wrappers-sumo's own dist directory.
 *
 *   webpack's resolve.alias supports global relative-path keys (e.g.
 *   { './libsodium-sumo.mjs': absolutePath }) which redirect any such import
 *   regardless of origin.  Turbopack's resolveAlias does NOT — relative keys
 *   only apply to imports from project files, not from within node_modules.
 *
 * Fix:
 *   Create a re-export bridge file at the expected path so Turbopack (and any
 *   other bundler) can resolve it via normal Node.js module resolution:
 *     node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs
 *       → re-exports from libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs
 *
 * This file is idempotent and safe to re-run after `npm install`.
 * Add it to the build script: `node scripts/patch-libsodium.js && next build --turbopack`
 */

'use strict'

const { existsSync, writeFileSync } = require('fs')
const { resolve, relative } = require('path')

// ── Resolve paths (works in both workspace and standalone setups) ──────────
//
// In the Launch monorepo:
//   apps/web/scripts/patch-libsodium.js → __dirname = .../apps/web/scripts
//   monorepo root node_modules           = .../node_modules  (3 levels up)
//
// Fall back to the workspace-local node_modules if the root doesn't have the
// package (non-hoisted install).

function findRootNm() {
  // 1. Monorepo root: apps/web/scripts → ../../.. → repo root
  const repoRoot = resolve(__dirname, '../../..')
  const rootNm = resolve(repoRoot, 'node_modules')
  const wsNm = resolve(__dirname, '../node_modules')

  if (existsSync(resolve(rootNm, 'libsodium-wrappers-sumo'))) return rootNm
  if (existsSync(resolve(wsNm, 'libsodium-wrappers-sumo'))) return wsNm

  console.warn('[patch-libsodium] libsodium-wrappers-sumo not found in expected node_modules paths.')
  console.warn('  Tried:', rootNm)
  console.warn('  Tried:', wsNm)
  return null
}

const rootNm = findRootNm()
if (!rootNm) {
  console.log('[patch-libsodium] Skipping — package not found (safe to ignore if not using Mesh SDK).')
  process.exit(0)
}

const wrappersSumoEsmDir = resolve(rootNm, 'libsodium-wrappers-sumo/dist/modules-sumo-esm')
const bridgeFile         = resolve(wrappersSumoEsmDir, 'libsodium-sumo.mjs')
const sumoEsm            = resolve(rootNm, 'libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs')

// Source file must exist
if (!existsSync(sumoEsm)) {
  console.error('[patch-libsodium] ERROR: libsodium-sumo ESM not found at:', sumoEsm)
  console.error('  Run `npm install` first.')
  process.exit(1)
}

// Relative path from the bridge file's directory to the actual source
// (always "../../../libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs"
//  in a hoisted monorepo, but we compute it to be safe).
const relPath = relative(wrappersSumoEsmDir, sumoEsm).replace(/\\/g, '/')

// Always overwrite — ensures the correct import form is used even if a stale
// bridge exists from a previous build.
//
// Use `import mod from '...'; export default mod;` rather than the re-export
// shorthand `export { default } from '...'`.  The shorthand can silently
// produce `undefined` for WASM modules that don't declare a named `default`
// export in their module record — the direct import form binds the live
// namespace object instead and guarantees libsodium-wrappers.mjs receives a
// non-null value for `e` in `import e from "./libsodium-sumo.mjs"`.
writeFileSync(
  bridgeFile,
  `// Auto-generated bridge — do not edit by hand.\n` +
  `// Created by apps/web/scripts/patch-libsodium.js (run before turbopack builds).\n` +
  `//\n` +
  `// libsodium-wrappers-sumo's ESM build imports "./libsodium-sumo.mjs" from its\n` +
  `// own dist directory, but the actual module lives in the separate libsodium-sumo\n` +
  `// package.  webpack handles this via a global resolve.alias; Turbopack does not\n` +
  `// support relative-path alias keys for imports from within node_modules.\n` +
  `// This bridge file provides the expected binding so both bundlers can find it.\n` +
  `//\n` +
  `// Direct import + re-export (not shorthand) so WASM module namespace is\n` +
  `// correctly bound as the default export even if the module has no explicit\n` +
  `// "export default" declaration.\n` +
  `import libsodiumModule from '${relPath}';\n` +
  `export default libsodiumModule;\n`,
  'utf8'
)

if (existsSync(bridgeFile)) {
  console.log('[patch-libsodium] ✓ Updated bridge file:')
} else {
  console.log('[patch-libsodium] ✓ Created bridge file:')
}
console.log('  ', bridgeFile)
console.log('  → re-exports from', sumoEsm)

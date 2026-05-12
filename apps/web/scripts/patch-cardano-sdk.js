#!/usr/bin/env node
/**
 * patch-cardano-sdk.js
 *
 * Fixes a Turbopack ESM circular-dependency bug in @cardano-sdk/core.
 *
 * ROOT CAUSE
 * ----------
 * @meshsdk/core-cst/dist/index.js (ESM) accesses Cardano.NativeScriptKind at
 * module-evaluation time.  Under Turbopack's strict ESM evaluation, the Cardano
 * namespace is not yet populated because @cardano-sdk/core has an internal
 * circular dependency:
 *
 *   index.js
 *     → export * as Serialization from './Serialization/index.js'
 *       → Scripts/NativeScript/NativeScript.js
 *         → import * as Cardano from '../../../Cardano/index.js'  ← CIRCULAR
 *   index.js
 *     → export * as Cardano from './Cardano/index.js'
 *       → types/Script.js  (defines NativeScriptKind)
 *
 * Because Turbopack evaluates the ESM graph and encounters the circular import
 * before NativeScriptKind is initialised, Cardano.NativeScriptKind is undefined
 * and the access throws:
 *   TypeError: Cannot read properties of undefined (reading 'RequireAllOf')
 *
 * THE FIX
 * -------
 * NativeScript.js only uses Cardano.NativeScriptKind — nothing else from the
 * Cardano namespace.  We replace the broad circular import:
 *
 *   import * as Cardano from '../../../Cardano/index.js';
 *
 * with a direct import of NativeScriptKind from its actual definition file
 * (which has ZERO imports and cannot participate in a circular dep):
 *
 *   import { NativeScriptKind } from '../../../Cardano/types/Script.js';
 *   const Cardano = { NativeScriptKind };  // keeps Cardano.NativeScriptKind.X usages unchanged
 *
 * This is idempotent — re-running after the patch is already applied is safe.
 */

const fs   = require('fs')
const path = require('path')

// Resolve from workspace root so this works from any cwd
const ROOT = path.resolve(__dirname, '../../../..')

function findPkg(pkgPath) {
  // Try workspace root node_modules first, then local node_modules
  const candidates = [
    path.join(ROOT, 'node_modules', pkgPath),
    path.join(ROOT, 'apps', 'web', 'node_modules', pkgPath),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

const targetRel = '@cardano-sdk/core/dist/esm/Serialization/Scripts/NativeScript/NativeScript.js'
const target = findPkg(targetRel)

if (!target) {
  console.log(`[patch-cardano-sdk] ${targetRel} not found — skipping (package not installed yet)`)
  process.exit(0)
}

const MARKER = '// [patched-cardano-sdk-circular]'
const original = `import * as Cardano from '../../../Cardano/index.js';`
const replacement = [
  MARKER,
  `import { NativeScriptKind } from '../../../Cardano/types/Script.js';`,
  `const Cardano = { NativeScriptKind }; // stub: only NativeScriptKind is used in this file`,
].join('\n')

let src = fs.readFileSync(target, 'utf8')

if (src.includes(MARKER)) {
  console.log('[patch-cardano-sdk] already patched — nothing to do')
  process.exit(0)
}

if (!src.includes(original)) {
  console.warn('[patch-cardano-sdk] expected import line not found — @cardano-sdk/core may have changed; skipping')
  process.exit(0)
}

src = src.replace(original, replacement)
fs.writeFileSync(target, src, 'utf8')
console.log(`[patch-cardano-sdk] patched ${target}`)
console.log('  broke circular dep: NativeScript.js → Cardano/index.js → Serialization')
console.log('  now imports NativeScriptKind directly from Cardano/types/Script.js')

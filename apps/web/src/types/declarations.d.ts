/**
 * Ambient module declarations for packages that ship no TypeScript types
 * and have no DefinitelyTyped entry.
 *
 * libsodium-wrappers-sumo — the deduped ESM build aliased in next.config.js
 * so that @meshsdk/core's nested UMD copy is replaced by the root ESM build.
 * The real API shape mirrors libsodium-wrappers; we only need `ready` and
 * the methods called in the Cardano lane (randombytes_buf, etc.) — but a
 * loose `any` declaration is sufficient to satisfy the build.
 */
declare module 'libsodium-wrappers-sumo' {
  const sodium: {
    ready: Promise<void>
    randombytes_buf(length: number): Uint8Array
    crypto_sign_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array; keyType: string }
    [key: string]: any
  }
  export default sodium
}

declare module 'libsodium-sumo' {
  const sodium: {
    ready: Promise<void>
    [key: string]: any
  }
  export default sodium
}

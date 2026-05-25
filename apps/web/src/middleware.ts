// Re-export the password-gate logic from proxy.ts.
// Next.js requires this file to be named "middleware.ts" at the src/ root.
export { proxy as middleware, config } from './proxy'

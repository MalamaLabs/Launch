/**
 * MongoDB connection singleton for Next.js.
 *
 * Set MONGODB_URI in .env.local to override the default local connection.
 * The global cache prevents hot-reload from spawning a new connection on every
 * module evaluation in development.
 */

import mongoose from 'mongoose'

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/malama'

// Extend the Node.js global type so TypeScript doesn't complain about the cache
declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: {
    conn: typeof mongoose | null
    promise: Promise<typeof mongoose> | null
  }
}

if (!global.__mongooseCache) {
  global.__mongooseCache = { conn: null, promise: null }
}

export async function connectDB(): Promise<typeof mongoose> {
  if (global.__mongooseCache.conn) {
    return global.__mongooseCache.conn
  }

  if (!global.__mongooseCache.promise) {
    global.__mongooseCache.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
      })
      .then((m) => {
        console.log('[db] MongoDB connected:', MONGODB_URI)
        return m
      })
      .catch((err) => {
        global.__mongooseCache.promise = null
        throw err
      })
  }

  global.__mongooseCache.conn = await global.__mongooseCache.promise
  return global.__mongooseCache.conn
}

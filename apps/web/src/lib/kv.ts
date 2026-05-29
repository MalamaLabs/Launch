/**
 * In-memory KV shim — kept for any code that still imports it.
 * user-account and kol-registry now use MongoDB directly; this is a
 * lightweight fallback for anything else (e.g. test helpers).
 * Data is NOT persisted across process restarts.
 */

export interface KVClient {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'>
  incr(key: string): Promise<number>
  sadd(key: string, ...members: string[]): Promise<number>
  smembers(key: string): Promise<string[]>
  del(...keys: string[]): Promise<number>
}

const _strings = new Map<string, { value: string; expiresAt?: number }>()
const _sets    = new Map<string, Set<string>>()

export const kv: KVClient = {
  async get<T>(key: string): Promise<T | null> {
    const entry = _strings.get(key)
    if (!entry) return null
    if (entry.expiresAt && Date.now() > entry.expiresAt) { _strings.delete(key); return null }
    return JSON.parse(entry.value) as T
  },
  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'> {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined
    _strings.set(key, { value: JSON.stringify(value), expiresAt })
    return 'OK'
  },
  async incr(key: string): Promise<number> {
    const entry = _strings.get(key)
    let cur = 0
    if (entry) {
      if (entry.expiresAt && Date.now() > entry.expiresAt) { _strings.delete(key) }
      else { try { cur = parseInt(JSON.parse(entry.value), 10) } catch { cur = 0 } }
    }
    const next = cur + 1
    _strings.set(key, { value: JSON.stringify(next) })
    return next
  },
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!_sets.has(key)) _sets.set(key, new Set())
    const s = _sets.get(key)!
    let added = 0
    for (const m of members) { if (!s.has(m)) { s.add(m); added++ } }
    return added
  },
  async smembers(key: string): Promise<string[]> {
    return Array.from(_sets.get(key) ?? [])
  },
  async del(...keys: string[]): Promise<number> {
    let n = 0
    for (const k of keys) {
      if (_strings.delete(k)) n++
      if (_sets.delete(k)) n++
    }
    return n
  },
}

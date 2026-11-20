export function createCache() {
  const store = new Map()
  return {
    get(key) {
      const found = store.get(key)
      if (!found) return undefined
      if (found.expiresAt <= Date.now()) {
        store.delete(key)
        return undefined
      }
      return found.value
    },
    set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    invalidate(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
      }
    }
  }
}

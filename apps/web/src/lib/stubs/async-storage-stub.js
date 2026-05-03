// Browser stub for @react-native-async-storage/async-storage.
//
// MetaMask SDK's browser bundle has a transitive import for the React Native
// async-storage module. We have no React Native runtime, so we provide a
// no-op shim that satisfies the import without dragging in a real RN dep.
// Aliased from `apps/web/next.config.js` (both webpack and turbopack blocks).

const noopStorage = {
  getItem:    async () => null,
  setItem:    async () => undefined,
  removeItem: async () => undefined,
  clear:      async () => undefined,
  getAllKeys: async () => [],
  multiGet:   async (keys) => keys.map((k) => [k, null]),
  multiSet:   async () => undefined,
  multiRemove: async () => undefined,
}

module.exports = noopStorage
module.exports.default = noopStorage

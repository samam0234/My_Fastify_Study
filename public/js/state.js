export function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get() { return state },
    set(partial) {
      state = { ...state, ...partial }
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    }
  }
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function addDaysIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

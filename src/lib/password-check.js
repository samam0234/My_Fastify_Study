import { timingSafeEqual } from 'node:crypto'

export function tokenEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8')
  const b = Buffer.from(String(right ?? ''), 'utf8')
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

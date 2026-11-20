import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { AppError } from '../errors.js'

const N = 16384
const R = 8
const P = 1

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', {
      password: ['8~72자로 입력하세요.']
    })
  }
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(password, salt, 32, { N, r: R, p: P }).toString('base64url')
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || Number(n) !== N || Number(r) !== R || Number(p) !== P || !salt || !hash) return false
  const actual = scryptSync(password, salt, 32, { N, r: R, p: P })
  const expected = Buffer.from(hash, 'base64url')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

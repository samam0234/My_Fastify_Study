import { createHmac } from 'node:crypto'
import { tokenEqual } from './password-check.js'

export function signBody(secret, raw) {
  return createHmac('sha256', secret).update(raw).digest('hex')
}

export function verifySignature(secret, raw, header) {
  if (!secret || header === undefined || raw === undefined || raw === null) return false
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))
  return tokenEqual(signBody(secret, body), String(header).trim())
}

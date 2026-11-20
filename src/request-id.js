import { randomUUID } from 'node:crypto'

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/

export function createRequestId(req) {
  const header = req.headers['x-request-id']
  if (typeof header === 'string' && ID_PATTERN.test(header)) return header
  return randomUUID()
}

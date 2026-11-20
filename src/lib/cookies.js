import { randomUUID } from 'node:crypto'

function baseOptions(config) {
  return { path: '/', sameSite: 'lax', secure: config.cookieSecure }
}

export function setAuthCookies(reply, config, token) {
  const csrf = randomUUID()
  const base = baseOptions(config)
  reply.setCookie('access_token', token, { ...base, httpOnly: true, maxAge: 60 * 60 * 24 * 7 })
  reply.setCookie('csrf_token', csrf, { ...base, httpOnly: false, maxAge: 60 * 60 * 24 * 7 })
  return csrf
}

export function clearAuthCookies(reply, config) {
  const base = baseOptions(config)
  reply.clearCookie('access_token', base)
  reply.clearCookie('csrf_token', base)
}

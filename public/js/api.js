function readCookie(name) {
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const item = part.trim()
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length))
  }
  return ''
}

export async function api(path, { method = 'GET', json, idempotencyKey } = {}) {
  const headers = new Headers({ accept: 'application/json' })
  if (json !== undefined) headers.set('content-type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('csrf_token')
    if (csrf) headers.set('x-csrf-token', csrf)
  }
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey)
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: json === undefined ? undefined : JSON.stringify(json)
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null }
}

import { AppError, validationError } from '../errors.js'

const SORTS = new Set(['createdAt', '-createdAt', '-commentCount'])

function push(fields, key, message) {
  fields[key] ??= []
  fields[key].push(message)
}

export function parseListQuery(query) {
  const fields = {}
  const pageRaw = query.page ?? '1'
  const limitRaw = query.limit ?? '10'
  if (!/^[1-9]\d*$/.test(String(pageRaw))) push(fields, 'page', '1 이상의 정수여야 합니다.')
  if (!/^[1-9]\d*$/.test(String(limitRaw))) push(fields, 'limit', '1 이상의 정수여야 합니다.')
  const sort = query.sort ?? '-createdAt'
  if (!SORTS.has(String(sort))) {
    push(fields, 'sort', 'createdAt, -createdAt, -commentCount 중 하나여야 합니다.')
  }
  const q = query.q === undefined || query.q === '' ? null : String(query.q)
  if (q && q.length > 100) push(fields, 'q', '100자 이하로 입력하세요.')
  if (Object.keys(fields).length > 0) throw validationError(fields)
  let limit = Number(limitRaw)
  if (limit > 50) limit = 50
  const page = Number(pageRaw)
  return { page, limit, sort: String(sort), q, offset: (page - 1) * limit }
}

export function parseId(value, label = 'id') {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
    throw new AppError(400, 'BAD_REQUEST', '주소의 번호 형식이 올바르지 않습니다.', {
      [label]: ['1 이상의 정수여야 합니다.']
    })
  }
  return Number(value)
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char])
}

export function wantsHtml(request) {
  const accept = request.headers.accept
  if (typeof accept !== 'string') return false
  if (accept.includes('application/json')) return false
  return accept.includes('text/html')
}

export function isApiPath(url) {
  const path = url.split('?')[0]
  return path === '/health' || path.startsWith('/api/') || path === '/api-docs' || path.startsWith('/api-docs/')
}

export function renderErrorPage(error) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(error.code)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(error.code)}</h1>
    <p>${escapeHtml(error.message)}</p>
    <p>requestId: ${escapeHtml(error.requestId)}</p>
  </main>
</body>
</html>`
}

export function likeContains(value) {
  return `%${String(value).toLowerCase().replace(/[!%_]/g, (char) => `!${char}`)}%`
}

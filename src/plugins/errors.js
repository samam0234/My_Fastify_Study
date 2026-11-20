import { AppError, errorBody } from '../errors.js'
import { isApiPath, renderErrorPage, wantsHtml } from '../lib/http.js'

function fieldKey(item) {
  if (item.keyword === 'required') return item.params?.missingProperty ?? 'body'
  if (item.keyword === 'additionalProperties') return item.params?.additionalProperty ?? 'body'
  const path = String(item.instancePath ?? '').replace(/^\//, '')
  return path.split('/')[0] || 'body'
}

function fieldMessage(item) {
  if (item.keyword === 'required') return '필수 항목입니다.'
  if (item.keyword === 'minLength') return `${item.params.limit}자 이상 입력하세요.`
  if (item.keyword === 'maxLength') return `${item.params.limit}자 이하로 입력하세요.`
  if (item.keyword === 'minItems') return `${item.params.limit}개 이상이어야 합니다.`
  if (item.keyword === 'maxItems') return `${item.params.limit}개 이하여야 합니다.`
  if (item.keyword === 'minProperties') return '바꿀 항목을 하나 이상 보내세요.'
  if (item.keyword === 'minimum') return `${item.params.limit} 이상이어야 합니다.`
  if (item.keyword === 'maximum') return `${item.params.limit} 이하여야 합니다.`
  if (item.keyword === 'type') return '값의 종류가 올바르지 않습니다.'
  if (item.keyword === 'pattern') return '형식이 올바르지 않습니다.'
  if (item.keyword === 'additionalProperties') return '허용되지 않은 항목입니다.'
  return '입력값을 확인하세요.'
}

export function fieldsFromValidation(validation) {
  const fields = {}
  for (const item of validation ?? []) {
    const key = fieldKey(item)
    fields[key] ??= []
    fields[key].push(fieldMessage(item))
  }
  return fields
}

export function normalizeError(error, request) {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: errorBody(request, error) }
  }
  if (error.validation) {
    const fields = fieldsFromValidation(error.validation)
    if (error.validationContext === 'params') {
      return {
        statusCode: 400,
        body: errorBody(request, { code: 'BAD_REQUEST', message: '주소의 번호 형식이 올바르지 않습니다.', fields })
      }
    }
    return {
      statusCode: 400,
      body: errorBody(request, { code: 'VALIDATION_ERROR', message: '입력값을 확인하세요.', fields })
    }
  }
  if (error.code === 'FST_ERR_CTP_INVALID_JSON' || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    return { statusCode: 400, body: errorBody(request, { code: 'BAD_REQUEST', message: 'JSON 형식이 올바르지 않습니다.' }) }
  }
  if (error.statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error.code === 'FST_REQ_FILE_TOO_LARGE') {
    return { statusCode: 413, body: errorBody(request, { code: 'PAYLOAD_TOO_LARGE', message: '요청 크기가 한도를 넘었습니다.' }) }
  }
  if (error.statusCode === 429) {
    return { statusCode: 429, body: errorBody(request, { code: 'RATE_LIMITED', message: '호출이 너무 많습니다. 잠시 뒤 다시 시도하세요.' }) }
  }
  return { statusCode: 500, body: errorBody(request, { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' }) }
}

function sendError(request, reply, statusCode, body) {
  if (!isApiPath(request.url) && wantsHtml(request)) {
    return reply.code(statusCode).type('text/html; charset=utf-8').send(renderErrorPage(body.error))
  }
  return reply.code(statusCode).send(body)
}

export function installErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error, request)
    if (normalized.statusCode >= 500) request.log.error({ err: error }, '서버 오류')
    else request.log.warn({ code: normalized.body.error.code }, '요청 오류')
    return sendError(request, reply, normalized.statusCode, normalized.body)
  })
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode === 204) return payload
    const current = reply.getHeader('content-type')
    if (typeof current === 'string' && current.startsWith('application/json') && !current.includes('charset')) {
      reply.header('content-type', 'application/json; charset=utf-8')
    }
    return payload
  })
}

export function installNotFound(app) {
  app.setNotFoundHandler((request, reply) => {
    const body = errorBody(request, { code: 'NOT_FOUND', message: '요청한 경로가 없습니다.' })
    return sendError(request, reply, 404, body)
  })
}

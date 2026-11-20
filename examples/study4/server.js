import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

function errorBody(request, code, message) {
  return { error: { code, message, requestId: request.id } }
}

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500
    const code = error.code ?? 'INTERNAL'
    const message = statusCode >= 500 ? '서버 오류가 발생했습니다.' : error.message
    return reply.code(statusCode).send(errorBody(request, code, message))
  })
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(errorBody(request, 'NOT_FOUND', '요청한 경로가 없습니다.'))
  })
  app.get('/items/:id', async (request) => {
    const id = request.params.id
    if (!/^[1-9]\d*$/.test(id)) {
      const error = new Error('번호 형식이 아닙니다')
      error.statusCode = 400
      error.code = 'BAD_REQUEST'
      throw error
    }
    if (id !== '1') {
      const error = new Error('항목이 없습니다')
      error.statusCode = 404
      error.code = 'NOT_FOUND'
      throw error
    }
    return { data: { id: 1, name: '공책' } }
  })
  app.get('/search', async (request) => {
    return { data: { q: request.query.q ?? null, page: request.query.page ?? '1' } }
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3003), host: '127.0.0.1' })
}

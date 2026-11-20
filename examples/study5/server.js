import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const fields = {}
      for (const item of error.validation) {
        const key = item.instancePath?.replace(/^\//, '') || item.params?.missingProperty || 'body'
        fields[key] ??= []
        fields[key].push(item.message)
      }
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: '입력값을 확인하세요.', fields, requestId: request.id } })
    }
    return reply.code(error.statusCode ?? 500).send({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.', requestId: request.id } })
  })
  const saved = new Map()
  const inFlight = new Set()
  app.post('/api/messages', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: 100 } }
      }
    }
  }, async (request, reply) => {
    const key = request.headers['idempotency-key']
    if (key && saved.has(key)) return reply.code(saved.get(key).statusCode).send(saved.get(key).body)
    if (key && inFlight.has(key)) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: '같은 요청을 처리하는 중입니다.', requestId: request.id } })
    }
    if (key) inFlight.add(key)
    const body = { data: { text: request.body.text } }
    if (key) {
      saved.set(key, { statusCode: 201, body })
      inFlight.delete(key)
    }
    return reply.code(201).send(body)
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3004), host: '127.0.0.1' })
}

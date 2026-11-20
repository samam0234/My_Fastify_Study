import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.get('/', async (request, reply) => {
    const name = 'Fastify'
    const html = `<!doctype html><meta charset="utf-8"><title>안녕</title><h1>${name}에 오신 것을 환영합니다</h1><p>이 문장은 템플릿 문자열로 이름을 끼워 넣었습니다.</p>`
    return reply.type('text/html; charset=utf-8').send(html)
  })
  app.get('/api/hello', async () => {
    return { message: '안녕하세요, Fastify' }
  })
  app.get('/api/hello/:name', async (request) => {
    const name = request.params.name
    return { message: `${name}님, 반가워요` }
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' })
}

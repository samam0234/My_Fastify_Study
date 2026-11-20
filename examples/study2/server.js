import Fastify from 'fastify'
import fp from 'fastify-plugin'
import { pathToFileURL } from 'node:url'

export function formatMessage(name) {
  return `${name}님에게 플러그인이 응답합니다`
}

async function clockPlugin(fastify) {
  fastify.decorate('now', () => new Date().toISOString())
}

export const sharedClock = fp(clockPlugin, { name: 'shared-clock' })

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.register(sharedClock)
  app.register(async function messageRoutes(fastify) {
    fastify.get('/message/:name', async (request) => {
      return { text: formatMessage(request.params.name), at: fastify.now() }
    })
  })
  return app
}

export function buildIsolated() {
  const app = Fastify({ logger: false })
  app.register(async function hidden(fastify) {
    fastify.decorate('secretNote', '이 값은 플러그인 안에만 있습니다')
  })
  app.get('/note', async () => ({ shared: app.hasDecorator('secretNote') }))
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '127.0.0.1' })
}

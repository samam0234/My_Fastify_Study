import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { resolveConfig } from './config.js'
import { createRequestId } from './request-id.js'
import { createCache } from './lib/cache.js'
import { createQueue } from './lib/queue.js'
import { createRealtime } from './lib/realtime.js'
import dbPlugin from './plugins/db.js'
import authPlugin, { installCsrf } from './plugins/auth.js'
import { installErrorHandler, installNotFound } from './plugins/errors.js'
import { swaggerPlugin, swaggerUiPlugin } from './plugins/docs.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { postRoutes } from './routes/posts.js'
import { commentRoutes } from './routes/comments.js'
import { pageRoutes } from './routes/pages.js'
import { uploadRoutes } from './routes/uploads.js'
import { paymentRoutes } from './routes/payments.js'
import { mailRoutes } from './routes/mail.js'
import { aiRoutes } from './routes/ai.js'
import { oauthRoutes } from './routes/oauth.js'
import { realtimeRoutes } from './routes/realtime.js'

export { createRequestId }

export async function buildApp(options = {}) {
  const config = resolveConfig(options)
  const app = Fastify({
    logger: config.logger,
    genReqId: createRequestId,
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    ajv: { customOptions: { allErrors: true, coerceTypes: false, removeAdditional: false } }
  })
  app.decorate('config', config)
  installErrorHandler(app)
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = body
    if (!body || body.length === 0) {
      done(null, null)
      return
    }
    try {
      done(null, JSON.parse(body.toString('utf8')))
    } catch (error) {
      error.statusCode = 400
      error.code = 'FST_ERR_CTP_INVALID_JSON'
      done(error)
    }
  })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
    const path = request.url.split('?')[0]
    if (path.startsWith('/api-docs')) return
    reply.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
  })
  await app.register(cookie)
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    exposedHeaders: ['x-request-id', 'location']
  })
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })
  await app.register(rateLimit, { global: false })
  installCsrf(app)
  await app.register(dbPlugin)
  await app.register(authPlugin)
  app.decorate('cache', createCache())
  app.decorate('queue', createQueue(app.log))
  app.decorate('realtime', createRealtime())
  if (config.stage === 'final') await app.register(swaggerPlugin)
  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(postRoutes)
  await app.register(commentRoutes)
  if (config.stage === 'final') {
    await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } })
    await app.register(uploadRoutes)
    await app.register(paymentRoutes)
    await app.register(mailRoutes)
    await app.register(aiRoutes)
    await app.register(oauthRoutes)
    await app.register(realtimeRoutes)
    await app.register(swaggerUiPlugin)
    if (config.enableDebugRoutes) {
      app.get('/__test/boom', { schema: { hide: true } }, async () => {
        throw new Error('secret stack')
      })
    }
  }
  await app.register(pageRoutes)
  installNotFound(app)
  app.addHook('onClose', async () => {
    await app.queue.waitIdle()
  })
  return app
}

export function newIdempotencyKey() {
  return randomUUID()
}

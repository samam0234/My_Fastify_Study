import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'

const publicRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

export async function pageRoutes(app) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: '/',
    setHeaders(reply, filePath) {
      if (filePath.endsWith('.html')) reply.header('cache-control', 'no-cache')
    }
  })
}

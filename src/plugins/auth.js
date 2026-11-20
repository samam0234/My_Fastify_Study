import { randomUUID } from 'node:crypto'
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { AppError } from '../errors.js'
import { tokenEqual } from '../lib/password-check.js'

async function authPlugin(app) {
  await app.register(jwt, {
    secret: app.config.jwtSecret,
    sign: { expiresIn: app.config.jwtExpires }
  })
  app.decorateRequest('authUser', null)
  app.addHook('onRequest', async (request) => {
    if (!request.headers.authorization && request.cookies?.access_token) {
      request.headers.authorization = `Bearer ${request.cookies.access_token}`
    }
    if (!request.headers.authorization) return
    try {
      const payload = await request.jwtVerify()
      if (!payload?.jti || await app.repo.isTokenRevoked(payload.jti)) {
        throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
      }
      request.authUser = {
        id: Number(payload.sub),
        email: payload.email,
        nickname: payload.nickname,
        jti: payload.jti,
        exp: payload.exp
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
    }
  })
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ statusCode: reply.statusCode, userId: request.authUser?.id ?? null }, '요청을 마쳤습니다.')
  })
}

export default fp(authPlugin, { name: 'study-auth' })

export async function requireAuth(request) {
  if (!request.authUser) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
}

export async function signUser(app, user) {
  const jti = randomUUID()
  const accessToken = await app.jwt.sign({
    sub: String(user.id),
    email: user.email,
    nickname: user.nickname,
    jti
  })
  return { accessToken, jti }
}

export function installCsrf(app) {
  const open = new Set(['/api/auth/login', '/api/auth/signup', '/api/payments/webhook'])
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return
    const path = request.url.split('?')[0]
    if (open.has(path)) return
    if (!request.cookies?.access_token) return
    if (!tokenEqual(request.cookies.csrf_token, request.headers['x-csrf-token'])) {
      throw new AppError(403, 'FORBIDDEN', 'CSRF 토큰이 올바르지 않습니다.')
    }
  })
}

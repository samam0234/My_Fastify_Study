import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildApp } from '../src/app.js'

export async function createTestApp(overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fastify-study-'))
  const app = await buildApp({
    skipEnvFile: true,
    nodeEnv: 'test',
    stage: 'final',
    dbClient: 'sqlite',
    sqlitePath: ':memory:',
    jwtSecret: 'test-secret-please-change',
    logger: false,
    cookieSecure: false,
    loginRateMax: 1000,
    cacheTtlMs: 60000,
    uploadDir: path.join(dir, 'uploads'),
    outboxDir: path.join(dir, 'outbox'),
    paymentWebhookSecret: 'whsec-test',
    publicBaseUrl: 'http://127.0.0.1:3000',
    enableDebugRoutes: true,
    corsOrigin: 'http://localhost:5173',
    ...overrides
  })
  app.addHook('onClose', async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return app
}

export async function loginAs(app, user = { email: 'mina@example.com', password: 'password123', nickname: 'mina' }) {
  const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: user })
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: user.password }
  })
  const body = login.json()
  return { signup, login, token: body.data?.accessToken, user: body.data?.user }
}

export function authHeaders(token, extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra }
}

export function cookieHeader(response) {
  const raw = response.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : [raw]
  const pairs = list.filter(Boolean).map((item) => item.split(';')[0])
  const csrf = pairs.find((item) => item.startsWith('csrf_token='))?.slice('csrf_token='.length)
  return { cookie: pairs.join('; '), csrf }
}

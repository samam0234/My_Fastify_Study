import { AppError } from '../errors.js'
import { clearAuthCookies, setAuthCookies } from '../lib/cookies.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { presentUser } from '../lib/present.js'
import { addDaysIso } from '../lib/time.js'
import { requireAuth, signUser } from '../plugins/auth.js'
import { bearer, loginBody, loginResponse, signupBody, userResponse } from '../schemas.js'

function cleanEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function cleanNickname(value) {
  return String(value ?? '').trim()
}

export async function authRoutes(app) {
  app.post('/api/auth/signup', { schema: { tags: ['auth'], body: signupBody, response: { 201: userResponse } } }, async (request, reply) => {
    const email = cleanEmail(request.body.email)
    const nickname = cleanNickname(request.body.nickname)
    if (!nickname) {
      throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { nickname: ['별명을 입력하세요.'] })
    }
    const user = await app.repo.createUser({
      email,
      nickname,
      passwordHash: hashPassword(request.body.password)
    })
    return reply.code(201).send({ data: presentUser(user) })
  })

  app.post('/api/auth/login', {
    schema: { tags: ['auth'], body: loginBody, response: { 200: loginResponse } },
    config: { rateLimit: { max: app.config.loginRateMax, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const email = cleanEmail(request.body.email)
    const user = await app.repo.findUserByEmail(email)
    if (!user || !verifyPassword(request.body.password, user.passwordHash)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    const { accessToken } = await signUser(app, user)
    setAuthCookies(reply, app.config, accessToken)
    return { data: { user: presentUser(user), accessToken } }
  })

  app.post('/api/auth/logout', { schema: { tags: ['auth'], security: bearer }, preValidation: requireAuth }, async (request, reply) => {
    const expiresAt = request.authUser.exp
      ? new Date(request.authUser.exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
      : addDaysIso(7)
    await app.repo.revokeToken({ jti: request.authUser.jti, userId: request.authUser.id, expiresAt })
    clearAuthCookies(reply, app.config)
    return reply.code(204).send()
  })

  app.get('/api/auth/me', { schema: { tags: ['auth'], security: bearer, response: { 200: userResponse } }, preValidation: requireAuth }, async (request) => {
    const user = await app.repo.findUserById(request.authUser.id)
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
    return { data: presentUser(user) }
  })
}

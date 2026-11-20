import { randomBytes, randomUUID } from 'node:crypto'
import { AppError, validationError } from '../errors.js'
import { setAuthCookies } from '../lib/cookies.js'
import { hashPassword } from '../lib/password.js'
import { signUser } from '../plugins/auth.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function oauthRoutes(app) {
  const codes = new Map()
  const states = new Map()
  const callbackUrl = `${app.config.publicBaseUrl}/api/auth/oauth/callback`

  app.get('/api/auth/oauth/start', async (request, reply) => {
    const state = randomUUID()
    states.set(state, Date.now() + 10 * 60 * 1000)
    const loginHint = String(request.query.login_hint ?? 'oauth-user@example.com')
    const url = new URL('/oauth/fake/authorize', app.config.publicBaseUrl)
    url.searchParams.set('state', state)
    url.searchParams.set('redirect_uri', callbackUrl)
    url.searchParams.set('login_hint', loginHint)
    return reply.redirect(url.toString())
  })

  app.get('/oauth/fake/authorize', async (request, reply) => {
    if (request.query.redirect_uri !== callbackUrl) {
      throw new AppError(400, 'BAD_REQUEST', 'redirect_uri가 올바르지 않습니다.')
    }
    const email = String(request.query.login_hint ?? 'oauth-user@example.com').trim().toLowerCase()
    if (!EMAIL.test(email)) throw validationError({ login_hint: ['이메일 형식이 아닙니다.'] })
    const code = randomUUID()
    codes.set(code, { email, nickname: 'oauth', expiresAt: Date.now() + 10 * 60 * 1000 })
    const back = new URL(callbackUrl)
    back.searchParams.set('code', code)
    back.searchParams.set('state', String(request.query.state ?? ''))
    return reply.redirect(back.toString())
  })

  app.get('/api/auth/oauth/callback', async (request, reply) => {
    const state = String(request.query.state ?? '')
    const expiry = states.get(state)
    states.delete(state)
    if (!expiry || expiry < Date.now()) throw new AppError(400, 'BAD_REQUEST', 'OAuth state가 올바르지 않습니다.')
    const profile = codes.get(String(request.query.code ?? ''))
    codes.delete(String(request.query.code ?? ''))
    if (!profile || profile.expiresAt < Date.now()) throw new AppError(400, 'BAD_REQUEST', 'OAuth code가 올바르지 않습니다.')
    let user = await app.repo.findUserByEmail(profile.email)
    if (!user) {
      user = await app.repo.createUser({
        email: profile.email,
        nickname: profile.nickname,
        passwordHash: hashPassword(randomBytes(18).toString('base64url'))
      })
    }
    const { accessToken } = await signUser(app, user)
    setAuthCookies(reply, app.config, accessToken)
    return reply.redirect(`${app.config.publicBaseUrl}/`)
  })
}

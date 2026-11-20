import assert from 'node:assert/strict'
import test from 'node:test'
import { authHeaders, cookieHeader, createTestApp, loginAs } from './helpers.js'

test('health, validation, auth, posts, and comments follow API v1', async () => {
  const app = await createTestApp()
  const health = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-12345678' } })
  assert.equal(health.statusCode, 200)
  assert.deepEqual(health.json(), { status: 'ok' })
  assert.equal(health.headers['x-request-id'], 'req-12345678')

  const missing = await app.inject({ method: 'GET', url: '/api/missing' })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().error.code, 'NOT_FOUND')
  assert.equal(missing.json().error.requestId, missing.headers['x-request-id'])

  const html = await app.inject({ method: 'GET', url: '/missing-page', headers: { accept: 'text/html' } })
  assert.equal(html.statusCode, 404)
  assert.match(html.headers['content-type'], /text\/html/)
  assert.match(html.body, /NOT_FOUND/)

  const badJson = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    headers: { 'content-type': 'application/json' },
    payload: '{oops'
  })
  assert.equal(badJson.statusCode, 400)
  assert.equal(badJson.json().error.code, 'BAD_REQUEST')

  const anonymous = await app.inject({ method: 'POST', url: '/api/posts', payload: { title: '', body: 'x' } })
  assert.equal(anonymous.statusCode, 401)

  const badSignup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'mina', password: 'short', nickname: '' } })
  assert.equal(badSignup.statusCode, 400)
  assert.equal(badSignup.json().error.code, 'VALIDATION_ERROR')
  assert.ok(badSignup.json().error.fields.email)

  const mina = await loginAs(app)
  assert.equal(mina.signup.statusCode, 201)
  assert.equal(mina.login.statusCode, 200)
  assert.equal(mina.user.nickname, 'mina')
  assert.equal(mina.signup.body.includes('password'), false)

  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email: 'Mina@Example.com', password: 'password123', nickname: 'other' }
  })
  assert.equal(duplicate.statusCode, 409)
  assert.equal(duplicate.json().error.code, 'EMAIL_TAKEN')

  const wrong = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'mina@example.com', password: 'password124' }
  })
  assert.equal(wrong.statusCode, 401)
  assert.equal(wrong.json().error.code, 'INVALID_CREDENTIALS')

  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(mina.token) })
  assert.equal(me.statusCode, 200)
  assert.equal(me.json().data.email, 'mina@example.com')

  const created = await app.inject({
    method: 'POST',
    url: '/api/posts',
    headers: authHeaders(mina.token, { 'idempotency-key': 'post-key-001' }),
    payload: { title: '첫 글', body: '안녕하세요', tags: ['intro'] }
  })
  assert.equal(created.statusCode, 201)
  assert.equal(created.headers.location, '/api/posts/1')
  assert.equal(created.json().data.title, '첫 글')
  assert.equal(created.json().data.author.nickname, 'mina')

  const replay = await app.inject({
    method: 'POST',
    url: '/api/posts',
    headers: authHeaders(mina.token, { 'idempotency-key': 'post-key-001' }),
    payload: { title: '첫 글', body: '안녕하세요', tags: ['intro'] }
  })
  assert.equal(replay.statusCode, 201)
  assert.equal(replay.json().data.id, created.json().data.id)

  const list = await app.inject({ method: 'GET', url: '/api/posts?q=첫&page=1&limit=10&sort=-createdAt' })
  assert.equal(list.statusCode, 200)
  assert.equal(list.json().meta.total, 1)
  assert.equal(list.json().meta.q, '첫')
  assert.equal(list.json().data[0].body, undefined)
  assert.equal(list.headers['x-cache'], 'MISS')
  const cached = await app.inject({ method: 'GET', url: '/api/posts?q=첫&page=1&limit=10&sort=-createdAt' })
  assert.equal(cached.headers['x-cache'], 'HIT')

  const other = await loginAs(app, { email: 'jun@example.com', password: 'password123', nickname: 'jun' })
  const forbidden = await app.inject({
    method: 'PATCH',
    url: '/api/posts/1',
    headers: authHeaders(other.token),
    payload: { title: '가로채기' }
  })
  assert.equal(forbidden.statusCode, 403)
  assert.equal(forbidden.json().error.code, 'FORBIDDEN')

  const patched = await app.inject({
    method: 'PATCH',
    url: '/api/posts/1',
    headers: authHeaders(mina.token),
    payload: { body: '수정했습니다' }
  })
  assert.equal(patched.statusCode, 200)
  assert.equal(patched.json().data.body, '수정했습니다')

  const comment = await app.inject({
    method: 'POST',
    url: '/api/posts/1/comments',
    headers: authHeaders(other.token),
    payload: { body: '잘 읽었습니다' }
  })
  assert.equal(comment.statusCode, 201)
  const comments = await app.inject({ method: 'GET', url: '/api/posts/1/comments' })
  assert.equal(comments.json().data.length, 1)
  const detail = await app.inject({ method: 'GET', url: '/api/posts/1' })
  assert.equal(detail.json().data.commentCount, 1)

  const removed = await app.inject({
    method: 'DELETE',
    url: `/api/comments/${comment.json().data.id}`,
    headers: authHeaders(mina.token)
  })
  assert.equal(removed.statusCode, 403)
  const gone = await app.inject({
    method: 'DELETE',
    url: `/api/comments/${comment.json().data.id}`,
    headers: authHeaders(other.token)
  })
  assert.equal(gone.statusCode, 204)
  assert.equal(gone.body, '')

  const cookies = cookieHeader(mina.login)
  const cookieMe = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: cookies.cookie }
  })
  assert.equal(cookieMe.statusCode, 200)
  const noCsrf = await app.inject({
    method: 'PATCH',
    url: '/api/posts/1',
    headers: { cookie: cookies.cookie, 'content-type': 'application/json' },
    payload: { title: '쿠키만' }
  })
  assert.equal(noCsrf.statusCode, 403)
  const withCsrf = await app.inject({
    method: 'PATCH',
    url: '/api/posts/1',
    headers: { cookie: cookies.cookie, 'x-csrf-token': cookies.csrf, 'content-type': 'application/json' },
    payload: { title: '쿠키와 토큰' }
  })
  assert.equal(withCsrf.statusCode, 200)

  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: authHeaders(mina.token) })
  assert.equal(logout.statusCode, 204)
  const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: authHeaders(mina.token) })
  assert.equal(after.statusCode, 401)
  assert.equal(after.json().error.code, 'UNAUTHORIZED')

  const badId = await app.inject({ method: 'GET', url: '/api/posts/nope' })
  assert.equal(badId.statusCode, 400)
  assert.equal(badId.json().error.code, 'BAD_REQUEST')

  const basic = await createTestApp({ stage: 'basic' })
  const hidden = await basic.inject({ method: 'GET', url: '/api/ai/documents' })
  assert.equal(hidden.statusCode, 404)
  const basicList = await basic.inject({ method: 'GET', url: '/api/posts' })
  assert.equal(basicList.statusCode, 200)
  assert.equal(basicList.headers['x-cache'], undefined)
  await basic.close()
  await app.close()
})

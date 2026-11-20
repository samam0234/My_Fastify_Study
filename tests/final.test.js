import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { WebSocket } from 'ws'
import { callMcpTool } from '../src/mcp/client.js'
import { signBody } from '../src/lib/signature.js'
import { authHeaders, createTestApp, loginAs } from './helpers.js'

function multipart(content, filename = 'note.txt', type = 'text/plain') {
  const boundary = '----studyboundary'
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

test('final stage covers uploads, payments, mail, ai, oauth, sockets, and mcp', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fastify-final-'))
  const sqlitePath = path.join(dir, 'board.db')
  const app = await createTestApp({ sqlitePath, uploadDir: path.join(dir, 'uploads'), outboxDir: path.join(dir, 'outbox') })
  const mina = await loginAs(app)
  const headers = authHeaders(mina.token)

  const home = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } })
  assert.equal(home.statusCode, 200)
  assert.match(home.body, /게시판/)
  const docs = await app.inject({ method: 'GET', url: '/api-docs' })
  assert.ok(docs.statusCode === 200 || docs.statusCode === 302)

  const file = multipart('hello file')
  const uploaded = await app.inject({ method: 'POST', url: '/api/uploads', headers: { ...headers, ...file.headers }, payload: file.body })
  assert.equal(uploaded.statusCode, 201)
  const download = await app.inject({ method: 'GET', url: `/api/uploads/${uploaded.json().data.id}`, headers })
  assert.equal(download.statusCode, 200)
  assert.equal(download.body, 'hello file')

  const payment = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers,
    payload: { amount: 1200, orderName: '노트' }
  })
  assert.equal(payment.statusCode, 201)
  const raw = Buffer.from(JSON.stringify({ id: payment.json().data.id, status: 'PAID' }))
  const webhook = await app.inject({
    method: 'POST',
    url: '/api/payments/webhook',
    headers: { 'content-type': 'application/json', 'x-payment-signature': signBody('whsec-test', raw) },
    payload: raw
  })
  assert.equal(webhook.statusCode, 200)
  assert.equal(webhook.json().data.status, 'PAID')

  const mail = await app.inject({
    method: 'POST',
    url: '/api/mail',
    headers,
    payload: { to: 'mina@example.com', subject: '안녕', body: '본문' }
  })
  assert.equal(mail.statusCode, 202)
  await app.queue.waitIdle()
  const mails = await app.inject({ method: 'GET', url: '/api/mail', headers })
  assert.equal(mails.json().data[0].subject, '안녕')

  const document = await app.inject({
    method: 'POST',
    url: '/api/ai/documents',
    headers,
    payload: { filename: 'note.md', text: 'Fastify는 플러그인으로 기능을 나눈다.\n\n스키마로 요청을 검증한다.' }
  })
  assert.equal(document.statusCode, 201)
  assert.match(document.json().data.summary, /Fastify|스키마|플러그인/)
  const answer = await app.inject({
    method: 'POST',
    url: `/api/ai/documents/${document.json().data.id}/questions`,
    headers,
    payload: { question: '요청을 무엇으로 검증하나요?' }
  })
  assert.equal(answer.statusCode, 201)
  assert.match(answer.json().data.answer, /발췌 1|스키마/)
  const unknown = await app.inject({
    method: 'POST',
    url: `/api/ai/documents/${document.json().data.id}/questions`,
    headers,
    payload: { question: '오늘 날씨는 어떤가요?' }
  })
  assert.equal(unknown.json().data.answer, '문서에서 찾을 수 없습니다.')
  const stream = await app.inject({
    method: 'POST',
    url: `/api/ai/documents/${document.json().data.id}/questions/stream`,
    headers,
    payload: { question: '요청을 무엇으로 검증하나요?' }
  })
  assert.match(stream.headers['content-type'], /text\/event-stream/)
  assert.match(stream.body, /"done":true/)

  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address()
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${mina.token}`)
  const ready = await new Promise((resolve, reject) => {
    socket.once('message', (data) => resolve(JSON.parse(String(data))))
    socket.once('error', reject)
  })
  assert.equal(ready.type, 'ready')
  const livePost = await app.inject({
    method: 'POST',
    url: '/api/posts',
    headers,
    payload: { title: '실시간', body: '알림 본문' }
  })
  const liveEvent = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('소켓 알림이 오지 않았습니다.')), 3000)
    socket.once('message', (data) => {
      clearTimeout(timer)
      resolve(JSON.parse(String(data)))
    })
  })
  assert.equal(liveEvent.type, 'post.created')
  assert.equal(liveEvent.id, livePost.json().data.id)
  socket.close()

  const start = await app.inject({ method: 'GET', url: '/api/auth/oauth/start?login_hint=oauth-user@example.com' })
  const authorize = new URL(start.headers.location)
  const authorized = await app.inject({ method: 'GET', url: `${authorize.pathname}${authorize.search}` })
  const callback = new URL(authorized.headers.location)
  const done = await app.inject({ method: 'GET', url: `${callback.pathname}${callback.search}` })
  assert.equal(done.statusCode, 302)
  assert.match(done.headers['set-cookie'].join(''), /access_token=/)

  const boom = await app.inject({ method: 'GET', url: '/__test/boom' })
  assert.equal(boom.statusCode, 500)
  assert.equal(boom.json().error.code, 'INTERNAL')
  assert.equal(boom.body.includes('secret stack'), false)

  await app.close()
  const listed = await callMcpTool({ sqlitePath, name: 'list_documents' })
  const documents = JSON.parse(listed.content[0].text)
  assert.equal(documents[0].filename, 'note.md')
  const asked = await callMcpTool({
    sqlitePath,
    name: 'ask_document',
    args: { id: documents[0].id, question: '요청을 무엇으로 검증하나요?' }
  })
  assert.match(JSON.parse(asked.content[0].text).answer, /발췌 1|스키마/)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true })
      break
    } catch (error) {
      if ((error.code !== 'EBUSY' && error.code !== 'EPERM') || attempt === 9) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
})

test('login rate limit and provider summary', async () => {
  const limited = await createTestApp({ loginRateMax: 2 })
  await loginAs(limited)
  const first = await limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'mina@example.com', password: 'nope-pass' } })
  const second = await limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'mina@example.com', password: 'nope-pass' } })
  const third = await limited.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'mina@example.com', password: 'nope-pass' } })
  assert.equal(first.statusCode, 401)
  assert.equal(second.statusCode, 429)
  assert.equal(third.statusCode, 429)
  assert.equal(third.json().error.code, 'RATE_LIMITED')
  await limited.close()

  const provider = await new Promise((resolve) => {
    const server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => { body += chunk })
      request.on('end', () => {
        assert.match(body, /요약/)
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ choices: [{ message: { content: '모델이 요약한 문장 (발췌 1)' } }] }))
      })
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
  const address = provider.address()
  const aiApp = await createTestApp({ aiBaseUrl: `http://127.0.0.1:${address.port}`, aiApiKey: 'test-key', aiModel: 'mock' })
  const user = await loginAs(aiApp, { email: 'ai@example.com', password: 'password123', nickname: 'ai' })
  const created = await aiApp.inject({
    method: 'POST',
    url: '/api/ai/documents',
    headers: authHeaders(user.token),
    payload: { filename: 'ai.md', text: '본문입니다. 두번째 문장입니다.' }
  })
  assert.equal(created.json().data.summary, '모델이 요약한 문장 (발췌 1)')
  await aiApp.close()
  await new Promise((resolve) => provider.close(resolve))
})

test('driver modules can be imported', async () => {
  await import('pg')
  await import('mysql2/promise')
  await import('mongodb')
  const sample = await readFile(new URL('../examples/study11/schema.prisma', import.meta.url), 'utf8')
  assert.match(sample, /model User/)
})

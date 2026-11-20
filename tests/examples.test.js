import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildExample as buildHello } from '../examples/study1/server.js'
import { buildExample as buildPlugins, buildIsolated } from '../examples/study2/server.js'
import { buildExample as buildNotes } from '../examples/study3/server.js'
import { buildExample as buildRoutes } from '../examples/study4/server.js'
import { buildExample as buildForm } from '../examples/study5/server.js'

test('early examples answer on their own', async () => {
  const hello = buildHello()
  const page = await hello.inject({ method: 'GET', url: '/' })
  assert.equal(page.statusCode, 200)
  assert.match(page.body, /Fastify에 오신 것을 환영합니다/)
  const named = await hello.inject({ method: 'GET', url: '/api/hello/mina' })
  assert.equal(named.json().message, 'mina님, 반가워요')
  await hello.close()

  const plugins = buildPlugins()
  const message = await plugins.inject({ method: 'GET', url: '/message/mina' })
  assert.equal(message.statusCode, 200)
  assert.match(message.json().text, /mina님에게 플러그인이 응답합니다/)
  assert.ok(message.json().at)
  await plugins.close()

  const isolated = buildIsolated()
  const note = await isolated.inject({ method: 'GET', url: '/note' })
  assert.equal(note.json().shared, false)
  await isolated.close()

  const dir = await mkdtemp(path.join(tmpdir(), 'notes-'))
  const notes = buildNotes({ filePath: path.join(dir, 'notes.json') })
  const created = await notes.inject({ method: 'POST', url: '/notes', payload: { text: '첫 메모' } })
  assert.equal(created.statusCode, 201)
  const list = await notes.inject({ method: 'GET', url: '/notes' })
  assert.equal(list.json().data[0].text, '첫 메모')
  await notes.close()
  await rm(dir, { recursive: true, force: true })

  const routes = buildRoutes()
  const missing = await routes.inject({ method: 'GET', url: '/nope' })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().error.code, 'NOT_FOUND')
  const item = await routes.inject({ method: 'GET', url: '/items/1' })
  assert.equal(item.json().data.name, '공책')
  const search = await routes.inject({ method: 'GET', url: '/search?q=공책&page=2' })
  assert.equal(search.json().data.q, '공책')
  await routes.close()

  const form = buildForm()
  const bad = await form.inject({ method: 'POST', url: '/api/messages', payload: { text: '' } })
  assert.equal(bad.statusCode, 400)
  assert.equal(bad.json().error.code, 'VALIDATION_ERROR')
  const first = await form.inject({
    method: 'POST',
    url: '/api/messages',
    headers: { 'idempotency-key': 'same-key-01' },
    payload: { text: '한번만' }
  })
  const second = await form.inject({
    method: 'POST',
    url: '/api/messages',
    headers: { 'idempotency-key': 'same-key-01' },
    payload: { text: '한번만' }
  })
  assert.equal(first.statusCode, 201)
  assert.equal(second.statusCode, 201)
  assert.equal(second.json().data.text, '한번만')
  await form.close()
})

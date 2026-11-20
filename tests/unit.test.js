import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from '../src/config.js'
import { schemaStatements } from '../src/db/schema.js'
import { toNumberedPlaceholders } from '../src/db/placeholders.js'
import { deltaFromSseLine } from '../src/lib/ai-client.js'
import { answerFromExcerpts, searchChunks, splitChunks } from '../src/lib/grounding.js'
import { parseListQuery } from '../src/lib/http.js'
import { hashPassword, verifyPassword } from '../src/lib/password.js'
import { signBody, verifySignature } from '../src/lib/signature.js'

test('password, query, grounding, signature, and schema helpers', () => {
  const hash = hashPassword('password123')
  assert.equal(verifyPassword('password123', hash), true)
  assert.equal(verifyPassword('password124', hash), false)
  assert.throws(() => hashPassword('short'), /VALIDATION_ERROR|입력값/)

  const query = parseListQuery({ page: '2', limit: '80', q: '안녕', sort: '-commentCount' })
  assert.equal(query.page, 2)
  assert.equal(query.limit, 50)
  assert.equal(query.offset, 50)
  assert.throws(() => parseListQuery({ page: '0' }), /VALIDATION_ERROR|입력값/)

  const chunks = splitChunks('Fastify는 플러그인으로 기능을 나눈다.\n\n스키마로 요청을 검증한다.')
  const found = searchChunks(chunks, '요청을 무엇으로 검증하나요')
  assert.ok(found.length > 0)
  assert.match(answerFromExcerpts(found).answer, /발췌 1/)
  assert.equal(answerFromExcerpts([]).answer, '문서에서 찾을 수 없습니다.')

  assert.equal(deltaFromSseLine('data: {"choices":[{"delta":{"content":"안"}}]}'), '안')
  assert.equal(deltaFromSseLine('data: [DONE]'), null)
  assert.equal(toNumberedPlaceholders('SELECT * FROM posts WHERE id = ? AND title = ?'), 'SELECT * FROM posts WHERE id = $1 AND title = $2')
  const raw = Buffer.from('{"id":"pay"}')
  const signature = signBody('whsec-test', raw)
  assert.equal(verifySignature('whsec-test', raw, signature), true)
  assert.equal(verifySignature('whsec-test', raw, 'nope'), false)

  assert.match(schemaStatements('sqlite').join('\n'), /CREATE TABLE IF NOT EXISTS users/)
  assert.match(schemaStatements('postgres').join('\n'), /IDENTITY/)
  assert.match(schemaStatements('mariadb').join('\n'), /AUTO_INCREMENT/)
  assert.throws(() => schemaStatements('oracle'))
  assert.throws(() => resolveConfig({ skipEnvFile: true, nodeEnv: 'production', jwtSecret: '' }))
  assert.throws(() => resolveConfig({ skipEnvFile: true, stage: 'other', jwtSecret: 'test-secret-please-change' }))
})

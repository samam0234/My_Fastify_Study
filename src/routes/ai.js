import { Readable } from 'node:stream'
import path from 'node:path'
import { AppError } from '../errors.js'
import { completeChat, streamChat } from '../lib/ai-client.js'
import { answerFromExcerpts, buildMessages, extractiveSummary, searchChunks, sliceAnswer, sourcesFrom, splitChunks } from '../lib/grounding.js'
import { presentDocument, presentQuestion } from '../lib/present.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer, idParams } from '../schemas.js'

const documentBody = {
  type: 'object',
  additionalProperties: false,
  required: ['filename', 'text'],
  properties: {
    filename: { type: 'string', minLength: 1, maxLength: 200 },
    text: { type: 'string', minLength: 1, maxLength: 100000 }
  }
}

const questionBody = {
  type: 'object',
  additionalProperties: false,
  required: ['question'],
  properties: { question: { type: 'string', minLength: 1, maxLength: 500 } }
}

async function ownDocument(app, request) {
  const document = await app.repo.findDocument(request.params.id)
  if (!document) throw new AppError(404, 'NOT_FOUND', '문서를 찾을 수 없습니다.')
  if (document.ownerId !== request.authUser.id) throw new AppError(403, 'FORBIDDEN', '다른 사람의 문서는 볼 수 없습니다.')
  return document
}

async function summarize(app, filename, text) {
  const chunks = splitChunks(text)
  if (!app.config.aiBaseUrl) return extractiveSummary(text)
  return completeChat({
    baseUrl: app.config.aiBaseUrl,
    apiKey: app.config.aiApiKey,
    model: app.config.aiModel,
    messages: buildMessages({ filename, chunks, mode: 'summary' })
  })
}

async function answerQuestion(app, document, question, streaming) {
  const chunks = splitChunks(document.sourceText)
  const found = searchChunks(chunks, question, 3)
  if (found.length === 0 || !app.config.aiBaseUrl) return answerFromExcerpts(found)
  const messages = buildMessages({ filename: document.filename, chunks: found.map((item) => item.text), question, mode: 'ask' })
  const settings = { baseUrl: app.config.aiBaseUrl, apiKey: app.config.aiApiKey, model: app.config.aiModel, messages }
  const answer = streaming ? await streamChat(settings) : await completeChat(settings)
  return { answer, sources: sourcesFrom(found) }
}

export async function aiRoutes(app) {
  app.post('/api/ai/documents', {
    schema: { tags: ['ai'], security: bearer, body: documentBody },
    preValidation: requireAuth
  }, async (request, reply) => {
    const filename = path.basename(request.body.filename)
    const summary = await summarize(app, filename, request.body.text)
    const document = await app.repo.createDocument({
      ownerId: request.authUser.id,
      filename,
      sourceText: request.body.text,
      summary
    })
    return reply.code(201).send({ data: presentDocument(document, true) })
  })

  app.get('/api/ai/documents', { schema: { tags: ['ai'], security: bearer }, preValidation: requireAuth }, async (request) => {
    const rows = await app.repo.listDocuments(request.authUser.id)
    return { data: rows.map((row) => presentDocument(row, false)) }
  })

  app.get('/api/ai/documents/:id', {
    schema: { tags: ['ai'], security: bearer, params: idParams },
    preValidation: requireAuth
  }, async (request) => {
    const document = await ownDocument(app, request)
    return { data: presentDocument(document, true) }
  })

  app.post('/api/ai/documents/:id/questions', {
    schema: { tags: ['ai'], security: bearer, params: idParams, body: questionBody },
    preValidation: requireAuth
  }, async (request, reply) => {
    const document = await ownDocument(app, request)
    const result = await answerQuestion(app, document, request.body.question, false)
    const saved = await app.repo.addQuestion({
      documentId: document.id,
      ownerId: request.authUser.id,
      question: request.body.question,
      answer: result.answer,
      sources: result.sources
    })
    return reply.code(201).send({ data: presentQuestion(saved) })
  })

  app.get('/api/ai/documents/:id/questions', {
    schema: { tags: ['ai'], security: bearer, params: idParams },
    preValidation: requireAuth
  }, async (request) => {
    const document = await ownDocument(app, request)
    const rows = await app.repo.listQuestions(document.id)
    return { data: rows.map((row) => presentQuestion(row)) }
  })

  app.post('/api/ai/documents/:id/questions/stream', {
    schema: { tags: ['ai'], security: bearer, params: idParams, body: questionBody },
    preValidation: requireAuth
  }, async (request, reply) => {
    const document = await ownDocument(app, request)
    const result = await answerQuestion(app, document, request.body.question, true)
    await app.repo.addQuestion({
      documentId: document.id,
      ownerId: request.authUser.id,
      question: request.body.question,
      answer: result.answer,
      sources: result.sources
    })
    const parts = [
      ...sliceAnswer(result.answer).map((delta) => `data: ${JSON.stringify({ delta })}\n\n`),
      `data: ${JSON.stringify({ done: true, sources: result.sources })}\n\n`
    ]
    reply.header('content-type', 'text/event-stream; charset=utf-8')
    reply.header('cache-control', 'no-cache')
    return reply.send(Readable.from(parts))
  })
}

import { answerFromExcerpts, searchChunks, splitChunks } from '../lib/grounding.js'

const tools = [
  {
    name: 'list_documents',
    description: 'SQLite에 저장된 문서의 id와 제목을 나열한다. 이 프로세스를 실행한 사람만 쓴다.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'ask_document',
    description: '문서 발췌만 근거로 질문에 답한다. 근거가 없으면 찾을 수 없다고 말한다.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'question'],
      properties: {
        id: { type: 'number' },
        question: { type: 'string' }
      }
    }
  }
]

function result(id, value) {
  return { jsonrpc: '2.0', id, result: value }
}

function toolText(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {})
  }
}

export async function handleMcp(message, repo) {
  if (!message || message.id === undefined) return null
  if (message.method === 'initialize') {
    return result(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'fastify-study', version: '1.0.0' }
    })
  }
  if (message.method === 'tools/list') return result(message.id, { tools })
  if (message.method === 'tools/call') {
    const name = message.params?.name
    const args = message.params?.arguments ?? {}
    if (name === 'list_documents') {
      return result(message.id, toolText(await repo.listEveryDocument()))
    }
    if (name === 'ask_document') {
      const id = Number(args.id)
      const question = String(args.question ?? '')
      if (!id || !question.trim()) {
        return result(message.id, toolText({ message: 'id와 question이 필요합니다.' }, true))
      }
      const document = await repo.findDocument(id)
      if (!document) return result(message.id, toolText({ message: '문서를 찾을 수 없습니다.' }, true))
      const found = searchChunks(splitChunks(document.sourceText), question, 3)
      return result(message.id, toolText({ filename: document.filename, ...answerFromExcerpts(found) }))
    }
    return result(message.id, toolText({ message: '없는 도구입니다.' }, true))
  }
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: '없는 메서드입니다.' } }
}

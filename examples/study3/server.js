import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

const defaultFile = new URL('./data/notes.json', import.meta.url)

export function buildExample(options = {}) {
  const filePath = options.filePath ?? defaultFile
  const app = Fastify({ logger: options.logger ?? false })

  async function load() {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      return []
    }
  }

  async function save(notes) {
    const directory = typeof filePath === 'string' ? path.dirname(filePath) : new URL('./', filePath)
    await mkdir(directory, { recursive: true })
    await writeFile(filePath, JSON.stringify(notes, null, 2))
  }

  app.get('/', async (request, reply) => {
    const html = `<!doctype html><meta charset="utf-8"><title>메모</title>
<main><label>임시 제목<input id="draft"></label><p id="saved"></p></main>
<script>
const key = 'fastify-note-draft'
const input = document.querySelector('#draft')
input.value = localStorage.getItem(key) ?? ''
input.addEventListener('input', () => localStorage.setItem(key, input.value))
document.querySelector('#saved').textContent = '이 입력은 브라우저 localStorage에 남습니다. 서버 메모는 /notes 입니다.'
</script>`
    return reply.type('text/html; charset=utf-8').send(html)
  })

  app.get('/notes', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['data'],
          properties: { data: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } }
        }
      }
    }
  }, async () => ({ data: await load() }))

  app.post('/notes', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: 200 } }
      }
    }
  }, async (request, reply) => {
    const notes = await load()
    notes.push({ text: request.body.text })
    await save(notes)
    return reply.code(201).send({ data: notes.at(-1) })
  })

  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3002), host: '127.0.0.1' })
}

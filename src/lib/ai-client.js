import { AppError } from '../errors.js'

export function deltaFromSseLine(line) {
  const trimmed = String(line).trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const json = JSON.parse(data)
    return json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

async function postChat({ baseUrl, apiKey, model, messages, stream }) {
  let response
  try {
    response = await fetch(new URL('/v1/chat/completions', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: stream ? 'text/event-stream' : 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages, stream }),
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new AppError(502, 'UPSTREAM', 'AI 서버에 연결하지 못했습니다.')
  }
  if (!response.ok) throw new AppError(502, 'UPSTREAM', 'AI 서버가 응답하지 않았습니다.')
  return response
}

export async function completeChat({ baseUrl, apiKey, model, messages }) {
  const response = await postChat({ baseUrl, apiKey, model, messages, stream: false })
  const json = await response.json()
  const text = json.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError(502, 'UPSTREAM', 'AI 서버가 빈 응답을 보냈습니다.')
  }
  return text.trim()
}

export async function streamChat({ baseUrl, apiKey, model, messages, onDelta }) {
  const response = await postChat({ baseUrl, apiKey, model, messages, stream: true })
  if (!response.body) throw new AppError(502, 'UPSTREAM', 'AI 서버가 빈 응답을 보냈습니다.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const delta = deltaFromSseLine(line)
      if (!delta) continue
      full += delta
      if (onDelta) await onDelta(delta)
    }
  }
  const tail = deltaFromSseLine(buffer)
  if (tail) {
    full += tail
    if (onDelta) await onDelta(tail)
  }
  if (!full.trim()) throw new AppError(502, 'UPSTREAM', 'AI 서버가 빈 응답을 보냈습니다.')
  return full.trim()
}

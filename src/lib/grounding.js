export function splitChunks(text, size = 400) {
  const blocks = String(text).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  const chunks = []
  let current = ''
  for (const block of blocks.length ? blocks : [String(text).trim()]) {
    if (!block) continue
    if ((current + '\n' + block).trim().length > size && current) {
      chunks.push(current.trim())
      current = block
    } else {
      current = current ? `${current}\n${block}` : block
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function tokensOf(text) {
  const hangul = String(text).match(/[가-힣]/g) ?? []
  const words = String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []
  const bigrams = []
  for (let index = 0; index < hangul.length - 1; index += 1) bigrams.push(hangul[index] + hangul[index + 1])
  return [...bigrams, ...words]
}

export function searchChunks(chunks, query, topK = 3) {
  const docs = chunks.map((chunk) => tokensOf(chunk))
  const queryTokens = tokensOf(query)
  const df = new Map()
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const ranked = docs.map((doc, index) => {
    const tf = new Map()
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1)
    let score = 0
    for (const term of queryTokens) {
      const frequency = tf.get(term) ?? 0
      if (!frequency || doc.length === 0) continue
      const idf = Math.log((docs.length + 1) / ((df.get(term) ?? 0) + 1)) + 1
      score += (frequency / doc.length) * idf
    }
    return { index, score, text: chunks[index] }
  })
  return ranked.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, topK)
}

export function extractiveSummary(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentences = clean.split(/(?<=[.!?。])\s+/).filter(Boolean)
  return sentences.slice(0, 3).join(' ') || clean.slice(0, 300)
}

export function sourcesFrom(found) {
  return found.map((item, index) => ({
    excerpt: index + 1,
    text: item.text,
    score: Number(item.score.toFixed(4))
  }))
}

export function answerFromExcerpts(found) {
  if (found.length === 0) {
    return { answer: '문서에서 찾을 수 없습니다.', sources: [] }
  }
  return {
    answer: `${found[0].text} (발췌 1)`,
    sources: sourcesFrom(found)
  }
}

export function sliceAnswer(answer, size = 12) {
  const text = String(answer)
  if (!text) return ['']
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts
}

export function buildMessages({ filename, chunks, question, mode }) {
  const system = [
    '너는 제공된 발췌만 근거로 한국어로 답하는 도우미다.',
    '발췌에 없는 내용은 추측하지 말고 "문서에서 찾을 수 없습니다."라고만 답한다.',
    '답할 수 있으면 문장 끝에 (발췌 1)처럼 번호를 붙인다.'
  ].join(' ')
  const packed = chunks.map((chunk, index) => `[발췌 ${index + 1}] ${chunk}`).join('\n')
  const user = mode === 'summary'
    ? `문서 ${filename}을 3문장 안으로 요약해 줘.\n\n${packed}`
    : `${packed}\n\n질문: ${question}`
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

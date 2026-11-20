export function encodeMessage(message) {
  const json = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, 'utf8')
  return Buffer.concat([header, json])
}

export function createMessageReader(stream) {
  let buffer = Buffer.alloc(0)
  const queue = []
  let waiting = null
  let ended = false

  function push(message) {
    if (waiting) {
      const current = waiting
      waiting = null
      current.resolve(message)
      return
    }
    queue.push(message)
  }

  function parse() {
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = buffer.subarray(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) return
      const length = Number(match[1])
      const start = headerEnd + 4
      if (buffer.length < start + length) return
      const message = JSON.parse(buffer.subarray(start, start + length).toString('utf8'))
      buffer = buffer.subarray(start + length)
      push(message)
    }
  }

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    parse()
  })
  stream.on('end', () => {
    ended = true
    if (waiting && queue.length === 0) waiting.reject(new Error('MCP 입력이 끝났습니다.'))
  })

  return {
    next() {
      if (queue.length > 0) return Promise.resolve(queue.shift())
      if (ended) return Promise.reject(new Error('MCP 입력이 끝났습니다.'))
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject }
      })
    }
  }
}

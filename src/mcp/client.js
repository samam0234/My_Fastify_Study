import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createMessageReader, encodeMessage } from './protocol.js'

const serverPath = fileURLToPath(new URL('./server.js', import.meta.url))

export async function callMcpTool({ sqlitePath, name, args = {}, timeoutMs = 8000 }) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SystemRoot,
      SQLITE_PATH: sqlitePath
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const reader = createMessageReader(child.stdout)
  const send = (message) => child.stdin.write(encodeMessage(message))
  const next = () => Promise.race([
    reader.next(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`MCP 응답 시간이 초과되었습니다. ${stderr}`)), timeoutMs)
    })
  ])
  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fastify-study', version: '1.0.0' } } })
    await next()
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })
    const response = await next()
    return response.result
  } finally {
    child.stdin.end()
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        child.kill()
        resolve()
      }, 2000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

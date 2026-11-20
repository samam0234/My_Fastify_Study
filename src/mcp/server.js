import { openSqlite } from '../db/open.js'
import { handleMcp } from './handle.js'
import { createMessageReader, encodeMessage } from './protocol.js'

if (!process.env.SQLITE_PATH) {
  console.error('SQLITE_PATH가 필요합니다.')
  process.exit(1)
}

const opened = await openSqlite(process.env.SQLITE_PATH)
const reader = createMessageReader(process.stdin)
for (;;) {
  let message
  try {
    message = await reader.next()
  } catch {
    break
  }
  const response = await handleMcp(message, opened.repo)
  if (response) process.stdout.write(encodeMessage(response))
}
await opened.close()

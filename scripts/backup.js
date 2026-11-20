import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveConfig } from '../src/config.js'

const config = resolveConfig()
if (config.dbClient !== 'sqlite' || config.sqlitePath === ':memory:') {
  console.error('파일로 저장한 SQLite만 이 스크립트로 복사할 수 있습니다.')
  process.exit(1)
}
const stamp = new Date().toISOString().slice(0, 10)
const destDir = path.resolve('data/backups')
await mkdir(destDir, { recursive: true })
const dest = path.join(destDir, `board-${stamp}.db`)
await copyFile(path.resolve(config.sqlitePath), dest)
console.log(dest)

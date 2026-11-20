import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppError } from '../errors.js'

export async function saveUpload(dir, originalName, buffer) {
  await mkdir(dir, { recursive: true })
  const safe = path.basename(String(originalName ?? '')).replace(/[^\w.\-가-힣 ]/g, '_') || 'file'
  const extension = path.extname(safe).slice(0, 10)
  const storedName = `${randomUUID()}${extension}`
  const full = resolveStored(dir, storedName)
  if (!full) throw new AppError(400, 'BAD_REQUEST', '파일 이름이 올바르지 않습니다.')
  await writeFile(full, buffer)
  return { storedName, originalName: safe, full }
}

export function resolveStored(dir, storedName) {
  if (!/^[\w.-]+$/.test(String(storedName ?? ''))) return null
  const root = path.resolve(dir)
  const full = path.resolve(dir, storedName)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

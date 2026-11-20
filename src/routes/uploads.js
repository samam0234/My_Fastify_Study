import { createReadStream } from 'node:fs'
import { AppError } from '../errors.js'
import { resolveStored, saveUpload } from '../lib/files.js'
import { presentUpload } from '../lib/present.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer, idParams } from '../schemas.js'

const ALLOWED = new Set(['text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'application/pdf'])

export async function uploadRoutes(app) {
  app.post('/api/uploads', { schema: { tags: ['uploads'], security: bearer }, preValidation: requireAuth }, async (request, reply) => {
    const file = await request.file()
    if (!file) throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { file: ['파일을 선택하세요.'] })
    if (!ALLOWED.has(file.mimetype)) {
      throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { file: ['txt, md, png, jpg, pdf만 올릴 수 있습니다.'] })
    }
    let buffer
    try {
      buffer = await file.toBuffer()
    } catch (error) {
      if (error.statusCode === 413 || error.code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', '요청 크기가 한도를 넘었습니다.')
      }
      throw error
    }
    if (!buffer.length) {
      throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', { file: ['빈 파일은 올릴 수 없습니다.'] })
    }
    const saved = await saveUpload(app.config.uploadDir, file.filename, buffer)
    const upload = await app.repo.createUpload({
      ownerId: request.authUser.id,
      originalName: saved.originalName,
      storedName: saved.storedName,
      mime: file.mimetype,
      sizeBytes: buffer.length
    })
    return reply.code(201).send({ data: presentUpload(upload) })
  })

  app.get('/api/uploads/:id', { schema: { tags: ['uploads'], security: bearer, params: idParams }, preValidation: requireAuth }, async (request, reply) => {
    const upload = await app.repo.findUpload(request.params.id)
    if (!upload) throw new AppError(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.')
    if (upload.ownerId !== request.authUser.id) throw new AppError(403, 'FORBIDDEN', '다른 사람의 파일은 받을 수 없습니다.')
    const full = resolveStored(app.config.uploadDir, upload.storedName)
    if (!full) throw new AppError(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.')
    const encoded = encodeURIComponent(upload.originalName)
    return reply
      .type(upload.mime)
      .header('content-disposition', `attachment; filename*=UTF-8''${encoded}`)
      .send(createReadStream(full))
  })
}

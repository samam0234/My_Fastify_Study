import { AppError } from '../errors.js'
import { likeContains } from '../lib/http.js'
import { nowIso } from '../lib/time.js'
import { isUniqueViolation } from './placeholders.js'
import { toComment, toPost, toUser, parseJson } from './shape.js'

const FILTER = "(? IS NULL OR LOWER(p.title) LIKE ? ESCAPE '!' OR LOWER(p.body) LIKE ? ESCAPE '!')"
const POST_SELECT = `
SELECT p.id, p.author_id, p.title, p.body, p.tags, p.created_at, p.updated_at,
       u.nickname AS author_nickname,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.author_id
`
const ORDER = {
  createdAt: 'p.created_at ASC, p.id ASC',
  '-createdAt': 'p.created_at DESC, p.id DESC',
  '-commentCount': 'comment_count DESC, p.created_at DESC, p.id DESC'
}

function searchParams(q) {
  if (!q) return [null, null, null]
  const like = likeContains(q)
  return [q, like, like]
}

async function emailTaken(error) {
  if (isUniqueViolation(error)) {
    throw new AppError(409, 'EMAIL_TAKEN', '이미 가입한 이메일입니다.')
  }
  throw error
}

export function createSqlRepository(adapter) {
  return {
    async ping() {
      await adapter.get('SELECT 1 AS ok')
    },
    async createUser({ email, passwordHash, nickname }) {
      const createdAt = nowIso()
      try {
        const id = await adapter.insert(
          'INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?, ?, ?, ?)',
          [email, passwordHash, nickname, createdAt]
        )
        return { id: Number(id), email, nickname, createdAt }
      } catch (error) {
        return emailTaken(error)
      }
    },
    async findUserByEmail(email) {
      return toUser(await adapter.get('SELECT * FROM users WHERE email = ?', [email]))
    },
    async findUserById(id) {
      return toUser(await adapter.get('SELECT * FROM users WHERE id = ?', [id]))
    },
    async revokeToken({ jti, userId, expiresAt }) {
      try {
        await adapter.run(
          'INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)',
          [jti, userId, expiresAt]
        )
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
    },
    async isTokenRevoked(jti) {
      const row = await adapter.get('SELECT jti FROM revoked_tokens WHERE jti = ?', [jti])
      return Boolean(row)
    },
    async createPost({ authorId, title, body, tags }) {
      const createdAt = nowIso()
      const id = await adapter.insert(
        'INSERT INTO posts (author_id, title, body, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [authorId, title, body, JSON.stringify(tags ?? []), createdAt, createdAt]
      )
      return this.findPostById(id)
    },
    async updatePost(id, { title, body, tags }) {
      const changes = await adapter.run(
        'UPDATE posts SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?',
        [title, body, JSON.stringify(tags ?? []), nowIso(), id]
      )
      if (!changes) return null
      return this.findPostById(id)
    },
    async deletePost(id) {
      const changes = await adapter.run('DELETE FROM posts WHERE id = ?', [id])
      return changes > 0
    },
    async findPostById(id) {
      return toPost(await adapter.get(`${POST_SELECT} WHERE p.id = ?`, [id]))
    },
    async listPosts({ q, sort, limit, offset }) {
      const params = searchParams(q)
      const totalRow = await adapter.get(`SELECT COUNT(*) AS total FROM posts p WHERE ${FILTER}`, params)
      const rows = await adapter.all(
        `${POST_SELECT} WHERE ${FILTER} ORDER BY ${ORDER[sort]} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )
      return { items: rows.map((row) => toPost(row)), total: Number(totalRow.total) }
    },
    async createComment({ postId, authorId, body }) {
      const id = await adapter.insert(
        'INSERT INTO comments (post_id, author_id, body, created_at) VALUES (?, ?, ?, ?)',
        [postId, authorId, body, nowIso()]
      )
      return this.findCommentById(id)
    },
    async listComments(postId) {
      const rows = await adapter.all(
        `SELECT c.id, c.post_id, c.body, c.created_at, c.author_id, u.nickname AS author_nickname
         FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC`,
        [postId]
      )
      return rows.map((row) => toComment(row))
    },
    async findCommentById(id) {
      return toComment(await adapter.get(
        `SELECT c.id, c.post_id, c.body, c.created_at, c.author_id, u.nickname AS author_nickname
         FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
        [id]
      ))
    },
    async deleteComment(id) {
      const changes = await adapter.run('DELETE FROM comments WHERE id = ?', [id])
      return changes > 0
    },
    async findIdempotency(lookupKey) {
      const row = await adapter.get(
        'SELECT status_code, response_json, location FROM idempotency_keys WHERE lookup_key = ?',
        [lookupKey]
      )
      if (!row) return null
      return {
        statusCode: Number(row.status_code),
        responseJson: row.response_json,
        location: row.location
      }
    },
    async saveIdempotency({ lookupKey, statusCode, responseJson, location }) {
      await adapter.run(
        'INSERT INTO idempotency_keys (lookup_key, status_code, response_json, location, created_at) VALUES (?, ?, ?, ?, ?)',
        [lookupKey, statusCode, responseJson, location, nowIso()]
      )
    },
    async createUpload({ ownerId, originalName, storedName, mime, sizeBytes }) {
      const createdAt = nowIso()
      const id = await adapter.insert(
        'INSERT INTO uploads (owner_id, original_name, stored_name, mime, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [ownerId, originalName, storedName, mime, sizeBytes, createdAt]
      )
      return { id: Number(id), ownerId, originalName, storedName, mime, sizeBytes, createdAt }
    },
    async findUpload(id) {
      const row = await adapter.get('SELECT * FROM uploads WHERE id = ?', [id])
      if (!row) return null
      return {
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        originalName: row.original_name,
        storedName: row.stored_name,
        mime: row.mime,
        sizeBytes: Number(row.size_bytes),
        createdAt: row.created_at
      }
    },
    async createPayment({ id, ownerId, amount, orderName, status }) {
      const createdAt = nowIso()
      await adapter.run(
        'INSERT INTO payments (id, owner_id, amount, order_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, ownerId, amount, orderName, status, createdAt]
      )
      return { id, ownerId, amount, orderName, status, createdAt }
    },
    async findPayment(id) {
      const row = await adapter.get('SELECT * FROM payments WHERE id = ?', [id])
      if (!row) return null
      return {
        id: row.id,
        ownerId: Number(row.owner_id),
        amount: Number(row.amount),
        orderName: row.order_name,
        status: row.status,
        createdAt: row.created_at
      }
    },
    async updatePaymentStatus(id, status) {
      await adapter.run('UPDATE payments SET status = ? WHERE id = ?', [status, id])
      return this.findPayment(id)
    },
    async createDocument({ ownerId, filename, sourceText, summary }) {
      const createdAt = nowIso()
      const id = await adapter.insert(
        'INSERT INTO documents (owner_id, filename, source_text, summary, created_at) VALUES (?, ?, ?, ?, ?)',
        [ownerId, filename, sourceText, summary, createdAt]
      )
      return { id: Number(id), ownerId, filename, sourceText, summary, createdAt }
    },
    async listEveryDocument() {
      const rows = await adapter.all(
        'SELECT id, owner_id, filename, summary, created_at FROM documents ORDER BY id ASC'
      )
      return rows.map((row) => ({
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        filename: row.filename,
        summary: row.summary,
        createdAt: row.created_at
      }))
    },
    async listDocuments(ownerId) {
      const rows = await adapter.all(
        'SELECT id, owner_id, filename, summary, created_at FROM documents WHERE owner_id = ? ORDER BY id DESC',
        [ownerId]
      )
      return rows.map((row) => ({
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        filename: row.filename,
        summary: row.summary,
        createdAt: row.created_at
      }))
    },
    async findDocument(id) {
      const row = await adapter.get('SELECT * FROM documents WHERE id = ?', [id])
      if (!row) return null
      return {
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        filename: row.filename,
        sourceText: row.source_text,
        summary: row.summary,
        createdAt: row.created_at
      }
    },
    async addQuestion({ documentId, ownerId, question, answer, sources }) {
      const createdAt = nowIso()
      const id = await adapter.insert(
        'INSERT INTO questions (document_id, owner_id, question, answer, sources, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [documentId, ownerId, question, answer, JSON.stringify(sources), createdAt]
      )
      return { id: Number(id), documentId, ownerId, question, answer, sources, createdAt }
    },
    async listQuestions(documentId) {
      const rows = await adapter.all(
        'SELECT * FROM questions WHERE document_id = ? ORDER BY id ASC',
        [documentId]
      )
      return rows.map((row) => ({
        id: Number(row.id),
        documentId: Number(row.document_id),
        ownerId: Number(row.owner_id),
        question: row.question,
        answer: row.answer,
        sources: parseJson(row.sources, []),
        createdAt: row.created_at
      }))
    },
    async createMail({ ownerId, toEmail, subject, body }) {
      const createdAt = nowIso()
      const id = await adapter.insert(
        'INSERT INTO mails (owner_id, to_email, subject, body, created_at) VALUES (?, ?, ?, ?, ?)',
        [ownerId, toEmail, subject, body, createdAt]
      )
      return { id: Number(id), ownerId, toEmail, subject, body, createdAt }
    },
    async listMails(ownerId) {
      const rows = await adapter.all(
        'SELECT * FROM mails WHERE owner_id = ? ORDER BY id DESC',
        [ownerId]
      )
      return rows.map((row) => ({
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        toEmail: row.to_email,
        subject: row.subject,
        body: row.body,
        createdAt: row.created_at
      }))
    }
  }
}

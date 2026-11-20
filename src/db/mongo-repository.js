import { AppError } from '../errors.js'
import { nowIso } from '../lib/time.js'

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createMongoRepository(db) {
  const users = db.collection('users')
  const revoked = db.collection('revoked_tokens')
  const posts = db.collection('posts')
  const comments = db.collection('comments')
  const idempotency = db.collection('idempotency_keys')
  const uploads = db.collection('uploads')
  const payments = db.collection('payments')
  const documents = db.collection('documents')
  const questions = db.collection('questions')
  const mails = db.collection('mails')
  const counters = db.collection('counters')

  async function nextId(name) {
    const doc = await counters.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
    return Number(doc.seq ?? doc.value?.seq)
  }

  async function authorOf(post) {
    const user = await users.findOne({ id: post.authorId })
    const commentCount = await comments.countDocuments({ postId: post.id })
    return {
      id: post.id,
      title: post.title,
      body: post.body,
      tags: post.tags ?? [],
      author: { id: post.authorId, nickname: user?.nickname ?? '' },
      commentCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    }
  }

  return {
    async ensureIndexes() {
      await users.createIndex({ email: 1 }, { unique: true })
      await users.createIndex({ id: 1 }, { unique: true })
      await posts.createIndex({ id: 1 }, { unique: true })
      await comments.createIndex({ id: 1 }, { unique: true })
      await comments.createIndex({ postId: 1 })
      await documents.createIndex({ id: 1 }, { unique: true })
    },
    async ping() {
      await db.command({ ping: 1 })
    },
    async createUser({ email, passwordHash, nickname }) {
      const existing = await users.findOne({ email })
      if (existing) throw new AppError(409, 'EMAIL_TAKEN', '이미 가입한 이메일입니다.')
      const createdAt = nowIso()
      const id = await nextId('users')
      try {
        await users.insertOne({ id, email, passwordHash, nickname, createdAt })
      } catch (error) {
        if (error?.code === 11000) throw new AppError(409, 'EMAIL_TAKEN', '이미 가입한 이메일입니다.')
        throw error
      }
      return { id, email, nickname, createdAt }
    },
    async findUserByEmail(email) {
      const row = await users.findOne({ email })
      if (!row) return null
      return { id: row.id, email: row.email, nickname: row.nickname, passwordHash: row.passwordHash, createdAt: row.createdAt }
    },
    async findUserById(id) {
      const row = await users.findOne({ id: Number(id) })
      if (!row) return null
      return { id: row.id, email: row.email, nickname: row.nickname, passwordHash: row.passwordHash, createdAt: row.createdAt }
    },
    async revokeToken({ jti, userId, expiresAt }) {
      await revoked.updateOne({ _id: jti }, { $setOnInsert: { userId, expiresAt } }, { upsert: true })
    },
    async isTokenRevoked(jti) {
      return Boolean(await revoked.findOne({ _id: jti }))
    },
    async createPost({ authorId, title, body, tags }) {
      const createdAt = nowIso()
      const id = await nextId('posts')
      await posts.insertOne({ id, authorId, title, body, tags: tags ?? [], createdAt, updatedAt: createdAt })
      return this.findPostById(id)
    },
    async updatePost(id, { title, body, tags }) {
      const updated = await posts.findOneAndUpdate(
        { id: Number(id) },
        { $set: { title, body, tags: tags ?? [], updatedAt: nowIso() } },
        { returnDocument: 'after' }
      )
      const doc = updated?.id ? updated : updated?.value
      if (!doc) return null
      return authorOf(doc)
    },
    async deletePost(id) {
      const result = await posts.deleteOne({ id: Number(id) })
      await comments.deleteMany({ postId: Number(id) })
      return result.deletedCount > 0
    },
    async findPostById(id) {
      const post = await posts.findOne({ id: Number(id) })
      if (!post) return null
      return authorOf(post)
    },
    async listPosts({ q, sort, limit, offset }) {
      const filter = q
        ? { $or: [{ title: new RegExp(escapeRegex(q), 'i') }, { body: new RegExp(escapeRegex(q), 'i') }] }
        : {}
      const all = await posts.find(filter).toArray()
      const items = []
      for (const post of all) items.push(await authorOf(post))
      const direction = sort === 'createdAt' ? 1 : -1
      items.sort((a, b) => {
        if (sort === '-commentCount' && a.commentCount !== b.commentCount) return b.commentCount - a.commentCount
        if (sort !== '-commentCount' && a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -direction : direction
        return a.id < b.id ? -direction : direction
      })
      return { items: items.slice(offset, offset + limit), total: items.length }
    },
    async createComment({ postId, authorId, body }) {
      const id = await nextId('comments')
      const createdAt = nowIso()
      await comments.insertOne({ id, postId, authorId, body, createdAt })
      return this.findCommentById(id)
    },
    async listComments(postId) {
      const rows = await comments.find({ postId: Number(postId) }).sort({ createdAt: 1, id: 1 }).toArray()
      const result = []
      for (const row of rows) {
        const user = await users.findOne({ id: row.authorId })
        result.push({
          id: row.id,
          postId: row.postId,
          body: row.body,
          author: { id: row.authorId, nickname: user?.nickname ?? '' },
          createdAt: row.createdAt
        })
      }
      return result
    },
    async findCommentById(id) {
      const row = await comments.findOne({ id: Number(id) })
      if (!row) return null
      const user = await users.findOne({ id: row.authorId })
      return {
        id: row.id,
        postId: row.postId,
        body: row.body,
        author: { id: row.authorId, nickname: user?.nickname ?? '' },
        createdAt: row.createdAt
      }
    },
    async deleteComment(id) {
      const result = await comments.deleteOne({ id: Number(id) })
      return result.deletedCount > 0
    },
    async findIdempotency(lookupKey) {
      const row = await idempotency.findOne({ _id: lookupKey })
      if (!row) return null
      return { statusCode: row.statusCode, responseJson: row.responseJson, location: row.location ?? null }
    },
    async saveIdempotency({ lookupKey, statusCode, responseJson, location }) {
      await idempotency.insertOne({ _id: lookupKey, statusCode, responseJson, location, createdAt: nowIso() })
    },
    async createUpload({ ownerId, originalName, storedName, mime, sizeBytes }) {
      const id = await nextId('uploads')
      const createdAt = nowIso()
      await uploads.insertOne({ id, ownerId, originalName, storedName, mime, sizeBytes, createdAt })
      return { id, ownerId, originalName, storedName, mime, sizeBytes, createdAt }
    },
    async findUpload(id) {
      return uploads.findOne({ id: Number(id) }, { projection: { _id: 0 } })
    },
    async createPayment({ id, ownerId, amount, orderName, status }) {
      const createdAt = nowIso()
      await payments.insertOne({ _id: id, id, ownerId, amount, orderName, status, createdAt })
      return { id, ownerId, amount, orderName, status, createdAt }
    },
    async findPayment(id) {
      const row = await payments.findOne({ id })
      if (!row) return null
      return { id: row.id, ownerId: row.ownerId, amount: row.amount, orderName: row.orderName, status: row.status, createdAt: row.createdAt }
    },
    async updatePaymentStatus(id, status) {
      await payments.updateOne({ id }, { $set: { status } })
      return this.findPayment(id)
    },
    async createDocument({ ownerId, filename, sourceText, summary }) {
      const id = await nextId('documents')
      const createdAt = nowIso()
      await documents.insertOne({ id, ownerId, filename, sourceText, summary, createdAt })
      return { id, ownerId, filename, sourceText, summary, createdAt }
    },
    async listEveryDocument() {
      return documents.find({}, { projection: { sourceText: 0, _id: 0 } }).sort({ id: 1 }).toArray()
    },
    async listDocuments(ownerId) {
      const rows = await documents.find({ ownerId }, { projection: { sourceText: 0, _id: 0 } }).sort({ id: -1 }).toArray()
      return rows
    },
    async findDocument(id) {
      const row = await documents.findOne({ id: Number(id) }, { projection: { _id: 0 } })
      return row ?? null
    },
    async addQuestion({ documentId, ownerId, question, answer, sources }) {
      const id = await nextId('questions')
      const createdAt = nowIso()
      await questions.insertOne({ id, documentId, ownerId, question, answer, sources, createdAt })
      return { id, documentId, ownerId, question, answer, sources, createdAt }
    },
    async listQuestions(documentId) {
      return questions.find({ documentId: Number(documentId) }, { projection: { _id: 0 } }).sort({ id: 1 }).toArray()
    },
    async createMail({ ownerId, toEmail, subject, body }) {
      const id = await nextId('mails')
      const createdAt = nowIso()
      await mails.insertOne({ id, ownerId, toEmail, subject, body, createdAt })
      return { id, ownerId, toEmail, subject, body, createdAt }
    },
    async listMails(ownerId) {
      return mails.find({ ownerId }, { projection: { _id: 0 } }).sort({ id: -1 }).toArray()
    }
  }
}
